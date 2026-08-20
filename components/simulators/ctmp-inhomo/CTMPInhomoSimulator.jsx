"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ScientificPlotLab from "../shared/ScientificPlotLab";
import WorkspaceHeader from "../shared/WorkspaceHeader";
import { createRootSeed } from "@/lib/simulation/rng";
import {
  buildResultProvenance,
  canonicalModelFromSerialized,
  createCanonicalCoordinator,
  datasetsFromRuns,
  formatStructuredError,
  makeClientNamespace,
  makeSimulationRequest,
  persistBoundedRunHistory,
  resultIssues,
} from "../shared/canonicalSimulation";
import ExpressionListSection from "../shared/ExpressionListSection";
import SaveModelControls from "../shared/SaveModelControls";
import {
  buildSimulationResultsCsv,
  createSimulationResultsFilename,
  downloadCsvText,
} from "../shared/resultsCsv";
import { CTMP_INHOMO_SERIES_COLORS, getSeriesColor } from "../shared/seriesColors";
import {
  assignmentsToText,
  helpersToText,
  parseNameValueLines,
} from "@/lib/modelParsers";
import {
  hydrateCTMPInhomoPayload,
  serializeCTMPInhomoState,
} from "@/lib/saved-simulations/serializers";
import { X } from "lucide-react";
import RunHistoryPanel from "../shared/RunHistoryPanel";
import { DraftRecoveryBanner, useWorkspaceDraft } from "../shared/WorkspaceDraft";
import WorkspaceHistoryControls, { useWorkspaceHistory } from "../shared/WorkspaceHistoryControls";
import ParameterSweepPanel from "../shared/ParameterSweepPanel";
import ConvergenceAssistant from "../shared/ConvergenceAssistant";
import { createLocalRunRecord, saveLocalRun } from "@/lib/workspace/local-runs";
import WorkspaceInterchange from "../shared/WorkspaceInterchange";
import WorkspaceResizeHandle, { useResizableEditor } from "../shared/WorkspaceResizeHandle";
import ScientificExpressionInput from "../shared/ScientificExpressionInput";

const TAB_ITEMS = [
  { id: "vars", label: "Variables" },
  { id: "params", label: "Parameters" },
  { id: "transitions", label: "Transitions" },
];
const DEFAULT_PLOT_SPECS = [{ id: "plot-time-1", kind: "time" }];

function handleTabKey(event, index, setActiveTab) {
  let next = index;
  if (event.key === "ArrowRight") next = (index + 1) % TAB_ITEMS.length;
  else if (event.key === "ArrowLeft") next = (index - 1 + TAB_ITEMS.length) % TAB_ITEMS.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = TAB_ITEMS.length - 1;
  else return;
  event.preventDefault();
  setActiveTab(TAB_ITEMS[next].id);
  event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[next]?.focus();
}

const PRESETS = {
  seasonal: {
    vars: [
      { name: "Prey", val: 300 },
      { name: "Pred", val: 100 },
    ],
    params: [
      { name: "A", val: 2 },
      { name: "w", val: 6.28 },
      { name: "birth", val: 2 },
      { name: "eat", val: 0.005 },
      { name: "die", val: 2 },
    ],
    helpers: [{ name: "Season", body: "1 + A * sin(w*t)" }],
    transitions: [
      { rate: "birth * Season(t) * Prey", deltas: [1, 0] },
      { rate: "eat * Prey * Pred", deltas: [-1, 1] },
      { rate: "die * Pred", deltas: [0, -1] },
    ],
    tMax: 7,
    dt: 0.000002,
  },
};

function makeId() {
  return makeClientNamespace("ctmp-row");
}

function withTransitionIds(transitions, varCount) {
  return transitions.map((transition, index) => ({
    id: makeId(),
    name: transition.name ?? `Transition ${index + 1}`,
    rate: transition.rate,
    deltas: Array.from({ length: varCount }, (_, idx) =>
      String(transition.deltas?.[idx] ?? 0),
    ),
    noteEnabled: Boolean(transition.noteEnabled),
    noteLabel: transition.noteLabel ?? "",
  }));
}

function textToRows(text) {
  const lines = String(text).split(/\r?\n/);
  const normalized = lines.length ? lines : [""];
  return normalized.map((line) => ({ id: makeId(), text: line }));
}

function rowsToText(rows) {
  return rows.map((row) => row.text).join("\n");
}

function insertAfterRow(rows, afterId, newRow) {
  const idx = rows.findIndex((row) => row.id === afterId);
  if (idx < 0) return [...rows, newRow];
  return [...rows.slice(0, idx + 1), newRow, ...rows.slice(idx + 1)];
}

function buildLegendLabel(variableName, noteEnabled, noteLabel) {
  const name = String(variableName ?? "").trim();
  const note = noteEnabled ? String(noteLabel ?? "").trim() : "";
  if (!note) return name;
  return `${note} : ${name}`;
}

function buildLegendLabelsFromRows(variableNames, rows) {
  const rowByName = new Map();
  rows.forEach((row) => {
    const rowName = String(row?.text ?? "")
      .split("=")[0]
      ?.trim();
    if (!rowName || rowByName.has(rowName)) return;
    rowByName.set(rowName, row);
  });

  return variableNames.map((name) => {
    const sourceRow = rowByName.get(name);
    return buildLegendLabel(name, sourceRow?.noteEnabled, sourceRow?.noteLabel);
  });
}

export default function CTMPInhomoSimulator({
  sessionUser = null,
  initialSavedSimulation = null,
  exportUsername = null,
  canEditCurrentModel = true,
}) {
  const initialSavedPayload = useMemo(
    () =>
      initialSavedSimulation
        ? hydrateCTMPInhomoPayload(initialSavedSimulation.payload)
        : null,
    [initialSavedSimulation],
  );
  const [activeTab, setActiveTab] = useState("vars");
  const [editorMode, setEditorMode] = useState("guided");
  const [mobileView, setMobileView] = useState("editor");
  const [retentionMode, setRetentionMode] = useState("raw");
  const [plotSpecs, setPlotSpecs] = useState(() => initialSavedPayload?.plots?.length ? initialSavedPayload.plots : DEFAULT_PLOT_SPECS);
  const [rootSeed, setRootSeed] = useState(
    initialSavedPayload?.settings?.seed ?? "7640891576956012809",
  );
  const [varRows, setVarRows] = useState(() =>
    initialSavedPayload?.varRows ??
    textToRows(assignmentsToText(PRESETS.seasonal.vars)),
  );
  const [paramRows, setParamRows] = useState(() =>
    initialSavedPayload?.paramRows ??
    textToRows(assignmentsToText(PRESETS.seasonal.params)),
  );
  const [helperRows, setHelperRows] = useState(() =>
    initialSavedPayload?.helperRows ??
    textToRows(helpersToText(PRESETS.seasonal.helpers)),
  );
  const [transitions, setTransitions] = useState(() =>
    initialSavedPayload?.transitions ??
    withTransitionIds(
      PRESETS.seasonal.transitions,
      PRESETS.seasonal.vars.length,
    ),
  );

  const [tMax, setTMax] = useState(
    initialSavedPayload?.settings?.tMax ?? PRESETS.seasonal.tMax,
  );
  const [dt, setDt] = useState(
    initialSavedPayload?.settings?.dt ?? PRESETS.seasonal.dt,
  );
  const [numSims, setNumSims] = useState(
    initialSavedPayload?.settings?.numSims ?? 1,
  );
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [stats, setStats] = useState("");
  const [chartDatasets, setChartDatasets] = useState([]);
  const [chartXMax, setChartXMax] = useState(undefined);
  const [savedSimulationId, setSavedSimulationId] = useState(
    initialSavedSimulation?.id ?? null,
  );
  const [modelName, setModelName] = useState(
    initialSavedSimulation?.name ?? "",
  );
  const resultsCsvRef = useRef(null);
  const [hasResultsCsv, setHasResultsCsv] = useState(false);
  const coordinatorRef = useRef(null);
  const activeJobRef = useRef(null);
  const modelNamespaceRef = useRef(
    initialSavedSimulation?.id ?? makeClientNamespace("ctmp"),
  );
  const [resultProvenance, setResultProvenance] = useState(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const editorPane = useResizableEditor("markov-lab:ctmp-inhomo:editor-width", 500);

  useEffect(() => {
    if (!initialSavedPayload?.settings?.seed) setRootSeed(createRootSeed());
  }, [initialSavedPayload?.settings?.seed]);

  useEffect(() => () => activeJobRef.current?.cancel?.(), []);

  const varsText = useMemo(() => rowsToText(varRows), [varRows]);
  const paramsText = useMemo(() => rowsToText(paramRows), [paramRows]);
  const helpersText = useMemo(() => rowsToText(helperRows), [helperRows]);
  const runInputSignature = useMemo(() => JSON.stringify({ varsText, paramsText, helpersText, transitions, tMax, dt, numSims, rootSeed }), [varsText, paramsText, helpersText, transitions, tMax, dt, numSims, rootSeed]);
  const lastRunSignatureRef = useRef("");

  const variableNamesPreview = useMemo(() => {
    try {
      return parseNameValueLines(varsText, "Variable").map((v) => v.name);
    } catch {
      return [];
    }
  }, [varsText]);
  const expressionSymbols = useMemo(() => [
    ...variableNamesPreview,
    ...paramRows.map((row) => String(row.text ?? "").match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1]).filter(Boolean),
    ...helperRows.map((row) => String(row.text ?? "").match(/^\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1]).filter(Boolean),
  ], [helperRows, paramRows, variableNamesPreview]);

  const legendItems = useMemo(
    () =>
      buildLegendLabelsFromRows(variableNamesPreview, varRows).map(
        (label, index) => ({
          label,
          color: getSeriesColor(CTMP_INHOMO_SERIES_COLORS, index),
        }),
      ),
    [varRows, variableNamesPreview],
  );

  const updateRow = (setter) => (id, text, patch) => {
    setter((rows) =>
      rows.map((row) =>
        row.id === id ? { ...row, text, ...(patch ?? {}) } : row,
      ),
    );
  };

  const insertRow = (setter) => (afterId) => {
    const id = makeId();
    setter((rows) => insertAfterRow(rows, afterId, { id, text: "" }));
    return id;
  };

  const removeRow = (setter) => (id) => {
    setter((rows) => rows.filter((row) => row.id !== id));
  };

  const updateTransition = (id, field, value) => {
    setTransitions((items) =>
      items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    );
  };

  const addTransition = () => {
    setTransitions((items) => [
      ...items,
      {
        id: makeId(),
        name: `Transition ${items.length + 1}`,
        rate: "",
        deltas: Array.from({ length: variableNamesPreview.length }, () => "0"),
        noteEnabled: false,
        noteLabel: "",
      },
    ]);
  };

  const removeTransition = (id) => {
    setTransitions((items) => {
      const next = items.filter((item) => item.id !== id);
      if (next.length > 0) return next;
      return [
        {
          id: makeId(),
          name: "Transition 1",
          rate: "",
          deltas: Array.from(
            { length: variableNamesPreview.length },
            () => "0",
          ),
          noteEnabled: false,
          noteLabel: "",
        },
      ];
    });
  };

  const duplicateTransition = (id) => setTransitions((items) => {
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return items;
    const source = items[index];
    return [...items.slice(0, index + 1), { ...source, id: makeId(), name: `${source.name || `Transition ${index + 1}`} copy`, deltas: [...source.deltas] }, ...items.slice(index + 1)];
  });

  const moveTransition = (id, direction) => setTransitions((items) => {
    const index = items.findIndex((item) => item.id === id), target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return items;
    const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; return next;
  });

  const toggleTransitionNote = (id) => {
    setTransitions((items) =>
      items.map((item) =>
        item.id === id ? { ...item, noteEnabled: !item.noteEnabled } : item,
      ),
    );
  };

  const updateTransitionNoteLabel = (id, value) => {
    updateTransition(id, "noteLabel", value);
  };

  const updateTransitionDelta = (id, idx, value) => {
    setTransitions((items) =>
      items.map((item) => {
        if (item.id !== id) return item;
        const nextDeltas = [...item.deltas];
        while (nextDeltas.length <= idx) {
          nextDeltas.push("0");
        }
        nextDeltas[idx] = value;
        return { ...item, deltas: nextDeltas };
      }),
    );
  };

  const clearResultsCsv = useCallback(() => {
    resultsCsvRef.current = null;
    setHasResultsCsv(false);
  }, []);

  const handleDownloadResultsCsv = useCallback(() => {
    const resultsCsv = resultsCsvRef.current;
    if (!resultsCsv) {
      return;
    }

    downloadCsvText(resultsCsv.csvText, resultsCsv.filename);
  }, []);

  const loadPreset = (presetKey) => {
    const preset = PRESETS[presetKey];
    setVarRows(textToRows(assignmentsToText(preset.vars)));
    setParamRows(textToRows(assignmentsToText(preset.params)));
    setHelperRows(textToRows(helpersToText(preset.helpers)));
    setTransitions(withTransitionIds(preset.transitions, preset.vars.length));
    setPlotSpecs(DEFAULT_PLOT_SPECS);
    setTMax(preset.tMax);
    setDt(preset.dt);
    setNumSims(1);
    setError("");
    setWarning("");
    setStats("");
    setChartDatasets([]);
    setChartXMax(undefined);
    clearResultsCsv();
  };

  const applySavedSimulation = useCallback((savedSimulation) => {
    if (!savedSimulation) return;

    const hydrated = hydrateCTMPInhomoPayload(savedSimulation.payload);
    setVarRows(hydrated.varRows);
    setParamRows(hydrated.paramRows);
    setHelperRows(hydrated.helperRows);
    setTransitions(hydrated.transitions);
    setPlotSpecs(hydrated.plots?.length ? hydrated.plots : DEFAULT_PLOT_SPECS);
    setTMax(hydrated.settings.tMax);
    setDt(hydrated.settings.dt);
    setNumSims(hydrated.settings.numSims);
    setRootSeed(hydrated.settings.seed || createRootSeed());
    setSavedSimulationId(savedSimulation.id);
    setModelName(savedSimulation.name ?? "");
    setError("");
    setWarning("");
    setStats("");
    setChartDatasets([]);
    setChartXMax(undefined);
    clearResultsCsv();
  }, [clearResultsCsv]);

  useEffect(() => {
    if (initialSavedSimulation) {
      applySavedSimulation(initialSavedSimulation);
    }
  }, [applySavedSimulation, initialSavedSimulation]);

  const buildSavePayload = useCallback(
    () =>
      serializeCTMPInhomoState({
        varRows,
        paramRows,
        helperRows,
        transitions,
        tMax,
        dt,
        numSims,
        seed: rootSeed,
        plots: plotSpecs,
      }),
    [dt, helperRows, numSims, paramRows, plotSpecs, rootSeed, tMax, transitions, varRows],
  );

  const buildAnalysisModel = useCallback(
    (runs = 1) => canonicalModelFromSerialized(buildSavePayload(), {
      simulatorType: "ctmp-inhomo",
      seed: rootSeed,
      runs,
      namespace: savedSimulationId ?? modelNamespaceRef.current,
    }),
    [buildSavePayload, rootSeed, savedSimulationId],
  );

  const loadSweepCell = useCallback((assignments) => {
    setParamRows((rows) => rows.map((row) => {
      const match = String(row.text ?? "").match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      return match && Object.hasOwn(assignments, match[1])
        ? { ...row, text: `${match[1]} = ${assignments[match[1]]}` }
        : row;
    }));
    setMobileView("editor");
    window.setTimeout(() => document.getElementById("ctmp-inhomo-run")?.click(), 25);
  }, []);

  const importModel = useCallback((model) => {
    const hydrated = hydrateCTMPInhomoPayload(model);
    setVarRows(hydrated.varRows); setParamRows(hydrated.paramRows); setHelperRows(hydrated.helperRows); setTransitions(hydrated.transitions); setPlotSpecs(hydrated.plots?.length ? hydrated.plots : DEFAULT_PLOT_SPECS);
    setTMax(hydrated.settings.tMax); setDt(hydrated.settings.dt); setNumSims(hydrated.settings.numSims); setRootSeed(hydrated.settings.seed || createRootSeed());
    setSavedSimulationId(null); setModelName(""); setError(""); setWarning(""); setStats(""); setChartDatasets([]); setChartXMax(undefined); clearResultsCsv(); setMobileView("editor");
  }, [clearResultsCsv]);

  const draftSnapshot = useMemo(() => ({ varRows, paramRows, helperRows, transitions, plotSpecs, tMax, dt, numSims, rootSeed, modelName }), [dt, helperRows, modelName, numSims, paramRows, plotSpecs, rootSeed, tMax, transitions, varRows]);
  const restoreDraft = useCallback((snapshot) => {
    setVarRows(snapshot.varRows);
    setParamRows(snapshot.paramRows);
    setHelperRows(snapshot.helperRows);
    setTransitions(snapshot.transitions);
    setPlotSpecs(snapshot.plotSpecs?.length ? snapshot.plotSpecs : DEFAULT_PLOT_SPECS);
    setTMax(snapshot.tMax);
    setDt(snapshot.dt);
    setNumSims(snapshot.numSims);
    setRootSeed(snapshot.rootSeed);
    setModelName(snapshot.modelName ?? "");
    setError(""); setWarning(""); setStats(""); setChartDatasets([]); setChartXMax(undefined); clearResultsCsv();
  }, [clearResultsCsv]);
  const workspaceDraft = useWorkspaceDraft({
    draftKey: `ctmp-inhomo:${savedSimulationId ?? "anonymous"}`,
    snapshot: draftSnapshot,
    onRestore: restoreDraft,
  });
  const workspaceHistory = useWorkspaceHistory({ snapshot: draftSnapshot, onApply: restoreDraft });

  const buildPreviewChart = useCallback(
    () => ({
      datasets: chartDatasets,
      legendItems,
      xMax: chartXMax,
      xLabel: "Time",
      yLabel: "Count",
      showLegend: true,
    }),
    [chartDatasets, chartXMax, legendItems],
  );

  const runSimulation = useCallback(async () => {
    setError("");
    setWarning("");
    setRunning(true);
    setProgress({ completed: 0, total: Number(numSims) || 1 });
    try {
      const n = Math.min(Math.max(parseInt(numSims, 10) || 1, 1), 200);
      const model = canonicalModelFromSerialized(buildSavePayload(), {
        simulatorType: "ctmp-inhomo",
        seed: rootSeed,
        runs: n,
        namespace: savedSimulationId ?? modelNamespaceRef.current,
      });
      const request = makeSimulationRequest(model, n, retentionMode);
      coordinatorRef.current ??= createCanonicalCoordinator();
      const job = coordinatorRef.current.run(request, {
        onProgress: ({ completed, total }) => setProgress({ completed, total }),
      });
      activeJobRef.current = job;
      const outcome = await job.promise;
      activeJobRef.current = null;
      let historyWarning = "";
      if (sessionUser && savedSimulationId && canEditCurrentModel) {
        try {
          await persistBoundedRunHistory({ modelId: savedSimulationId, request, outcome });
          setHistoryRefresh((value) => value + 1);
        } catch (historyError) {
          historyWarning = historyError.message || "Run history could not be saved.";
        }
      } else {
        try {
          await saveLocalRun(`ctmp-inhomo:${savedSimulationId ?? "anonymous"}`, createLocalRunRecord(request, outcome));
          setHistoryRefresh((value) => value + 1);
        } catch (historyError) {
          historyWarning = historyError.message || "Local run history could not be saved.";
        }
      }
      if (outcome.status === "cancelled") {
        setStats(`Cancelled after ${outcome.runs.length} of ${n} runs`);
        setWarning(historyWarning);
        return;
      }
      const issues = resultIssues(outcome.runs);
      if (issues.length) {
        const failure = new Error(`${issues.length} run${issues.length === 1 ? "" : "s"} failed.`);
        failure.code = "RUN_FAILED";
        failure.details = { issues: issues.map((issue) => `Run ${issue.runIndex + 1} (${issue.code}): ${issue.message}`) };
        throw failure;
      }
      const durationMs = outcome.provenance.durationMs;
      setWarning([
        ...outcome.warnings.map((item) => item.message ?? item.code),
        ...(retentionMode === "summary" ? ["Summary mode retained bounded sample paths and statistics; full-path CSV is unavailable."] : []),
        ...(historyWarning ? [historyWarning] : []),
      ].join("\n"));
      const provenance = buildResultProvenance(request, durationMs);
      const datasets = datasetsFromRuns({ runs: outcome.runs, model, colors: CTMP_INHOMO_SERIES_COLORS, stepped: true });
      setChartDatasets(datasets);
      setChartXMax(Number(model.settings.tMax));
      setResultProvenance(provenance);
      lastRunSignatureRef.current = runInputSignature;
      resultsCsvRef.current = retentionMode === "raw" ? {
        csvText: buildSimulationResultsCsv({ results: outcome.runs, columnNames: model.variables.map((variable) => variable.name), provenance }),
        filename: createSimulationResultsFilename({ modelName, simulatorType: "ctmp-inhomo" }),
      } : null;
      setHasResultsCsv(retentionMode === "raw");
      const avgEvents = Math.round(outcome.runs.reduce((sum, run) => sum + run.eventCount, 0) / Math.max(1, outcome.runs.length));
      setStats(`${avgEvents} events avg · ${durationMs.toFixed(0)} ms${retentionMode === "summary" ? ` · ${outcome.runs.length} sample paths retained` : ""}`);
      setMobileView("results");
    } catch (event) {
      setError(formatStructuredError(event));
    } finally {
      activeJobRef.current = null;
      setRunning(false);
    }
  }, [buildSavePayload, canEditCurrentModel, modelName, numSims, retentionMode, rootSeed, runInputSignature, savedSimulationId, sessionUser]);

  const cancelSimulation = useCallback(() => activeJobRef.current?.cancel?.(), []);

  const resultStatus = running ? "running" : error ? "failed" : chartDatasets.length ? (lastRunSignatureRef.current === runInputSignature ? "fresh" : "stale") : "idle";
  const solverLabel = initialSavedPayload?.settings?.solver === "ctmp-piecewise-frozen-v1"
    ? "Piecewise-frozen compatibility SSA"
    : "Adaptive integrated-hazard SSA";

  return (
    <div className={`workspace-shell workspace-view-${mobileView}`}>
      <DraftRecoveryBanner draft={workspaceDraft} />
      <WorkspaceHistoryControls history={workspaceHistory} />
      <WorkspaceHeader title="Time-dependent jump process" method={solverLabel} mode={editorMode} onModeChange={setEditorMode} mobileView={mobileView} onMobileViewChange={setMobileView} resultStatus={resultStatus} progress={progress} seed={rootSeed} onSeedChange={setRootSeed} onNewSeed={() => setRootSeed(createRootSeed())} retentionMode={retentionMode} onRetentionModeChange={setRetentionMode} />
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <aside className="workspace-editor workspace-editor-resizable w-full md:w-[500px] bg-slate-100 border-r border-slate-300 overflow-hidden flex flex-col" style={{ "--editor-width": `${editorPane.width}px` }}>
          <div className="grid grid-cols-3 border-b border-slate-300 bg-slate-200" role="tablist" aria-label="Model editor sections">
            {TAB_ITEMS.map((tab, tabIndex) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  id={`ctmp-${tab.id}-tab`}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`ctmp-${tab.id}-panel`}
                  tabIndex={isActive ? 0 : -1}
                  onKeyDown={(event) => handleTabKey(event, tabIndex, setActiveTab)}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2 text-xs font-semibold border-r border-slate-300 last:border-r-0 ${
                    isActive
                      ? "bg-white text-slate-900"
                      : "bg-slate-200 text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div id={`ctmp-${activeTab}-panel`} role="tabpanel" aria-labelledby={`ctmp-${activeTab}-tab`} tabIndex="0" className="flex-1 overflow-y-auto">
            {activeTab === "vars" && (
              <ExpressionListSection
                title="Variables"
                helperText="One line each: Name = initial_value"
                rows={varRows}
                onUpdateRow={updateRow(setVarRows)}
                onInsertRowAfter={insertRow(setVarRows)}
                onRemoveRow={removeRow(setVarRows)}
                placeholder="Prey = 300"
                showRowColor
                colorForRow={(index) =>
                  getSeriesColor(CTMP_INHOMO_SERIES_COLORS, index)
                }
                mode={editorMode}
                metadataEnabled
              />
            )}

            {activeTab === "params" && (
              <>
                <ExpressionListSection
                  title="Parameters"
                  helperText="One line each: Name = value"
                  rows={paramRows}
                  onUpdateRow={updateRow(setParamRows)}
                  onInsertRowAfter={insertRow(setParamRows)}
                  onRemoveRow={removeRow(setParamRows)}
                  placeholder="birth = 2"
                  mode={editorMode}
                  metadataEnabled
                />
                <ExpressionListSection
                  title="Time Functions"
                  helperText="One line each: Name(t) = expression"
                  rows={helperRows}
                  onUpdateRow={updateRow(setHelperRows)}
                  onInsertRowAfter={insertRow(setHelperRows)}
                  onRemoveRow={removeRow(setHelperRows)}
                  placeholder="Season(t) = 1 + A * sin(w*t)"
                  mode={editorMode}
                />
              </>
            )}

            {activeTab === "transitions" && (
              <section className="border-b border-slate-300">
                <div className="px-3 py-2 bg-slate-200 border-b border-slate-300">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                    Transitions
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Define the rate and update rule for each transition.
                  </p>
                  {variableNamesPreview.length > 0 && (
                    <p className="text-[11px] text-slate-600 mt-1">
                      Order: {variableNamesPreview.join(", ")}
                    </p>
                  )}
                </div>

                {transitions.map((transition, transitionIndex) => (
                  <div
                    key={transition.id}
                    className="grid grid-cols-[46px_1fr_36px] border-b border-slate-300 bg-slate-100"
                  >
                    <div className="flex items-start justify-center pt-2 text-xs text-slate-500 border-r border-slate-300">
                      <button
                        type="button"
                        onClick={() => toggleTransitionNote(transition.id)}
                        aria-label="Toggle transition label"
                        aria-pressed={transition.noteEnabled}
                        className={`rounded transition ${
                          transition.noteEnabled
                            ? "text-slate-700"
                            : "text-slate-400 hover:text-slate-600"
                        }`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="size-5"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                          />
                        </svg>
                      </button>
                    </div>

                    <div className="p-2.5 pb-1.5 w-full overflow-hidden flex flex-col">
                      {transition.noteEnabled && (
                        <div className="mb-[5px] flex justify-end">
                          <input
                            type="text"
                            value={transition.noteLabel ?? ""}
                            size={Math.max(
                              transition.noteLabel?.length * 1.5 ?? 0,
                              10,
                            )}
                            onChange={(event) =>
                              updateTransitionNoteLabel(
                                transition.id,
                                event.target.value,
                              )
                            }
                            spellCheck={false}
                            className="
                              max-w-full
                              px-1 py-0
                              text-[14px]
                              text-slate-600
                              border-none
                              focus:outline-none
                              placeholder:text-[13px]
                              placeholder:text-slate-300
                              placeholder:bg-white/70
                              placeholder:italic
                              text-right
                              font-semibold
                              bg-transparent
                            "
                            placeholder="Add Label &nbsp;"
                          />
                        </div>
                      )}

                      <div className="transition-structured-row">
                        <label><span>Name</span><input type="text" value={transition.name ?? ""} onChange={(event) => updateTransition(transition.id, "name", event.target.value)} placeholder={`Transition ${transitionIndex + 1}`} /></label>
                        <div className="transition-row-actions">
                          <button type="button" onClick={() => moveTransition(transition.id, -1)} disabled={transitionIndex === 0} aria-label={`Move ${transition.name || `transition ${transitionIndex + 1}`} up`}>↑</button>
                          <button type="button" onClick={() => moveTransition(transition.id, 1)} disabled={transitionIndex === transitions.length - 1} aria-label={`Move ${transition.name || `transition ${transitionIndex + 1}`} down`}>↓</button>
                          <button type="button" onClick={() => duplicateTransition(transition.id)}>Duplicate</button>
                        </div>
                      </div>

                      <div className="relative w-full mb-[2px]">
                        <ScientificExpressionInput
                          label={`Rate for ${transition.name || transition.noteLabel || "transition"}`}
                          value={transition.rate}
                          onChange={(value) =>
                            updateTransition(
                              transition.id,
                              "rate",
                              value,
                            )
                          }
                          symbols={expressionSymbols}
                          showPreview={editorMode === "guided"}
                          className="w-full pl-2.5 pr-14 py-1.5 border border-slate-300 rounded text-sm bg-white"
                          placeholder="birth * Season(t) * Prey"
                        />
                      </div>

                      <div className="relative w-full flex items-center justify-end gap-3">
                        {/* Label placed directly inside the flex container */}
                        <label className="shrink-0 text-[10px] leading-none tracking-wide text-slate-500 font-semibold ">
                          CHANGES:
                        </label>

                        {/* Inputs / Empty State Container */}
                        {variableNamesPreview.length === 0 ? (
                          <div className="text-[11px] text-slate-500 px-2 py-1.5 bg-white border border-slate-300 rounded">
                            Add variables to define changes
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-nowrap overflow-x-auto pb-0.5">
                            {variableNamesPreview.map((varName, varIdx) => (
                              <div
                                key={`${transition.id}-${varName}`}
                                /* Changed w-[72px] to w-[56px] (or you can use standard w-14) */
                                className="w-[56px] shrink-0"
                              >
                                <input
                                  type="text"
                                  value={transition.deltas[varIdx] ?? "0"}
                                  onChange={(event) =>
                                    updateTransitionDelta(
                                      transition.id,
                                      varIdx,
                                      event.target.value,
                                    )
                                  }
                                  title={varName}
                                  /* Added font-semibold and text-center. (Changed px-2 to px-1 to give the text more room in the narrower box) */
                                  className="w-full px-1 py-1 border border-slate-300 rounded-t text-xs font-semibold text-center bg-white code-input focus:outline-none focus:ring-0 focus:border-slate-300 placeholder:text-slate-200"
                                  placeholder="0"
                                />
                                <div
                                  className="mt-0 h-1 rounded-b-sm"
                                  style={{
                                    backgroundColor: getSeriesColor(
                                      CTMP_INHOMO_SERIES_COLORS,
                                      varIdx,
                                    ),
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeTransition(transition.id)}
                      className="text-slate-400 hover:text-red-500 border-l border-slate-300 text-sm justify-center items-center flex "
                      aria-label="Delete transition"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addTransition}
                  className="w-full text-left px-4 py-2 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition"
                >
                  + Add transition
                </button>
              </section>
            )}
          </div>

          {(error || warning) && (
            <div className="hidden md:block p-3 border-t border-slate-300 space-y-2">
              {error && (
                <div className="text-xs text-red-700 bg-red-100 border border-red-200 px-2 py-1.5 rounded whitespace-pre-wrap">
                  {error}
                </div>
              )}
              {warning && (
                <div className="text-xs text-amber-700 bg-amber-100 border border-amber-200 px-2 py-1.5 rounded whitespace-pre-wrap">
                  {warning}
                </div>
              )}
            </div>
          )}
        </aside>

        <WorkspaceResizeHandle width={editorPane.width} onChange={editorPane.update} />
        <div className="workspace-results flex-1 min-h-[360px] md:min-h-0 p-2 md:p-3 bg-slate-200 flex flex-col gap-2">
          <div className="flex-1 min-h-0 bg-white">
            <ScientificPlotLab
              datasets={chartDatasets}
              legendItems={legendItems}
              solverLabel={solverLabel}
              resultStatus={resultStatus}
              provenance={resultProvenance}
              initialPlotSpecs={plotSpecs}
              onPlotSpecsChange={setPlotSpecs}
              chartProps={{ xMax: chartXMax, xLabel: "Time", yLabel: "Count", showTooltips: parseInt(numSims, 10) <= 1 }}
            />
          </div>

          <ParameterSweepPanel buildModel={buildAnalysisModel} rootSeed={rootSeed} onSelectAssignments={loadSweepCell} />
          <ConvergenceAssistant buildModel={buildAnalysisModel} rootSeed={rootSeed} />

          <div className="bg-white border border-slate-300">
            <div className="run-bar px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="order-1 flex items-center gap-2 mr-1">
                  <button
                    id="ctmp-inhomo-run"
                    type="button"
                    onClick={running ? cancelSimulation : runSimulation}
                    className="run-primary w-24 rounded bg-blue-900 hover:bg-blue-800 disabled:opacity-60 text-sm font-semibold text-white text-center"
                  >
                    {running ? "Cancel" : "Run"}
                  </button>

                  <button
                    onClick={() => loadPreset("seasonal")}
                    className="w-20 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs"
                  >
                    Reset
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadResultsCsv}
                    disabled={!hasResultsCsv || resultStatus !== "fresh"}
                    title={resultStatus === "stale" ? "Run the changed model before exporting" : undefined}
                    className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 text-xs"
                  >
                    Download CSV
                  </button>
                </div>

                <div className="order-2 flex items-center gap-2 flex-nowrap whitespace-nowrap max-w-full overflow-x-auto">
                  <label className="text-[11px] text-slate-500">t max</label>
                  <input
                    type="number"
                    value={tMax}
                    step="any"
                    onChange={(event) => setTMax(event.target.value)}
                    className="w-16 px-2 py-1 rounded border border-slate-300 text-xs bg-white"
                  />

                  <label className="text-[11px] text-slate-500">dt</label>
                  <input
                    type="number"
                    value={dt}
                    step="0.0001"
                    onChange={(event) => setDt(event.target.value)}
                    className="w-24 px-2 py-1 rounded border border-slate-300 text-xs bg-white"
                  />

                  <label className="text-[11px] text-slate-500">runs</label>
                  <input
                    type="number"
                    value={numSims}
                    min="1"
                    max="200"
                    step="1"
                    onChange={(event) => setNumSims(event.target.value)}
                    className="w-16 px-2 py-1 rounded border border-slate-300 text-xs bg-white"
                  />
                </div>

                {stats && (
                  <span className="order-3 md:order-3 md:ml-auto text-xs text-slate-500 font-mono">
                    {stats}
                  </span>
                )}
              </div>

              <div
                className="md:hidden mt-2 h-14 overflow-y-auto pr-1 space-y-2"
                aria-live="polite"
              >
                {error && (
                  <div className="text-xs text-red-700 bg-red-100 border border-red-200 px-2 py-1.5 rounded whitespace-pre-wrap">
                    {error}
                  </div>
                )}
                {warning && (
                  <div className="text-xs text-amber-700 bg-amber-100 border border-amber-200 px-2 py-1.5 rounded whitespace-pre-wrap">
                    {warning}
                  </div>
                )}
              </div>
            </div>

            <SaveModelControls
              sessionUser={sessionUser}
              simulatorType="ctmp-inhomo"
              modelName={modelName}
              onModelNameChange={setModelName}
              savedSimulationId={savedSimulationId}
              exportUsername={exportUsername}
              exportSlug={initialSavedSimulation?.slug ?? null}
              canEditCurrentModel={canEditCurrentModel}
              initialDescription={initialSavedSimulation?.description}
              initialTags={initialSavedSimulation?.tags}
              initialVisibility={initialSavedSimulation?.visibility}
              initialRevision={initialSavedSimulation?.revision}
              sourceModelId={canEditCurrentModel ? null : initialSavedSimulation?.id}
              previewIsFresh={resultStatus === "fresh"}
              getPayload={buildSavePayload}
              getPreviewChart={buildPreviewChart}
              onSaved={(savedSimulation) => {
                setSavedSimulationId(savedSimulation.id);
                setModelName(savedSimulation.name);
                workspaceDraft.markSaved();
              }}
            />
            <WorkspaceInterchange solverFamily="ctmp-inhomo" buildModel={buildAnalysisModel} onImportModel={importModel} modelName={modelName} />
            <RunHistoryPanel modelId={savedSimulationId} enabled={Boolean(sessionUser && canEditCurrentModel)} localKey={!sessionUser || !canEditCurrentModel ? `ctmp-inhomo:${savedSimulationId ?? "anonymous"}` : null} refreshToken={historyRefresh} />
          </div>
        </div>
      </div>
    </div>
  );
}
