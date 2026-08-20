import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCreateSavedSimulationInput,
  validateSavedSimulationPreviewUploadInput,
  validateUpdateSavedSimulationInput,
} from "../../lib/saved-simulations/validators.js";
import { validateCreateRunInput } from "../../lib/run-history/validators.js";

const legacyPayload = {
  varRows: [{ text: "X = 1" }],
  paramRows: [],
  transitions: [{ rate: "1", deltas: ["1"] }],
  settings: { tMax: 5, numSims: 1 },
};

test("saved models default to public", () => {
  const input = validateCreateSavedSimulationInput({
    name: "Birth process", simulatorType: "gillespie", payloadVersion: 1, payload: legacyPayload,
  });
  assert.equal(input.visibility, "public");
});

test("PATCH requires optimistic concurrency and rejects slug mutation", () => {
  assert.throws(() => validateUpdateSavedSimulationInput({ name: "new" }), /expectedRevision/);
  assert.throws(() => validateUpdateSavedSimulationInput({ expectedRevision: 1, slug: "changed" }), /immutable/);
});

test("canonical v2 UUID references validate", () => {
  const variableId = "74ca5ba6-c37c-51ce-a4f4-86f126bbe0c7";
  const transitionId = "963ba513-cd31-5ad7-ae83-d6cb70534ed8";
  const payload = {
    format: "markov-lab/model", version: 2, solverFamily: "gillespie",
    variables: [{ id: variableId, name: "X", initialValue: 1 }],
    parameters: [], helpers: [],
    transitions: [{ id: transitionId, rate: "1", changes: [{ variableId, delta: 1 }] }],
    noiseSources: [], sdeComponents: [], correlations: null,
    settings: { solver: "gillespie-direct-v2", tMax: 5, runs: 1, seed: "0" }, plots: [],
  };
  const result = validateCreateSavedSimulationInput({
    name: "v2", simulatorType: "gillespie", payloadVersion: 2, payload,
  });
  assert.equal(result.payload.transitions[0].changes[0].variableId, variableId);
  assert.throws(() => validateCreateSavedSimulationInput({
    name: "bad", simulatorType: "gillespie", payloadVersion: 2,
    payload: { ...payload, transitions: [{ ...payload.transitions[0], changes: [{ variableId: transitionId, delta: 1 }] }] },
  }), /unknown variable/i);
});

test("run history rejects raw trajectories and accepts bounded summaries", () => {
  assert.throws(() => validateCreateRunInput({
    inputSnapshot: {}, seed: "1", solver: {}, backend: {}, status: "complete", summary: { trajectories: [[0, 1]] },
  }), /cannot be stored/);
  const run = validateCreateRunInput({
    inputSnapshot: { payloadVersion: 2 }, seed: "18446744073709551615", solver: {}, backend: {}, status: "complete", summary: { mean: [1] },
  });
  assert.equal(run.seed, "18446744073709551615");
});

test("preview uploads are bound to one exact revision and definition", () => {
  const input = validateSavedSimulationPreviewUploadInput({
    imageDataUrl: `data:image/webp;base64,${Buffer.from("preview").toString("base64")}`,
    expectedRevision: 3,
    expectedDefinitionHash: "a".repeat(64),
  });
  assert.equal(input.expectedRevision, 3);
  assert.equal(input.expectedDefinitionHash, "a".repeat(64));
  assert.throws(() => validateSavedSimulationPreviewUploadInput({
    imageDataUrl: `data:image/webp;base64,${Buffer.from("preview").toString("base64")}`,
    expectedRevision: 2,
    expectedDefinitionHash: "wrong",
  }), /expectedDefinitionHash/);
});
