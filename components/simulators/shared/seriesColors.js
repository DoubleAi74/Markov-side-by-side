export const CTMP_INHOMO_SERIES_COLORS = [
  "#4f46e5",
  "#db2777",
  "#059669",
  "#d97706",
  "#7c3aed",
];

export const GILLESPIE_SERIES_COLORS = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#6366f1",
];

export const SDE_SERIES_COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#d97706",
  "#9333ea",
  "#0891b2",
];

function normalizeHex(hex) {
  if (typeof hex !== "string") return null;
  const value = hex.trim();
  if (!value.startsWith("#")) return null;

  if (/^#[0-9A-Fa-f]{6}$/.test(value)) return value;
  if (/^#[0-9A-Fa-f]{3}$/.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return null;
}

export function getSeriesColor(palette, index) {
  if (!Array.isArray(palette) || palette.length === 0) {
    return "#334155";
  }
  const normalized = ((index % palette.length) + palette.length) % palette.length;
  return palette[normalized];
}

export function hexToRgba(hex, alpha) {
  const normalized = normalizeHex(hex);
  const opacity = Number.isFinite(alpha) ? Math.min(Math.max(alpha, 0), 1) : 1;
  if (!normalized) return `rgba(51, 65, 85, ${opacity})`;

  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
