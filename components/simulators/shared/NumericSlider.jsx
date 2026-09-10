"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  defaultSliderConfig,
  normalizeSliderConfig,
} from "@/lib/numeric-sliders";

export default function NumericSlider({
  label,
  value,
  config,
  onConfigChange,
  onChange,
}) {
  const [editingLimit, setEditingLimit] = useState(null);
  const limitInputRefs = useRef({});
  const editorId = useId();

  useEffect(() => {
    if (editingLimit) {
      limitInputRefs.current[editingLimit]?.focus();
    }
  }, [editingLimit]);

  const numeric =
    value != null &&
    String(value).trim() !== "" &&
    Number.isFinite(Number(value))
      ? Number(value)
      : null;
  const settings = config ?? defaultSliderConfig(numeric ?? 0);
  if (!config?.enabled) return null;

  let validSettings;
  let error = "";
  try {
    validSettings = normalizeSliderConfig(settings);
  } catch (problem) {
    error = problem.message;
  }
  const outside =
    numeric !== null &&
    validSettings &&
    (numeric < validSettings.min || numeric > validSettings.max);

  const limitButton = (field) => (
    <button
      type="button"
      aria-label={`Edit ${label} slider ${field}`}
      aria-expanded={Boolean(editingLimit)}
      aria-controls={editorId}
      title={`Edit ${field === "min" ? "minimum" : "maximum"}: ${settings[field]}`}
      onClick={() => {
        setEditingLimit(field);
        limitInputRefs.current[field]?.focus();
      }}
      className={`numeric-slider-limit size-6 shrink-0 truncate rounded-none text-center font-mono text-[11px] leading-6 hover:bg-blue-100 focus-visible:outline-1 focus-visible:outline-slate-400 ${editingLimit === field ? "bg-blue-100 text-blue-800" : "text-slate-500 hover:text-blue-800"}`}
    >
      {String(settings[field]).trim() || (field === "min" ? "min" : "max")}
    </button>
  );

  return (
    <div
      className="numeric-slider min-w-0 rounded border border-blue-100 bg-blue-50/60 px-1.5 py-0.5 text-left"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setEditingLimit(null);
      }}
      onKeyDown={(event) => {
        if (
          editingLimit &&
          (event.key === "Escape" ||
            (event.key === "Enter" && event.target.type === "number"))
        ) {
          event.preventDefault();
          setEditingLimit(null);
          event.currentTarget.querySelector(`[data-slider-track]`)?.focus();
        }
      }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {limitButton("min")}
        <input
          data-slider-track
          type="range"
          aria-label={`${label} slider`}
          value={
            numeric === null || error
              ? 0
              : Math.min(
                  validSettings.max,
                  Math.max(validSettings.min, numeric),
                )
          }
          min={error ? 0 : validSettings.min}
          max={error ? 1 : validSettings.max}
          step={error ? 0.01 : validSettings.step}
          disabled={numeric === null || Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
          className="block h-6 min-w-0 flex-1 cursor-pointer accent-blue-700 disabled:opacity-40"
        />
        {limitButton("max")}
      </div>

      {editingLimit && (
        <div
          id={editorId}
          className="numeric-slider-settings grid grid-cols-[repeat(3,minmax(0,1fr))_20px] items-end gap-1 border-t border-blue-100 py-1"
        >
          {[
            ["min", "Min"],
            ["max", "Max"],
            ["step", "Step"],
          ].map(([field, title]) => (
            <label key={field} className="min-w-0 space-y-0.5 text-slate-500">
              <span className="block text-[9px] leading-[10px]">{title}</span>
              <input
                ref={(node) => {
                  limitInputRefs.current[field] = node;
                }}
                type="number"
                step="any"
                aria-label={`${label} slider ${field}`}
                value={settings[field]}
                onChange={(event) =>
                  onConfigChange({ ...settings, [field]: event.target.value })
                }
                className="block h-6 w-full min-w-0 rounded border border-slate-300 bg-white px-1 text-xs text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300/40"
              />
            </label>
          ))}
          <button
            type="button"
            aria-label={`Close ${label} slider settings`}
            title="Close settings"
            onClick={() => setEditingLimit(null)}
            className="flex h-6 items-center justify-center rounded text-slate-400 hover:bg-blue-100 hover:text-blue-800"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {(error || numeric === null || outside) && (
        <p role="status" className="pb-0.5 text-[10px] text-amber-800">
          {error ||
            (numeric === null
              ? "Enter a numeric value to use the slider."
              : "Value is outside the slider range.")}
          {numeric !== null && (
            <button
              type="button"
              onClick={() => onConfigChange(defaultSliderConfig(numeric))}
              className="ml-1 underline underline-offset-2 hover:text-blue-800"
            >
              Fit range to value
            </button>
          )}
        </p>
      )}
    </div>
  );
}
