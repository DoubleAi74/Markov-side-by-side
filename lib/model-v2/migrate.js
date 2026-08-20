import { deterministicEntityId } from "./ids.js";
import { LEGACY_MODEL_FORMAT, MODEL_FORMAT, MODEL_VERSION } from "./schema.js";

function assignment(row, fallback) {
  const text = String(row?.text ?? "").trim();
  const match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)$/i);
  if (!match || !Number.isFinite(Number(match[2]))) throw new Error(`Cannot convert ${fallback} row ${JSON.stringify(text)}.`);
  return { name: match[1], value: Number(match[2]), legacy: { ...row } };
}

function helperAssignment(row) {
  const text = String(row?.text ?? "").trim();
  const match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*t\s*\)\s*=\s*(.+)$/);
  if (!match) throw new Error(`Cannot convert helper row ${JSON.stringify(text)}.`);
  return { name: match[1], expression: match[2].trim(), legacy: { ...row } };
}

export function migratePayloadV1(input, options = {}) {
  if (input?.format === MODEL_FORMAT && input?.version === MODEL_VERSION) return { model: input, changed: false, needsRepair: Boolean(input.needsRepair), report: [] };
  const envelope = input?.payloadVersion === 1 ? input : { payloadVersion: 1, simulatorType: input?.simulatorType, payload: input?.payload ?? input };
  const payload = envelope.payload ?? {};
  const family = envelope.simulatorType ?? input?.solverFamily ?? options.simulatorType;
  const namespace = String(options.namespace ?? input?.id ?? input?.slug ?? `${family}:${JSON.stringify(payload)}`);
  const report = [];
  const id = (kind, index, name) => deterministicEntityId(namespace, kind, index, name);
  try {
    const variables = family === "sde"
      ? (payload.components ?? []).map((row, i) => ({ id: id("variable", i, row.name), name: row.name, initialValue: Number(row.init), label: row.noteEnabled ? row.noteLabel : undefined, legacy: { ...row } }))
      : (payload.varRows ?? []).map((row, i) => { const parsed = assignment(row, "variable"); return { id: id("variable", i, parsed.name), name: parsed.name, initialValue: parsed.value, label: row.noteEnabled ? row.noteLabel : undefined, legacy: parsed.legacy }; });
    const parameters = (payload.paramRows ?? []).map((row, i) => { const parsed = assignment(row, "parameter"); return { id: id("parameter", i, parsed.name), name: parsed.name, value: parsed.value, label: row.noteEnabled ? row.noteLabel : undefined, legacy: parsed.legacy }; });
    const helpers = (payload.helperRows ?? []).map((row, i) => { const parsed = helperAssignment(row); return { id: id("helper", i, parsed.name), name: parsed.name, expression: parsed.expression, legacy: parsed.legacy }; });
    const transitions = (payload.transitions ?? []).map((row, i) => ({
      id: id("transition", i, row.noteLabel ?? ""), name: row.noteLabel || `Transition ${i + 1}`, rate: String(row.rate ?? ""),
      changes: (row.deltas ?? []).map((raw, variableIndex) => ({ variableId: variables[variableIndex]?.id, delta: Number(raw) })).filter((x) => x.delta !== 0),
      legacy: { ...row },
    }));
    const noiseSources = family === "sde" ? variables.map((variable, i) => ({ id: id("noise", i, variable.name), name: `W_${variable.name}` })) : [];
    const sdeComponents = family === "sde" ? (payload.components ?? []).map((row, i) => ({
      id: id("sde-component", i, row.name), variableId: variables[i].id, drift: String(row.drift ?? "0"),
      diffusion: noiseSources.map((noise, j) => ({ noiseId: noise.id, expression: i === j ? String(row.diff ?? "0") : "0" })),
      boundary: { type: "none" }, legacy: { ...row },
    })) : [];
    const expressionText = [...transitions.map((x) => x.rate), ...helpers.map((x) => x.expression), ...sdeComponents.flatMap((x) => [x.drift, ...x.diffusion.map((d) => d.expression)])];
    if (expressionText.some((text) => /\brandom\s*\(/.test(text))) throw new Error("Expression-level random() requires repair.");
    const legacySettings = payload.settings ?? {};
    const seed = String(legacySettings.seed ?? options.seed ?? "0");
    const settings = {
      solver: family === "gillespie" ? "gillespie-direct-v2" : family === "ctmp-inhomo" ? "ctmp-piecewise-frozen-v1" : "euler-maruyama-v2",
      tMax: Number(legacySettings.tMax ?? 10), runs: Number(legacySettings.numSims ?? 1), seed,
      ...(legacySettings.dt != null ? { dt: Number(legacySettings.dt) } : {}),
      ...(family === "ctmp-inhomo" ? { maxStep: Number(legacySettings.dt ?? 0.01) } : {}),
    };
    const model = { format: MODEL_FORMAT, version: MODEL_VERSION, solverFamily: family, variables, parameters, helpers, transitions, noiseSources, sdeComponents, correlations: null, settings, plots: [], migration: { from: input?.format ?? LEGACY_MODEL_FORMAT, sourceVersion: 1 } };
    report.push(`Converted ${variables.length} variables, ${parameters.length} parameters, ${helpers.length} helpers, ${transitions.length} transitions, and ${sdeComponents.length} SDE components.`);
    return { model, changed: true, needsRepair: false, report };
  } catch (error) {
    report.push(error.message);
    return { model: { format: MODEL_FORMAT, version: MODEL_VERSION, solverFamily: family, needsRepair: true, repairIssues: report.slice(), legacyPayload: structuredClone(input) }, changed: true, needsRepair: true, report };
  }
}

export function parseModelImport(document, options = {}) {
  const value = typeof document === "string" ? JSON.parse(document) : document;
  if (value?.format === MODEL_FORMAT && value?.version === MODEL_VERSION) return { model: value, changed: false, needsRepair: Boolean(value.needsRepair), report: [] };
  if (value?.format === LEGACY_MODEL_FORMAT && value?.formatVersion === 1 && value?.model) {
    const family = value.simulatorType ?? (Array.isArray(value.model.components) ? "sde" : Array.isArray(value.model.helpers) ? "ctmp-inhomo" : "gillespie");
    const payload = family === "sde" ? {
      paramRows: (value.model.parameters ?? []).map((x) => ({ text: `${x.name} = ${x.value}` })),
      components: (value.model.components ?? []).map((x) => ({ name: x.name, init: x.initial, drift: x.drift, diff: x.diffusion, noteEnabled: Boolean(x.label), noteLabel: x.label ?? "" })),
      settings: { tMax: value.model.time?.tMax, dt: value.model.time?.dt, numSims: value.run?.numSimulations ?? 1 },
    } : {
      varRows: (value.model.variables ?? []).map((x) => ({ text: `${x.name} = ${x.initial}`, noteEnabled: Boolean(x.label), noteLabel: x.label ?? "" })),
      paramRows: (value.model.parameters ?? []).map((x) => ({ text: `${x.name} = ${x.value}` })),
      helperRows: (value.model.helpers ?? []).map((x) => ({ text: `${x.name}(t) = ${x.expression}` })),
      transitions: (value.model.transitions ?? []).map((x) => ({ rate: x.rate, deltas: (value.model.variables ?? []).map((variable) => String(x.change?.[variable.name] ?? 0)), noteEnabled: Boolean(x.label), noteLabel: x.label ?? "" })),
      settings: { tMax: value.model.time?.tMax, dt: value.model.time?.dt, numSims: value.run?.numSimulations ?? 1 },
    };
    return migratePayloadV1({ payloadVersion: 1, simulatorType: family, payload }, { ...options, seed: String(value.run?.seed ?? options.seed ?? "0") });
  }
  if (value?.format === LEGACY_MODEL_FORMAT || value?.payloadVersion === 1 || value?.payload) return migratePayloadV1(value, options);
  throw new Error("Unsupported model document format.");
}

export function exportModelV2(model) {
  return { mime: "application/vnd.markov-lab.model+json", filenameExtension: ".markov.json", text: JSON.stringify(model, null, 2) };
}
