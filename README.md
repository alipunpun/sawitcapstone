# UAV Oil Palm Detection (Member 3)

Proyek sistem pemantauan dan deteksi kelapa sawit secara real-time dari video live stream UAV / Drone menggunakan React + Vite, ElysiaJS + Bun, WebSocket, dan Python YOLO Inference Service.

## 📁 Struktur Proyek

```
code/
├── backend/          # ElysiaJS + Bun WebSocket & REST API
│   ├── src/
│   │   └── index.ts  # Bridge WebSocket: stream -> inference -> view
│   ├── package.json
│   └── tsconfig.json
├── frontend/         # React + Vite + TypeScript
│   ├── src/
│   │   ├── components/ # VideoStream, DetectionPanel, StatusBar, UAVSimulator
│   │   ├── hooks/      # useUAVStream WebSocket hook
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
└── inference/        # Python FastAPI + YOLO / OpenCV Inference
    ├── main.py       # WebSocket inference service
    ├── uav_simulator.py # Simulator feed video UAV
    ├── requirements.txt
    └── oil_palm_fruit_yolov11n.pt # Model weights
```

## 🚀 Panduan Menjalankan

### 1. Python Inference Service
```bash
cd inference
python -m venv .venv
# Windows
.venv\Scripts\activate
# Linux/macOS
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. ElysiaJS Backend
```bash
cd backend
bun install
bun run dev
```
Backend berjalan di `http://localhost:3000`.

### 3. React Frontend
```bash
cd frontend
bun install
bun run dev
```
Buka `http://localhost:5173` di browser.

### 4. Simulator UAV (Opsional untuk Testing)
Jalankan simulator UAV via script Python:
```bash
cd inference
python uav_simulator.py --source test --fps 10
# atau menggunakan webcam:
python uav_simulator.py --source 0 --fps 15
```
Atau aktifkan **Simulator (webcam)** langsung dari UI frontend.
