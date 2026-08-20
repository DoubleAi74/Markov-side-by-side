"use client";

import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import SimChart from "./SimChart";
import { autocorrelation, fanoFactor, firstPassageKaplanMeier, reactionDiagnostics, welchPsd } from "@/lib/analysis/diagnostics";

const PhaseThreePlot = lazy(() => import("./PhaseThreePlot"));
const EMPTY_PLOT_SPECS = Object.freeze([]);

const PLOTS = [
  { id: "time", label: "Time series" },
  { id: "phase", label: "Phase 2D" },
  { id: "phase3d", label: "Phase 3D" },
  { id: "phaseMatrix", label: "Phase matrix" },
  { id: "histogram", label: "Histogram" },
  { id: "pmf", label: "PMF" },
  { id: "kde", label: "KDE" },
  { id: "ecdf", label: "ECDF" },
  { id: "scatter", label: "Scatter" },
  { id: "hexbin", label: "Hexbin" },
  { id: "survival", label: "First passage" },
  { id: "reactions", label: "Reactions" },
  { id: "network", label: "Network" },
  { id: "acf", label: "ACF" },
  { id: "psd", label: "Welch PSD" },
  { id: "summary", label: "Summary" },
  { id: "diagnostics", label: "Diagnostics" },
];

const LEGACY_PLOT_KINDS = {
  "time-series": "time",
  "phase-2d": "phase",
  "phase-3d": "phase3d",
  "phase-matrix": "phaseMatrix",
};

function normalizePlotSpecs(specs) {
  const used = new Set();
  const normalized = [];
  for (const [index, spec] of (Array.isArray(specs) ? specs : []).entries()) {
    const kind = LEGACY_PLOT_KINDS[spec?.kind] ?? spec?.kind;
    if (!PLOTS.some((plot) => plot.id === kind) || used.has(kind)) continue;
    used.add(kind);
    normalized.push({ ...spec, id: String(spec?.id || `plot-${kind}-${index + 1}`), kind });
  }
  return normalized.length ? normalized : [{ id: "plot-time-1", kind: "time" }];
}

function numericPoints(dataset) {
  return (Array.isArray(dataset?.data) ? dataset.data : [])
    .map((point) => ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function format(value) {
  return Number.isFinite(value)
    ? Number(value).toLocaleString(undefined, { maximumSignificantDigits: 5 })
    : "—";
}

function quantile(ordered, probability) {
  if (!ordered.length) return NaN;
  const position = (ordered.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return ordered[lower] + (ordered[lower + 1] - ordered[lower] || 0) * fraction;
}

function sampleAt(dataset, time) {
  if (dataset?.rawTimes instanceof Float64Array && dataset?.rawValues instanceof Float64Array) {
    const times = dataset.rawTimes;
    if (!times.length) return NaN;
    const valueAt = (index) => dataset.rawValues[index * dataset.rawStateCount + dataset.rawVariableIndex];
    if (time <= times[0]) return valueAt(0);
    if (time >= times.at(-1)) return valueAt(times.length - 1);
    let low = 0;
    let high = times.length - 1;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (times[middle] <= time) low = middle;
      else high = middle;
    }
    if (dataset.stepped) return valueAt(low);
    const weight = (time - times[low]) / (times[high] - times[low] || 1);
    return valueAt(low) + weight * (valueAt(high) - valueAt(low));
  }
  const points = numericPoints(dataset);
  if (!points.length) return NaN;
  if (time <= points[0].x) return points[0].y;
  if (time >= points.at(-1).x) return points.at(-1).y;
  let upper = 1;
  while (upper < points.length && points[upper].x <= time) upper += 1;
  const left = points[upper - 1];
  const right = points[upper];
  if (dataset.stepped) return left.y;
  const weight = (time - left.x) / (right.x - left.x || 1);
  return left.y + weight * (right.y - left.y);
}

function variableKey(dataset, index) {
  return dataset.variableId ?? `variable-${dataset.variableIndex ?? index}`;
}

function phaseSeries(datasets, count) {
  const firstRun = Math.min(...datasets.map((dataset) => Number(dataset.runIndex ?? 0)));
  const seen = new Set();
  return datasets.filter((dataset, index) => {
    if (Number(dataset.runIndex ?? 0) !== firstRun) return false;
    const key = variableKey(dataset, index);
    if (seen.has(key) || seen.size >= count) return false;
    seen.add(key);
    return true;
  });
}

function PhasePlot({ datasets }) {
  const series = phaseSeries(datasets, 2);
  const x = numericPoints(series[0]);
  const y = numericPoints(series[1]);
  const hasAlignedRaw = series.length === 2 && series.every((dataset) => dataset.rawValues instanceof Float64Array) && series[0].rawTimes === series[1].rawTimes;
  const rawLength = hasAlignedRaw ? series[0].rawTimes.length : 0;
  const stride = Math.max(1, Math.ceil(rawLength / 2_000));
  const rawIndices = hasAlignedRaw ? Array.from({ length: Math.ceil(rawLength / stride) }, (_, index) => Math.min(index * stride, rawLength - 1)) : [];
  if (hasAlignedRaw && rawIndices.at(-1) !== rawLength - 1) rawIndices.push(rawLength - 1);
  const length = hasAlignedRaw ? rawIndices.length : Math.min(x.length, y.length);
  if (length < 2) return <div className="plot-empty">Run a model with at least two variables to inspect phase space.</div>;
  const points = hasAlignedRaw
    ? rawIndices.map((rowIndex) => series.map((dataset) => dataset.rawValues[rowIndex * dataset.rawStateCount + dataset.rawVariableIndex]))
    : Array.from({ length }, (_, index) => [x[index].y, y[index].y]);
  const minX = Math.min(...points.map((point) => point[0]));
  const maxX = Math.max(...points.map((point) => point[0]));
  const minY = Math.min(...points.map((point) => point[1]));
  const maxY = Math.max(...points.map((point) => point[1]));
  const screen = points.map(([px, py]) => ({
    x: 48 + ((px - minX) / (maxX - minX || 1)) * 474,
    y: 274 - ((py - minY) / (maxY - minY || 1)) * 232,
  }));
  const path = screen.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  return (
    <svg className="analysis-svg" viewBox="0 0 560 310" role="img" aria-labelledby="phase-title phase-desc">
      <title id="phase-title">Two-dimensional phase portrait</title>
      <desc id="phase-desc">{series[1]?.variableLabel || series[1]?.label} against {series[0]?.variableLabel || series[0]?.label}, for run {Number(series[0]?.runIndex ?? 0) + 1}. Circle marks the start and square marks the end.</desc>
      <path className="plot-grid-line" d="M48 30V274H530" />
      <path d={path} fill="none" stroke="#146c72" strokeWidth="2.2" />
      <circle cx={screen[0].x} cy={screen[0].y} r="5" fill="#146c72" />
      <rect x={screen.at(-1).x - 5} y={screen.at(-1).y - 5} width="10" height="10" fill="#b75436" />
      <text x="278" y="302" textAnchor="middle">{series[0]?.variableLabel || series[0]?.label}</text>
      <text x="16" y="155" transform="rotate(-90 16 155)" textAnchor="middle">{series[1]?.variableLabel || series[1]?.label}</text>
    </svg>
  );
}

function Histogram({ values, label, time }) {
  if (!values.length) return <div className="plot-empty">No finite samples are available at this time.</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const binCount = Math.max(1, Math.min(20, Math.ceil(Math.sqrt(values.length))));
  const width = (max - min || 1) / binCount;
  const bins = Array(binCount).fill(0);
  values.forEach((value) => {
    bins[Math.min(binCount - 1, Math.floor((value - min) / width))] += 1;
  });
  const maxCount = Math.max(...bins);
  return (
    <svg className="analysis-svg" viewBox="0 0 560 310" role="img" aria-labelledby="hist-title hist-desc">
      <title id="hist-title">Histogram of {label}</title>
      <desc id="hist-desc">A {binCount}-bin histogram of {values.length} independent run values sampled at time {format(time)}.</desc>
      <path className="plot-grid-line" d="M48 30V274H530" />
      {bins.map((count, index) => {
        const barWidth = 456 / binCount;
        const height = (count / (maxCount || 1)) * 218;
        return <rect key={index} x={58 + index * barWidth} y={264 - height} width={Math.max(1, barWidth - 2)} height={height} fill="#b75436" opacity="0.75" />;
      })}
      <text x="280" y="302" textAnchor="middle">{label} at t = {format(time)}</text>
    </svg>
  );
}

function Ecdf({ values, label, time }) {
  if (!values.length) return <div className="plot-empty">No finite samples are available at this time.</div>;
  const ordered = [...values].sort((a, b) => a - b);
  const min = ordered[0];
  const max = ordered.at(-1);
  const sx = (value) => 58 + ((value - min) / (max - min || 1)) * 456;
  const sy = (probability) => 264 - probability * 218;
  let path = `M${sx(ordered[0])},264`;
  ordered.forEach((value, index) => {
    const y = sy((index + 1) / ordered.length);
    path += ` V${y} H${sx(ordered[index + 1] ?? value)}`;
  });
  return (
    <svg className="analysis-svg" viewBox="0 0 560 310" role="img" aria-labelledby="ecdf-title ecdf-desc">
      <title id="ecdf-title">Empirical cumulative distribution of {label}</title>
      <desc id="ecdf-desc">Right-continuous empirical distribution of {values.length} independent run values sampled at time {format(time)}.</desc>
      <path className="plot-grid-line" d="M48 30V274H530" />
      <path d={path} fill="none" stroke="#146c72" strokeWidth="2.2" />
      <text x="280" y="302" textAnchor="middle">{label} at t = {format(time)}</text>
    </svg>
  );
}

function LineDiagnostic({ x, y, title, description, xLabel, yLabel, caution = "" }) {
  const pairs = Array.from({ length: Math.min(x.length, y.length) }, (_, index) => [Number(x[index]), Number(y[index])]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pairs.length < 2) return <div className="plot-empty">{caution || "Not enough finite samples are available."}</div>;
  const minX = Math.min(...pairs.map(([value]) => value));
  const maxX = Math.max(...pairs.map(([value]) => value));
  const minY = Math.min(...pairs.map(([, value]) => value));
  const maxY = Math.max(...pairs.map(([, value]) => value));
  const path = pairs.map(([px, py], index) => {
    const sx = 58 + ((px - minX) / (maxX - minX || 1)) * 456;
    const sy = 264 - ((py - minY) / (maxY - minY || 1)) * 218;
    return `${index ? "L" : "M"}${sx.toFixed(1)},${sy.toFixed(1)}`;
  }).join(" ");
  return <svg className="analysis-svg" viewBox="0 0 560 310" role="img" aria-labelledby={`${title}-title ${title}-desc`}><title id={`${title}-title`}>{description}</title><desc id={`${title}-desc`}>{description}. {caution}</desc><path className="plot-grid-line" d="M48 30V274H530" /><path d={path} fill="none" stroke="#146c72" strokeWidth="2.2" /><text x="280" y="302" textAnchor="middle">{xLabel}</text><text x="16" y="155" transform="rotate(-90 16 155)" textAnchor="middle">{yLabel}</text></svg>;
}

function Kde({ values, label, time }) {
  if (values.length < 2) return <div className="plot-empty">At least two finite ensemble samples are required for a KDE.</div>;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1));
  const bandwidth = Math.max(Number.EPSILON, 1.06 * (sd || Math.max(1, Math.abs(mean)) * 0.01) * values.length ** -0.2);
  const min = Math.min(...values) - 3 * bandwidth;
  const max = Math.max(...values) + 3 * bandwidth;
  const x = Float64Array.from({ length: 128 }, (_, index) => min + ((max - min) * index) / 127);
  const scale = 1 / (values.length * bandwidth * Math.sqrt(2 * Math.PI));
  const y = Float64Array.from(x, (point) => scale * values.reduce((sum, value) => sum + Math.exp(-0.5 * ((point - value) / bandwidth) ** 2), 0));
  return <LineDiagnostic x={x} y={y} title="kde" description={`Gaussian kernel density estimate of ${label} at time ${format(time)}`} xLabel={label} yLabel="Density" caution={`Bandwidth ${format(bandwidth)}. KDE smooths the empirical distribution and is intended for continuous variables.`} />;
}

function Scatter({ pairs, xLabel, yLabel, time }) {
  if (!pairs.length) return <div className="plot-empty">Choose two variables with finite values from the same runs.</div>;
  const minX = Math.min(...pairs.map(([x]) => x)), maxX = Math.max(...pairs.map(([x]) => x));
  const minY = Math.min(...pairs.map(([, y]) => y)), maxY = Math.max(...pairs.map(([, y]) => y));
  return <svg className="analysis-svg" viewBox="0 0 560 310" role="img" aria-labelledby="scatter-title scatter-desc"><title id="scatter-title">Across-run scatter plot</title><desc id="scatter-desc">{yLabel} against {xLabel} for {pairs.length} runs at time {format(time)}.</desc><path className="plot-grid-line" d="M48 30V274H530" />{pairs.slice(0, 5_000).map(([x, y], index) => <circle key={index} cx={58 + ((x - minX) / (maxX - minX || 1)) * 456} cy={264 - ((y - minY) / (maxY - minY || 1)) * 218} r="3" fill="#146c72" opacity=".55" />)}<text x="280" y="302" textAnchor="middle">{xLabel}</text><text x="16" y="155" transform="rotate(-90 16 155)" textAnchor="middle">{yLabel}</text></svg>;
}

function Pmf({ values, label, time, discrete }) {
  if (!discrete) return <div className="plot-empty">PMF is available for discrete jump-process states; use the histogram or KDE for continuous variables.</div>;
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const entries = [...counts].sort((left, right) => left[0] - right[0]);
  if (!entries.length) return <div className="plot-empty">No finite samples are available.</div>;
  const min = entries[0][0], max = entries.at(-1)[0], peak = Math.max(...entries.map((entry) => entry[1] / values.length));
  return <svg className="analysis-svg" viewBox="0 0 560 310" role="img" aria-labelledby="pmf-title pmf-desc"><title id="pmf-title">Probability mass function of {label}</title><desc id="pmf-desc">Empirical probability masses from {values.length} independent runs at time {format(time)}.</desc><path className="plot-grid-line" d="M48 30V274H530" />{entries.slice(0, 500).map(([value, count]) => { const x = 58 + ((value - min) / (max - min || 1)) * 456; const y = 264 - ((count / values.length) / (peak || 1)) * 218; return <g key={value}><path d={`M${x},264V${y}`} stroke="#146c72" strokeWidth="2"/><circle cx={x} cy={y} r="3" fill="#146c72"/></g>; })}<text x="280" y="302" textAnchor="middle">{label} at t = {format(time)}</text></svg>;
}

function Hexbin({ pairs, xLabel, yLabel, time }) {
  if (!pairs.length) return <div className="plot-empty">Choose two variables with finite values from the same runs.</div>;
  const minX = Math.min(...pairs.map(([x]) => x)), maxX = Math.max(...pairs.map(([x]) => x));
  const minY = Math.min(...pairs.map(([, y]) => y)), maxY = Math.max(...pairs.map(([, y]) => y));
  const bins = new Map();
  pairs.forEach(([x, y]) => { const column = Math.min(19, Math.floor(((x - minX) / (maxX - minX || 1)) * 20)); const row = Math.min(14, Math.floor(((y - minY) / (maxY - minY || 1)) * 15)); const key = `${column}:${row}`; bins.set(key, (bins.get(key) ?? 0) + 1); });
  const peak = Math.max(...bins.values());
  const polygon = (x, y, radius = 10) => Array.from({ length: 6 }, (_, index) => { const angle = Math.PI / 3 * index; return `${x + radius * Math.cos(angle)},${y + radius * Math.sin(angle)}`; }).join(" ");
  return <svg className="analysis-svg" viewBox="0 0 560 310" role="img" aria-labelledby="hex-title hex-desc"><title id="hex-title">Hexagonal density plot</title><desc id="hex-desc">Binned density of {yLabel} against {xLabel} for {pairs.length} runs at time {format(time)}.</desc><path className="plot-grid-line" d="M48 30V274H530" />{[...bins].map(([key, count]) => { const [column, row] = key.split(":").map(Number); const x = 69 + column * 23 + (row % 2) * 11.5; const y = 250 - row * 14.5; return <polygon key={key} points={polygon(x, y)} fill="#146c72" opacity={0.15 + 0.85 * count / peak}/>; })}<text x="280" y="302" textAnchor="middle">{xLabel}</text></svg>;
}

function PhaseMatrix({ datasets, variables }) {
  const chosen = variables.slice(0, 6);
  if (chosen.length < 2) return <div className="plot-empty">At least two variables are required for a phase matrix.</div>;
  const run = Math.min(...datasets.map((dataset) => Number(dataset.runIndex ?? 0)));
  const byVariable = new Map(datasets.filter((dataset) => Number(dataset.runIndex ?? 0) === run).map((dataset, index) => [variableKey(dataset, index), dataset]));
  const size = 480 / chosen.length;
  return <svg className="analysis-svg" viewBox="0 0 560 540" role="img" aria-labelledby="matrix-title matrix-desc"><title id="matrix-title">Pairwise phase matrix</title><desc id="matrix-desc">Pairwise state-space projections for the first retained run and up to six variables.</desc>{chosen.flatMap((yVariable, row) => chosen.map((xVariable, column) => {
    const xDataset = byVariable.get(xVariable.key), yDataset = byVariable.get(yVariable.key);
    const x = numericPoints(xDataset).map((point) => point.y), y = numericPoints(yDataset).map((point) => point.y), length = Math.min(x.length, y.length);
    const left = 58 + column * size, top = 24 + row * size;
    if (row === column) return <g key={`${row}:${column}`}><rect x={left} y={top} width={size} height={size} fill="#f3efe5" stroke="#ccd2cf"/><text x={left + size / 2} y={top + size / 2} textAnchor="middle">{xVariable.label}</text></g>;
    const minX = Math.min(...x), maxX = Math.max(...x), minY = Math.min(...y), maxY = Math.max(...y), stride = Math.max(1, Math.ceil(length / 250));
    const path = Array.from({ length: Math.ceil(length / stride) }, (_, index) => Math.min(index * stride, length - 1)).map((index, pointIndex) => `${pointIndex ? "L" : "M"}${left + 5 + ((x[index] - minX) / (maxX - minX || 1)) * (size - 10)},${top + size - 5 - ((y[index] - minY) / (maxY - minY || 1)) * (size - 10)}`).join(" ");
    return <g key={`${row}:${column}`}><rect x={left} y={top} width={size} height={size} fill="#fffdfa" stroke="#ccd2cf"/><path d={path} fill="none" stroke="#146c72" strokeWidth="1"/></g>;
  }))}</svg>;
}

function SurvivalPlot({ datasets, label, threshold }) {
  const observations = datasets.map((dataset) => {
    const points = dataset.rawTimes instanceof Float64Array ? Array.from({ length: dataset.rawTimes.length }, (_, index) => ({ x: dataset.rawTimes[index], y: dataset.rawValues[index * dataset.rawStateCount + dataset.rawVariableIndex] })) : numericPoints(dataset);
    const reached = points.find((point) => point.y >= threshold);
    return { time: reached?.x ?? points.at(-1)?.x ?? 0, reached: Boolean(reached) };
  });
  const result = firstPassageKaplanMeier(observations);
  if (!result.included) return <div className="plot-empty">No valid runs are available for first-passage analysis.</div>;
  const maxTime = Math.max(...result.curve.map((point) => point.time), 1);
  let path = "M58,46";
  result.curve.slice(1).forEach((point) => { const x = 58 + point.time / maxTime * 456; const y = 264 - point.survival * 218; path += ` H${x} V${y}`; });
  return <svg className="analysis-svg" viewBox="0 0 560 310" role="img" aria-labelledby="survival-title survival-desc"><title id="survival-title">First-passage Kaplan–Meier curve</title><desc id="survival-desc">Probability that {label} has not yet reached {format(threshold)}, with {observations.filter((entry) => !entry.reached).length} right-censored runs.</desc><path className="plot-grid-line" d="M48 30V274H530"/><path d={path} fill="none" stroke="#146c72" strokeWidth="2.2"/><text x="280" y="302" textAnchor="middle">First-passage time</text></svg>;
}

function ReactionPanel({ datasets, selectedValues, selectedLabel }) {
  const byRun = new Map();
  datasets.forEach((dataset) => { if (!byRun.has(dataset.runIndex ?? 0)) byRun.set(dataset.runIndex ?? 0, dataset); });
  const diagnostics = [...byRun.values()].map((dataset) => reactionDiagnostics({ transitionIds: dataset.rawTransitionIds ?? [], times: dataset.rawTimes ?? Float64Array.from(numericPoints(dataset).map((point) => point.x)) }));
  const counts = {};
  diagnostics.forEach((entry) => Object.entries(entry.counts).forEach(([id, count]) => { counts[id] = (counts[id] ?? 0) + count; }));
  const waiting = diagnostics.flatMap((entry) => [...entry.waitingTimes]);
  const extinct = selectedValues.filter((value) => value <= 0).length;
  if (!Object.keys(counts).length) return <div className="plot-empty">Reaction diagnostics are available for jump-process results containing events.</div>;
  return <div className="analysis-table-wrap"><table className="analysis-table"><caption>Reaction counts across {diagnostics.length} retained runs. Mean waiting time {format(waiting.reduce((sum, value) => sum + value, 0) / waiting.length)}; {selectedLabel} extinction at the selected time {extinct}/{selectedValues.length}; Fano factor {format(fanoFactor(selectedValues))}.</caption><thead><tr><th>Transition ID</th><th>Total count</th><th>Mean per run</th></tr></thead><tbody>{Object.entries(counts).map(([id, count]) => <tr key={id}><th scope="row">{id}</th><td>{count}</td><td>{format(count / diagnostics.length)}</td></tr>)}</tbody></table></div>;
}

function NetworkPanel({ model }) {
  if (!model?.transitions?.length) return <div className="plot-empty">Reaction-network and stoichiometry views are available for jump models.</div>;
  const names = new Map(model.variables.map((variable) => [variable.id, variable.label || variable.name]));
  return <div className="analysis-table-wrap"><table className="analysis-table"><caption>Reaction network and stoichiometry matrix. Columns are stable variable identities.</caption><thead><tr><th>Transition</th><th>Rate</th>{model.variables.map((variable) => <th key={variable.id}>{variable.label || variable.name}</th>)}</tr></thead><tbody>{model.transitions.map((transition) => { const changes = new Map(transition.changes.map((change) => [change.variableId, change.delta])); return <tr key={transition.id}><th scope="row">{transition.name}</th><td>{transition.rate}</td>{model.variables.map((variable) => <td key={variable.id} title={names.get(variable.id)}>{changes.get(variable.id) ?? 0}</td>)}</tr>; })}</tbody></table></div>;
}

function SummaryTable({ rows, time, compact = false }) {
  if (!rows.length) return <div className="plot-empty">Summary statistics appear after a successful run.</div>;
  return (
    <div className="analysis-table-wrap" tabIndex="0" aria-label="Scrollable ensemble statistics">
      <table className="analysis-table">
        <caption>{compact ? "Data-table alternative for the current ensemble." : `Across-run statistics at t = ${format(time)}.`}</caption>
        <thead><tr><th>Variable</th><th>Included</th><th>Excluded</th><th>Mean</th><th>SD</th><th>Q05</th><th>Median</th><th>Q95</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key}><th scope="row">{row.label}</th><td>{row.included}</td><td>{row.excluded}</td><td>{format(row.mean)}</td><td>{format(row.sd)}</td><td>{format(row.q05)}</td><td>{format(row.median)}</td><td>{format(row.q95)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 0);
  }, "image/png");
}

export default function ScientificPlotLab({
  datasets = [],
  legendItems = [],
  chartProps = {},
  solverLabel = "Stochastic solver",
  resultStatus = "idle",
  provenance = null,
  initialPlotSpecs = EMPTY_PLOT_SPECS,
  onPlotSpecsChange = null,
}) {
  const [activePlot, setActivePlot] = useState("time");
  const [plotSpecs, setPlotSpecs] = useState(() => normalizePlotSpecs(initialPlotSpecs));
  const [showTable, setShowTable] = useState(false);
  const [pngScale, setPngScale] = useState(2);
  const [pngBackground, setPngBackground] = useState("white");
  const [analysisTime, setAnalysisTime] = useState(0);
  const [selectedVariable, setSelectedVariable] = useState("");
  const [secondVariable, setSecondVariable] = useState("");
  const [passageThreshold, setPassageThreshold] = useState(1);
  const figureRefs = useRef(new Map());
  const tabRefs = useRef([]);
  const tabsId = useId();

  useEffect(() => {
    setPlotSpecs(normalizePlotSpecs(initialPlotSpecs));
  }, [initialPlotSpecs]);

  const commitPlotSpecs = (nextOrUpdater) => {
    setPlotSpecs((current) => {
      const next = normalizePlotSpecs(typeof nextOrUpdater === "function" ? nextOrUpdater(current) : nextOrUpdater);
      onPlotSpecsChange?.(next);
      return next;
    });
  };

  const variables = useMemo(() => {
    const seen = new Map();
    datasets.forEach((dataset, index) => {
      const key = variableKey(dataset, index);
      if (!seen.has(key)) seen.set(key, { key, label: dataset.variableLabel || dataset.label || `Variable ${seen.size + 1}` });
    });
    return [...seen.values()];
  }, [datasets]);
  const maxTime = useMemo(() => Math.max(0, ...datasets.flatMap((dataset) => numericPoints(dataset).map((point) => point.x))), [datasets]);

  useEffect(() => {
    setAnalysisTime(maxTime);
  }, [maxTime]);
  useEffect(() => {
    if (!variables.some((variable) => variable.key === selectedVariable)) setSelectedVariable(variables[0]?.key ?? "");
  }, [selectedVariable, variables]);
  useEffect(() => {
    if (!variables.some((variable) => variable.key === secondVariable) || secondVariable === selectedVariable) {
      setSecondVariable(variables.find((variable) => variable.key !== selectedVariable)?.key ?? selectedVariable);
    }
  }, [secondVariable, selectedVariable, variables]);

  const selectedDatasets = useMemo(() => datasets.filter((dataset, index) => variableKey(dataset, index) === selectedVariable), [datasets, selectedVariable]);
  const selectedSamples = useMemo(() => selectedDatasets.map((dataset) => sampleAt(dataset, analysisTime)), [analysisTime, selectedDatasets]);
  const selectedValues = useMemo(() => selectedSamples.filter(Number.isFinite), [selectedSamples]);
  const selectedLabel = variables.find((variable) => variable.key === selectedVariable)?.label ?? "Selected variable";
  const secondLabel = variables.find((variable) => variable.key === secondVariable)?.label ?? "Second variable";
  const scatterPairs = useMemo(() => {
    const secondByRun = new Map(datasets.filter((dataset, index) => variableKey(dataset, index) === secondVariable).map((dataset) => [dataset.runIndex ?? 0, sampleAt(dataset, analysisTime)]));
    return selectedDatasets.map((dataset) => [sampleAt(dataset, analysisTime), secondByRun.get(dataset.runIndex ?? 0)]).filter(([left, right]) => Number.isFinite(left) && Number.isFinite(right));
  }, [analysisTime, datasets, secondVariable, selectedDatasets]);
  const pathDiagnostic = useMemo(() => {
    const dataset = selectedDatasets[0];
    if (!dataset) return null;
    const points = numericPoints(dataset);
    const values = dataset.rawValues instanceof Float64Array
      ? Float64Array.from({ length: dataset.rawTimes.length }, (_, index) => dataset.rawValues[index * dataset.rawStateCount + dataset.rawVariableIndex])
      : Float64Array.from(points.map((point) => point.y));
    const times = dataset.rawTimes instanceof Float64Array ? dataset.rawTimes : Float64Array.from(points.map((point) => point.x));
    if (values.length < 4) return { values, times, acf: new Float64Array(), psd: null, caution: "At least four retained points are required." };
    const acf = autocorrelation(values);
    if (dataset.stepped) return { values, times, acf, psd: null, caution: "Welch PSD is not shown for irregular jump paths; resample deliberately before spectral analysis." };
    const span = times.at(-1) - times[0];
    if (!(span > 0)) return { values, times, acf, psd: null, caution: "A positive observation interval is required." };
    const uniformCount = Math.min(2_048, Math.max(4, values.length));
    const interval = span / (uniformCount - 1);
    const uniformValues = Float64Array.from({ length: uniformCount }, (_, index) => sampleAt(dataset, times[0] + index * interval));
    const psd = welchPsd(uniformValues, interval);
    return { values, times, acf, psd, caution: `${psd.caution} The displayed path was linearly resampled to ${uniformCount} uniform points.` };
  }, [selectedDatasets]);
  const summaryRows = useMemo(() => variables.map((variable) => {
    const series = datasets.filter((dataset, index) => variableKey(dataset, index) === variable.key);
    const samples = series.map((dataset) => sampleAt(dataset, analysisTime));
    const values = samples.filter(Number.isFinite);
    const ordered = [...values].sort((a, b) => a - b);
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
    const variance = values.length > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1) : NaN;
    return { key: variable.key, label: variable.label, included: values.length, excluded: samples.length - values.length, mean, sd: Math.sqrt(variance), q05: quantile(ordered, 0.05), median: quantile(ordered, 0.5), q95: quantile(ordered, 0.95) };
  }), [analysisTime, datasets, variables]);
  const runCount = useMemo(() => new Set(datasets.map((dataset) => dataset.runIndex ?? 0)).size, [datasets]);
  const modelSnapshot = datasets[0]?.modelSnapshot ?? null;
  const counts = useMemo(() => ({ series: datasets.length, runs: runCount, points: datasets.reduce((sum, dataset) => sum + (dataset.data?.length || 0), 0) }), [datasets, runCount]);

  const handleTabKeyDown = (event, index) => {
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % PLOTS.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + PLOTS.length) % PLOTS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = PLOTS.length - 1;
    else return;
    event.preventDefault();
    setActivePlot(PLOTS[next].id);
    tabRefs.current[next]?.focus();
  };

  const drawableForFigure = async (figure, kind) => {
    const source = kind === "time" ? figure?.querySelector("canvas") : figure?.querySelector("svg");
    if (source instanceof HTMLCanvasElement) return source;
    if (!source) return null;
    const clone = source.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.insertAdjacentHTML("afterbegin", "<style>text{font-family:system-ui,sans-serif;fill:#172033}.plot-grid-line{stroke:#94a3b8;fill:none}</style>");
    const href = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("The plot image could not be rasterised."));
        image.src = href;
      });
    } finally {
      URL.revokeObjectURL(href);
    }
  };

  const drawExportCard = async (context, figure, kind, top, width, plotHeight) => {
    const drawable = await drawableForFigure(figure, kind);
    if (drawable) context.drawImage(drawable, 0, top, width, plotHeight);
    else {
      context.fillStyle = "#172033";
      context.font = "600 24px system-ui, sans-serif";
      context.fillText(PLOTS.find((plot) => plot.id === kind)?.label ?? "Analysis", 24, top + 42);
      context.font = "14px system-ui, sans-serif";
      const words = String(figure?.innerText ?? "No tabular values are available.").replace(/\s+/g, " ").split(" ");
      let line = "", y = top + 76;
      for (const word of words) {
        const candidate = `${line} ${word}`.trim();
        if (context.measureText(candidate).width > width - 48) {
          context.fillText(line, 24, y); line = word; y += 24;
          if (y > top + plotHeight - 24) break;
        } else line = candidate;
      }
      if (line && y <= top + plotHeight - 24) context.fillText(line, 24, y);
    }
    context.fillStyle = "#172033";
    context.font = "600 16px system-ui, sans-serif";
    context.fillText(`${PLOTS.find((plot) => plot.id === kind)?.label} · ${solverLabel} · ${provenance?.precision ?? "f64"}`, 18, top + plotHeight + 28);
    context.font = "13px system-ui, sans-serif";
    context.fillText(`Seed ${provenance?.seed ?? "not recorded"} · model ${provenance?.modelHash?.slice(0, 16) ?? "local"}`, 18, top + plotHeight + 52);
  };

  const exportPng = async () => {
    if (resultStatus !== "fresh") return;
    const spec = plotSpecs.find((item) => item.kind === activePlot) ?? plotSpecs[0];
    const figure = figureRefs.current.get(spec.id);
    const scale = Number(pngScale);
    const width = 1120, plotHeight = 620, captionHeight = 72;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = (plotHeight + captionHeight) * scale;
    const context = canvas.getContext("2d");
    context.scale(scale, scale);
    if (pngBackground === "white") { context.fillStyle = "#fffdfa"; context.fillRect(0, 0, width, plotHeight + captionHeight); }
    await drawExportCard(context, figure, spec.kind, 0, width, plotHeight);
    downloadCanvas(canvas, `markov-lab-${spec.kind}-${scale}x.png`);
  };

  const exportAllPng = async () => {
    if (resultStatus !== "fresh") return;
    const width = 1120, plotHeight = 620, captionHeight = 72, cardHeight = plotHeight + captionHeight;
    const requestedScale = Number(pngScale);
    const scale = Math.min(requestedScale, Math.max(1, Math.floor(16_000 / (cardHeight * plotSpecs.length))));
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = cardHeight * plotSpecs.length * scale;
    const context = canvas.getContext("2d");
    context.scale(scale, scale);
    if (pngBackground === "white") { context.fillStyle = "#fffdfa"; context.fillRect(0, 0, width, cardHeight * plotSpecs.length); }
    for (const [index, spec] of plotSpecs.entries()) {
      await drawExportCard(context, figureRefs.current.get(spec.id), spec.kind, index * cardHeight, width, plotHeight);
    }
    downloadCanvas(canvas, `markov-lab-all-plots-${scale}x.png`);
  };

  const addPlotCard = () => {
    if (plotSpecs.some((spec) => spec.kind === activePlot)) return;
    commitPlotSpecs((current) => [...current, { id: `plot-${activePlot}-${current.length + 1}`, kind: activePlot }]);
  };

  const removePlotCard = (id) => commitPlotSpecs((current) => current.filter((spec) => spec.id !== id));
  const movePlotCard = (id, direction) => commitPlotSpecs((current) => {
    const index = current.findIndex((spec) => spec.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const needsEnsembleControls = ["histogram", "pmf", "kde", "ecdf", "scatter", "hexbin", "summary", "reactions"].includes(activePlot);
  const needsVariableControl = ["histogram", "pmf", "kde", "ecdf", "scatter", "hexbin", "summary", "acf", "psd", "survival", "reactions"].includes(activePlot);
  const plotContent = (kind) => <>
    {kind === "time" && <SimChart datasets={datasets} legendItems={legendItems} {...chartProps} />}
    {kind === "phase" && <PhasePlot datasets={datasets} />}
    {kind === "phase3d" && <Suspense fallback={<div className="plot-empty">Loading 3D renderer…</div>}><PhaseThreePlot datasets={phaseSeries(datasets, 3)} /></Suspense>}
    {kind === "phaseMatrix" && <PhaseMatrix datasets={datasets} variables={variables} />}
    {kind === "histogram" && <Histogram values={selectedValues} label={selectedLabel} time={analysisTime} />}
    {kind === "pmf" && <Pmf values={selectedValues} label={selectedLabel} time={analysisTime} discrete={selectedDatasets.some((dataset) => dataset.stepped)} />}
    {kind === "kde" && <Kde values={selectedValues} label={selectedLabel} time={analysisTime} />}
    {kind === "ecdf" && <Ecdf values={selectedValues} label={selectedLabel} time={analysisTime} />}
    {kind === "scatter" && <Scatter pairs={scatterPairs} xLabel={selectedLabel} yLabel={secondLabel} time={analysisTime} />}
    {kind === "hexbin" && <Hexbin pairs={scatterPairs} xLabel={selectedLabel} yLabel={secondLabel} time={analysisTime} />}
    {kind === "survival" && <SurvivalPlot datasets={selectedDatasets} label={selectedLabel} threshold={passageThreshold} />}
    {kind === "reactions" && <ReactionPanel datasets={datasets} selectedValues={selectedValues} selectedLabel={selectedLabel} />}
    {kind === "network" && <NetworkPanel model={modelSnapshot} />}
    {kind === "acf" && <LineDiagnostic x={pathDiagnostic ? Float64Array.from({ length: pathDiagnostic.acf.length }, (_, index) => index) : []} y={pathDiagnostic?.acf ?? []} title="acf" description={`Autocorrelation of ${selectedLabel} for the first retained run`} xLabel="Lag (samples)" yLabel="Autocorrelation" caution="ACF describes one retained path; dependence reduces the effective sample size." />}
    {kind === "psd" && <LineDiagnostic x={pathDiagnostic?.psd?.frequency ?? []} y={pathDiagnostic?.psd?.power ?? []} title="psd" description={`Welch power spectral density of ${selectedLabel} for the first retained run`} xLabel="Frequency" yLabel="Power" caution={pathDiagnostic?.caution ?? "Run a continuous-path model to inspect its spectrum."} />}
    {kind === "summary" && <SummaryTable rows={summaryRows} time={analysisTime} />}
    {kind === "diagnostics" && <div className="diagnostic-grid"><div><strong>{counts.runs}</strong><span>independent runs</span></div><div><strong>{counts.points.toLocaleString()}</strong><span>rendered points</span></div><div><strong>{solverLabel}</strong><span>numerical method</span></div><p>Diagnostics describe this retained result. Check convergence at more than one step size before drawing quantitative conclusions.</p></div>}
  </>;
  return (
    <section className="plot-lab" aria-labelledby="analysis-heading">
      <div className="plot-lab-header">
        <div><p className="eyebrow">Analysis workspace</p><h2 id="analysis-heading">Inspect the stochastic output</h2></div>
        <div className="plot-actions">
          <button type="button" onClick={() => setShowTable((value) => !value)} aria-expanded={showTable}>Data table</button>
          <label><span className="sr-only">PNG scale</span><select value={pngScale} onChange={(event) => setPngScale(event.target.value)}><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
          <label><span className="sr-only">PNG background</span><select value={pngBackground} onChange={(event) => setPngBackground(event.target.value)}><option value="white">White</option><option value="transparent">Transparent</option></select></label>
          <button type="button" onClick={addPlotCard} disabled={plotSpecs.some((spec) => spec.kind === activePlot)}>Add plot card</button>
          <button type="button" onClick={exportPng} disabled={!datasets.length || resultStatus !== "fresh"} title={resultStatus === "stale" ? "Run the changed model before exporting" : undefined}>Export PNG</button>
          <button type="button" onClick={exportAllPng} disabled={!datasets.length || resultStatus !== "fresh" || plotSpecs.length < 2}>Export all plots</button>
        </div>
      </div>
      <div className="plot-tabs" role="tablist" aria-label="Result plots">
        {PLOTS.map((plot, index) => <button id={`${tabsId}-${plot.id}-tab`} aria-controls={`${tabsId}-${plot.id}-panel`} ref={(node) => { tabRefs.current[index] = node; }} key={plot.id} type="button" role="tab" tabIndex={activePlot === plot.id ? 0 : -1} aria-selected={activePlot === plot.id} onKeyDown={(event) => handleTabKeyDown(event, index)} onClick={() => setActivePlot(plot.id)}>{plot.label}</button>)}
      </div>
      {needsVariableControl && variables.length > 0 && (
        <div className="analysis-controls">
          <label>Variable <select value={selectedVariable} onChange={(event) => setSelectedVariable(event.target.value)}>{variables.map((variable) => <option key={variable.key} value={variable.key}>{variable.label}</option>)}</select></label>
          {["scatter", "hexbin"].includes(activePlot) && <label>Second variable <select value={secondVariable} onChange={(event) => setSecondVariable(event.target.value)}>{variables.map((variable) => <option key={variable.key} value={variable.key}>{variable.label}</option>)}</select></label>}
          {needsEnsembleControls && <label>Analysis time <input type="range" min="0" max={maxTime || 1} step={(maxTime || 1) / 500} value={analysisTime} onChange={(event) => setAnalysisTime(Number(event.target.value))} /><output>{format(analysisTime)}</output></label>}
          {activePlot === "survival" && <label>Passage threshold <input type="number" step="any" value={passageThreshold} onChange={(event) => setPassageThreshold(Number(event.target.value))} /></label>}
        </div>
      )}
      <div className="plot-card-stack" aria-label="Ordered plot cards">
        {plotSpecs.map((spec, index) => {
          const label = PLOTS.find((plot) => plot.id === spec.kind)?.label ?? spec.kind;
          return (
            <figure key={spec.id} ref={(node) => { if (node) figureRefs.current.set(spec.id, node); else figureRefs.current.delete(spec.id); }} className={`analysis-figure plot-card ${spec.kind === activePlot ? "plot-card-active" : ""}`} aria-labelledby={`${tabsId}-${spec.id}-caption`}>
              <div className="plot-card-toolbar">
                <strong>{index + 1}. {label}</strong>
                <div>
                  <button type="button" onClick={() => { setActivePlot(spec.kind); document.getElementById(`${tabsId}-${spec.kind}-tab`)?.focus(); }}>Edit controls</button>
                  <button type="button" onClick={() => movePlotCard(spec.id, -1)} disabled={index === 0} aria-label={`Move ${label} up`}>↑</button>
                  <button type="button" onClick={() => movePlotCard(spec.id, 1)} disabled={index === plotSpecs.length - 1} aria-label={`Move ${label} down`}>↓</button>
                  <button type="button" onClick={() => removePlotCard(spec.id)} disabled={plotSpecs.length === 1} aria-label={`Remove ${label}`}>Remove</button>
                </div>
              </div>
              <div id={`${tabsId}-${spec.kind}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${spec.kind}-tab`} tabIndex="0" className="analysis-canvas">
                {plotContent(spec.kind)}
              </div>
              <figcaption id={`${tabsId}-${spec.id}-caption`}><strong>{label}.</strong> {resultStatus === "stale" ? "These results predate the current inputs; rerun before export." : `Current result: ${counts.runs} run${counts.runs === 1 ? "" : "s"}.`} {provenance ? `${provenance.solver} ${provenance.solverVersion}, ${provenance.backend} ${provenance.precision}; seed ${provenance.seed}.` : "Provenance appears after a successful run."} {["histogram", "pmf", "kde", "ecdf", "scatter", "hexbin", "summary", "reactions"].includes(spec.kind) ? `Included ${selectedValues.length}; excluded ${selectedSamples.length - selectedValues.length} for ${selectedLabel} at t=${format(analysisTime)}.` : ""}</figcaption>
            </figure>
          );
        })}
      </div>
      {showTable && <SummaryTable rows={summaryRows} time={analysisTime} compact />}
    </section>
  );
}
