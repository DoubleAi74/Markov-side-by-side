import test from "node:test";
import assert from "node:assert/strict";
import { deterministicEntityId, sha256Hex } from "../../lib/model-v2/index.js";
import { createRunRng, runGillespie, runIntegratedHazardCTMP, runPiecewiseFrozenCTMP, runSDE, runSimulationRequest, validateMilsteinModel, validateSimulationResult } from "../../lib/simulation/index.js";

const id = (kind, index, name = "") => deterministicEntityId("solver-fixture", kind, index, name);
const xId = id("variable", 0, "X"), birthId = id("transition", 0, "birth");

function baseCTMC(rate = "1") {
  return {
    format: "markov-lab/model", version: 2, solverFamily: "gillespie",
    variables: [{ id: xId, name: "X", initialValue: 0 }], parameters: [], helpers: [],
    transitions: [{ id: birthId, name: "birth", rate, changes: [{ variableId: xId, delta: 1 }] }],
    noiseSources: [], sdeComponents: [], correlations: null, plots: [], settings: { solver: "gillespie-direct-v2", seed: "10", tMax: 2, runs: 1 },
  };
}

test("Gillespie is deterministic, reaches tMax, and reports invalid transitions", () => {
  const model = baseCTMC();
  model.transitions[0].rate = 1;
  const a = runGillespie(model, { rng: createRunRng("12", 0), tMax: 3 });
  const b = runGillespie(model, { rng: createRunRng("12", 0), tMax: 3 });
  assert.deepEqual([...a.run.times], [...b.run.times]); assert.deepEqual([...a.run.values], [...b.run.values]);
  assert.equal(a.run.reachedTime, 3); assert.ok(a.run.times.every((value, i, all) => i === 0 || value > all[i - 1]));
  const bad = baseCTMC(); bad.variables[0].initialValue = 0; bad.transitions[0].changes[0].delta = -1;
  bad.transitions[0].rate = 1;
  const outcome = runGillespie(bad, { rng: createRunRng("1", 0), tMax: 10 });
  assert.equal(outcome.status, "failed"); assert.equal(outcome.error.code, "INVALID_STATE_TRANSITION");
});

test("negative propensity is a visible structured error", () => {
  const model = baseCTMC(-1);
  const outcome = runGillespie(model, { rng: createRunRng("1", 0), tMax: 1 });
  assert.equal(outcome.status, "failed"); assert.equal(outcome.error.code, "NEGATIVE_PROPENSITY");
});

test("piecewise and integrated CTMP allow multiple events and end exactly", () => {
  const model = baseCTMC((_state, time) => 5 + time);
  const frozen = runPiecewiseFrozenCTMP(model, { rng: createRunRng("7", 0), tMax: 2, maxStep: 0.5 });
  const integrated = runIntegratedHazardCTMP(model, { rng: createRunRng("7", 0), tMax: 2, tolerance: 1e-8 });
  assert.equal(frozen.status, "success"); assert.equal(integrated.status, "success");
  assert.equal(frozen.run.reachedTime, 2); assert.equal(integrated.run.reachedTime, 2);
  assert.ok(frozen.run.eventCount > 1); assert.ok(integrated.run.eventCount > 1);
});

function sdeModel() {
  const yId = id("variable", 1, "Y"), w1 = id("noise", 0, "W1"), w2 = id("noise", 1, "W2");
  return {
    format: "markov-lab/model", version: 2, solverFamily: "sde",
    variables: [{ id: xId, name: "X", initialValue: 0 }, { id: yId, name: "Y", initialValue: 0 }], parameters: [], helpers: [], transitions: [],
    noiseSources: [{ id: w1, name: "W1" }, { id: w2, name: "W2" }], correlations: [[1, 0.75], [0.75, 1]],
    sdeComponents: [
      { id: id("component", 0), variableId: xId, drift: "0", diffusion: [{ noiseId: w1, expression: "1" }, { noiseId: w2, expression: "0" }], boundary: { type: "none" } },
      { id: id("component", 1), variableId: yId, drift: "0", diffusion: [{ noiseId: w1, expression: "0" }, { noiseId: w2, expression: "1" }], boundary: { type: "none" } },
    ], plots: [], settings: { solver: "euler-maruyama-v2", seed: "10", tMax: 1, dt: 0.03, runs: 1 },
  };
}

test("Euler-Maruyama supports correlated diffusion and exact final partial step", () => {
  const model = sdeModel();
  // Direct solver accepts trusted numeric coefficient specs; compiled runner covers bytecode below.
  model.sdeComponents.forEach((component) => component.diffusion.forEach((entry) => { entry.expression = Number(entry.expression); }));
  model.sdeComponents.forEach((component) => { component.drift = 0; });
  const outcome = runSDE(model, { rng: createRunRng("4", 0), tMax: 1, dt: 0.03 });
  assert.equal(outcome.status, "success"); assert.equal(outcome.run.reachedTime, 1); assert.equal(outcome.run.times.at(-1), 1);
  assert.ok(outcome.run.values.every(Number.isFinite));
});

test("aggregate request API compiles bytecode and records provenance", () => {
  const model = baseCTMC("1");
  const request = { version: 1, model, modelHash: sha256Hex(model), solverConfig: { solver: "gillespie-direct-v2" }, runs: 3, rootSeed: "123", retentionMode: "raw", requestedBackend: "js-f64" };
  const result = runSimulationRequest(request);
  assert.equal(result.status, "success"); assert.equal(result.runs.length, 3);
  assert.equal(result.provenance.precision, "f64"); assert.equal(result.provenance.seed, "123");
  assert.equal(validateSimulationResult(result).ok, true);
  const again = runSimulationRequest(request);
  assert.deepEqual(result.runs.map((run) => [...run.values]), again.runs.map((run) => [...run.values]));
  const isolated = runSimulationRequest({ ...request, runs: 1 }, { runIndices: [3] });
  const full = runSimulationRequest({ ...request, runs: 4 });
  assert.equal(isolated.runs[0].runIndex, 3);
  assert.deepEqual([...isolated.runs[0].times], [...full.runs[3].times]);
  assert.deepEqual([...isolated.runs[0].values], [...full.runs[3].values]);
});

test("Gillespie homogeneous Poisson ensemble has the expected first two moments", () => {
  const model = baseCTMC(2);
  const samples = [];
  for (let runIndex = 0; runIndex < 2000; runIndex++) {
    const result = runGillespie(model, { rng: createRunRng("998", runIndex), runIndex, tMax: 2 });
    samples.push(result.run.values.at(-1));
  }
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (samples.length - 1);
  assert.ok(Math.abs(mean - 4) < 0.15, `mean=${mean}`);
  assert.ok(Math.abs(variance - 4) < 0.35, `variance=${variance}`);
});

test("correlated SDE increments reproduce configured covariance", () => {
  const model = sdeModel();
  model.sdeComponents.forEach((component) => { component.drift = 0; component.diffusion.forEach((entry) => { entry.expression = Number(entry.expression); }); });
  const xs = [], ys = [];
  for (let runIndex = 0; runIndex < 3000; runIndex++) {
    const result = runSDE(model, { rng: createRunRng("551", runIndex), tMax: 1, dt: 1 });
    xs.push(result.run.values[2]); ys.push(result.run.values[3]);
  }
  const mx = xs.reduce((a,b)=>a+b,0)/xs.length, my = ys.reduce((a,b)=>a+b,0)/ys.length;
  const covariance = xs.reduce((sum,x,i)=>sum+(x-mx)*(ys[i]-my),0)/(xs.length-1);
  assert.ok(Math.abs(covariance - 0.75) < 0.07, `covariance=${covariance}`);
});

test("Milstein is restricted to independent diagonal noise with derivatives", () => {
  const model = sdeModel();
  assert.equal(validateMilsteinModel(model).ok, false);
  model.correlations = [[1, 0], [0, 1]];
  model.sdeComponents.forEach((component, i) => { component.diffusionDerivative = 0; component.diffusion.forEach((entry, j) => { entry.expression = i === j ? 1 : 0; }); component.drift = 0; });
  assert.equal(validateMilsteinModel(model).ok, true);
  const result = runSDE(model, { rng: createRunRng("1", 0), tMax: 1, dt: 0.1, method: "milstein-diagonal-v1" });
  assert.equal(result.status, "success");
  const invalidCorrelation = sdeModel();
  invalidCorrelation.correlations = [[1, 1, 0], [1, 1, 1], [0, 1, 1]];
  invalidCorrelation.noiseSources.push({ id: id("noise", 3), name: "W3" });
  invalidCorrelation.sdeComponents.forEach((component) => component.diffusion.push({ noiseId: invalidCorrelation.noiseSources[2].id, expression: 0 }));
  const invalid = runSDE(invalidCorrelation, { rng: createRunRng("1", 0), tMax: 1, dt: 0.1 });
  assert.equal(invalid.error.code, "INVALID_CORRELATION");
});

test("aggregate API compiles and runs an SDE request", () => {
  const model = sdeModel();
  const request = { version: 1, model, modelHash: sha256Hex(model), solverConfig: { solver: "euler-maruyama-v2" }, runs: 1, rootSeed: "11", retentionMode: "raw", requestedBackend: "js-f64" };
  const result = runSimulationRequest(request);
  assert.equal(result.status, "success"); assert.equal(result.runs[0].reachedTime, 1);
});
