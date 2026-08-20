function finiteSorted(values) {
  return values.filter(Number.isFinite).sort((a, b) => a - b);
}

export function quantile(values, probability) {
  if (!(probability >= 0 && probability <= 1)) throw new RangeError("probability must be in [0, 1]");
  const sorted = finiteSorted(Array.from(values));
  if (!sorted.length) return Number.NaN;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower + 1] === undefined
    ? sorted[lower]
    : sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower]);
}

export function sampleRightContinuous(times, values, targetTime) {
  if (!times.length) return Number.NaN;
  if (targetTime < times[0]) return values[0];
  let low = 0;
  let high = times.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (times[middle] <= targetTime) low = middle + 1;
    else high = middle;
  }
  return values[Math.max(0, low - 1)];
}

export function sampleLinear(times, values, targetTime) {
  if (!times.length) return Number.NaN;
  if (targetTime <= times[0]) return values[0];
  if (targetTime >= times.at(-1)) return values.at(-1);
  let low = 1;
  let high = times.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (times[middle] < targetTime) low = middle + 1;
    else high = middle;
  }
  const right = low;
  const left = right - 1;
  const span = times[right] - times[left];
  return span === 0
    ? values[right]
    : values[left] + ((targetTime - times[left]) / span) * (values[right] - values[left]);
}

export function createCommonGrid(tMax, points = 501) {
  if (!Number.isFinite(tMax) || tMax <= 0) throw new RangeError("tMax must be positive");
  if (!Number.isInteger(points) || points < 2 || points > 10_001) {
    throw new RangeError("grid points must be an integer from 2 to 10001");
  }
  return Float64Array.from({ length: points }, (_, index) => (index * tMax) / (points - 1));
}

export function summarizeEnsemble(runs, grid, { mode = "continuous", quantiles = [0.05, 0.5, 0.95] } = {}) {
  const sampler = mode === "discrete" ? sampleRightContinuous : sampleLinear;
  const mean = new Float64Array(grid.length);
  const variance = new Float64Array(grid.length);
  const bands = quantiles.map(() => new Float64Array(grid.length));
  const included = runs.filter((run) => run?.times?.length && run?.values?.length === run.times.length);

  for (let gridIndex = 0; gridIndex < grid.length; gridIndex += 1) {
    const samples = finiteSorted(included.map((run) => sampler(run.times, run.values, grid[gridIndex])));
    if (!samples.length) {
      mean[gridIndex] = Number.NaN;
      variance[gridIndex] = Number.NaN;
      for (const band of bands) band[gridIndex] = Number.NaN;
      continue;
    }
    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    mean[gridIndex] = average;
    variance[gridIndex] = samples.length > 1
      ? samples.reduce((sum, value) => sum + (value - average) ** 2, 0) / (samples.length - 1)
      : 0;
    quantiles.forEach((probability, bandIndex) => {
      bands[bandIndex][gridIndex] = quantile(samples, probability);
    });
  }

  return {
    grid: grid.slice(),
    mean,
    variance,
    quantiles: Object.fromEntries(quantiles.map((probability, index) => [String(probability), bands[index]])),
    includedRuns: included.length,
    excludedRuns: runs.length - included.length,
  };
}
