"use client";

import { useCallback, useMemo, useState } from "react";
import SimChart from "../shared/SimChart";
import ExpressionListSection from "../shared/ExpressionListSection";
import {
  CTMP_INHOMO_SERIES_COLORS,
  getSeriesColor,
  hexToRgba,
} from "../shared/seriesColors";
import { Transition, TimeStepper } from "./engine";
import { buildHelperBlock, compileExpression } from "@/lib/compile";
import {
  assignmentsToText,
  helpersToText,
  parseHelperLines,
  parseNameValueLines,
} from "@/lib/modelParsers";

const TAB_ITEMS = [
  { id: "vars", label: "Variables" },
  { id: "params", label: "Parameters" },
  { id: "transitions", label: "Transitions" },
];

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
  return Math.random().toString(36).slice(2);
}

function withTransitionIds(transitions, varCount) {
  return transitions.map((transition) => ({
    id: makeId(),
    rate: transition.rate,
    deltas: Array.from({ length: varCount }, (_, idx) =>
      String(transition.deltas?.[idx] ?? 0),
    ),
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

export default function CTMPInhomoSimulator() {
  const [activeTab, setActiveTab] = useState("vars");
  const [varRows, setVarRows] = useState(() =>
    textToRows(assignmentsToText(PRESETS.seasonal.vars)),
  );
  const [paramRows, setParamRows] = useState(() =>
    textToRows(assignmentsToText(PRESETS.seasonal.params)),
  );
  const [helperRows, setHelperRows] = useState(() =>
    textToRows(helpersToText(PRESETS.seasonal.helpers)),
  );
  const [transitions, setTransitions] = useState(() =>
    withTransitionIds(PRESETS.seasonal.transitions, PRESETS.seasonal.vars.length),
  );

  const [tMax, setTMax] = useState(PRESETS.seasonal.tMax);
  const [dt, setDt] = useState(PRESETS.seasonal.dt);
  const [numSims, setNumSims] = useState(1);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [stats, setStats] = useState("");
  const [chartDatasets, setChartDatasets] = useState([]);
  const [chartXMax, setChartXMax] = useState(undefined);

  const varsText = useMemo(() => rowsToText(varRows), [varRows]);
  const paramsText = useMemo(() => rowsToText(paramRows), [paramRows]);
  const helpersText = useMemo(() => rowsToText(helperRows), [helperRows]);

  const variableNamesPreview = useMemo(() => {
    try {
      return parseNameValueLines(varsText, "Variable").map((v) => v.name);
    } catch {
      return [];
    }
  }, [varsText]);

  const updateRow = (setter) => (id, text) => {
    setter((rows) => rows.map((row) => (row.id === id ? { ...row, text } : row)));
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
      items.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  const addTransition = () => {
    setTransitions((items) => [
      ...items,
      {
        id: makeId(),
        rate: "",
        deltas: Array.from({ length: variableNamesPreview.length }, () => "0"),
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
          rate: "",
          deltas: Array.from({ length: variableNamesPreview.length }, () => "0"),
        },
      ];
    });
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

  const loadPreset = (presetKey) => {
    const preset = PRESETS[presetKey];
    setVarRows(textToRows(assignmentsToText(preset.vars)));
    setParamRows(textToRows(assignmentsToText(preset.params)));
    setHelperRows(textToRows(helpersToText(preset.helpers)));
    setTransitions(withTransitionIds(preset.transitions, preset.vars.length));
    setTMax(preset.tMax);
    setDt(preset.dt);
    setError("");
    setWarning("");
    setStats("");
    setChartDatasets([]);
    setChartXMax(undefined);
  };

  const runSimulation = useCallback(() => {
    setError("");
    setWarning("");
    setRunning(true);

    setTimeout(() => {
      try {
        const parsedVars = parseNameValueLines(varsText, "Variable");
        const parsedParams = parseNameValueLines(paramsText, "Parameter");
        const parsedHelpers = parseHelperLines(helpersText);

        if (parsedVars.length === 0) {
          throw new Error("Please define at least one variable.");
        }

        const varNames = parsedVars.map((v) => v.name);
        const paramNames = parsedParams.map((p) => p.name);
        const initialState = parsedVars.map((v) => v.val);

        const paramsObj = {};
        parsedParams.forEach((p) => {
          paramsObj[p.name] = p.val;
        });

        const helperBlock = buildHelperBlock(parsedHelpers, paramNames);
        const activeTransitions = transitions.filter((transition) =>
          transition.rate.trim(),
        );
        if (activeTransitions.length === 0) {
          throw new Error("Please define at least one transition.");
        }

        const modelTransitions = activeTransitions.map((transition, trIdx) => {
          const rateFunc = compileExpression(
            transition.rate,
            varNames,
            paramNames,
            helperBlock,
          );
          const deltaFuncs = varNames.map((varName, varIdx) => {
            const expr = String(transition.deltas[varIdx] ?? "0").trim() || "0";
            try {
              return compileExpression(expr, varNames, paramNames, helperBlock);
            } catch (event) {
              throw new Error(
                `Transition ${trIdx + 1} (${varName} change): ${event.message}`,
              );
            }
          });

          const updateEvaluator = (state, t, params) =>
            deltaFuncs.map((fn, varIdx) => {
              const value = Number(fn(state, t, params));
              if (!Number.isFinite(value)) {
                throw new Error(
                  `Transition ${trIdx + 1}: non-finite change for "${varNames[varIdx]}".`,
                );
              }
              return value;
            });

          return new Transition(updateEvaluator, rateFunc);
        });

        const sim = new TimeStepper(modelTransitions, paramsObj);
        const n = Math.min(Math.max(parseInt(numSims, 10) || 1, 1), 200);
        const allResults = [];
        let firstWarning = "";

        for (let i = 0; i < n; i += 1) {
          const result = sim.run([...initialState], Number(tMax), Number(dt));
          if (!firstWarning && result.warningMsg) {
            firstWarning = result.warningMsg;
          }
          allResults.push(result);
        }

        if (firstWarning) {
          setWarning(firstWarning);
        }

        let alpha = 1.0;
        let lineWidth = 2;
        if (n > 1) {
          alpha = 0.6;
          lineWidth = 1.5;
        }
        if (n > 10) {
          alpha = 0.3;
          lineWidth = 1;
        }
        if (n > 50) {
          alpha = 0.15;
          lineWidth = 1;
        }

        const totalRawPts =
          allResults.reduce((sum, result) => sum + result.times.length, 0) *
          varNames.length;
        const step = totalRawPts > 15000 ? Math.ceil(totalRawPts / 15000) : 1;

        const datasets = [];
        allResults.forEach((result, simIdx) => {
          const times = result.times.filter((_, idx) => idx % step === 0);
          const history = result.history.filter((_, idx) => idx % step === 0);
          varNames.forEach((label, idx) => {
            const color = hexToRgba(
              getSeriesColor(CTMP_INHOMO_SERIES_COLORS, idx),
              alpha,
            );
            datasets.push({
              label: simIdx === 0 ? label : "",
              data: times.map((time, rowIdx) => ({ x: time, y: history[rowIdx][idx] })),
              borderColor: color,
              backgroundColor: color,
              borderWidth: lineWidth,
              stepped: "after",
              pointRadius: 0,
            });
          });
        });

        setChartDatasets(datasets);
        setChartXMax(allResults[0].times[allResults[0].times.length - 1]);
        setStats(`${allResults[0].times.length} pts/path`);
      } catch (event) {
        setError(event.message);
      } finally {
        setRunning(false);
      }
    }, 50);
  }, [dt, helpersText, numSims, paramsText, tMax, transitions, varsText]);

  return (
    <div className="flex flex-col h-auto md:h-[calc(100vh-3.5rem)] bg-slate-300">
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <aside className="w-full md:w-[500px] bg-slate-100 border-r border-slate-300 overflow-hidden flex flex-col">
          <div className="grid grid-cols-3 border-b border-slate-300 bg-slate-200">
            {TAB_ITEMS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
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

          <div className="flex-1 overflow-y-auto">
            {activeTab === "vars" && (
              <ExpressionListSection
                title="Variables"
                helperText='One line each: Name = initialValue'
                rows={varRows}
                onUpdateRow={updateRow(setVarRows)}
                onInsertRowAfter={insertRow(setVarRows)}
                onRemoveRow={removeRow(setVarRows)}
                placeholder="Prey = 300"
                showRowColor
                colorForRow={(index) =>
                  getSeriesColor(CTMP_INHOMO_SERIES_COLORS, index)
                }
              />
            )}

            {activeTab === "params" && (
              <>
                <ExpressionListSection
                  title="Parameters"
                  helperText='One line each: name = value'
                  rows={paramRows}
                  onUpdateRow={updateRow(setParamRows)}
                  onInsertRowAfter={insertRow(setParamRows)}
                  onRemoveRow={removeRow(setParamRows)}
                  placeholder="birth = 2"
                />
                <ExpressionListSection
                  title="Time Functions"
                  helperText='One line each: Name(t) = expression'
                  rows={helperRows}
                  onUpdateRow={updateRow(setHelperRows)}
                  onInsertRowAfter={insertRow(setHelperRows)}
                  onRemoveRow={removeRow(setHelperRows)}
                  placeholder="Season(t) = 1 + A * sin(w*t)"
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
                    Each transition has separate Rate and Change sub-rows.
                  </p>
                  {variableNamesPreview.length > 0 && (
                    <p className="text-[11px] text-slate-600 mt-1">
                      Order: {variableNamesPreview.join(", ")}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-500 mt-1">
                    Change inputs accept expressions (for example, <code>-X</code> for
                    extinction of variable <code>X</code>).
                  </p>
                </div>

                {transitions.map((transition, index) => (
                  <div
                    key={transition.id}
                    className="grid grid-cols-[46px_1fr_36px] border-b border-slate-300 bg-slate-100"
                  >
                    <div className="flex items-start justify-center pt-2 text-xs text-slate-500 border-r border-slate-300">
                      {index + 1}
                    </div>

                    <div className="p-2.5 space-y-2">
                      <div className="space-y-1">
                        <label className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold">
                          Rate
                        </label>
                        <input
                          type="text"
                          value={transition.rate}
                          onChange={(event) =>
                            updateTransition(transition.id, "rate", event.target.value)
                          }
                          spellCheck={false}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm code-input bg-white"
                          placeholder="birth * Season(t) * Prey"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] uppercase tracking-wide text-orange-700 font-semibold">
                          Change
                        </label>
                        {variableNamesPreview.length === 0 ? (
                          <div className="text-[11px] text-slate-500 px-2 py-1.5 bg-white border border-slate-300 rounded">
                            Define valid variable lines to enable change boxes.
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {variableNamesPreview.map((varName, varIdx) => (
                              <div
                                key={`${transition.id}-${varName}`}
                                className="bg-white border border-slate-300 rounded px-1 py-0.5"
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
                                  className="w-14 text-xs bg-transparent outline-none code-input text-slate-800"
                                  placeholder="0"
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
                      className="text-slate-400 hover:text-red-500 border-l border-slate-300 text-sm"
                      aria-label="Delete transition"
                    >
                      x
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

        <div className="flex-1 min-h-[360px] md:min-h-0 p-2 md:p-3 bg-slate-200 flex flex-col gap-2">
          <div className="flex-1 min-h-0 border border-slate-300 bg-white">
            <SimChart
              datasets={chartDatasets}
              xMax={chartXMax}
              xLabel="Time"
              yLabel="Count"
              showTooltips={parseInt(numSims, 10) <= 1}
            />
          </div>

          <div className="bg-white border border-slate-300 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="order-1 flex items-center gap-2 mr-1">
                <button
                  onClick={runSimulation}
                  disabled={running}
                  className="w-24 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-xs font-semibold text-white text-center"
                >
                  {running ? "Running..." : "Run"}
                </button>

                <button
                  onClick={() => loadPreset("seasonal")}
                  className="w-20 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs"
                >
                  Reset
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

            <div className="md:hidden mt-2 h-14 overflow-y-auto pr-1 space-y-2" aria-live="polite">
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
        </div>
      </div>
    </div>
  );
}
