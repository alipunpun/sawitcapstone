/**
 * App.tsx – Halaman utama monitoring UAV Oil Palm Detection
 */

import { useState } from "react";
import { DetectionPanel } from "./components/DetectionPanel";
import { StatusBar } from "./components/StatusBar";
import { UAVSimulator } from "./components/UAVSimulator";
import { VideoStream } from "./components/VideoStream";
import { useUAVStream } from "./hooks/useUAVStream";
import "./App.css";

function App() {
  const { frameDataUrl, detections, status, stats, connect } = useUAVStream();
  const [showOverlay, setShowOverlay] = useState(true);
  const [showSimulator, setShowSimulator] = useState(false);

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <h1>🌴 UAV Oil Palm Detection</h1>
        <div className="header-controls">
          <label className="toggle">
            <input
              type="checkbox"
              checked={showOverlay}
              onChange={(e) => setShowOverlay(e.target.checked)}
            />
            Overlay deteksi
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showSimulator}
              onChange={(e) => setShowSimulator(e.target.checked)}
            />
            Simulator (webcam)
          </label>
        </div>
      </header>

      {/* Status Bar */}
      <StatusBar status={status} stats={stats} onReconnect={connect} />

      {/* Main layout */}
      <main className="main">
        {/* Video utama */}
        <section className="video-section">
          <VideoStream
            frameDataUrl={frameDataUrl}
            detections={detections}
            showOverlay={showOverlay}
          />
        </section>

        {/* Sidebar */}
        <aside className="sidebar">
          <DetectionPanel detections={detections} />
          {showSimulator && <UAVSimulator />}
        </aside>
      </main>
    </div>
  );
}

export default App;
