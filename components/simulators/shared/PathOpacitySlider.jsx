"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  DEFAULT_PATH_OPACITY,
  MAX_PATH_OPACITY,
  MIN_PATH_OPACITY,
  clampPathOpacity,
} from "./seriesColors";

export default function PathOpacitySlider({
  value = DEFAULT_PATH_OPACITY,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuId = useId();
  const opacity = clampPathOpacity(value);
  const percent = Math.round(opacity * 100);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) {
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
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Path opacity"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={menuId}
        title="Path opacity"
        onClick={() => setOpen((current) => !current)}
        className={`flex h-[26px] w-6 items-center justify-center rounded border transition ${
          open
            ? "border-slate-400 bg-slate-100 text-slate-800"
            : "border-slate-300 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        }`}
      >
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={menuId}
          className="absolute left-0 top-full z-40 mt-1 w-44 rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-xl"
        >
          <label className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="select-none">opacity</span>
            <input
              type="range"
              min={MIN_PATH_OPACITY}
              max={MAX_PATH_OPACITY}
              step="0.01"
              aria-label="Multi-run path opacity"
              aria-valuemin={Math.round(MIN_PATH_OPACITY * 100)}
              aria-valuemax={Math.round(MAX_PATH_OPACITY * 100)}
              aria-valuenow={percent}
              aria-valuetext={`${percent} percent`}
              value={opacity}
              onChange={(event) => onChange(Number(event.target.value))}
              className="path-opacity-slider min-w-0 flex-1"
            />
          </label>
        </div>
      )}
    </div>
  );
}
