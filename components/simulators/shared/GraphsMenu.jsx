"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { listVariablePairs } from "@/lib/extra-graphs";

const MENU_ITEM =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50";

export function useExtraGraphToggles(variableNames) {
  const pairs = useMemo(
    () => listVariablePairs(variableNames),
    [variableNames],
  );
  const pairKeySet = useMemo(
    () => new Set(pairs.map((pair) => pair.key)),
    [pairs],
  );
  const [enabledPairKeys, setEnabledPairKeys] = useState([]);
  const [meanEnabled, setMeanEnabled] = useState(false);

  const visibleEnabledPairKeys = useMemo(
    () => enabledPairKeys.filter((key) => pairKeySet.has(key)),
    [enabledPairKeys, pairKeySet],
  );

  const togglePair = useCallback((key) => {
    setEnabledPairKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }, []);

  const toggleMean = useCallback(() => {
    setMeanEnabled((value) => !value);
  }, []);

  return useMemo(
    () => ({
      pairs,
      enabledPairKeys: visibleEnabledPairKeys,
      togglePair,
      meanEnabled,
      toggleMean,
    }),
    [meanEnabled, pairs, toggleMean, togglePair, visibleEnabledPairKeys],
  );
}

function ToggleMark({ on }) {
  return (
    <span
      className={`h-3.5 w-3.5 shrink-0 rounded-sm border ${
        on ? "border-blue-900 bg-blue-900" : "border-slate-400 bg-white"
      }`}
      aria-hidden="true"
    />
  );
}

export default function GraphsMenu({
  pairs = [],
  enabledPairKeys = [],
  onTogglePair,
  meanEnabled = false,
  onToggleMean,
  meanXLabel = "time",
}) {
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const enabledCount =
    enabledPairKeys.length + (meanEnabled ? 1 : 0);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (target instanceof Node && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="graphs-menu"
        aria-haspopup="menu"
        className={`inline-flex items-center justify-center gap-1.5 rounded border px-3 py-1.5 text-xs font-semibold transition ${
          open
            ? "border-slate-400 bg-slate-100 text-slate-900"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
        }`}
      >
        Graphs
        {enabledCount > 0 ? (
          <span className="rounded-full bg-blue-900 px-1.5 text-[10px] font-semibold leading-4 text-white">
            {enabledCount}
          </span>
        ) : null}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id="graphs-menu"
          role="menu"
          aria-label="Additional graphs"
          className="absolute top-full right-0 z-40 mt-2 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-left shadow-xl"
        >
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Pair plots
          </p>
          {pairs.length === 0 ? (
            <p className="px-3 py-2 text-[11px] leading-snug text-slate-500">
              Add two or more variables to plot one against another.
            </p>
          ) : (
            pairs.map((pair) => {
              const on = enabledPairKeys.includes(pair.key);
              return (
                <button
                  key={pair.key}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  onClick={() => onTogglePair(pair.key)}
                  className={MENU_ITEM}
                >
                  <ToggleMark on={on} />
                  {pair.label}
                </button>
              );
            })
          )}

          <p className="mt-1 border-t border-slate-100 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Averages
          </p>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={meanEnabled}
            onClick={onToggleMean}
            className={MENU_ITEM}
          >
            <ToggleMark on={meanEnabled} />
            Mean vs {meanXLabel.toLowerCase()}
          </button>
          <p className="px-3 pb-2 text-[11px] leading-snug text-slate-500">
            Needs two or more simulation runs.
          </p>
        </div>
      )}
    </div>
  );
}
