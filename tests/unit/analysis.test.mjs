import test from "node:test";
import assert from "node:assert/strict";
import {
  createCommonGrid,
  decimateContinuous,
  decimateStep,
  preflightRawResult,
  sampleLinear,
  sampleRightContinuous,
  summarizeEnsemble,
} from "../../lib/analysis/index.js";

test("continuous decimation is bounded, deterministic, and leaves raw buffers untouched", () => {
  const times = Float64Array.from({ length: 10_000 }, (_, index) => index / 10);
  const values = Float64Array.from(times, (time) => Math.sin(time));
  const before = Buffer.from(values.buffer).toString("hex");
  const first = decimateContinuous(times, values, 500);
  const second = decimateContinuous(times, values, 500);
  assert.ok(first.times.length <= 500);
  assert.deepEqual(first, second);
  assert.equal(Buffer.from(values.buffer).toString("hex"), before);
  assert.equal(first.times[0], times[0]);
  assert.equal(first.times.at(-1), times.at(-1));
});

test("step decimation preserves both sides of the largest jump", () => {
  const times = Float64Array.from({ length: 100 }, (_, index) => index);
  const values = Float64Array.from({ length: 100 }, (_, index) => index < 50 ? 0 : 10);
  const result = decimateStep(times, values, 10);
  assert.ok(Array.from(result.times).includes(49));
  assert.ok(Array.from(result.times).includes(50));
});

test("discrete sampling is right-continuous and continuous sampling interpolates", () => {
  const times = Float64Array.from([0, 1, 3]);
  const values = Float64Array.from([2, 4, 10]);
  assert.equal(sampleRightContinuous(times, values, 2), 4);
  assert.equal(sampleLinear(times, values, 2), 7);
});

test("ensemble summaries report included and excluded runs", () => {
  const runs = [
    { times: Float64Array.from([0, 1]), values: Float64Array.from([0, 2]) },
    { times: Float64Array.from([0, 1]), values: Float64Array.from([2, 4]) },
    { times: new Float64Array(), values: new Float64Array() },
  ];
  const summary = summarizeEnsemble(runs, createCommonGrid(1, 3));
  assert.equal(summary.includedRuns, 2);
  assert.equal(summary.excludedRuns, 1);
  assert.deepEqual(Array.from(summary.mean), [1, 2, 3]);
});

test("raw-result preflight requires an explicit alternative above the device budget", () => {
  const result = preflightRawResult({ runs: 1000, pointsPerRun: 100_000, variables: 4 }, 2);
  assert.equal(result.allowed, false);
  assert.ok(result.choices.includes("summary"));
  assert.ok(result.estimatedBytes > result.budgetBytes);
});
