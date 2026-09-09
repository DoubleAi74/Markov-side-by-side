import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMeanDatasets,
  buildPairDatasets,
  listVariablePairs,
  sampleStep,
} from "../lib/extra-graphs.js";

test("three variables produce three pair options", () => {
  const pairs = listVariablePairs(["A", "B", "C"]);
  assert.deepEqual(
    pairs.map((pair) => pair.label),
    ["A by B", "A by C", "B by C"],
  );
});

test("two variables produce one pair option and blanks are ignored", () => {
  assert.equal(listVariablePairs(["Prey", "Pred"]).length, 1);
  assert.equal(listVariablePairs(["Only"]).length, 0);
  assert.equal(listVariablePairs(["A", "", "B"]).length, 1);
});

test("step sampling holds the last value until the next event", () => {
  const times = [0, 1, 4];
  const history = [[10], [20], [30]];
  assert.equal(sampleStep(times, history, 0, 0), 10);
  assert.equal(sampleStep(times, history, 0, 0.9), 10);
  assert.equal(sampleStep(times, history, 0, 1), 20);
  assert.equal(sampleStep(times, history, 0, 3.9), 20);
  assert.equal(sampleStep(times, history, 0, 4), 30);
});

test("pair datasets plot one trajectory per run in x-y space", () => {
  const datasets = buildPairDatasets({
    runs: [
      { times: [0, 1], history: [[1, 10], [2, 20]] },
      { times: [0, 1], history: [[3, 30], [4, 40]] },
    ],
    xIndex: 0,
    yIndex: 1,
    color: "#2563eb",
  });
  assert.equal(datasets.length, 2);
  assert.deepEqual(datasets[0].data, [
    { x: 1, y: 10 },
    { x: 2, y: 20 },
  ]);
  assert.deepEqual(datasets[1].data, [
    { x: 3, y: 30 },
    { x: 4, y: 40 },
  ]);
  assert.equal(datasets[0].pathStroke, true);
  assert.equal(
    buildPairDatasets({
      runs: [{ times: [0], history: [[1, 2]] }],
      xIndex: 0,
      yIndex: 1,
      color: "#2563eb",
    })[0].pathStroke,
    false,
  );
});

test("mean datasets average aligned runs and need at least two runs", () => {
  assert.deepEqual(
    buildMeanDatasets({
      runs: [{ times: [0, 1], history: [[2], [4]] }],
      variableNames: ["A"],
    }),
    [],
  );

  const datasets = buildMeanDatasets({
    runs: [
      { times: [0, 2], history: [[0], [10]] },
      { times: [0, 2], history: [[2], [20]] },
    ],
    variableNames: ["A"],
    legendLabels: ["A"],
    colors: ["#111"],
    interpolate: "step",
  });
  assert.equal(datasets.length, 1);
  assert.deepEqual(datasets[0].data, [
    { x: 0, y: 1 },
    { x: 2, y: 15 },
  ]);
});
