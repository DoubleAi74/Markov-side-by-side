function escapeCell(value) {
  const string = String(value ?? "");
  return /[",\r\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

export async function generateCsvText({ runs, variableNames, signal, onProgress, yieldEvery = 10_000 }) {
  const lines = [["run", "t", ...variableNames].map(escapeCell).join(",")];
  const totalRows = runs.reduce((sum, run) => sum + run.times.length, 0);
  let completedRows = 0;
  let lastProgress = performance.now();

  for (const run of runs) {
    if (!(run.times instanceof Float64Array) || !(run.values instanceof Float64Array)) {
      throw new TypeError("Full-path CSV requires retained Float64Array run buffers.");
    }
    const stateCount = run.stateCount ?? variableNames.length;
    if (run.values.length !== run.times.length * stateCount) throw new RangeError("Run buffer shape is invalid.");
    for (let row = 0; row < run.times.length; row += 1) {
      if (signal?.aborted) throw Object.assign(new Error("CSV export was cancelled."), { code: "CANCELLED" });
      const cells = [run.runIndex, run.times[row]];
      for (let column = 0; column < stateCount; column += 1) cells.push(run.values[row * stateCount + column]);
      lines.push(cells.map(escapeCell).join(","));
      completedRows += 1;
      if (completedRows % yieldEvery === 0) {
        const now = performance.now();
        if (now - lastProgress >= 250) {
          onProgress?.({ completed: completedRows, total: totalRows });
          lastProgress = now;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }
  onProgress?.({ completed: totalRows, total: totalRows });
  return `${lines.join("\n")}\n`;
}

export function provenanceJson(provenance) {
  return `${JSON.stringify({
    format: "markov-lab/provenance",
    formatVersion: 1,
    ...provenance,
  }, null, 2)}\n`;
}
