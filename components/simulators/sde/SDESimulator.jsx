"use client";

import { useCallback, useMemo, useState } from "react";
import SimChart from "../shared/SimChart";
import ExpressionListSection from "../shared/ExpressionListSection";
import {
  SDE_SERIES_COLORS,
  getSeriesColor,
  hexToRgba,
} from "../shared/seriesColors";
import { SDEComponent, TimeStepperSDE } from "./engine";
import { compileExpression } from "@/lib/compile";
import { assignmentsToText, parseNameValueLines } from "@/lib/modelParsers";
import { X } from "lucide-react";

const TAB_ITEMS = [
  { id: "vars", label: "Variables" },
  { id: "params", label: "Parameters" },
];

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
  return Math.random().toString(36).slice(2);
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

export default function SDESimulator() {
  const [activeTab, setActiveTab] = useState("vars");
  const [paramRows, setParamRows] = useState(() =>
    textToRows(assignmentsToText(DEFAULT_PRESET.params)),
  );
  const [components, setComponents] = useState(() =>
    withComponentIds(DEFAULT_PRESET.components),
  );

  const [tMax, setTMax] = useState(DEFAULT_PRESET.tMax);
  const [dt, setDt] = useState(DEFAULT_PRESET.dt);
  const [numSims, setNumSims] = useState(DEFAULT_PRESET.numSims);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState("");
  const [chartDatasets, setChartDatasets] = useState([]);
  const [chartXMax, setChartXMax] = useState(undefined);

  const paramsText = rowsToText(paramRows);

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

  const addComponent = () => {
    setComponents((rows) => [
      ...rows,
      {
        id: makeId(),
        name: "",
        init: "",
        drift: "",
        diff: "",
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

  const loadPreset = () => {
    setParamRows(textToRows(assignmentsToText(DEFAULT_PRESET.params)));
    setComponents(withComponentIds(DEFAULT_PRESET.components));
    setTMax(DEFAULT_PRESET.tMax);
    setDt(DEFAULT_PRESET.dt);
    setNumSims(DEFAULT_PRESET.numSims);
    setError("");
    setStats("");
    setChartDatasets([]);
    setChartXMax(undefined);
  };

  const runSimulation = useCallback(() => {
    setError("");
    setRunning(true);

    setTimeout(() => {
      try {
        const parsedParams = parseNameValueLines(paramsText, "Parameter");
        const parsedComponents = parseVariableComponents(components);

        const paramNames = parsedParams.map((p) => p.name);
        const varNames = parsedComponents.map((c) => c.name);
        const componentByName = new Map();
        components.forEach((component) => {
          const name = component.name.trim();
          if (!name || componentByName.has(name)) return;
          componentByName.set(name, component);
        });
        const legendLabels = varNames.map((name) => {
          const source = componentByName.get(name);
          return buildLegendLabel(name, source?.noteEnabled, source?.noteLabel);
        });

        const paramsObj = {};
        parsedParams.forEach((p) => {
          paramsObj[p.name] = p.val;
        });

        const initialVals = parsedComponents.map((c) => c.init);
        const sdeComponents = parsedComponents.map((component) => {
          const driftFunc = compileExpression(
            component.drift,
            varNames,
            paramNames,
          );
          const diffFunc = compileExpression(
            component.diff,
            varNames,
            paramNames,
          );
          return new SDEComponent(driftFunc, diffFunc);
        });

        const n = Math.min(Math.max(parseInt(numSims, 10) || 1, 1), 200);
        const allResults = [];

        for (let i = 0; i < n; i += 1) {
          const solver = new TimeStepperSDE(
            sdeComponents,
            paramsObj,
            initialVals,
            Number(tMax),
            Number(dt),
          );
          allResults.push(solver.run());
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

        const pointsPerRun = allResults[0].times.length;
        const step =
          pointsPerRun * n * varNames.length > 15000
            ? Math.ceil((pointsPerRun * n * varNames.length) / 15000)
            : 1;

        const datasets = [];
        allResults.forEach((result, simIdx) => {
          const times = result.times.filter((_, idx) => idx % step === 0);
          const history = result.history.filter((_, idx) => idx % step === 0);

          varNames.forEach((_, varIdx) => {
            const color = hexToRgba(
              getSeriesColor(SDE_SERIES_COLORS, varIdx),
              alpha,
            );
            datasets.push({
              label: simIdx === 0 ? legendLabels[varIdx] : "",
              data: times.map((time, rowIdx) => ({
                x: time,
                y: history[rowIdx][varIdx],
              })),
              borderColor: color,
              backgroundColor: color,
              fill: false,
              borderWidth: lineWidth,
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
  }, [components, dt, numSims, paramsText, tMax]);

  return (
    <div className="flex flex-col h-auto md:h-[calc(100vh-3.5rem)] bg-slate-300">
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <aside className="w-full md:w-[520px] bg-slate-100 border-r border-slate-300 overflow-hidden flex flex-col">
          <div className="grid grid-cols-2 border-b border-slate-300 bg-slate-200">
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
            {activeTab === "params" && (
              <ExpressionListSection
                title="Parameters"
                helperText="One line each: Name = Value"
                rows={paramRows}
                onUpdateRow={updateRow(setParamRows)}
                onInsertRowAfter={insertParamRow}
                onRemoveRow={removeParamRow}
                placeholder="sigma_x = 0.2"
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
                            placeholder="Add Label &nbsp; "
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

                      {/* DRIFT */}
                      {/* FIX: Removed JS length logic. Added pr-14 to input to prevent text from hitting the label. */}
                      <div className="relative  w-full mb-[2px]">
                        <input
                          type="text"
                          value={component.drift}
                          onChange={(event) =>
                            updateComponent(
                              component.id,
                              "drift",
                              event.target.value,
                            )
                          }
                          spellCheck={false}
                          className="w-full pl-2.5 pr-14 py-1.5 border border-slate-300 rounded text-sm bg-white"
                          placeholder="f(N,t)"
                        />
                        {/* OPTIONAL: Add 'hidden sm:block' to the span classes below if you want to hide the label entirely on very small mobile screens */}
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] uppercase tracking-wide text-emerald-900/60 font-semibold pointer-events-none">
                          Drift
                        </span>
                      </div>

                      {/* DIFFUSION */}
                      {/* FIX: Removed JS length logic. Added pr-16 to input to prevent text from hitting the label. */}
                      <div className="relative  w-full">
                        <input
                          type="text"
                          value={component.diff}
                          onChange={(event) =>
                            updateComponent(
                              component.id,
                              "diff",
                              event.target.value,
                            )
                          }
                          spellCheck={false}
                          className="w-full pl-2.5 pr-16 py-1.5 border border-slate-300 rounded text-sm bg-white"
                          placeholder="g(N,t)"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] uppercase tracking-wide text-orange-900/60 font-semibold pointer-events-none">
                          Diffusion
                        </span>
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
              </section>
            )}
          </div>

          {error && (
            <div className="p-3 border-t border-slate-300 space-y-2">
              {error && (
                <div className="text-xs text-red-700 bg-red-100 border border-red-200 px-2 py-1.5 rounded whitespace-pre-wrap">
                  {error}
                </div>
              )}
            </div>
          )}
        </aside>

        <div className="flex-1 min-h-[360px] md:min-h-0 p-2 md:p-3 bg-slate-200 flex flex-col gap-2">
          <div className="flex-1 min-h-0 border border-slate-300 bg-white">
            <SimChart
              datasets={chartDatasets}
              legendItems={legendItems}
              xMax={chartXMax}
              xLabel="Time"
              yLabel="Value"
              showTooltips={parseInt(numSims, 10) <= 1}
            />
          </div>

          <div className="bg-white border border-slate-300 px-3 py-2 flex flex-wrap items-center gap-2">
            <div className="order-1 flex items-center gap-2 mr-1">
              <button
                onClick={runSimulation}
                disabled={running}
                className="w-24 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-xs font-semibold text-white text-center"
              >
                {running ? "Running..." : "Run"}
              </button>

              <button
                onClick={loadPreset}
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
                step="0.001"
                onChange={(event) => setDt(event.target.value)}
                className="w-20 px-2 py-1 rounded border border-slate-300 text-xs bg-white"
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
        </div>
      </div>
    </div>
  );
}
