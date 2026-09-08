import test from "node:test";
import assert from "node:assert/strict";
import { DiscreteTimeComponent, DiscreteTimeStepper } from "../components/simulators/discrete-time/engine.js";
import { normalizeDiscreteComponent, parseDiscreteComponents, updateOutcomeProbability } from "../lib/discrete-time/model.js";
import { hydrateDiscreteTimePayload, serializeDiscreteTimeState } from "../lib/saved-simulations/serializers.js";
import { validateSavedSimulationPayload, ValidationError } from "../lib/saved-simulations/validators.js";
import { createModelExportConfig } from "../lib/exports/config.js";

const branching = { name: "Population", init: 3, outcomes: [{ offspring: 0, probability: 0.45 }, { offspring: 2, probability: 0.55 }] };
const walk = { name: "X", init: 0, mode: "increments", outcomes: [{ change: 1, probability: 0.5 }, { change: -1, probability: 0.5 }] };
const matrix = { name: "State", init: -4, mode: "matrix", states: [-4, 9, 100], matrix: [[0, 1, 0], [0, 0, 1], [1, 0, 0]] };
const run = (components, steps = 4, random = () => 0.25) => new DiscreteTimeStepper(
  components.map((component) => new DiscreteTimeComponent(component.name, component.outcomes, component)),
  components.map((component) => component.init), steps, random,
).run();
const payload = (components) => ({ components, settings: { generations: 4, numSims: 1 } });

test("legacy models remain branching processes with extinction absorbing", () => {
  assert.equal(normalizeDiscreteComponent(branching).mode, "branching");
  assert.deepEqual(run([branching]).history, [[3], [6], [12], [24], [48]]);
  assert.deepEqual(run([branching], 3, () => 0.9).history, [[3], [0], [0], [0]]);
});

test("a random walk draws once per step, crosses zero and preserves negative states", () => {
  const draws = [0.9, 0.9, 0.1, 0.1];
  assert.deepEqual(run([walk], 4, () => draws.shift()).history, [[0], [-1], [-2], [-1], [0]]);
  assert.equal(draws.length, 0);
});

test("p = 0 and p = 1 give deterministic walks", () => {
  for (const p of [0, 1]) {
    const component = { ...walk, outcomes: [{ change: 1, probability: p }, { change: -1, probability: 1 - p }] };
    assert.deepEqual(run([component], 3).history.flat(), p ? [0, 1, 2, 3] : [0, -1, -2, -3]);
  }
});

test("arbitrary jumps and a holding probability are supported", () => {
  const component = { ...walk, init: -3, outcomes: [{ change: -2, probability: 0.2 }, { change: 0, probability: 0.3 }, { change: 5, probability: 0.5 }] };
  const draws = [0.1, 0.3, 0.8];
  assert.deepEqual(run([component], 3, () => draws.shift()).history.flat(), [-3, -5, -5, 0]);
});

test("a biased walk has the expected drift with a fixed random stream", () => {
  let seed = 1234;
  const random = () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 2 ** 32);
  const component = { ...walk, outcomes: [{ change: 1, probability: 0.75 }, { change: -1, probability: 0.25 }] };
  const last = run([component], 10000, random).history.at(-1)[0];
  assert.ok(Math.abs(last - 5000) < 350, `Unexpected final position ${last}`);
});

test("matrix rows are current states and columns are next states", () => {
  assert.deepEqual(run([matrix], 4).history.flat(), [-4, 9, 100, -4, 9]);
});

test("a matrix can have absorbing states and use asymmetric probabilities", () => {
  const component = { ...matrix, states: [-4, 9], matrix: [[0.2, 0.8], [0, 1]] };
  assert.deepEqual(run([component], 3, () => 0.3).history.flat(), [-4, 9, 9, 9]);
});

test("multiple variables can use different transition types", () => {
  assert.deepEqual(run([branching, walk, matrix], 2).history, [[3, 0, -4], [6, 1, 9], [12, 2, 100]]);
});

test("invalid probabilities and states fail before simulating", () => {
  const invalid = [
    { ...walk, init: 0.5 },
    { ...branching, init: -1 },
    { ...walk, mode: "unknown" },
    { ...walk, outcomes: [{ change: 1.5, probability: 1 }] },
    { ...walk, outcomes: [{ change: 1, probability: 0.3 }, { change: 1, probability: 0.7 }] },
    { ...walk, outcomes: [{ change: 1, probability: 0.8 }] },
    { ...walk, outcomes: [{ change: 1, probability: 1.1 }, { change: 0, probability: -0.1 }] },
    { ...matrix, init: 0 },
    { ...matrix, states: [-4, -4, 100] },
    { ...matrix, matrix: [[1, 0, 0]] },
    { ...matrix, matrix: [[0.2, 0.2, 0.2], [0, 1, 0], [0, 0, 1]] },
  ];
  for (const component of invalid) {
    assert.throws(() => run([component]));
    assert.throws(() => validateSavedSimulationPayload("discrete-time", payload([component])), ValidationError);
  }
});

test("fractional step counts and walks exceeding either state bound fail", () => {
  assert.throws(() => run([walk], 2.5), /Generations/);
  assert.throws(() => run([{ ...walk, init: 1000000 }]), /integer range/);
  assert.throws(() => run([{ ...walk, init: -1000000 }], 1, () => 0.9), /integer range/);
});

test("linked probabilities preserve a sum of one from either numeric field", () => {
  const outcomes = walk.outcomes;
  assert.deepEqual(updateOutcomeProbability(outcomes, 0, "0.731", true).map((outcome) => outcome.probability), ["0.731", "0.269"]);
  assert.deepEqual(updateOutcomeProbability(outcomes, 1, "1", true).map((outcome) => outcome.probability), ["0", "1"]);
  assert.equal(updateOutcomeProbability(outcomes, 0, "0.2", false)[1].probability, 0.5);
  assert.equal(updateOutcomeProbability(outcomes, 0, "", true)[1].probability, 0.5);
  assert.equal(updateOutcomeProbability([...outcomes, { change: 0, probability: 0 }], 0, "0.3", true)[1].probability, 0.5);
});

for (const component of [branching, walk, matrix]) {
  test(`${component.mode ?? "legacy branching"} survives hydration, saving, validation and JSON export`, () => {
    const original = { ...component, useSlider: true, noteEnabled: true, noteLabel: "Example" };
    const editor = hydrateDiscreteTimePayload(payload([original]));
    const saved = serializeDiscreteTimeState({ ...editor, ...editor.settings });
    const validated = validateSavedSimulationPayload("discrete-time", saved.payload);
    assert.deepEqual(validated.components[0], normalizeDiscreteComponent(original));
    const reopened = hydrateDiscreteTimePayload(validated);
    assert.notEqual(reopened.components[0].id, editor.components[0].id);
    assert.equal(reopened.components[0].useSlider, true);
    assert.deepEqual(run(parseDiscreteComponents(reopened.components)).history, run([original]).history);
    const exported = createModelExportConfig({ name: "Example", simulatorType: "discrete-time", payload: validated });
    assert.equal(exported.model.components[0].mode, original.mode ?? "branching");
    assert.equal(exported.model.components[0].label, "Example");
    if (original.mode === "matrix") {
      assert.deepEqual(exported.model.components[0].matrix, matrix.matrix);
      assert.deepEqual(exported.model.components[0].states, matrix.states);
    } else assert.deepEqual(exported.model.components[0].outcomes, original.outcomes);
    assert.ok(!JSON.stringify(saved).includes('"id"'));
  });
}

test("blank numeric fields cannot be silently saved as zeros", () => {
  for (const invalid of [
    { ...walk, init: "" },
    { ...walk, outcomes: [{ change: "", probability: 1 }] },
    { ...walk, outcomes: [{ change: 0, probability: 1 }, { change: 1, probability: "" }] },
    { ...matrix, matrix: [["", 1, 0], [0, 0, 1], [1, 0, 0]] },
  ]) {
    const saved = serializeDiscreteTimeState({ components: [invalid], generations: 4, numSims: 1 });
    assert.throws(() => validateSavedSimulationPayload("discrete-time", saved.payload), /required/);
  }
});

test("duplicate variable names are rejected by both run and save validation", () => {
  assert.throws(() => parseDiscreteComponents([walk, walk]), /unique/);
  assert.throws(() => validateSavedSimulationPayload("discrete-time", payload([walk, walk])), /unique/);
});
