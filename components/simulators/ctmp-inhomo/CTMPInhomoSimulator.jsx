"use client";

import { useState, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDna,
  faSlidersH,
  faExchangeAlt,
  faWaveSquare,
  faPlus,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import SimChart from "../shared/SimChart";
import { Transition, TimeStepper } from "./engine";
import { compileExpression, buildHelperBlock } from "@/lib/compile";

const COLORS = ["#4f46e5", "#db2777", "#059669", "#d97706", "#7c3aed"];

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
      { rate: "birth * Season(t) * Prey", change: "1, 0" },
      { rate: "eat * Prey * Pred", change: "-1, 1" },
      { rate: "die * Pred", change: "0, -1" },
    ],
    tMax: 7,
    dt: 0.000002,
  },
};

const TABS = [
  { id: "vars", label: "Variables", icon: faDna },
  { id: "params", label: "Parameters", icon: faSlidersH },
  { id: "helpers", label: "Time Fns", icon: faWaveSquare },
  { id: "transitions", label: "Transitions", icon: faExchangeAlt },
];

function makeId() {
  return Math.random().toString(36).slice(2);
}
function withId(arr) {
  return arr.map((item) => ({ ...item, id: makeId() }));
}

export default function CTMPInhomoSimulator() {
  const [activeTab, setActiveTab] = useState("vars");
  const [vars, setVars] = useState(withId(PRESETS.seasonal.vars));
  const [params, setParams] = useState(withId(PRESETS.seasonal.params));
  const [helpers, setHelpers] = useState(withId(PRESETS.seasonal.helpers));
  const [transitions, setTransitions] = useState(
    withId(PRESETS.seasonal.transitions),
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

  const addVar = () =>
    setVars((p) => [...p, { id: makeId(), name: "", val: 0 }]);
  const removeVar = (id) => setVars((p) => p.filter((v) => v.id !== id));
  const updateVar = (id, field, value) =>
    setVars((p) => p.map((v) => (v.id === id ? { ...v, [field]: value } : v)));

  const addParam = () =>
    setParams((p) => [...p, { id: makeId(), name: "", val: 0 }]);
  const removeParam = (id) => setParams((p) => p.filter((v) => v.id !== id));
  const updateParam = (id, field, value) =>
    setParams((p) =>
      p.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    );

  const addHelper = () =>
    setHelpers((p) => [...p, { id: makeId(), name: "", body: "" }]);
  const removeHelper = (id) => setHelpers((p) => p.filter((v) => v.id !== id));
  const updateHelper = (id, field, value) =>
    setHelpers((p) =>
      p.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    );

  const addTrans = () =>
    setTransitions((p) => [...p, { id: makeId(), rate: "", change: "" }]);
  const removeTrans = (id) =>
    setTransitions((p) => p.filter((v) => v.id !== id));
  const updateTrans = (id, field, value) =>
    setTransitions((p) =>
      p.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    );

  const loadPreset = (type) => {
    const preset = PRESETS[type];
    setVars(withId(preset.vars));
    setParams(withId(preset.params));
    setHelpers(withId(preset.helpers));
    setTransitions(withId(preset.transitions));
    setTMax(preset.tMax);
    setDt(preset.dt);
    setError("");
    setWarning("");
    setStats("");
    setChartDatasets([]);
  };

  const runSimulation = useCallback(() => {
    setError("");
    setWarning("");
    setRunning(true);
    setTimeout(() => {
      try {
        const activeVars = vars.filter((v) => v.name.trim());
        const activeParams = params.filter((p) => p.name.trim());
        const activeHelpers = helpers.filter(
          (h) => h.name.trim() && h.body.trim(),
        );
        if (activeVars.length === 0)
          throw new Error("Please define at least one variable.");

        const varNames = activeVars.map((v) => v.name.trim());
        const paramNames = activeParams.map((p) => p.name.trim());
        const paramsObj = {};
        activeParams.forEach((p) => {
          paramsObj[p.name.trim()] = Number(p.val);
        });
        const initialState = activeVars.map((v) => Number(v.val));

        const helperDefs = activeHelpers.map((h) => ({
          name: h.name.trim(),
          body: h.body,
        }));
        const helperBlock = buildHelperBlock(helperDefs, paramNames);

        const modelTransitions = transitions
          .filter((t) => t.rate.trim())
          .map((t) => {
            const rateFunc = compileExpression(
              t.rate,
              varNames,
              paramNames,
              helperBlock,
            );
            const vecParts = t.change
              .split(",")
              .map((x) => parseFloat(x.trim()));
            const updateVector = new Array(varNames.length).fill(0);
            for (let i = 0; i < varNames.length; i++) {
              if (i < vecParts.length && !isNaN(vecParts[i]))
                updateVector[i] = vecParts[i];
            }
            return new Transition(updateVector, rateFunc);
          });

        if (modelTransitions.length === 0)
          throw new Error("Please define at least one transition.");

        const sim = new TimeStepper(modelTransitions, paramsObj);
        const n = Math.min(Math.max(parseInt(numSims) || 1, 1), 200);
        const allResults = [];
        let firstWarning = "";
        for (let i = 0; i < n; i++) {
          const result = sim.run([...initialState], Number(tMax), Number(dt));
          if (!firstWarning && result.warningMsg)
            firstWarning = result.warningMsg;
          allResults.push(result);
        }
        if (firstWarning) setWarning(firstWarning);

        let alpha = 1.0,
          lineWidth = 2;
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
          allResults.reduce((sum, r) => sum + r.times.length, 0) *
          varNames.length;
        const step = totalRawPts > 15000 ? Math.ceil(totalRawPts / 15000) : 1;

        const datasets = [];
        allResults.forEach((result, simIdx) => {
          const times = result.times.filter((_, i) => i % step === 0);
          const history = result.history.filter((_, i) => i % step === 0);
          varNames.forEach((label, idx) => {
            const color = hexToRgba(COLORS[idx % COLORS.length], alpha);
            datasets.push({
              label: simIdx === 0 ? label : "",
              data: times.map((t, j) => ({ x: t, y: history[j][idx] })),
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
        setStats(
          `${n} realization${n > 1 ? "s" : ""} · ${allResults[0].times.length} pts/path`,
        );
      } catch (e) {
        setError(e.message);
      } finally {
        setRunning(false);
      }
    }, 50);
  }, [vars, params, helpers, transitions, tMax, dt, numSims]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden bg-slate-50">
      {/* ── Left panel ── */}
      <div className="w-80 shrink-0 flex flex-col bg-white border-r border-slate-200">
        {/* Title */}
        <div className="px-4 py-3 border-b border-slate-200">
          <h1 className="text-base font-bold text-slate-800 leading-tight">
            Time-Dependent Simulator
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Fixed Time-Step | Custom Time Functions
          </p>
        </div>

        {/* Tabs — 2×2 grid to avoid cramping */}
        <div className="grid grid-cols-2 border-b border-slate-200">
          {TABS.map(({ id, label, icon }, i) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition border-b-2
                ${i % 2 === 0 ? "border-r border-slate-100" : ""}
                ${
                  activeTab === id
                    ? "border-indigo-500 text-indigo-600 bg-indigo-50"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                }`}
            >
              <FontAwesomeIcon icon={icon} className="text-[10px]" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content — scrollable */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-2">
          {activeTab === "vars" && (
            <>
              {vars.map((v) => (
                <div
                  key={v.id}
                  className="flex gap-2 items-center bg-slate-50 px-2 py-1.5 rounded border border-slate-100"
                >
                  <input
                    type="text"
                    placeholder="Name"
                    value={v.name}
                    onChange={(e) => updateVar(v.id, "name", e.target.value)}
                    className="code-input flex-1 min-w-0 border rounded px-2 py-1 text-sm bg-white focus:outline-indigo-400"
                  />
                  <input
                    type="number"
                    placeholder="Init"
                    value={v.val}
                    onChange={(e) => updateVar(v.id, "val", e.target.value)}
                    className="w-16 shrink-0 border rounded px-2 py-1 text-sm bg-white"
                  />
                  <button
                    onClick={() => removeVar(v.id)}
                    className="shrink-0 text-slate-300 hover:text-red-400"
                  >
                    <FontAwesomeIcon icon={faTimes} />
                  </button>
                </div>
              ))}
              <button
                onClick={addVar}
                className="w-full text-xs text-indigo-500 hover:text-indigo-700 border border-dashed border-indigo-200 hover:border-indigo-400 rounded py-1.5 transition"
              >
                <FontAwesomeIcon icon={faPlus} className="mr-1" />
                Add Variable
              </button>
            </>
          )}

          {activeTab === "params" && (
            <>
              {params.map((p) => (
                <div
                  key={p.id}
                  className="flex gap-2 items-center bg-slate-50 px-2 py-1.5 rounded border border-slate-100"
                >
                  <input
                    type="text"
                    placeholder="Name"
                    value={p.name}
                    onChange={(e) => updateParam(p.id, "name", e.target.value)}
                    className="code-input flex-1 min-w-0 border rounded px-2 py-1 text-sm bg-white focus:outline-fuchsia-400"
                  />
                  <input
                    type="number"
                    step="any"
                    value={p.val}
                    onChange={(e) => updateParam(p.id, "val", e.target.value)}
                    className="w-20 shrink-0 border rounded px-2 py-1 text-sm bg-white"
                  />
                  <button
                    onClick={() => removeParam(p.id)}
                    className="shrink-0 text-slate-300 hover:text-red-400"
                  >
                    <FontAwesomeIcon icon={faTimes} />
                  </button>
                </div>
              ))}
              <button
                onClick={addParam}
                className="w-full text-xs text-fuchsia-500 hover:text-fuchsia-700 border border-dashed border-fuchsia-200 hover:border-fuchsia-400 rounded py-1.5 transition"
              >
                <FontAwesomeIcon icon={faPlus} className="mr-1" />
                Add Parameter
              </button>
            </>
          )}

          {activeTab === "helpers" && (
            <>
              <p className="text-xs text-slate-400 pb-1">
                Define f(t). Reference with{" "}
                <code className="bg-slate-100 px-1 rounded">Name(t)</code> in
                rates.
              </p>
              {helpers.map((h) => (
                <div
                  key={h.id}
                  className="relative bg-slate-50 px-2 py-2 pr-7 rounded border border-slate-100"
                >
                  <button
                    onClick={() => removeHelper(h.id)}
                    className="absolute top-2 right-2 text-slate-300 hover:text-red-400"
                  >
                    <FontAwesomeIcon icon={faTimes} />
                  </button>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-slate-400 shrink-0">
                      NAME
                    </span>
                    <input
                      type="text"
                      placeholder="e.g. Season"
                      value={h.name}
                      onChange={(e) =>
                        updateHelper(h.id, "name", e.target.value)
                      }
                      className="code-input flex-1 min-w-0 border rounded px-2 py-1 text-sm font-bold text-blue-700 bg-white focus:outline-blue-400"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 shrink-0">
                      f(t)=
                    </span>
                    <input
                      type="text"
                      placeholder="e.g. 1 + A * sin(w*t)"
                      value={h.body}
                      onChange={(e) =>
                        updateHelper(h.id, "body", e.target.value)
                      }
                      className="code-input flex-1 min-w-0 border rounded px-2 py-1 text-sm bg-white focus:outline-blue-400"
                    />
                  </div>
                </div>
              ))}
              <button
                onClick={addHelper}
                className="w-full text-xs text-blue-500 hover:text-blue-700 border border-dashed border-blue-200 hover:border-blue-400 rounded py-1.5 transition"
              >
                <FontAwesomeIcon icon={faPlus} className="mr-1" />
                Add Time Function
              </button>
            </>
          )}

          {activeTab === "transitions" && (
            <>
              <p className="text-xs text-slate-400 pb-1">
                Rates can reference{" "}
                <code className="bg-slate-100 px-1 rounded">Name(t)</code> time
                functions.
              </p>
              {transitions.map((tr) => (
                <div
                  key={tr.id}
                  className="relative bg-slate-50 px-2 py-2 pr-7 rounded border border-slate-100"
                >
                  <button
                    onClick={() => removeTrans(tr.id)}
                    className="absolute top-2 right-2 text-slate-300 hover:text-red-400"
                  >
                    <FontAwesomeIcon icon={faTimes} />
                  </button>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-slate-400 w-12 text-right shrink-0">
                      RATE
                    </span>
                    <input
                      type="text"
                      placeholder="e.g. birth * Season(t) * Prey"
                      value={tr.rate}
                      onChange={(e) =>
                        updateTrans(tr.id, "rate", e.target.value)
                      }
                      className="code-input flex-1 min-w-0 border rounded px-2 py-1 text-sm bg-white focus:outline-orange-400"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 w-12 text-right shrink-0">
                      CHANGE
                    </span>
                    <input
                      type="text"
                      placeholder="e.g. 1, -1"
                      value={tr.change}
                      onChange={(e) =>
                        updateTrans(tr.id, "change", e.target.value)
                      }
                      className="code-input flex-1 min-w-0 border rounded px-2 py-1 text-sm bg-white focus:outline-orange-400"
                    />
                  </div>
                </div>
              ))}
              <button
                onClick={addTrans}
                className="w-full text-xs text-orange-500 hover:text-orange-700 border border-dashed border-orange-200 hover:border-orange-400 rounded py-1.5 transition"
              >
                <FontAwesomeIcon icon={faPlus} className="mr-1" />
                Add Transition
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col p-4 gap-3 min-w-0">
        {/* Chart */}
        <div className="relative flex-1 bg-white rounded-xl border border-slate-200 shadow-sm p-3 min-h-0">
          {warning && (
            <div className="absolute top-3 right-3 z-10 max-w-xs bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-1.5 rounded text-xs shadow-sm text-right">
              ⚠ {warning}
            </div>
          )}
          <SimChart
            datasets={chartDatasets}
            xMax={chartXMax}
            xLabel="Time (t)"
            yLabel="Count"
            showTooltips={parseInt(numSims) <= 1}
          />
        </div>

        {/* Control bar */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                Max Time
              </label>
              <input
                type="number"
                value={tMax}
                step="any"
                onChange={(e) => setTMax(e.target.value)}
                className="w-20 border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                dt
              </label>
              <input
                type="number"
                value={dt}
                step="0.0001"
                onChange={(e) => setDt(e.target.value)}
                className="w-24 border rounded px-2 py-1.5 text-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                Realizations
              </label>
              <input
                type="number"
                value={numSims}
                min="1"
                max="200"
                step="1"
                onChange={(e) => setNumSims(e.target.value)}
                className="w-20 border rounded px-2 py-1.5 text-sm font-bold text-indigo-700 bg-indigo-50"
              />
            </div>

            <button
              onClick={runSimulation}
              disabled={running}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-5 py-1.5 rounded-lg shadow-sm transition text-sm"
            >
              {running ? (
                <>
                  <div className="loader text-indigo-300" /> Running…
                </>
              ) : (
                "▶ Run Simulation"
              )}
            </button>

            <button
              onClick={() => loadPreset("seasonal")}
              className="text-xs text-slate-400 hover:text-slate-600 underline transition"
            >
              Reset to Seasonal
            </button>

            {stats && (
              <span className="ml-auto text-xs text-slate-400 font-mono">
                {stats}
              </span>
            )}
          </div>

          {error && (
            <div className="mt-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded border border-red-200 font-mono">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
