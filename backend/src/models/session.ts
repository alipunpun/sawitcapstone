/**
 * models/session.ts – Model & Queries Sesi Monitoring UAV & Ringkasan Sesi
 * Step 9 Roadmap Capstone (Database SQLite)
 */

import { db } from "../db";

export interface SessionRecord {
  id: string;
  uav_id: string;
  lat: number | null;
  lon: number | null;
  started_at: string;
  ended_at: string | null;
  status: "active" | "completed" | "aborted";
}

export interface SessionSummaryRecord {
  session_id: string;
  total_tbs: number;
  unique_tbs: number;
  ripe_count: number;
  underripe_count: number;
  unripe_count: number;
  abnormal_count: number;
  flower_count: number;
  harvest_readiness_pct: number;
}

export function generateSessionId(): string {
  const now = new Date();
  const datePart = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SES-${datePart}-${randPart}`;
}

/**
 * Membuat sesi monitoring baru.
 * Jika terdapat sesi aktif sebelumnya, sesi tersebut otomatis ditandai 'completed'.
 */
export function createSession(params?: {
  id?: string;
  uav_id?: string;
  lat?: number;
  lon?: number;
}): SessionRecord {
  const id = params?.id ?? generateSessionId();
  const uavId = params?.uav_id ?? "UAV-01";
  const lat = params?.lat ?? null;
  const lon = params?.lon ?? null;
  const startedAt = new Date().toISOString();

  // Selesaikan sesi aktif sebelumnya jika ada
  db.run(
    `UPDATE sessions SET status = 'completed', ended_at = ? WHERE status = 'active';`,
    [startedAt]
  );

  // Buat sesi baru
  db.run(
    `INSERT INTO sessions (id, uav_id, lat, lon, started_at, ended_at, status)
     VALUES (?, ?, ?, ?, ?, NULL, 'active');`,
    [id, uavId, lat, lon, startedAt]
  );

  // Inisialisasi entri di session_summaries
  db.run(
    `INSERT INTO session_summaries (
       session_id, total_tbs, unique_tbs, ripe_count, underripe_count, unripe_count,
       abnormal_count, flower_count, harvest_readiness_pct
     ) VALUES (?, 0, 0, 0, 0, 0, 0, 0, 0.0);`,
    [id]
  );

  return {
    id,
    uav_id: uavId,
    lat,
    lon,
    started_at: startedAt,
    ended_at: null,
    status: "active",
  };
}

/**
 * Mengambil sesi yang sedang berstatus 'active'.
 */
export function getActiveSession(): SessionRecord | null {
  const row = db
    .query(
      `SELECT id, uav_id, lat, lon, started_at, ended_at, status
       FROM sessions
       WHERE status = 'active'
       ORDER BY started_at DESC
       LIMIT 1;`
    )
    .get() as SessionRecord | null;

  return row ?? null;
}

/**
 * Mengambil sesi aktif atau otomatis membuatnya jika belum ada.
 */
export function getOrCreateActiveSession(): SessionRecord {
  const existing = getActiveSession();
  if (existing) return existing;
  return createSession();
}

/**
 * Mengambil data sesi berdasarkan ID.
 */
export function getSessionById(id: string): SessionRecord | null {
  const row = db
    .query(
      `SELECT id, uav_id, lat, lon, started_at, ended_at, status
       FROM sessions
       WHERE id = ?;`
    )
    .get(id) as SessionRecord | null;

  return row ?? null;
}

/**
 * Mengambil ringkasan sesi dari tabel session_summaries.
 */
export function getSessionSummary(sessionId: string): SessionSummaryRecord | null {
  const row = db
    .query(
      `SELECT session_id, total_tbs, unique_tbs, ripe_count, underripe_count,
              unripe_count, abnormal_count, flower_count, harvest_readiness_pct
       FROM session_summaries
       WHERE session_id = ?;`
    )
    .get(sessionId) as SessionSummaryRecord | null;

  return row ?? null;
}

/**
 * Menghitung ulang ringkasan sesi dari data deteksi aktual di detection_events
 * dan memperbarui tabel session_summaries.
 * Step 10: Menggunakan filter is_duplicate = 0 untuk statistik TBS unik.
 */
export function recalculateSessionSummary(sessionId: string): SessionSummaryRecord {
  // Total semua event deteksi yang tercatat
  const totalRow = db
    .query(
      `SELECT COUNT(*) as total
       FROM detection_events
       WHERE session_id = ?;`
    )
    .get(sessionId) as { total: number } | null;
  const totalTbs = totalRow ? Number(totalRow.total) : 0;

  // Agregasi deteksi unik (Step 10: filter is_duplicate = 0)
  const uniqueRows = db
    .query(
      `SELECT label, COUNT(*) as count
       FROM detection_events
       WHERE session_id = ? AND is_duplicate = 0
       GROUP BY label;`
    )
    .all(sessionId) as Array<{ label: string; count: number }>;

  const counts: Record<string, number> = {
    Ripe: 0,
    Underripe: 0,
    Unripe: 0,
    Abnormal: 0,
    Flower: 0,
  };

  let uniqueTbs = 0;
  for (const r of uniqueRows) {
    if (r.label in counts) {
      counts[r.label] = Number(r.count);
    }
    uniqueTbs += Number(r.count);
  }

  // Fallback jika semua record belum memiliki flag deduplikasi
  if (uniqueTbs === 0 && totalTbs > 0) {
    const allRows = db
      .query(
        `SELECT label, COUNT(*) as count
         FROM detection_events
         WHERE session_id = ?
         GROUP BY label;`
      )
      .all(sessionId) as Array<{ label: string; count: number }>;
    for (const r of allRows) {
      if (r.label in counts) {
        counts[r.label] = Number(r.count);
      }
      uniqueTbs += Number(r.count);
    }
  }

  const fruitTotal =
    counts.Ripe + counts.Underripe + counts.Unripe + counts.Abnormal;
  const hri =
    fruitTotal > 0 ? Number(((counts.Ripe / fruitTotal) * 100).toFixed(2)) : 0.0;

  db.run(
    `INSERT INTO session_summaries (
       session_id, total_tbs, unique_tbs, ripe_count, underripe_count,
       unripe_count, abnormal_count, flower_count, harvest_readiness_pct
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       total_tbs = excluded.total_tbs,
       unique_tbs = excluded.unique_tbs,
       ripe_count = excluded.ripe_count,
       underripe_count = excluded.underripe_count,
       unripe_count = excluded.unripe_count,
       abnormal_count = excluded.abnormal_count,
       flower_count = excluded.flower_count,
       harvest_readiness_pct = excluded.harvest_readiness_pct;`,
    [
      sessionId,
      totalTbs,
      uniqueTbs,
      counts.Ripe,
      counts.Underripe,
      counts.Unripe,
      counts.Abnormal,
      counts.Flower,
      hri,
    ]
  );

  return {
    session_id: sessionId,
    total_tbs: totalTbs,
    unique_tbs: uniqueTbs,
    ripe_count: counts.Ripe,
    underripe_count: counts.Underripe,
    unripe_count: counts.Unripe,
    abnormal_count: counts.Abnormal,
    flower_count: counts.Flower,
    harvest_readiness_pct: hri,
  };
}

/**
 * Mengakhiri sesi monitoring dan menghitung ringkasan final.
 */
export function endSession(sessionId?: string): {
  session: SessionRecord;
  summary: SessionSummaryRecord;
} {
  const targetSession = sessionId ? getSessionById(sessionId) : getActiveSession();
  if (!targetSession) {
    throw new Error("Tidak ada sesi yang dapat diakhiri.");
  }

  const endedAt = new Date().toISOString();
  db.run(
    `UPDATE sessions SET status = 'completed', ended_at = ? WHERE id = ?;`,
    [endedAt, targetSession.id]
  );

  const summary = recalculateSessionSummary(targetSession.id);

  return {
    session: {
      ...targetSession,
      status: "completed",
      ended_at: endedAt,
    },
    summary,
  };
}

/**
 * Mengambil daftar seluruh sesi beserta ringkasannya (terurut terbaru).
 */
export function getAllSessions(): Array<
  SessionRecord & { summary: SessionSummaryRecord | null; total_events: number }
> {
  const sessions = db
    .query(
      `SELECT s.id, s.uav_id, s.lat, s.lon, s.started_at, s.ended_at, s.status,
              COUNT(d.id) as total_events
       FROM sessions s
       LEFT JOIN detection_events d ON s.id = d.session_id
       GROUP BY s.id
       ORDER BY s.started_at DESC;`
    )
    .all() as Array<SessionRecord & { total_events: number }>;

  return sessions.map((sess) => ({
    ...sess,
    summary: getSessionSummary(sess.id),
  }));
}
