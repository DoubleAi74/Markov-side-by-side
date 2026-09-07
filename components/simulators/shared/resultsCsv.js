import { createSavedSimulationSlug } from "@/lib/slugs";

function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  if (!/[",\n]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

export function buildSimulationResultsCsv({ results = [], columnNames = [] }) {
  const lines = [
    ["run", "t", ...columnNames].map(escapeCsvValue).join(","),
  ];

  results.forEach((result, runIndex) => {
    const times = Array.isArray(result?.times) ? result.times : [];
    const history = Array.isArray(result?.history) ? result.history : [];

    times.forEach((time, rowIndex) => {
      const values = Array.isArray(history[rowIndex]) ? history[rowIndex] : [];
      lines.push(
        [runIndex, time, ...columnNames.map((_, columnIndex) => values[columnIndex] ?? "")]
          .map(escapeCsvValue)
          .join(","),
      );
    });
  });

  return `${lines.join("\n")}\n`;
}

export function createSimulationResultsFilename({
  modelName,
  simulatorType,
}) {
  const baseName =
    String(modelName ?? "").trim() || `${String(simulatorType ?? "simulation")}-simulation`;
  return `${createSavedSimulationSlug(baseName)}-results.csv`;
}

export function downloadCsvText(csvText, filename) {
  const blob = new Blob([String(csvText ?? "")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
