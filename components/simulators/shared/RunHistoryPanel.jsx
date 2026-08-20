"use client";

import { useCallback, useEffect, useState } from "react";
import { listLocalRuns, setLocalRunPreserved } from "@/lib/workspace/local-runs";

function dateLabel(value) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Unknown time";
}

export default function RunHistoryPanel({ modelId, enabled = false, localKey = null, refreshToken = 0 }) {
  const [runs, setRuns] = useState([]);
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if ((!enabled || !modelId) && !localKey) return;
    setState("loading");
    setError("");
    try {
      if (enabled && modelId) {
        const response = await fetch(`/api/saved-simulations/${encodeURIComponent(modelId)}/runs?limit=20`, { cache: "no-store" });
        if (!response.ok) throw new Error("Run history could not be loaded.");
        setRuns(await response.json());
      } else {
        setRuns(await listLocalRuns(localKey, { limit: 20 }));
      }
      setState("ready");
    } catch (event) {
      setError(event.message || "Run history could not be loaded.");
      setState("failed");
    }
  }, [enabled, localKey, modelId]);

  useEffect(() => { load(); }, [load, refreshToken]);

  const setPreserved = async (run) => {
    if (!enabled || !modelId) {
      try {
        const updated = await setLocalRunPreserved(localKey, run.id, !run.preserved);
        setRuns((items) => items.map((item) => item.id === updated.id ? updated : item));
      } catch (event) { setError(event.message || "Run preservation could not be changed."); }
      return;
    }
    const response = await fetch(`/api/saved-simulations/${encodeURIComponent(modelId)}/runs/${encodeURIComponent(run.id)}/preserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preserved: !run.preserved }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error || "Run preservation could not be changed.");
      return;
    }
    const updated = await response.json();
    setRuns((items) => items.map((item) => item.id === updated.id ? updated : item));
  };

  if ((!enabled || !modelId) && !localKey) return null;
  return (
    <details className="run-history-panel">
      <summary>{enabled && modelId ? "Private run history" : "Local run history"}</summary>
      <div className="run-history-heading">
        <p>Exact inputs and bounded summaries are retained {enabled && modelId ? "privately" : "on this device"}; trajectories are not stored.</p>
        <button type="button" onClick={load} disabled={state === "loading"}>Refresh</button>
      </div>
      {error && <p className="run-history-error" role="alert">{error}</p>}
      {state === "loading" && <p aria-live="polite">Loading run history…</p>}
      {state !== "loading" && runs.length === 0 && <p>No stored runs for this model yet.</p>}
      {runs.length > 0 && (
        <ol className="run-history-list">
          {runs.map((run) => (
            <li key={run.id}>
              <div><strong>{dateLabel(run.completedAt || run.createdAt)}</strong><span>{run.status} · {run.solver?.name || "solver"} · seed {run.seed}</span></div>
              <button type="button" aria-pressed={run.preserved} onClick={() => setPreserved(run)}>{run.preserved ? "Unpreserve" : "Preserve"}</button>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
