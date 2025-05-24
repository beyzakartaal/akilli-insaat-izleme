import { useEffect, useRef, useState } from 'react'
import { Box, Container, Typography, Paper, Button, Input, CircularProgress, Snackbar, Alert, Grid, Tabs, Tab } from '@mui/material'
import { styled } from '@mui/material/styles'
import './App.css'

interface Detection {
  box: number[]
  confidence: number
  class: string
  in_danger: boolean
  danger_level?: string
  danger_source?: string
  safety_equipment?: boolean
}

const DropZone = styled(Box)(({ theme }) => ({
  border: '2px dashed #ccc',
  borderRadius: '4px',
  padding: theme.spacing(2),
  textAlign: 'center',
  cursor: 'pointer',
  minHeight: '100px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  '&:hover': {
    borderColor: theme.palette.primary.main,
    backgroundColor: 'rgba(0, 0, 0, 0.04)'
  },
}));

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const webcamCanvasRef = useRef<HTMLCanvasElement>(null)
  const imageCanvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  
  const [detections, setDetections] = useState<Detection[]>([])
  const [isWebcamActive, setIsWebcamActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [currentImage, setCurrentImage] = useState<string | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [notification, setNotification] = useState<{type: 'success'|'error'|'info', message: string} | null>(null)
  const [originalImageDimensions, setOriginalImageDimensions] = useState<{width: number, height: number} | null>(null)
  
  // WebSocket bağlantısı
  useEffect(() => {
    // Initialize WebSocket connection
    console.log("Connecting to WebSocket...");
    wsRef.current = new WebSocket('ws://localhost:8000/ws');
    
    wsRef.current.onopen = () => {
      console.log("WebSocket connected!");
      setNotification({
        type: 'success',
        message: 'Sunucuya bağlandı!'
      });
    };
    
    wsRef.current.onmessage = (event) => {
      try {
        const response = JSON.parse(event.data);
        console.log("Received response:", response);
        
        if (response.status === 'success') {
          setDetections(response.detections);
          setIsLoading(false);
          setIsDetecting(false);
          setNotification({
            type: 'success',
            message: `${response.detections.length} nesne tespit edildi!`
          });
        } else {
          setIsLoading(false);
          setIsDetecting(false);
          setNotification({
            type: 'error',
            message: response.message || 'Bir hata oluştu'
          });
        }
      } catch (error) {
        console.error("Error processing response:", error);
        setIsLoading(false);
        setIsDetecting(false);
        setNotification({
          type: 'error',
          message: 'Sunucu yanıtı işlenemedi'
        });
      }
    };
    
    wsRef.current.onerror = (error) => {
      console.error("WebSocket error:", error);
      setIsLoading(false);
      setIsDetecting(false);
      setNotification({
        type: 'error',
        message: 'Sunucu bağlantı hatası!'
      });
    };

    wsRef.current.onclose = () => {
      console.log("WebSocket disconnected");
      setNotification({
        type: 'error',
        message: 'Sunucu bağlantısı kesildi!'
      });
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Webcam başlatma
  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsWebcamActive(true);
      }
    } catch (error) {
      console.error('Error accessing webcam:', error);
      setNotification({
        type: 'error',
        message: 'Kamera erişim hatası!'
      });
    }
  };

  // Webcam durdurma
  const stopWebcam = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsWebcamActive(false);
      setDetections([]);
    }
  };

  // Dosya sürükleme işlemi
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      handleFile(files[0]);
    }
  };

  // Dosya seçme işlemi
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  // Dosya işleme
  const handleFile = (file: File) => {
    if (file.type.startsWith('image/')) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          const imageResult = e.target.result as string;
          setCurrentImage(imageResult);
          setIsDetecting(false);
          setDetections([]);
          
          // Yüklenen görüntüyü canvas'a çiz
          const img = new Image();
          img.onload = () => {
            setOriginalImageDimensions({
              width: img.width,
              height: img.height
            });
            drawImageToCanvas(imageResult);
          };
          img.src = imageResult;
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Dosya seçme diyaloğunu açma
  const openFileDialog = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Sürükleme işlemi
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Bildirim kapatma
  const handleCloseNotification = () => {
    setNotification(null);
  };

  // Görüntüyü canvas'a çizme
  const drawImageToCanvas = (imageUrl: string) => {
    const canvas = imageCanvasRef.current;
    const context = canvas?.getContext('2d');
    
    if (canvas && context) {
      const img = new Image();
      img.onload = () => {
        // Canvas boyutlarını görüntüye göre ayarla
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Canvas temizleme
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Görüntüyü tam boyutunda çiz
        context.drawImage(img, 0, 0, img.width, img.height);
      };
      img.src = imageUrl;
    }
  };

  // Webcam frame gönderimi
  useEffect(() => {
    let animationFrameId: number;
    let lastSentTime = 0;
    const SEND_INTERVAL = 100; // Her 100ms'de bir frame gönder (daha hızlı güncelleme için 200ms'den 100ms'ye düşürdük)
    
    const sendWebcamFrame = () => {
      if (isWebcamActive && videoRef.current && webcamCanvasRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        const canvas = webcamCanvasRef.current;
        const context = canvas.getContext('2d');
        
        if (context && videoRef.current) {
          // Canvas boyutlarını video boyutlarına eşitle
          const videoWidth = videoRef.current.videoWidth;
          const videoHeight = videoRef.current.videoHeight;
          
          if (videoWidth && videoHeight) {
            if (canvas.width !== videoWidth || canvas.height !== videoHeight) {
              canvas.width = videoWidth;
              canvas.height = videoHeight;
            }
            
            // Canvas'ı temizle
            context.clearRect(0, 0, canvas.width, canvas.height);
            
            try {
              // Video frame'ini canvas'a çiz
              context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
              
              // Throttle: Her X ms'de bir frame gönder
              const now = Date.now();
              if (now - lastSentTime > SEND_INTERVAL) {
                // Frame'i backend'e gönder
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                wsRef.current.send(JSON.stringify({
                  type: 'detect',
                  image: dataUrl,
                  model: 'best.pt',  // Explicitly specify the model
                  mode: 'webcam'     // Webcam modunu belirt
                }));
                lastSentTime = now;
              }
              
              // Tespit kutularını çiz
              drawDetectionsOnCanvas(context, detections, { width: videoWidth, height: videoHeight });
            } catch (e) {
              console.error("Video çizim hatası:", e);
            }
          }
        }
        
        // Animasyon devam etsin
        animationFrameId = requestAnimationFrame(sendWebcamFrame);
      }
    };
    
    if (isWebcamActive) {
      videoRef.current?.addEventListener('loadedmetadata', () => {
        if (videoRef.current && webcamCanvasRef.current) {
          // Video boyutlarını al ve canvas'ı ayarla
          const videoWidth = videoRef.current.videoWidth;
          const videoHeight = videoRef.current.videoHeight;
          if (videoWidth && videoHeight) {
            webcamCanvasRef.current.width = videoWidth;
            webcamCanvasRef.current.height = videoHeight;
          }
          sendWebcamFrame();
        }
      });
      
      if (videoRef.current && videoRef.current.readyState >= 2) {
        sendWebcamFrame();
      }
    }
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isWebcamActive, detections]);

  // Yüklenen görüntüdeki tespitleri çizme
  useEffect(() => {
    if (detections.length > 0 && !isWebcamActive && imageCanvasRef.current && currentImage) {
      const canvas = imageCanvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      const img = new Image();
      img.onload = () => {
        // Canvas boyutlarını görüntüye göre ayarla
        canvas.width = img.width;
        canvas.height = img.height;

        // Canvas temizleme
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Resmi yeniden çiz
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Her tespit için etiketleri çiz
        detections.forEach(detection => {
          const [x1, y1, x2, y2] = detection.box;
          
          // Koordinatları canvas boyutuna göre ölçeklendir
          const scaleX = canvas.width / img.width;
          const scaleY = canvas.height / img.height;
          
          const scaledX1 = x1 * scaleX;
          const scaledY1 = y1 * scaleY;
          const scaledWidth = (x2 - x1) * scaleX;
          const scaledHeight = (y2 - y1) * scaleY;
          
          // Kutu çizimi
          context.beginPath();
          context.lineWidth = 2;
          context.strokeStyle = detection.in_danger ? 'red' : 'green';
          context.rect(scaledX1, scaledY1, scaledWidth, scaledHeight);
          context.stroke();
          
          // Etiket hazırlığı
          const label = `${detection.class} (${Math.round(detection.confidence * 100)}%)`;
          const padding = 5;
          context.font = '14px Arial';
          const labelWidth = context.measureText(label).width + (padding * 2);
          const labelHeight = 20;
          
          // Etiketin konumunu kutuya göre ayarla
          const labelX = scaledX1;
          const labelY = scaledY1 > labelHeight + 10 ? scaledY1 - labelHeight - 5 : scaledY1 + scaledHeight + 5;
          
          // Etiket arka planı
          context.fillStyle = 'rgba(0, 0, 0, 0.7)';
          context.fillRect(labelX, labelY, labelWidth, labelHeight);
          
          // Etiket metni
          context.fillStyle = detection.in_danger ? '#ff3333' : 'white';
          context.fillText(label, labelX + padding, labelY + 14);
          
          // Tehlike durumu için ek etiket
          if (detection.in_danger && detection.danger_source) {
            const dangerLabel = 'Tehlike!';
            const dangerLabelWidth = context.measureText(dangerLabel).width + (padding * 2);
            const dangerLabelY = labelY > scaledY1 ? labelY - labelHeight - 2 : labelY + labelHeight + 2;
            
            context.fillStyle = 'rgba(255, 0, 0, 0.7)';
            context.fillRect(labelX, dangerLabelY, dangerLabelWidth, labelHeight);
            context.fillStyle = 'white';
            context.fillText(dangerLabel, labelX + padding, dangerLabelY + 14);
          }
        });
      };
      img.src = currentImage;
    }
  }, [detections, currentImage, isWebcamActive]);

  // Webcam tespitlerini çizme
  const drawDetectionsOnCanvas = (
    context: CanvasRenderingContext2D,
    detections: Detection[],
    videoDimensions: { width: number, height: number }
  ) => {
    detections.forEach(detection => {
      const [x1, y1, x2, y2] = detection.box;
      
      // Koordinatları video boyutuna göre ölçeklendir
      const scaleX = videoDimensions.width / context.canvas.width;
      const scaleY = videoDimensions.height / context.canvas.height;
      
      const scaledX1 = x1 * scaleX;
      const scaledY1 = y1 * scaleY;
      const scaledWidth = (x2 - x1) * scaleX;
      const scaledHeight = (y2 - y1) * scaleY;
      
      // Kutu çizimi
      context.beginPath();
      context.lineWidth = 2;
      context.strokeStyle = detection.in_danger ? 'red' : 'green';
      context.rect(scaledX1, scaledY1, scaledWidth, scaledHeight);
      context.stroke();
      
      // Etiket hazırlığı
      const label = `${detection.class} (${Math.round(detection.confidence * 100)}%)`;
      const padding = 5;
      context.font = '14px Arial';
      const labelWidth = context.measureText(label).width + (padding * 2);
      const labelHeight = 20;
      
      // Etiketin konumunu kutuya göre ayarla
      const labelX = scaledX1;
      const labelY = scaledY1 > labelHeight + 10 ? scaledY1 - labelHeight - 5 : scaledY1 + scaledHeight + 5;
      
      // Etiket arka planı
      context.fillStyle = 'rgba(0, 0, 0, 0.7)';
      context.fillRect(labelX, labelY, labelWidth, labelHeight);
      
      // Etiket metni
      context.fillStyle = detection.in_danger ? '#ff3333' : 'white';
      context.fillText(label, labelX + padding, labelY + 14);
      
      // Tehlike durumu için ek etiket
      if (detection.in_danger && detection.danger_source) {
        const dangerLabel = 'Tehlike!';
        const dangerLabelWidth = context.measureText(dangerLabel).width + (padding * 2);
        const dangerLabelY = labelY > scaledY1 ? labelY - labelHeight - 2 : labelY + labelHeight + 2;
        
        context.fillStyle = 'rgba(255, 0, 0, 0.7)';
        context.fillRect(labelX, dangerLabelY, dangerLabelWidth, labelHeight);
        context.fillStyle = 'white';
        context.fillText(dangerLabel, labelX + padding, dangerLabelY + 14);
      }
    });
  };

  // Tespit başlatma
  const startDetection = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setNotification({
        type: 'error',
        message: 'Sunucu bağlantısı yok! Sayfayı yenileyin.'
      });
      return;
    }

    if (!currentImage) {
      setNotification({
        type: 'error',
        message: 'Lütfen önce bir görüntü seçin.'
      });
      return;
    }

    try {
      console.log("Starting detection with best.pt model...");
      setIsLoading(true);
      setIsDetecting(true);
      
      // Send the image to backend with model specification
      wsRef.current.send(JSON.stringify({
        type: 'detect',
        image: currentImage,
        model: 'best.pt',  // Explicitly specify the model
        mode: 'image'      // Resim modunu belirt
      }));
      
      console.log("Detection request sent");
    } catch (error) {
      console.error("Error sending image:", error);
      setIsLoading(false);
      setIsDetecting(false);
      setNotification({
        type: 'error',
        message: 'Görüntü gönderilemedi!'
      });
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h3" component="h1" gutterBottom align="center" sx={{ mb: 4 }}>
        AI Safety Monitoring System
      </Typography>

      <Box 
        sx={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          justifyContent: 'center', 
          gap: 4
        }}
      >
        {/* Sol Panel - Webcam */}
        <Paper 
          elevation={3} 
          sx={{ 
            width: '500px', 
            height: '400px', 
            p: 3, 
            display: 'flex', 
            flexDirection: 'column',
            borderRadius: 2
          }}
        >
          <Typography variant="h5" gutterBottom sx={{ textAlign: 'center', mb: 2 }}>
            Webcam Modu
          </Typography>
          
          <Box 
            sx={{ 
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
              position: 'relative',
              borderRadius: 1,
              backgroundColor: '#f8f8f8',
              overflow: 'hidden'
            }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              style={{
                width: '100%',
                height: 'auto',
                maxHeight: '280px',
                objectFit: 'contain',
                display: isWebcamActive ? 'block' : 'none'
              }}
            />
            <canvas
              ref={webcamCanvasRef}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '100%',
                height: 'auto',
                maxHeight: '280px',
                objectFit: 'contain'
              }}
            />
            
            {!isWebcamActive && (
              <Typography variant="body2" color="textSecondary">
                Webcam'i başlatmak için aşağıdaki butona tıklayın
              </Typography>
            )}
          </Box>

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
            {!isWebcamActive ? (
              <Button 
                variant="contained" 
                color="primary" 
                onClick={startWebcam}
                sx={{ width: '120px' }}
              >
                BAŞLAT
              </Button>
            ) : (
              <Button 
                variant="contained" 
                color="error" 
                onClick={stopWebcam}
                sx={{ width: '120px' }}
              >
                DURDUR
              </Button>
            )}
          </Box>
        </Paper>

        {/* Sağ Panel - Görüntü Yükleme */}
        <Paper 
          elevation={3} 
          sx={{ 
            width: '500px', 
            height: '400px', 
            p: 3, 
            display: 'flex', 
            flexDirection: 'column',
            borderRadius: 2
          }}
        >
          <Typography variant="h5" gutterBottom sx={{ textAlign: 'center', mb: 2 }}>
            Görüntü Yükleme Modu
          </Typography>

          <Box 
            sx={{ 
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
              borderRadius: 1,
              backgroundColor: '#f8f8f8',
              overflow: 'hidden'
            }}
          >
            {currentImage ? (
              <Box 
                sx={{ 
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  overflow: 'auto',
                  position: 'relative'
                }}
              >
                <canvas
                  ref={imageCanvasRef}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain',
                    display: 'block'
                  }}
                />
              </Box>
            ) : (
              <Box
                sx={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  border: '2px dashed #ccc',
                  borderRadius: 1,
                  m: 1,
                  p: 2
                }}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*"
                  style={{ display: 'none' }}
                />
                <Button
                  variant="outlined"
                  onClick={openFileDialog}
                  sx={{ width: '150px' }}
                >
                  Dosya Seç
                </Button>
                <Typography variant="body2" color="textSecondary">
                  veya dosyayı buraya sürükleyip bırakın
                </Typography>
              </Box>
            )}
          </Box>

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center', gap: 2 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={startDetection}
              disabled={!currentImage || isDetecting}
              sx={{ width: '120px' }}
            >
              {isDetecting ? (
                <>
                  <CircularProgress size={20} color="inherit" />
                </>
              ) : (
                'TESPIT ET'
              )}
            </Button>
            {currentImage && (
              <Button
                variant="outlined"
                color="error"
                onClick={() => {
                  setCurrentImage(null);
                  setSelectedFile(null);
                  setDetections([]);
                  setOriginalImageDimensions(null);
                }}
                sx={{ width: '120px' }}
              >
                TEMİZLE
              </Button>
            )}
          </Box>
        </Paper>
      </Box>

      <Snackbar
        open={notification !== null}
        autoHideDuration={6000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleCloseNotification}
          severity={notification?.type || 'info'}
          sx={{ width: '100%' }}
        >
          {notification?.message || ''}
        </Alert>
      </Snackbar>
    </Container>
  )
}

export default App

