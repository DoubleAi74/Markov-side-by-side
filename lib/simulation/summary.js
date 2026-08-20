const DEFAULT_GRID_POINTS = 501;
const DEFAULT_SAMPLE_PATHS = 20;
const DEFAULT_TERMINAL_SAMPLES = 10_000;
const DEFAULT_QUANTILES = [0.05, 0.5, 0.95];
const SAMPLE_PATH_BYTE_BUDGET = 1024 ** 2;

function selectedIndices(total, limit) {
  if (!Number.isSafeInteger(total) || total < 1 || limit < 1) return new Set();
  if (total <= limit) return new Set(Array.from({ length: total }, (_, index) => index));
  const selected = new Set();
  for (let i = 0; i < limit; i++) selected.add(Math.round((i * (total - 1)) / (limit - 1)));
  return selected;
}

function commonGrid(tMax, points = DEFAULT_GRID_POINTS) {
  return Float64Array.from({ length: points }, (_, index) => (index * tMax) / (points - 1));
}

function compactSamplePath(run) {
  const maxRows = Math.max(2, Math.floor(SAMPLE_PATH_BYTE_BUDGET / (Float64Array.BYTES_PER_ELEMENT * (run.stateCount + 1))));
  if (run.times.length <= maxRows) return run;
  const selected = new Set([0, run.times.length - 1]);
  for (let i = 1; i < maxRows - 1; i++) selected.add(Math.round((i * (run.times.length - 1)) / (maxRows - 1)));
  const rows = [...selected].sort((a, b) => a - b), times = new Float64Array(rows.length), values = new Float64Array(rows.length * run.stateCount);
  rows.forEach((row, target) => {
    times[target] = run.times[row];
    values.set(run.values.subarray(row * run.stateCount, (row + 1) * run.stateCount), target * run.stateCount);
  });
  return { ...run, times, values, recording: { mode: "deterministic-reduced", sourcePoints: run.times.length, retainedPoints: rows.length } };
}

class StreamingField {
  constructor(cellCount, quantiles) {
    this.cellCount = cellCount;
    this.quantileProbabilities = quantiles;
    this.count = new Uint32Array(cellCount);
    this.mean = new Float64Array(cellCount);
    this.m2 = new Float64Array(cellCount);
    this.initial = new Float64Array(cellCount * 5);
    this.estimators = quantiles.map((probability) => ({
      probability,
      heights: new Float64Array(cellCount * 5),
      positions: new Float64Array(cellCount * 5),
      desired: new Float64Array(cellCount * 5),
    }));
  }

  update(cell, value) {
    if (!Number.isFinite(value)) return false;
    const previous = this.count[cell];
    const count = previous + 1;
    this.count[cell] = count;
    const delta = value - this.mean[cell];
    this.mean[cell] += delta / count;
    this.m2[cell] += delta * (value - this.mean[cell]);
    if (previous < 5) {
      this.initial[cell * 5 + previous] = value;
      if (count === 5) this.#initialiseMarkers(cell);
      return true;
    }
    for (const estimator of this.estimators) this.#updateEstimator(estimator, cell, value);
    return true;
  }

  #initialiseMarkers(cell) {
    const offset = cell * 5;
    const sorted = Array.from(this.initial.slice(offset, offset + 5)).sort((a, b) => a - b);
    for (const estimator of this.estimators) {
      const q = estimator.probability;
      estimator.heights.set(sorted, offset);
      estimator.positions.set([1, 2, 3, 4, 5], offset);
      estimator.desired.set([1, 1 + 2 * q, 1 + 4 * q, 3 + 2 * q, 5], offset);
    }
  }

  #updateEstimator(estimator, cell, value) {
    const offset = cell * 5, h = estimator.heights, n = estimator.positions, desired = estimator.desired;
    let bucket;
    if (value < h[offset]) { h[offset] = value; bucket = 0; }
    else if (value < h[offset + 1]) bucket = 0;
    else if (value < h[offset + 2]) bucket = 1;
    else if (value < h[offset + 3]) bucket = 2;
    else if (value <= h[offset + 4]) bucket = 3;
    else { h[offset + 4] = value; bucket = 3; }
    for (let i = bucket + 1; i < 5; i++) n[offset + i] += 1;
    const q = estimator.probability;
    const increments = [0, q / 2, q, (1 + q) / 2, 1];
    for (let i = 0; i < 5; i++) desired[offset + i] += increments[i];
    for (let i = 1; i <= 3; i++) {
      const at = offset + i, difference = desired[at] - n[at];
      if (!((difference >= 1 && n[at + 1] - n[at] > 1) || (difference <= -1 && n[at - 1] - n[at] < -1))) continue;
      const direction = Math.sign(difference);
      const leftSpan = n[at] - n[at - 1], rightSpan = n[at + 1] - n[at], fullSpan = n[at + 1] - n[at - 1];
      const parabolic = h[at] + (direction / fullSpan) * (
        (leftSpan + direction) * (h[at + 1] - h[at]) / rightSpan
        + (rightSpan - direction) * (h[at] - h[at - 1]) / leftSpan
      );
      h[at] = h[at - 1] < parabolic && parabolic < h[at + 1]
        ? parabolic
        : h[at] + direction * (h[at + direction] - h[at]) / (n[at + direction] - n[at]);
      n[at] += direction;
    }
  }

  variance(cell) {
    return this.count[cell] > 1 ? this.m2[cell] / (this.count[cell] - 1) : this.count[cell] === 1 ? 0 : Number.NaN;
  }

  quantile(cell, estimatorIndex) {
    const count = this.count[cell];
    if (!count) return Number.NaN;
    if (count < 5) {
      const values = Array.from(this.initial.slice(cell * 5, cell * 5 + count)).sort((a, b) => a - b);
      const position = (values.length - 1) * this.quantileProbabilities[estimatorIndex];
      const lower = Math.floor(position), fraction = position - lower;
      return values[lower + 1] == null ? values[lower] : values[lower] + fraction * (values[lower + 1] - values[lower]);
    }
    return this.estimators[estimatorIndex].heights[cell * 5 + 2];
  }
}

function sampleRows(run, grid, stateCount, continuous, visit) {
  const times = run.times, values = run.values;
  let right = 1;
  for (let gridIndex = 0; gridIndex < grid.length; gridIndex++) {
    const target = grid[gridIndex];
    while (right < times.length && times[right] < target) right++;
    if (!continuous) {
      const row = right < times.length && times[right] === target ? right : Math.max(0, right - 1);
      for (let variable = 0; variable < stateCount; variable++) visit(gridIndex, variable, values[row * stateCount + variable]);
      continue;
    }
    if (right >= times.length || target <= times[0]) {
      const row = right >= times.length ? times.length - 1 : 0;
      for (let variable = 0; variable < stateCount; variable++) visit(gridIndex, variable, values[row * stateCount + variable]);
      continue;
    }
    const left = right - 1, span = times[right] - times[left], fraction = span === 0 ? 1 : (target - times[left]) / span;
    for (let variable = 0; variable < stateCount; variable++) {
      const a = values[left * stateCount + variable], b = values[right * stateCount + variable];
      visit(gridIndex, variable, a + fraction * (b - a));
    }
  }
}

/** Streaming bounded summary; raw non-sample paths are never retained. */
export class SummaryAccumulator {
  constructor(request, totalRuns = request.runs) {
    this.stateCount = request.model.variables.length;
    this.variableIds = request.model.variables.map((variable) => variable.id);
    this.grid = commonGrid(request.solverConfig?.tMax ?? request.model.settings.tMax);
    this.continuous = request.model.solverFamily === "sde";
    this.quantiles = DEFAULT_QUANTILES;
    this.gridStats = new StreamingField(this.grid.length * this.stateCount, this.quantiles);
    this.terminalStats = new StreamingField(this.stateCount, this.quantiles);
    this.sampleIndices = selectedIndices(totalRuns, DEFAULT_SAMPLE_PATHS);
    this.terminalIndices = selectedIndices(totalRuns, DEFAULT_TERMINAL_SAMPLES);
    this.samplePaths = new Map();
    this.terminalSamples = new Map();
    this.includedRuns = 0;
    this.excludedRuns = 0;
    this.diagnostics = { totalRuns: 0, completedRuns: 0, failedRuns: 0, cancelledRuns: 0, totalEvents: 0, totalSteps: 0, terminationCounts: {} };
  }

  add(packet) {
    const run = packet.run, termination = run.termination ?? { code: "UNKNOWN", kind: "error" };
    this.diagnostics.totalRuns++;
    this.diagnostics.totalEvents += run.eventCount ?? 0;
    this.diagnostics.totalSteps += run.stepCount ?? 0;
    this.diagnostics.terminationCounts[termination.code] = (this.diagnostics.terminationCounts[termination.code] ?? 0) + 1;
    if (termination.code === "CANCELLED") this.diagnostics.cancelledRuns++;
    else if (termination.kind === "error") this.diagnostics.failedRuns++;
    else this.diagnostics.completedRuns++;
    if (this.sampleIndices.has(run.runIndex)) this.samplePaths.set(run.runIndex, compactSamplePath(run));
    const valid = termination.kind !== "error"
      && run.stateCount === this.stateCount
      && run.times.length > 0
      && run.values.length === run.times.length * this.stateCount
      && run.times.every(Number.isFinite)
      && run.values.every(Number.isFinite);
    if (!valid) { this.excludedRuns++; return; }
    this.includedRuns++;
    sampleRows(run, this.grid, this.stateCount, this.continuous, (gridIndex, variable, value) => this.gridStats.update(gridIndex * this.stateCount + variable, value));
    const terminalOffset = (run.times.length - 1) * this.stateCount;
    const terminal = new Float64Array(this.stateCount);
    for (let variable = 0; variable < this.stateCount; variable++) {
      terminal[variable] = run.values[terminalOffset + variable];
      this.terminalStats.update(variable, terminal[variable]);
    }
    if (this.terminalIndices.has(run.runIndex)) this.terminalSamples.set(run.runIndex, terminal);
  }

  finish() {
    const variables = this.variableIds.map((variableId, variable) => {
      const mean = new Float64Array(this.grid.length), variance = new Float64Array(this.grid.length);
      const quantiles = Object.fromEntries(this.quantiles.map((q) => [String(q), new Float64Array(this.grid.length)]));
      for (let gridIndex = 0; gridIndex < this.grid.length; gridIndex++) {
        const cell = gridIndex * this.stateCount + variable;
        mean[gridIndex] = this.gridStats.count[cell] ? this.gridStats.mean[cell] : Number.NaN;
        variance[gridIndex] = this.gridStats.variance(cell);
        this.quantiles.forEach((q, index) => { quantiles[String(q)][gridIndex] = this.gridStats.quantile(cell, index); });
      }
      return { variableId, mean, variance, quantiles };
    });
    const terminalEntries = [...this.terminalSamples].sort((a, b) => a[0] - b[0]);
    const terminalValues = new Float64Array(terminalEntries.length * this.stateCount);
    terminalEntries.forEach(([, values], index) => terminalValues.set(values, index * this.stateCount));
    const terminalQuantiles = Object.fromEntries(this.quantiles.map((q, estimator) => [String(q), Float64Array.from({ length: this.stateCount }, (_, cell) => this.terminalStats.quantile(cell, estimator))]));
    return {
      version: 1,
      mode: "streaming-p2",
      grid: this.grid,
      variables,
      includedRuns: this.includedRuns,
      excludedRuns: this.excludedRuns,
      terminal: {
        runIndices: Uint32Array.from(terminalEntries.map(([runIndex]) => runIndex)),
        values: terminalValues,
        stateCount: this.stateCount,
        retainedSamples: terminalEntries.length,
        totalSamples: this.includedRuns,
        mean: Float64Array.from({ length: this.stateCount }, (_, cell) => this.terminalStats.count[cell] ? this.terminalStats.mean[cell] : Number.NaN),
        variance: Float64Array.from({ length: this.stateCount }, (_, cell) => this.terminalStats.variance(cell)),
        quantiles: terminalQuantiles,
      },
      diagnostics: this.diagnostics,
      samplePaths: [...this.samplePaths.values()].sort((a, b) => a.runIndex - b.runIndex),
    };
  }
}

export const SUMMARY_LIMITS = Object.freeze({ gridPoints: DEFAULT_GRID_POINTS, samplePaths: DEFAULT_SAMPLE_PATHS, terminalSamples: DEFAULT_TERMINAL_SAMPLES });
