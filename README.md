# AI İş Güvenliği İzleme Sistemi

Bu uygulama, yapı alanlarında gerçek zamanlı güvenlik izlemesi yapan bir sistemdir. Webcam veya yüklenilen görüntüler üzerinde YOLOv10 modelini kullanarak tehlikeli durumları tespit eder.

## Özellikler
- Gerçek zamanlı webcam izleme
- Resim yükleme ve analiz
- Yapay zeka destekli nesne tespiti:
  - Baret ve yelek kontrolü
  - Tehlikeli bölge analizi
  - Çukur tespiti
  - Ağır makine tespiti
  - Yangın tespiti
- Canlı tehlike durumu gösterimi
- Özelleştirilebilir izleme bölgeleri

## Sistem Gereksinimleri
- Windows 10 veya üzeri
- Python 3.8 veya üzeri
- Node.js 16 veya üzeri
- NVIDIA GPU (önerilen)
- Webcam (gerçek zamanlı izleme için)

## Kurulum Adımları

### 1. Projeyi İndirme
1. Bu repository'yi ZIP olarak indirin veya git kullanarak klonlayın:
```bash
git clone [repository-url]
cd [proje-klasörü]
```

### 2. Python Sanal Ortam Kurulumu (ÖNEMLİ!)
1. Proje klasöründe terminal açın
2. Python sanal ortamı oluşturun:
```bash
python -m venv venv
```
3. Sanal ortamı aktifleştirin (⚠️ BU ADIM ÇOK ÖNEMLİ!):
   - Windows için:
   ```bash
   .\venv\Scripts\activate
   ```
   - Linux/Mac için:
   ```bash
   source venv/bin/activate
   ```
   - Sanal ortam aktif olduğunda terminal başında `(venv)` yazısını göreceksiniz
   - ⚠️ UYARI: Bundan sonraki tüm adımları sanal ortam aktifken yapmalısınız!
   - Her yeni terminal açtığınızda sanal ortamı tekrar aktifleştirmeniz gerekir

### 3. Backend Kurulumu
⚠️ UNUTMAYIN: Terminal başında `(venv)` yazısı olduğundan emin olun!

1. Backend klasörüne gidin:
```bash
cd backend
```

2. Gerekli Python paketlerini yükleyin:
```bash
pip install -r requirements.txt
```

3. YOLOv10 model dosyasını yerleştirin:
   - `backend/models` klasörü oluşturun
   - Model dosyasını (`best.pt`) bu klasöre kopyalayın

4. Backend sunucusunu başlatın:
```bash
uvicorn main:app --reload
```
- Sunucu başarıyla başladığında konsolda "Application startup complete" mesajını göreceksiniz
- Varsayılan olarak `http://localhost:8000` adresinde çalışacaktır

### 4. Frontend Kurulumu
1. Yeni bir terminal açın
2. ⚠️ YENİ TERMİNALDE de sanal ortamı aktifleştirin:
   ```bash
   .\venv\Scripts\activate   # Windows için
   ```
3. Frontend klasörüne gidin:
```bash
cd frontend
```

4. Node.js paketlerini yükleyin:
```bash
npm install
```

5. Frontend geliştirme sunucusunu başlatın:
```bash
npm run dev
```
- Sunucu başarıyla başladığında konsolda URL'i göreceksiniz
- Varsayılan olarak `http://localhost:5173` adresinde çalışacaktır

### 5. Uygulamayı Kullanma
1. Web tarayıcınızda `http://localhost:5173` adresine gidin
2. İki mod arasında seçim yapabilirsiniz:
   - Webcam Modu: Gerçek zamanlı kamera görüntüsü üzerinde analiz
   - Resim Yükleme: Seçtiğiniz görseller üzerinde analiz

### Olası Hatalar ve Çözümleri

1. "Model dosyası bulunamadı" hatası:
   - `backend/models` klasörünün var olduğundan emin olun
   - `best.pt` dosyasının bu klasörde olduğunu kontrol edin

2. "uvicorn command not found" hatası:
   - ⚠️ Sanal ortamın aktif olmadığını gösterir!
   - Terminal başında `(venv)` yazısı olduğundan emin olun
   - Sanal ortamı aktifleştirin ve `pip install uvicorn` komutunu çalıştırın

3. "Module not found" hataları:
   - ⚠️ Sanal ortamın aktif olmadığını gösterir!
   - Terminal başında `(venv)` yazısı olduğundan emin olun
   - Sanal ortamı aktifleştirip `pip install -r requirements.txt` komutunu tekrar çalıştırın

4. Frontend bağlantı hatası:
   - Backend sunucusunun çalışır durumda olduğunu kontrol edin
   - Konsoldaki hata mesajlarını inceleyin

### Önemli Notlar
- ⚠️ HER YENİ TERMİNAL AÇTIĞINIZDA sanal ortamı tekrar aktifleştirmelisiniz!
- Backend ve frontend sunucuları aynı anda çalışır durumda olmalıdır
- Webcam kullanırken tarayıcının kamera erişim izni istemesine izin verin
- NVIDIA GPU kullanıyorsanız, güncel CUDA sürücülerinin yüklü olduğundan emin olun
- Sistem yüksek CPU ve GPU kullanımı gerektirebilir

## Destek ve İletişim
Herhangi bir sorun yaşarsanız:
1. Sanal ortamın aktif olduğundan emin olun (`(venv)` yazısını kontrol edin)
2. Bu README dosyasındaki adımları tekrar kontrol edin
3. Konsol çıktılarını inceleyin
4. GitHub Issues üzerinden sorununuzu bildirebilirsiniz

## Lisans
[Lisans bilgisi] 