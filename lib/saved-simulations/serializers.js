const PAYLOAD_VERSION = 1;

function makeClientId() {
  return Math.random().toString(36).slice(2);
}

function normalizeTextRow(row) {
  return {
    text: typeof row?.text === "string" ? row.text : "",
    noteEnabled: Boolean(row?.noteEnabled),
    noteLabel: typeof row?.noteLabel === "string" ? row.noteLabel : "",
  };
}

function hydrateTextRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [{ id: makeClientId(), text: "", noteEnabled: false, noteLabel: "" }];
  }

  return rows.map((row) => ({
    id: makeClientId(),
    ...normalizeTextRow(row),
  }));
}

function serializeTextRows(rows) {
  return Array.isArray(rows) ? rows.map(normalizeTextRow) : [];
}

function serializeTransitions(transitions) {
  return Array.isArray(transitions)
    ? transitions.map((transition) => ({
        rate: typeof transition?.rate === "string" ? transition.rate : "",
        deltas: Array.isArray(transition?.deltas)
          ? transition.deltas.map((entry) =>
              typeof entry === "string" ? entry : String(entry ?? ""),
            )
          : [],
        noteEnabled: Boolean(transition?.noteEnabled),
        noteLabel:
          typeof transition?.noteLabel === "string" ? transition.noteLabel : "",
      }))
    : [];
}

function hydrateTransitions(transitions) {
  if (!Array.isArray(transitions) || transitions.length === 0) {
    return [
      {
        id: makeClientId(),
        rate: "",
        deltas: [],
        noteEnabled: false,
        noteLabel: "",
      },
    ];
  }

  return transitions.map((transition) => ({
    id: makeClientId(),
    rate: typeof transition?.rate === "string" ? transition.rate : "",
    deltas: Array.isArray(transition?.deltas)
      ? transition.deltas.map((entry) =>
          typeof entry === "string" ? entry : String(entry ?? ""),
        )
      : [],
    noteEnabled: Boolean(transition?.noteEnabled),
    noteLabel:
      typeof transition?.noteLabel === "string" ? transition.noteLabel : "",
  }));
}

export function serializeGillespieState({
  varRows,
  paramRows,
  transitions,
  tMax,
  numSims,
}) {
  return {
    payloadVersion: PAYLOAD_VERSION,
    payload: {
      varRows: serializeTextRows(varRows),
      paramRows: serializeTextRows(paramRows),
      transitions: serializeTransitions(transitions),
      settings: {
        tMax: Number(tMax),
        numSims: Number(numSims),
      },
    },
  };
}

export function hydrateGillespiePayload(payload) {
  return {
    varRows: hydrateTextRows(payload?.varRows),
    paramRows: hydrateTextRows(payload?.paramRows),
    transitions: hydrateTransitions(payload?.transitions),
    settings: {
      tMax: payload?.settings?.tMax ?? 5,
      numSims: payload?.settings?.numSims ?? 1,
    },
  };
}

export function serializeCTMPInhomoState({
  varRows,
  paramRows,
  helperRows,
  transitions,
  tMax,
  dt,
  numSims,
}) {
  return {
    payloadVersion: PAYLOAD_VERSION,
    payload: {
      varRows: serializeTextRows(varRows),
      paramRows: serializeTextRows(paramRows),
      helperRows: serializeTextRows(helperRows),
      transitions: serializeTransitions(transitions),
      settings: {
        tMax: Number(tMax),
        dt: Number(dt),
        numSims: Number(numSims),
      },
    },
  };
}

export function hydrateCTMPInhomoPayload(payload) {
  return {
    varRows: hydrateTextRows(payload?.varRows),
    paramRows: hydrateTextRows(payload?.paramRows),
    helperRows: hydrateTextRows(payload?.helperRows),
    transitions: hydrateTransitions(payload?.transitions),
    settings: {
      tMax: payload?.settings?.tMax ?? 7,
      dt: payload?.settings?.dt ?? 0.000002,
      numSims: payload?.settings?.numSims ?? 1,
    },
  };
}

export function serializeSDEState({ paramRows, components, tMax, dt, numSims }) {
  return {
    payloadVersion: PAYLOAD_VERSION,
    payload: {
      paramRows: serializeTextRows(paramRows),
      components: Array.isArray(components)
        ? components.map((component) => ({
            name: typeof component?.name === "string" ? component.name : "",
            init: Number(component?.init),
            drift: typeof component?.drift === "string" ? component.drift : "",
            diff: typeof component?.diff === "string" ? component.diff : "",
            noteEnabled: Boolean(component?.noteEnabled),
            noteLabel:
              typeof component?.noteLabel === "string"
                ? component.noteLabel
                : "",
          }))
        : [],
      settings: {
        tMax: Number(tMax),
        dt: Number(dt),
        numSims: Number(numSims),
      },
    },
  };
}

export function hydrateSDEPayload(payload) {
  const components =
    Array.isArray(payload?.components) && payload.components.length > 0
      ? payload.components.map((component) => ({
          id: makeClientId(),
          name: typeof component?.name === "string" ? component.name : "",
          init: String(component?.init ?? ""),
          drift: typeof component?.drift === "string" ? component.drift : "",
          diff: typeof component?.diff === "string" ? component.diff : "",
          noteEnabled: Boolean(component?.noteEnabled),
          noteLabel:
            typeof component?.noteLabel === "string"
              ? component.noteLabel
              : "",
        }))
      : [
          {
            id: makeClientId(),
            name: "",
            init: "",
            drift: "",
            diff: "",
            noteEnabled: false,
            noteLabel: "",
          },
        ];

  return {
    paramRows: hydrateTextRows(payload?.paramRows),
    components,
    settings: {
      tMax: payload?.settings?.tMax ?? 20,
      dt: payload?.settings?.dt ?? 0.005,
      numSims: payload?.settings?.numSims ?? 1,
    },
  };
}
