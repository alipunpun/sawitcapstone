/**
 * Backend – ElysiaJS + Bun
 * ========================
 * Arsitektur:
 *   [UAV/Webcam] → [Frontend WS /ws/stream] → [Elysia]
 *                                                ├── broadcast frame ke semua viewer WS /ws/view
 *                                                └── kirim frame ke Python inference via WS /ws/infer
 *                                                      └── hasil deteksi → broadcast ke /ws/view
 *
 * WebSocket endpoints:
 *   /ws/stream   – UAV / sumber video mengirim frame JPEG (base64)
 *   /ws/view     – Frontend React berlangganan frame + deteksi
 *
 * REST endpoints:
 *   GET /api/health
 *   GET /api/stats
 */

import { Elysia, t } from "elysia";

// ---------------------------------------------------------------------------
// Konstanta
// ---------------------------------------------------------------------------
const INFERENCE_WS_URL = process.env.INFERENCE_WS_URL ?? "ws://localhost:8000/ws/infer";
const BACKEND_PORT = Number(process.env.PORT ?? 3000);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const viewerSockets = new Set<ReturnType<typeof Elysia.prototype.ws>["data"] extends never ? never : any>();

let frameCount = 0;
let detectionCount = 0;
let lastFrameTimestamp = 0;

// ---------------------------------------------------------------------------
// Inference WebSocket client (backend → Python)
// ---------------------------------------------------------------------------
let inferenceWs: WebSocket | null = null;
let inferenceReady = false;

/** Antrian callback frame_id → resolver, supaya response bisa di-match */
const pendingFrames = new Map<string, (result: object) => void>();

function connectToInference() {
  console.log(`[inference] Menghubungkan ke ${INFERENCE_WS_URL} ...`);
  inferenceWs = new WebSocket(INFERENCE_WS_URL);

  inferenceWs.onopen = () => {
    inferenceReady = true;
    console.log("[inference] Terhubung ke Python inference service.");
  };

  inferenceWs.onmessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data as string) as {
        frame_id: string;
        detections: object[];
        latency_ms: number;
        timestamp: number;
        error?: string;
      };

      if (data.error) {
        console.warn("[inference] Error dari Python:", data.error);
        return;
      }

      detectionCount += data.detections?.length ?? 0;

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

  // --- Stats ---
  .get("/api/stats", () => ({
    frame_count: frameCount,
    detection_count: detectionCount,
    viewer_count: viewerSockets.size,
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

      // Teruskan frame mentah ke semua viewer (untuk ditampilkan di <img>)
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
  // WS /ws/view   – frontend React (viewer)
  // -----------------------------------------------------------------------
  .ws("/ws/view", {
    open(ws) {
      viewerSockets.add(ws);
      console.log(`[view] Viewer terhubung. Total: ${viewerSockets.size}`);
      ws.send(JSON.stringify({
        type: "welcome",
        message: "Terhubung ke UAV detection server",
        frame_count: frameCount,
        inference_connected: inferenceReady,
      }));
    },
    message(ws, message) {
      // Viewer bisa mengirim ping atau control message
      ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
    },
    close(ws) {
      viewerSockets.delete(ws);
      console.log(`[view] Viewer terputus. Total: ${viewerSockets.size}`);
    },
  })

  .listen(BACKEND_PORT);

// ---------------------------------------------------------------------------
// Sambungkan ke Python inference service
// ---------------------------------------------------------------------------
connectToInference();

console.log(
  `\n🚀 Elysia berjalan di http://${app.server?.hostname}:${app.server?.port}`,
);
console.log("   WS sumber video : ws://localhost:3000/ws/stream");
console.log("   WS viewer       : ws://localhost:3000/ws/view");
console.log("   Inference svc   : " + INFERENCE_WS_URL + "\n");
