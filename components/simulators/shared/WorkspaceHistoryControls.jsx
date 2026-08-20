"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WorkspaceHistory } from "@/lib/workspace/history";

function signature(value) {
  try { return JSON.stringify(value); }
  catch { return ""; }
}

export function useWorkspaceHistory({ snapshot, onApply, limit = 100 }) {
  const [history] = useState(() => new WorkspaceHistory(snapshot, { limit }));
  const applyingSignatureRef = useRef("");
  const onApplyRef = useRef(onApply);
  const [revision, setRevision] = useState(0);

  useEffect(() => { onApplyRef.current = onApply; }, [onApply]);
  const snapshotSignature = signature(snapshot);
  useEffect(() => {
    if (!snapshotSignature) return;
    if (applyingSignatureRef.current === snapshotSignature) {
      applyingSignatureRef.current = "";
      return;
    }
    if (signature(history.value) === snapshotSignature) return;
    history.push(snapshot);
    const timer = setTimeout(() => setRevision((value) => value + 1), 0);
    return () => clearTimeout(timer);
  }, [history, snapshot, snapshotSignature]);

  const apply = useCallback((next) => {
    applyingSignatureRef.current = signature(next);
    onApplyRef.current?.(next);
    setRevision((value) => value + 1);
  }, []);
  const undo = useCallback(() => {
    if (history.canUndo) apply(history.undo());
  }, [apply, history]);
  const redo = useCallback(() => {
    if (history.canRedo) apply(history.redo());
  }, [apply, history]);

  useEffect(() => {
    const keyboard = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey) { event.preventDefault(); redo(); }
      else if (key === "z") { event.preventDefault(); undo(); }
      else if (key === "y") { event.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [redo, undo]);

  return {
    undo,
    redo,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    revision,
  };
}

export default function WorkspaceHistoryControls({ history }) {
  return (
    <nav className="workspace-history-controls" aria-label="Editor history">
      <button type="button" onClick={history.undo} disabled={!history.canUndo} title="Undo (Control or Command Z)">Undo</button>
      <button type="button" onClick={history.redo} disabled={!history.canRedo} title="Redo (Control or Command Shift Z)">Redo</button>
      <span>Reset and preset changes are undoable. Text fields retain their native undo while focused.</span>
    </nav>
  );
}
