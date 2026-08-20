"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadLocalDraft, removeLocalDraft, saveLocalDraft } from "@/lib/workspace/drafts";

function signature(value) {
  try { return JSON.stringify(value); }
  catch { return ""; }
}

export function useWorkspaceDraft({ draftKey, snapshot, onRestore, saveDelayMs = 750 }) {
  const snapshotRef = useRef(snapshot);
  const onRestoreRef = useRef(onRestore);
  const baselineRef = useRef("");
  const [candidate, setCandidate] = useState(null);
  const [loadedKey, setLoadedKey] = useState("");

  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);
  useEffect(() => { onRestoreRef.current = onRestore; }, [onRestore]);

  useEffect(() => {
    let active = true;
    loadLocalDraft(draftKey)
      .then((draft) => {
        if (!active) return;
        const currentSignature = signature(snapshotRef.current);
        baselineRef.current = currentSignature;
        if (draft && signature(draft.model) !== currentSignature) setCandidate(draft);
        setLoadedKey(draftKey);
      })
      .catch(() => {
        if (!active) return;
        baselineRef.current = signature(snapshotRef.current);
        setLoadedKey(draftKey);
      });
    return () => { active = false; };
  }, [draftKey]);

  const currentSignature = signature(snapshot);
  useEffect(() => {
    if (loadedKey !== draftKey || candidate?.key === draftKey || !currentSignature) return undefined;
    const timer = setTimeout(() => {
      saveLocalDraft(draftKey, snapshotRef.current).catch(() => {});
    }, saveDelayMs);
    return () => clearTimeout(timer);
  }, [candidate, currentSignature, draftKey, loadedKey, saveDelayMs]);

  useEffect(() => {
    const beforeUnload = (event) => {
      if (!baselineRef.current || signature(snapshotRef.current) === baselineRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  const restore = useCallback(() => {
    if (!candidate || candidate.key !== draftKey) return;
    onRestoreRef.current?.(candidate.model);
    setCandidate(null);
  }, [candidate, draftKey]);

  const discard = useCallback(() => {
    removeLocalDraft(draftKey).catch(() => {});
    setCandidate(null);
  }, [draftKey]);

  const markSaved = useCallback(() => {
    baselineRef.current = signature(snapshotRef.current);
    saveLocalDraft(draftKey, snapshotRef.current).catch(() => {});
  }, [draftKey]);

  return { candidate: candidate?.key === draftKey ? candidate : null, restore, discard, markSaved };
}

export function DraftRecoveryBanner({ draft }) {
  if (!draft?.candidate) return null;
  const updated = new Date(draft.candidate.updatedAt);
  const label = Number.isFinite(updated.getTime()) ? updated.toLocaleString() : "an earlier session";
  return (
    <section className="draft-recovery" aria-labelledby="draft-recovery-title">
      <div><strong id="draft-recovery-title">Recover local draft?</strong><span>A different edit from {label} is stored on this device.</span></div>
      <div><button type="button" onClick={draft.restore}>Restore draft</button><button type="button" onClick={draft.discard}>Keep current</button></div>
    </section>
  );
}
