"use client";

import { useState, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDna,
  faSlidersH,
  faExchangeAlt,
  faPlus,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import SimChart from "../shared/SimChart";
import { Transition, Gillespie } from "./engine";
import { compileExpression } from "@/lib/compile";

const COLORS = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#6366f1",
];

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const FOOD_CHAIN_PRESET = {
  vars: [
    { name: "Plants", val: 500 },
    { name: "Herbivores", val: 500 },
    { name: "Carnivores", val: 100 },
  ],
  params: [
    { name: "p_growth", val: 100.0 },
    { name: "K", val: 1000.0 },
    { name: "p_decay", val: 0.1 },
    { name: "h_eat", val: 0.06 },
    { name: "h_death", val: 0.2 },
    { name: "c_eat", val: 0.01 },
    { name: "c_death", val: 0.8 },
  ],
  transitions: [
    { rate: "p_growth * (1 - Plants/K)", change: "1, 0, 0" },
    { rate: "p_decay * Plants", change: "-1, 0, 0" },
    { rate: "h_eat * Plants * Herbivores", change: "-1, 1, 0" },
    { rate: "h_death * Herbivores", change: "0, -1, 0" },
    { rate: "c_eat * Herbivores * Carnivores", change: "0, -1, 1" },
    { rate: "c_death * Carnivores", change: "0, 0, -1" },
  ],
  tMax: 5,
};

const TABS = [
  { id: "vars", label: "Variables", icon: faDna },
  { id: "params", label: "Parameters", icon: faSlidersH },
  { id: "transitions", label: "Transitions", icon: faExchangeAlt },
];

function makeId() {
  return Math.random().toString(36).slice(2);
}
function withId(arr) {
  return arr.map((item) => ({ ...item, id: makeId() }));
}

export default function GillespieSimulator() {
  const [activeTab, setActiveTab] = useState("vars");
  const [vars, setVars] = useState(withId(FOOD_CHAIN_PRESET.vars));
  const [params, setParams] = useState(withId(FOOD_CHAIN_PRESET.params));
  const [transitions, setTransitions] = useState(
    withId(FOOD_CHAIN_PRESET.transitions),
  );
  const [tMax, setTMax] = useState(FOOD_CHAIN_PRESET.tMax);
  const [numSims, setNumSims] = useState(1);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
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

  const addTrans = () =>
    setTransitions((p) => [...p, { id: makeId(), rate: "", change: "" }]);
  const removeTrans = (id) =>
    setTransitions((p) => p.filter((v) => v.id !== id));
  const updateTrans = (id, field, value) =>
    setTransitions((p) =>
      p.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    );

  const loadPreset = () => {
    setVars(withId(FOOD_CHAIN_PRESET.vars));
    setParams(withId(FOOD_CHAIN_PRESET.params));
    setTransitions(withId(FOOD_CHAIN_PRESET.transitions));
    setTMax(FOOD_CHAIN_PRESET.tMax);
    setError("");
    setStats("");
    setChartDatasets([]);
  };

  const runSimulation = useCallback(() => {
    setError("");
    setRunning(true);
    setTimeout(() => {
      try {
        const activeVars = vars.filter((v) => v.name.trim());
        const activeParams = params.filter((p) => p.name.trim());
        if (activeVars.length === 0)
          throw new Error("Please define at least one variable.");

        const varNames = activeVars.map((v) => v.name.trim());
        const paramNames = activeParams.map((p) => p.name.trim());
        const paramsObj = {};
        activeParams.forEach((p) => {
          paramsObj[p.name.trim()] = Number(p.val);
        });
        const initialState = activeVars.map((v) => Number(v.val));

        const modelTransitions = transitions
          .filter((t) => t.rate.trim())
          .map((t) => {
            const rateFunc = compileExpression(t.rate, varNames, paramNames);
            const wrappedRate = (s, p) => rateFunc(s, 0, p);
            const vecParts = t.change
              .split(",")
              .map((x) => parseFloat(x.trim()));
            const updateVector = new Array(varNames.length).fill(0);
            for (let i = 0; i < varNames.length; i++) {
              if (i < vecParts.length && !isNaN(vecParts[i]))
                updateVector[i] = vecParts[i];
            }
            return new Transition(updateVector, wrappedRate);
          });

        if (modelTransitions.length === 0)
          throw new Error("Please define at least one transition.");

        const sim = new Gillespie(modelTransitions, paramsObj);
        const n = Math.min(Math.max(parseInt(numSims) || 1, 1), 200);
        const allResults = [];
        for (let i = 0; i < n; i++) {
          allResults.push(sim.run([...initialState], Number(tMax)));
        }

        let alpha = 1.0, lineWidth = 2;
        if (n > 1)  { alpha = 0.6;  lineWidth = 1.5; }
        if (n > 10) { alpha = 0.3;  lineWidth = 1; }
        if (n > 50) { alpha = 0.15; lineWidth = 1; }

        const totalRawPts = allResults.reduce((sum, r) => sum + r.times.length, 0) * varNames.length;
        const step = totalRawPts > 15000 ? Math.ceil(totalRawPts / 15000) : 1;

        const datasets = [];
        allResults.forEach((result, simIdx) => {
          const times   = result.times.filter((_, i) => i % step === 0);
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
        setChartXMax(Math.max(...allResults.map((r) => r.times[r.times.length - 1])));
        const avgEvents = Math.round(allResults.reduce((s, r) => s + r.times.length - 1, 0) / n);
        setStats(
          `${n} realization${n > 1 ? "s" : ""} · ${avgEvents} events avg`,
        );
      } catch (e) {
        setError(e.message);
      } finally {
        setRunning(false);
      }
    }, 50);
  }, [vars, params, transitions, tMax, numSims]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden bg-slate-50">
      {/* ── Left panel ── */}
      <div className="w-80 shrink-0 flex flex-col bg-white border-r border-slate-200">
        {/* Title */}
        <div className="px-4 py-3 border-b border-slate-200">
          <h1 className="text-base font-bold text-slate-800 leading-tight">
            Reaction Network Designer
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            CTMC Gillespie — Exact Simulation
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          {TABS.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition border-b-2 ${
                activeTab === id
                  ? "border-blue-500 text-blue-600 bg-blue-50"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              <FontAwesomeIcon icon={icon} className="text-[11px]" />
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
                    className="code-input flex-1 min-w-0 border rounded px-2 py-1 text-sm bg-white focus:outline-blue-400"
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
                className="w-full text-xs text-blue-500 hover:text-blue-700 border border-dashed border-blue-200 hover:border-blue-400 rounded py-1.5 transition"
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
                    className="code-input flex-1 min-w-0 border rounded px-2 py-1 text-sm bg-white focus:outline-purple-400"
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
                className="w-full text-xs text-purple-500 hover:text-purple-700 border border-dashed border-purple-200 hover:border-purple-400 rounded py-1.5 transition"
              >
                <FontAwesomeIcon icon={faPlus} className="mr-1" />
                Add Parameter
              </button>
            </>
          )}

          {activeTab === "transitions" && (
            <>
              <p className="text-xs text-slate-400 pb-1">
                <strong>Rate:</strong> e.g. <code>k * Plants</code> &nbsp;
                <strong>Change:</strong> comma-separated integers.
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
                      placeholder="e.g. k * Plants"
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
                      placeholder="e.g. -1, 1, 0"
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
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm p-3 min-h-0">
          <SimChart
            datasets={chartDatasets}
            xMax={chartXMax}
            xLabel="Time"
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
                className="w-20 border rounded px-2 py-1.5 text-sm font-bold text-blue-700 bg-blue-50"
              />
            </div>

            <button
              onClick={runSimulation}
              disabled={running}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold px-5 py-1.5 rounded-lg shadow-sm transition text-sm"
            >
              {running ? (
                <>
                  <div className="loader text-blue-300" /> Running…
                </>
              ) : (
                "▶ Run Simulation"
              )}
            </button>

            <button
              onClick={loadPreset}
              className="text-xs text-slate-400 hover:text-slate-600 underline transition"
            >
              Reset to Food Chain
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
