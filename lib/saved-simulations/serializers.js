import { deterministicEntityId, isEntityId } from "../model-v2/ids.js";
import { migratePayloadV1 } from "../model-v2/migrate.js";
import { MODEL_FORMAT, MODEL_VERSION, validateModelV2 } from "../model-v2/schema.js";

export const PAYLOAD_VERSION = MODEL_VERSION;
const UINT64_MAX = 0xffffffffffffffffn;
let fallbackClientId = 0;

function makeClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  fallbackClientId += 1;
  return deterministicEntityId("markov-lab-editor", "client", fallbackClientId);
}

function clone(value, fallback) {
  if (value == null) return fallback;
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function stableEntityId(value, kind, index = 0) {
  if (isEntityId(value?.id)) return value.id;
  const source = String(value?.id ?? `${kind}:${index}`);
  return deterministicEntityId(source, kind, 0);
}

function normalizeSeed(value, fallback = "0") {
  const seed = String(value ?? fallback).trim();
  if (!/^(0|[1-9]\d*)$/.test(seed) || BigInt(seed) > UINT64_MAX) {
    throw new Error("Seed must be a uint64 decimal string.");
  }
  return seed;
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite.`);
  return number;
}

function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  if (!(number > 0)) throw new Error(`${label} must be positive.`);
  return number;
}

function positiveInteger(value, label) {
  const number = finiteNumber(value, label);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${label} must be a positive integer.`);
  return number;
}

function parseAssignment(row, label) {
  const text = String(row?.text ?? "").trim();
  const match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)$/i);
  if (!match) throw new Error(`${label} must use “name = numeric value”.`);
  const value = Number(match[2]);
  if (!Number.isFinite(value)) throw new Error(`${label} value must be finite.`);
  return { name: match[1], value };
}

function parseHelper(row, label) {
  const text = String(row?.text ?? "").trim();
  const match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(\s*t\s*\))?\s*=\s*(.+)$/);
  if (!match) throw new Error(`${label} must use “name(t) = expression”.`);
  return { name: match[1], expression: match[2].trim() };
}

function entityMetadata(row) {
  const label = row?.noteEnabled ? String(row.noteLabel ?? "").trim() : String(row?.label ?? "").trim();
  return {
    ...(label ? { label } : {}),
    ...(typeof row?.unit === "string" && row.unit.trim() ? { unit: row.unit.trim() } : {}),
    ...(typeof row?.description === "string" && row.description.trim()
      ? { description: row.description.trim() }
      : {}),
    ...(row?.slider && typeof row.slider === "object" ? { slider: clone(row.slider, null) } : {}),
  };
}

function editorPreservation(items) {
  return (items ?? []).find((item) => item?._modelSettings || item?._plots);
}

function normalizedPlots(explicitPlots, items) {
  const preserved = editorPreservation(items)?._plots;
  const plots = explicitPlots ?? preserved ?? [];
  if (!Array.isArray(plots)) throw new Error("plots must be an array.");
  return clone(plots, []);
}

function settingsFor(family, input, items) {
  const preserved = editorPreservation(items)?._modelSettings ?? {};
  const supplied = input.settings && typeof input.settings === "object" ? input.settings : {};
  const settings = { ...clone(preserved, {}), ...clone(supplied, {}) };
  settings.solver =
    input.solver ??
    settings.solver ??
    (family === "gillespie"
      ? "gillespie-direct-v2"
      : family === "ctmp-inhomo"
        ? "ctmp-integrated-hazard-v1"
        : "euler-maruyama-v2");
  settings.tMax = positiveNumber(input.tMax ?? settings.tMax, "tMax");
  settings.runs = positiveInteger(input.numSims ?? input.runs ?? settings.runs ?? settings.numSims ?? 1, "runs");
  settings.seed = normalizeSeed(input.seed ?? settings.seed, "0");
  delete settings.numSims;
  if (family !== "gillespie") settings.dt = positiveNumber(input.dt ?? settings.dt ?? settings.maxStep, "dt");
  if (family === "ctmp-inhomo") settings.maxStep = positiveNumber(input.maxStep ?? settings.maxStep ?? settings.dt, "maxStep");
  return settings;
}

function modelEnvelope(family, fields) {
  const model = {
    format: MODEL_FORMAT,
    version: MODEL_VERSION,
    solverFamily: family,
    variables: [],
    parameters: [],
    helpers: [],
    transitions: [],
    noiseSources: [],
    sdeComponents: [],
    correlations: null,
    ...fields,
  };
  const validation = validateModelV2(model);
  if (!validation.ok) {
    throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join(" "));
  }
  return { payloadVersion: PAYLOAD_VERSION, payload: model };
}

function serializeAssignmentRows(rows, kind, valueKey, label) {
  return (rows ?? [])
    .filter((row) => String(row?.text ?? "").trim())
    .map((row, index) => {
      const parsed = parseAssignment(row, `${label} ${index + 1}`);
      return {
        id: stableEntityId(row, kind, index),
        name: parsed.name,
        [valueKey]: parsed.value,
        ...entityMetadata(row),
      };
    });
}

function serializeHelpers(rows) {
  return (rows ?? [])
    .filter((row) => String(row?.text ?? "").trim())
    .map((row, index) => {
      const parsed = parseHelper(row, `Helper ${index + 1}`);
      return {
        id: stableEntityId(row, "helper", index),
        name: parsed.name,
        expression: parsed.expression,
        ...entityMetadata(row),
      };
    });
}

function serializeDiscreteTransitions(rows, variables) {
  return (rows ?? [])
    .filter((row) => String(row?.rate ?? "").trim() || (row?.deltas ?? []).some((value) => String(value).trim()))
    .map((row, index) => {
      const changes = variables.flatMap((variable, variableIndex) => {
        const raw = row?.deltas?.[variableIndex] ?? 0;
        const delta = Number(raw);
        if (!Number.isSafeInteger(delta)) {
          throw new Error(`Transition ${index + 1}, change ${variableIndex + 1} must be a safe integer.`);
        }
        return delta === 0 ? [] : [{ variableId: variable.id, delta }];
      });
      const label = row?.noteEnabled ? String(row.noteLabel ?? "").trim() : String(row?.label ?? "").trim();
      return {
        id: stableEntityId(row, "transition", index),
        name: String(row?.name ?? (label || `Transition ${index + 1}`)),
        rate: String(row?.rate ?? "0").trim() || "0",
        changes,
        ...(label ? { label } : {}),
        ...(typeof row?.description === "string" && row.description.trim()
          ? { description: row.description.trim() }
          : {}),
      };
    });
}

export function serializeGillespieState(input) {
  const variables = serializeAssignmentRows(input.varRows, "variable", "initialValue", "Variable");
  const parameters = serializeAssignmentRows(input.paramRows, "parameter", "value", "Parameter");
  return modelEnvelope("gillespie", {
    variables,
    parameters,
    transitions: serializeDiscreteTransitions(input.transitions, variables),
    settings: settingsFor("gillespie", input, [...(input.varRows ?? []), ...(input.transitions ?? [])]),
    plots: normalizedPlots(input.plots, input.varRows),
  });
}

export function serializeCTMPInhomoState(input) {
  const variables = serializeAssignmentRows(input.varRows, "variable", "initialValue", "Variable");
  const parameters = serializeAssignmentRows(input.paramRows, "parameter", "value", "Parameter");
  return modelEnvelope("ctmp-inhomo", {
    variables,
    parameters,
    helpers: serializeHelpers(input.helperRows),
    transitions: serializeDiscreteTransitions(input.transitions, variables),
    settings: settingsFor("ctmp-inhomo", input, [...(input.varRows ?? []), ...(input.transitions ?? [])]),
    plots: normalizedPlots(input.plots, input.varRows),
  });
}

function preservedSDEValue(input, key) {
  if (input[key] != null) return input[key];
  return (input.components ?? []).find((component) => component?.[`_${key}`])?.[`_${key}`];
}

function expandCorrelations(value, size) {
  if (value == null) return null;
  if (!Array.isArray(value)) throw new Error("correlations must be a matrix or null.");
  return Array.from({ length: size }, (_, rowIndex) =>
    Array.from({ length: size }, (_, columnIndex) => {
      const existing = Number(value?.[rowIndex]?.[columnIndex]);
      if (Number.isFinite(existing)) return existing;
      return rowIndex === columnIndex ? 1 : 0;
    }),
  );
}

export function serializeSDEState(input) {
  const sourceComponents = (input.components ?? []).filter((component) =>
    [component?.name, component?.init, component?.drift, component?.diff].some((value) => String(value ?? "").trim()),
  );
  const variables = sourceComponents.map((component, index) => ({
    id: stableEntityId(component, "variable", index),
    name: String(component.name ?? "").trim(),
    initialValue: finiteNumber(component.init, `Component ${index + 1} initial value`),
    ...entityMetadata(component),
  }));
  const explicitNoise = clone(preservedSDEValue(input, "noiseSources"), []) ?? [];
  const noiseSources = explicitNoise.map((noise, index) => ({
    ...noise,
    id: stableEntityId(noise, "noise", index),
    name: String(noise?.name ?? `W${index + 1}`),
  }));
  const sdeComponents = sourceComponents.map((component, index) => {
    const variable = variables[index];
    const existingDiffusion = Array.isArray(component.diffusion) ? clone(component.diffusion, []) : [];
    let displayNoiseId = component._displayNoiseId;
    if (!displayNoiseId && existingDiffusion.length) displayNoiseId = existingDiffusion[0].noiseId;
    if (!existingDiffusion.length) {
      const existingNoise = noiseSources[index];
      const noise = existingNoise ?? {
        id: deterministicEntityId(variable.id, "noise", 0),
        name: `W_${variable.name}`,
      };
      if (!existingNoise) noiseSources.push(noise);
      displayNoiseId = noise.id;
      existingDiffusion.push({ noiseId: noise.id, expression: String(component.diff ?? "0") || "0" });
    } else if (displayNoiseId) {
      const entry = existingDiffusion.find((item) => item.noiseId === displayNoiseId);
      if (entry) entry.expression = String(component.diff ?? entry.expression ?? "0") || "0";
    }
    return {
      id: isEntityId(component.sdeComponentId)
        ? component.sdeComponentId
        : deterministicEntityId(String(component.id ?? variable.id), "sde-component", 0),
      variableId: variable.id,
      drift: String(component.drift ?? "0").trim() || "0",
      diffusion: existingDiffusion.map((entry) => ({
        noiseId: entry.noiseId,
        expression: String(entry.expression ?? "0"),
      })),
      boundary: clone(component.boundary, null) ??
        (typeof component.boundaryPolicy === "string" ? { type: component.boundaryPolicy } : { type: "none" }),
      ...(component.diffusionDerivative != null
        ? { diffusionDerivative: String(component.diffusionDerivative) }
        : {}),
    };
  });
  const noiseIds = new Set(noiseSources.map((noise) => noise.id));
  for (const [componentIndex, component] of sdeComponents.entries()) {
    for (const entry of component.diffusion) {
      if (!noiseIds.has(entry.noiseId)) {
        throw new Error(`SDE component ${componentIndex + 1} references an unknown noise source.`);
      }
    }
  }
  const parameters = serializeAssignmentRows(input.paramRows, "parameter", "value", "Parameter");
  return modelEnvelope("sde", {
    variables,
    parameters,
    sdeComponents,
    noiseSources,
    correlations: expandCorrelations(preservedSDEValue(input, "correlations"), noiseSources.length),
    settings: settingsFor("sde", input, sourceComponents),
    plots: normalizedPlots(input.plots, sourceComponents),
  });
}

function legacyPayload(payload, family) {
  if (payload?.format === MODEL_FORMAT && payload?.version === MODEL_VERSION) return null;
  if (payload?.payloadVersion === 1 && payload.payload) return payload.payload;
  if (family === "sde" && Array.isArray(payload?.components)) return payload;
  if (family !== "sde" && Array.isArray(payload?.varRows)) return payload;
  return null;
}

function preservation(model) {
  return {
    _modelSettings: clone(model.settings, {}),
    _plots: clone(model.plots, []),
  };
}

function hydrateEntityRow(entity, value) {
  return {
    id: entity.id,
    text: `${entity.name} = ${value}`,
    noteEnabled: Boolean(entity.label),
    noteLabel: entity.label ?? "",
    ...(entity.unit ? { unit: entity.unit } : {}),
    ...(entity.description ? { description: entity.description } : {}),
    ...(entity.slider ? { slider: clone(entity.slider, null) } : {}),
  };
}

function hydrateLegacyTextRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [{ id: makeClientId(), text: "", noteEnabled: false, noteLabel: "" }];
  }
  return rows.map((row, index) => ({
    id: isEntityId(row?.id) ? row.id : stableEntityId(row, "legacy-row", index),
    text: typeof row?.text === "string" ? row.text : "",
    noteEnabled: Boolean(row?.noteEnabled),
    noteLabel: typeof row?.noteLabel === "string" ? row.noteLabel : "",
  }));
}

function hydrateDiscreteV2(model, defaults) {
  const preserved = preservation(model);
  const variables = model.variables ?? [];
  const changesByTransition = (model.transitions ?? []).map((transition) =>
    new Map((transition.changes ?? []).map((change) => [change.variableId, change.delta])),
  );
  return {
    varRows: variables.length
      ? variables.map((entity) => ({ ...hydrateEntityRow(entity, entity.initialValue), ...preserved }))
      : [{ id: makeClientId(), text: "", noteEnabled: false, noteLabel: "", ...preserved }],
    paramRows: (model.parameters ?? []).length
      ? model.parameters.map((entity) => hydrateEntityRow(entity, entity.value))
      : [{ id: makeClientId(), text: "", noteEnabled: false, noteLabel: "" }],
    helperRows: (model.helpers ?? []).length
      ? model.helpers.map((helper) => ({
          id: helper.id,
          text: `${helper.name}(t) = ${helper.expression}`,
          noteEnabled: Boolean(helper.label),
          noteLabel: helper.label ?? "",
        }))
      : [{ id: makeClientId(), text: "", noteEnabled: false, noteLabel: "" }],
    transitions: (model.transitions ?? []).length
      ? model.transitions.map((transition, index) => ({
          id: transition.id,
          name: transition.name,
          rate: transition.rate,
          deltas: variables.map((variable) => String(changesByTransition[index].get(variable.id) ?? 0)),
          noteEnabled: Boolean(transition.label),
          noteLabel: transition.label ?? transition.name ?? "",
          ...preserved,
        }))
      : [{ id: makeClientId(), rate: "", deltas: variables.map(() => "0"), noteEnabled: false, noteLabel: "", ...preserved }],
    settings: {
      ...clone(model.settings, {}),
      tMax: model.settings?.tMax ?? defaults.tMax,
      dt: model.settings?.dt ?? model.settings?.maxStep ?? defaults.dt,
      numSims: model.settings?.runs ?? defaults.numSims,
      seed: String(model.settings?.seed ?? "0"),
    },
    plots: clone(model.plots, []),
    canonicalModel: clone(model, null),
  };
}

function canonicalForHydration(payload, family) {
  if (payload?.format === MODEL_FORMAT && payload?.version === MODEL_VERSION) return payload;
  const legacy = legacyPayload(payload, family);
  if (!legacy) throw new Error("Unsupported saved simulation payload.");
  const migration = migratePayloadV1(
    { payloadVersion: 1, simulatorType: family, payload: legacy },
    { namespace: `editor-hydration:${family}`, seed: String(legacy.settings?.seed ?? "0") },
  );
  return migration.needsRepair ? null : migration.model;
}

export function hydrateGillespiePayload(payload) {
  const legacy = legacyPayload(payload, "gillespie");
  if (legacy) {
    const model = canonicalForHydration(payload, "gillespie");
    if (model) return hydrateDiscreteV2(model, { tMax: 5, numSims: 1 });
    return {
      varRows: hydrateLegacyTextRows(legacy.varRows),
      paramRows: hydrateLegacyTextRows(legacy.paramRows),
      transitions: (legacy.transitions ?? []).map((transition, index) => ({
        id: stableEntityId(transition, "legacy-transition", index),
        rate: transition.rate ?? "",
        deltas: (transition.deltas ?? []).map(String),
        noteEnabled: Boolean(transition.noteEnabled),
        noteLabel: transition.noteLabel ?? "",
      })),
      settings: { ...legacy.settings, numSims: legacy.settings?.numSims ?? 1, seed: String(legacy.settings?.seed ?? "0") },
      plots: clone(legacy.plots, []),
    };
  }
  return hydrateDiscreteV2(canonicalForHydration(payload, "gillespie"), { tMax: 5, numSims: 1 });
}

export function hydrateCTMPInhomoPayload(payload) {
  const legacy = legacyPayload(payload, "ctmp-inhomo");
  if (legacy) {
    const model = canonicalForHydration(payload, "ctmp-inhomo");
    if (model) return hydrateDiscreteV2(model, { tMax: 7, dt: 0.000002, numSims: 1 });
    return {
      varRows: hydrateLegacyTextRows(legacy.varRows),
      paramRows: hydrateLegacyTextRows(legacy.paramRows),
      helperRows: hydrateLegacyTextRows(legacy.helperRows),
      transitions: (legacy.transitions ?? []).map((transition, index) => ({
        id: stableEntityId(transition, "legacy-transition", index),
        rate: transition.rate ?? "",
        deltas: (transition.deltas ?? []).map(String),
        noteEnabled: Boolean(transition.noteEnabled),
        noteLabel: transition.noteLabel ?? "",
      })),
      settings: { ...legacy.settings, numSims: legacy.settings?.numSims ?? 1, seed: String(legacy.settings?.seed ?? "0") },
      plots: clone(legacy.plots, []),
    };
  }
  return hydrateDiscreteV2(canonicalForHydration(payload, "ctmp-inhomo"), { tMax: 7, dt: 0.000002, numSims: 1 });
}

export function hydrateSDEPayload(payload) {
  const legacy = legacyPayload(payload, "sde");
  if (legacy) {
    const model = canonicalForHydration(payload, "sde");
    if (model) return hydrateSDEPayload(model);
    return {
      paramRows: hydrateLegacyTextRows(legacy.paramRows),
      components: (legacy.components ?? []).map((component, index) => ({
        id: stableEntityId(component, "legacy-component", index),
        name: component.name ?? "",
        init: String(component.init ?? ""),
        drift: component.drift ?? "",
        diff: component.diff ?? "",
        noteEnabled: Boolean(component.noteEnabled),
        noteLabel: component.noteLabel ?? "",
      })),
      settings: { ...legacy.settings, numSims: legacy.settings?.numSims ?? 1, seed: String(legacy.settings?.seed ?? "0") },
      plots: clone(legacy.plots, []),
      noiseSources: [],
      correlations: null,
    };
  }
  const model = canonicalForHydration(payload, "sde");
  const preserved = preservation(model);
  const componentsByVariable = new Map((model.sdeComponents ?? []).map((component) => [component.variableId, component]));
  const noiseSources = clone(model.noiseSources, []);
  const correlations = clone(model.correlations, null);
  const components = (model.variables ?? []).map((variable, index) => {
    const component = componentsByVariable.get(variable.id) ?? {};
    const preferredNoiseId = noiseSources[index]?.id;
    const display = component.diffusion?.find((entry) => entry.noiseId === preferredNoiseId) ?? component.diffusion?.[0];
    return {
      id: variable.id,
      sdeComponentId: component.id,
      name: variable.name,
      init: String(variable.initialValue ?? ""),
      drift: component.drift ?? "0",
      diff: display?.expression ?? "0",
      diffusion: clone(component.diffusion, []),
      _displayNoiseId: display?.noiseId ?? null,
      boundary: clone(component.boundary, { type: "none" }),
      boundaryPolicy: component.boundary?.type ?? "none",
      ...(component.diffusionDerivative != null
        ? { diffusionDerivative: component.diffusionDerivative }
        : {}),
      noteEnabled: Boolean(variable.label),
      noteLabel: variable.label ?? "",
      ...(variable.unit ? { unit: variable.unit } : {}),
      ...(variable.description ? { description: variable.description } : {}),
      ...(variable.slider ? { slider: clone(variable.slider, null) } : {}),
      _noiseSources: noiseSources,
      _correlations: correlations,
      ...preserved,
    };
  });
  return {
    paramRows: (model.parameters ?? []).length
      ? model.parameters.map((entity) => hydrateEntityRow(entity, entity.value))
      : [{ id: makeClientId(), text: "", noteEnabled: false, noteLabel: "" }],
    components: components.length
      ? components
      : [{ id: makeClientId(), name: "", init: "", drift: "", diff: "", noteEnabled: false, noteLabel: "", _noiseSources: noiseSources, _correlations: correlations, ...preserved }],
    noiseSources,
    correlations,
    settings: {
      ...clone(model.settings, {}),
      tMax: model.settings?.tMax ?? 20,
      dt: model.settings?.dt ?? 0.005,
      numSims: model.settings?.runs ?? 1,
      seed: String(model.settings?.seed ?? "0"),
    },
    plots: clone(model.plots, []),
    canonicalModel: clone(model, null),
  };
}
