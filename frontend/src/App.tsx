/**
 * App.tsx – Dashboard Monitoring Drone & Deteksi Tandan Buah Sawit (TBS)
 * Reconstructed with Precision AgriTech Green & White Design System
 */

import { useState } from "react";
import { DetectionHistory } from "./components/DetectionHistory";
import { DetectionPanel } from "./components/DetectionPanel";
import { HarvestDashboard } from "./components/HarvestDashboard";
import { StatsCards } from "./components/StatsCards";
import { StatusBar } from "./components/StatusBar";
import { UAVSimulator } from "./components/UAVSimulator";
import { VideoStream } from "./components/VideoStream";
import { PalmTreeIcon, LayersIcon, CameraIcon } from "./components/icons";
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
      {/* Precision AgriTech Navbar */}
      <header className="header" role="banner">
        <div className="headerBrand">
          <div className="brandIconWrapper" aria-hidden="true">
            <PalmTreeIcon size={24} />
          </div>
          <div className="brandText">
            <div className="brandHeading">
              <h1>AgroPalm Vision</h1>
              <span className="brandVersion">Smart Farming v1.0</span>
            </div>
            <p className="headerSubtitle">
              Sistem Monitoring Drone & Deteksi Tandan Buah Sawit (TBS) Real-Time · Member 3
            </p>
          </div>
        </div>

        <div className="headerControls" role="toolbar" aria-label="Kontrol Dashboard">
          {/* Toggle: Overlay Bounding Box */}
          <label className="toggleSwitch" title="Tampilkan atau sembunyikan bounding box deteksi pada video">
            <input
              type="checkbox"
              checked={showOverlay}
              onChange={(e) => setShowOverlay(e.target.checked)}
            />
            <span className="switchTrack" aria-hidden="true">
              <span className="switchKnob" />
            </span>
            <span className="toggleLabel">
              <LayersIcon size={16} aria-hidden="true" />
              <span>Overlay Deteksi</span>
            </span>
          </label>

          {/* Toggle: Simulator Kamera Webcam */}
          <label className="toggleSwitch" title="Buka panel simulator webcam untuk menguji pengiriman stream">
            <input
              type="checkbox"
              checked={showSimulator}
              onChange={(e) => setShowSimulator(e.target.checked)}
            />
            <span className="switchTrack" aria-hidden="true">
              <span className="switchKnob" />
            </span>
            <span className="toggleLabel">
              <CameraIcon size={16} aria-hidden="true" />
              <span>Simulator Kamera</span>
            </span>
          </label>
        </div>
      </header>

      {/* Baris Status Koneksi & Telemetri Drone */}
      <StatusBar status={status} stats={stats} onReconnect={connect} />

      {/* 4 Kartu Ringkasan Metrik Operasional */}
      <StatsCards stats={stats} />

      {/* Dashboard Kesiapan Panen Stakeholder (5 Kelas CBAM) */}
      <HarvestDashboard liveDetectionCount={stats.detectionCount} />

      {/* Area Utama: Video Stream & Panel Analisis Agronomi */}
      <main className="main" role="main">
        <section className="videoSection" aria-label="Feed Kamera Optik Drone">
          <VideoStream
            frameDataUrl={frameDataUrl}
            detections={detections}
            showOverlay={showOverlay}
          />
        </section>

        <aside className="sidebar" aria-label="Sidebar Analisis Sawit & Simulator">
          <DetectionPanel detections={detections} />
          {showSimulator && <UAVSimulator />}
        </aside>
      </main>

      {/* Riwayat Deteksi & Telemetri Misi */}
      <section className="historySection" aria-label="Tabel Riwayat Deteksi">
        <DetectionHistory history={detectionHistory} onClear={clearHistory} />
      </section>

      {/* Footer Sistem */}
      <footer className="footer" role="contentinfo">
        <div className="footerLeft">
          <span>Capstone Project · Sistem Deteksi Buah Sawit Berbasis Drone</span>
          <span className="footerDot" aria-hidden="true" />
          <span>YOLO11s-CBAM-WIoU Computer Vision Pipeline</span>
        </div>
        <div>
          <span>WebSocket Server Port: <strong>3000</strong></span>
        </div>
      </footer>
    </div>
  );
}

export default App;
