/**
 * labels.ts – Pemetaan 5 kelas deteksi model YOLO11s-CBAM-WIoU kelapa sawit & warna semantik
 * Kelas: Ripe, Underripe, Unripe, Abnormal, Flower
 */

export const CBAM_CLASSES = [
  "Ripe",
  "Underripe",
  "Unripe",
  "Abnormal",
  "Flower",
] as const;

export type PalmClass = (typeof CBAM_CLASSES)[number];

export interface PalmClassMeta {
  key: string;
  labelId: string;
  shortLabelId: string;
  description: string;
  color: string;
  badge: { bg: string; text: string; border: string };
}

export const PALM_CLASS_META: Record<PalmClass, PalmClassMeta> = {
  Ripe: {
    key: "Ripe",
    labelId: "Matang (Siap Panen)",
    shortLabelId: "Matang",
    description: "Tandan buah sawit matang optimal dan siap dipanen.",
    color: "#ef4444",
    badge: { bg: "#fef2f2", text: "#b91c1c", border: "#fecaca" },
  },
  Underripe: {
    key: "Underripe",
    labelId: "Mengkal (Hampir Matang)",
    shortLabelId: "Mengkal",
    description: "Tandan mulai memerah dan mendekati waktu panen.",
    color: "#f59e0b",
    badge: { bg: "#fffbeb", text: "#b45309", border: "#fde68a" },
  },
  Unripe: {
    key: "Unripe",
    labelId: "Mentah",
    shortLabelId: "Mentah",
    description: "Tandan muda belum siap untuk dipanen.",
    color: "#3b82f6",
    badge: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  },
  Abnormal: {
    key: "Abnormal",
    labelId: "Abnormal / Rusak",
    shortLabelId: "Abnormal",
    description: "Tandan mengalami kelainan pertumbuhan atau kerusakan fisik.",
    color: "#6b7280",
    badge: { bg: "#f3f4f6", text: "#374151", border: "#d1d5db" },
  },
  Flower: {
    key: "Flower",
    labelId: "Bunga Sawit",
    shortLabelId: "Bunga",
    description: "Fase pembungaan sawit (dikecualikan dari rasio panen).",
    color: "#a855f7",
    badge: { bg: "#faf5ff", text: "#7e22ce", border: "#e9d5ff" },
  },
};

export const PALM_LABEL_COLORS: Record<string, string> = {
  Ripe: PALM_CLASS_META.Ripe.color,
  Underripe: PALM_CLASS_META.Underripe.color,
  Unripe: PALM_CLASS_META.Unripe.color,
  Abnormal: PALM_CLASS_META.Abnormal.color,
  Flower: PALM_CLASS_META.Flower.color,
};

const FALLBACK_META: PalmClassMeta = {
  key: "Unknown",
  labelId: "Tidak Dikenal",
  shortLabelId: "Lainnya",
  description: "Kelas deteksi di luar skema CBAM standar.",
  color: "#15803d",
  badge: { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
};

export function getLabelInfo(label: string): PalmClassMeta {
  if (label in PALM_CLASS_META) {
    return PALM_CLASS_META[label as PalmClass];
  }
  return {
    ...FALLBACK_META,
    key: label,
    labelId: label,
    shortLabelId: label,
  };
}

export function getLabelColor(label: string): string {
  return PALM_LABEL_COLORS[label] ?? FALLBACK_META.color;
}

export function getLabelBadgeClass(label: string): { bg: string; text: string; border: string } {
  return getLabelInfo(label).badge;
}
