import test from "node:test";
import assert from "node:assert/strict";
import { centredSensitivity, runParameterSweep } from "../../lib/analysis/sweep.js";
import { gpuCalibration, wasmAutoDecision, webGpuAvailability } from "../../lib/backends/gates.js";

test("one-dimensional sweep defaults to 21 points and reuses the root seed", async () => {
  const seeds = [];
  const result = await runParameterSweep({
    model: { parameters: [{ id: "rate", value: 1 }] },
    definition: { axes: [{ parameterId: "rate", min: 0, max: 2 }], replicates: 2 },
    rootSeed: "42",
    simulateCell: async ({ model, rootSeed }) => {
      seeds.push(rootSeed);
      return [model.parameters[0].value, model.parameters[0].value];
    },
  });
  assert.equal(result.cells.length, 21);
  assert.ok(seeds.every((seed) => seed === "42"));
  assert.equal(result.cells[10].mean, 1);
});

test("centred finite differences recover a quadratic derivative", async () => {
  const result = await centredSensitivity({
    model: { parameters: [{ id: "p", value: 3 }] },
    parameterId: "p",
    value: 3,
    evaluate: async (model) => model.parameters[0].value ** 2,
  });
  assert.ok(Math.abs(result.derivative - 6) < 1e-10);
});

test("WASM and WebGPU stay behind their evidence gates", () => {
  assert.equal(wasmAutoDecision({ conformant: true, stressSpeedup: 1.4, memoryRatio: 1, smallJobRatio: 1 }).accepted, false);
  assert.equal(wasmAutoDecision({ conformant: true, stressSpeedup: 1.6, memoryRatio: 1.1, smallJobRatio: 1.05 }).accepted, true);
  const calibration = gpuCalibration({ mean: 10, variance: 4 }, { mean: 10.1, variance: 4.2 });
  const gpu = webGpuAvailability({ supported: true, stateUpdates: 20_000_000, measuredSpeedup: 3.2, calibration });
  assert.equal(gpu.available, true);
  assert.equal(gpu.autoEligible, false);
});
