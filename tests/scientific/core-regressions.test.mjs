import test from "node:test";
import assert from "node:assert/strict";
import { validateModelV2 } from "../../lib/model-v2/index.js";
import { compileModelV2, prepareSimulationRequest, runPreparedSimulation, runSimulationRequest, SummaryAccumulator } from "../../lib/simulation/index.js";
import { sha256Hex } from "../../lib/model-v2/hash.js";
import { parseExpression, resolveExpression } from "../../lib/expressions/index.js";

const ids = {
  x: "11111111-1111-4111-8111-111111111111",
  y: "22222222-2222-4222-8222-222222222222",
  transition: "33333333-3333-4333-8333-333333333333",
  helper: "44444444-4444-4444-8444-444444444444",
  noise: "55555555-5555-4555-8555-555555555555",
  component: "66666666-6666-4666-8666-666666666666",
};

function gillespieModel(rate = "1") {
  return {
    format: "markov-lab/model", version: 2, solverFamily: "gillespie",
    variables: [{ id: ids.x, name: "X", initialValue: 0 }], parameters: [], helpers: [],
    transitions: [{ id: ids.transition, name: "birth", rate, changes: [{ variableId: ids.x, delta: 1 }] }],
    noiseSources: [], sdeComponents: [], correlations: null, plots: [],
    settings: { solver: "gillespie-direct-v2", seed: "9", tMax: 2, runs: 1 },
  };
}

function request(model, runs = 1, retentionMode = "raw") {
  return { version: 1, model, modelHash: sha256Hex(model), solverConfig: { solver: model.settings.solver }, runs, rootSeed: "9", retentionMode, requestedBackend: "js-f64" };
}

test("canonical validation rejects malformed numerical and reference structure", () => {
  const missing = gillespieModel(); delete missing.plots;
  assert.ok(validateModelV2(missing).issues.some((issue) => issue.code === "REQUIRED_ARRAY"));
  const invalidInitial = gillespieModel(); invalidInitial.variables[0].initialValue = Number.NaN;
  assert.ok(validateModelV2(invalidInitial).issues.some((issue) => issue.code === "INVALID_INITIAL_VALUE"));
  const reserved = gillespieModel(); reserved.variables[0].name = "sin";
  assert.ok(validateModelV2(reserved).issues.some((issue) => issue.code === "RESERVED_SYMBOL_NAME"));

  const sde = {
    format: "markov-lab/model", version: 2, solverFamily: "sde",
    variables: [{ id: ids.x, name: "X", initialValue: 0 }], parameters: [], helpers: [], transitions: [],
    noiseSources: [{ id: ids.noise, name: "W" }],
    sdeComponents: [{ id: ids.component, variableId: ids.x, drift: "0", diffusion: [{ noiseId: ids.y, expression: "1" }], boundary: { type: "none" } }],
    correlations: [[1, 0]], plots: [], settings: { solver: "euler-maruyama-v2", seed: "1", tMax: 1, dt: 0, runs: 1 },
  };
  const codes = new Set(validateModelV2(sde).issues.map((issue) => issue.code));
  assert.ok(codes.has("UNKNOWN_NOISE")); assert.ok(codes.has("INVALID_CORRELATION")); assert.ok(codes.has("INVALID_STEP"));
});

test("direct SSA rejects direct and helper-mediated time dependence", () => {
  assert.throws(() => compileModelV2(gillespieModel("1 + t")), (error) => error.code === "TIME_DEPENDENT_DIRECT_SSA");
  const helperModel = gillespieModel("Season(0)");
  helperModel.helpers = [{ id: ids.helper, name: "Season", expression: "1 + time" }];
  assert.throws(() => compileModelV2(helperModel), (error) => error.code === "TIME_DEPENDENT_DIRECT_SSA");
});

test("resolver rejects built-in shadowing even when called outside model validation", () => {
  assert.throws(
    () => resolveExpression(parseExpression("sin(0)"), [], [{ id: ids.helper, name: "sin", expression: "1" }]),
    (error) => error.code === "RESERVED_SYMBOL",
  );
});

test("prepared execution reuses one compiled model across global run indices", () => {
  const model = gillespieModel();
  const prepared = prepareSimulationRequest(request(model, 2));
  const first = runPreparedSimulation(prepared, 0);
  const second = runPreparedSimulation(prepared, 1);
  assert.equal(first.run.runIndex, 0); assert.equal(second.run.runIndex, 1);
  assert.equal(first.run.reachedTime, 2); assert.equal(second.run.reachedTime, 2);
  assert.equal(Object.isFrozen(prepared), true);
});

test("summary retention keeps bounded paths and complete streaming statistics", () => {
  const model = gillespieModel();
  const simulationRequest = request(model, 30, "summary");
  const result = runSimulationRequest(simulationRequest);
  const summary = result.summaries.ensemble;
  assert.equal(result.status, "success");
  assert.equal(result.runs.length, 20);
  assert.equal(summary.grid.length, 501);
  assert.equal(summary.includedRuns, 30);
  assert.equal(summary.excludedRuns, 0);
  assert.equal(summary.variables[0].mean.length, 501);
  assert.equal(summary.variables[0].quantiles["0.5"].length, 501);
  assert.equal(summary.terminal.totalSamples, 30);
  assert.equal(summary.terminal.retainedSamples, 30);
  assert.equal(Object.hasOwn(summary, "samplePaths"), false);
  const again = runSimulationRequest(simulationRequest);
  assert.deepEqual(result.runs.map((run) => run.runIndex), again.runs.map((run) => run.runIndex));
  assert.deepEqual([...summary.terminal.values], [...again.summaries.ensemble.terminal.values]);
});

test("streaming P2 terminal quantiles track a known deterministic sequence", () => {
  const model = gillespieModel();
  const accumulator = new SummaryAccumulator(request(model, 101, "summary"), 101);
  for (let runIndex = 0; runIndex <= 100; runIndex++) accumulator.add({
    status: "success", warnings: [],
    run: { runIndex, reachedTime: 2, eventCount: 0, stepCount: 0, times: Float64Array.of(0, 2), values: Float64Array.of(0, runIndex), stateCount: 1, transitionIds: [], termination: { kind: "completed", code: "T_MAX", message: "done" } },
  });
  const summary = accumulator.finish();
  assert.ok(Math.abs(summary.terminal.quantiles["0.5"][0] - 50) < 2);
  assert.equal(summary.samplePaths.length, 20);
});
