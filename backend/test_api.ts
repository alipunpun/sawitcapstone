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

  // 2b. Test GET /api/session/summary (awal - Step 8)
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

  // 8. Test Database SQLite: GET /api/session/active & GET /api/sessions (Step 9)
  let activeSessionId = "";
  try {
    const resActive = await fetch("http://localhost:3000/api/session/active");
    const jsonActive = await resActive.json();
    console.log("✅ 8a. GET /api/session/active response:", jsonActive);

    if (!jsonActive.success || !jsonActive.session?.id) {
      throw new Error("Gagal mengambil sesi aktif dari database SQLite!");
    }
    activeSessionId = jsonActive.session.id;

    const resSessions = await fetch("http://localhost:3000/api/sessions");
    const jsonSessions = await resSessions.json();
    console.log("✅ 8b. GET /api/sessions response (total sesi):", jsonSessions.count);
    if (!jsonSessions.success || !Array.isArray(jsonSessions.sessions) || jsonSessions.count < 1) {
      throw new Error("Daftar sessions dari SQLite kosong atau format tidak valid!");
    }
  } catch (err) {
    console.error("❌ Gagal verifikasi database sesi SQLite:", err);
    process.exit(1);
  }

  // 9. Test GET /api/session/:id/summary (Step 9)
  try {
    const resSessSummary = await fetch(`http://localhost:3000/api/session/${activeSessionId}/summary`);
    const jsonSessSummary = await resSessSummary.json();
    console.log("✅ 9. GET /api/session/:id/summary response:", jsonSessSummary);

    if (!jsonSessSummary.success || jsonSessSummary.session.id !== activeSessionId) {
      throw new Error("Rekapitulasi sesi spesifik dari database SQLite tidak sesuai!");
    }
    if (jsonSessSummary.detections_count < 3) {
      throw new Error("Event deteksi pada sesi SQLite kurang dari yang dikirim!");
    }
  } catch (err) {
    console.error("❌ Gagal verifikasi /api/session/:id/summary:", err);
    process.exit(1);
  }

  // 10. Test GET /api/export/:id/csv (Step 9)
  try {
    const resCsv = await fetch(`http://localhost:3000/api/export/${activeSessionId}/csv`);
    const csvText = await resCsv.text();
    console.log("✅ 10. GET /api/export/:id/csv sample line 1-2:\n" + csvText.split("\n").slice(0, 3).join("\n"));

    if (!csvText.includes("session_id") || !csvText.includes("Ripe")) {
      throw new Error("Output export CSV tidak memuat header atau data kelas!");
    }
  } catch (err) {
    console.error("❌ Gagal verifikasi export CSV:", err);
    process.exit(1);
  }

  // 11. Test GET /api/export/:id/pdf (Step 9)
  try {
    const resPdf = await fetch(`http://localhost:3000/api/export/${activeSessionId}/pdf`);
    const pdfHtml = await resPdf.text();
    console.log("✅ 11. GET /api/export/:id/pdf content-type:", resPdf.headers.get("content-type"));

    if (!pdfHtml.includes("Laporan Hasil Deteksi TBS Kelapa Sawit") || !pdfHtml.includes(activeSessionId)) {
      throw new Error("Laporan export printable HTML/PDF tidak valid!");
    }
  } catch (err) {
    console.error("❌ Gagal verifikasi export PDF report:", err);
    process.exit(1);
  }

  // 12. Test POST /api/session/start & POST /api/session/end (Step 9)
  let testSessionId = "";
  try {
    const resStart = await fetch("http://localhost:3000/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uav_id: "UAV-TEST-02", lat: 0.9123, lon: 101.4567 }),
    });
    const jsonStart = await resStart.json();
    console.log("✅ 12a. POST /api/session/start response:", jsonStart);
    if (!jsonStart.success || jsonStart.session.uav_id !== "UAV-TEST-02") {
      throw new Error("Gagal memulai sesi baru melalui POST /api/session/start");
    }
    testSessionId = jsonStart.session.id;

    const resEnd = await fetch("http://localhost:3000/api/session/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: jsonStart.session.id }),
    });
    const jsonEnd = await resEnd.json();
    console.log("✅ 12b. POST /api/session/end response:", jsonEnd);
    if (!jsonEnd.success || jsonEnd.session.status !== "completed") {
      throw new Error("Gagal mengakhiri sesi melalui POST /api/session/end");
    }
  } catch (err) {
    console.error("❌ Gagal verifikasi POST /api/session/start atau end:", err);
    process.exit(1);
  }

  // 13. Test Deduplikasi & Object Tracking (Step 10)
  try {
    // Mulai sesi baru untuk menguji deduplikasi
    const resSess10 = await fetch("http://localhost:3000/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uav_id: "UAV-DEDUP-10" }),
    });
    const jsonSess10 = await resSess10.json();
    const dedupSessionId = jsonSess10.session.id;
    console.log("✅ 13a. Memulai sesi deduplikasi Step 10:", dedupSessionId);

    // Ambil baseline summary
    const resBase = await fetch("http://localhost:3000/api/session/summary");
    const jsonBase = await resBase.json();
    const baseTotal = jsonBase.total_detections;
    const baseUnique = jsonBase.unique_detections ?? 0;

    // Hubungkan WebSocket ke /ws/inference untuk mengirim 2 frame:
    // Frame 1: TBS TRK-9901 baru (is_duplicate = false)
    // Frame 2: TBS TRK-9901 duplikat (is_duplicate = true) + TRK-9902 baru (is_duplicate = false)
    const dedupWs = new WebSocket("ws://localhost:3000/ws/inference");
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout WS inference test 13")), 6000);
      dedupWs.onopen = () => {
        // Kirim Frame 1 (1 objek baru)
        dedupWs.send(JSON.stringify({
          frame_id: "frame-dedup-1",
          detections: [
            { label: "Ripe", confidence: 0.95, x: 100, y: 100, w: 60, h: 60, track_id: "TRK-9901", is_duplicate: false },
          ],
        }));

        // Kirim Frame 2 (1 duplikat + 1 baru)
        setTimeout(() => {
          dedupWs.send(JSON.stringify({
            frame_id: "frame-dedup-2",
            detections: [
              { label: "Ripe", confidence: 0.93, x: 105, y: 102, w: 60, h: 60, track_id: "TRK-9901", is_duplicate: true },
              { label: "Underripe", confidence: 0.88, x: 300, y: 200, w: 70, h: 70, track_id: "TRK-9902", is_duplicate: false },
            ],
          }));
          setTimeout(() => {
            clearTimeout(timeout);
            dedupWs.close();
            resolve();
          }, 300);
        }, 150);
      };
      dedupWs.onerror = (err) => {
        clearTimeout(timeout);
        reject(err);
      };
    });

    // Verifikasi agregasi deduplikasi
    const resDedupSummary = await fetch("http://localhost:3000/api/session/summary");
    const jsonDedupSummary = await resDedupSummary.json();
    console.log("✅ 13b. GET /api/session/summary setelah 2 frame pelacakan:", {
      total_detections: jsonDedupSummary.total_detections,
      unique_detections: jsonDedupSummary.unique_detections,
    });

    // Total deteksi harus bertambah 3 (1 di frame 1, 2 di frame 2)
    if (jsonDedupSummary.total_detections !== baseTotal + 3) {
      throw new Error(`Total deteksi (${jsonDedupSummary.total_detections}) tidak bertambah 3 dari base (${baseTotal})!`);
    }

    // Deteksi unik HANYA boleh bertambah 2 (TRK-9901 dan TRK-9902, bukan duplikat)
    if (jsonDedupSummary.unique_detections !== baseUnique + 2) {
      throw new Error(`Deteksi unik (${jsonDedupSummary.unique_detections}) tidak bertambah tepat 2 dari base (${baseUnique})!`);
    }

    // Verifikasi SQLite endpoint spesifik sesi
    const resSqliteDedup = await fetch(`http://localhost:3000/api/session/${dedupSessionId}/summary`);
    const jsonSqliteDedup = await resSqliteDedup.json();
    console.log("✅ 13c. SQLite per-session deduplication summary:", {
      session_id: dedupSessionId,
      detections_count: jsonSqliteDedup.detections_count,
      unique_detections_count: jsonSqliteDedup.unique_detections_count,
      unique_tbs: jsonSqliteDedup.summary.unique_tbs,
    });

    if (jsonSqliteDedup.detections_count < 3 || jsonSqliteDedup.unique_detections_count < 2) {
      throw new Error("Hasil deduplikasi per sesi di SQLite tidak sesuai dengan event!");
    }
    if (jsonSqliteDedup.summary.unique_tbs < 2) {
      throw new Error("Field unique_tbs di session_summaries SQLite tidak sesuai!");
    }

    console.log("✅ 13d. Verifikasi Deduplikasi & Object Tracking Step 10 LULUS SEMPURNA!");
  } catch (err) {
    console.error("❌ Gagal verifikasi Step 10 Deduplikasi:", err);
    process.exit(1);
  }

  viewerWs.close();
  console.log("\n🎉 SEMUA PENGUJIAN INTEGRASI BERHASIL (100% LULUS) 🎉");
  process.exit(0);
}

runTests();

