export const MEAN_GRAPH_KEY = "mean";
const MEAN_GRID_POINTS = 400;

export function listVariablePairs(variableNames = []) {
  const names = (Array.isArray(variableNames) ? variableNames : [])
    .map((name) => String(name ?? "").trim())
    .filter(Boolean);
  const pairs = [];
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      pairs.push({
        key: `${names[i]}\t${names[j]}`,
        xName: names[i],
        yName: names[j],
        label: `${names[i]} by ${names[j]}`,
      });
    }
  }
  return pairs;
}

export function runLineStyle(runCount) {
  const n = Number(runCount) || 0;
  if (n > 50) return { alpha: 0.15, lineWidth: 1 };
  if (n > 10) return { alpha: 0.3, lineWidth: 1 };
  if (n > 1) return { alpha: 0.6, lineWidth: 1.5 };
  return { alpha: 1, lineWidth: 2 };
}

function lastIndexAtOrBefore(times, t) {
  if (!Array.isArray(times) || times.length === 0) return -1;
  if (t <= times[0]) return 0;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (times[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function sampleStep(times, history, variableIndex, t) {
  const index = lastIndexAtOrBefore(times, t);
  if (index < 0) return null;
  const value = history?.[index]?.[variableIndex];
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

export function sampleLinear(times, history, variableIndex, t) {
  if (!Array.isArray(times) || times.length === 0) return null;
  if (t <= times[0]) return sampleStep(times, history, variableIndex, times[0]);
  const lastTime = times[times.length - 1];
  if (t >= lastTime) return sampleStep(times, history, variableIndex, lastTime);

  let lo = 0;
  let hi = times.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  const t0 = times[lo];
  const t1 = times[hi];
  const y0 = Number(history?.[lo]?.[variableIndex]);
  const y1 = Number(history?.[hi]?.[variableIndex]);
  if (!Number.isFinite(y0)) return Number.isFinite(y1) ? y1 : null;
  if (!Number.isFinite(y1) || t1 === t0) return y0;
  return y0 + ((y1 - y0) * (t - t0)) / (t1 - t0);
}

function runsShareTimes(runs) {
  const base = runs[0]?.times;
  if (!Array.isArray(base) || base.length === 0) return false;
  return runs.every((run) => {
    const times = run?.times;
    if (!Array.isArray(times) || times.length !== base.length) return false;
    if (times[0] !== base[0]) return false;
    if (times[times.length - 1] !== base[base.length - 1]) return false;
    if (base.length > 2 && times[1] !== base[1]) return false;
    return true;
  });
}

export function buildMeanTimeGrid(runs, xMax, pointCount = MEAN_GRID_POINTS) {
  const observedMax = Math.max(
    0,
    ...runs.map((run) => {
      const times = run?.times;
      if (!Array.isArray(times) || times.length === 0) return 0;
      return Number(times[times.length - 1]) || 0;
    }),
  );
  const end = Number.isFinite(Number(xMax)) && Number(xMax) > 0
    ? Number(xMax)
    : observedMax;
  const count = Math.max(2, Math.floor(pointCount));
  if (!Number.isFinite(end) || end <= 0) return [0];
  return Array.from({ length: count }, (_, index) => (end * index) / (count - 1));
}

export function buildPairDatasets({
  runs = [],
  xIndex,
  yIndex,
  color,
  stepped = false,
} = {}) {
  const { alpha, lineWidth } = runLineStyle(runs.length);
  return runs.map((run, runIndex) => {
    const times = Array.isArray(run?.times) ? run.times : [];
    const history = Array.isArray(run?.history) ? run.history : [];
    return {
      label: "",
      data: times.map((_, rowIndex) => ({
        x: Number(history[rowIndex]?.[xIndex]),
        y: Number(history[rowIndex]?.[yIndex]),
      })).filter(
        (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
      ),
      borderColor: color,
      backgroundColor: color,
      borderWidth: lineWidth,
      pointRadius: 0,
      seriesAlpha: alpha,
      ...(stepped ? { stepped: "after" } : {}),
      showLine: true,
      order: runIndex,
    };
  });
}

export function buildMeanDatasets({
  runs = [],
  variableNames = [],
  legendLabels = [],
  colors = [],
  xMax,
  interpolate = "step",
} = {}) {
  if (runs.length < 2 || variableNames.length === 0) return [];

  const sample = interpolate === "linear" ? sampleLinear : sampleStep;
  let grid;
  if (runsShareTimes(runs) && runs[0].times.length <= MEAN_GRID_POINTS * 4) {
    grid = runs[0].times;
  } else {
    grid = buildMeanTimeGrid(runs, xMax);
  }

  return variableNames.map((name, variableIndex) => {
    const color = colors[variableIndex];
    const data = grid.map((time) => {
      let sum = 0;
      let count = 0;
      runs.forEach((run) => {
        const value = sample(run.times, run.history, variableIndex, time);
        if (Number.isFinite(value)) {
          sum += value;
          count += 1;
        }
      });
      return {
        x: time,
        y: count > 0 ? sum / count : null,
      };
    }).filter((point) => Number.isFinite(point.y));

    return {
      label: legendLabels[variableIndex] || name,
      data,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2.5,
      pointRadius: 0,
      seriesAlpha: 1,
    };
  });
}
