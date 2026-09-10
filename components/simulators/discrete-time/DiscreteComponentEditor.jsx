"use client";

import { useRef } from "react";
import { SquarePen, X } from "lucide-react";
import VariableColorInput from "../shared/VariableColorInput";
import { hydrateDiscreteComponent } from "@/lib/saved-simulations/serializers";
import {
  complementProbability,
  MAX_MATRIX_STATES,
  PROBABILITY_TOLERANCE,
  updateOutcomeProbability,
} from "@/lib/discrete-time/model";
import {
  DISCRETE_TIME_SERIES_COLORS,
  getSeriesColor,
} from "../shared/seriesColors";

const INPUT =
  "min-w-0 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const MODES = {
  branching: {
    label: "Branching process",
    title: "Per-individual outcomes",
    description:
      "Each individual draws an offspring count. Their offspring form the next generation.",
    defaults: {
      init: 10,
      outcomes: [
        { offspring: 0, probability: 0.45 },
        { offspring: 2, probability: 0.55 },
      ],
    },
  },
  increments: {
    label: "Random walk / changes",
    title: "Changes per step",
    description:
      "Draw one change per step and add it to the current value. Negative positions are allowed.",
    defaults: {
      init: 0,
      useSlider: true,
      outcomes: [
        { change: 1, probability: 0.5 },
        { change: -1, probability: 0.5 },
      ],
    },
  },
  matrix: {
    label: "Transition matrix",
    title: "Transition probabilities",
    description:
      "Rows are current states; columns are next states. Each row must total 1.",
    defaults: {
      init: 0,
      states: [0, 1],
      matrix: [
        [0.5, 0.5],
        [0.5, 0.5],
      ],
    },
  },
};

function ProbabilityTotal({ values }) {
  const numbers = values.map(Number);
  const total = numbers.reduce(
    (sum, value) => sum + (Number.isFinite(value) ? value : 0),
    0,
  );
  const valid =
    values.every(
      (value, index) =>
        String(value).trim() !== "" &&
        Number.isFinite(numbers[index]) &&
        numbers[index] >= 0 &&
        numbers[index] <= 1,
    ) && Math.abs(total - 1) <= PROBABILITY_TOLERANCE;
  return (
    <span
      className={`shrink-0 text-[11px] font-semibold ${valid ? "text-emerald-700" : "text-amber-800"}`}
    >
      Total: {valid ? "1.00" : Number(total.toPrecision(10))}
      {!valid && " (must be 1)"}
    </span>
  );
}

function ProbabilityRange({ label, value, onChange }) {
  const numeric = Number.isFinite(Number(value))
    ? Math.min(1, Math.max(0, Number(value)))
    : 0.5;
  return (
    <input
      type="range"
      min="0"
      max="1"
      step="0.001"
      value={numeric}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
      className="block h-6 w-full cursor-pointer accent-blue-700"
    />
  );
}

function ProbabilitySlider({ label, value, onChange }) {
  const numeric =
    String(value).trim() !== "" && Number.isFinite(Number(value))
      ? Math.min(1, Math.max(0, Number(value)))
      : 0.5;
  return (
    <div className="space-y-1.5 rounded border border-blue-100 bg-blue-50/60 px-2.5 py-2">
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[11px] text-slate-600">
        <span>{label}</span>
        <span className="font-mono text-blue-900">
          p = {numeric} · 1 − p = {complementProbability(numeric)}
        </span>
      </div>
      <ProbabilityRange label={label} value={numeric} onChange={onChange} />
    </div>
  );
}

export default function DiscreteComponentEditor({
  component,
  index,
  onChange,
  onRemove,
}) {
  const drafts = useRef({});
  const mode = component.mode ?? "branching";
  const details = MODES[mode];
  const prefix = `Variable ${index + 1}`;
  const patch = (values) => onChange({ ...component, ...values });
  const outcomes = component.outcomes ?? [];
  const field = mode === "increments" ? "change" : "offspring";
  const binary =
    mode === "matrix" ? component.states.length === 2 : outcomes.length === 2;
  const linked = binary && component.useSlider;

  const changeMode = (nextMode) => {
    drafts.current[mode] = component;
    const draft =
      drafts.current[nextMode] ??
      hydrateDiscreteComponent({ mode: nextMode, ...MODES[nextMode].defaults });
    onChange({
      ...draft,
      id: component.id,
      name: component.name,
      color: component.color,
      noteEnabled: component.noteEnabled,
      noteLabel: component.noteLabel,
    });
  };

  const changeProbability = (outcomeIndex, value) => {
    patch({
      outcomes: updateOutcomeProbability(outcomes, outcomeIndex, value, linked),
    });
  };

  const changeMatrixProbability = (rowIndex, columnIndex, value) => {
    patch({
      matrix: component.matrix.map((row, index) =>
        index === rowIndex
          ? updateOutcomeProbability(
              row.map((probability) => ({ probability })),
              columnIndex,
              value,
              linked,
            ).map((outcome) => outcome.probability)
          : row,
      ),
    });
  };

  const toggleSlider = (enabled) => {
    const validP = (value) =>
      String(value).trim() !== "" &&
      Number.isFinite(Number(value)) &&
      Number(value) >= 0 &&
      Number(value) <= 1
        ? value
        : "0.5";
    if (enabled && binary && mode === "matrix") {
      patch({
        useSlider: true,
        matrix: component.matrix.map((row) => [
          validP(row[0]),
          complementProbability(validP(row[0])),
        ]),
      });
    } else if (enabled && binary) {
      patch({
        useSlider: true,
        outcomes: updateOutcomeProbability(
          outcomes,
          0,
          validP(outcomes[0].probability),
          true,
        ),
      });
    } else patch({ useSlider: enabled });
  };

  const addState = () => {
    const used = new Set(component.states.map(Number));
    let value = 0;
    while (used.has(value)) value += 1;
    patch({
      states: [...component.states, String(value)],
      matrix: [
        ...component.matrix.map((row) => [...row, "0"]),
        [...component.states.map(() => "0"), "1"],
      ],
    });
  };

  const removeState = (stateIndex) => {
    const states = component.states.filter((_, index) => index !== stateIndex);
    patch({
      states,
      matrix: component.matrix
        .filter((_, index) => index !== stateIndex)
        .map((row) => row.filter((_, index) => index !== stateIndex)),
      init:
        component.init === component.states[stateIndex]
          ? states[0]
          : component.init,
      useSlider: false,
    });
  };

  return (
    <div className="simulator-model-row discrete-model-row grid grid-cols-[34px_minmax(0,1fr)_28px] border-b border-slate-300 bg-slate-100 sm:grid-cols-[46px_minmax(0,1fr)_36px]">
      <div className="relative flex justify-center border-r border-slate-300 pt-2">
        <VariableColorInput
          className="w-3"
          label={component.name.trim() || `variable ${index + 1}`}
          color={getSeriesColor(DISCRETE_TIME_SERIES_COLORS, index, component.color)}
          onChange={(color) => patch({ color })}
        />
        <button
          type="button"
          onClick={() => patch({ noteEnabled: !component.noteEnabled })}
          aria-label={`${prefix}: toggle label`}
          aria-pressed={component.noteEnabled}
          className={`h-6 rounded ${component.noteEnabled ? "text-slate-700" : "text-slate-400 hover:text-slate-600"}`}
        >
          <SquarePen className="h-5 w-5" />
        </button>
      </div>

      <div className="min-w-0 space-y-3 p-2.5 pb-3">
        {component.noteEnabled && (
          <input
            type="text"
            aria-label={`${prefix} label`}
            value={component.noteLabel ?? ""}
            onChange={(event) => patch({ noteLabel: event.target.value })}
            className="w-full bg-transparent text-right text-sm font-semibold text-slate-600 outline-none"
            placeholder="Add label"
          />
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-3">
          <label className="min-w-0 space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Variable
            </span>
            <input
              type="text"
              value={component.name}
              spellCheck={false}
              aria-label={`${prefix} name`}
              onChange={(event) => patch({ name: event.target.value })}
              className={INPUT}
              placeholder={mode === "branching" ? "Population" : "X"}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Initial value
            </span>
            {mode === "matrix" ? (
              <select
                aria-label={`${prefix} initial value`}
                value={component.init}
                onChange={(event) => patch({ init: event.target.value })}
                className={INPUT}
              >
                {!component.states.includes(component.init) && (
                  <option value={component.init}>
                    {component.init || "Select"}
                  </option>
                )}
                {component.states.map((value, index) => (
                  <option key={index} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                min={mode === "branching" ? 0 : undefined}
                step="1"
                value={component.init}
                aria-label={`${prefix} initial value`}
                onChange={(event) => patch({ init: event.target.value })}
                className={`${INPUT} text-center`}
                placeholder={mode === "branching" ? "10" : "0"}
              />
            )}
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Transition type
          </span>
          <select
            aria-label={`${prefix} transition type`}
            value={mode}
            onChange={(event) => changeMode(event.target.value)}
            className={INPUT}
          >
            {Object.entries(MODES).map(([value, details]) => (
              <option key={value} value={value}>
                {details.label}
              </option>
            ))}
          </select>
        </label>

        <div className="overflow-hidden rounded-lg border border-slate-300 bg-white">
          <div className="space-y-1.5 border-b border-slate-200 bg-slate-50 px-2.5 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">
              {details.title}
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              {details.description}
            </p>
            <label className="flex flex-wrap cursor-pointer items-center gap-2 pt-1 text-xs text-blue-900">
              <input
                type="checkbox"
                checked={Boolean(component.useSlider)}
                onChange={(event) => toggleSlider(event.target.checked)}
                className="h-3.5 w-3.5 accent-blue-700"
              />
              {binary
                ? mode === "matrix"
                  ? "Use p sliders"
                  : "Use p slider"
                : "Use probability sliders"}
              <span className="text-[10px] text-slate-500">
                {binary
                  ? "links p and 1 − p"
                  : "each probability ranges from 0 to 1"}
              </span>
            </label>
          </div>

          {mode === "matrix" ? (
            <>
              <div className="overflow-x-auto p-2">
                <table className="w-full border-collapse text-xs">
                  <caption className="sr-only">
                    Transition matrix. Rows are current states, columns are next
                    states.
                  </caption>
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="min-w-10 whitespace-nowrap px-1 text-left text-[10px] font-medium text-slate-500"
                      >
                        From ↓<br />
                        To →
                      </th>
                      {component.states.map((value, stateIndex) => (
                        <th
                          key={stateIndex}
                          scope="col"
                          className="min-w-20 p-1"
                        >
                          <div className="flex items-center gap-0.5">
                            <input
                              type="number"
                              step="1"
                              aria-label={`State ${stateIndex + 1} value`}
                              value={value}
                              onChange={(event) =>
                                patch({
                                  states: component.states.map(
                                    (state, index) =>
                                      index === stateIndex
                                        ? event.target.value
                                        : state,
                                  ),
                                  ...(component.init === value
                                    ? { init: event.target.value }
                                    : {}),
                                })
                              }
                              className={`${INPUT} text-center font-semibold`}
                            />
                            <button
                              type="button"
                              disabled={component.states.length === 1}
                              aria-label={`Delete state ${stateIndex + 1}`}
                              onClick={() => removeState(stateIndex)}
                              className="text-slate-400 hover:text-red-600 disabled:invisible"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </th>
                      ))}
                      <th
                        scope="col"
                        className="hidden px-2 font-medium text-slate-500 sm:table-cell"
                      >
                        Row total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {component.matrix.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t border-slate-100">
                        <th
                          scope="row"
                          className="p-1 text-center font-semibold text-slate-700"
                        >
                          {component.states[rowIndex]}
                        </th>
                        {row.map((value, columnIndex) => (
                          <td key={columnIndex} className="p-1">
                            <input
                              type="number"
                              min="0"
                              max="1"
                              step="any"
                              value={value}
                              aria-label={`From ${component.states[rowIndex]} to ${component.states[columnIndex]} probability`}
                              onChange={(event) =>
                                changeMatrixProbability(
                                  rowIndex,
                                  columnIndex,
                                  event.target.value,
                                )
                              }
                              className={`${INPUT} text-center`}
                            />
                            {component.useSlider && !binary && (
                              <ProbabilityRange
                                label={`From ${component.states[rowIndex]} to ${component.states[columnIndex]} probability slider`}
                                value={value}
                                onChange={(probability) =>
                                  changeMatrixProbability(
                                    rowIndex,
                                    columnIndex,
                                    probability,
                                  )
                                }
                              />
                            )}
                          </td>
                        ))}
                        <td className="hidden px-2 sm:table-cell">
                          <ProbabilityTotal values={row} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-1 px-2.5 pb-2 text-[11px] text-slate-500 sm:hidden">
                {component.matrix.map((row, index) => (
                  <div
                    key={index}
                    className="flex flex-wrap justify-between gap-1"
                  >
                    <span>From {component.states[index]}</span>
                    <ProbabilityTotal values={row} />
                  </div>
                ))}
              </div>
              {linked && (
                <div className="space-y-2 px-2.5 pb-2.5">
                  {component.matrix.map((row, index) => (
                    <ProbabilitySlider
                      key={index}
                      label={`From ${component.states[index]} to ${component.states[0]}`}
                      value={row[0]}
                      onChange={(value) =>
                        changeMatrixProbability(index, 0, value)
                      }
                    />
                  ))}
                </div>
              )}
              <div className="border-t border-slate-200 bg-slate-50 px-2.5 py-2">
                <button
                  type="button"
                  disabled={component.states.length >= MAX_MATRIX_STATES}
                  onClick={addState}
                  className="text-[11px] font-semibold text-blue-800 hover:text-blue-600 disabled:opacity-50"
                >
                  + Add state
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="discrete-outcome-row grid grid-cols-[minmax(0,1fr)_90px_24px] gap-2 px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase text-slate-500">
                <span>{mode === "branching" ? "Offspring" : "Change (Δ)"}</span>
                <span>Probability</span>
                <span />
              </div>
              {outcomes.map((outcome, outcomeIndex) => (
                <div
                  key={outcome.id}
                  className="discrete-outcome-row grid grid-cols-[minmax(0,1fr)_90px_24px] items-center gap-2 border-t border-slate-100 px-2.5 py-1.5"
                >
                  <input
                    type="number"
                    min={mode === "branching" ? 0 : undefined}
                    step="1"
                    value={outcome[field]}
                    aria-label={`Outcome ${outcomeIndex + 1} ${field}`}
                    onChange={(event) =>
                      patch({
                        outcomes: outcomes.map((item, index) =>
                          index === outcomeIndex
                            ? { ...item, [field]: event.target.value }
                            : item,
                        ),
                      })
                    }
                    className={INPUT}
                    placeholder={mode === "branching" ? "0" : "−1"}
                  />
                  <div className="min-w-0">
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="any"
                      value={outcome.probability}
                      aria-label={`Outcome ${outcomeIndex + 1} probability`}
                      onChange={(event) =>
                        changeProbability(outcomeIndex, event.target.value)
                      }
                      className={INPUT}
                      placeholder="0.5"
                    />
                    {component.useSlider && !binary && (
                      <ProbabilityRange
                        label={`Outcome ${outcomeIndex + 1} probability slider`}
                        value={outcome.probability}
                        onChange={(value) =>
                          changeProbability(outcomeIndex, value)
                        }
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete outcome ${outcomeIndex + 1}`}
                    onClick={() => {
                      const remaining = outcomes.filter(
                        (_, index) => index !== outcomeIndex,
                      );
                      patch({
                        useSlider: false,
                        outcomes: remaining.length
                          ? remaining
                          : hydrateDiscreteComponent({ mode }).outcomes.slice(
                              0,
                              1,
                            ),
                      });
                    }}
                    className="flex h-7 items-center justify-center text-slate-400 hover:text-red-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {linked && (
                <div className="space-y-1 px-2.5 py-2">
                  <ProbabilitySlider
                    label={`p: ${mode === "branching" ? "offspring" : "change"} ${outcomes[0][field] || "outcome 1"}`}
                    value={outcomes[0].probability}
                    onChange={(value) => changeProbability(0, value)}
                  />
                  <p className="text-[10px] text-slate-500">
                    The second outcome uses 1 − p. You can also type exact
                    probabilities above.
                  </p>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-2.5 py-2">
                <button
                  type="button"
                  disabled={outcomes.length >= 100}
                  onClick={() =>
                    patch({
                      useSlider: false,
                      outcomes: [
                        ...outcomes,
                        ...hydrateDiscreteComponent({ mode }).outcomes.slice(
                          0,
                          1,
                        ),
                      ],
                    })
                  }
                  className="text-[11px] font-semibold text-blue-800 hover:text-blue-600 disabled:opacity-50"
                >
                  + Add outcome
                </button>
                <ProbabilityTotal
                  values={outcomes.map((outcome) => outcome.probability)}
                />
              </div>
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${prefix}: delete variable`}
        className="flex items-center justify-center border-l border-slate-300 text-slate-400 hover:text-red-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
