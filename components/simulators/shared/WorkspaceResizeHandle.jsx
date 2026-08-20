"use client";

import { useCallback, useEffect, useState } from "react";

const MIN_WIDTH = 360;
const MAX_WIDTH = 760;
const bounded = (value) => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Number(value)));

export function useResizableEditor(storageKey, initialWidth) {
  const [width, setWidth] = useState(initialWidth);
  useEffect(() => {
    const stored = Number(localStorage.getItem(storageKey));
    if (!(Number.isFinite(stored) && stored >= MIN_WIDTH && stored <= MAX_WIDTH)) return undefined;
    const timer = setTimeout(() => setWidth(stored), 0);
    return () => clearTimeout(timer);
  }, [storageKey]);
  const update = useCallback((value) => {
    const next = bounded(value);
    setWidth(next);
    try { localStorage.setItem(storageKey, String(next)); } catch {}
  }, [storageKey]);
  return { width, update };
}

export default function WorkspaceResizeHandle({ width, onChange }) {
  const start = (event) => {
    event.preventDefault();
    const move = (moveEvent) => onChange(moveEvent.clientX);
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };
  const keyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") onChange(MIN_WIDTH);
    else if (event.key === "End") onChange(MAX_WIDTH);
    else onChange(width + (event.key === "ArrowRight" ? 16 : -16));
  };
  return <div className="workspace-resize-handle" role="separator" aria-label="Resize model editor" aria-orientation="vertical" aria-valuemin={MIN_WIDTH} aria-valuemax={MAX_WIDTH} aria-valuenow={width} tabIndex="0" onPointerDown={start} onKeyDown={keyDown}><span aria-hidden="true" /></div>;
}
