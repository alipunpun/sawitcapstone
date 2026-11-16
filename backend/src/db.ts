/**
 * db.ts – Inisialisasi Database SQLite & Migrasi Skema
 * Step 9 Roadmap Capstone: Database Penyimpanan Hasil Klasifikasi
 * Menggunakan runtime native Bun SQLite (bun:sqlite).
 */

import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_DB_PATH = path.resolve(
  process.env.DATABASE_PATH ?? path.join(__dirname, "../data/palm_detections.db")
);

// Pastikan direktori database ada
const dbDir = path.dirname(DEFAULT_DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(DEFAULT_DB_PATH, { create: true });

// Optimasi performa dan integritas referensial SQLite
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA foreign_keys = ON;");
db.run("PRAGMA synchronous = NORMAL;");

/**
 * Migrasi skema database SQLite (3 tabel sesuai spesifikasi Step 9 issue.md):
 * 1. sessions          - Menyimpan sesi monitoring UAV
 * 2. detection_events  - Menyimpan setiap objek TBS yang terdeteksi per frame
 * 3. session_summaries - Menyimpan ringkasan agregasi per sesi
 */
export function initDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      uav_id TEXT NOT NULL DEFAULT 'UAV-01',
      lat REAL,
      lon REAL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'aborted'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS detection_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      detected_at TEXT NOT NULL,
      track_id TEXT,
      label TEXT NOT NULL,
      confidence REAL NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      w INTEGER NOT NULL,
      h INTEGER NOT NULL,
      is_duplicate INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS session_summaries (
      session_id TEXT PRIMARY KEY,
      total_tbs INTEGER NOT NULL DEFAULT 0,
      ripe_count INTEGER NOT NULL DEFAULT 0,
      underripe_count INTEGER NOT NULL DEFAULT 0,
      unripe_count INTEGER NOT NULL DEFAULT 0,
      abnormal_count INTEGER NOT NULL DEFAULT 0,
      flower_count INTEGER NOT NULL DEFAULT 0,
      harvest_readiness_pct REAL NOT NULL DEFAULT 0.0,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);

  // Indeks untuk mempercepat pencarian deteksi per sesi dan filter waktu
  db.run(`CREATE INDEX IF NOT EXISTS idx_detection_session ON detection_events(session_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_detection_time ON detection_events(detected_at);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_detection_label ON detection_events(label);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);`);

  console.log(`[db] SQLite initialized at: ${DEFAULT_DB_PATH}`);
}

// Inisialisasi otomatis saat modul dimuat
initDatabase();
