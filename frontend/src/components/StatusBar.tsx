/**
 * StatusBar – indikator koneksi dan ringkasan status WebSocket
 */

import type { ConnectionStatus, Stats } from "../hooks/useUAVStream";
import styles from "./StatusBar.module.css";

interface Props {
  status: ConnectionStatus;
  stats: Stats;
  onReconnect: () => void;
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: "● WebSocket Terhubung ke API",
  connecting: "○ Menghubungkan...",
  disconnected: "✕ WebSocket Terputus (Auto-reconnect aktif)",
  error: "⚠ Koneksi Error (Auto-reconnect aktif)",
};

const STATUS_CLASS: Record<ConnectionStatus, string> = {
  connected: styles.connected,
  connecting: styles.connecting,
  disconnected: styles.disconnected,
  error: styles.error,
};

export function StatusBar({ status, stats, onReconnect }: Props) {
  return (
    <div className={styles.bar}>
      <span className={`${styles.status} ${STATUS_CLASS[status]}`}>
        {STATUS_LABEL[status]}
      </span>

      <div className={styles.metrics}>
        <span title="Frames diterima">
          <strong>{stats.frameCount.toLocaleString()}</strong> frames
        </span>
        <span title="Total deteksi">
          <strong>{stats.detectionCount.toLocaleString()}</strong> deteksi
        </span>
        <span title="Frames per detik">
          <strong>{stats.fps > 0 ? stats.fps.toFixed(1) : "0.0"}</strong> fps
        </span>
        {stats.latencyMs !== null && (
          <span title="Latency inferensi">
            <strong>{stats.latencyMs.toFixed(1)}</strong> ms
          </span>
        )}
      </div>

      {status !== "connected" && (
        <button className={styles.btn} onClick={onReconnect} title="Paksa koneksi ulang sekarang">
          Reconnect Sekarang
        </button>
      )}
    </div>
  );
}
