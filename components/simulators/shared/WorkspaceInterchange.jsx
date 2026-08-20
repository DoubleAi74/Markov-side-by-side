"use client";

import { useRef, useState } from "react";
import { parseModelImport } from "@/lib/model-v2/migrate";

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

function download(text, filename, type) {
  const href = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = href; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

function responseMessage(body, fallback) {
  const issues = Array.isArray(body?.issues) ? body.issues.slice(0, 8).map((issue) => `${issue.path || "document"}: ${issue.message}`).join("\n") : "";
  return [body?.error || fallback, issues].filter(Boolean).join("\n");
}

export default function WorkspaceInterchange({ solverFamily, buildModel, onImportModel, modelName }) {
  const inputRef = useRef(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const importFile = async (file) => {
    if (!file) return;
    setMessage("");
    if (file.size > MAX_IMPORT_BYTES) { setMessage("Import files may not exceed 2 MiB."); return; }
    setBusy(true);
    try {
      const text = await file.text();
      let model;
      if (/\.(xml|sbml)$/i.test(file.name) || file.type.includes("xml")) {
        const response = await fetch("/api/interchange/sbml", { method: "POST", headers: { "Content-Type": "application/sbml+xml" }, body: text });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(responseMessage(body, "SBML import failed."));
        model = body.payload;
      } else {
        const parsed = parseModelImport(text, { namespace: `browser-import:${file.name}` });
        if (parsed.needsRepair) throw new Error(parsed.report?.join("\n") || "This legacy model requires repair before execution.");
        model = parsed.model;
      }
      if (model.solverFamily !== solverFamily) throw new Error(`This file is for ${model.solverFamily}; open that solver workspace before importing it.`);
      onImportModel(model);
      setMessage(`${file.name} imported into a local unsaved workspace.`);
    } catch (event) { setMessage(event.message || "Import failed."); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  const exportJson = () => {
    try { download(`${JSON.stringify(buildModel(1), null, 2)}\n`, "markov-lab-model.markov.json", "application/vnd.markov-lab.model+json"); }
    catch (event) { setMessage(event.message || "JSON export failed."); }
  };

  const exportSbml = async () => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/interchange/sbml", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: buildModel(1), name: modelName }) });
      if (!response.ok) throw new Error(responseMessage(await response.json().catch(() => ({})), "SBML export failed."));
      download(await response.text(), "markov-lab-model.xml", "application/sbml+xml");
    } catch (event) { setMessage(event.message || "SBML export failed."); }
    finally { setBusy(false); }
  };

  return <details className="workspace-interchange"><summary>Import and model export</summary><div><input ref={inputRef} className="sr-only" type="file" accept=".json,.xml,.sbml,application/json,application/xml,application/sbml+xml" onChange={(event) => importFile(event.target.files?.[0])} /><button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>Import JSON or SBML</button><button type="button" disabled={busy} onClick={exportJson}>Export JSON v2</button>{solverFamily === "gillespie" && <button type="button" disabled={busy} onClick={exportSbml}>Export strict SBML</button>}</div><p>Imports remain unsaved until you explicitly save or fork. Unsupported SBML is reported without approximation.</p>{message && <p className="interchange-message" aria-live="polite">{message}</p>}</details>;
}
