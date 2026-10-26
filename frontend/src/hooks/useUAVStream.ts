/**
 * useUAVStream – custom hook
 *
 * Menghubungkan ke WebSocket /ws/detection dan mengelola:
 *  - frame (base64 JPEG terakhir)
 *  - deteksi (bounding box terbaru)
 *  - riwayat deteksi (50 frame terakhir)
 *  - status koneksi & auto-reconnect
 *  - statistik performa (FPS, latency, frame count)
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

export interface DetectionRecord {
  frame_id: string;
  detections: Detection[];
  latency_ms: number;
  fps: number;
  timestamp: number;
  received_at: number; // Date.now() saat diterima browser
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
  detectionHistory: DetectionRecord[];
  clearHistory: () => void;
  status: ConnectionStatus;
  stats: Stats;
  connect: () => void;
  disconnect: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
function getWebSocketUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  const hostname =
    typeof window !== "undefined" && window.location.hostname
      ? window.location.hostname
      : "localhost";
  const protocol =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "wss:"
      : "ws:";
  return `${protocol}//${hostname}:3000/ws/detection`;
}
const MAX_HISTORY = 50;

export function useUAVStream(): UseUAVStreamReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const connectRef = useRef<() => void>(() => {});

  const [frameDataUrl, setFrameDataUrl] = useState<string | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [detectionHistory, setDetectionHistory] = useState<DetectionRecord[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [stats, setStats] = useState<Stats>({
    frameCount: 0,
    detectionCount: 0,
    latencyMs: null,
    fps: 0,
  });

  // FPS tracking (client-side frame rendering fallback)
  const frameTimestamps = useRef<number[]>([]);

  const calculateFps = useCallback(() => {
    const now = Date.now();
    frameTimestamps.current = frameTimestamps.current.filter((t) => now - t < 1000);
    return frameTimestamps.current.length;
  }, []);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    clearReconnectTimeout();
    if (!isMountedRef.current) return;

    reconnectTimeoutRef.current = setTimeout(() => {
      if (
        isMountedRef.current &&
        (!wsRef.current ||
          wsRef.current.readyState === WebSocket.CLOSED ||
          wsRef.current.readyState === WebSocket.CLOSING)
      ) {
        connectRef.current();
      }
    }, 3000);
  }, [clearReconnectTimeout]);

  const connect = useCallback(() => {
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    clearReconnectTimeout();
    setStatus("connecting");

    try {
      const ws = new WebSocket(getWebSocketUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) return;
        setStatus("connected");
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        if (!isMountedRef.current) return;
        try {
          const msg = JSON.parse(event.data) as Record<string, unknown>;

          if (msg.type === "frame" && typeof msg.data === "string") {
            frameTimestamps.current.push(Date.now());
            setFrameDataUrl(`data:image/jpeg;base64,${msg.data}`);
            setStats((prev) => ({
              ...prev,
              frameCount:
                typeof msg.frame_number === "number" ? msg.frame_number : prev.frameCount + 1,
              fps: calculateFps(),
            }));
          }

          if (msg.type === "detection_result") {
            const dets = (msg.detections as Detection[]) ?? [];
            const latency = typeof msg.latency_ms === "number" ? msg.latency_ms : 0;
            const currentFps = typeof msg.fps === "number" && msg.fps > 0 ? msg.fps : 0;
            const frameId =
              typeof msg.frame_id === "string" ? msg.frame_id : `f-${Date.now()}`;
            const timestamp =
              typeof msg.timestamp === "number" ? msg.timestamp : Date.now() / 1000;

            setDetections(dets);
            setStats((prev) => ({
              ...prev,
              detectionCount: prev.detectionCount + dets.length,
              latencyMs: typeof msg.latency_ms === "number" ? msg.latency_ms : prev.latencyMs,
              fps: currentFps > 0 ? currentFps : prev.fps,
            }));

            const record: DetectionRecord = {
              frame_id: frameId,
              detections: dets,
              latency_ms: latency,
              fps: currentFps,
              timestamp: timestamp,
              received_at: Date.now(),
            };

            setDetectionHistory((prev) => [record, ...prev].slice(0, MAX_HISTORY));
          }

          if (msg.type === "stream_stopped") {
            setDetections([]);
          }
        } catch {
          // ignore malformed
        }
      };

      ws.onerror = () => {
        if (!isMountedRef.current) return;
        setStatus("error");
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        setStatus("disconnected");
        scheduleReconnect();
      };
    } catch {
      setStatus("error");
      scheduleReconnect();
    }
  }, [calculateFps, clearReconnectTimeout, scheduleReconnect]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    clearReconnectTimeout();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus("disconnected");
  }, [clearReconnectTimeout]);

  const clearHistory = useCallback(() => {
    setDetectionHistory([]);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      clearReconnectTimeout();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, clearReconnectTimeout]);

  return {
    frameDataUrl,
    detections,
    detectionHistory,
    clearHistory,
    status,
    stats,
    connect,
    disconnect,
  };
}
