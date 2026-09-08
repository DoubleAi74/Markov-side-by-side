"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  hydrateDiscreteTimePayload,
  serializeDiscreteTimeState,
} from "@/lib/saved-simulations/serializers";
import SaveModelControls from "../shared/SaveModelControls";
import SimChart from "../shared/SimChart";
import {
  buildSimulationResultsCsv,
  createSimulationResultsFilename,
  downloadCsvText,
} from "../shared/resultsCsv";
import {
  DISCRETE_TIME_SERIES_COLORS,
  getSeriesColor,
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

function makeId() {
  return Math.random().toString(36).slice(2);
}

function withOutcomeIds(outcomes) {
  return outcomes.map((outcome) => ({
    id: makeId(),
    offspring: String(outcome.offspring),
    probability: String(outcome.probability),
  }));
}

function withComponentIds(components) {
  return components.map((component) => ({
    id: makeId(),
    name: component.name,
    init: String(component.init),
    outcomes: withOutcomeIds(component.outcomes ?? []),
    noteEnabled: Boolean(component.noteEnabled),
    noteLabel: component.noteLabel ?? "",
  }));
}

function emptyComponent() {
  return {
    id: makeId(),
    name: "",
    init: "",
    outcomes: withOutcomeIds([
      { offspring: "", probability: "" },
      { offspring: "", probability: "" },
    ]),
    noteEnabled: false,
    noteLabel: "",
  };
}

function parseDiscreteComponents(components) {
  const parsed = [];
  const seen = new Set();

  components.forEach((component, index) => {
    const name = component.name.trim();
    const initText = String(component.init ?? "").trim();
    const hasOutcomeInput = component.outcomes.some(
      (outcome) =>
        String(outcome.offspring ?? "").trim() ||
        String(outcome.probability ?? "").trim(),
    );
    const isEmpty = !name && !initText && !hasOutcomeInput;

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

    const init = Number(initText);
    if (!Number.isInteger(init) || init < 0) {
      throw new Error(
        `Variable row ${index + 1}: initial value must be a non-negative integer.`,
      );
    }
    const outcomes = component.outcomes.map((outcome, outcomeIndex) => {
      const offspringText = String(outcome.offspring ?? "").trim();
      const probabilityText = String(outcome.probability ?? "").trim();
      if (!offspringText || !probabilityText) {
        throw new Error(
          `Variable row ${index + 1}, outcome ${outcomeIndex + 1}: enter both offspring and probability.`,
        );
      }
      const offspring = Number(offspringText);
      const probability = Number(probabilityText);

      if (!Number.isInteger(offspring) || offspring < 0) {
        throw new Error(
          `Variable row ${index + 1}, outcome ${outcomeIndex + 1}: offspring must be a non-negative integer.`,
        );
      }
      if (
        !Number.isFinite(probability) ||
        probability < 0 ||
        probability > 1
      ) {
        throw new Error(
          `Variable row ${index + 1}, outcome ${outcomeIndex + 1}: probability must be between 0 and 1.`,
        );
      }
      return { offspring, probability };
    });

    if (outcomes.length === 0) {
      throw new Error(`Variable row ${index + 1}: add at least one outcome.`);
    }

    const uniqueOffspring = new Set(outcomes.map((outcome) => outcome.offspring));
    if (uniqueOffspring.size !== outcomes.length) {
      throw new Error(
        `Variable row ${index + 1}: offspring outcomes must be unique.`,
      );
    }

    const probabilityTotal = outcomes.reduce(
      (total, outcome) => total + outcome.probability,
      0,
    );
    if (Math.abs(probabilityTotal - 1) > 1e-9) {
      throw new Error(
        `Variable row ${index + 1}: probabilities must total 1 (currently ${probabilityTotal.toFixed(4)}).`,
      );
    }

    parsed.push({ name, init, outcomes });
  });

  if (parsed.length === 0) {
    throw new Error("Please define at least one variable.");
  }
  return parsed;
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
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
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
  const legendItems = useMemo(
    () =>
      variableLegendPreview.map((entry, index) => ({
        label: entry.legendLabel,
        color: getSeriesColor(DISCRETE_TIME_SERIES_COLORS, index),
      })),
    [variableLegendPreview],
  );

  const updateComponent = (id, field, value) => {
    setComponents((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  };

  const updateOutcome = (componentId, outcomeId, field, value) => {
    setComponents((rows) =>
      rows.map((component) =>
        component.id === componentId
          ? {
              ...component,
              outcomes: component.outcomes.map((outcome) =>
                outcome.id === outcomeId
                  ? { ...outcome, [field]: value }
                  : outcome,
              ),
            }
          : component,
      ),
    );
  };

  const addOutcome = (componentId) => {
    setComponents((rows) =>
      rows.map((component) =>
        component.id === componentId
          ? {
              ...component,
              outcomes: [
                ...component.outcomes,
                { id: makeId(), offspring: "", probability: "" },
              ],
            }
          : component,
      ),
    );
  };

  const removeOutcome = (componentId, outcomeId) => {
    setComponents((rows) =>
      rows.map((component) => {
        if (component.id !== componentId) return component;
        const nextOutcomes = component.outcomes.filter(
          (outcome) => outcome.id !== outcomeId,
        );
        return {
          ...component,
          outcomes:
            nextOutcomes.length > 0
              ? nextOutcomes
              : [{ id: makeId(), offspring: "", probability: "" }],
        };
      }),
    );
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
    setStats("");
    setChartDatasets([]);
    setChartXMax(undefined);
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
      setStats("");
      setChartDatasets([]);
      setChartXMax(undefined);
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
      datasets: chartDatasets,
      legendItems,
      xMax: chartXMax,
      xLabel: "Generation",
      yLabel: "Count",
      xTickAutoSkip: false,
      showLegend: true,
    }),
    [chartDatasets, chartXMax, legendItems],
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
            new DiscreteTimeComponent(component.name, component.outcomes),
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

        let alpha = 1;
        let lineWidth = 2;
        if (runCount > 1) {
          alpha = 0.55;
          lineWidth = 1.5;
        }
        if (runCount > 10) {
          alpha = 0.3;
          lineWidth = 1;
        }
        if (runCount > 50) {
          alpha = 0.15;
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
          variableNames.forEach((_, variableIndex) => {
            const color = hexToRgba(
              getSeriesColor(DISCRETE_TIME_SERIES_COLORS, variableIndex),
              alpha,
            );
            datasets.push({
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
        setStats(`${generationCount} generations · ${runCount} runs`);
      } catch (runError) {
        setError(runError.message);
      } finally {
        setRunning(false);
      }
    }, 50);
  }, [components, generations, modelName, numSims]);

  return (
    <div className="flex h-auto flex-col bg-slate-300 md:h-[calc(100vh-3.5rem)]">
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="flex w-full flex-col overflow-hidden border-r border-slate-300 bg-slate-100 md:w-[520px]">
          <div className="flex-1 overflow-y-auto">
            <section className="border-b border-slate-300">
              <div className="border-b border-slate-300 bg-slate-200 px-3 py-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                  Independent transitions
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                  At each generation, every individual independently produces
                  one of the offspring counts below. Probabilities must total 1.
                </p>
              </div>

              {components.map((component, index) => {
                const probabilityTotal = component.outcomes.reduce(
                  (total, outcome) =>
                    total + (Number(outcome.probability) || 0),
                  0,
                );
                const probabilityIsComplete =
                  Math.abs(probabilityTotal - 1) <= 1e-9;

                return (
                  <div
                    key={component.id}
                    className="grid grid-cols-[46px_1fr_36px] border-b border-slate-300 bg-slate-100"
                  >
                    <div className="relative flex items-start justify-center border-r border-slate-300 pt-2 text-xs text-slate-500">
                      <span
                        className="absolute left-1 top-1/2 h-6 w-[15px] -translate-y-1/2 rounded-[2px]"
                        style={{
                          backgroundColor: getSeriesColor(
                            DISCRETE_TIME_SERIES_COLORS,
                            index,
                          ),
                        }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateComponent(
                            component.id,
                            "noteEnabled",
                            !component.noteEnabled,
                          )
                        }
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

                    <div className="flex w-full flex-col overflow-hidden p-2.5 pb-3">
                      {component.noteEnabled && (
                        <div className="mb-1 flex justify-end">
                          <input
                            type="text"
                            value={component.noteLabel ?? ""}
                            onChange={(event) =>
                              updateComponent(
                                component.id,
                                "noteLabel",
                                event.target.value,
                              )
                            }
                            spellCheck={false}
                            className="max-w-full bg-transparent px-1 text-right text-sm font-semibold text-slate-600 outline-none"
                            placeholder="Add label"
                          />
                        </div>
                      )}

                      <div className="mb-2 flex justify-between px-0.5 text-[9px] font-semibold tracking-wide text-slate-400">
                        <span>VARIABLE</span>
                        <span>INITIAL VALUE</span>
                      </div>
                      <div className="flex gap-3 sm:gap-8">
                        <input
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
                          className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                          placeholder="Population"
                        />
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={component.init}
                          onChange={(event) =>
                            updateComponent(
                              component.id,
                              "init",
                              event.target.value,
                            )
                          }
                          className="w-24 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-center text-sm"
                          placeholder="10"
                        />
                      </div>

                      <div className="mt-3 overflow-hidden rounded-lg border border-slate-300 bg-white">
                        <div className="border-b border-slate-200 bg-slate-50 px-2.5 py-2">
                          <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-800/80">
                            Per-individual outcomes
                          </div>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            One outcome is drawn independently for each current
                            individual.
                          </p>
                        </div>

                        <div className="grid grid-cols-[1fr_96px_28px] gap-2 px-2.5 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                          <span>Offspring</span>
                          <span>Probability</span>
                          <span />
                        </div>

                        {component.outcomes.map((outcome, outcomeIndex) => (
                          <div
                            key={outcome.id}
                            className="grid grid-cols-[1fr_96px_28px] items-center gap-2 border-t border-slate-100 px-2.5 py-1.5 first:border-t-0"
                          >
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={outcome.offspring}
                              onChange={(event) =>
                                updateOutcome(
                                  component.id,
                                  outcome.id,
                                  "offspring",
                                  event.target.value,
                                )
                              }
                              aria-label={`Outcome ${outcomeIndex + 1} offspring`}
                              className="min-w-0 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                              placeholder={outcomeIndex === 0 ? "0" : "2"}
                            />
                            <input
                              type="number"
                              min="0"
                              max="1"
                              step="0.01"
                              value={outcome.probability}
                              onChange={(event) =>
                                updateOutcome(
                                  component.id,
                                  outcome.id,
                                  "probability",
                                  event.target.value,
                                )
                              }
                              aria-label={`Outcome ${outcomeIndex + 1} probability`}
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                              placeholder={outcomeIndex === 0 ? "0.45" : "0.55"}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                removeOutcome(component.id, outcome.id)
                              }
                              className="flex h-7 w-7 items-center justify-center rounded text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                              aria-label={`Delete outcome ${outcomeIndex + 1}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}

                        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-2.5 py-2">
                          <button
                            type="button"
                            onClick={() => addOutcome(component.id)}
                            className="text-[11px] font-semibold text-blue-800 hover:text-blue-600"
                          >
                            + Add outcome
                          </button>
                          <span
                            className={`text-[10px] font-semibold ${
                              probabilityIsComplete
                                ? "text-emerald-700"
                                : "text-amber-700"
                            }`}
                          >
                            Total: {probabilityTotal.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeComponent(component.id)}
                      className="flex items-center justify-center border-l border-slate-300 text-slate-400 hover:text-red-500"
                      aria-label="Delete variable"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={addComponent}
                className="w-full px-4 py-2 text-left text-sm text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
              >
                + Add population
              </button>
            </section>
          </div>

          {error && (
            <div className="border-t border-slate-300 p-3">
              <div className="whitespace-pre-wrap rounded border border-red-200 bg-red-100 px-2 py-1.5 text-xs text-red-700">
                {error}
              </div>
            </div>
          )}
        </aside>

        <div className="flex min-h-[360px] min-w-0 flex-1 flex-col gap-2 bg-slate-200 p-2 md:min-h-0 md:p-3">
          <div className="min-h-0 flex-1 border border-slate-300 bg-white">
            <SimChart
              datasets={chartDatasets}
              legendItems={legendItems}
              xMax={chartXMax}
              xLabel="Generation"
              yLabel="Count"
              xTickAutoSkip={false}
              showTooltips={parseInt(numSims, 10) <= 1}
            />
          </div>

          <div className="border border-slate-300 bg-white">
            <div className="flex items-start gap-2 px-3 py-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-2">
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
                  <button
                    type="button"
                    onClick={handleDownloadResultsCsv}
                    disabled={!hasResultsCsv}
                    className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Download CSV
                  </button>
                </div>

                <div className="flex min-w-0 max-w-full items-center gap-2 overflow-x-auto whitespace-nowrap">
                  <label className="text-[11px] text-slate-500">
                    generations
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    step="1"
                    value={generations}
                    onChange={(event) => setGenerations(event.target.value)}
                    className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                  />
                  <label className="text-[11px] text-slate-500">runs</label>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    step="1"
                    value={numSims}
                    onChange={(event) => setNumSims(event.target.value)}
                    className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                  />
                </div>

                {stats && (
                  <span className="ml-auto font-mono text-xs text-slate-500">
                    {stats}
                  </span>
                )}
              </div>

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
                onSaved={(savedSimulation) => {
                  setSavedSimulationId(savedSimulation.id);
                  setModelName(savedSimulation.name);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
