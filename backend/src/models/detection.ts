/**
 * models/detection.ts – Model & Queries Event Deteksi Buah Sawit (detection_events)
 * Step 9 Roadmap Capstone (Database SQLite)
 */

import { db } from "../db";

export interface DetectionEventRecord {
  id: number;
  session_id: string;
  detected_at: string;
  track_id: string | null;
  label: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
  is_duplicate: number;
}

export interface InputDetection {
  label: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
  track_id?: string | null;
  is_duplicate?: boolean | number;
}

/**
 * Menyimpan batch deteksi objek dari frame ke tabel detection_events
 * menggunakan transaksi SQLite agar performa optimal (non-blocking ke WS).
 */
export function insertBatchDetections(
  sessionId: string,
  detections: InputDetection[],
  detectedAt?: string
): number {
  if (!detections || detections.length === 0) return 0;

  const timestamp = detectedAt ?? new Date().toISOString();

  const insertStmt = db.prepare(`
    INSERT INTO detection_events (
      session_id, detected_at, track_id, label, confidence,
      x, y, w, h, is_duplicate
    ) VALUES (
      $session_id, $detected_at, $track_id, $label, $confidence,
      $x, $y, $w, $h, $is_duplicate
    );
  `);

  const insertMany = db.transaction((items: InputDetection[]) => {
    let count = 0;
    for (const d of items) {
      insertStmt.run({
        $session_id: sessionId,
        $detected_at: timestamp,
        $track_id: d.track_id ?? null,
        $label: d.label,
        $confidence: Number(d.confidence),
        $x: Math.round(d.x),
        $y: Math.round(d.y),
        $w: Math.round(d.w),
        $h: Math.round(d.h),
        $is_duplicate: d.is_duplicate ? 1 : 0,
      });
      count++;
    }
    return count;
  });

  return insertMany(detections);
}

/**
 * Mengambil daftar event deteksi pada suatu sesi.
 */
export function getDetectionsBySession(
  sessionId: string,
  options?: { limit?: number; offset?: number }
): DetectionEventRecord[] {
  const limit = options?.limit ?? 5000;
  const offset = options?.offset ?? 0;

  return db
    .query(
      `SELECT id, session_id, detected_at, track_id, label, confidence,
              x, y, w, h, is_duplicate
       FROM detection_events
       WHERE session_id = ?
       ORDER BY id ASC
       LIMIT ? OFFSET ?;`
    )
    .all(sessionId, limit, offset) as DetectionEventRecord[];
}

/**
 * Mengambil total event deteksi pada suatu sesi.
 */
export function getDetectionCountBySession(sessionId: string): number {
  const row = db
    .query(
      `SELECT COUNT(*) as total
       FROM detection_events
       WHERE session_id = ?;`
    )
    .get(sessionId) as { total: number } | null;

  return row ? Number(row.total) : 0;
}
