/**
 * Backend – ElysiaJS + Bun
 * ========================
 * Arsitektur:
 *   [UAV/Webcam] → [Frontend WS /ws/stream] → [Elysia]
 *                                                ├── broadcast frame ke semua viewer WS /ws/detection
 *                                                └── kirim frame ke Python inference via WS /ws/inference
 *                                                      └── hasil deteksi → broadcast ke /ws/detection
 *
 * WebSocket endpoints:
 *   /ws/stream     – UAV / sumber video mengirim frame JPEG (base64)
 *   /ws/detection  – Frontend React berlangganan hasil deteksi & frame
 *   /ws/view       – Alias untuk /ws/detection (backward compatibility)
 *   /ws/inference  – Inbound WebSocket untuk menerima hasil deteksi dari Python
 *
 * REST endpoints:
 *   GET /api/health            – Status API & koneksi ke Python inference
 *   GET /api/detection/latest  – Mengambil data deteksi terbaru
 *   GET /api/stats             – Metrik performa dan statistik frame
 */

import { Elysia, t } from "elysia";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface DetectionItem {
  label: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DetectionPayload {
  frame_id: string;
  detections: DetectionItem[];
  latency_ms: number;
  fps?: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Konstanta
// ---------------------------------------------------------------------------
const INFERENCE_WS_URL = process.env.INFERENCE_WS_URL ?? "ws://localhost:8000/ws/inference";
const BACKEND_PORT = Number(process.env.PORT ?? 3000);
const BACKEND_HOST = process.env.HOST ?? "0.0.0.0";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const viewerSockets = new Set<ReturnType<typeof Elysia.prototype.ws>["data"] extends never ? never : any>();

let frameCount = 0;
let detectionCount = 0;
let lastFrameTimestamp = 0;

// Menyimpan hasil deteksi terakhir untuk endpoint GET /api/detection/latest
let latestDetection: DetectionPayload | null = null;

// ---------------------------------------------------------------------------
// Inference WebSocket client (backend → Python)
// ---------------------------------------------------------------------------
let inferenceWs: WebSocket | null = null;
let inferenceReady = false;

/** Antrian callback frame_id → resolver, supaya response bisa di-match */
const pendingFrames = new Map<string, (result: object) => void>();

function connectToInference() {
  console.log(`[inference] Menghubungkan ke ${INFERENCE_WS_URL} ...`);
  try {
    inferenceWs = new WebSocket(INFERENCE_WS_URL);

    inferenceWs.onopen = () => {
      inferenceReady = true;
      console.log("[inference] Terhubung ke Python inference service.");
    };

    inferenceWs.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as {
          frame_id: string;
          detections: DetectionItem[];
          latency_ms: number;
          fps?: number;
          timestamp: number;
          error?: string;
        };

        if (data.error) {
          console.warn("[inference] Error dari Python:", data.error);
          return;
        }

        detectionCount += data.detections?.length ?? 0;

        // Simpan sebagai deteksi terbaru
        latestDetection = {
          frame_id: data.frame_id,
          detections: data.detections ?? [],
          latency_ms: data.latency_ms ?? 0,
          fps: data.fps,
          timestamp: data.timestamp ?? Date.now() / 1000,
        };

        // Resolve pending promise jika ada
        const resolve = pendingFrames.get(data.frame_id);
        if (resolve) {
          resolve(data);
          pendingFrames.delete(data.frame_id);
        }

        // Broadcast hasil deteksi ke semua viewer
        broadcastToViewers({
          type: "detection_result",
          frame_id: data.frame_id,
          detections: data.detections,
          latency_ms: data.latency_ms,
          fps: data.fps,
          timestamp: data.timestamp,
        });
      } catch (err) {
        console.error("[inference] Gagal parse response:", err);
      }
    };

    inferenceWs.onerror = (err) => {
      console.error("[inference] WebSocket error:", err);
    };

    inferenceWs.onclose = () => {
      inferenceReady = false;
      console.warn("[inference] Koneksi putus. Reconnect dalam 3 detik...");
      setTimeout(connectToInference, 3000);
    };
  } catch (err) {
    console.error("[inference] Gagal inisiasi koneksi:", err);
    setTimeout(connectToInference, 3000);
  }
}

async function sendFrameToInference(frameB64: string, frameId: string): Promise<void> {
  if (!inferenceWs || !inferenceReady) return;
  inferenceWs.send(JSON.stringify({ frame: frameB64, frame_id: frameId }));
}

// ---------------------------------------------------------------------------
// Broadcast helper
// ---------------------------------------------------------------------------
function broadcastToViewers(message: object) {
  const payload = JSON.stringify(message);
  for (const ws of viewerSockets) {
    try {
      ws.send(payload);
    } catch {
      viewerSockets.delete(ws);
    }
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = new Elysia()

  // --- Health check ---
  .get("/api/health", () => ({
    success: true,
    service: "oil-palm-detection-api",
    status: "running",
    inference_connected: inferenceReady,
    timestamp: Date.now(),
  }))

  // --- Deteksi terakhir ---
  .get("/api/detection/latest", () => ({
    success: true,
    data: latestDetection,
  }))

  // --- Stats ---
  .get("/api/stats", () => ({
    frame_count: frameCount,
    detection_count: detectionCount,
    viewer_count: viewerSockets.size,
    inference_connected: inferenceReady,
    last_frame_ms: lastFrameTimestamp,
  }))

  // -----------------------------------------------------------------------
  // WS /ws/stream  – sumber video (UAV simulator / browser MediaStream)
  // Mengirim: { type: "frame", data: "<base64 JPEG>", frame_id?: string }
  // -----------------------------------------------------------------------
  .ws("/ws/stream", {
    body: t.Object({
      type: t.String(),
      data: t.Optional(t.String()),        // base64 JPEG
      frame_id: t.Optional(t.String()),
    }),
    open(ws) {
      console.log("[stream] Sumber video terhubung.");
      broadcastToViewers({ type: "stream_started", timestamp: Date.now() });
    },
    async message(ws, message) {
      if (message.type !== "frame" || !message.data) return;

      frameCount++;
      lastFrameTimestamp = Date.now();

      const frameId = message.frame_id ?? `f-${frameCount}-${Date.now()}`;

      // Teruskan frame mentah ke semua viewer (untuk ditampilkan di <img> atau canvas)
      broadcastToViewers({
        type: "frame",
        frame_id: frameId,
        data: message.data,
        timestamp: lastFrameTimestamp,
        frame_number: frameCount,
      });

      // Kirim ke inference service (non-blocking)
      await sendFrameToInference(message.data, frameId);
    },
    close(ws) {
      console.log("[stream] Sumber video terputus.");
      broadcastToViewers({ type: "stream_stopped", timestamp: Date.now() });
    },
  })

  // -----------------------------------------------------------------------
  // WS /ws/detection – frontend React (viewer & deteksi)
  // -----------------------------------------------------------------------
  .ws("/ws/detection", {
    open(ws) {
      viewerSockets.add(ws);
      console.log(`[detection] Viewer terhubung. Total: ${viewerSockets.size}`);
      ws.send(JSON.stringify({
        type: "welcome",
        message: "Terhubung ke UAV detection server",
        frame_count: frameCount,
        inference_connected: inferenceReady,
      }));
    },
    message(ws, message) {
      // Viewer bisa mengirim ping atau message kontrol
      ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
    },
    close(ws) {
      viewerSockets.delete(ws);
      console.log(`[detection] Viewer terputus. Total: ${viewerSockets.size}`);
    },
  })

  // -----------------------------------------------------------------------
  // WS /ws/view – alias backward compatibility untuk frontend
  // -----------------------------------------------------------------------
  .ws("/ws/view", {
    open(ws) {
      viewerSockets.add(ws);
      ws.send(JSON.stringify({
        type: "welcome",
        message: "Terhubung ke UAV detection server",
        frame_count: frameCount,
        inference_connected: inferenceReady,
      }));
    },
    message(ws, message) {
      ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
    },
    close(ws) {
      viewerSockets.delete(ws);
    },
  })

  // -----------------------------------------------------------------------
  // WS /ws/inference – inbound WS untuk menerima data dari Python langsung
  // -----------------------------------------------------------------------
  .ws("/ws/inference", {
    open(ws) {
      console.log("[ws/inference] Inbound inference client terhubung.");
      ws.send(JSON.stringify({
        type: "welcome",
        service: "oil-palm-detection-api",
        status: "ready",
      }));
    },
    message(ws, rawMessage: any) {
      try {
        const payload = typeof rawMessage === "string" ? JSON.parse(rawMessage) : rawMessage;

        if (payload.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
          return;
        }

        if (payload.detections && Array.isArray(payload.detections)) {
          detectionCount += payload.detections.length;
          latestDetection = {
            frame_id: payload.frame_id ?? `inbound-${Date.now()}`,
            detections: payload.detections,
            latency_ms: payload.latency_ms ?? 0,
            fps: payload.fps,
            timestamp: payload.timestamp ?? Date.now() / 1000,
          };

          // Broadcast hasil deteksi ke semua viewer frontend
          broadcastToViewers({
            type: "detection_result",
            frame_id: latestDetection.frame_id,
            detections: latestDetection.detections,
            latency_ms: latestDetection.latency_ms,
            fps: latestDetection.fps,
            timestamp: latestDetection.timestamp,
          });

          ws.send(JSON.stringify({
            success: true,
            frame_id: latestDetection.frame_id,
          }));
        }
      } catch (err) {
        console.error("[ws/inference] Error parsing pesan:", err);
      }
    },
    close(ws) {
      console.log("[ws/inference] Inbound inference client terputus.");
    },
  })

  .listen({ port: BACKEND_PORT, hostname: BACKEND_HOST });

// ---------------------------------------------------------------------------
// Sambungkan ke Python inference service
// ---------------------------------------------------------------------------
connectToInference();

console.log(
  `\n🚀 Elysia berjalan di http://${app.server?.hostname}:${app.server?.port}`,
);
console.log(`   Akses LAN/Mobile : http://<IP-LAN>:${BACKEND_PORT}`);
console.log("   REST API Health  : http://localhost:3000/api/health");
console.log("   REST API Latest  : http://localhost:3000/api/detection/latest");
console.log("   WS sumber video  : ws://localhost:3000/ws/stream");
console.log("   WS deteksi ke FE : ws://localhost:3000/ws/detection");
console.log("   WS inbound infer : ws://localhost:3000/ws/inference");
console.log("   WS outbound svc  : " + INFERENCE_WS_URL + "\n");
