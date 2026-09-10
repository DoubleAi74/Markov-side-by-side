"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DiscreteComponentEditor from "./DiscreteComponentEditor";
import { parseDiscreteComponents } from "@/lib/discrete-time/model";
import {
  hydrateDiscreteComponent,
  hydrateDiscreteTimePayload,
  serializeDiscreteTimeState,
} from "@/lib/saved-simulations/serializers";
import SimulationSettings from "../shared/SimulationSettings";
import SimulatorWorkspace from "../shared/SimulatorWorkspace";
import SaveModelControls from "../shared/SaveModelControls";
import EditorScrollArea from "../shared/EditorScrollArea";
import ChartStack, { buildExtraGraphPanels } from "../shared/ChartStack";
import GraphsMenu, { useExtraGraphToggles } from "../shared/GraphsMenu";
import { useRegisterSimulatorType } from "@/components/providers/SimulatorTypeProvider";
import SimChart from "../shared/SimChart";
import {
  buildSimulationResultsCsv,
  createSimulationResultsFilename,
  downloadCsvText,
} from "../shared/resultsCsv";
import {
  DEFAULT_PATH_OPACITY,
  DISCRETE_TIME_SERIES_COLORS,
  applySeriesColors,
  buildVariableSeries,
  hexToRgba,
} from "../shared/seriesColors";
import {
  DiscreteTimeComponent,
  DiscreteTimeStepper,
} from "./engine";

const GALTON_WATSON_PRESET = {
  components: [
    {
      name: "Population",
      init: 10,
      outcomes: [
        { offspring: 0, probability: 0.45 },
        { offspring: 2, probability: 0.55 },
      ],
    },
  ],
  generations: 30,
  numSims: 12,
};

function withComponentIds(components) {
  return components.map(hydrateDiscreteComponent);
}

function emptyComponent() {
  return hydrateDiscreteComponent();
}

function buildLegendLabel(variableName, noteEnabled, noteLabel) {
  const name = String(variableName ?? "").trim();
  const note = noteEnabled ? String(noteLabel ?? "").trim() : "";
  return note ? `${note}: ${name}` : name;
}

export default function DiscreteTimeSimulator({
  sessionUser = null,
  initialSavedSimulation = null,
  exportUsername = null,
  canEditCurrentModel = true,
  startBlank = false,
}) {
  useRegisterSimulatorType("discrete-time");
  const initialSavedPayload = useMemo(
    () =>
      initialSavedSimulation
        ? hydrateDiscreteTimePayload(initialSavedSimulation.payload)
        : null,
    [initialSavedSimulation],
  );
  const [components, setComponents] = useState(() =>
    initialSavedPayload?.components ??
    (startBlank
      ? [emptyComponent()]
      : withComponentIds(GALTON_WATSON_PRESET.components)),
  );
  const [generations, setGenerations] = useState(
    initialSavedPayload?.settings?.generations ??
      GALTON_WATSON_PRESET.generations,
  );
  const [numSims, setNumSims] = useState(
    initialSavedPayload?.settings?.numSims ?? GALTON_WATSON_PRESET.numSims,
  );
  const [pathOpacity, setPathOpacity] = useState(DEFAULT_PATH_OPACITY);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [chartDatasets, setChartDatasets] = useState([]);
  const [chartXMax, setChartXMax] = useState(undefined);
  const [runSnapshot, setRunSnapshot] = useState(null);
  const [savedSimulationId, setSavedSimulationId] = useState(
    initialSavedSimulation?.id ?? null,
  );
  const [modelName, setModelName] = useState(
    initialSavedSimulation?.name ?? "",
  );
  const resultsCsvRef = useRef(null);
  const [hasResultsCsv, setHasResultsCsv] = useState(false);

  const variableLegendPreview = useMemo(() => {
    const seen = new Set();
    return components.flatMap((component) => {
      const name = component.name.trim();
      if (!name || seen.has(name)) return [];
      seen.add(name);
      return [
        {
          name,
          legendLabel: buildLegendLabel(
            name,
            component.noteEnabled,
            component.noteLabel,
          ),
        },
      ];
    });
  }, [components]);
  const variableSeries = useMemo(
    () => buildVariableSeries(components, DISCRETE_TIME_SERIES_COLORS),
    [components],
  );
  const runCount = runSnapshot?.runs?.length ?? 0;
  const displayDatasets = useMemo(
    () =>
      applySeriesColors(
        chartDatasets,
        variableSeries,
        runCount > 1 ? pathOpacity : undefined,
      ),
    [chartDatasets, pathOpacity, runCount, variableSeries],
  );
  const legendItems = useMemo(
    () =>
      variableLegendPreview.map((entry) => ({
        label: entry.legendLabel,
        color: variableSeries.get(entry.name)?.color,
      })),
    [variableLegendPreview, variableSeries],
  );
  const discreteVariableNames = useMemo(
    () => variableLegendPreview.map((entry) => entry.name),
    [variableLegendPreview],
  );
  const extraGraphs = useExtraGraphToggles(discreteVariableNames);
  const extraPanels = useMemo(
    () =>
      buildExtraGraphPanels({
        snapshot: runSnapshot,
        pairs: extraGraphs.pairs,
        enabledPairKeys: extraGraphs.enabledPairKeys,
        meanEnabled: extraGraphs.meanEnabled,
        variableSeries,
      }),
    [extraGraphs, runSnapshot, variableSeries],
  );

  const updateComponent = (id, component) => {
    if (components.find((row) => row.id === id)?.mode !== component.mode) {
      setChartDatasets([]);
      setChartXMax(undefined);
      setRunSnapshot(null);
      setError("");
      clearResultsCsv();
    }
    setComponents((rows) => rows.map((row) => row.id === id ? component : row));
  };

  const addComponent = () => {
    setComponents((rows) => [...rows, emptyComponent()]);
  };

  const removeComponent = (id) => {
    setComponents((rows) => {
      const next = rows.filter((row) => row.id !== id);
      return next.length > 0 ? next : [emptyComponent()];
    });
  };

  const clearResultsCsv = useCallback(() => {
    resultsCsvRef.current = null;
    setHasResultsCsv(false);
  }, []);

  const resetModel = () => {
    setComponents(
      startBlank
        ? [emptyComponent()]
        : withComponentIds(GALTON_WATSON_PRESET.components),
    );
    setGenerations(GALTON_WATSON_PRESET.generations);
    setNumSims(GALTON_WATSON_PRESET.numSims);
    setError("");
    setChartDatasets([]);
    setChartXMax(undefined);
    setRunSnapshot(null);
    clearResultsCsv();
  };

  const applySavedSimulation = useCallback(
    (savedSimulation) => {
      if (!savedSimulation) return;

      const hydrated = hydrateDiscreteTimePayload(savedSimulation.payload);
      setComponents(hydrated.components);
      setGenerations(hydrated.settings.generations);
      setNumSims(hydrated.settings.numSims);
      setSavedSimulationId(savedSimulation.id ?? null);
      setModelName(savedSimulation.name ?? "");
      setError("");
      setChartDatasets([]);
      setChartXMax(undefined);
      setRunSnapshot(null);
      clearResultsCsv();
    },
    [clearResultsCsv],
  );

  useEffect(() => {
    if (initialSavedSimulation) {
      applySavedSimulation(initialSavedSimulation);
    }
  }, [applySavedSimulation, initialSavedSimulation]);

  const buildSavePayload = useCallback(
    () =>
      serializeDiscreteTimeState({
        components,
        generations,
        numSims,
      }),
    [components, generations, numSims],
  );

  const buildPreviewChart = useCallback(
    () => ({
      datasets: displayDatasets,
      legendItems,
      xMax: chartXMax,
      xLabel: "Step",
      yLabel: "State",
      xTickAutoSkip: false,
      showLegend: true,
    }),
    [displayDatasets, chartXMax, legendItems],
  );

  const handleDownloadResultsCsv = useCallback(() => {
    const resultsCsv = resultsCsvRef.current;
    if (resultsCsv) {
      downloadCsvText(resultsCsv.csvText, resultsCsv.filename);
    }
  }, []);

  const runSimulation = useCallback(() => {
    setError("");
    setRunning(true);

    setTimeout(() => {
      try {
        const parsedComponents = parseDiscreteComponents(components);
        const variableNames = parsedComponents.map((component) => component.name);
        const compiledComponents = parsedComponents.map(
          (component) =>
            new DiscreteTimeComponent(component.name, component.outcomes, component),
        );

        const generationCount = Number(generations);
        const runCount = Math.min(
          Math.max(parseInt(numSims, 10) || 1, 1),
          200,
        );
        const initialState = parsedComponents.map((component) => component.init);
        const allResults = [];

        for (let runIndex = 0; runIndex < runCount; runIndex += 1) {
          const solver = new DiscreteTimeStepper(
            compiledComponents,
            initialState,
            generationCount,
          );
          allResults.push(solver.run());
        }

        resultsCsvRef.current = {
          csvText: buildSimulationResultsCsv({
            results: allResults,
            columnNames: variableNames,
          }),
          filename: createSimulationResultsFilename({
            modelName,
            simulatorType: "discrete-time",
          }),
        };
        setHasResultsCsv(true);

        const alpha = runCount > 1 ? pathOpacity : 1;
        let lineWidth = 2;
        if (runCount > 1) {
          lineWidth = 1.5;
        }
        if (runCount > 50) {
          lineWidth = 1;
        }

        const componentByName = new Map(
          components
            .filter((component) => component.name.trim())
            .map((component) => [component.name.trim(), component]),
        );
        const legendLabels = variableNames.map((name) => {
          const source = componentByName.get(name);
          return buildLegendLabel(name, source?.noteEnabled, source?.noteLabel);
        });
        const datasets = [];
        allResults.forEach((result, runIndex) => {
          variableNames.forEach((name, variableIndex) => {
            const series = variableSeries.get(name);
            const color = hexToRgba(
              series?.color,
              alpha,
            );
            datasets.push({
              variableId: series?.id,
              seriesAlpha: alpha,
              label: runIndex === 0 ? legendLabels[variableIndex] : "",
              data: result.times.map((generation, rowIndex) => ({
                x: generation,
                y: result.history[rowIndex][variableIndex],
              })),
              borderColor: color,
              backgroundColor: color,
              borderWidth: lineWidth,
              stepped: "after",
              pointRadius: runCount === 1 ? 2 : 0,
            });
          });
        });

        setChartDatasets(datasets);
        setChartXMax(generationCount);
        setRunSnapshot({
          runs: allResults,
          variableNames,
          legendLabels,
          xLabel: "Step",
          yLabel: "State",
          xMax: generationCount,
          xTickAutoSkip: false,
          interpolate: "step",
          stepped: true,
        });
      } catch (runError) {
        setError(runError.message);
      } finally {
        setRunning(false);
      }
    }, 50);
  }, [components, generations, modelName, numSims, pathOpacity, variableSeries]);

  const settings = (
    <SimulationSettings
      duration={generations}
      onDurationChange={setGenerations}
      discrete
      runs={numSims}
      onRunsChange={setNumSims}
      pathOpacity={pathOpacity}
      onPathOpacityChange={setPathOpacity}
    />
  );

  return (
    <SimulatorWorkspace
      running={running}
      onRun={runSimulation}
      onReset={resetModel}
      settings={settings}
      summary={`${numSims} ${Number(numSims) === 1 ? "run" : "runs"} · ${generations} steps`}
      error={error}
      hasResults={Boolean(runSnapshot?.runs?.length)}
    >
      <div className="simulator-body">
        <aside
          className="simulator-editor"
          aria-label="Model editor"
          style={{ "--editor-width": "520px" }}
        >
          <EditorScrollArea>
            <section className="border-b border-slate-400">
              <div className="border-b border-slate-400 bg-slate-200 px-3 py-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-800">
                  Discrete-time models
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                  Choose how each variable changes at each step. Variables
                  evolve independently; probabilities must total 1.
                </p>
              </div>

              {components.map((component, index) => (
                <DiscreteComponentEditor
                  key={component.id}
                  component={component}
                  index={index}
                  onChange={(next) => updateComponent(component.id, next)}
                  onRemove={() => removeComponent(component.id)}
                />
              ))}

              <button
                type="button"
                onClick={addComponent}
                className="simulator-add-row w-full px-4 py-2 text-left text-sm text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
              >
                + Add variable
              </button>
            </section>
          </EditorScrollArea>
        </aside>

        <div
          className="simulator-results"
          role="region"
          aria-label="Simulation results"
        >
          <div className="simulator-toolbar">
            <div className="simulator-desktop-controls">
              <button
                type="button"
                onClick={runSimulation}
                disabled={running}
                className="simulator-run-button"
              >
                {running ? "Running…" : "Run"}
              </button>
              <button
                type="button"
                onClick={resetModel}
                disabled={running}
                className="simulator-reset-button"
              >
                Reset
              </button>
              {settings}
            </div>
            <div className="simulator-tools">
              <GraphsMenu
                pairs={extraGraphs.pairs}
                enabledPairKeys={extraGraphs.enabledPairKeys}
                onTogglePair={extraGraphs.togglePair}
                meanEnabled={extraGraphs.meanEnabled}
                onToggleMean={extraGraphs.toggleMean}
                meanXLabel="Step"
              />
              <SaveModelControls
                sessionUser={sessionUser}
                simulatorType="discrete-time"
                modelName={modelName}
                onModelNameChange={setModelName}
                savedSimulationId={savedSimulationId}
                exportUsername={exportUsername}
                exportSlug={initialSavedSimulation?.slug ?? null}
                canEditCurrentModel={canEditCurrentModel}
                getPayload={buildSavePayload}
                getPreviewChart={buildPreviewChart}
                supportsNativeExport={false}
                onDownloadCsv={handleDownloadResultsCsv}
                canDownloadCsv={hasResultsCsv}
                onSaved={(savedSimulation) => {
                  setSavedSimulationId(savedSimulation.id);
                  setModelName(savedSimulation.name);
                }}
              />
            </div>
          </div>

          <ChartStack
            extras={extraPanels}
            pathOpacity={runCount > 1 ? pathOpacity : 1}
            main={
              <SimChart
                datasets={displayDatasets}
                legendItems={legendItems}
                xMax={chartXMax}
                xLabel="Step"
                yLabel="State"
                xTickAutoSkip={false}
                showTooltips={parseInt(numSims, 10) <= 1}
              />
            }
          />
        </div>
      </div>
    </SimulatorWorkspace>
  );
}
