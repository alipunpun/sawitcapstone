/**
 * useUAVStream – custom hook
 *
 * Menghubungkan ke WebSocket /ws/view dan mengelola:
 *  - frame (base64 JPEG terakhir)
 *  - deteksi (bounding box terbaru)
 *  - status koneksi
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface Detection {
  label: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface Stats {
  frameCount: number;
  detectionCount: number;
  latencyMs: number | null;
  fps: number;
}

interface UseUAVStreamReturn {
  frameDataUrl: string | null;
  detections: Detection[];
  status: ConnectionStatus;
  stats: Stats;
  connect: () => void;
  disconnect: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3000/ws/view";

export function useUAVStream(): UseUAVStreamReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [frameDataUrl, setFrameDataUrl] = useState<string | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [stats, setStats] = useState<Stats>({ frameCount: 0, detectionCount: 0, latencyMs: null, fps: 0 });

  // FPS tracking
  const frameTimestamps = useRef<number[]>([]);

  const calculateFps = useCallback(() => {
    const now = Date.now();
    frameTimestamps.current = frameTimestamps.current.filter((t) => now - t < 1000);
    return frameTimestamps.current.length;
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(event.data) as Record<string, unknown>;

        if (msg.type === "frame" && typeof msg.data === "string") {
          frameTimestamps.current.push(Date.now());
          setFrameDataUrl(`data:image/jpeg;base64,${msg.data}`);
          setStats((prev) => ({
            ...prev,
            frameCount: typeof msg.frame_number === "number" ? msg.frame_number : prev.frameCount + 1,
            fps: calculateFps(),
          }));
        }

        if (msg.type === "detection_result") {
          const dets = (msg.detections as Detection[]) ?? [];
          setDetections(dets);
          setStats((prev) => ({
            ...prev,
            detectionCount: prev.detectionCount + dets.length,
            latencyMs: typeof msg.latency_ms === "number" ? msg.latency_ms : prev.latencyMs,
          }));
        }

        if (msg.type === "stream_stopped") {
          setDetections([]);
        }
      } catch {
        // ignore malformed
      }
    };

    ws.onerror = () => setStatus("error");
    ws.onclose = () => setStatus("disconnected");
  }, [calculateFps]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { frameDataUrl, detections, status, stats, connect, disconnect };
}

