import { Buffer } from "node:buffer";
import { validateModelV2 } from "../model-v2/schema.js";

export const SIMULATOR_TYPES = ["gillespie", "ctmp-inhomo", "sde"];
export const PAYLOAD_VERSION = 2;
export const LEGACY_PAYLOAD_VERSION = 1;
export const VISIBILITY_VALUES = ["public", "private"];
export const SAVED_SIMULATION_PREVIEW_WIDTH = 400;
export const SAVED_SIMULATION_PREVIEW_HEIGHT = 300;
export const SAVED_SIMULATION_PREVIEW_MIME_TYPES = [
  "image/webp",
  "image/jpeg",
];
const MAX_TEXT_ROWS = 100;
const MAX_TRANSITIONS = 100;
const MAX_COMPONENTS = 100;
const MAX_PREVIEW_BYTES = 256 * 1024;
const MAX_BLUR_DATA_URL_LENGTH = 12 * 1024;
const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 32;
const MAX_JSON_NODES = 25_000;

export class ValidationError extends Error {}

function assert(condition, message) {
  if (!condition) {
    throw new ValidationError(message);
  }
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function requireObject(value, label) {
  assert(isPlainObject(value), `${label} must be an object.`);
  return value;
}

function normalizeString(value, label, { maxLength, allowEmpty = true } = {}) {
  assert(typeof value === "string", `${label} must be a string.`);
  const trimmed = value.trim();
  if (!allowEmpty) {
    assert(trimmed.length > 0, `${label} is required.`);
  }
  if (typeof maxLength === "number") {
    assert(
      trimmed.length <= maxLength,
      `${label} must be at most ${maxLength} characters.`,
    );
  }
  return trimmed;
}

function normalizeFiniteNumber(value, label) {
  const numeric = Number(value);
  assert(Number.isFinite(numeric), `${label} must be a finite number.`);
  return numeric;
}

function normalizeInteger(value, label, { min, max } = {}) {
  const numeric = normalizeFiniteNumber(value, label);
  assert(Number.isInteger(numeric), `${label} must be an integer.`);
  if (typeof min === "number") {
    assert(numeric >= min, `${label} must be at least ${min}.`);
  }
  if (typeof max === "number") {
    assert(numeric <= max, `${label} must be at most ${max}.`);
  }
  return numeric;
}

function normalizeTextRows(value, label) {
  assert(Array.isArray(value), `${label} must be an array.`);
  assert(value.length <= MAX_TEXT_ROWS, `${label} exceeds the maximum size.`);

  return value.map((row, index) => {
    const item = requireObject(row, `${label}[${index}]`);
    return {
      text: typeof item.text === "string" ? item.text : "",
      noteEnabled: Boolean(item.noteEnabled),
      noteLabel:
        typeof item.noteLabel === "string" ? item.noteLabel.trim() : "",
    };
  });
}

function normalizeStringArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array.`);
  assert(value.length <= MAX_TEXT_ROWS, `${label} exceeds the maximum size.`);
  return value.map((entry, index) => {
    assert(
      typeof entry === "string",
      `${label}[${index}] must be a string.`,
    );
    return entry;
  });
}

function normalizeTags(value) {
  assert(Array.isArray(value), "tags must be an array.");
  assert(value.length <= MAX_TAGS, `tags may contain at most ${MAX_TAGS} values.`);
  return [...new Set(value.map((tag, index) =>
    normalizeString(tag, `tags[${index}]`, { maxLength: MAX_TAG_LENGTH, allowEmpty: false }),
  ))];
}

function cloneBoundedJson(value, label = "payload", state = { nodes: 0 }, depth = 0) {
  state.nodes += 1;
  assert(state.nodes <= MAX_JSON_NODES, `${label} exceeds the maximum size.`);
  assert(depth <= 30, `${label} is nested too deeply.`);
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    assert(Number.isFinite(value), `${label} contains a non-finite number.`);
    return value;
  }
  assert(typeof value === "object", `${label} contains an unsupported value.`);
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      cloneBoundedJson(item, `${label}[${index}]`, state, depth + 1),
    );
  }
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    assert(!["__proto__", "prototype", "constructor"].includes(key), `${label} contains a forbidden key.`);
    output[key] = cloneBoundedJson(item, `${label}.${key}`, state, depth + 1);
  }
  return output;
}

export function validateV2SavedSimulationPayload(simulatorType, payload) {
  const value = requireObject(payload, "payload");
  const cloned = cloneBoundedJson(value);
  const validation = validateModelV2(cloned);
  assert(cloned.solverFamily === simulatorType, "payload.solverFamily must match simulatorType.");
  if (!validation.ok) {
    const first = validation.issues[0];
    throw new ValidationError(`${first.path || "payload"}: ${first.message}`);
  }
  assert(Array.isArray(cloned.plots ?? []), "payload.plots must be an array.");
  assert((cloned.plots ?? []).length <= 32, "payload.plots exceeds the maximum size.");
  assert(Number.isInteger(cloned.settings?.runs) && cloned.settings.runs >= 1, "payload.settings.runs must be a positive integer.");
  assert(typeof cloned.settings?.solver === "string" && cloned.settings.solver, "payload.settings.solver is required.");
  for (const [index, variable] of (cloned.variables ?? []).entries()) {
    assert(Number.isFinite(variable.initialValue), `payload.variables[${index}].initialValue must be finite.`);
  }
  for (const [index, parameter] of (cloned.parameters ?? []).entries()) {
    assert(Number.isFinite(parameter.value), `payload.parameters[${index}].value must be finite.`);
  }
  if (simulatorType === "sde") validateSDEIntegrity(cloned);
  return cloned;
}

function validateSDEIntegrity(model) {
  const variables = model.variables ?? [];
  const components = model.sdeComponents ?? [];
  const noiseSources = model.noiseSources ?? [];
  assert(components.length === variables.length, "payload.sdeComponents must contain one component per variable.");
  const variableIds = new Set(variables.map((variable) => variable.id));
  const componentVariableIds = new Set();
  const noiseIds = new Set(noiseSources.map((noise) => noise.id));
  for (const [index, component] of components.entries()) {
    assert(variableIds.has(component.variableId), `payload.sdeComponents[${index}].variableId is unknown.`);
    assert(!componentVariableIds.has(component.variableId), `payload.sdeComponents[${index}].variableId is duplicated.`);
    componentVariableIds.add(component.variableId);
    assert(typeof component.drift === "string", `payload.sdeComponents[${index}].drift must be an expression string.`);
    assert(Array.isArray(component.diffusion), `payload.sdeComponents[${index}].diffusion must be an array.`);
    for (const [entryIndex, entry] of component.diffusion.entries()) {
      assert(noiseIds.has(entry.noiseId), `payload.sdeComponents[${index}].diffusion[${entryIndex}].noiseId is unknown.`);
      assert(typeof entry.expression === "string", `payload.sdeComponents[${index}].diffusion[${entryIndex}].expression must be a string.`);
    }
    const boundary = component.boundary ?? { type: "none" };
    assert(isPlainObject(boundary), `payload.sdeComponents[${index}].boundary must be an object.`);
    assert(["none", "error", "reflect", "clamp", "absorb"].includes(boundary.type ?? "none"), `payload.sdeComponents[${index}].boundary.type is unsupported.`);
    if (boundary.min != null) assert(Number.isFinite(boundary.min), `payload.sdeComponents[${index}].boundary.min must be finite.`);
    if (boundary.max != null) assert(Number.isFinite(boundary.max), `payload.sdeComponents[${index}].boundary.max must be finite.`);
    if (boundary.min != null && boundary.max != null) {
      assert(boundary.max > boundary.min, `payload.sdeComponents[${index}].boundary.max must exceed min.`);
    }
  }
  if (model.correlations == null) return;
  const matrix = model.correlations;
  assert(Array.isArray(matrix) && matrix.length === noiseSources.length, "payload.correlations must match the noise-source count.");
  const lower = Array.from({ length: matrix.length }, () => Array(matrix.length).fill(0));
  for (let row = 0; row < matrix.length; row += 1) {
    assert(Array.isArray(matrix[row]) && matrix[row].length === matrix.length, "payload.correlations must be square.");
    for (let column = 0; column <= row; column += 1) {
      const value = matrix[row][column];
      assert(Number.isFinite(value) && Math.abs(value) <= 1, "payload.correlations entries must be finite and between -1 and 1.");
      assert(Math.abs(value - matrix[column][row]) <= 1e-12, "payload.correlations must be symmetric.");
      let remainder = value;
      for (let k = 0; k < column; k += 1) remainder -= lower[row][k] * lower[column][k];
      if (row === column) {
        assert(Math.abs(value - 1) <= 1e-12 && remainder >= -1e-12, "payload.correlations must have unit diagonal and be positive semidefinite.");
        lower[row][column] = Math.sqrt(Math.max(0, remainder));
      } else if (lower[column][column] > 1e-12) {
        lower[row][column] = remainder / lower[column][column];
      } else {
        assert(Math.abs(remainder) <= 1e-12, "payload.correlations must be positive semidefinite.");
      }
    }
  }
}

function parseBase64DataUrl(value, label, { allowedMimeTypes, maxBytes }) {
  assert(typeof value === "string", `${label} must be a string.`);
  const normalized = value.trim();
  const match = normalized.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  assert(match, `${label} must be a base64 data URL.`);

  const mimeType = match[1].toLowerCase();
  assert(
    !allowedMimeTypes || allowedMimeTypes.includes(mimeType),
    `${label} has an unsupported MIME type.`,
  );

  const buffer = Buffer.from(match[2], "base64");
  assert(buffer.length > 0, `${label} is empty.`);
  if (typeof maxBytes === "number") {
    assert(buffer.length <= maxBytes, `${label} exceeds the maximum size.`);
  }

  return {
    mimeType,
    buffer,
    dataUrl: normalized,
  };
}

function normalizeTransitions(value) {
  assert(Array.isArray(value), "payload.transitions must be an array.");
  assert(
    value.length <= MAX_TRANSITIONS,
    "payload.transitions exceeds the maximum size.",
  );

  return value.map((transition, index) => {
    const item = requireObject(transition, `payload.transitions[${index}]`);
    return {
      rate: typeof item.rate === "string" ? item.rate : "",
      deltas: normalizeStringArray(
        item.deltas ?? [],
        `payload.transitions[${index}].deltas`,
      ),
      noteEnabled: Boolean(item.noteEnabled),
      noteLabel:
        typeof item.noteLabel === "string" ? item.noteLabel.trim() : "",
    };
  });
}

function normalizeComponents(value) {
  assert(Array.isArray(value), "payload.components must be an array.");
  assert(
    value.length <= MAX_COMPONENTS,
    "payload.components exceeds the maximum size.",
  );

  return value.map((component, index) => {
    const item = requireObject(component, `payload.components[${index}]`);
    return {
      name: typeof item.name === "string" ? item.name.trim() : "",
      init: normalizeFiniteNumber(
        item.init,
        `payload.components[${index}].init`,
      ),
      drift: typeof item.drift === "string" ? item.drift : "",
      diff: typeof item.diff === "string" ? item.diff : "",
      noteEnabled: Boolean(item.noteEnabled),
      noteLabel:
        typeof item.noteLabel === "string" ? item.noteLabel.trim() : "",
    };
  });
}

function normalizeSettings(value, simulatorType) {
  const item = requireObject(value, "payload.settings");
  const base = {
    tMax: normalizeFiniteNumber(item.tMax, "payload.settings.tMax"),
    numSims: normalizeInteger(item.numSims, "payload.settings.numSims", {
      min: 1,
      max: 200,
    }),
  };

  if (simulatorType === "gillespie") {
    return base;
  }

  return {
    ...base,
    dt: normalizeFiniteNumber(item.dt, "payload.settings.dt"),
  };
}

export function validateSavedSimulationPayload(
  simulatorType,
  payload,
  payloadVersion = LEGACY_PAYLOAD_VERSION,
) {
  if (payloadVersion === PAYLOAD_VERSION) {
    return validateV2SavedSimulationPayload(simulatorType, payload);
  }
  assert(payloadVersion === LEGACY_PAYLOAD_VERSION, "Unsupported payloadVersion.");
  const value = requireObject(payload, "payload");

  if (simulatorType === "gillespie") {
    return {
      varRows: normalizeTextRows(value.varRows ?? [], "payload.varRows"),
      paramRows: normalizeTextRows(value.paramRows ?? [], "payload.paramRows"),
      transitions: normalizeTransitions(value.transitions ?? []),
      settings: normalizeSettings(value.settings ?? {}, simulatorType),
    };
  }

  if (simulatorType === "ctmp-inhomo") {
    return {
      varRows: normalizeTextRows(value.varRows ?? [], "payload.varRows"),
      paramRows: normalizeTextRows(value.paramRows ?? [], "payload.paramRows"),
      helperRows: normalizeTextRows(
        value.helperRows ?? [],
        "payload.helperRows",
      ),
      transitions: normalizeTransitions(value.transitions ?? []),
      settings: normalizeSettings(value.settings ?? {}, simulatorType),
    };
  }

  if (simulatorType === "sde") {
    return {
      paramRows: normalizeTextRows(value.paramRows ?? [], "payload.paramRows"),
      components: normalizeComponents(value.components ?? []),
      settings: normalizeSettings(value.settings ?? {}, simulatorType),
    };
  }

  throw new ValidationError("Unsupported simulator type.");
}

export function validateCreateSavedSimulationInput(input) {
  const value = requireObject(input, "Request body");

  const name = normalizeString(value.name, "name", {
    maxLength: 120,
    allowEmpty: false,
  });
  const description =
    typeof value.description === "undefined"
      ? ""
      : normalizeString(value.description, "description", {
          maxLength: 500,
        });

  assert(
    SIMULATOR_TYPES.includes(value.simulatorType),
    "simulatorType must be one of gillespie, ctmp-inhomo, or sde.",
  );

  const payloadVersion = normalizeInteger(value.payloadVersion, "payloadVersion");
  assert(
    [LEGACY_PAYLOAD_VERSION, PAYLOAD_VERSION].includes(payloadVersion),
    `payloadVersion must equal ${LEGACY_PAYLOAD_VERSION} or ${PAYLOAD_VERSION}.`,
  );

  return {
    name,
    description,
    tags: typeof value.tags === "undefined" ? [] : normalizeTags(value.tags),
    visibility:
      typeof value.visibility === "undefined"
        ? "public"
        : VISIBILITY_VALUES.includes(value.visibility)
          ? value.visibility
          : (() => { throw new ValidationError("visibility must be public or private."); })(),
    simulatorType: value.simulatorType,
    payloadVersion,
    payload: validateSavedSimulationPayload(value.simulatorType, value.payload, payloadVersion),
  };
}

export function validateUpdateSavedSimulationInput(input) {
  const value = requireObject(input, "Request body");
  assert(!("userId" in value), "userId cannot be updated.");
  assert(!("simulatorType" in value), "simulatorType cannot be updated.");
  assert(!("slug" in value), "slug is immutable.");
  assert(!("revision" in value), "revision cannot be updated directly.");

  const expectedRevision = normalizeInteger(value.expectedRevision, "expectedRevision", { min: 1 });

  const output = { expectedRevision };

  if ("name" in value) {
    output.name = normalizeString(value.name, "name", {
      maxLength: 120,
      allowEmpty: false,
    });
  }

  if ("description" in value) {
    output.description = normalizeString(value.description, "description", {
      maxLength: 500,
    });
  }

  if ("tags" in value) output.tags = normalizeTags(value.tags);
  if ("visibility" in value) {
    assert(VISIBILITY_VALUES.includes(value.visibility), "visibility must be public or private.");
    output.visibility = value.visibility;
  }

  if ("payloadVersion" in value) {
    const payloadVersion = normalizeInteger(
      value.payloadVersion,
      "payloadVersion",
    );
    assert(
      [LEGACY_PAYLOAD_VERSION, PAYLOAD_VERSION].includes(payloadVersion),
      `payloadVersion must equal ${LEGACY_PAYLOAD_VERSION} or ${PAYLOAD_VERSION}.`,
    );
    output.payloadVersion = payloadVersion;
  }

  if ("payload" in value) {
    const payloadVersion = output.payloadVersion ?? value.currentPayloadVersion;
    assert(
      [LEGACY_PAYLOAD_VERSION, PAYLOAD_VERSION].includes(payloadVersion),
      "currentPayloadVersion is required for payload validation.",
    );
    assert(
      typeof value.currentSimulatorType === "string" &&
        SIMULATOR_TYPES.includes(value.currentSimulatorType),
      "currentSimulatorType is required for payload validation.",
    );
    output.payload = validateSavedSimulationPayload(
      value.currentSimulatorType,
      value.payload,
      payloadVersion,
    );
  }

  assert(
    Object.keys(output).length > 1,
    "At least one mutable field must be provided.",
  );

  return output;
}

export function validateSavedSimulationPreviewUploadInput(input) {
  const value = requireObject(input, "Request body");
  const image = parseBase64DataUrl(value.imageDataUrl, "imageDataUrl", {
    allowedMimeTypes: SAVED_SIMULATION_PREVIEW_MIME_TYPES,
    maxBytes: MAX_PREVIEW_BYTES,
  });

  let blurDataURL = null;
  if (value.blurDataURL != null) {
    assert(typeof value.blurDataURL === "string", "blurDataURL must be a string.");
    const normalized = value.blurDataURL.trim();
    assert(
      normalized.length <= MAX_BLUR_DATA_URL_LENGTH,
      "blurDataURL exceeds the maximum size.",
    );
    assert(
      /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i.test(normalized),
      "blurDataURL must be a base64 image data URL.",
    );
    blurDataURL = normalized;
  }

  return {
    image,
    blurDataURL,
    width: SAVED_SIMULATION_PREVIEW_WIDTH,
    height: SAVED_SIMULATION_PREVIEW_HEIGHT,
    format: image.mimeType,
    fileSize: image.buffer.length,
    expectedRevision: (() => {
      const revision = Number(value.expectedRevision);
      assert(Number.isSafeInteger(revision) && revision >= 1, "expectedRevision must be a positive integer.");
      return revision;
    })(),
    expectedDefinitionHash: (() => {
      const hash = typeof value.expectedDefinitionHash === "string" ? value.expectedDefinitionHash.trim() : "";
      assert(/^[0-9a-f]{64}$/.test(hash), "expectedDefinitionHash must be a SHA-256 hex digest.");
      return hash;
    })(),
  };
}
