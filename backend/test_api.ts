/**
 * Test script for Step 1 - Base API verification
 */

async function runTests() {
  console.log("=== Memulai Pengujian API Step 1 ===");

  // 1. Test GET /api/health
  try {
    const resHealth = await fetch("http://localhost:3000/api/health");
    const jsonHealth = await resHealth.json();
    console.log("✅ 1. GET /api/health response:", jsonHealth);
    if (!jsonHealth.success || jsonHealth.service !== "oil-palm-detection-api" || jsonHealth.status !== "running") {
      throw new Error("Format health response tidak sesuai!");
    }
  } catch (err) {
    console.error("❌ Gagal test GET /api/health:", err);
    process.exit(1);
  }

  // 2. Test GET /api/detection/latest (initial state should be null)
  try {
    const resLatest = await fetch("http://localhost:3000/api/detection/latest");
    const jsonLatest = await resLatest.json();
    console.log("✅ 2. GET /api/detection/latest (awal/cek respons):", jsonLatest);
    if (!jsonLatest.success) {
      throw new Error("Response GET /api/detection/latest success bukan true!");
    }
  } catch (err) {
    console.error("❌ Gagal test GET /api/detection/latest awal:", err);
    process.exit(1);
  }

  // 2b. Test GET /api/session/summary (cek kontrak 5 kelas CBAM & zero-NaN guard)
  let initialSummary: any;
  try {
    const resSummary = await fetch("http://localhost:3000/api/session/summary");
    initialSummary = await resSummary.json();
    console.log("✅ 2b. GET /api/session/summary (awal):", initialSummary);

    const expectedClasses = ["Ripe", "Underripe", "Unripe", "Abnormal", "Flower"];
    for (const cls of expectedClasses) {
      if (typeof initialSummary.class_counts?.[cls] !== "number") {
        throw new Error(`class_counts.${cls} tidak ditemukan atau bukan number!`);
      }
    }
    if (
      typeof initialSummary.session_start !== "string" ||
      typeof initialSummary.total_frames !== "number" ||
      typeof initialSummary.total_detections !== "number" ||
      !Number.isFinite(initialSummary.harvest_readiness_index)
    ) {
      throw new Error("Format response /api/session/summary tidak valid atau mengandung NaN!");
    }
  } catch (err) {
    console.error("❌ Gagal test GET /api/session/summary awal:", err);
    process.exit(1);
  }

  // 3. Test WebSocket /ws/detection
  let welcomeReceived = false;
  let pongReceived = false;
  let broadcastReceived = false;

  const viewerWs = new WebSocket("ws://localhost:3000/ws/detection");

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout koneksi viewer WS")), 5000);

    viewerWs.onopen = () => {
      console.log("✅ 3a. Terhubung ke ws://localhost:3000/ws/detection");
      viewerWs.send(JSON.stringify({ type: "ping" }));
    };

    viewerWs.onmessage = (event) => {
      const msg = JSON.parse(event.data as string);
      console.log("   [Viewer WS received]:", msg.type);

      if (msg.type === "welcome") {
        welcomeReceived = true;
      }
      if (msg.type === "pong") {
        pongReceived = true;
      }
      if (msg.type === "detection_result") {
        broadcastReceived = true;
        console.log("✅ 3d. Menerima broadcast detection_result di viewer:", msg);
        resolve();
      }

      if (welcomeReceived && pongReceived && !broadcastReceived) {
        console.log("✅ 3b. Welcome received & 3c. Pong received");
        // Lanjut ke test 4: kirim data lewat ws/inference
        sendInferenceData();
      }
    };

    viewerWs.onerror = (err) => {
      clearTimeout(timeout);
      reject(err);
    };

    function sendInferenceData() {
      const inferWs = new WebSocket("ws://localhost:3000/ws/inference");
      inferWs.onopen = () => {
        console.log("✅ 4a. Terhubung ke ws://localhost:3000/ws/inference");
        const payload = {
          frame_id: "test-uav-frame-001",
          detections: [
            {
              label: "Ripe",
              confidence: 0.94,
              x: 150,
              y: 80,
              w: 100,
              h: 100,
            },
            {
              label: "Underripe",
              confidence: 0.87,
              x: 280,
              y: 120,
              w: 95,
              h: 95,
            },
            {
              label: "Flower",
              confidence: 0.81,
              x: 410,
              y: 210,
              w: 70,
              h: 70,
            },
          ],
          latency_ms: 15.2,
          fps: 18.5,
          timestamp: Date.now() / 1000,
        };
        console.log("   Mengirim payload inferensi uji (dengan fps & latency)...");
        inferWs.send(JSON.stringify(payload));
      };
      inferWs.onmessage = (ev) => {
        console.log("   [Inference WS response]:", ev.data);
      };
    }
  });

  // 5. Test GET /api/detection/latest (setelah data dikirim)
  try {
    const resLatestUpdated = await fetch("http://localhost:3000/api/detection/latest");
    const jsonLatestUpdated = await resLatestUpdated.json();
    console.log("✅ 5. GET /api/detection/latest (setelah update):", jsonLatestUpdated);
    if (!jsonLatestUpdated.success || !jsonLatestUpdated.data || jsonLatestUpdated.data.frame_id !== "test-uav-frame-001") {
      throw new Error("Data deteksi terbaru tidak sesuai yang dikirim!");
    }
    if (jsonLatestUpdated.data.fps !== 18.5) {
      throw new Error("Field fps pada detection terbaru tidak tersimpan dengan benar!");
    }
  } catch (err) {
    console.error("❌ Gagal verifikasi deteksi terbaru:", err);
    process.exit(1);
  }

  // 6. Test GET /api/stats
  try {
    const resStats = await fetch("http://localhost:3000/api/stats");
    const jsonStats = await resStats.json();
    console.log("✅ 6. GET /api/stats response:", jsonStats);
    if (typeof jsonStats.inference_connected !== "boolean") {
      throw new Error("inference_connected tidak ditemukan di /api/stats");
    }
  } catch (err) {
    console.error("❌ Gagal verifikasi /api/stats:", err);
    process.exit(1);
  }

  // 7. Test GET /api/session/summary (setelah update 5 kelas CBAM)
  try {
    const resSummary = await fetch("http://localhost:3000/api/session/summary");
    const jsonSummary = await resSummary.json();
    console.log("✅ 7. GET /api/session/summary (setelah update):", jsonSummary);

    if (jsonSummary.total_frames < initialSummary.total_frames + 1) {
      throw new Error("total_frames di /api/session/summary tidak bertambah!");
    }
    if (jsonSummary.total_detections < initialSummary.total_detections + 3) {
      throw new Error("total_detections di /api/session/summary tidak bertambah sesuai payload!");
    }
    if (
      jsonSummary.class_counts.Ripe !== initialSummary.class_counts.Ripe + 1 ||
      jsonSummary.class_counts.Underripe !== initialSummary.class_counts.Underripe + 1 ||
      jsonSummary.class_counts.Flower !== initialSummary.class_counts.Flower + 1
    ) {
      throw new Error("Agregasi class_counts CBAM tidak sesuai!");
    }
    if (
      typeof jsonSummary.harvest_readiness_index !== "number" ||
      !Number.isFinite(jsonSummary.harvest_readiness_index) ||
      jsonSummary.harvest_readiness_index < 0 ||
      jsonSummary.harvest_readiness_index > 100
    ) {
      throw new Error("harvest_readiness_index di luar rentang valid 0..100!");
    }
  } catch (err) {
    console.error("❌ Gagal verifikasi /api/session/summary setelah update:", err);
    process.exit(1);
  }

  viewerWs.close();
  console.log("\n🎉 SEMUA PENGUJIAN INTEGRASI BERHASIL (100% LULUS) 🎉");
  process.exit(0);
}

runTests();

