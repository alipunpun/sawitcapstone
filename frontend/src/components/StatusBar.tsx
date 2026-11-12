/**
 * StatusBar – Indikator koneksi WebSocket & Telemetri Penerbangan Drone
 */

import type { ConnectionStatus, Stats } from "../hooks/useUAVStream";
import { RefreshCwIcon, WifiIcon, WifiOffIcon, RadioIcon, ActivityIcon } from "./icons";
import styles from "./StatusBar.module.css";

interface Props {
  status: ConnectionStatus;
  stats: Stats;
  onReconnect: () => void;
}

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { label: string; icon: typeof WifiIcon; className: string }
> = {
  connected: {
    label: "Stream Drone Terhubung",
    icon: WifiIcon,
    className: styles.connected,
  },
  connecting: {
    label: "Menghubungkan ke Drone...",
    icon: RadioIcon,
    className: styles.connecting,
  },
  disconnected: {
    label: "Koneksi Terputus (Mencoba ulang...)",
    icon: WifiOffIcon,
    className: styles.disconnected,
  },
  error: {
    label: "Koneksi Bermasalah (Auto-retry)",
    icon: WifiOffIcon,
    className: styles.error,
  },
};

export function StatusBar({ status, stats, onReconnect }: Props) {
  const currentStatus = STATUS_CONFIG[status];
  const StatusIcon = currentStatus.icon;

  return (
    <div className={styles.bar} role="region" aria-label="Status Koneksi dan Telemetri Drone">
      <div className={styles.statusGroup}>
        <div className={`${styles.badge} ${currentStatus.className}`}>
          <span className={styles.pulseDot} aria-hidden="true" />
          <StatusIcon size={16} aria-hidden="true" />
          <span>{currentStatus.label}</span>
        </div>
      </div>

      <div className={styles.metrics} role="status" aria-live="polite">
        <div className={styles.metricItem} title="Total frame visual yang diterima">
          <span className={styles.metricValue}>{stats.frameCount.toLocaleString()}</span>
          <span className={styles.metricUnit}>frames</span>
        </div>

        <div className={styles.metricItem} title="Total objek tandan sawit terdeteksi">
          <span className={styles.metricValue}>{stats.detectionCount.toLocaleString()}</span>
          <span className={styles.metricUnit}>tandan terdeteksi</span>
        </div>

        <div className={styles.metricItem} title="Kecepatan frame inferensi">
          <ActivityIcon size={14} style={{ color: "#16a34a", marginRight: 2 }} aria-hidden="true" />
          <span className={styles.metricValue}>
            {stats.fps > 0 ? stats.fps.toFixed(1) : "0.0"}
          </span>
          <span className={styles.metricUnit}>FPS</span>
        </div>

        {stats.latencyMs !== null && (
          <div className={styles.metricItem} title="Latensi inferensi model YOLO">
            <span className={styles.metricValue}>{stats.latencyMs.toFixed(1)}</span>
            <span className={styles.metricUnit}>ms latensi</span>
          </div>
        )}
      </div>

      {status !== "connected" && (
        <button
          className={styles.reconnectBtn}
          onClick={onReconnect}
          type="button"
          aria-label="Sambungkan ulang ke server stream"
        >
          <RefreshCwIcon size={14} aria-hidden="true" />
          <span>Sambungkan Ulang</span>
        </button>
      )}
    </div>
  );
}
