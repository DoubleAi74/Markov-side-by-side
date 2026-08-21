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
import {
  SDE_SERIES_COLORS,
  getSeriesColor,
} from "../shared/seriesColors";
import { assignmentsToText } from "@/lib/modelParsers";
import {
  hydrateSDEPayload,
  serializeSDEState,
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

const DEFAULT_PRESET = {
  params: [
    { name: "a", val: 1.1 },
    { name: "b", val: 0.01 },
    { name: "c", val: 1.0 },
    { name: "d", val: 0.005 },
    { name: "sigma_x", val: 0.2 },
    { name: "sigma_y", val: 0.2 },
  ],
  components: [
    {
      name: "Prey",
      init: 300,
      drift: "a*Prey - b*Prey*Pred",
      diff: "sigma_x * Prey",
    },
    {
      name: "Pred",
      init: 10,
      drift: "-c*Pred + d*Prey*Pred",
      diff: "sigma_y * Pred",
    },
  ],
  tMax: 20,
  dt: 0.005,
  numSims: 1,
};

function makeId() {
  return makeClientNamespace("sde-row");
}

function textToRows(text) {
  const lines = String(text).split(/\r?\n/);
  const normalized = lines.length ? lines : [""];
  return normalized.map((line) => ({ id: makeId(), text: line }));
}

function rowsToText(rows) {
  return rows.map((row) => row.text).join("\n");
}

function withComponentIds(components) {
  return components.map((component) => ({
    id: makeId(),
    name: component.name,
    init: String(component.init),
    drift: component.drift,
    diff: component.diff,
    noteEnabled: Boolean(component.noteEnabled),
    noteLabel: component.noteLabel ?? "",
  }));
}

function parseVariableComponents(components) {
  const parsed = [];
  const seen = new Set();

  components.forEach((component, index) => {
    const name = component.name.trim();
    const initText = String(component.init ?? "").trim();
    const drift = component.drift.trim();
    const diff = component.diff.trim();
    const isEmpty = !name && !initText && !drift && !diff;

    if (isEmpty) return;

    if (!name) {
      throw new Error(`Variable row ${index + 1}: missing variable name.`);
    }
    if (seen.has(name)) {
      throw new Error(
        `Variable row ${index + 1}: duplicate variable "${name}".`,
      );
    }
    seen.add(name);

    const init = Number(component.init);
    if (!Number.isFinite(init)) {
      throw new Error(
        `Variable row ${index + 1}: initial value must be a finite number.`,
      );
    }
    if (!drift) {
      throw new Error(
        `Variable row ${index + 1}: drift expression is required.`,
      );
    }
    if (!diff) {
      throw new Error(
        `Variable row ${index + 1}: diffusion expression is required.`,
      );
    }

    parsed.push({ name, init, drift, diff });
  });

  if (parsed.length === 0) {
    throw new Error("Please define at least one variable component.");
  }

  return parsed;
}

function buildLegendLabel(variableName, noteEnabled, noteLabel) {
  const name = String(variableName ?? "").trim();
  const note = noteEnabled ? String(noteLabel ?? "").trim() : "";
  if (!note) return name;
  return `${note}: ${name}`;
}

export default function SDESimulator({
  sessionUser = null,
  initialSavedSimulation = null,
  exportUsername = null,
  canEditCurrentModel = true,
}) {
  const initialSavedPayload = useMemo(
    () =>
      initialSavedSimulation
        ? hydrateSDEPayload(initialSavedSimulation.payload)
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
  const [paramRows, setParamRows] = useState(() =>
    initialSavedPayload?.paramRows ??
    textToRows(assignmentsToText(DEFAULT_PRESET.params)),
  );
  const [components, setComponents] = useState(() =>
    initialSavedPayload?.components ?? withComponentIds(DEFAULT_PRESET.components),
  );
  const [noiseSources, setNoiseSources] = useState(
    () => initialSavedPayload?.noiseSources ?? [],
  );
  const [correlations, setCorrelations] = useState(
    () => initialSavedPayload?.correlations ?? null,
  );

  const [tMax, setTMax] = useState(
    initialSavedPayload?.settings?.tMax ?? DEFAULT_PRESET.tMax,
  );
  const [dt, setDt] = useState(
    initialSavedPayload?.settings?.dt ?? DEFAULT_PRESET.dt,
  );
  const [numSims, setNumSims] = useState(
    initialSavedPayload?.settings?.numSims ?? DEFAULT_PRESET.numSims,
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
    initialSavedSimulation?.id ?? makeClientNamespace("sde"),
  );
  const [resultProvenance, setResultProvenance] = useState(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const editorPane = useResizableEditor("markov-lab:sde:editor-width", 520);

  useEffect(() => {
    if (!initialSavedPayload?.settings?.seed) setRootSeed(createRootSeed());
  }, [initialSavedPayload?.settings?.seed]);

  useEffect(() => () => activeJobRef.current?.cancel?.(), []);

  const paramsText = rowsToText(paramRows);
  const runInputSignature = useMemo(() => JSON.stringify({ paramsText, components, tMax, dt, numSims, rootSeed }), [paramsText, components, tMax, dt, numSims, rootSeed]);
  const lastRunSignatureRef = useRef("");

  const variableLegendPreview = useMemo(() => {
    const seen = new Set();
    const entries = [];
    components.forEach((component) => {
      const name = component.name.trim();
      if (!name || seen.has(name)) return;
      seen.add(name);
      entries.push({
        name,
        legendLabel: buildLegendLabel(
          name,
          component.noteEnabled,
          component.noteLabel,
        ),
      });
    });
    return entries;
  }, [components]);
  const expressionSymbols = useMemo(() => [
    ...variableLegendPreview.map((entry) => entry.name),
    ...paramRows.map((row) => String(row.text ?? "").match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1]).filter(Boolean),
  ], [paramRows, variableLegendPreview]);

  const legendItems = useMemo(
    () =>
      variableLegendPreview.map((entry, index) => ({
        label: entry.legendLabel,
        color: getSeriesColor(SDE_SERIES_COLORS, index),
      })),
    [variableLegendPreview],
  );

  const updateRow = (setter) => (id, text, patch) => {
    setter((rows) =>
      rows.map((row) =>
        row.id === id ? { ...row, text, ...(patch ?? {}) } : row,
      ),
    );
  };

  const insertParamRow = (afterId) => {
    const id = makeId();
    setParamRows((rows) => {
      const idx = rows.findIndex((row) => row.id === afterId);
      if (idx < 0) return [...rows, { id, text: "" }];
      return [
        ...rows.slice(0, idx + 1),
        { id, text: "" },
        ...rows.slice(idx + 1),
      ];
    });
    return id;
  };

  const removeParamRow = (id) => {
    setParamRows((rows) => rows.filter((row) => row.id !== id));
  };

  const updateComponent = (id, field, value) => {
    setComponents((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  };

  const initializeNoiseMatrix = () => {
    const sources = components.map((component, index) => ({ id: makeId(), name: `W_${component.name.trim() || index + 1}` }));
    setNoiseSources(sources);
    setComponents((rows) => rows.map((row, rowIndex) => ({
      ...row,
      diffusion: sources.map((noise, columnIndex) => ({ noiseId: noise.id, expression: rowIndex === columnIndex ? (row.diff || "0") : "0" })),
      _displayNoiseId: sources[rowIndex]?.id ?? sources[0]?.id ?? null,
    })));
    setCorrelations(sources.map((_, row) => sources.map((__, column) => row === column ? 1 : 0)));
  };

  const updateNoiseSource = (id, name) => setNoiseSources((sources) => sources.map((source) => source.id === id ? { ...source, name } : source));

  const addNoiseSource = () => {
    if (!noiseSources.length) { initializeNoiseMatrix(); return; }
    const noise = { id: makeId(), name: `W_${noiseSources.length + 1}` };
    setNoiseSources((sources) => [...sources, noise]);
    setComponents((rows) => rows.map((row) => ({ ...row, diffusion: [...(row.diffusion ?? []), { noiseId: noise.id, expression: "0" }] })));
    setCorrelations((matrix) => {
      const current = Array.isArray(matrix) ? matrix : noiseSources.map((_, row) => noiseSources.map((__, column) => row === column ? 1 : 0));
      return [...current.map((row) => [...row, 0]), [...Array(current.length).fill(0), 1]];
    });
  };

  const removeNoiseSource = (id) => {
    const index = noiseSources.findIndex((source) => source.id === id);
    if (index < 0 || noiseSources.length <= 1) return;
    const remaining = noiseSources.filter((source) => source.id !== id);
    setNoiseSources(remaining);
    setComponents((rows) => rows.map((row) => {
      const diffusion = (row.diffusion ?? []).filter((entry) => entry.noiseId !== id);
      const displayNoiseId = row._displayNoiseId === id ? remaining[0]?.id ?? null : row._displayNoiseId;
      const display = diffusion.find((entry) => entry.noiseId === displayNoiseId);
      return { ...row, diffusion, _displayNoiseId: displayNoiseId, diff: display?.expression ?? "0" };
    }));
    setCorrelations((matrix) => Array.isArray(matrix) ? matrix.filter((_, row) => row !== index).map((row) => row.filter((_, column) => column !== index)) : null);
  };

  const updateDiffusionCell = (componentId, noiseId, expression) => setComponents((rows) => rows.map((row) => {
    if (row.id !== componentId) return row;
    const diffusion = noiseSources.map((noise) => ({ noiseId: noise.id, expression: noise.id === noiseId ? expression : (row.diffusion ?? []).find((entry) => entry.noiseId === noise.id)?.expression ?? "0" }));
    return { ...row, diffusion, ...(row._displayNoiseId === noiseId ? { diff: expression } : {}) };
  }));

  const updateCorrelation = (rowIndex, columnIndex, value) => setCorrelations((matrix) => {
    const next = (Array.isArray(matrix) ? matrix : noiseSources.map((_, row) => noiseSources.map((__, column) => row === column ? 1 : 0))).map((row) => [...row]);
    const number = rowIndex === columnIndex ? 1 : Number(value);
    next[rowIndex][columnIndex] = number;
    next[columnIndex][rowIndex] = number;
    return next;
  });

  const addComponent = () => {
    setComponents((rows) => [
      ...rows,
      {
        id: makeId(),
        name: "",
        init: "",
        drift: "",
        diff: "",
        ...(noiseSources.length ? {
          diffusion: noiseSources.map((noise) => ({ noiseId: noise.id, expression: "0" })),
          _displayNoiseId: noiseSources[0].id,
        } : {}),
        noteEnabled: false,
        noteLabel: "",
      },
    ]);
  };

  const removeComponent = (id) => {
    setComponents((rows) => {
      const next = rows.filter((row) => row.id !== id);
      if (next.length > 0) return next;
      return [
        {
          id: makeId(),
          name: "",
          init: "",
          drift: "",
          diff: "",
          noteEnabled: false,
          noteLabel: "",
        },
      ];
    });
  };

  const toggleComponentNote = (id) => {
    setComponents((rows) =>
      rows.map((row) =>
        row.id === id ? { ...row, noteEnabled: !row.noteEnabled } : row,
      ),
    );
  };

  const updateComponentNoteLabel = (id, value) => {
    updateComponent(id, "noteLabel", value);
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

  const loadPreset = () => {
    setParamRows(textToRows(assignmentsToText(DEFAULT_PRESET.params)));
    setComponents(withComponentIds(DEFAULT_PRESET.components));
    setNoiseSources([]);
    setCorrelations(null);
    setPlotSpecs(DEFAULT_PLOT_SPECS);
    setTMax(DEFAULT_PRESET.tMax);
    setDt(DEFAULT_PRESET.dt);
    setNumSims(DEFAULT_PRESET.numSims);
    setError("");
    setWarning("");
    setStats("");
    setChartDatasets([]);
    setChartXMax(undefined);
    clearResultsCsv();
  };

  const applySavedSimulation = useCallback((savedSimulation) => {
    if (!savedSimulation) return;

    const hydrated = hydrateSDEPayload(savedSimulation.payload);
    setParamRows(hydrated.paramRows);
    setComponents(hydrated.components);
    setNoiseSources(hydrated.noiseSources ?? []);
    setCorrelations(hydrated.correlations ?? null);
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
      serializeSDEState({
        paramRows,
        components,
        tMax,
        dt,
        numSims,
        seed: rootSeed,
        noiseSources,
        correlations,
        plots: plotSpecs,
      }),
    [components, correlations, dt, noiseSources, numSims, paramRows, plotSpecs, rootSeed, tMax],
  );

  const buildAnalysisModel = useCallback(
    (runs = 1) => canonicalModelFromSerialized(buildSavePayload(), {
      simulatorType: "sde",
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
    window.setTimeout(() => document.getElementById("sde-run")?.click(), 25);
  }, []);

  const importModel = useCallback((model) => {
    const hydrated = hydrateSDEPayload(model);
    setParamRows(hydrated.paramRows); setComponents(hydrated.components); setNoiseSources(hydrated.noiseSources ?? []); setCorrelations(hydrated.correlations ?? null); setPlotSpecs(hydrated.plots?.length ? hydrated.plots : DEFAULT_PLOT_SPECS);
    setTMax(hydrated.settings.tMax); setDt(hydrated.settings.dt); setNumSims(hydrated.settings.numSims); setRootSeed(hydrated.settings.seed || createRootSeed());
    setSavedSimulationId(null); setModelName(""); setError(""); setWarning(""); setStats(""); setChartDatasets([]); setChartXMax(undefined); clearResultsCsv(); setMobileView("editor");
  }, [clearResultsCsv]);

  const draftSnapshot = useMemo(() => ({ paramRows, components, noiseSources, correlations, plotSpecs, tMax, dt, numSims, rootSeed, modelName }), [components, correlations, dt, modelName, noiseSources, numSims, paramRows, plotSpecs, rootSeed, tMax]);
  const restoreDraft = useCallback((snapshot) => {
    setParamRows(snapshot.paramRows);
    setComponents(snapshot.components);
    setNoiseSources(snapshot.noiseSources ?? []);
    setCorrelations(snapshot.correlations ?? null);
    setPlotSpecs(snapshot.plotSpecs?.length ? snapshot.plotSpecs : DEFAULT_PLOT_SPECS);
    setTMax(snapshot.tMax);
    setDt(snapshot.dt);
    setNumSims(snapshot.numSims);
    setRootSeed(snapshot.rootSeed);
    setModelName(snapshot.modelName ?? "");
    setError(""); setWarning(""); setStats(""); setChartDatasets([]); setChartXMax(undefined); clearResultsCsv();
  }, [clearResultsCsv]);
  const workspaceDraft = useWorkspaceDraft({
    draftKey: `sde:${savedSimulationId ?? "anonymous"}`,
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
      yLabel: "Value",
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
      parseVariableComponents(components);
      const n = Math.min(Math.max(parseInt(numSims, 10) || 1, 1), 200);
      const model = canonicalModelFromSerialized(buildSavePayload(), {
        simulatorType: "sde",
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
          await saveLocalRun(`sde:${savedSimulationId ?? "anonymous"}`, createLocalRunRecord(request, outcome));
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
      const datasets = datasetsFromRuns({ runs: outcome.runs, model, colors: SDE_SERIES_COLORS });
      setChartDatasets(datasets);
      setChartXMax(Number(model.settings.tMax));
      setResultProvenance(provenance);
      lastRunSignatureRef.current = runInputSignature;
      resultsCsvRef.current = retentionMode === "raw" ? {
        csvText: buildSimulationResultsCsv({ results: outcome.runs, columnNames: model.variables.map((variable) => variable.name), provenance }),
        filename: createSimulationResultsFilename({ modelName, simulatorType: "sde" }),
      } : null;
      setHasResultsCsv(retentionMode === "raw");
      const avgSteps = Math.round(outcome.runs.reduce((sum, run) => sum + run.stepCount, 0) / Math.max(1, outcome.runs.length));
      setStats(`${avgSteps} steps avg · ${durationMs.toFixed(0)} ms${retentionMode === "summary" ? ` · ${outcome.runs.length} sample paths retained` : ""}`);
      setMobileView("results");
    } catch (event) {
      setError(formatStructuredError(event));
    } finally {
      activeJobRef.current = null;
      setRunning(false);
    }
  }, [buildSavePayload, canEditCurrentModel, components, modelName, numSims, retentionMode, rootSeed, runInputSignature, savedSimulationId, sessionUser]);

  const cancelSimulation = useCallback(() => activeJobRef.current?.cancel?.(), []);

  const resultStatus = running ? "running" : error ? "failed" : chartDatasets.length ? (lastRunSignatureRef.current === runInputSignature ? "fresh" : "stale") : "idle";

  return (
    <div className={`workspace-shell workspace-view-${mobileView}`}>
      <DraftRecoveryBanner draft={workspaceDraft} />
      <WorkspaceHistoryControls history={workspaceHistory} />
      <WorkspaceHeader title="Stochastic differential equation" method="Euler–Maruyama v2" mode={editorMode} onModeChange={setEditorMode} mobileView={mobileView} onMobileViewChange={setMobileView} resultStatus={resultStatus} progress={progress} seed={rootSeed} onSeedChange={setRootSeed} onNewSeed={() => setRootSeed(createRootSeed())} retentionMode={retentionMode} onRetentionModeChange={setRetentionMode} />
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <aside className="workspace-editor workspace-editor-resizable w-full md:w-[520px] bg-slate-100 border-r border-slate-300 overflow-hidden flex flex-col" style={{ "--editor-width": `${editorPane.width}px` }}>
          <div className="grid grid-cols-2 border-b border-slate-300 bg-slate-200" role="tablist" aria-label="Model editor sections">
            {TAB_ITEMS.map((tab, tabIndex) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  id={`sde-${tab.id}-tab`}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`sde-${tab.id}-panel`}
                  tabIndex={isActive ? 0 : -1}
                  onKeyDown={(event) => handleTabKey(event, tabIndex, setActiveTab)}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2 text-xs font-semibold border-r border-slate-300 last:border-r-0 ${
                    isActive
                      ? "bg-white text-slate-900"
                      : "bg-slate-200 text-slate-700 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div id={`sde-${activeTab}-panel`} role="tabpanel" aria-labelledby={`sde-${activeTab}-tab`} tabIndex="0" className="flex-1 overflow-y-auto">
            {activeTab === "params" && (
              <ExpressionListSection
                title="Parameters"
                helperText="One line each: Name = Value"
                rows={paramRows}
                onUpdateRow={updateRow(setParamRows)}
                onInsertRowAfter={insertParamRow}
                onRemoveRow={removeParamRow}
                placeholder="sigma_x = 0.2"
                mode={editorMode}
                metadataEnabled
              />
            )}

            {activeTab === "vars" && (
              <section className="border-b border-slate-300">
                <div className="px-3 py-2 bg-slate-200 border-b border-slate-300">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                    Variables
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Each variable has its own Drift and Diffusion expressions.
                  </p>
                </div>

                {components.map((component, index) => (
                  <div
                    key={component.id}
                    className="grid grid-cols-[46px_1fr_36px] border-b border-slate-300 bg-slate-100"
                  >
                    <div className="relative flex items-start justify-center pt-2 text-xs text-slate-500 border-r border-slate-300">
                      <span
                        className="absolute left-1 top-1/2 -translate-y-1/2 h-6 w-[15px] rounded-[2px]"
                        style={{
                          backgroundColor: getSeriesColor(
                            SDE_SERIES_COLORS,
                            index,
                          ),
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => toggleComponentNote(component.id)}
                        aria-label="Toggle variable label"
                        aria-pressed={component.noteEnabled}
                        className={`rounded transition ${
                          component.noteEnabled
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

                    <div className="p-2.5  w-full overflow-hidden flex flex-col ">
                      {/* NOTE LABEL */}
                      {component.noteEnabled && (
                        <div className="mb-[2px] flex justify-end">
                          <input
                            aria-label={`Display label for variable ${index + 1}`}
                            type="text"
                            value={component.noteLabel ?? ""}
                            size={Math.max(
                              component.noteLabel?.length * 1.5 ?? 0,
                              10,
                            )}
                            onChange={(event) =>
                              updateComponentNoteLabel(
                                component.id,
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

                      {/* NAME + INITIAL */}

                      <div className="flex justify justify-between">
                        <label className=" text-[9px] leading-none  tracking-wide text-slate-400 font-semibold ml-[2px] py-[2px]">
                          VARIABLE &nbsp; and &nbsp; INITIAL VALUE
                        </label>
                        <label className=" text-[9px] leading-none uppercase tracking-wide text-emerald-700 font-semibold mr-[2px] py-[2px] "></label>
                      </div>
                      <div className="flex gap-x-3 sm:gap-x-8  mb-2">
                        {/* Variable Column */}
                        <div className="flex flex-col flex-1">
                          <input
                            aria-label={`Variable ${index + 1} name`}
                            type="text"
                            value={component.name}
                            onChange={(event) =>
                              updateComponent(
                                component.id,
                                "name",
                                event.target.value,
                              )
                            }
                            spellCheck={false}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm bg-white"
                            placeholder="Eg. N"
                          />
                        </div>

                        {/* Initial Value Column */}
                        <div className="flex flex-col w-[80px] sm:w-[110px]">
                          <input
                            aria-label={`Initial value for ${component.name || `variable ${index + 1}`}`}
                            type="number"
                            value={component.init}
                            onChange={(event) =>
                              updateComponent(
                                component.id,
                                "init",
                                event.target.value,
                              )
                            }
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm bg-white text-center"
                            placeholder="Eg. 1"
                          />
                        </div>
                      </div>

                      {editorMode === "guided" && (
                        <details className="guided-metadata mb-2">
                          <summary>Metadata and manual control</summary>
                          <div><label><span>Unit</span><input type="text" value={component.unit ?? ""} onChange={(event) => updateComponent(component.id, "unit", event.target.value)} placeholder="e.g. mol" /></label><label><span>Description</span><input type="text" value={component.description ?? ""} onChange={(event) => updateComponent(component.id, "description", event.target.value)} placeholder="Scientific meaning" /></label></div>
                          <label className="slider-toggle"><input type="checkbox" checked={Boolean(component.slider)} onChange={(event) => updateComponent(component.id, "slider", event.target.checked ? { min: 0, max: Math.max(1, Number(component.init) * 2 || 1), step: 0.1 } : null)} /> Enable manual slider (does not autorun)</label>
                          {component.slider && <div className="slider-settings"><label><span>Min</span><input type="number" value={component.slider.min} onChange={(event) => updateComponent(component.id, "slider", { ...component.slider, min: Number(event.target.value) })} /></label><input aria-label={`Manual initial value for ${component.name || `variable ${index + 1}`}`} type="range" min={component.slider.min} max={component.slider.max} step={component.slider.step} value={Number(component.init) || 0} onChange={(event) => updateComponent(component.id, "init", event.target.value)} /><label><span>Max</span><input type="number" value={component.slider.max} onChange={(event) => updateComponent(component.id, "slider", { ...component.slider, max: Number(event.target.value) })} /></label><label><span>Step</span><input type="number" min="0" value={component.slider.step} onChange={(event) => updateComponent(component.id, "slider", { ...component.slider, step: Number(event.target.value) })} /></label></div>}
                        </details>
                      )}

                      {/* DRIFT */}
                      <div className="relative  w-full mb-[2px]">
                        <ScientificExpressionInput
                          label={`Drift for ${component.name || `variable ${index + 1}`}`}
                          value={component.drift}
                          onChange={(value) =>
                            updateComponent(
                              component.id,
                              "drift",
                              value,
                            )
                          }
                          symbols={expressionSymbols}
                          showPreview={editorMode === "guided"}
                          className="w-full pl-2.5 pr-14 py-1.5 border border-slate-300 rounded text-sm bg-white"
                          placeholder="f(N,t)"
                        />
                      </div>

                      {/* DIFFUSION */}
                      <div className="relative  w-full">
                        <ScientificExpressionInput
                          label={`Diffusion shortcut for ${component.name || `variable ${index + 1}`}`}
                          value={component.diff}
                          onChange={(value) =>
                            noiseSources.length && component._displayNoiseId
                              ? updateDiffusionCell(component.id, component._displayNoiseId, value)
                              : updateComponent(component.id, "diff", value)
                          }
                          symbols={expressionSymbols}
                          showPreview={editorMode === "guided"}
                          className="w-full pl-2.5 pr-16 py-1.5 border border-slate-300 rounded text-sm bg-white"
                          placeholder="g(N,t)"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeComponent(component.id)}
                      className="text-slate-400 hover:text-red-500 border-l  border-slate-300 text-sm items-center justify-center flex"
                      aria-label="Delete variable"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addComponent}
                  className="w-full text-left px-4 py-2 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition"
                >
                  + Add variable
                </button>

                <details className="noise-matrix-editor">
                  <summary>Advanced noise matrix, correlations, and boundaries</summary>
                  <div className="noise-matrix-body">
                    {!noiseSources.length ? (
                      <>
                        <p className="text-xs text-slate-600">The compact diffusion field represents independent diagonal noise. Expand it to edit a general state-by-noise matrix.</p>
                        <button type="button" onClick={initializeNoiseMatrix}>Expand general diffusion matrix</button>
                      </>
                    ) : (
                      <>
                        <section aria-labelledby="noise-sources-heading">
                          <h3 id="noise-sources-heading" className="text-xs font-bold text-slate-700 mb-2">Named noise sources</h3>
                          <div className="noise-source-list">
                            {noiseSources.map((noise, index) => (
                              <div className="noise-source-row" key={noise.id}>
                                <label className="sr-only" htmlFor={`noise-${noise.id}`}>Noise source {index + 1} name</label>
                                <input id={`noise-${noise.id}`} type="text" value={noise.name} onChange={(event) => updateNoiseSource(noise.id, event.target.value)} />
                                <button type="button" onClick={() => removeNoiseSource(noise.id)} disabled={noiseSources.length === 1} aria-label={`Remove noise source ${noise.name}`}>Remove</button>
                              </div>
                            ))}
                          </div>
                          <button type="button" onClick={addNoiseSource} className="mt-2">+ Add noise source</button>
                        </section>

                        <section className="diffusion-matrix" aria-labelledby="diffusion-matrix-heading">
                          <h3 id="diffusion-matrix-heading" className="text-xs font-bold text-slate-700 mb-2">State-by-noise diffusion matrix</h3>
                          <div className="matrix-grid" style={{ gridTemplateColumns: `minmax(7rem, .7fr) repeat(${noiseSources.length}, minmax(8rem, 1fr))` }}>
                            <span className="matrix-heading">State ↓ / noise →</span>
                            {noiseSources.map((noise) => <span className="matrix-heading" key={noise.id}>{noise.name}</span>)}
                            {components.flatMap((component, rowIndex) => [
                              <span className="matrix-heading" key={`${component.id}-heading`}>{component.name || `Variable ${rowIndex + 1}`}</span>,
                              ...noiseSources.map((noise) => {
                                const value = (component.diffusion ?? []).find((entry) => entry.noiseId === noise.id)?.expression ?? "0";
                                return <ScientificExpressionInput key={`${component.id}-${noise.id}`} label={`${component.name || `variable ${rowIndex + 1}`} diffusion from ${noise.name}`} value={value} onChange={(expression) => updateDiffusionCell(component.id, noise.id, expression)} symbols={expressionSymbols} className="w-full" />;
                              }),
                            ])}
                          </div>
                        </section>

                        <section className="correlation-matrix" aria-labelledby="correlation-matrix-heading">
                          <h3 id="correlation-matrix-heading" className="text-xs font-bold text-slate-700 mb-2">Noise correlation matrix</h3>
                          <div className="matrix-grid" style={{ gridTemplateColumns: `minmax(7rem, .7fr) repeat(${noiseSources.length}, minmax(5rem, 1fr))` }}>
                            <span className="matrix-heading">ρ</span>
                            {noiseSources.map((noise) => <span className="matrix-heading" key={noise.id}>{noise.name}</span>)}
                            {noiseSources.flatMap((rowNoise, rowIndex) => [
                              <span className="matrix-heading" key={`${rowNoise.id}-correlation-heading`}>{rowNoise.name}</span>,
                              ...noiseSources.map((columnNoise, columnIndex) => <label key={`${rowNoise.id}-${columnNoise.id}`}><span className="sr-only">Correlation of {rowNoise.name} with {columnNoise.name}</span><input type="number" min="-1" max="1" step="0.01" disabled={rowIndex === columnIndex} value={rowIndex === columnIndex ? 1 : (correlations?.[rowIndex]?.[columnIndex] ?? 0)} onChange={(event) => updateCorrelation(rowIndex, columnIndex, event.target.value)} /></label>),
                            ])}
                          </div>
                        </section>
                      </>
                    )}

                    <section aria-labelledby="boundary-heading">
                      <h3 id="boundary-heading" className="text-xs font-bold text-slate-700 mb-2">Boundary policies</h3>
                      {components.map((component, index) => {
                        const boundary = component.boundary ?? { type: component.boundaryPolicy ?? "none" };
                        return <div className="boundary-controls" key={`${component.id}-boundary`}><label><span className="text-[10px] text-slate-600">{component.name || `Variable ${index + 1}`} policy</span><select value={boundary.type ?? "none"} onChange={(event) => updateComponent(component.id, "boundary", { ...boundary, type: event.target.value })}><option value="none">None</option><option value="reflect">Reflect</option><option value="clamp">Clamp</option><option value="absorb">Absorb</option><option value="error">Error</option></select></label><label><span className="text-[10px] text-slate-600">Minimum</span><input type="number" step="any" value={boundary.min ?? ""} disabled={(boundary.type ?? "none") === "none"} onChange={(event) => updateComponent(component.id, "boundary", { ...boundary, min: event.target.value === "" ? undefined : Number(event.target.value) })} /></label><label><span className="text-[10px] text-slate-600">Maximum</span><input type="number" step="any" value={boundary.max ?? ""} disabled={(boundary.type ?? "none") === "none"} onChange={(event) => updateComponent(component.id, "boundary", { ...boundary, max: event.target.value === "" ? undefined : Number(event.target.value) })} /></label></div>;
                      })}
                    </section>
                  </div>
                </details>
              </section>
            )}
          </div>

          {(error || warning) && (
            <div className="p-3 border-t border-slate-300 space-y-2">
              {error && (
                <div className="text-xs text-red-700 bg-red-100 border border-red-200 px-2 py-1.5 rounded whitespace-pre-wrap">
                  {error}
                </div>
              )}
              {warning && <div className="text-xs text-amber-800 bg-amber-100 border border-amber-300 px-2 py-1.5 rounded whitespace-pre-wrap">{warning}</div>}
            </div>
          )}
        </aside>

        <WorkspaceResizeHandle width={editorPane.width} onChange={editorPane.update} />
        <div className="workspace-results flex-1 min-h-[360px] md:min-h-0 p-2 md:p-3 bg-slate-200 flex flex-col gap-2">
          <div className="flex-1 min-h-0 bg-white">
            <ScientificPlotLab
              datasets={chartDatasets}
              legendItems={legendItems}
              solverLabel="Euler–Maruyama"
              resultStatus={resultStatus}
              provenance={resultProvenance}
              initialPlotSpecs={plotSpecs}
              onPlotSpecsChange={setPlotSpecs}
              chartProps={{ xMax: chartXMax, xLabel: "Time", yLabel: "Value", showTooltips: parseInt(numSims, 10) <= 1 }}
            />
          </div>

          <ParameterSweepPanel buildModel={buildAnalysisModel} rootSeed={rootSeed} onSelectAssignments={loadSweepCell} />
          <ConvergenceAssistant buildModel={buildAnalysisModel} rootSeed={rootSeed} />

          <div className="bg-white border border-slate-300">
            <div className="run-bar px-3 py-2 flex flex-wrap items-center gap-2">
              <div className="order-1 flex items-center gap-2 mr-1">
                <button
                  id="sde-run"
                  type="button"
                  onClick={running ? cancelSimulation : runSimulation}
                  className="run-primary w-24 rounded bg-blue-900 hover:bg-blue-800 disabled:opacity-60 text-sm font-semibold text-white text-center"
                >
                  {running ? "Cancel" : "Run"}
                </button>

                <button
                  onClick={loadPreset}
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
                  aria-label="Maximum simulation time"
                  type="number"
                  value={tMax}
                  step="any"
                  onChange={(event) => setTMax(event.target.value)}
                  className="w-16 px-2 py-1 rounded border border-slate-300 text-xs bg-white"
                />

                <label className="text-[11px] text-slate-500">dt</label>
                <input
                  aria-label="SDE time step"
                  type="number"
                  value={dt}
                  step="0.001"
                  onChange={(event) => setDt(event.target.value)}
                  className="w-20 px-2 py-1 rounded border border-slate-300 text-xs bg-white"
                />

                <label className="text-[11px] text-slate-500">runs</label>
                <input
                  aria-label="Number of simulation runs"
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
              {(error || warning) && <div className="order-4 w-full md:hidden max-h-20 overflow-auto" aria-live="polite">{error && <p className="text-xs text-red-700 whitespace-pre-wrap">{error}</p>}{warning && <p className="text-xs text-amber-800 whitespace-pre-wrap">{warning}</p>}</div>}
            </div>

            <SaveModelControls
              sessionUser={sessionUser}
              simulatorType="sde"
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
            <WorkspaceInterchange solverFamily="sde" buildModel={buildAnalysisModel} onImportModel={importModel} modelName={modelName} />
            <RunHistoryPanel modelId={savedSimulationId} enabled={Boolean(sessionUser && canEditCurrentModel)} localKey={!sessionUser || !canEditCurrentModel ? `sde:${savedSimulationId ?? "anonymous"}` : null} refreshToken={historyRefresh} />
          </div>
        </div>
      </div>
    </div>
  );
}
