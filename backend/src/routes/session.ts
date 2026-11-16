/**
 * routes/session.ts – Route Handler Sesi Monitoring & Export Laporan
 * Step 9 Roadmap Capstone (Database SQLite & REST API)
 */

import { Elysia, t } from "elysia";
import {
  createSession,
  endSession,
  getActiveSession,
  getAllSessions,
  getSessionById,
  getSessionSummary,
  recalculateSessionSummary,
} from "../models/session";
import {
  getDetectionCountBySession,
  getDetectionsBySession,
} from "../models/detection";

export const sessionRoutes = new Elysia({ prefix: "/api" })
  /**
   * POST /api/session/start – Memulai sesi monitoring baru
   */
  .post(
    "/session/start",
    ({ body }) => {
      const session = createSession({
        uav_id: body?.uav_id,
        lat: body?.lat,
        lon: body?.lon,
      });

      return {
        success: true,
        message: "Sesi monitoring UAV berhasil dimulai.",
        session,
      };
    },
    {
      body: t.Optional(
        t.Object({
          uav_id: t.Optional(t.String()),
          lat: t.Optional(t.Number()),
          lon: t.Optional(t.Number()),
        })
      ),
    }
  )

  /**
   * POST /api/session/end – Mengakhiri sesi & menghitung ringkasan
   */
  .post(
    "/session/end",
    ({ body, set }) => {
      try {
        const result = endSession(body?.session_id);
        return {
          success: true,
          message: "Sesi monitoring berhasil diakhiri.",
          session: result.session,
          summary: result.summary,
        };
      } catch (err: any) {
        set.status = 400;
        return {
          success: false,
          error: err?.message ?? "Gagal mengakhiri sesi monitoring.",
        };
      }
    },
    {
      body: t.Optional(
        t.Object({
          session_id: t.Optional(t.String()),
        })
      ),
    }
  )

  /**
   * GET /api/session/active – Mengambil sesi yang sedang aktif
   */
  .get("/session/active", ({ set }) => {
    const active = getActiveSession();
    if (!active) {
      return {
        success: true,
        active: false,
        session: null,
        summary: null,
      };
    }

    const summary = recalculateSessionSummary(active.id);
    return {
      success: true,
      active: true,
      session: active,
      summary,
    };
  })

  /**
   * GET /api/sessions – Daftar seluruh riwayat sesi
   */
  .get("/sessions", () => {
    const sessions = getAllSessions();
    return {
      success: true,
      count: sessions.length,
      sessions,
    };
  })

  /**
   * GET /api/session/:id/summary – Rekapitulasi satu sesi
   */
  .get(
    "/session/:id/summary",
    ({ params, set }) => {
      const session = getSessionById(params.id);
      if (!session) {
        set.status = 404;
        return {
          success: false,
          error: `Sesi dengan ID '${params.id}' tidak ditemukan.`,
        };
      }

      // Hitung ulang dari detection_events untuk memastikan data up-to-date
      const summary = recalculateSessionSummary(session.id);
      const detectionsCount = getDetectionCountBySession(session.id);

      return {
        success: true,
        session,
        summary,
        detections_count: detectionsCount,
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )

  /**
   * GET /api/export/:id/csv – Export data deteksi mentah sesi ke format CSV
   */
  .get(
    "/export/:id/csv",
    ({ params, set }) => {
      const session = getSessionById(params.id);
      if (!session) {
        set.status = 404;
        return "Sesi tidak ditemukan.";
      }

      const summary = recalculateSessionSummary(session.id);
      const detections = getDetectionsBySession(session.id, { limit: 10000 });

      const headers = [
        "id",
        "session_id",
        "detected_at",
        "track_id",
        "label",
        "confidence",
        "x",
        "y",
        "w",
        "h",
        "is_duplicate",
      ];

      const csvRows = [headers.join(",")];
      for (const d of detections) {
        csvRows.push(
          [
            d.id,
            `"${d.session_id}"`,
            `"${d.detected_at}"`,
            d.track_id ? `"${d.track_id}"` : '""',
            `"${d.label}"`,
            d.confidence.toFixed(4),
            d.x,
            d.y,
            d.w,
            d.h,
            d.is_duplicate,
          ].join(",")
        );
      }

      set.headers["Content-Type"] = "text/csv; charset=utf-8";
      set.headers["Content-Disposition"] = `attachment; filename="${session.id}-detections.csv"`;

      return csvRows.join("\n");
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )

  /**
   * GET /api/export/:id/pdf – Laporan cetak PDF / HTML responsif untuk stakeholder
   */
  .get(
    "/export/:id/pdf",
    ({ params, set }) => {
      const session = getSessionById(params.id);
      if (!session) {
        set.status = 404;
        return "Sesi tidak ditemukan.";
      }

      const summary = recalculateSessionSummary(session.id);
      const detections = getDetectionsBySession(session.id, { limit: 100 });
      const totalCount = getDetectionCountBySession(session.id);

      const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Laporan Monitoring TBS - ${session.id}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 30px; color: #1e293b; }
    .header { border-bottom: 2px solid #15803d; padding-bottom: 15px; margin-bottom: 20px; }
    .title { color: #14532d; margin: 0; font-size: 22px; font-weight: 700; }
    .subtitle { color: #64748b; font-size: 13px; margin: 4px 0 0; }
    .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0; }
    .meta-item { font-size: 12px; }
    .meta-label { color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; }
    .meta-val { font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 2px; }
    .summary-card { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
    .hri-title { font-size: 12px; font-weight: 700; color: #166534; text-transform: uppercase; }
    .hri-val { font-size: 32px; font-weight: 800; color: #15803d; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
    th { background: #f1f5f9; font-weight: 700; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; }
    .btn-print { background: #15803d; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; margin-bottom: 20px; }
    @media print { .btn-print { display: none; } }
  </style>
</head>
<body>
  <button class="btn-print" onclick="window.print()">🖨️ Cetak / Simpan ke PDF</button>
  <div class="header">
    <h1 class="title">Laporan Hasil Deteksi TBS Kelapa Sawit (UAV)</h1>
    <p class="subtitle">Sistem Deteksi Buah Sawit Berbasis AI · Model YOLO11s-CBAM-WIoU</p>
  </div>

  <div class="meta-grid">
    <div class="meta-item"><div class="meta-label">ID Sesi</div><div class="meta-val">${session.id}</div></div>
    <div class="meta-item"><div class="meta-label">UAV Unit</div><div class="meta-val">${session.uav_id}</div></div>
    <div class="meta-item"><div class="meta-label">Waktu Mulai</div><div class="meta-val">${new Date(session.started_at).toLocaleString("id-ID")}</div></div>
    <div class="meta-item"><div class="meta-label">Status</div><div class="meta-val">${session.status.toUpperCase()}</div></div>
  </div>

  <div class="summary-card">
    <div class="hri-title">Harvest Readiness Index (HRI)</div>
    <div class="hri-val">${summary.harvest_readiness_pct.toFixed(1)}%</div>
    <p style="margin: 6px 0 0; font-size: 13px; color: #166534;">
      Total Deteksi TBS: <strong>${summary.total_tbs}</strong> | Ripe: <strong>${summary.ripe_count}</strong> | Underripe: <strong>${summary.underripe_count}</strong> | Unripe: <strong>${summary.unripe_count}</strong> | Abnormal: <strong>${summary.abnormal_count}</strong> | Bunga: <strong>${summary.flower_count}</strong>
    </p>
  </div>

  <h3 style="font-size: 14px; margin-bottom: 8px;">Sampel Data Deteksi Terakhir (Menampilkan ${detections.length} dari ${totalCount} event)</h3>
  <table>
    <thead>
      <tr>
        <th>No</th>
        <th>Waktu Deteksi</th>
        <th>Track ID</th>
        <th>Kelas Kematangan</th>
        <th>Confidence</th>
        <th>Koordinat BBox [x, y, w, h]</th>
      </tr>
    </thead>
    <tbody>
      ${detections
        .map(
          (d, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${new Date(d.detected_at).toLocaleTimeString("id-ID")}</td>
          <td>${d.track_id ?? "-"}</td>
          <td><strong>${d.label}</strong></td>
          <td>${(d.confidence * 100).toFixed(1)}%</td>
          <td>[${d.x}, ${d.y}, ${d.w}, ${d.h}]</td>
        </tr>`
        )
        .join("")}
    </tbody>
  </table>
</body>
</html>`;

      set.headers["Content-Type"] = "text/html; charset=utf-8";
      return html;
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  );
