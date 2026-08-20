import { SimulationError, assertFinite } from "./errors.js";
import { evaluateNumeric, makeEvaluationContext } from "./evaluate.js";
import { failedTrajectory, packTrajectory } from "./result.js";
import { createProgressReporter } from "./progress.js";

function identity(size) { return Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => i === j ? 1 : 0)); }

export function choleskyCorrelation(matrix, tolerance = 1e-12) {
  const n = matrix.length;
  if (!matrix.every((row) => Array.isArray(row) && row.length === n)) throw new SimulationError("INVALID_CORRELATION", "Correlation matrix must be square.");
  const lower = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    if (Math.abs(matrix[i][j] - matrix[j][i]) > tolerance) throw new SimulationError("INVALID_CORRELATION", "Correlation matrix must be symmetric.");
    let sum = matrix[i][j]; for (let k = 0; k < j; k++) sum -= lower[i][k] * lower[j][k];
    if (i === j) {
      if (Math.abs(matrix[i][i] - 1) > tolerance || sum < -tolerance) throw new SimulationError("INVALID_CORRELATION", "Correlation matrix must have unit diagonal and be positive semidefinite.");
      lower[i][j] = Math.sqrt(Math.max(0, sum));
    } else if (lower[j][j] > tolerance) lower[i][j] = sum / lower[j][j];
    else {
      if (Math.abs(sum) > tolerance) throw new SimulationError("INVALID_CORRELATION", "Correlation matrix is not positive semidefinite.");
      lower[i][j] = 0;
    }
  }
  return lower;
}

function sdeShape(model) {
  const components = model.sdeComponents ?? [];
  const noiseSources = model.noiseSources ?? components.map((_, i) => ({ id: `noise:${i}` }));
  return { components, noiseSources };
}

function expressionOf(entry) { return entry?.bytecode ?? entry?.expression ?? entry ?? 0; }

function coefficients(model, state, time, shape, absorbed) {
  const context = makeEvaluationContext(model, state, time);
  const drift = shape.components.map((component, i) => absorbed[i] ? 0 : evaluateNumeric(component.driftBytecode ?? component.drift, context));
  const diffusion = shape.components.map((component, i) => {
    if (absorbed[i]) return Array(shape.noiseSources.length).fill(0);
    if (Array.isArray(component.diffusion)) {
      const byId = new Map(component.diffusion.map((entry) => [entry.noiseId, entry]));
      return shape.noiseSources.map((noise) => evaluateNumeric(expressionOf(byId.get(noise.id)), context));
    }
    const row = Array(shape.noiseSources.length).fill(0);
    row[i] = evaluateNumeric(component.diffusionBytecode ?? component.diffusion ?? component.diff, context);
    return row;
  });
  drift.forEach((value, i) => assertFinite(value, "NON_FINITE_DRIFT", "SDE drift is non-finite.", { componentIndex: i, time }));
  diffusion.forEach((row, i) => row.forEach((value, j) => assertFinite(value, "NON_FINITE_DIFFUSION", "SDE diffusion is non-finite.", { componentIndex: i, noiseIndex: j, time })));
  return { drift, diffusion, context };
}

function reflect(value, min, max) {
  if (min == null && max == null) return value;
  if (min != null && max != null) {
    if (!(max > min)) throw new SimulationError("INVALID_BOUNDARY", "Boundary maximum must exceed minimum.");
    const width = max - min, phase = ((value - min) % (2 * width) + 2 * width) % (2 * width);
    return phase <= width ? min + phase : max - (phase - width);
  }
  if (min != null && value < min) return min + (min - value);
  if (max != null && value > max) return max - (value - max);
  return value;
}

function applyBoundary(value, boundary = { type: "none" }, absorbed, index, warnings) {
  const { type = "none", min, max } = boundary;
  const outside = (min != null && value < min) || (max != null && value > max);
  if (!outside || type === "none") return value;
  if (type === "error") throw new SimulationError("BOUNDARY_CROSSED", "SDE path crossed a configured boundary.", { componentIndex: index, value, min, max });
  if (type === "reflect") return reflect(value, min, max);
  if (type === "clamp" || type === "absorb") {
    const bounded = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));
    if (type === "absorb") absorbed[index] = true;
    else if (!warnings.some((x) => x.code === "CLAMP_BOUNDARY" && x.componentIndex === index)) warnings.push({ code: "CLAMP_BOUNDARY", componentIndex: index, message: "A path was clamped at a configured boundary." });
    return bounded;
  }
  throw new SimulationError("INVALID_BOUNDARY", `Unknown boundary policy ${JSON.stringify(type)}.`);
}

export function validateMilsteinModel(model) {
  const { components, noiseSources } = sdeShape(model), issues = [];
  const correlations = model.correlations ?? identity(noiseSources.length);
  for (let i = 0; i < correlations.length; i++) for (let j = 0; j < correlations.length; j++) if (Math.abs(correlations[i][j] - (i === j ? 1 : 0)) > 1e-12) issues.push("Milstein requires independent noise sources.");
  if (noiseSources.length !== components.length) issues.push("Milstein requires one noise source per state component.");
  components.forEach((component, i) => {
    const entries = Array.isArray(component.diffusion) ? component.diffusion : null;
    if (entries) entries.forEach((entry) => {
      const j = noiseSources.findIndex((noise) => noise.id === entry.noiseId), spec = expressionOf(entry);
      const constantZero = (typeof spec === "number" && spec === 0)
        || (typeof spec === "string" && Number(spec.trim()) === 0)
        || (spec?.version === 1 && spec.instructions?.length === 1 && spec.instructions[0][0] === "const" && spec.instructions[0][1] === 0);
      if (j !== i && !constantZero) issues.push(`Component ${i + 1} has non-diagonal diffusion.`);
    });
    if (component.diffusionDerivative == null && component.diffusionDerivativeBytecode == null) issues.push(`Component ${i + 1} requires an explicit diffusion derivative.`);
  });
  return { ok: issues.length === 0, issues: [...new Set(issues)] };
}

export function runSDE(model, options = {}) {
  const rng = options.rng, tMax = Number(options.tMax ?? model.settings?.tMax), dt = Number(options.dt ?? model.settings?.dt), method = options.method ?? model.settings?.solver ?? "euler-maruyama-v2";
  if (!rng?.normal) throw new TypeError("runSDE requires a seeded rng.");
  const state = Float64Array.from(options.initialState ?? (model.variables ?? []).map((x) => x.initialValue));
  const times = [0], states = [[...state]], warnings = [], absorbed = Array(state.length).fill(false);
  let time = 0, stepCount = 0;
  const progress = createProgressReporter(options.onProgress);
  const maxSteps = options.maxSteps ?? 10_000_000;
  try {
    if (!(Number.isFinite(tMax) && tMax > 0 && Number.isFinite(dt) && dt > 0)) throw new SimulationError("INVALID_SOLVER_CONFIG", "tMax and dt must be positive and finite.");
    if (Math.ceil(tMax / dt) > maxSteps) throw new SimulationError("RESOURCE_LIMIT", `Simulation requires more than the explicit ${maxSteps} step budget.`, { maxSteps, requestedSteps: Math.ceil(tMax / dt) });
    const shape = sdeShape(model);
    if (shape.components.length !== state.length) throw new SimulationError("INVALID_MODEL_SHAPE", "SDE components and state variables must have the same length.");
    const correlation = model.correlations ?? identity(shape.noiseSources.length), lower = choleskyCorrelation(correlation);
    const milstein = /milstein/i.test(method);
    if (milstein) { const validity = validateMilsteinModel(model); if (!validity.ok) throw new SimulationError("INVALID_MILSTEIN_MODEL", validity.issues.join(" "), { issues: validity.issues }); }
    while (time < tMax) {
      if (options.signal?.aborted) throw new SimulationError("CANCELLED", "Simulation was cancelled.");
      const h = Math.min(dt, tMax - time), sqrtH = Math.sqrt(h);
      const independent = shape.noiseSources.map(() => rng.normal());
      const dW = lower.map((row, i) => row.slice(0, i + 1).reduce((sum, value, j) => sum + value * independent[j], 0) * sqrtH);
      const { drift, diffusion, context } = coefficients(model, state, time, shape, absorbed);
      const next = new Float64Array(state.length);
      for (let i = 0; i < state.length; i++) {
        let value = state[i] + drift[i] * h + diffusion[i].reduce((sum, coefficient, j) => sum + coefficient * dW[j], 0);
        if (milstein) {
          const derivative = evaluateNumeric(shape.components[i].diffusionDerivativeBytecode ?? shape.components[i].diffusionDerivative, context);
          assertFinite(derivative, "NON_FINITE_DIFFUSION_DERIVATIVE", "Milstein diffusion derivative is non-finite.", { componentIndex: i, time });
          value += 0.5 * diffusion[i][i] * derivative * (dW[i] * dW[i] - h);
        }
        assertFinite(value, "NON_FINITE_STATE", "SDE produced a non-finite state.", { componentIndex: i, time: time + h });
        next[i] = applyBoundary(value, shape.components[i].boundary, absorbed, i, warnings);
      }
      state.set(next); time = time + h >= tMax ? tMax : time + h; stepCount++; times.push(time); states.push([...state]);
      progress({ time, tMax, stepCount, fraction: time / tMax });
    }
    return { status: "success", warnings, run: packTrajectory(times, states, { runIndex: options.runIndex, stepCount }) };
  } catch (error) {
    const structured = error instanceof SimulationError ? error : new SimulationError("INTERNAL_SOLVER_ERROR", error.message);
    return { ...failedTrajectory(times, states, structured, state, time, { runIndex: options.runIndex, stepCount }), warnings };
  }
}
