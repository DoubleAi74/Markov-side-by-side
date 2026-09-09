"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DiscreteComponentEditor from "./DiscreteComponentEditor";
import { parseDiscreteComponents } from "@/lib/discrete-time/model";
import {
  hydrateDiscreteComponent,
  hydrateDiscreteTimePayload,
  serializeDiscreteTimeState,
} from "@/lib/saved-simulations/serializers";
import PathOpacitySlider from "../shared/PathOpacitySlider";
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

  return (
    <div className="flex h-auto flex-col bg-slate-300 md:h-[calc(100vh-3.5rem)]">
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="flex max-h-[calc(100dvh-3.5rem)] min-h-0 w-full flex-col overflow-hidden border-r border-slate-300 bg-slate-100 md:max-h-none md:w-[520px] md:shrink-0">
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
                className="w-full px-4 py-2 text-left text-sm text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
              >
                + Add variable
              </button>
            </section>
          </EditorScrollArea>

          {error && (
            <div className="border-t border-slate-300 p-3">
              <div className="whitespace-pre-wrap rounded border border-red-200 bg-red-100 px-2 py-1.5 text-xs text-red-700">
                {error}
              </div>
            </div>
          )}
        </aside>

        <div className="flex min-h-[360px] min-w-0 flex-1 flex-col gap-2 bg-slate-200 pt-2 pl-2 pr-4 pb-2 md:min-h-0 md:pt-3 md:pl-3 md:pr-5 md:pb-2.5">
          <div className="border border-slate-300 bg-white">
            <div className="flex flex-nowrap items-center gap-2 px-3 py-2">
              <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2">
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={runSimulation}
                    disabled={running}
                    className="w-24 rounded bg-blue-600 py-1.5 text-center text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
                  >
                    {running ? "Running..." : "Run"}
                  </button>
                  <button
                    type="button"
                    onClick={resetModel}
                    className="w-20 rounded border border-slate-300 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    Reset
                  </button>
                </div>

                <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                  <label className="flex shrink-0 items-center gap-2 text-[11px] text-slate-500">
                    steps
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    step="1"
                    aria-label="Steps"
                    value={generations}
                    onChange={(event) => setGenerations(event.target.value)}
                    className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none ring-0 transition-colors focus:border-slate-400 focus:outline-none focus:ring-0"
                  />
                  </label>
                  <span className="flex shrink-0 items-center gap-2 text-[11px] text-slate-500">
                    runs
                    <span className="flex items-center gap-0.5">
                  <input
                    type="number"
                    min="1"
                    max="200"
                    step="1"
                    aria-label="Runs"
                    value={numSims}
                    onChange={(event) => setNumSims(event.target.value)}
                    className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none ring-0 transition-colors focus:border-slate-400 focus:outline-none focus:ring-0"
                  />
                    {Number(numSims) > 1 && (
                      <PathOpacitySlider value={pathOpacity} onChange={setPathOpacity} />
                    )}
                    </span>
                  </span>
                </div>
              </div>

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
    </div>
  );
}
