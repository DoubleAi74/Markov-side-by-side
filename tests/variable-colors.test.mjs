import test from "node:test";
import assert from "node:assert/strict";
import {
  hydrateGillespiePayload,
  hydrateCTMPInhomoPayload,
  hydrateSDEPayload,
  hydrateDiscreteTimePayload,
  serializeGillespieState,
  serializeCTMPInhomoState,
  serializeSDEState,
  serializeDiscreteTimeState,
} from "../lib/saved-simulations/serializers.js";
import {
  validateSavedSimulationPayload,
  ValidationError,
} from "../lib/saved-simulations/validators.js";
import {
  applySeriesColors,
  buildVariableSeries,
  getSeriesColor,
} from "../components/simulators/shared/seriesColors.js";
import { createModelExportConfig } from "../lib/exports/config.js";

const formats = [
  ["gillespie", serializeGillespieState, hydrateGillespiePayload, "varRows"],
  ["ctmp-inhomo", serializeCTMPInhomoState, hydrateCTMPInhomoPayload, "varRows"],
  ["sde", serializeSDEState, hydrateSDEPayload, "components"],
  ["discrete-time", serializeDiscreteTimeState, hydrateDiscreteTimePayload, "components"],
];
const state = {
  varRows: [{ text: "X = 10", color: "#AbC" }],
  paramRows: [{ text: "k = 0.1" }],
  helperRows: [],
  transitions: [{ rate: "k * X", deltas: ["1"] }],
  components: [{
    name: "X", init: 10, drift: "k", diff: "0", color: "#AbC",
    outcomes: [{ offspring: 1, probability: 1 }],
  }],
  tMax: 1, dt: 0.01, numSims: 1, generations: 5,
};

for (const [type, serialize, hydrate, key] of formats) {
  test(`${type}: custom colours survive save validation and reopening without changing the exported model`, () => {
    const payload = validateSavedSimulationPayload(type, serialize(state).payload);
    assert.equal(hydrate(payload)[key][0].color, "#aabbcc");
    const withoutColor = structuredClone(payload);
    delete withoutColor[key][0].color;
    assert.equal(hydrate(withoutColor)[key][0].color, undefined);
    const exported = (data) => createModelExportConfig({
      name: "Colours", simulatorType: type, payload: data,
    }).model;
    assert.deepEqual(exported(payload), exported(withoutColor));
    for (const value of ["red", "#12", "#gggggg", 123, {}]) {
      const invalid = structuredClone(payload);
      invalid[key][0].color = value;
      assert.throws(() => validateSavedSimulationPayload(type, invalid), ValidationError);
    }
  });
}

test("existing plots follow variable identity after renaming and deleting rows, preserving run opacity and data", () => {
  const data = [{ x: 0, y: 1 }, { x: 1, y: 2 }];
  const datasets = [
    { variableId: "x", seriesAlpha: 0.3, data, borderColor: "old" },
    { variableId: "y", seriesAlpha: 1, data, borderColor: "old" },
  ];
  const series = buildVariableSeries([
    { id: "y", name: "Renamed", color: "#f80" },
  ], ["#2563eb"]);
  const result = applySeriesColors(datasets, series);
  assert.equal(result[0], datasets[0], "Removed variable keeps its existing plotted colour");
  assert.equal(result[1].borderColor, "rgba(255, 136, 0, 1)");
  assert.equal(result[1].data, data, "Recolouring must not regenerate the simulation");
  const recolored = applySeriesColors(datasets, buildVariableSeries([
    { id: "x", text: "X = 1", color: "#123456" },
  ], []));
  assert.equal(recolored[0].backgroundColor, "rgba(18, 52, 86, 0.3)");
});

test("default palette colours match swatches even when the editor contains blank rows", () => {
  const palette = ["#123456", "#abcdef"];
  const series = buildVariableSeries([
    { id: "blank", text: "" },
    { id: "x", text: " X = 2 " },
    { id: "y", text: "Y = 1", color: "#f80" },
  ], palette);
  assert.equal(series.get("X").color, "#abcdef");
  assert.equal(series.get("Y").color, "#ff8800");
  assert.equal(getSeriesColor(palette, 2), "#123456");
});
