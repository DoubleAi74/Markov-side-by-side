import { RESERVED_SYMBOL_NAMES } from "../expressions/resolver.js";
import { isEntityId } from "./ids.js";

export const MODEL_FORMAT = "markov-lab/model";
export const LEGACY_MODEL_FORMAT = "markov-side-by-side/model-config";
export const MODEL_VERSION = 2;
export const MODEL_MIME = "application/vnd.markov-lab.model+json";
export const LEGACY_MODEL_MIME = "application/vnd.markov-side-by-side.model-config+json";

const ENTITY_COLLECTIONS = ["variables", "parameters", "helpers", "transitions", "noiseSources", "sdeComponents"];
const MAX_COLLECTION_ENTRIES = 100;
const SYMBOL_COLLECTIONS = new Set(["variables", "parameters", "helpers", "noiseSources"]);
const SOLVERS = Object.freeze({
  gillespie: new Set(["gillespie-direct-v2"]),
  "ctmp-inhomo": new Set(["ctmp-piecewise-frozen-v1", "ctmp-integrated-hazard-v1"]),
  sde: new Set(["euler-maruyama-v2", "milstein-diagonal-v1"]),
});

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateCorrelation(matrix, size, issue) {
  if (matrix == null) return;
  if (!Array.isArray(matrix) || matrix.length !== size) {
    issue("correlations", `Correlation matrix must contain ${size} rows.`, "INVALID_CORRELATION");
    return;
  }
  const lower = Array.from({ length: size }, () => Array(size).fill(0));
  for (let i = 0; i < size; i++) {
    const row = matrix[i];
    if (!Array.isArray(row) || row.length !== size) {
      issue(`correlations.${i}`, `Correlation row must contain ${size} entries.`, "INVALID_CORRELATION");
      return;
    }
    for (let j = 0; j < size; j++) {
      if (!isFiniteNumber(row[j]) || row[j] < -1 || row[j] > 1) issue(`correlations.${i}.${j}`, "Correlation entries must be finite values in [-1, 1].", "INVALID_CORRELATION");
      if (j < i && isFiniteNumber(row[j]) && isFiniteNumber(matrix[j]?.[i]) && Math.abs(row[j] - matrix[j][i]) > 1e-12) issue(`correlations.${i}.${j}`, "Correlation matrix must be symmetric.", "INVALID_CORRELATION");
    }
    if (isFiniteNumber(row[i]) && Math.abs(row[i] - 1) > 1e-12) issue(`correlations.${i}.${i}`, "Correlation matrix must have a unit diagonal.", "INVALID_CORRELATION");
  }
  // Cholesky-style positive-semidefinite check after shape/finite checks.
  if (matrix.every((row) => Array.isArray(row) && row.length === size && row.every(isFiniteNumber))) {
    for (let i = 0; i < size; i++) for (let j = 0; j <= i; j++) {
      let sum = matrix[i][j];
      for (let k = 0; k < j; k++) sum -= lower[i][k] * lower[j][k];
      if (i === j) {
        if (sum < -1e-12) { issue("correlations", "Correlation matrix must be positive semidefinite.", "INVALID_CORRELATION"); return; }
        lower[i][j] = Math.sqrt(Math.max(0, sum));
      } else if (lower[j][j] > 1e-12) lower[i][j] = sum / lower[j][j];
      else if (Math.abs(sum) > 1e-12) { issue("correlations", "Correlation matrix must be positive semidefinite.", "INVALID_CORRELATION"); return; }
    }
  }
}

/** Runtime validation for the canonical, executable Markov Lab model. */
export function validateModelV2(model) {
  const issues = [];
  const issue = (path, message, code = "INVALID_MODEL", entity = null) => issues.push({ severity: "error", code, entity, path, range: null, message });
  if (!model || typeof model !== "object" || Array.isArray(model)) return { ok: false, issues: [{ severity: "error", code: "INVALID_MODEL", entity: null, path: "", range: null, message: "Model must be an object." }] };
  if (model.format !== MODEL_FORMAT) issue("format", `Expected ${MODEL_FORMAT}.`);
  if (model.version !== MODEL_VERSION) issue("version", "Expected model version 2.");
  if (!Object.hasOwn(SOLVERS, model.solverFamily)) issue("solverFamily", "Unknown solver family.");
  for (const collection of [...ENTITY_COLLECTIONS, "plots"]) {
    if (!Array.isArray(model[collection])) issue(collection, `${collection} is required and must be an array.`, "REQUIRED_ARRAY");
    else if (model[collection].length > MAX_COLLECTION_ENTRIES) issue(collection, `${collection} may contain at most ${MAX_COLLECTION_ENTRIES} entries.`, "MODEL_SIZE_LIMIT");
  }

  const seenIds = new Set(), seenNames = new Set();
  for (const collection of ENTITY_COLLECTIONS) for (const [index, entity] of (Array.isArray(model[collection]) ? model[collection] : []).entries()) {
    const path = `${collection}.${index}`;
    if (!entity || typeof entity !== "object" || Array.isArray(entity)) { issue(path, "Entity must be an object."); continue; }
    if (!isEntityId(entity.id)) issue(`${path}.id`, "Entity requires a UUID.", "INVALID_ENTITY_ID");
    else if (seenIds.has(entity.id)) issue(`${path}.id`, "Entity IDs must be unique.", "DUPLICATE_ENTITY_ID", entity.id); else seenIds.add(entity.id);
    if (SYMBOL_COLLECTIONS.has(collection)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(entity.name ?? "")) issue(`${path}.name`, "Entity requires a valid symbol name.", "INVALID_SYMBOL_NAME", entity.id);
      else if (RESERVED_SYMBOL_NAMES.has(entity.name)) issue(`${path}.name`, `${entity.name} is reserved by the expression language.`, "RESERVED_SYMBOL_NAME", entity.id);
      else if (seenNames.has(entity.name)) issue(`${path}.name`, "Symbol names must be unique.", "DUPLICATE_SYMBOL", entity.id); else seenNames.add(entity.name);
    }
  }

  const variables = Array.isArray(model.variables) ? model.variables : [];
  const parameters = Array.isArray(model.parameters) ? model.parameters : [];
  const helpers = Array.isArray(model.helpers) ? model.helpers : [];
  const transitions = Array.isArray(model.transitions) ? model.transitions : [];
  const noiseSources = Array.isArray(model.noiseSources) ? model.noiseSources : [];
  const components = Array.isArray(model.sdeComponents) ? model.sdeComponents : [];
  const variableIds = new Set(variables.map((x) => x.id));
  const noiseIds = new Set(noiseSources.map((x) => x.id));

  variables.forEach((variable, i) => {
    const value = variable.initialValue;
    if (!isFiniteNumber(value)) issue(`variables.${i}.initialValue`, "Initial values must be finite numbers.", "INVALID_INITIAL_VALUE", variable.id);
    else if (model.solverFamily !== "sde" && (!Number.isSafeInteger(value) || value < 0)) issue(`variables.${i}.initialValue`, "CTMC initial values must be non-negative safe integers.", "INVALID_INITIAL_STATE", variable.id);
  });
  parameters.forEach((parameter, i) => { if (!isFiniteNumber(parameter.value)) issue(`parameters.${i}.value`, "Parameter values must be finite numbers.", "INVALID_PARAMETER_VALUE", parameter.id); });
  helpers.forEach((helper, i) => { if (typeof helper.expression !== "string" || !helper.expression.trim()) issue(`helpers.${i}.expression`, "Helper expression is required.", "INVALID_EXPRESSION", helper.id); });

  transitions.forEach((transition, i) => {
    if (typeof transition.rate !== "string" || !transition.rate.trim()) issue(`transitions.${i}.rate`, "Transition rate expression is required.", "INVALID_EXPRESSION", transition.id);
    if (!Array.isArray(transition.changes)) { issue(`transitions.${i}.changes`, "Transition changes must be an array.", "REQUIRED_ARRAY", transition.id); return; }
    const changedVariables = new Set();
    transition.changes.forEach((change, j) => {
      if (!change || typeof change !== "object") { issue(`transitions.${i}.changes.${j}`, "Transition change must be an object."); return; }
      if (!variableIds.has(change.variableId)) issue(`transitions.${i}.changes.${j}.variableId`, "Transition references an unknown variable.", "UNKNOWN_VARIABLE", transition.id);
      else if (changedVariables.has(change.variableId)) issue(`transitions.${i}.changes.${j}.variableId`, "A transition may change each variable only once.", "DUPLICATE_CHANGE", transition.id); else changedVariables.add(change.variableId);
      if (!Number.isSafeInteger(change.delta)) issue(`transitions.${i}.changes.${j}.delta`, "CTMC transition deltas must be safe integers.", "NON_INTEGER_DELTA", transition.id);
    });
  });

  if (model.solverFamily === "sde") {
    if (components.length !== variables.length) issue("sdeComponents", "SDE models require exactly one component per variable.", "INVALID_MODEL_SHAPE");
    const componentVariables = new Set();
    components.forEach((component, i) => {
      if (!variableIds.has(component.variableId)) issue(`sdeComponents.${i}.variableId`, "SDE component references an unknown variable.", "UNKNOWN_VARIABLE", component.id);
      else if (componentVariables.has(component.variableId)) issue(`sdeComponents.${i}.variableId`, "Each SDE variable may have only one component.", "DUPLICATE_COMPONENT", component.id); else componentVariables.add(component.variableId);
      if (typeof component.drift !== "string" || !component.drift.trim()) issue(`sdeComponents.${i}.drift`, "Drift expression is required.", "INVALID_EXPRESSION", component.id);
      if (!Array.isArray(component.diffusion)) { issue(`sdeComponents.${i}.diffusion`, "Diffusion row must be an array.", "REQUIRED_ARRAY", component.id); return; }
      const usedNoise = new Set();
      component.diffusion.forEach((entry, j) => {
        if (!noiseIds.has(entry?.noiseId)) issue(`sdeComponents.${i}.diffusion.${j}.noiseId`, "Diffusion references an unknown noise source.", "UNKNOWN_NOISE", component.id);
        else if (usedNoise.has(entry.noiseId)) issue(`sdeComponents.${i}.diffusion.${j}.noiseId`, "A diffusion row may reference each noise source only once.", "DUPLICATE_NOISE", component.id); else usedNoise.add(entry.noiseId);
        if (typeof entry?.expression !== "string" || !entry.expression.trim()) issue(`sdeComponents.${i}.diffusion.${j}.expression`, "Diffusion expression is required.", "INVALID_EXPRESSION", component.id);
      });
      const boundary = component.boundary ?? { type: "none" };
      if (!["none", "reflect", "clamp", "absorb", "error"].includes(boundary.type ?? "none")) issue(`sdeComponents.${i}.boundary.type`, "Unknown boundary policy.", "INVALID_BOUNDARY", component.id);
      if (boundary.min != null && !isFiniteNumber(boundary.min)) issue(`sdeComponents.${i}.boundary.min`, "Boundary minimum must be finite.", "INVALID_BOUNDARY", component.id);
      if (boundary.max != null && !isFiniteNumber(boundary.max)) issue(`sdeComponents.${i}.boundary.max`, "Boundary maximum must be finite.", "INVALID_BOUNDARY", component.id);
      if (isFiniteNumber(boundary.min) && isFiniteNumber(boundary.max) && boundary.max <= boundary.min) issue(`sdeComponents.${i}.boundary`, "Boundary maximum must exceed minimum.", "INVALID_BOUNDARY", component.id);
    });
    validateCorrelation(model.correlations, noiseSources.length, issue);
  } else {
    if (noiseSources.length || components.length || model.correlations != null) issue("solverFamily", "CTMC models cannot contain SDE noise, components, or correlations.", "INVALID_MODEL_SHAPE");
  }

  const settings = model.settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) issue("settings", "settings is required and must be an object.", "REQUIRED_SETTINGS");
  else {
    if (!(isFiniteNumber(settings.tMax) && settings.tMax > 0)) issue("settings.tMax", "tMax must be positive and finite.");
    if (!(Number.isSafeInteger(settings.runs) && settings.runs >= 1 && settings.runs <= 100000)) issue("settings.runs", "runs must be an integer from 1 to 100000.");
    if (!SOLVERS[model.solverFamily]?.has(settings.solver)) issue("settings.solver", "Solver is incompatible with the model family.", "INVALID_SOLVER");
    if (!/^(0|[1-9]\d*)$/.test(String(settings.seed ?? ""))) issue("settings.seed", "Seed must be an unsigned 64-bit decimal string.", "INVALID_SEED");
    else if (BigInt(settings.seed) > 0xffffffffffffffffn) issue("settings.seed", "Seed exceeds uint64.", "INVALID_SEED");
    if (model.solverFamily === "sde" && !(isFiniteNumber(settings.dt) && settings.dt > 0)) issue("settings.dt", "SDE dt must be positive and finite.", "INVALID_STEP");
    if (settings.solver === "ctmp-piecewise-frozen-v1" && !(isFiniteNumber(settings.maxStep) && settings.maxStep > 0)) issue("settings.maxStep", "Piecewise-frozen maxStep must be positive and finite.", "INVALID_STEP");
    if (settings.solver === "ctmp-integrated-hazard-v1" && settings.tolerance != null && !(isFiniteNumber(settings.tolerance) && settings.tolerance > 0)) issue("settings.tolerance", "Integrated-hazard tolerance must be positive and finite.", "INVALID_TOLERANCE");
  }
  return { ok: issues.length === 0, issues };
}
