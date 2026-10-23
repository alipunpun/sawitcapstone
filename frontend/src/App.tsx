/**
 * App.tsx – Dashboard Utama Monitoring UAV Oil Palm Detection
 */

import { useState } from "react";
import { DetectionHistory } from "./components/DetectionHistory";
import { DetectionPanel } from "./components/DetectionPanel";
import { StatsCards } from "./components/StatsCards";
import { StatusBar } from "./components/StatusBar";
import { UAVSimulator } from "./components/UAVSimulator";
import { VideoStream } from "./components/VideoStream";
import { useUAVStream } from "./hooks/useUAVStream";
import "./App.css";

function App() {
  const {
    frameDataUrl,
    detections,
    detectionHistory,
    clearHistory,
    status,
    stats,
    connect,
  } = useUAVStream();

  const [showOverlay, setShowOverlay] = useState(true);
  const [showSimulator, setShowSimulator] = useState(false);

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-brand">
          <h1>🌴 UAV Oil Palm Detection</h1>
          <p className="header-subtitle">
            Sistem Pemantauan & Deteksi Tandan Buah Sawit Real-Time (Member 3)
          </p>
        </div>

        <div className="header-controls">
          <label className="toggle">
            <input
              type="checkbox"
              checked={showOverlay}
              onChange={(e) => setShowOverlay(e.target.checked)}
            />
            Overlay Bounding Box
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showSimulator}
              onChange={(e) => setShowSimulator(e.target.checked)}
            />
            Simulator Stream (Webcam)
          </label>
        </div>
      </header>

      {/* Status Bar */}
      <StatusBar status={status} stats={stats} onReconnect={connect} />

      {/* Kartu Ringkasan Statistik */}
      <StatsCards stats={stats} />

      {/* Area Utama: Video Stream & Sidebar Deteksi */}
      <main className="main">
        <section className="video-section">
          <VideoStream
            frameDataUrl={frameDataUrl}
            detections={detections}
            showOverlay={showOverlay}
          />
        </section>

        <aside className="sidebar">
          <DetectionPanel detections={detections} />
          {showSimulator && <UAVSimulator />}
        </aside>
      </main>

      {/* Tabel Riwayat Deteksi Terbaru */}
      <section className="history-section">
        <DetectionHistory
          history={detectionHistory}
          onClear={clearHistory}
        />
      </section>
    </div>
  );
}

export default App;
