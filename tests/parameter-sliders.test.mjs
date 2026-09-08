import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultSliderConfig,
  normalizeSliderConfig,
  parseNumericAssignment,
  replaceAssignmentValue,
} from "../lib/numeric-sliders.js";
import {
  hydrateGillespiePayload,
  hydrateCTMPInhomoPayload,
  hydrateSDEPayload,
  serializeGillespieState,
  serializeCTMPInhomoState,
  serializeSDEState,
} from "../lib/saved-simulations/serializers.js";
import {
  validateSavedSimulationPayload,
  ValidationError,
} from "../lib/saved-simulations/validators.js";
import { createModelExportConfig } from "../lib/exports/config.js";

test("slider assignment edits preserve names, spacing and scientific-scale values", () => {
  assert.deepEqual(parseNumericAssignment("  sigma_x = -2.5e-7  "), {
    name: "sigma_x",
    value: -2.5e-7,
    prefix: "  sigma_x = ",
    suffix: "  ",
  });
  assert.equal(
    replaceAssignmentValue("  sigma_x = -2.5e-7  ", "0.000000125"),
    "  sigma_x = 1.25e-7  ",
  );
  assert.equal(replaceAssignmentValue("k=1.1", "0"), "k=0");
});

test("sliders never rewrite invalid assignments, functions or comments", () => {
  for (const text of [
    "",
    "# k = 1",
    "// k = 1",
    "k =",
    "k = 2 * 3",
    "Season(t) = 1",
    "k = Infinity",
    "k = 1e999",
    "a = 1\nb = 2",
  ]) {
    assert.equal(parseNumericAssignment(text), null);
    assert.equal(replaceAssignmentValue(text, "0.5"), text);
  }
});

test("automatic ranges include positive, negative, zero and very small parameters", () => {
  for (const value of [
    0, 1.1, -7, 5000, 2e-12, -4e-12, 1e308, -1e308, 1e-320,
  ]) {
    const config = normalizeSliderConfig(defaultSliderConfig(value));
    assert.ok(config.min <= value && config.max >= value);
    assert.ok(config.step > 0 && Number.isFinite(config.step));
  }
  assert.deepEqual(defaultSliderConfig(0.005), {
    enabled: true,
    min: 0,
    max: 0.01,
    step: 0.0001,
  });
  assert.deepEqual(defaultSliderConfig(-5), {
    enabled: true,
    min: -10,
    max: 0,
    step: 0.1,
  });
});

test("range configuration rejects invalid bounds and step sizes", () => {
  const config = { enabled: true, min: -1, max: 1, step: 0.01 };
  for (const patch of [
    { min: "" },
    { max: 1 / 0 },
    { max: -1 },
    { step: 0 },
    { step: -0.1 },
    { step: 3 },
    { min: -1e308, max: 1e308 },
  ]) {
    assert.throws(() => normalizeSliderConfig({ ...config, ...patch }));
  }
  assert.deepEqual(
    normalizeSliderConfig({
      enabled: false,
      min: "-1",
      max: "1",
      step: "0.01",
    }),
    { ...config, enabled: false },
  );
});

const formats = [
  ["gillespie", serializeGillespieState, hydrateGillespiePayload],
  ["ctmp-inhomo", serializeCTMPInhomoState, hydrateCTMPInhomoPayload],
  ["sde", serializeSDEState, hydrateSDEPayload],
];
const state = {
  varRows: [{ text: "X = 10" }],
  paramRows: [
    {
      text: "k = 0.05",
      noteEnabled: true,
      noteLabel: "Rate",
      slider: { enabled: true, min: "0", max: "0.1", step: "0.001" },
    },
  ],
  helperRows: [],
  transitions: [{ rate: "k * X", deltas: ["1"] }],
  components: [{ name: "X", init: 10, drift: "k", diff: "0" }],
  tMax: 1,
  dt: 0.01,
  numSims: 1,
};

for (const [type, serialize, hydrate] of formats) {
  test(`${type}: slider preferences survive saving and do not change exported model parameters`, () => {
    const saved = serialize(state);
    const payload = validateSavedSimulationPayload(type, saved.payload);
    const reopened = hydrate(payload);
    assert.deepEqual(reopened.paramRows[0].slider, {
      enabled: true,
      min: 0,
      max: 0.1,
      step: 0.001,
    });
    assert.equal(reopened.paramRows[0].text, "k = 0.05");
    assert.equal(reopened.paramRows[0].noteLabel, "Rate");
    const exported = createModelExportConfig({
      name: "Sliders",
      simulatorType: type,
      payload,
    });
    assert.deepEqual(exported.model.parameters, [{ name: "k", value: 0.05 }]);
    const disabled = {
      ...state,
      paramRows: [
        {
          ...state.paramRows[0],
          slider: { ...state.paramRows[0].slider, enabled: false },
        },
      ],
    };
    assert.equal(
      hydrate(validateSavedSimulationPayload(type, serialize(disabled).payload))
        .paramRows[0].slider.enabled,
      false,
    );
  });

  test(`${type}: existing rows remain compatible and the API validates slider metadata`, () => {
    const old = serialize({ ...state, paramRows: [{ text: "k = 1" }] });
    assert.deepEqual(
      hydrate(validateSavedSimulationPayload(type, old.payload)).paramRows.map(
        ({ id, ...row }) => row,
      ),
      [{ text: "k = 1", noteEnabled: false, noteLabel: "" }],
    );
    old.payload.paramRows[0].slider = {
      enabled: true,
      min: 2,
      max: 1,
      step: 0.1,
    };
    assert.throws(
      () => validateSavedSimulationPayload(type, old.payload),
      ValidationError,
    );
  });
}
