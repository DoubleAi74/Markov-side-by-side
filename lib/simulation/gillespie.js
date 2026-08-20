import { SimulationError, assertFinite } from "./errors.js";
import { evaluateNumeric, makeEvaluationContext } from "./evaluate.js";
import { appendEndpoint, failedTrajectory, packTrajectory } from "./result.js";
import { createProgressReporter } from "./progress.js";

function changesFor(transition, model) {
  const byId = new Map((model.variables ?? []).map((variable, index) => [variable.id, index]));
  if (Array.isArray(transition.changes)) return transition.changes.map((change) => ({ index: change.variableIndex ?? byId.get(change.variableId), delta: change.delta }));
  if (Array.isArray(transition.delta)) return transition.delta.map((delta, index) => ({ index, delta })).filter((x) => x.delta !== 0);
  return [];
}

export function runGillespie(model, options = {}) {
  const tMax = Number(options.tMax ?? model.settings?.tMax);
  const rng = options.rng;
  if (!rng?.nextFloat) throw new TypeError("runGillespie requires a seeded rng.");
  const state = Float64Array.from(options.initialState ?? (model.variables ?? []).map((x) => x.initialValue));
  const times = [0], states = [[...state]], transitionIds = [];
  let time = 0, eventCount = 0;
  const progress = createProgressReporter(options.onProgress);
  const maxEvents = options.maxEvents ?? 5_000_000;
  try {
    if (!(Number.isFinite(tMax) && tMax > 0)) throw new SimulationError("INVALID_T_MAX", "tMax must be positive and finite.");
    for (let i = 0; i < state.length; i++) if (!Number.isSafeInteger(state[i]) || state[i] < 0) throw new SimulationError("INVALID_INITIAL_STATE", "Gillespie states must be non-negative safe integers.", { variableIndex: i });
    const prepared = (model.transitions ?? []).map((transition) => ({ ...transition, preparedChanges: changesFor(transition, model) }));
    while (time < tMax) {
      if (options.signal?.aborted) throw new SimulationError("CANCELLED", "Simulation was cancelled.");
      if (eventCount >= maxEvents) throw new SimulationError("RESOURCE_LIMIT", `Simulation exceeded the explicit ${maxEvents} event budget.`, { maxEvents });
      const context = makeEvaluationContext(model, state, time);
      const rates = prepared.map((transition, index) => {
        let rate;
        try { rate = evaluateNumeric(transition.rateBytecode ?? transition.rate, context); }
        catch (cause) { throw new SimulationError("RATE_EVALUATION_FAILED", `Transition ${transition.id ?? index} rate could not be evaluated.`, { transitionId: transition.id, cause: cause.message }); }
        assertFinite(rate, "NON_FINITE_RATE", "Transition rate is non-finite.", { transitionId: transition.id, rate });
        if (rate < 0) throw new SimulationError("NEGATIVE_PROPENSITY", "Gillespie propensities cannot be negative.", { transitionId: transition.id, rate });
        return rate;
      });
      const totalRate = rates.reduce((sum, rate) => sum + rate, 0);
      assertFinite(totalRate, "NON_FINITE_TOTAL_RATE", "Total propensity is non-finite.");
      if (totalRate === 0) {
        appendEndpoint(times, states, tMax, state);
        return { status: "success", run: packTrajectory(times, states, { runIndex: options.runIndex, eventCount, transitionIds, termination: { kind: "absorbing", code: "ZERO_TOTAL_RATE", message: "The process entered an absorbing state." } }) };
      }
      const eventTime = time - Math.log(rng.nextFloat()) / totalRate;
      if (eventTime >= tMax) { appendEndpoint(times, states, tMax, state); break; }
      let target = rng.nextFloat() * totalRate, cumulative = 0, chosen = rates.length - 1;
      for (let i = 0; i < rates.length; i++) { cumulative += rates[i]; if (target < cumulative) { chosen = i; break; } }
      const transition = prepared[chosen];
      for (const change of transition.preparedChanges) {
        if (!Number.isInteger(change.index) || change.index < 0 || change.index >= state.length || !Number.isSafeInteger(change.delta)) throw new SimulationError("INVALID_TRANSITION", "Transition contains an invalid state change.", { transitionId: transition.id, change });
        const next = state[change.index] + change.delta;
        if (!Number.isSafeInteger(next) || next < 0) throw new SimulationError("INVALID_STATE_TRANSITION", "Transition would produce a negative or unsafe-integer state.", { transitionId: transition.id, variableIndex: change.index, current: state[change.index], delta: change.delta });
      }
      for (const change of transition.preparedChanges) state[change.index] += change.delta;
      time = eventTime; eventCount++; times.push(time); states.push([...state]); transitionIds.push(transition.id ?? String(chosen));
      progress({ time, tMax, eventCount, fraction: time / tMax });
    }
    return { status: "success", run: packTrajectory(times, states, { runIndex: options.runIndex, eventCount, transitionIds }) };
  } catch (error) {
    const structured = error instanceof SimulationError ? error : new SimulationError("INTERNAL_SOLVER_ERROR", error.message);
    return failedTrajectory(times, states, structured, state, time, { runIndex: options.runIndex, eventCount, transitionIds });
  }
}
