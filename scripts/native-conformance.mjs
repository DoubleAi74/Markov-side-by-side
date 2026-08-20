import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { deterministicEntityId } from "../lib/model-v2/ids.js";
import { sha256Hex } from "../lib/model-v2/hash.js";
import { runSimulationRequest } from "../lib/simulation/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(path.join(tmpdir(), "markov-native-conformance-"));
const config = path.join(root, "tests/fixtures/native-gillespie.json");
const wrapper = path.join(root, "templates/native/run_markov_native.py");

function runNative(output, threads) {
  const result = spawnSync("python3", [wrapper, "--config", config, "--output", output, "--threads", String(threads)], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Native runner failed.");
}

function parseCsv(text) {
  return text.trim().split(/\r?\n/).slice(1).map((line) => {
    const [run, time, value] = line.split(",");
    return { run: Number(run), time: Number(time), value: Number(value) };
  });
}

try {
  const singlePath = path.join(temporary, "single.csv"), parallelPath = path.join(temporary, "parallel.csv");
  runNative(singlePath, 1); runNative(parallelPath, 4);
  const single = parseCsv(await readFile(singlePath, "utf8"));
  const parallel = parseCsv(await readFile(parallelPath, "utf8"));
  assert.deepEqual(parallel, single, "native trajectories must not depend on thread scheduling");

  const namespace = "native-conformance";
  const variableId = deterministicEntityId(namespace, "variable", 0, "X");
  const parameterId = deterministicEntityId(namespace, "parameter", 0, "lambda");
  const transitionId = deterministicEntityId(namespace, "transition", 0, "birth");
  const model = {
    format: "markov-lab/model", version: 2, solverFamily: "gillespie",
    variables: [{ id: variableId, name: "X", initialValue: 0 }],
    parameters: [{ id: parameterId, name: "lambda", value: 1.25 }], helpers: [],
    transitions: [{ id: transitionId, name: "birth", rate: "lambda", changes: [{ variableId, delta: 1 }] }],
    noiseSources: [], sdeComponents: [], correlations: null,
    settings: { solver: "gillespie-direct-v2", tMax: 2, runs: 4, seed: "123456789" }, plots: [],
  };
  const request = { version: 1, model, modelHash: sha256Hex(model), solverConfig: model.settings, runs: 4, rootSeed: model.settings.seed, retentionMode: "raw", requestedBackend: "js-f64" };
  const browserReference = runSimulationRequest(request).runs.flatMap((run) => Array.from({ length: run.times.length }, (_, index) => ({ run: run.runIndex, time: run.times[index], value: run.values[index] })));
  assert.deepEqual(single, browserReference, "native and JavaScript f64 seeded trajectories must agree");
  process.stdout.write(`${JSON.stringify({ nativeRows: single.length, threadDeterministic: true, jsF64Conformant: true })}\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
