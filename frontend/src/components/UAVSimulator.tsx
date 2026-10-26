/**
 * UAVSimulator
 *
 * Komponen opsional untuk keperluan testing lokal:
 * Mengakses webcam/kamera laptop, mengirim frame ke backend via /ws/stream
 * dengan rate yang bisa dikonfigurasi.
 *
 * Catatan: Di produksi, UAV yang mengirim frame langsung.
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

  const sendFrame = useCallback(() => {
    const ws = wsRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !video || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

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
  }, []);

  const startStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      connectWs();
      setActive(true);
    } catch (err) {
      console.error("Gagal mengakses kamera:", err);
      alert("Tidak bisa mengakses kamera. Pastikan izin diberikan.");
    }
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
      <h4 className={styles.heading}>📷 Simulator UAV (Webcam)</h4>
      <video ref={videoRef} className={styles.video} muted playsInline />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      <div className={styles.controls}>
        {!active ? (
          <button className={styles.btnGreen} onClick={startStream}>
            Mulai Stream
          </button>
        ) : (
          <button className={styles.btnRed} onClick={stopStream}>
            Stop Stream
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

