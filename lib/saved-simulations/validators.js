export const SIMULATOR_TYPES = ["gillespie", "ctmp-inhomo", "sde"];
export const PAYLOAD_VERSION = 1;
const MAX_TEXT_ROWS = 100;
const MAX_TRANSITIONS = 100;
const MAX_COMPONENTS = 100;

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

export function validateSavedSimulationPayload(simulatorType, payload) {
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
    payloadVersion === PAYLOAD_VERSION,
    `payloadVersion must equal ${PAYLOAD_VERSION}.`,
  );

  return {
    name,
    description,
    simulatorType: value.simulatorType,
    payloadVersion,
    payload: validateSavedSimulationPayload(value.simulatorType, value.payload),
  };
}

export function validateUpdateSavedSimulationInput(input) {
  const value = requireObject(input, "Request body");
  assert(!("userId" in value), "userId cannot be updated.");
  assert(!("simulatorType" in value), "simulatorType cannot be updated.");

  const output = {};

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

  if ("payloadVersion" in value) {
    const payloadVersion = normalizeInteger(
      value.payloadVersion,
      "payloadVersion",
    );
    assert(
      payloadVersion === PAYLOAD_VERSION,
      `payloadVersion must equal ${PAYLOAD_VERSION}.`,
    );
    output.payloadVersion = payloadVersion;
  }

  if ("payload" in value) {
    const payloadVersion = output.payloadVersion ?? PAYLOAD_VERSION;
    assert(
      payloadVersion === PAYLOAD_VERSION,
      `payloadVersion must equal ${PAYLOAD_VERSION}.`,
    );
    assert(
      typeof value.currentSimulatorType === "string" &&
        SIMULATOR_TYPES.includes(value.currentSimulatorType),
      "currentSimulatorType is required for payload validation.",
    );
    output.payload = validateSavedSimulationPayload(
      value.currentSimulatorType,
      value.payload,
    );
  }

  assert(
    Object.keys(output).length > 0,
    "At least one mutable field must be provided.",
  );

  return output;
}
