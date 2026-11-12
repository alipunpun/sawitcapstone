/**
 * UAVSimulator – Testing Tool Pengiriman Frame Webcam ke Backend
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraIcon, PlayIcon, SquareIcon } from "./icons";
import styles from "./UAVSimulator.module.css";

const STREAM_WS_URL = import.meta.env.VITE_STREAM_WS_URL ?? "ws://localhost:3000/ws/stream";
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
    const ws = new WebSocket(STREAM_WS_URL);
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
      alert("Tidak bisa mengakses kamera. Pastikan izin kamera diberikan di browser.");
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

  // Kirim frame sesuai interval FPS
  useEffect(() => {
    if (!active) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(sendFrame, 1000 / fps);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, fps, sendFrame]);

  // Cleanup saat unmount
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  return (
    <div className={styles.container} role="region" aria-label="UAV Video Camera Simulator">
      <div className={styles.header}>
        <div className={styles.headingGroup}>
          <CameraIcon size={16} style={{ color: "#38bdf8" }} aria-hidden="true" />
          <h4 className={styles.heading}>UAV Video Simulator</h4>
        </div>
      </div>

      <div className={styles.videoWrapper}>
        {active ? (
          <video ref={videoRef} className={styles.video} muted playsInline autoPlay />
        ) : (
          <div className={styles.inactiveVideo}>
            <CameraIcon size={24} />
            <span>Kamera Simulator Nonaktif</span>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />

      <div className={styles.controls}>
        {!active ? (
          <button className={`${styles.btnAction} ${styles.btnStart}`} onClick={startStream}>
            <PlayIcon size={14} />
            Mulai Stream Webcam
          </button>
        ) : (
          <button className={`${styles.btnAction} ${styles.btnStop}`} onClick={stopStream}>
            <SquareIcon size={14} />
            Hentikan Stream
          </button>
        )}

        <div className={styles.fpsControl}>
          <div className={styles.fpsLabel}>
            <span>Tingkat Frame (FPS):</span>
            <span className={styles.fpsValue}>{fps} FPS</span>
          </div>
          <input
            type="range"
            min="1"
            max="30"
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
            className={styles.slider}
            aria-label="Frame rate slider"
          />
        </div>

        <div className={styles.infoBar}>
          <div className={styles.infoItem}>
            Status:{" "}
            <span
              className={
                wsStatus === "connected" ? styles.statusConnected : styles.statusDisconnected
              }
            >
              {wsStatus}
            </span>
          </div>
          <div className={styles.infoItem}>
            Terkirim: <strong>{frameCounter}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
