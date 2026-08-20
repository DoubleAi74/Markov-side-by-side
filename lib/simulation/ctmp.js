import { SimulationError, assertFinite } from "./errors.js";
import { evaluateNumeric, makeEvaluationContext } from "./evaluate.js";
import { appendEndpoint, failedTrajectory, packTrajectory } from "./result.js";
import { createProgressReporter } from "./progress.js";

function prepareTransitions(model) {
  const indices = new Map((model.variables ?? []).map((variable, index) => [variable.id, index]));
  return (model.transitions ?? []).map((transition) => ({ ...transition, preparedChanges: (transition.changes ?? transition.delta?.map((delta, variableIndex) => ({ delta, variableIndex })) ?? []).map((change) => ({ index: change.variableIndex ?? indices.get(change.variableId), delta: change.delta })) }));
}

function ratesAt(model, transitions, state, time) {
  const context = makeEvaluationContext(model, state, time);
  return transitions.map((transition, index) => {
    let rate;
    try { rate = evaluateNumeric(transition.rateBytecode ?? transition.rate, context); }
    catch (cause) { throw new SimulationError("RATE_EVALUATION_FAILED", `Transition ${transition.id ?? index} rate could not be evaluated.`, { transitionId: transition.id, cause: cause.message }); }
    assertFinite(rate, "NON_FINITE_RATE", "Transition rate is non-finite.", { transitionId: transition.id, rate, time });
    if (rate < 0) throw new SimulationError("NEGATIVE_PROPENSITY", "CTMP rates cannot be negative.", { transitionId: transition.id, rate, time });
    return rate;
  });
}

function applyTransition(state, transition) {
  for (const change of transition.preparedChanges) {
    if (!Number.isInteger(change.index) || !Number.isSafeInteger(change.delta)) throw new SimulationError("INVALID_TRANSITION", "Transition contains an invalid state change.", { transitionId: transition.id, change });
    const next = state[change.index] + change.delta;
    if (!Number.isSafeInteger(next) || next < 0) throw new SimulationError("INVALID_STATE_TRANSITION", "Transition would produce a negative or unsafe-integer state.", { transitionId: transition.id, variableIndex: change.index, current: state[change.index], delta: change.delta });
  }
  for (const change of transition.preparedChanges) state[change.index] += change.delta;
}

function choose(rates, total, rng) {
  const target = rng.nextFloat() * total;
  let cumulative = 0;
  for (let i = 0; i < rates.length; i++) { cumulative += rates[i]; if (target < cumulative) return i; }
  return rates.length - 1;
}

/** Compatibility solver: freezes explicit time within a bounded interval, while allowing any number of state-driven events. */
export function runPiecewiseFrozenCTMP(model, options = {}) {
  const rng = options.rng, tMax = Number(options.tMax ?? model.settings?.tMax), maxStep = Number(options.maxStep ?? model.settings?.maxStep ?? model.settings?.dt);
  if (!rng?.nextFloat) throw new TypeError("runPiecewiseFrozenCTMP requires a seeded rng.");
  const state = Float64Array.from(options.initialState ?? (model.variables ?? []).map((x) => x.initialValue));
  const times = [0], states = [[...state]], transitionIds = [], warnings = [];
  let time = 0, eventCount = 0, stepCount = 0;
  const progress = createProgressReporter(options.onProgress);
  const maxEvents = options.maxEvents ?? 5_000_000, maxSteps = options.maxSteps ?? 5_000_000;
  try {
    if (!(Number.isFinite(tMax) && tMax > 0 && Number.isFinite(maxStep) && maxStep > 0)) throw new SimulationError("INVALID_SOLVER_CONFIG", "tMax and maxStep must be positive and finite.");
    for (const value of state) if (!Number.isSafeInteger(value) || value < 0) throw new SimulationError("INVALID_INITIAL_STATE", "CTMP states must be non-negative safe integers.");
    const transitions = prepareTransitions(model);
    while (time < tMax) {
      if (options.signal?.aborted) throw new SimulationError("CANCELLED", "Simulation was cancelled.");
      if (++stepCount > maxSteps) throw new SimulationError("RESOURCE_LIMIT", `Simulation exceeded the explicit ${maxSteps} interval budget.`, { maxSteps });
      const freezeTime = time;
      let intervalEnd = Math.min(tMax, freezeTime + maxStep);
      while (time < intervalEnd) {
        if (eventCount >= maxEvents) throw new SimulationError("RESOURCE_LIMIT", `Simulation exceeded the explicit ${maxEvents} event budget.`, { maxEvents });
        const rates = ratesAt(model, transitions, state, freezeTime);
        const total = rates.reduce((a, b) => a + b, 0);
        assertFinite(total, "NON_FINITE_TOTAL_RATE", "Total CTMP rate is non-finite.");
        if (total === 0) { time = intervalEnd; break; }
        // High hazards shorten the time-freezing interval; this does not restrict event count.
        intervalEnd = Math.min(intervalEnd, Math.max(time, freezeTime + Math.min(maxStep, 0.25 / total)));
        const eventTime = time - Math.log(rng.nextFloat()) / total;
        if (eventTime >= intervalEnd) { time = intervalEnd; break; }
        const selected = choose(rates, total, rng);
        applyTransition(state, transitions[selected]);
        time = eventTime; eventCount++; times.push(time); states.push([...state]); transitionIds.push(transitions[selected].id ?? String(selected));
        progress({ time, tMax, eventCount, stepCount, fraction: time / tMax });
      }
      progress({ time, tMax, eventCount, stepCount, fraction: time / tMax });
    }
    appendEndpoint(times, states, tMax, state);
    return { status: "success", warnings, run: packTrajectory(times, states, { runIndex: options.runIndex, eventCount, stepCount, transitionIds }) };
  } catch (error) {
    const structured = error instanceof SimulationError ? error : new SimulationError("INTERNAL_SOLVER_ERROR", error.message);
    return { ...failedTrajectory(times, states, structured, state, time, { runIndex: options.runIndex, eventCount, stepCount, transitionIds }), warnings };
  }
}

function adaptiveSimpson(fn, a, b, tolerance, maxDepth = 18) {
  let evaluations = 0;
  const f = (x) => { evaluations++; return fn(x); };
  const fa = f(a), fb = f(b), mid = (a + b) / 2, fm = f(mid);
  const whole = (b - a) * (fa + 4 * fm + fb) / 6;
  function refine(left, right, fLeft, fMid, fRight, estimate, tol, depth) {
    const middle = (left + right) / 2, q1 = (left + middle) / 2, q3 = (middle + right) / 2;
    const f1 = f(q1), f3 = f(q3), l = (middle-left)*(fLeft+4*f1+fMid)/6, r = (right-middle)*(fMid+4*f3+fRight)/6;
    if (depth <= 0) throw new SimulationError("INTEGRATION_FAILED", "Integrated-hazard quadrature did not converge.", { left, right, tolerance: tol });
    if (Math.abs(l + r - estimate) <= 15 * tol) return l + r + (l + r - estimate) / 15;
    return refine(left,middle,fLeft,f1,fMid,l,tol/2,depth-1)+refine(middle,right,fMid,f3,fRight,r,tol/2,depth-1);
  }
  return { value: refine(a,b,fa,fm,fb,whole,tolerance,maxDepth), evaluations };
}

/** Adaptive integrated-hazard SSA for explicitly time-varying rates. */
export function runIntegratedHazardCTMP(model, options = {}) {
  const rng = options.rng, tMax = Number(options.tMax ?? model.settings?.tMax), tolerance = Number(options.tolerance ?? model.settings?.tolerance ?? 1e-7);
  if (!rng?.nextFloat) throw new TypeError("runIntegratedHazardCTMP requires a seeded rng.");
  const state = Float64Array.from(options.initialState ?? (model.variables ?? []).map((x) => x.initialValue));
  const times = [0], states = [[...state]], transitionIds = [];
  let time = 0, eventCount = 0, stepCount = 0;
  const progress = createProgressReporter(options.onProgress);
  const maxEvents = options.maxEvents ?? 1_000_000;
  try {
    if (!(Number.isFinite(tMax) && tMax > 0 && Number.isFinite(tolerance) && tolerance > 0)) throw new SimulationError("INVALID_SOLVER_CONFIG", "tMax and tolerance must be positive and finite.");
    for (const value of state) if (!Number.isSafeInteger(value) || value < 0) throw new SimulationError("INVALID_INITIAL_STATE", "CTMP states must be non-negative safe integers.");
    const transitions = prepareTransitions(model);
    while (time < tMax) {
      if (options.signal?.aborted) throw new SimulationError("CANCELLED", "Simulation was cancelled.");
      if (eventCount >= maxEvents) throw new SimulationError("RESOURCE_LIMIT", `Simulation exceeded the explicit ${maxEvents} event budget.`, { maxEvents });
      const threshold = -Math.log(rng.nextFloat());
      const totalAt = (t) => {
        if (options.signal?.aborted) throw new SimulationError("CANCELLED", "Simulation was cancelled.");
        progress({ time, tMax, eventCount, stepCount, quadratureTime: t, fraction: time / tMax });
        return ratesAt(model, transitions, state, t).reduce((a, b) => a + b, 0);
      };
      const remaining = adaptiveSimpson(totalAt, time, tMax, tolerance);
      stepCount += remaining.evaluations;
      if (!Number.isFinite(remaining.value) || remaining.value < 0) throw new SimulationError("INTEGRATION_FAILED", "Integrated hazard is invalid.", { value: remaining.value });
      if (remaining.value < threshold) {
        appendEndpoint(times, states, tMax, state);
        const kind = remaining.value === 0 ? "absorbing" : "completed";
        return { status: "success", run: packTrajectory(times, states, { runIndex: options.runIndex, eventCount, stepCount, transitionIds, termination: { kind, code: remaining.value === 0 ? "ZERO_INTEGRATED_HAZARD" : "T_MAX", message: remaining.value === 0 ? "No event can occur before the horizon." : "Reached the requested time horizon." } }) };
      }
      let lo = time, hi = tMax;
      for (let iteration = 0; iteration < 80 && hi - lo > tolerance * Math.max(1, hi); iteration++) {
        const mid = (lo + hi) / 2;
        const hazard = adaptiveSimpson(totalAt, time, mid, tolerance * 0.25);
        stepCount += hazard.evaluations;
        if (hazard.value < threshold) lo = mid; else hi = mid;
      }
      const eventTime = (lo + hi) / 2;
      if (!(eventTime > time && eventTime <= tMax)) throw new SimulationError("ROOT_SOLVE_FAILED", "Could not locate the next CTMP event time.", { time, eventTime });
      const rates = ratesAt(model, transitions, state, eventTime), total = rates.reduce((a, b) => a + b, 0);
      if (!(total > 0)) throw new SimulationError("ROOT_SOLVE_FAILED", "Event-time rate vanished during root solving.", { eventTime });
      const selected = choose(rates, total, rng); applyTransition(state, transitions[selected]);
      time = eventTime; eventCount++; times.push(time); states.push([...state]); transitionIds.push(transitions[selected].id ?? String(selected));
      progress({ time, tMax, eventCount, stepCount, fraction: time / tMax });
    }
    appendEndpoint(times, states, tMax, state);
    return { status: "success", run: packTrajectory(times, states, { runIndex: options.runIndex, eventCount, stepCount, transitionIds }) };
  } catch (error) {
    const structured = error instanceof SimulationError ? error : new SimulationError("INTERNAL_SOLVER_ERROR", error.message);
    return failedTrajectory(times, states, structured, state, time, { runIndex: options.runIndex, eventCount, stepCount, transitionIds });
  }
}
