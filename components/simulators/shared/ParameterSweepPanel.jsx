"use client";

import { useMemo, useRef, useState } from "react";
import { runParameterSweep } from "@/lib/analysis/sweep";
import { createCanonicalCoordinator, makeSimulationRequest } from "./canonicalSimulation";

function format(value) {
  return Number.isFinite(value) ? Number(value).toLocaleString(undefined, { maximumSignificantDigits: 5 }) : "—";
}

function terminalSamples(outcome, variableIndex) {
  const terminal = outcome.summaries?.ensemble?.terminal;
  if (!terminal || variableIndex < 0) return [];
  return Array.from({ length: terminal.retainedSamples }, (_, row) => terminal.values[row * terminal.stateCount + variableIndex]).filter(Number.isFinite);
}

function ResponseCurve({ result, parameterLabel }) {
  const cells = result.cells.filter((cell) => cell.status === "valid" && Number.isFinite(cell.mean));
  if (cells.length < 2) return <p>No valid response curve is available.</p>;
  const xs = cells.map((cell) => cell.coordinates[0]), ys = cells.map((cell) => cell.mean);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const screen = cells.map((cell) => ({ x: 56 + ((cell.coordinates[0] - minX) / (maxX - minX || 1)) * 458, y: 248 - ((cell.mean - minY) / (maxY - minY || 1)) * 202 }));
  const path = screen.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  return <svg className="sweep-svg" viewBox="0 0 560 290" role="img" aria-labelledby="sweep-curve-title sweep-curve-desc"><title id="sweep-curve-title">Parameter sweep response curve</title><desc id="sweep-curve-desc">Mean terminal response and confidence interval over {cells.length} values of {parameterLabel}.</desc><path className="plot-grid-line" d="M48 30V258H530" />{cells.map((cell, index) => { const yLow = 248 - ((cell.low - minY) / (maxY - minY || 1)) * 202; const yHigh = 248 - ((cell.high - minY) / (maxY - minY || 1)) * 202; return <path key={index} d={`M${screen[index].x},${yLow}V${yHigh}`} stroke="#b75436" />; })}<path d={path} fill="none" stroke="#146c72" strokeWidth="2.2" />{screen.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="3" fill="#146c72" />)}<text x="280" y="282" textAnchor="middle">{parameterLabel}</text></svg>;
}

function Heatmap({ result, onSelect }) {
  const valid = result.cells.filter((cell) => cell.status === "valid" && Number.isFinite(cell.mean));
  const min = Math.min(...valid.map((cell) => cell.mean)), max = Math.max(...valid.map((cell) => cell.mean));
  const columns = result.axes[1].values.length;
  return <div className="sweep-heatmap" style={{ gridTemplateColumns: `repeat(${columns}, minmax(34px, 1fr))` }} role="grid" aria-label="Two-parameter sweep heatmap">{result.cells.map((cell, index) => { const fraction = cell.status === "valid" ? (cell.mean - min) / (max - min || 1) : 0; return <button type="button" role="gridcell" key={index} disabled={cell.status !== "valid"} title={`${cell.coordinates.map(format).join(", ")}: ${format(cell.mean)}`} style={{ background: cell.status === "valid" ? `color-mix(in srgb, #146c72 ${20 + fraction * 75}%, #fffdfa)` : "#ddd" }} onClick={() => onSelect(cell)}><span className="sr-only">Parameters {cell.coordinates.map(format).join(", ")}; mean {format(cell.mean)}</span></button>; })}</div>;
}

export default function ParameterSweepPanel({ buildModel, rootSeed, onSelectAssignments }) {
  const [axisCount, setAxisCount] = useState(1);
  const [firstId, setFirstId] = useState("");
  const [secondId, setSecondId] = useState("");
  const [responseId, setResponseId] = useState("");
  const [bounds, setBounds] = useState({ firstMin: 0, firstMax: 1, secondMin: 0, secondMax: 1 });
  const [replicates, setReplicates] = useState(100);
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const cancelRef = useRef(null);
  const baseModel = useMemo(() => { try { return buildModel?.(1) ?? null; } catch { return null; } }, [buildModel]);
  const parameters = baseModel?.parameters ?? [], variables = baseModel?.variables ?? [];
  const selectedFirst = parameters.find((parameter) => parameter.id === firstId) ?? parameters[0];
  const selectedSecond = parameters.find((parameter) => parameter.id === secondId) ?? parameters.find((parameter) => parameter.id !== selectedFirst?.id);
  const selectedResponse = variables.find((variable) => variable.id === responseId) ?? variables[0];

  const run = async () => {
    if (!baseModel || !selectedFirst || !selectedResponse) { setError("A valid model with at least one parameter and variable is required."); return; }
    if (axisCount === 2 && !selectedSecond) { setError("Choose two distinct parameters."); return; }
    setStatus("running"); setError(""); setResult(null);
    const controller = new AbortController(); cancelRef.current = () => controller.abort();
    try {
      const axes = [{ parameterId: selectedFirst.id, min: Number(bounds.firstMin), max: Number(bounds.firstMax), points: axisCount === 1 ? 21 : 15 }];
      if (axisCount === 2) axes.push({ parameterId: selectedSecond.id, min: Number(bounds.secondMin), max: Number(bounds.secondMax), points: 15 });
      const coordinator = createCanonicalCoordinator();
      const sweep = await runParameterSweep({
        model: baseModel,
        definition: { axes, replicates: Number(replicates), response: selectedResponse.id, commonRandomNumbers: true },
        rootSeed,
        signal: controller.signal,
        onProgress: setProgress,
        simulateCell: async ({ model, replicates: cellRuns, response, signal }) => {
          const request = makeSimulationRequest({ ...model, settings: { ...model.settings, runs: cellRuns, seed: rootSeed } }, cellRuns, "summary");
          const job = coordinator.run(request);
          signal?.addEventListener("abort", job.cancel, { once: true });
          const outcome = await job.promise;
          if (outcome.status === "cancelled") throw Object.assign(new Error("Sweep cancelled."), { code: "CANCELLED" });
          return terminalSamples(outcome, model.variables.findIndex((variable) => variable.id === response));
        },
      });
      setResult(sweep); setStatus(sweep.status);
    } catch (event) {
      setError(event.message || "Sweep failed."); setStatus(controller.signal.aborted ? "cancelled" : "failed");
    } finally { cancelRef.current = null; }
  };

  const selectCell = (cell) => {
    const assignments = { [selectedFirst.name]: cell.coordinates[0] };
    if (axisCount === 2) assignments[selectedSecond.name] = cell.coordinates[1];
    onSelectAssignments?.(assignments);
  };
  const baselineIndex = result?.axes?.length === 1 ? result.axes[0].values.reduce((best, value, index, values) => Math.abs(value - selectedFirst.value) < Math.abs(values[best] - selectedFirst.value) ? index : best, 0) : -1;
  const sensitivity = baselineIndex > 0 && baselineIndex < (result?.cells.length ?? 0) - 1 && result.cells[baselineIndex - 1].status === "valid" && result.cells[baselineIndex + 1].status === "valid"
    ? (result.cells[baselineIndex + 1].mean - result.cells[baselineIndex - 1].mean) / (result.cells[baselineIndex + 1].coordinates[0] - result.cells[baselineIndex - 1].coordinates[0]) : null;

  return <details className="analysis-assistant"><summary>Parameter sweep and sensitivity</summary><div className="assistant-form"><label>Dimensions<select value={axisCount} onChange={(event) => setAxisCount(Number(event.target.value))}><option value="1">One parameter</option><option value="2">Two parameters</option></select></label><label>Parameter 1<select value={selectedFirst?.id ?? ""} onChange={(event) => setFirstId(event.target.value)}>{parameters.map((parameter) => <option key={parameter.id} value={parameter.id}>{parameter.label || parameter.name}</option>)}</select></label><label>Minimum<input type="number" value={bounds.firstMin} onChange={(event) => setBounds((value) => ({ ...value, firstMin: event.target.value }))} /></label><label>Maximum<input type="number" value={bounds.firstMax} onChange={(event) => setBounds((value) => ({ ...value, firstMax: event.target.value }))} /></label>{axisCount === 2 && <><label>Parameter 2<select value={selectedSecond?.id ?? ""} onChange={(event) => setSecondId(event.target.value)}>{parameters.filter((parameter) => parameter.id !== selectedFirst?.id).map((parameter) => <option key={parameter.id} value={parameter.id}>{parameter.label || parameter.name}</option>)}</select></label><label>Minimum 2<input type="number" value={bounds.secondMin} onChange={(event) => setBounds((value) => ({ ...value, secondMin: event.target.value }))} /></label><label>Maximum 2<input type="number" value={bounds.secondMax} onChange={(event) => setBounds((value) => ({ ...value, secondMax: event.target.value }))} /></label></>}<label>Response<select value={selectedResponse?.id ?? ""} onChange={(event) => setResponseId(event.target.value)}>{variables.map((variable) => <option key={variable.id} value={variable.id}>{variable.label || variable.name} terminal value</option>)}</select></label><label>Replicates<input type="number" min="1" max="100000" value={replicates} onChange={(event) => setReplicates(event.target.value)} /></label><div className="assistant-actions"><button type="button" onClick={run} disabled={status === "running"}>Run sweep</button>{status === "running" && <button type="button" onClick={() => cancelRef.current?.()}>Cancel</button>}</div></div>{status === "running" && <p aria-live="polite">{progress.completed} of {progress.total} cells complete.</p>}{error && <p role="alert" className="assistant-error">{error}</p>}{result?.status === "completed" && <div className="sweep-result">{axisCount === 1 ? <ResponseCurve result={result} parameterLabel={selectedFirst.label || selectedFirst.name} /> : <Heatmap result={result} onSelect={selectCell} />}<p>{sensitivity == null ? "Local centred sensitivity is unavailable at the nearest interior grid point." : `Centred finite-difference sensitivity near ${format(selectedFirst.value)}: ${format(sensitivity)}.`} Common random numbers used seed {rootSeed}; each cell includes {result.replicates} replicates.</p><div className="analysis-table-wrap"><table className="analysis-table"><caption>Sweep cells. Select a valid row to load it into the normal workspace and run a full simulation.</caption><thead><tr>{result.axes.map((axis) => <th key={axis.parameterId}>Parameter</th>)}<th>Mean</th><th>95% CI</th><th>Runs</th><th>Action</th></tr></thead><tbody>{result.cells.map((cell, index) => <tr key={index}>{cell.coordinates.map((coordinate, coordinateIndex) => <td key={coordinateIndex}>{format(coordinate)}</td>)}<td>{format(cell.mean)}</td><td>{cell.status === "valid" ? `${format(cell.low)}–${format(cell.high)}` : cell.error?.message}</td><td>{cell.sampleSize ?? 0}</td><td>{cell.status === "valid" && <button type="button" onClick={() => selectCell(cell)}>Load and run</button>}</td></tr>)}</tbody></table></div></div>}</details>;
}
