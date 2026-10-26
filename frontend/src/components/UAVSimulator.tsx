/**
 * UAVSimulator
 *
 * Komponen untuk keperluan testing lokal / simulasi UAV langsung dari browser:
 * 1. Mode Kamera: Mengakses webcam laptop / kamera HP (memerlukan izin / HTTPS)
 * 2. Mode Pola Uji Sintetis: Menggunakan kanvas virtual dengan telemetry UAV (100% jalan di semua browser/HP tanpa izin kamera)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./UAVSimulator.module.css";

function getStreamWsUrl(): string {
  if (typeof window === "undefined") {
    return "ws://localhost:3000/ws/stream";
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    return `${protocol}//${window.location.host}/ws/stream`;
  }

  if (import.meta.env.VITE_STREAM_WS_URL) {
    return import.meta.env.VITE_STREAM_WS_URL;
  }

  if (window.location.host) {
    return `${protocol}//${window.location.host}/ws/stream`;
  }
  return `${protocol}//${window.location.hostname}:3000/ws/stream`;
}

const DEFAULT_FPS = 10;
const JPEG_QUALITY = 0.7;

export function UAVSimulator() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [active, setActive] = useState(false);
  const [streamMode, setStreamMode] = useState<"camera" | "synthetic">("synthetic");
  const [wsStatus, setWsStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [fps, setFps] = useState(DEFAULT_FPS);
  const [frameCounter, setFrameCounter] = useState(0);

  const connectWs = useCallback(() => {
    setWsStatus("connecting");
    const ws = new WebSocket(getStreamWsUrl());
    wsRef.current = ws;
    ws.onopen = () => setWsStatus("connected");
    ws.onclose = () => setWsStatus("disconnected");
    ws.onerror = () => setWsStatus("disconnected");
  }, []);

  const drawSyntheticFrame = useCallback((frameNo: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 640;
    canvas.height = 480;

    // Background gradient kelapa sawit / UAV view
    const hue = (frameNo * 2) % 360;
    ctx.fillStyle = `hsl(${hue}, 55%, 22%)`;
    ctx.fillRect(0, 0, 640, 480);

    // Grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    for (let x = 0; x < 640; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 480);
      ctx.stroke();
    }
    for (let y = 0; y < 480; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(640, y);
      ctx.stroke();
    }

    // UAV Reticle / Crosshair
    const cx = 320;
    const cy = 240;
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.moveTo(cx - 45, cy);
    ctx.lineTo(cx - 15, cy);
    ctx.moveTo(cx + 15, cy);
    ctx.lineTo(cx + 45, cy);
    ctx.moveTo(cx, cy - 45);
    ctx.lineTo(cx, cy - 15);
    ctx.moveTo(cx, cy + 15);
    ctx.lineTo(cx, cy + 45);
    ctx.stroke();

    // Telemetry text overlay
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px monospace";
    ctx.fillText(`UAV MOBILE STREAM #${frameNo}`, 20, 40);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "15px monospace";
    const alt = (18.0 + Math.sin(frameNo * 0.1) * 2.5).toFixed(1);
    ctx.fillText(`ALT: ${alt}m | SPD: 3.2m/s | BATT: 94%`, 20, 70);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px monospace";
    ctx.fillText(`TIME: ${new Date().toLocaleTimeString()} | FPS: ${fps}`, 20, 100);
  }, [fps]);

  const sendFrame = useCallback(() => {
    const ws = wsRef.current;
    const canvas = canvasRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !canvas) return;

    if (streamMode === "camera") {
      const video = videoRef.current;
      if (!video) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } else {
      drawSyntheticFrame(frameCounter);
    }

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          const b64 = (reader.result as string).split(",")[1];
          const frameId = `sim-${Date.now()}`;
          ws.send(JSON.stringify({ type: "frame", data: b64, frame_id: frameId }));
          setFrameCounter((n) => n + 1);
        };
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  }, [streamMode, drawSyntheticFrame, frameCounter]);

  const startCameraStream = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert(
        "Kamera tidak dapat diakses di Chrome HP karena koneksi HTTP (standar keamanan Google Chrome melarang kamera di HTTP non-localhost).\n\n" +
        "Solusi:\n" +
        "1. Gunakan tombol 'Mulai Pola Uji' di bawah (100% jalan tanpa izin kamera), ATAU\n" +
        "2. Di Chrome HP buka chrome://flags/#unsafely-treat-insecure-origin-as-secure dan masukkan alamat server ini."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStreamMode("camera");
      connectWs();
      setActive(true);
    } catch (err: unknown) {
      console.error("Gagal mengakses kamera:", err);
      const msg = err instanceof Error ? err.message : String(err);
      alert(
        `Kamera diblokir atau gagal dibuka: ${msg}\n\n` +
        "Silakan gunakan tombol 'Mulai Pola Uji' untuk simulasi UAV tanpa izin kamera."
      );
    }
  }, [connectWs]);

  const startSyntheticStream = useCallback(() => {
    setStreamMode("synthetic");
    connectWs();
    setActive(true);
  }, [connectWs]);

  const stopStream = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    wsRef.current?.close();
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setActive(false);
    setFrameCounter(0);
  }, []);

  // Kirim frame sesuai fps
  useEffect(() => {
    if (!active) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(sendFrame, 1000 / fps);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, fps, sendFrame]);

  return (
    <div className={styles.container}>
      <h4 className={styles.heading}>
        📷 Simulator UAV ({streamMode === "camera" ? "Kamera" : "Pola Uji"})
      </h4>

      {streamMode === "camera" ? (
        <video ref={videoRef} className={styles.video} muted playsInline />
      ) : (
        <canvas
          ref={canvasRef}
          className={styles.video}
          style={{ display: active ? "block" : "none" }}
        />
      )}

      {/* Hidden canvas for camera captures */}
      {streamMode === "camera" && <canvas ref={canvasRef} style={{ display: "none" }} />}

      <div className={styles.controls}>
        {!active ? (
          <>
            <button className={styles.btnGreen} onClick={startCameraStream} title="Mulai stream kamera fisik">
              📹 Mulai Kamera HP / Webcam
            </button>
            <button className={styles.btnBlue} onClick={startSyntheticStream} title="Mulai simulasi kanvas tanpa izin kamera">
              🚀 Mulai Pola Uji Sintetis
            </button>
          </>
        ) : (
          <button className={styles.btnRed} onClick={stopStream}>
            ⏹ Hentikan Stream
          </button>
        )}

        <label className={styles.fpsLabel}>
          FPS:
          <input
            type="range"
            min={1}
            max={30}
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
            className={styles.slider}
          />
          <span>{fps}</span>
        </label>

        <div className={styles.info}>
          <span>WS: <strong className={wsStatus === "connected" ? styles.green : styles.red}>{wsStatus}</strong></span>
          <span>Frames terkirim: <strong>{frameCounter}</strong></span>
        </div>
      </div>
    </div>
  );
}
