"use client";

import "./simulator.css";

import { useEffect, useId, useRef, useState } from "react";
import {
  ChartNoAxesCombined,
  CodeXml,
  Play,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";

export default function SimulatorWorkspace({
  children,
  running,
  onRun,
  onReset,
  settings,
  summary,
  error,
  warning,
  hasResults,
}) {
  const [view, setView] = useState("model");
  const dialogRef = useRef(null);
  const settingsButtonRef = useRef(null);
  const workspaceRef = useRef(null);
  const id = useId();

  // Keep the editor and its dock inside the visible area when a phone keyboard opens.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const resize = () => {
      workspaceRef.current?.style.setProperty(
        "--simulator-viewport-height",
        `${viewport.height}px`,
      );
    };
    resize();
    viewport.addEventListener("resize", resize);
    return () => viewport.removeEventListener("resize", resize);
  }, []);

  const closeSettings = () => dialogRef.current?.close();
  const run = () => {
    if (running) return;
    // Dismiss the keyboard before making the chart the active workspace.
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    closeSettings();
    setView("results");
    onRun();
  };

  return (
    <div
      ref={workspaceRef}
      className="simulator-workspace"
      data-mobile-view={view}
    >
      <div className="simulator-mobile-heading">
        <div
          className="simulator-view-switch"
          role="group"
          aria-label="Simulator view"
        >
          <button
            type="button"
            aria-pressed={view === "model"}
            onClick={() => setView("model")}
          >
            <CodeXml size={17} aria-hidden="true" /> Model
          </button>
          <button
            type="button"
            aria-pressed={view === "results"}
            onClick={() => setView("results")}
          >
            <ChartNoAxesCombined size={17} aria-hidden="true" /> Results
            {hasResults && <span className="simulator-results-dot" />}
          </button>
        </div>
      </div>

      {children}

      {(error || warning) && (
        <div className="simulator-notices" aria-live="polite">
          {error && (
            <p role="alert" className="text-red-800">
              {error}
            </p>
          )}
          {warning && <p className="text-amber-800">{warning}</p>}
        </div>
      )}

      <div className="simulator-mobile-dock">
        <button
          ref={settingsButtonRef}
          type="button"
          className="simulator-settings-button"
          aria-haspopup="dialog"
          onClick={() => dialogRef.current?.showModal()}
        >
          <SlidersHorizontal size={19} aria-hidden="true" />
          <span>
            Settings<span className="simulator-run-summary">{summary}</span>
          </span>
        </button>
        <button
          type="button"
          className="simulator-run-button"
          onClick={run}
          disabled={running}
        >
          {running ? (
            <span className="loader" aria-hidden="true" />
          ) : (
            <Play size={17} fill="currentColor" aria-hidden="true" />
          )}
          {running ? "Running…" : "Run simulation"}
        </button>
      </div>

      <dialog
        ref={dialogRef}
        className="simulator-settings-dialog"
        aria-labelledby={`${id}-settings-title`}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeSettings();
        }}
        onClose={() =>
          settingsButtonRef.current?.focus({ preventScroll: true })
        }
      >
        <div className="simulator-settings-sheet">
          <div className="simulator-sheet-handle" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2
                id={`${id}-settings-title`}
                className="text-lg font-semibold text-slate-900"
              >
                Simulation settings
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Set the scope of your next run.
              </p>
            </div>
            <button
              type="button"
              className="simulator-icon-button"
              aria-label="Close settings"
              onClick={closeSettings}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          {settings}
          <div className="simulator-sheet-actions">
            <button
              type="button"
              className="simulator-reset-button"
              disabled={running}
              onClick={() => {
                onReset();
                setView("model");
                closeSettings();
              }}
            >
              <RotateCcw size={16} aria-hidden="true" /> Reset model
            </button>
            <button
              type="button"
              className="simulator-run-button"
              onClick={closeSettings}
            >
              Done
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
