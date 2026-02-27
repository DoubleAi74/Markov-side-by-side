"use client";

import { useState, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSlidersH,
  faProjectDiagram,
  faPlus,
  faTimes,
  faUndo,
} from "@fortawesome/free-solid-svg-icons";
import SimChart from "../shared/SimChart";
import { SDEComponent, TimeStepperSDE } from "./engine";
import { compileExpression } from "@/lib/compile";

const BASE_COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#d97706",
  "#9333ea",
  "#0891b2",
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

const TABS = [
  { id: "params", label: "Parameters", icon: faSlidersH },
  { id: "components", label: "SDE Components", icon: faProjectDiagram },
];

function makeId() {
  return Math.random().toString(36).slice(2);
}
function withId(arr) {
  return arr.map((item) => ({ ...item, id: makeId() }));
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function SDESimulator() {
  const [activeTab, setActiveTab] = useState("components");
  const [params, setParams] = useState(withId(DEFAULT_PRESET.params));
  const [components, setComponents] = useState(
    withId(DEFAULT_PRESET.components),
  );
  const [tMax, setTMax] = useState(DEFAULT_PRESET.tMax);
  const [dt, setDt] = useState(DEFAULT_PRESET.dt);
  const [numSims, setNumSims] = useState(DEFAULT_PRESET.numSims);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState("");
  const [chartDatasets, setChartDatasets] = useState([]);
  const [chartXMax, setChartXMax] = useState(undefined);

  const addParam = () =>
    setParams((p) => [...p, { id: makeId(), name: "", val: "" }]);
  const removeParam = (id) => setParams((p) => p.filter((v) => v.id !== id));
  const updateParam = (id, field, value) =>
    setParams((p) =>
      p.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    );

  const addComponent = () =>
    setComponents((p) => [
      ...p,
      { id: makeId(), name: "", init: 0, drift: "", diff: "" },
    ]);
  const removeComponent = (id) =>
    setComponents((p) => p.filter((v) => v.id !== id));
  const updateComponent = (id, field, value) =>
    setComponents((p) =>
      p.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    );

  const loadPreset = () => {
    setParams(withId(DEFAULT_PRESET.params));
    setComponents(withId(DEFAULT_PRESET.components));
    setTMax(DEFAULT_PRESET.tMax);
    setDt(DEFAULT_PRESET.dt);
    setNumSims(DEFAULT_PRESET.numSims);
    setError("");
    setStats("");
    setChartDatasets([]);
  };

  const runSimulation = useCallback(() => {
    setError("");
    setRunning(true);
    setTimeout(() => {
      try {
        const activeParams = params.filter((p) => p.name.trim());
        const activeComponents = components.filter((c) => c.name.trim());
        if (activeComponents.length === 0)
          throw new Error("Please add at least one variable.");

        const paramNames = activeParams.map((p) => p.name.trim());
        const paramsObj = {};
        activeParams.forEach((p) => {
          paramsObj[p.name.trim()] = Number(p.val);
        });

        const varNames = activeComponents.map((c) => c.name.trim());
        const initialVals = activeComponents.map(
          (c) => parseFloat(c.init) || 0,
        );

        const sdeComponents = activeComponents.map((c) => {
          const driftFunc = compileExpression(c.drift, varNames, paramNames);
          const diffFunc = compileExpression(c.diff, varNames, paramNames);
          return new SDEComponent(driftFunc, diffFunc);
        });

        const n = Math.min(Math.max(parseInt(numSims) || 1, 1), 200);
        const allResults = [];
        for (let i = 0; i < n; i++) {
          const solver = new TimeStepperSDE(
            sdeComponents,
            paramsObj,
            initialVals,
            Number(tMax),
            Number(dt),
          );
          allResults.push(solver.run());
        }

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

        const pointsPerRun = allResults[0].times.length;
        const step =
          pointsPerRun * n * varNames.length > 15000
            ? Math.ceil((pointsPerRun * n * varNames.length) / 15000)
            : 1;

        const datasets = [];
        allResults.forEach((res, simIdx) => {
          const times = res.times.filter((_, i) => i % step === 0);
          const history = res.history.filter((_, i) => i % step === 0);
          varNames.forEach((label, varIdx) => {
            const color = hexToRgba(
              BASE_COLORS[varIdx % BASE_COLORS.length],
              alpha,
            );
            datasets.push({
              label: simIdx === 0 ? label : "",
              data: times.map((t, i) => ({ x: t, y: history[i][varIdx] })),
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
        setStats(
          `${n} realization${n > 1 ? "s" : ""} · ${allResults[0].times.length} pts/path`,
        );
      } catch (e) {
        setError(e.message);
      } finally {
        setRunning(false);
      }
    }, 50);
  }, [params, components, tMax, dt, numSims]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden bg-slate-50">
      {/* ── Left panel ── */}
      <div className="w-80 shrink-0 flex flex-col bg-white border-r border-slate-200">
        {/* Title */}
        <div className="px-4 py-3 border-b border-slate-200">
          <h1 className="text-base font-bold text-slate-800 leading-tight">
            SDE Solver
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Euler-Maruyama — dX = f dt + g dW
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
                  ? "border-purple-500 text-purple-600 bg-purple-50"
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
                    placeholder="Value"
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

          {activeTab === "components" && (
            <>
              {components.map((c) => (
                <div
                  key={c.id}
                  className="bg-slate-50 p-3 rounded border border-slate-200 relative"
                >
                  <button
                    onClick={() => removeComponent(c.id)}
                    className="absolute top-2 right-2 text-slate-300 hover:text-red-400"
                  >
                    <FontAwesomeIcon icon={faTimes} />
                  </button>

                  {/* Name + Init row */}
                  <div className="flex gap-2 mb-2 pr-5">
                    <div className="flex-1">
                      <label className="block text-[10px] uppercase font-bold text-slate-400 mb-0.5">
                        Variable
                      </label>
                      <input
                        type="text"
                        value={c.name}
                        placeholder="X"
                        onChange={(e) =>
                          updateComponent(c.id, "name", e.target.value)
                        }
                        className="code-input w-full border border-blue-200 rounded px-2 py-1 text-sm font-bold text-blue-800 bg-white focus:outline-blue-400"
                      />
                    </div>
                    <div className="w-20">
                      <label className="block text-[10px] uppercase font-bold text-slate-400 mb-0.5">
                        Initial
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={c.init}
                        placeholder="0"
                        onChange={(e) =>
                          updateComponent(c.id, "init", e.target.value)
                        }
                        className="w-full border rounded px-2 py-1 text-sm bg-white"
                      />
                    </div>
                  </div>

                  {/* Drift */}
                  <div className="mb-1.5">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-bold bg-green-100 text-green-800 px-1 rounded">
                        Drift
                      </span>
                      <span className="text-[10px] text-slate-400 italic">
                        f(s, t) · dt
                      </span>
                    </div>
                    <input
                      type="text"
                      value={c.drift}
                      placeholder="e.g. -0.5 * X"
                      onChange={(e) =>
                        updateComponent(c.id, "drift", e.target.value)
                      }
                      className="code-input w-full border rounded px-2 py-1 text-sm bg-white focus:outline-green-400"
                    />
                  </div>

                  {/* Diffusion */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-bold bg-orange-100 text-orange-800 px-1 rounded">
                        Diffusion
                      </span>
                      <span className="text-[10px] text-slate-400 italic">
                        g(s, t) · dW
                      </span>
                    </div>
                    <input
                      type="text"
                      value={c.diff}
                      placeholder="e.g. 0.3 * X"
                      onChange={(e) =>
                        updateComponent(c.id, "diff", e.target.value)
                      }
                      className="code-input w-full border rounded px-2 py-1 text-sm bg-white focus:outline-orange-400"
                    />
                  </div>
                </div>
              ))}
              <button
                onClick={addComponent}
                className="w-full text-xs text-blue-500 hover:text-blue-700 border border-dashed border-blue-200 hover:border-blue-400 rounded py-1.5 transition"
              >
                <FontAwesomeIcon icon={faPlus} className="mr-1" />
                Add Variable
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
            yLabel="Value"
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
                step="0.001"
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
                className="w-20 border rounded px-2 py-1.5 text-sm font-bold text-purple-700 bg-purple-50"
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
                "▶ Simulate"
              )}
            </button>

            <button
              onClick={loadPreset}
              title="Reset to example"
              className="text-slate-400 hover:text-slate-600 transition px-1"
            >
              <FontAwesomeIcon icon={faUndo} />
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
