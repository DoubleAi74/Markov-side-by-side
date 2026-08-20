import test from "node:test";
import assert from "node:assert/strict";
import { SimulationCoordinator, defaultPoolSize, preflightSimulationRequest, SimulationPreflightError } from "../../lib/execution/coordinator.js";

const variableId = "11111111-1111-4111-8111-111111111111";
const transitionId = "22222222-2222-4222-8222-222222222222";

function request(runs = 20, retentionMode = "raw") {
  return {
    version: 1,
    model: {
      format: "markov-lab/model", version: 2, solverFamily: "gillespie",
      variables: [{ id: variableId, name: "X", initialValue: 0 }], parameters: [], helpers: [],
      transitions: [{ id: transitionId, name: "birth", rate: "1", changes: [{ variableId, delta: 1 }] }],
      noiseSources: [], sdeComponents: [], correlations: null, plots: [],
      settings: { solver: "gillespie-direct-v2", seed: "7", tMax: 1, runs },
    },
    modelHash: "0".repeat(64), solverConfig: { solver: "gillespie-direct-v2" }, runs, rootSeed: "7", retentionMode, requestedBackend: "js-f64",
  };
}

class FakeWorker {
  constructor(delay = 0) { this.delay = delay; this.terminated = false; this.request = null; this.prepareCount = 0; }
  postMessage(message) {
    if (message.type === "prepare") {
      this.prepareCount++;
      this.request = message.request;
      queueMicrotask(() => this.onmessage({ data: { type: "ready", jobId: message.jobId } }));
    } else if (message.type === "run") {
      const run = {
        runIndex: message.runIndex, reachedTime: 1, eventCount: message.runIndex, stepCount: 0,
        times: Float64Array.of(0, 1), values: Float64Array.of(0, message.runIndex), stateCount: 1,
        transitionIds: [], termination: { kind: "completed", code: "T_MAX", message: "done" },
      };
      setTimeout(() => this.onmessage({ data: { type: "result", jobId: message.jobId, runIndex: message.runIndex, packet: { status: "success", run, warnings: [] } } }), this.delay);
    } else if (message.type === "cancel") {
      queueMicrotask(() => this.onmessage({ data: { type: "cancelled", jobId: message.jobId } }));
    }
  }
  terminate() { this.terminated = true; }
}

test("worker pool sizing follows the bounded device policy", () => {
  assert.equal(defaultPoolSize(10, { hardwareConcurrency: 8 }), 4);
  assert.equal(defaultPoolSize(10, { hardwareConcurrency: 8, constrained: true }), 2);
  assert.equal(defaultPoolSize(1, { hardwareConcurrency: 8 }), 1);
  assert.equal(defaultPoolSize(10, { hardwareConcurrency: 1 }), 1);
});

test("run ordering is deterministic across worker counts and each worker prepares once", async () => {
  async function execute(hardwareConcurrency) {
    const workers = [];
    const coordinator = new SimulationCoordinator({ hardwareConcurrency, workerFactory: () => { const worker = new FakeWorker(Math.random() * 4); workers.push(worker); return worker; } });
    const runs = (await coordinator.run(request()).promise).runs;
    assert.ok(workers.every((worker) => worker.prepareCount === 1));
    return runs;
  }
  assert.deepEqual(await execute(2), await execute(8));
});

test("summary-mode worker aggregation retains bounded paths and canonical statistics", async () => {
  const workers = [];
  const coordinator = new SimulationCoordinator({ hardwareConcurrency: 8, workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker; } });
  const result = await coordinator.run(request(50, "summary")).promise;
  assert.equal(result.status, "success");
  assert.equal(result.runs.length, 20);
  assert.equal(result.summaries.ensemble.grid.length, 501);
  assert.equal(result.summaries.ensemble.includedRuns, 50);
  assert.equal(result.summaries.ensemble.terminal.totalSamples, 50);
  assert.ok(workers.every((worker) => worker.prepareCount === 1));
});

test("cancellation cooperates and returns a canonical partial envelope", async () => {
  const coordinator = new SimulationCoordinator({ hardwareConcurrency: 4, workerFactory: () => new FakeWorker(20), cancelTimeoutMs: 100 });
  const job = coordinator.run(request(100));
  assert.equal(job.cancel(), true);
  const result = await job.promise;
  assert.equal(result.status, "cancelled");
  assert.equal(result.execution.forcedCancellation, false);
  assert.equal(result.provenance.completionStatus, "cancelled");
});

test("resource preflight exposes and enforces the raw memory decision", () => {
  const large = request(100_000);
  const preflight = preflightSimulationRequest(large, { pointsPerRun: 100_000, deviceMemoryGiB: 2 });
  assert.equal(preflight.allowed, false);
  const coordinator = new SimulationCoordinator({ workerFactory: () => new FakeWorker(), deviceMemoryGiB: 2 });
  assert.throws(() => coordinator.run(large, { pointsPerRun: 100_000 }), SimulationPreflightError);
  assert.doesNotThrow(() => coordinator.run(large, { pointsPerRun: 100_000, resourceConsent: true }).cancel());
});
