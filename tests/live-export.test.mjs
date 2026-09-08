import test from "node:test";
import assert from "node:assert/strict";
import {
  createLiveConfigExport,
  createLiveNativeBundleExport,
} from "../lib/exports/live.js";
import { NativeExportUnsupportedError } from "../lib/exports/native-bundle.js";
import { validateLiveExportInput } from "../lib/saved-simulations/validators.js";

const gillespieBody = {
  name: "",
  simulatorType: "gillespie",
  payloadVersion: 1,
  payload: {
    varRows: [{ text: "A = 10" }],
    paramRows: [{ text: "k = 0.1" }],
    transitions: [{ rate: "k * A", deltas: ["-1"] }],
    settings: { tMax: 5, numSims: 1 },
  },
};

test("live export does not require a saved model or name", () => {
  const input = validateLiveExportInput(gillespieBody);
  assert.equal(input.name, "Untitled Model");
  assert.equal(input.simulatorType, "gillespie");

  const exported = createLiveConfigExport(gillespieBody);
  assert.equal(exported.filename, "untitled-model.json");
  const parsed = JSON.parse(exported.body);
  assert.equal(parsed.name, "Untitled Model");
  assert.equal(parsed.simulatorType, "gillespie");
  assert.deepEqual(parsed.model.variables, [{ name: "A", initial: 10 }]);
});

test("live native bundle can be built from unsaved editor state", async () => {
  const exported = await createLiveNativeBundleExport({
    ...gillespieBody,
    name: "Scratch Lotka",
  });
  assert.equal(exported.filename, "scratch-lotka-native-bundle.zip");
  assert.ok(exported.body.length > 100);
});

test("discrete-time live export still rejects the C++ bundle", async () => {
  await assert.rejects(
    () =>
      createLiveNativeBundleExport({
        name: "Walk",
        simulatorType: "discrete-time",
        payloadVersion: 1,
        payload: {
          components: [
            {
              name: "X",
              init: 0,
              mode: "increments",
              outcomes: [
                { change: 1, probability: 0.5 },
                { change: -1, probability: 0.5 },
              ],
            },
          ],
          settings: { generations: 10, numSims: 1 },
        },
      }),
    NativeExportUnsupportedError,
  );
});
