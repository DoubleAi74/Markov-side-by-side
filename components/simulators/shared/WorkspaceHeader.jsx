"use client";

const UINT64_MAX = 18446744073709551615n;

function validSeed(value) {
  try {
    return /^(0|[1-9]\d*)$/.test(String(value)) && BigInt(value) <= UINT64_MAX;
  } catch {
    return false;
  }
}

export default function WorkspaceHeader({ title, method, mode, onModeChange, mobileView, onMobileViewChange, resultStatus = "idle", progress = null, seed, onSeedChange, onNewSeed, retentionMode = "raw", onRetentionModeChange }) {
  const progressLabel = resultStatus === "running" && progress?.total
    ? ` · ${progress.completed} of ${progress.total} runs`
    : "";
  const statusLabel = ({ idle: "Ready to run", running: "Simulation running", fresh: "Results current", stale: "Inputs changed — results stale", failed: "Run failed", cancelled: "Run cancelled" }[resultStatus] || resultStatus) + progressLabel;
  const seedIsValid = validSeed(seed);
  return (
    <header className="workspace-header">
      <div className="workspace-title"><span className={`status-dot status-${resultStatus}`} aria-hidden="true" /><div><p className="eyebrow">Markov Lab workspace</p><h1>{title}</h1><p className="workspace-method">{method} · <span aria-live="polite">{statusLabel}</span></p></div></div>
      <div className="workspace-switches">
        <label className="seed-control"><span>Root seed</span><input value={seed} onChange={(event) => onSeedChange(event.target.value.replace(/\D/g, "").slice(0, 20))} inputMode="numeric" aria-label="Root seed as an unsigned 64-bit integer" aria-invalid={!seedIsValid} aria-describedby={!seedIsValid ? "seed-error" : undefined} /><button type="button" onClick={onNewSeed}>New seed</button>{!seedIsValid && <small id="seed-error">Enter an integer from 0 to 18,446,744,073,709,551,615.</small>}</label>
        <label className="retention-control"><span>Result retention</span><select value={retentionMode} onChange={(event) => onRetentionModeChange?.(event.target.value)}><option value="raw">Full paths</option><option value="summary">Bounded summary</option></select><small>{retentionMode === "summary" ? "Keeps at most 20 sample paths; full-path CSV is unavailable." : "Subject to the device-memory preflight."}</small></label>
        <div className="segmented-control mobile-view-switch" aria-label="Workspace view">
          {[["editor", "Editor"], ["results", "Results"]].map(([id, label]) => <button key={id} type="button" aria-pressed={mobileView === id} onClick={() => onMobileViewChange(id)}>{label}</button>)}
        </div>
        <div className="segmented-control" aria-label="Editor mode">
          {[["guided", "Guided"], ["expert", "Expert"]].map(([id, label]) => <button key={id} type="button" aria-pressed={mode === id} onClick={() => onModeChange(id)}>{label}</button>)}
        </div>
        <p className="editor-mode-note">{mode === "guided" ? "Guided mode separates names and numeric values. Scientific expressions remain explicit and use the same safe language in both modes." : "Expert mode shows compact assignment rows. Changes update the same canonical model."}</p>
      </div>
    </header>
  );
}
