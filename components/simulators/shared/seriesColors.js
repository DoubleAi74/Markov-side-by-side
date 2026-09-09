import { normalizeHexColor } from "../../../lib/colors.js";

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

export const DISCRETE_TIME_SERIES_COLORS = [
  "#0f766e",
  "#ea580c",
  "#7c3aed",
  "#2563eb",
  "#dc2626",
  "#65a30d",
];

export function getSeriesColor(palette, index, customColor) {
  const color = normalizeHexColor(customColor);
  if (color) return color;
  if (!Array.isArray(palette) || palette.length === 0) {
    return "#334155";
  }
  const normalized = ((index % palette.length) + palette.length) % palette.length;
  return palette[normalized];
}

export const DEFAULT_PATH_OPACITY = 0.78;
export const MIN_PATH_OPACITY = 0.08;
export const MAX_PATH_OPACITY = 1;

export function clampPathOpacity(value) {
  const opacity = Number(value);
  if (!Number.isFinite(opacity)) return DEFAULT_PATH_OPACITY;
  return Math.min(MAX_PATH_OPACITY, Math.max(MIN_PATH_OPACITY, opacity));
}

export function hexToRgba(hex, alpha) {
  const normalized = normalizeHexColor(hex);
  const opacity = Number.isFinite(alpha) ? Math.min(Math.max(alpha, 0), 1) : 1;
  if (!normalized) return `rgba(51, 65, 85, ${opacity})`;

  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Keep each colour attached to its source row, including across blank rows.
export function buildVariableSeries(rows, palette) {
  const series = new Map();
  rows.forEach((row, index) => {
    const name = String(row.name ?? row.text?.split("=")[0] ?? "").trim();
    if (!name || series.has(name)) return;
    series.set(name, {
      id: row.id,
      color: getSeriesColor(palette, index, row.color),
    });
  });
  return series;
}

export function applySeriesColors(datasets, series, alphaOverride) {
  const colorsById = new Map(
    [...series.values()].map(({ id, color }) => [id, color]),
  );
  const hasOverride = Number.isFinite(Number(alphaOverride));
  return datasets.map((dataset) => {
    const hex = colorsById.get(dataset.variableId);
    if (!hex) return dataset;
    const color = hexToRgba(
      hex,
      hasOverride ? Number(alphaOverride) : dataset.seriesAlpha,
    );
    return { ...dataset, borderColor: color, backgroundColor: color };
  });
}

export function applyPathOpacity(datasets, opacity) {
  if (!Array.isArray(datasets)) return datasets;
  const alpha = clampPathOpacity(opacity);
  return datasets.map((dataset) => {
    if (!dataset?.pathStroke) return dataset;
    const hex = dataset.seriesHex;
    if (!hex) return { ...dataset, seriesAlpha: alpha };
    const color = hexToRgba(hex, alpha);
    return {
      ...dataset,
      seriesAlpha: alpha,
      borderColor: color,
      backgroundColor: color,
    };
  });
}
