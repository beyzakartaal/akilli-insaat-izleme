import os
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import cv2
import numpy as np
import json
import base64
from collections import deque

# Try to import YOLO - if fails, provide guidance
try:
    from ultralytics import YOLO
    model = None
except ImportError:
    print("ERROR: ultralytics not properly installed. Run: pip install ultralytics")
    class DummyYOLO:
        def __init__(self, *args, **kwargs): pass
        def __call__(self, *args, **kwargs):
            class DummyResults:
                def __init__(self):
                    self.boxes = type('obj', (object,), {'data': []})
                    self.names = {}
            return [DummyResults()]
    model = None

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class BoxSmoother:
    def __init__(self, history_length=5):
        self.history = {}  # Her nesne için koordinat geçmişi
        self.history_length = history_length
    
    def update(self, box_id, coords):
        if box_id not in self.history:
            self.history[box_id] = deque(maxlen=self.history_length)
        self.history[box_id].append(coords)
        
    def get_smoothed_coords(self, box_id):
        if box_id not in self.history:
            return None
        return np.mean(self.history[box_id], axis=0)
    
    def clean_old_entries(self, current_ids):
        # Artık görünmeyen nesnelerin geçmişini temizle
        self.history = {k: v for k, v in self.history.items() if k in current_ids}

# Global smoother instance
box_smoother = BoxSmoother()

# Load YOLO model when needed
def get_model():
    global model
    if model is None:
        try:
            # Model dosyasının var olup olmadığını kontrol et
            model_path = os.path.join(os.path.dirname(__file__), "models", "best.pt")
            if not os.path.exists(model_path):
                raise FileNotFoundError(f"Model dosyası bulunamadı: {model_path}")
            
            print(f"Model yükleniyor: {model_path}")
            model = YOLO(model_path)
            
            # Model sınıflarını al ve yazdır
            model_classes = model.names
            print("Model sınıfları:", model_classes)
            
            # ALL_CLASSES'ı model sınıflarıyla güncelle
            global ALL_CLASSES
            ALL_CLASSES = {name: idx for idx, name in model_classes.items()}
            print("Güncellenen ALL_CLASSES:", ALL_CLASSES)
            
            # Model yapılandırmasını güncelle
            model.conf = 0.25  # Güven eşiğini artır
            model.iou = 0.45   # IoU eşiğini artır
            model.max_det = 50  # Maksimum tespit sayısını azalt
            print(f"Model başarıyla yüklendi ve yapılandırıldı")
            
        except Exception as e:
            print(f"Model yükleme hatası: {e}")
            import traceback
            print(traceback.format_exc())
            raise e
    return model

# All classes that our model can detect - bu sadece referans, model yüklenince güncelleniyor
ALL_CLASSES = {
    'cukur': 0,
    'Kamyon': 1,
    'Temel_Kazma': 2,
    'Kaskli': 3,
    'Kasksiz': 4,
    'Yeleksiz': 5,
    'insan': 6,
    'Yelekli': 7,
    'Tugla_Doseme': 8,
    'Ekskavator': 9,
    'Forklift': 10,
    'Mikser': 11,
    'Vinc': 12,
    'Demir_Doseme': 13,
    'agir_makine': 14,
    'aktif_agir_makine': 15,
    'aktif_tehlike_rotasyonu': 16,
    'potansiyel_tehlike_rotasyonu': 17,
    'yangin': 18,
    'Tamamlanmis_insaat': 19
}

# Define which classes are considered hazards and their danger levels
HAZARD_CLASSES = {
    'yangin': {'level': 'high', 'distance_threshold': 200, 'conf_threshold': 0.05},  # Yangın için çok düşük eşik
    'cukur': {'level': 'high', 'distance_threshold': 100, 'conf_threshold': 0.08},  # Çukur için mesafe eşiğini artırdım
    'aktif_agir_makine': {'level': 'high', 'distance_threshold': 80, 'conf_threshold': 0.08},
    'aktif_tehlike_rotasyonu': {'level': 'high', 'distance_threshold': 70, 'conf_threshold': 0.08},
    'potansiyel_tehlike_rotasyonu': {'level': 'medium', 'distance_threshold': 60, 'conf_threshold': 0.08},
    'Kasksiz': {'level': 'high', 'distance_threshold': 0, 'conf_threshold': 0.08},
    'Yeleksiz': {'level': 'medium', 'distance_threshold': 0, 'conf_threshold': 0.08},
}

# Non-hazard classes that should still be detected with good confidence
NON_HAZARD_CLASSES = {
    'Temel_Kazma': {'conf_threshold': 0.08},
    'Kamyon': {'conf_threshold': 0.08},
    'Ekskavator': {'conf_threshold': 0.08},
    'Forklift': {'conf_threshold': 0.08},
    'Mikser': {'conf_threshold': 0.08},
    'Vinc': {'conf_threshold': 0.08},
    'Tugla_Doseme': {'conf_threshold': 0.08},
    'Demir_Doseme': {'conf_threshold': 0.08},
    'agir_makine': {'conf_threshold': 0.08},
    'Tamamlanmis_insaat': {'conf_threshold': 0.08}
}

# Classes that represent humans (with or without safety equipment)
HUMAN_CLASSES = {'insan', 'Kaskli', 'Kasksiz', 'Yelekli', 'Yeleksiz'}

# Define priority order for human detections (to avoid duplicates)
HUMAN_PRIORITY = {
    'Kasksiz': 1,  # En yüksek öncelik
    'Yeleksiz': 2,
    'Kaskli': 3,
    'Yelekli': 4,
    'insan': 5,    # En düşük öncelik
}

def calculate_distance(box1, box2):
    """Calculate the minimum distance between two bounding boxes."""
    # Kutular [x1, y1, x2, y2] formatında
    
    # Kenarlar arasındaki minimum mesafeyi hesapla
    # Yatay mesafe
    if box1[2] < box2[0]:  # box1 sol, box2 sağ
        dx = box2[0] - box1[2]
    elif box2[2] < box1[0]:  # box2 sol, box1 sağ
        dx = box1[0] - box2[2]
    else:  # Yatay örtüşme
        dx = 0
    
    # Dikey mesafe
    if box1[3] < box2[1]:  # box1 üst, box2 alt
        dy = box2[1] - box1[3]
    elif box2[3] < box1[1]:  # box2 üst, box1 alt
        dy = box1[1] - box2[3]
    else:  # Dikey örtüşme
        dy = 0
    
    # Eğer kutular kesişiyorsa, mesafe 0
    if dx == 0 and dy == 0:
        return 0
    
    # Diagonal mesafe hesapla
    return np.sqrt(dx*dx + dy*dy)

def calculate_iou(box1, box2):
    """Calculate Intersection over Union between two bounding boxes."""
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])
    
    if x2 < x1 or y2 < y1:
        return 0.0
    
    intersection = (x2 - x1) * (y2 - y1)
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    
    return intersection / (area1 + area2 - intersection)

def check_danger(human_box, hazard_box, hazard_type):
    """Check if a human is in danger based on hazard type and distance."""
    # Get hazard parameters
    hazard_info = HAZARD_CLASSES.get(hazard_type)
    if not hazard_info:
        return False, None
    
    # Check for direct overlap
    x1 = max(human_box[0], hazard_box[0])
    y1 = max(human_box[1], hazard_box[1])
    x2 = min(human_box[2], hazard_box[2])
    y2 = min(human_box[3], hazard_box[3])
    
    if x1 < x2 and y1 < y2:
        # Kutular çakışıyor - kesin tehlike
        return True, hazard_info['level']
    
    # Çakışma yoksa mesafe kontrolü yap
    distance = calculate_distance(human_box, hazard_box)
    if distance < hazard_info['distance_threshold']:
        return True, hazard_info['level']
    
    return False, None

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    try:
        while True:
            # Receive message
            message = await websocket.receive_text()
            
            try:
                # Try to parse as JSON first (for new format)
                data = json.loads(message)
                if isinstance(data, dict) and data.get('type') == 'detect':
                    # Extract base64 image from JSON message
                    encoded_data = data['image'].split(",")[1]
                    is_webcam = data.get('mode') == 'webcam'  # Webcam modu kontrolü
                else:
                    # Old format - direct base64 string
                    encoded_data = message.split(",")[1]
                    is_webcam = False  # Eski format için varsayılan olarak webcam değil
            except json.JSONDecodeError:
                # Old format - direct base64 string
                encoded_data = message.split(",")[1]
                is_webcam = False  # JSON olmayan mesajlar için varsayılan olarak webcam değil
            
            try:
                # Decode image
                nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                if frame is None:
                    raise ValueError("Invalid image data")

                # Görüntü boyutunu yazdır (debug için)
                print(f"Alınan görüntü boyutu: {frame.shape}")
                
                # Görüntü boyutunu normalize et - 640x640 veya yakın bir değere ayarla
                # Bu, model için daha iyi tespit sonuçları verebilir
                max_dim = max(frame.shape[0], frame.shape[1])
                if max_dim > 640:
                    scale = 640 / max_dim
                    new_width = int(frame.shape[1] * scale)
                    new_height = int(frame.shape[0] * scale)
                    frame = cv2.resize(frame, (new_width, new_height))
                    print(f"Görüntü boyutu yeniden düzenlendi: {frame.shape}")

                # Farklı işlenmiş görüntüler üzerinde tespit deneyin
                yolo_model = get_model()
                
                print("Tespit işlemi başlıyor...")
                
                # Webcam modu için optimizasyon - sadece orijinal kareyi işle
                if is_webcam:
                    results_list = [("Orijinal", yolo_model(frame)[0])]
                else:
                    # Yüklenen görüntüler için tüm iyileştirmeleri kullan
                    # Görüntü ön işleme - Daha iyi tespit için çeşitli iyileştirmeler
                    # 1. Kontrast artırma - CLAHE yöntemi
                    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
                    l, a, b = cv2.split(lab)
                    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
                    cl = clahe.apply(l)
                    limg = cv2.merge((cl, a, b))
                    enhanced_frame = cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)
                    
                    # 2. Keskinlik artırma - Unsharp masking
                    kernel = np.array([[-1,-1,-1], [-1,9,-1], [-1,-1,-1]])
                    sharpened_frame = cv2.filter2D(enhanced_frame, -1, kernel)
                    
                    # 3. Parlaklık ve kontrast ayarları
                    brightness_contrast_frame = frame.copy()
                    alpha = 1.2  # Kontrast artırma (1.0-3.0)
                    beta = 10    # Parlaklık artırma (0-100)
                    brightness_contrast_frame = cv2.convertScaleAbs(frame, alpha=alpha, beta=beta)
                    
                    # 4. HSV renk uzayında yangın tespiti için özel ayarlar
                    hsv_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
                    # Yangın tespiti için düşük ve yüksek HSV değerleri
                    lower_red1 = np.array([0, 100, 100])
                    upper_red1 = np.array([10, 255, 255])
                    lower_red2 = np.array([160, 100, 100])
                    upper_red2 = np.array([180, 255, 255])
                    mask1 = cv2.inRange(hsv_frame, lower_red1, upper_red1)
                    mask2 = cv2.inRange(hsv_frame, lower_red2, upper_red2)
                    fire_mask = cv2.bitwise_or(mask1, mask2)
                    fire_detected_frame = cv2.bitwise_and(frame, frame, mask=fire_mask)
                    
                    # Tüm işlenmiş görüntülerde tespit yap
                    results_list = [
                        ("Orijinal", yolo_model(frame)[0]),
                        ("Geliştirilmiş", yolo_model(enhanced_frame)[0]),
                        ("Keskinleştirilmiş", yolo_model(sharpened_frame)[0]),
                        ("Parlaklık+Kontrast", yolo_model(brightness_contrast_frame)[0]),
                        ("Yangın Maskeli", yolo_model(fire_detected_frame)[0])
                    ]
                
                # Her tespit kümesi için sonuçları yazdır
                for name, result in results_list:
                    detections = []
                    for box in result.boxes.data.tolist():
                        if len(box) >= 6:
                            _, _, _, _, conf, cls = box
                            class_id = int(cls)
                            class_name = result.names.get(class_id, "unknown")
                            detections.append(class_name)
                    print(f"{name} görüntüde tespit edilen nesneler ({len(result.boxes)}): {detections}")
                
                # Tüm sonuçları birleştir
                all_detections = []
                
                # Process all detections from all image variations
                for name, results_set in results_list:
                    for r in results_set.boxes.data.tolist():
                        if len(r) < 6:
                            continue
                            
                        x1, y1, x2, y2, conf, cls = r
                        class_id = int(cls)
                        class_name = results_set.names.get(class_id, "unknown")
                        
                        # Sınıfa özgü güven eşiğini al
                        class_conf_threshold = HAZARD_CLASSES.get(class_name, {}).get('conf_threshold', 
                                              NON_HAZARD_CLASSES.get(class_name, {}).get('conf_threshold', 
                                              float(yolo_model.conf)))
                        
                        # Koordinatları yumuşat
                        box_id = f"{class_name}_{int(x1)}_{int(y1)}"  # Benzersiz ID oluştur
                        current_coords = np.array([float(x1), float(y1), float(x2), float(y2)])
                        box_smoother.update(box_id, current_coords)
                        smoothed_coords = box_smoother.get_smoothed_coords(box_id)
                        
                        if smoothed_coords is not None:
                            x1, y1, x2, y2 = smoothed_coords
                        
                        # Check if this detection overlaps with any existing one
                        is_duplicate = False
                        for existing in all_detections:
                            if existing["class"] == class_name and calculate_iou(
                                [float(x1), float(y1), float(x2), float(y2)], 
                                existing["box"]
                            ) > 0.3:
                                is_duplicate = True
                                # Keep the higher confidence one
                                if float(conf) > existing["confidence"]:
                                    existing["confidence"] = float(conf)
                                    existing["box"] = [float(x1), float(y1), float(x2), float(y2)]
                                break
                        
                        # Add if not duplicate and meets confidence threshold
                        if not is_duplicate and conf >= class_conf_threshold:
                            detection = {
                                "box": [float(x1), float(y1), float(x2), float(y2)],
                                "confidence": float(conf),
                                "class": class_name,
                                "in_danger": class_name in HAZARD_CLASSES,
                                "danger_level": HAZARD_CLASSES.get(class_name, {}).get('level', None),
                                "safety_equipment": class_name in ['Kaskli', 'Yelekli'],
                                "source": name
                            }
                            all_detections.append(detection)
                
                # Temizlik işlemi - artık görünmeyen nesnelerin geçmişini sil
                current_ids = [f"{d['class']}_{int(d['box'][0])}_{int(d['box'][1])}" for d in all_detections]
                box_smoother.clean_old_entries(current_ids)
                
                # Gruplandırma işlemi
                human_boxes = [d for d in all_detections if d["class"] in HUMAN_CLASSES]
                hazard_boxes = [d for d in all_detections if d["class"] in HAZARD_CLASSES]
                
                # Filtreleme: Çakışan insan kutularını birleştir veya en önemlisini seç
                filtered_humans = []
                if human_boxes:
                    # Önceliğe göre sırala
                    human_boxes.sort(key=lambda x: HUMAN_PRIORITY.get(x["class"], 999))
                    
                    for human in human_boxes:
                        # Daha önce eklenen kutularla çakışıyor mu kontrol et
                        should_add = True
                        for existing in filtered_humans:
                            if calculate_iou(human["box"], existing["box"]) > 0.3:  # %30'dan fazla çakışma varsa
                                should_add = False
                                break
                        
                        if should_add:
                            # Kasksız ve Yeleksiz kişileri tehlike olarak işaretle
                            if human["class"] in ["Kasksiz", "Yeleksiz"]:
                                human["in_danger"] = True
                                human["danger_level"] = "high" if human["class"] == "Kasksiz" else "medium"
                                human["danger_source"] = "Güvenlik ekipmanı eksikliği"
                            
                            filtered_humans.append(human)
                
                # Tehlike durumlarını kontrol et
                for human in filtered_humans:
                    # Tüm tehlikeleri eşit öncelikle kontrol et
                    for hazard in hazard_boxes:
                        is_danger, danger_level = check_danger(
                            human["box"], 
                            hazard["box"],
                            hazard["class"]
                        )
                        if is_danger:
                            human["in_danger"] = True
                            human["danger_level"] = danger_level
                            human["danger_source"] = hazard["class"]
                            print(f"İnsan {hazard['class']} tehlikesinde! Mesafe: {calculate_distance(human['box'], hazard['box'])}")
                            break  # İlk tespit edilen tehlike durumunda dur

                # Tehlikeli olmayan durumları ve tehlike kaynaklarını da dahil et
                final_detections = filtered_humans + [h for h in all_detections if h["class"] not in HUMAN_CLASSES]
                
                # Send results back to client
                await websocket.send_json({
                    "status": "success",
                    "detections": final_detections,
                    "message": f"Detected {len(final_detections)} objects"
                })
                print(f"Toplam {len(final_detections)} nesne tespit edildi ve istemciye gönderildi.")

            except Exception as e:
                import traceback
                print(f"Processing error: {e}")
                print(traceback.format_exc())  # Detaylı hata izini yazdır
                await websocket.send_json({
                    "status": "error",
                    "message": str(e),
                    "detections": []
                })

    except Exception as e:
        import traceback
        print(f"WebSocket error: {e}")
        print(traceback.format_exc())  # Print detailed error trace
        try:
            await websocket.close(code=1000)
        except Exception as close_error:
            print(f"Error during WebSocket close: {close_error}")

@app.get("/")
def read_root():
    return {"status": "AI Safety Monitoring System Backend is running"} 