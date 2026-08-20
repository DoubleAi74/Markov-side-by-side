export function packTrajectory(times, states, meta = {}) {
  const width = states[0]?.length ?? 0;
  const values = new Float64Array(times.length * width);
  states.forEach((state, row) => values.set(state, row * width));
  return { runIndex: meta.runIndex ?? 0, reachedTime: times.at(-1) ?? 0, eventCount: meta.eventCount ?? 0, stepCount: meta.stepCount ?? 0, times: Float64Array.from(times), values, stateCount: width, transitionIds: meta.transitionIds, termination: meta.termination ?? { kind: "completed", code: "T_MAX", message: "Reached the requested time horizon." } };
}

export function appendEndpoint(times, states, tMax, state) {
  const last = times.at(-1);
  if (last < tMax) { times.push(tMax); states.push([...state]); }
}

export function failedTrajectory(times, states, error, state, time, meta = {}) {
  return { status: "failed", error, run: packTrajectory(times, states, { ...meta, termination: error.toTermination(time, [...state]) }) };
}
