import test from "node:test";
import assert from "node:assert/strict";
import { sanitizePerformanceTelemetry } from "../../lib/telemetry/performance.js";

test("performance telemetry strips all model and identity content", () => {
  const output = sanitizePerformanceTelemetry({
    route: "sde", operation: "simulate", backend: "js", precision: "f64",
    durationMs: 200, runs: 10, stateCount: 2, recordedPoints: 100,
    seed: "42", modelName: "private", expression: "secret", userId: "person", states: [1, 2],
  });
  assert.deepEqual(Object.keys(output).sort(), ["backend", "completed", "durationMs", "operation", "precision", "recordedPoints", "route", "runs", "schemaVersion", "stateCount"].sort());
  assert.equal(JSON.stringify(output).includes("private"), false);
});
