/**
 * labels.ts – Pemetaan label kelas deteksi kelapa sawit & warna representasi
 */

export const PALM_LABEL_COLORS: Record<string, string> = {
  "Betina": "#a855f7",        // Ungu - Bunga/tandan betina
  "Black fruits": "#64748b",  // Abu-abu - Buah mentah/belum matang
  "Jantan": "#3b82f6",        // Biru - Bunga/tandan jantan
  "Red fruits": "#ef4444",    // Merah - Buah matang/siap panen
};

export function getLabelColor(label: string): string {
  return PALM_LABEL_COLORS[label] ?? "#10b981";
}
