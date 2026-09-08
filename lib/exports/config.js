import "server-only";
import { parseHelperLines, parseNameValueLines } from "@/lib/modelParsers";
import { createSavedSimulationSlug } from "@/lib/slugs";

export const MODEL_CONFIG_FORMAT = "markov-side-by-side/model-config";
export const MODEL_CONFIG_FORMAT_VERSION = 1;
const DEFAULT_NATIVE_SEED = 12345;

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function maybeLabel(item) {
  const enabled = Boolean(item?.noteEnabled);
  const label = trimString(item?.noteLabel);
  return enabled && label ? { label } : {};
}

function filenameBaseForSavedSimulation(savedSimulation) {
  const slug = trimString(savedSimulation?.slug);
  if (slug) {
    return slug;
  }

  return createSavedSimulationSlug(savedSimulation?.name ?? "model");
}

function csvFilenameForSavedSimulation(savedSimulation) {
  return `${filenameBaseForSavedSimulation(savedSimulation)}.csv`;
}

function buildBaseConfig(savedSimulation, model, run) {
  return {
    format: MODEL_CONFIG_FORMAT,
    formatVersion: MODEL_CONFIG_FORMAT_VERSION,
    name: trimString(savedSimulation?.name) || "Untitled Model",
    description: trimString(savedSimulation?.description),
    simulatorType: savedSimulation?.simulatorType,
    exportedAt: new Date().toISOString(),
    model,
    run,
  };
}

function normalizeExpressionString(value, fallback = "0") {
  const trimmed = trimString(value);
  return trimmed || fallback;
}

function buildVariablesFromRows(varRows) {
  const parsedVariables = parseNameValueLines(
    Array.isArray(varRows)
      ? varRows.map((row) => row?.text ?? "").join("\n")
      : "",
    "Variable",
  );

  return parsedVariables.map((variable, index) => ({
    name: variable.name,
    initial: variable.val,
    ...maybeLabel(varRows[index]),
  }));
}

function buildParametersFromRows(paramRows) {
  const parsedParameters = parseNameValueLines(
    Array.isArray(paramRows)
      ? paramRows.map((row) => row?.text ?? "").join("\n")
      : "",
    "Parameter",
  );

  return parsedParameters.map((parameter) => ({
    name: parameter.name,
    value: parameter.val,
  }));
}

function buildHelpersFromRows(helperRows) {
  const parsedHelpers = parseHelperLines(
    Array.isArray(helperRows)
      ? helperRows.map((row) => row?.text ?? "").join("\n")
      : "",
  );

  return parsedHelpers.map((helper) => ({
    name: helper.name,
    expression: helper.body,
  }));
}

function buildTransitionChangeObject(variableNames, deltas) {
  return Object.fromEntries(
    variableNames.map((variableName, index) => [
      variableName,
      normalizeExpressionString(deltas?.[index], "0"),
    ]),
  );
}

function buildTransitions(variableNames, transitions) {
  return Array.isArray(transitions)
    ? transitions.map((transition) => ({
        rate: normalizeExpressionString(transition?.rate, "0"),
        change: buildTransitionChangeObject(variableNames, transition?.deltas),
        ...maybeLabel(transition),
      }))
    : [];
}

function buildRunConfig(savedSimulation, overrides = {}) {
  const numSimulations = Number.isInteger(overrides.numSimulations)
    ? overrides.numSimulations
    : Math.max(
        1,
        Math.trunc(savedSimulation?.payload?.settings?.numSims ?? 1),
      );

  const seed = Number.isInteger(overrides.seed)
    ? overrides.seed
    : DEFAULT_NATIVE_SEED;

  const filename =
    trimString(overrides.csvFilename) ||
    csvFilenameForSavedSimulation(savedSimulation);

  return {
    numSimulations,
    seed,
    csv: {
      filename,
      includeHeader: overrides.includeHeader ?? true,
    },
  };
}

function createDiscreteModelConfig(savedSimulation, payload, { withHelpers = false } = {}) {
  const variables = buildVariablesFromRows(payload?.varRows ?? []);
  const variableNames = variables.map((variable) => variable.name);
  const parameters = buildParametersFromRows(payload?.paramRows ?? []);
  const transitions = buildTransitions(variableNames, payload?.transitions ?? []);

  const model = {
    variables,
    parameters,
    transitions,
    time: {
      tMax: Number(payload?.settings?.tMax ?? 0),
      ...(withHelpers ? { dt: Number(payload?.settings?.dt ?? 0) } : {}),
    },
  };

  if (withHelpers) {
    model.helpers = buildHelpersFromRows(payload?.helperRows ?? []);
  }

  return model;
}

function createSDEModelConfig(savedSimulation, payload) {
  return {
    parameters: buildParametersFromRows(payload?.paramRows ?? []),
    components: Array.isArray(payload?.components)
      ? payload.components.map((component) => ({
          name: trimString(component?.name),
          initial: Number(component?.init ?? 0),
          drift: normalizeExpressionString(component?.drift, "0"),
          diffusion: normalizeExpressionString(component?.diff, "0"),
          ...maybeLabel(component),
        }))
      : [],
    time: {
      tMax: Number(payload?.settings?.tMax ?? 0),
      dt: Number(payload?.settings?.dt ?? 0),
    },
  };
}

function createDiscreteTimeModelConfig(payload) {
  return {
    components: Array.isArray(payload?.components)
      ? payload.components.map((component) => ({
          name: trimString(component?.name),
          initial: Number(component?.init ?? 0),
          outcomes: Array.isArray(component?.outcomes)
            ? component.outcomes.map((outcome) => ({
                offspring: Number(outcome?.offspring ?? 0),
                probability: Number(outcome?.probability ?? 0),
              }))
            : [],
          ...maybeLabel(component),
        }))
      : [],
    time: {
      generations: Number(payload?.settings?.generations ?? 0),
    },
  };
}

export function createModelExportConfig(savedSimulation, overrides = {}) {
  if (!savedSimulation?.payload || !savedSimulation?.simulatorType) {
    throw new Error("Saved simulation payload is required for export.");
  }

  if (savedSimulation.simulatorType === "gillespie") {
    return buildBaseConfig(
      savedSimulation,
      createDiscreteModelConfig(savedSimulation, savedSimulation.payload),
      buildRunConfig(savedSimulation, overrides),
    );
  }

  if (savedSimulation.simulatorType === "ctmp-inhomo") {
    return buildBaseConfig(
      savedSimulation,
      createDiscreteModelConfig(savedSimulation, savedSimulation.payload, {
        withHelpers: true,
      }),
      buildRunConfig(savedSimulation, overrides),
    );
  }

  if (savedSimulation.simulatorType === "sde") {
    return buildBaseConfig(
      savedSimulation,
      createSDEModelConfig(savedSimulation, savedSimulation.payload),
      buildRunConfig(savedSimulation, overrides),
    );
  }

  if (savedSimulation.simulatorType === "discrete-time") {
    return buildBaseConfig(
      savedSimulation,
      createDiscreteTimeModelConfig(savedSimulation.payload),
      buildRunConfig(savedSimulation, overrides),
    );
  }

  throw new Error(
    `Unsupported simulator type "${savedSimulation.simulatorType}" for export.`,
  );
}

export function getModelExportConfigFilename(savedSimulation) {
  return `${filenameBaseForSavedSimulation(savedSimulation)}.json`;
}

export function getNativeBundleFilename(savedSimulation) {
  return `${filenameBaseForSavedSimulation(savedSimulation)}-native-bundle.zip`;
}

export function stringifyModelExportConfig(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}
