"use client";

import { useMemo, useRef, useState } from "react";
import { compareSummarySeries } from "@/lib/analysis/convergence";
import { createCanonicalCoordinator, makeSimulationRequest } from "./canonicalSimulation";

function format(value) {
  return Number.isFinite(value)
    ? Number(value).toLocaleString(undefined, { maximumSignificantDigits: 5 })
    : "—";
}

function refinedModels(model) {
  if (model.solverFamily === "sde") {
    const dt = Number(model.settings.dt);
    return [dt, dt / 2, dt / 4].map((value) => ({
      label: `dt = ${format(value)}`,
      value,
      model: { ...model, settings: { ...model.settings, dt: value } },
    }));
  }
  if (model.settings.solver === "ctmp-piecewise-frozen-v1") {
    const maxStep = Number(model.settings.maxStep);
    return [maxStep, maxStep / 2, maxStep / 4].map((value) => ({
      label: `maximum interval = ${format(value)}`,
      value,
      model: { ...model, settings: { ...model.settings, maxStep: value } },
    }));
  }
  const tolerance = Number(model.settings.tolerance ?? 1e-7);
  return [tolerance, tolerance / 10, tolerance / 100].map((value) => ({
    label: `hazard tolerance = ${format(value)}`,
    value,
    model: { ...model, settings: { ...model.settings, tolerance: value } },
  }));
}

export default function ConvergenceAssistant({ buildModel, rootSeed }) {
  const [replicates, setReplicates] = useState(100);
  const [status, setStatus] = useState("idle");
  const [level, setLevel] = useState(0);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const cancelRef = useRef(null);
  const baseModel = useMemo(() => {
    try { return buildModel?.(1) ?? null; }
    catch { return null; }
  }, [buildModel]);

  const run = async () => {
    if (!baseModel) { setError("Repair the model before checking convergence."); return; }
    const runCount = Number(replicates);
    if (!Number.isSafeInteger(runCount) || runCount < 2 || runCount > 100_000) {
      setError("Replicates must be an integer from 2 to 100,000.");
      return;
    }
    const controller = new AbortController();
    cancelRef.current = () => controller.abort();
    setStatus("running"); setError(""); setReport(null); setLevel(0);
    try {
      const levels = refinedModels(baseModel);
      const summaries = [];
      for (let index = 0; index < levels.length; index += 1) {
        if (controller.signal.aborted) throw Object.assign(new Error("Convergence check cancelled."), { code: "CANCELLED" });
        setLevel(index + 1);
        const configured = { ...levels[index].model, settings: { ...levels[index].model.settings, runs: runCount, seed: rootSeed } };
        const coordinator = createCanonicalCoordinator();
        const job = coordinator.run(makeSimulationRequest(configured, runCount, "summary"));
        const cancel = () => job.cancel();
        controller.signal.addEventListener("abort", cancel, { once: true });
        const outcome = await job.promise;
        controller.signal.removeEventListener("abort", cancel);
        if (outcome.status === "cancelled") throw Object.assign(new Error("Convergence check cancelled."), { code: "CANCELLED" });
        if (!outcome.summaries?.ensemble?.terminal?.mean) throw new Error("A bounded terminal summary was not produced.");
        summaries.push(Array.from(outcome.summaries.ensemble.terminal.mean));
      }
      const coarseToMiddle = compareSummarySeries(summaries[0], summaries[1]);
      const middleToFine = compareSummarySeries(summaries[1], summaries[2]);
      setReport({ levels, summaries, coarseToMiddle, middleToFine, improving: middleToFine.rmse < coarseToMiddle.rmse });
      setStatus("complete");
    } catch (event) {
      setStatus(controller.signal.aborted ? "cancelled" : "failed");
      setError(event.message || "Convergence check failed.");
    } finally {
      cancelRef.current = null;
    }
  };

  return (
    <details className="analysis-assistant">
      <summary>Numerical convergence assistant</summary>
      <div className="assistant-form convergence-form">
        <label>Replicates per level<input type="number" min="2" max="100000" value={replicates} onChange={(event) => setReplicates(event.target.value)} /></label>
        <div className="assistant-actions"><button type="button" onClick={run} disabled={status === "running"}>Compare three levels</button>{status === "running" && <button type="button" onClick={() => cancelRef.current?.()}>Cancel</button>}</div>
      </div>
      {status === "running" && <p aria-live="polite">Running refinement level {level} of 3.</p>}
      {error && <p role="alert" className="assistant-error">{error}</p>}
      {report && <div className="convergence-report"><p><strong>{report.improving ? "Agreement improved under refinement." : "Agreement did not improve under refinement."}</strong> This is evidence about numerical resolution, not validation of the model.</p><div className="analysis-table-wrap"><table className="analysis-table"><caption>Terminal ensemble means and refinement comparisons using the same root seed.</caption><thead><tr><th>Level</th>{baseModel.variables.map((variable) => <th key={variable.id}>{variable.label || variable.name} mean</th>)}<th>RMSE to next</th><th>Relative RMSE</th></tr></thead><tbody>{report.levels.map((entry, index) => { const comparison = index === 0 ? report.coarseToMiddle : index === 1 ? report.middleToFine : null; return <tr key={entry.label}><th scope="row">{entry.label}</th>{report.summaries[index].map((value, variableIndex) => <td key={baseModel.variables[variableIndex].id}>{format(value)}</td>)}<td>{comparison ? format(comparison.rmse) : "reference"}</td><td>{comparison ? format(comparison.relativeRmse) : "reference"}</td></tr>; })}</tbody></table></div></div>}
    </details>
  );
}
