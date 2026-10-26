# UAV Oil Palm Detection (Member 3)

Sistem pemantauan dan deteksi tandan kelapa sawit secara real-time dari video live stream UAV / Drone menggunakan **React + Vite + TypeScript**, **ElysiaJS + Bun**, **WebSocket**, dan **Python YOLO Inference Service**.

---

## 🏗️ Arsitektur Sistem

```
                                    +-----------------------+
                                    |   Frontend (React)    |
                                    | http://localhost:5173 |
                                    +-----------------------+
                                                ▲
                                                │ (WebSocket /ws/detection)
                                                ▼
+---------------------+             +-----------------------+
|  UAV Video Stream   |             |  ElysiaJS + Bun API   |
| (Webcam/Simulator)  | ──────────> | http://localhost:3000 |
+---------------------+  (/ws/stream) +-----------------------+
                                                ▲
                                                │ (WebSocket /ws/inference)
                                                ▼
                                    +-----------------------+
                                    |  Python YOLO Service  |
                                    | http://localhost:8000 |
                                    | (YOLOv11n Detection)  |
                                    +-----------------------+
```

---

## 🎯 Fitur & Perkembangan yang Telah Selesai

### 1. Backend & API Dasar (Step 1)
- **Runtime Bun & ElysiaJS**: Backend modern berkinerja tinggi.
- **REST Endpoints**:
  - `GET /api/health`: Status server dan status koneksi ke service inferensi (`inference_connected`).
  - `GET /api/detection/latest`: Mengambil hasil deteksi objek kelapa sawit terakhir.
  - `GET /api/stats`: Metrik frame count, total deteksi, jumlah viewer aktif, dan status inferensi.
- **WebSocket Endpoints**:
  - `/ws/stream`: Menerima aliran frame citra UAV mentah (base64 JPEG).
  - `/ws/detection` (alias `/ws/view`): Menyiarkan (*broadcast*) frame citra dan bounding box deteksi ke frontend viewer.
  - `/ws/inference`: Endpoint inbound untuk menerima data inferensi langsung dari service Python.

### 2. Evaluasi Model YOLOv11 Kelapa Sawit (Step 2)
- **Model Bobot**: `inference/oil_palm_fruit_yolov11n.pt`
- **4 Kelas Objek Tandan Sawit**:
  - `Betina` (Bunga/tandan betina)
  - `Black fruits` (Buah mentah / belum matang)
  - `Jantan` (Bunga/tandan jantan)
  - `Red fruits` (Buah matang / siap panen)
- **Suite Pengujian Model**: [`inference/test_model.py`](file:///e:/Kuliah/Capstone/code/inference/test_model.py) untuk menguji model pada gambar di folder `test_images/` maupun file video rekaman, dengan metrik latensi, FPS, dan confidence level.

### 3. Integrasi Real-Time Python ↔ Elysia API (Step 3)
- **Standardisasi Skema JSON**:
  ```json
  {
    "frame_id": "uav-12-1714000000000",
    "detections": [
      {
        "label": "Red fruits",
        "confidence": 0.88,
        "x": 120,
        "y": 85,
        "w": 64,
        "h": 58
      }
    ],
    "latency_ms": 45.2,
    "fps": 18.5,
    "timestamp": 1714000000.123
  }
  ```
- **Model Warm-up**: Menjalankan warm-up inferensi saat Python startup untuk mengeliminasi lonjakan latensi (*cold start*) pada frame awal.
- **Real-Time FPS & Metrik Tracking**:
  - Tracking sliding window frame rate pada Python inference service.
  - Endpoint `GET /stats` pada Python (`frames_processed`, `avg_latency_ms`, `fps`, `uptime_seconds`).
- **Resilience / Auto-reconnection**: Backend Elysia secara otomatis mencoba menyambung ulang (*reconnect*) setiap 3 detik jika service Python terhenti, dan otomatis tersambung kembali saat service aktif.
- **Pengujian Integrasi Otomatis**:
  - [`inference/test_integration.py`](file:///e:/Kuliah/Capstone/code/inference/test_integration.py): Menguji alur lengkap end-to-end stream hingga data deteksi tiba di viewer.
  - [`backend/test_api.ts`](file:///e:/Kuliah/Capstone/code/backend/test_api.ts): Verifikasi otomatis seluruh endpoint REST & WebSocket backend.

### 4. Dashboard Pemantauan Real-Time (Step 4)
- **Komponen Dashboard Monitoring**:
  - **StatsCards**: 4 kartu ringkasan performa real-time (Total Frames, Total Deteksi, FPS Inferensi, Latensi Model).
  - **VideoStream**: Pemutar video canvas interaktif dengan toggle overlay bounding box dan warna kelas yang akurat.
  - **DetectionPanel**: Panel deteksi frame aktif dengan ringkasan jumlah per kelas, bar confidence, dan koordinat bounding box.
  - **DetectionHistory**: Tabel riwayat 50 deteksi terbaru dengan timestamp waktu, frame ID, jumlah objek, label kelas unik, latensi, dan FPS.
  - **StatusBar**: Indikator status koneksi WebSocket API dengan tombol reconnect manual dan mekanisme auto-reconnect 3 detik.
  - **UAVSimulator**: Simulator feed video UAV terintegrasi (webcam / pola uji sintetis) langsung dari browser.
- **Standarisasi Warna Kelas Sawit**:
  - `Betina`: Ungu (`#a855f7`)
  - `Black fruits`: Abu-abu (`#64748b`)
  - `Jantan`: Biru (`#3b82f6`)
  - `Red fruits`: Merah (`#ef4444`)

### 5. Simulasi Aliran Video UAV & Analisis Generalisasi Domain Gap (Step 5)
- **Simulasi Tanpa Hardware Fisik**: Sesuai Subbab 1.5 Batasan Masalah, pengujian penerbangan dan streaming drone diuji secara penuh menggunakan simulator rekaman udara dan video sintetis.
- **Enhanced UAV Stream Simulator**:
  - Mendukung rekaman video UAV (`.mp4`), webcam (`0`), streaming drone sintetis (`sim`), dan pola uji (`test`) dengan target 15 FPS.
  - Dilengkapi On-Screen Display (OSD) telemetry khas drone: Ketinggian (*altitude*), Kecepatan (*ground speed*), GPS latitude/longitude, status baterai, crosshair gimbal, dan horizon pitch.
  - Auto-reconnection cerdas dan pelaporan statistik throughput bandwidth (KB/s).
- **Generator Video UAV**:
  - [`inference/generate_uav_test_video.py`](file:///e:/Kuliah/Capstone/code/inference/generate_uav_test_video.py) untuk memproduksi video simulasi penerbangan drone di atas perkebunan sawit.
- **Evaluasi & Analisis Domain Gap**:
  - [`inference/test_uav_simulation.py`](file:///e:/Kuliah/Capstone/code/inference/test_uav_simulation.py) untuk benchmark otomatis aliran stream dan komparasi domain gap.
  - Laporan lengkap didokumentasikan di [`inference/results_step5.md`](file:///e:/Kuliah/Capstone/code/inference/results_step5.md) yang mengupas perbedaan perspektif citra permukaan (*ground-level*) vs sudut udara (*aerial UAV top-down*), masalah oklusi pelepah (*frond occlusion*), variasi skala, dan rekomendasi fine-tuning.

---

## 📁 Struktur Folder Proyek

```
code/
├── backend/                  # Backend ElysiaJS + Bun
│   ├── src/
│   │   └── index.ts          # REST API & WebSocket Server (Bridge Stream ↔ Inference ↔ Viewers)
│   ├── package.json
│   ├── tsconfig.json
│   └── test_api.ts           # Script pengujian API backend
│
├── frontend/                 # Frontend React + Vite + TypeScript
│   ├── src/
│   │   ├── components/       # VideoStream, DetectionPanel, DetectionHistory, StatsCards, StatusBar, UAVSimulator
│   │   ├── hooks/            # useUAVStream (WebSocket client, history tracking & auto-reconnect)
│   │   ├── utils/            # labels.ts (definisi kelas sawit & pemetaan warna)
│   │   ├── App.tsx           # Layout utama dashboard
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
│
└── inference/                # Python Inference Service
    ├── main.py               # FastAPI + WebSocket inference service (YOLOv11n)
    ├── oil_palm_fruit_yolov11n.pt # Bobot model YOLO terlatih
    ├── requirements.txt      # Dependensi Python
    ├── test_images/          # Sampel citra buah sawit untuk pengujian
    ├── test_model.py         # Skrip pengujian deteksi model pada gambar/video
    ├── test_integration.py   # Skrip pengujian integrasi otomatis Python ↔ API
    └── uav_simulator.py      # Simulator CLI pengiriman frame UAV/video/webcam ke backend
    ├── test_uav_simulation.py# Skrip pengujian streaming UAV & evaluasi domain gap
    ├── generate_uav_test_video.py # Generator video simulasi penerbangan UAV
    └── results_step5.md      # Laporan pengujian performa stream & analisis domain gap
```

---

## 🚀 Panduan Menjalankan Sistem

### 1. Menjalankan Python Inference Service
Pastikan Python 3.9+ telah terpasang:
```bash
cd inference

# Buat dan aktifkan virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
# source .venv/bin/activate

# Install dependensi
pip install -r requirements.txt

# Jalankan inference service (port 8000)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
- Health Check: `http://localhost:8000/health`
- Stats & Metrik: `http://localhost:8000/stats`
- WebSocket: `ws://localhost:8000/ws/inference`

### 2. Menjalankan Backend ElysiaJS
Buka terminal baru:
```bash
cd backend

# Install dependensi
bun install

# Jalankan server pengembangan (port 3000)
bun run dev
```
- REST API Health: `http://localhost:3000/api/health`
- REST API Latest: `http://localhost:3000/api/detection/latest`
- REST API Stats: `http://localhost:3000/api/stats`

### 3. Menjalankan Frontend React
Buka terminal baru:
```bash
cd frontend

# Install dependensi
bun install

# Jalankan dev server
bun run dev
```
Buka browser pada: **`http://localhost:5173`**

### 4. Mengirim Stream Video UAV (Uji Coba)

Terdapat 2 opsi untuk mengirim feed video ke sistem:

**Opsi A: Melalui Browser UI (Paling Mudah)**
1. Buka dashboard di `http://localhost:5173`.
2. Centang checkbox **Simulator (webcam)** di sudut kanan atas.
3. Klik **Mulai Stream Webcam** atau **Gunakan Pola Uji**.

**Opsi B: Melalui Script Simulator CLI**
```bash
cd inference
.venv\Scripts\activate

# Menggunakan pola uji sintetis (tanpa kamera):
python uav_simulator.py --source test --fps 15

# Atau menggunakan webcam laptop/PC:
python uav_simulator.py --source 0 --fps 15

# Atau menggunakan file video rekaman:
python uav_simulator.py --source test_videos/uav_sawit_flight.mp4 --fps 15

# Menggunakan mode penerbangan UAV sintetis (otomatis mengolah citra sawit):
python uav_simulator.py --source sim --fps 15

# Atau membuat ulang video simulasi penerbangan:
python generate_uav_test_video.py
```

---

## 🧪 Menjalankan Pengujian

### 1. Uji Integrasi Python ↔ Backend (End-to-End)
Pastikan service Python dan Backend sedang berjalan:
```bash
cd inference
python test_integration.py
```
*Menguji REST health & stats, WebSocket inferensi, pengiriman frame citra sawit, serta verifikasi siaran deteksi ke viewer.*

### 2. Uji API Backend
```bash
cd backend
bun test_api.ts
```

### 3. Uji Model YOLO Secara Terpisah
```bash
cd inference
python test_model.py
```

### 4. Uji Simulasi Aliran Video UAV & Analisis Domain Gap (Step 5)
```bash
cd inference
# Evaluasi domain gap offline (perbandingan ground-level vs aerial UAV):
python test_uav_simulation.py --domain-gap-only

# Atau jalankan uji streaming end-to-end 15 FPS (pastikan Backend dan Python aktif):
python test_uav_simulation.py --duration 10 --fps 15
```
*Laporan hasil pengujian dan analisis lengkap tersedia di [`inference/results_step5.md`](file:///e:/Kuliah/Capstone/code/inference/results_step5.md).*
