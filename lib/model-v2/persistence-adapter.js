import { deterministicEntityId } from "./ids.js";
import { MODEL_FORMAT, MODEL_VERSION } from "./schema.js";

const SOLVER_ALIASES = {
  "direct-ssa-v2": "gillespie-direct-v2",
  "piecewise-frozen-compat-v2": "ctmp-piecewise-frozen-v1",
  "euler-maruyama-v2": "euler-maruyama-v2",
};

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a finite numeric value.`);
  return number;
}

/** Adapt the database payload-v2 shape to the scientific-core canonical model. */
export function fromPersistedPayloadV2(simulatorType, payload, options = {}) {
  const settings = payload.settings ?? {}, seed = String(settings.seed ?? options.seed ?? "0");
  const commonSettings = {
    ...settings, solver: SOLVER_ALIASES[settings.solver] ?? settings.solver,
    tMax: finite(settings.tMax, "tMax"), runs: Number(settings.runs ?? settings.numSims ?? 1), seed,
  };
  if (simulatorType === "ctmp-inhomo") commonSettings.maxStep = finite(settings.maxStep ?? settings.dt, "maxStep");
  const parameters = (payload.parameters ?? []).map((x) => ({ ...x, value: finite(x.value, `Parameter ${x.name}`) }));
  if (simulatorType !== "sde") {
    const variables = (payload.variables ?? []).map((x) => ({ ...x, initialValue: finite(x.initialValue ?? x.initial, `Variable ${x.name}`) }));
    const transitions = (payload.transitions ?? []).map((x) => ({ ...x, changes: (x.changes ?? []).map((change) => ({ variableId: change.variableId, delta: finite(change.delta, `Transition ${x.name} delta`) })) }));
    return { format: MODEL_FORMAT, version: MODEL_VERSION, solverFamily: simulatorType, variables, parameters, helpers: payload.helpers ?? [], transitions, noiseSources: [], sdeComponents: [], correlations: null, settings: commonSettings, plots: payload.plots ?? [] };
  }
  const persistedComponents = payload.components ?? [];
  const variables = persistedComponents.map((component) => ({ id: component.id, name: component.name, initialValue: finite(component.initial ?? component.initialValue, `Component ${component.name}`), label: component.label, unit: component.unit, description: component.description }));
  const noiseSources = payload.noiseSources ?? [];
  const sdeComponents = persistedComponents.map((component, index) => ({
    id: deterministicEntityId(component.id, "sde-component", index, component.name), variableId: component.id, drift: component.drift,
    diffusion: (component.diffusion ?? []).map((entry) => ({ noiseId: entry.noiseId ?? entry.noiseSourceId, expression: entry.expression })),
    boundary: component.boundary ?? (typeof component.boundaryPolicy === "string" ? { type: component.boundaryPolicy } : { type: "none" }),
    ...(component.diffusionDerivative != null ? { diffusionDerivative: component.diffusionDerivative } : {}),
  }));
  return { format: MODEL_FORMAT, version: MODEL_VERSION, solverFamily: "sde", variables, parameters, helpers: payload.helpers ?? [], transitions: [], noiseSources, sdeComponents, correlations: payload.correlations ?? null, settings: commonSettings, plots: payload.plots ?? [] };
}
