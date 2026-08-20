import test from "node:test";
import assert from "node:assert/strict";
import { generateCsvText, provenanceJson } from "../../lib/client-exports/csv.js";

test("CSV is generated lazily from full typed run buffers", async () => {
  const csv = await generateCsvText({
    variableNames: ["A", "B, labelled"],
    runs: [{ runIndex: 0, stateCount: 2, times: Float64Array.from([0, 1]), values: Float64Array.from([1, 2, 3, 4]) }],
  });
  assert.equal(csv, 'run,t,A,"B, labelled"\n0,0,1,2\n0,1,3,4\n');
});

test("provenance packages identify their format", () => {
  const parsed = JSON.parse(provenanceJson({ seed: "42", backend: "js", precision: "f64" }));
  assert.equal(parsed.format, "markov-lab/provenance");
  assert.equal(parsed.seed, "42");
});
