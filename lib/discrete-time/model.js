import { normalizeColorFields } from "../colors.js";

export const DISCRETE_MODES = ["branching", "increments", "matrix"];
export const MAX_DISCRETE_STATE = 1000000;
export const MAX_MATRIX_STATES = 30;
export const PROBABILITY_TOLERANCE = 1e-9;

function requireNumber(value, label) {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    String(value).trim() === ""
  ) {
    throw new Error(`${label} is required.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number))
    throw new Error(`${label} must be a finite number.`);
  return number;
}

function requireInteger(value, label, min = -MAX_DISCRETE_STATE) {
  const number = requireNumber(value, label);
  if (
    !Number.isInteger(number) ||
    number < min ||
    number > MAX_DISCRETE_STATE
  ) {
    throw new Error(
      `${label} must be an integer between ${min.toLocaleString()} and ${MAX_DISCRETE_STATE.toLocaleString()}.`,
    );
  }
  return number;
}

export function normalizeProbabilities(values, label) {
  const probabilities = values.map((value, index) => {
    const probability = requireNumber(
      value,
      `${label}, probability ${index + 1}`,
    );
    if (probability < 0 || probability > 1) {
      throw new Error(`${label}: probabilities must be between 0 and 1.`);
    }
    return probability;
  });
  const total = probabilities.reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 1) > PROBABILITY_TOLERANCE) {
    throw new Error(
      `${label}: probabilities must total 1 (currently ${Number(total.toPrecision(10))}).`,
    );
  }
  return probabilities;
}

// Both browser runs and API saves use this validation. Missing mode means a
// legacy per-individual branching model; its interpretation must not change.
export function normalizeDiscreteComponent(component, label = "Variable") {
  if (!component || typeof component !== "object" || Array.isArray(component)) {
    throw new Error(`${label} must be an object.`);
  }
  const mode = component.mode ?? "branching";
  if (!DISCRETE_MODES.includes(mode))
    throw new Error(`${label}: unsupported transition type.`);
  const name = typeof component.name === "string" ? component.name.trim() : "";
  if (!name) throw new Error(`${label}: a variable name is required.`);
  const init = requireInteger(
    component.init,
    `${label} initial value`,
    mode === "branching" ? 0 : -MAX_DISCRETE_STATE,
  );
  const base = {
    ...normalizeColorFields(component.color),
    name,
    init,
    mode,
    useSlider: Boolean(component.useSlider),
    noteEnabled: Boolean(component.noteEnabled),
    noteLabel:
      typeof component.noteLabel === "string" ? component.noteLabel.trim() : "",
  };

  if (mode === "matrix") {
    if (
      !Array.isArray(component.states) ||
      component.states.length < 1 ||
      component.states.length > MAX_MATRIX_STATES
    ) {
      throw new Error(
        `${label}: define between 1 and ${MAX_MATRIX_STATES} states.`,
      );
    }
    const states = component.states.map((value, index) =>
      requireInteger(value, `${label} state ${index + 1}`),
    );
    if (new Set(states).size !== states.length)
      throw new Error(`${label}: state values must be unique.`);
    if (!states.includes(init))
      throw new Error(
        `${label}: initial value must be one of the defined states.`,
      );
    if (
      !Array.isArray(component.matrix) ||
      component.matrix.length !== states.length
    ) {
      throw new Error(
        `${label}: the transition matrix must have one row per state.`,
      );
    }
    const matrix = component.matrix.map((row, index) => {
      if (!Array.isArray(row) || row.length !== states.length) {
        throw new Error(
          `${label}: matrix row ${index + 1} must have one probability per state.`,
        );
      }
      return normalizeProbabilities(
        row,
        `${label}, from state ${states[index]}`,
      );
    });
    return { ...base, states, matrix };
  }

  if (
    !Array.isArray(component.outcomes) ||
    component.outcomes.length < 1 ||
    component.outcomes.length > 100
  ) {
    throw new Error(`${label}: define between 1 and 100 outcomes.`);
  }
  const field = mode === "branching" ? "offspring" : "change";
  const probabilities = normalizeProbabilities(
    component.outcomes.map((outcome) => outcome?.probability),
    label,
  );
  const outcomes = component.outcomes.map((outcome, index) => ({
    [field]: requireInteger(
      outcome?.[field],
      `${label}, outcome ${index + 1} ${field}`,
      mode === "branching" ? 0 : -MAX_DISCRETE_STATE,
    ),
    probability: probabilities[index],
  }));
  if (
    new Set(outcomes.map((outcome) => outcome[field])).size !== outcomes.length
  ) {
    throw new Error(`${label}: ${field} outcomes must be unique.`);
  }
  return { ...base, outcomes };
}

export function parseDiscreteComponents(components) {
  const parsed = components
    .filter((component) => {
      // Ignore a completely untouched, blank row, as in the other simulators.
      return (
        String(component.name ?? "").trim() ||
        String(component.init ?? "").trim() ||
        component.mode === "matrix" ||
        component.outcomes?.some(
          (outcome) =>
            String(outcome.offspring ?? outcome.change ?? "").trim() ||
            String(outcome.probability ?? "").trim(),
        )
      );
    })
    .map((component, index) =>
      normalizeDiscreteComponent(component, `Variable row ${index + 1}`),
    );
  if (!parsed.length) throw new Error("Please define at least one variable.");
  if (
    new Set(parsed.map((component) => component.name)).size !== parsed.length
  ) {
    throw new Error("Variable names must be unique.");
  }
  return parsed;
}

export function complementProbability(value) {
  return String(Number((1 - Number(value)).toPrecision(15)));
}

export function updateOutcomeProbability(outcomes, index, value, linked) {
  const canLink =
    linked &&
    outcomes.length === 2 &&
    String(value).trim() !== "" &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0 &&
    Number(value) <= 1;
  return outcomes.map((outcome, outcomeIndex) => ({
    ...outcome,
    probability:
      outcomeIndex === index
        ? value
        : canLink
          ? complementProbability(value)
          : outcome.probability,
  }));
}
