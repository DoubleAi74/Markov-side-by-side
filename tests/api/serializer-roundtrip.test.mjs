import test from "node:test";
import assert from "node:assert/strict";
import {
  hydrateCTMPInhomoPayload,
  hydrateGillespiePayload,
  hydrateSDEPayload,
  serializeCTMPInhomoState,
  serializeGillespieState,
  serializeSDEState,
} from "../../lib/saved-simulations/serializers.js";
import { validateModelV2 } from "../../lib/model-v2/schema.js";
import { validateV2SavedSimulationPayload } from "../../lib/saved-simulations/validators.js";

const IDS = {
  x: "74ca5ba6-c37c-51ce-a4f4-86f126bbe0c7",
  y: "00be8e1f-cd4c-5932-8876-23792d25f663",
  p: "a5111743-85e8-5824-a949-a57f4f9718a0",
  helper: "e1958dbb-e5b8-5539-9ac3-7769f8740fd7",
  reaction: "963ba513-cd31-5ad7-ae83-d6cb70534ed8",
  reaction2: "d86cdff1-bfbe-5aa7-8c6b-578759987641",
  noise1: "aa24eec1-8738-55ea-868e-d9f8751b845a",
  noise2: "ce00b2fe-212d-5560-a432-0b0306f7d773",
  component1: "ca53874a-85db-5dac-8194-05d1e9681492",
  component2: "747929ab-6893-5415-b98a-47437db81c5f",
};

test("Gillespie editor serialization is canonical, seeded, plotted, and ID-stable", () => {
  const first = serializeGillespieState({
    varRows: [{ id: "editor-row-x", text: "X = 2", noteEnabled: true, noteLabel: "Population", unit: "cells", description: "Observed count", slider: { min: 0, max: 10, step: 1 } }],
    paramRows: [{ id: "editor-row-b", text: "b = 3" }],
    transitions: [{ id: "editor-transition", rate: "b * X", deltas: ["1"], noteEnabled: true, noteLabel: "Birth" }],
    tMax: 4,
    numSims: 8,
    seed: "18446744073709551615",
    plots: [{ id: "plot-1", kind: "time-series", variableIds: [] }],
  });
  assert.equal(first.payloadVersion, 2);
  assert.equal(first.payload.format, "markov-lab/model");
  assert.equal(validateModelV2(first.payload).ok, true);
  assert.equal(first.payload.transitions[0].changes[0].variableId, first.payload.variables[0].id);
  assert.equal(first.payload.settings.seed, "18446744073709551615");
  assert.equal(first.payload.plots[0].id, "plot-1");
  assert.equal(first.payload.variables[0].unit, "cells");
  assert.deepEqual(first.payload.variables[0].slider, { min: 0, max: 10, step: 1 });

  const hydrated = hydrateGillespiePayload(first.payload);
  hydrated.varRows[0].text = "Renamed = 2";
  const second = serializeGillespieState({
    ...hydrated.settings,
    varRows: hydrated.varRows,
    paramRows: hydrated.paramRows,
    transitions: hydrated.transitions,
    tMax: hydrated.settings.tMax,
    numSims: hydrated.settings.numSims,
  });
  assert.equal(second.payload.variables[0].id, first.payload.variables[0].id);
  assert.equal(second.payload.settings.seed, first.payload.settings.seed);
  assert.deepEqual(second.payload.plots, first.payload.plots);
  assert.equal(second.payload.variables[0].description, "Observed count");
});

test("legacy CTMP hydrates into the current UI adapter and writes forward once", () => {
  const hydrated = hydrateCTMPInhomoPayload({
    varRows: [{ text: "X = 1" }],
    paramRows: [{ text: "a = 2" }],
    helperRows: [{ text: "Season(t) = 1 + t" }],
    transitions: [{ rate: "a * Season", deltas: ["-1"] }],
    settings: { tMax: 3, dt: 0.05, numSims: 2, seed: "42" },
  });
  assert.match(hydrated.helperRows[0].text, /^Season\(t\)/);
  const serialized = serializeCTMPInhomoState({
    varRows: hydrated.varRows,
    paramRows: hydrated.paramRows,
    helperRows: hydrated.helperRows,
    transitions: hydrated.transitions,
    tMax: hydrated.settings.tMax,
    dt: hydrated.settings.dt,
    numSims: hydrated.settings.numSims,
  });
  assert.equal(serialized.payloadVersion, 2);
  assert.equal(serialized.payload.settings.solver, "ctmp-piecewise-frozen-v1");
  assert.equal(serialized.payload.settings.seed, "42");
  assert.equal(serialized.payload.transitions[0].changes[0].variableId, serialized.payload.variables[0].id);
});

test("general SDE noise, correlation, boundary, plots, and IDs survive editor round trips", () => {
  const canonical = {
    format: "markov-lab/model",
    version: 2,
    solverFamily: "sde",
    variables: [
      { id: IDS.x, name: "X", initialValue: 1 },
      { id: IDS.y, name: "Y", initialValue: 2 },
    ],
    parameters: [{ id: IDS.p, name: "a", value: 0.5 }],
    helpers: [],
    transitions: [],
    noiseSources: [
      { id: IDS.noise1, name: "W_X" },
      { id: IDS.noise2, name: "W_Y" },
    ],
    sdeComponents: [
      {
        id: IDS.component1,
        variableId: IDS.x,
        drift: "a * X",
        diffusion: [
          { noiseId: IDS.noise1, expression: "X" },
          { noiseId: IDS.noise2, expression: "0.25" },
        ],
        boundary: { type: "reflect", min: 0, max: 10 },
      },
      {
        id: IDS.component2,
        variableId: IDS.y,
        drift: "-Y",
        diffusion: [
          { noiseId: IDS.noise1, expression: "0.1" },
          { noiseId: IDS.noise2, expression: "Y" },
        ],
        boundary: { type: "absorb", min: 0 },
      },
    ],
    correlations: [[1, 0.5], [0.5, 1]],
    settings: { solver: "euler-maruyama-v2", tMax: 5, dt: 0.01, runs: 4, seed: "99" },
    plots: [{ id: "phase", kind: "phase-2d", xId: IDS.x, yId: IDS.y }],
  };
  const hydrated = hydrateSDEPayload(canonical);
  assert.equal(hydrated.components[0].diff, "X");
  assert.deepEqual(hydrated.correlations, canonical.correlations);
  hydrated.components[0].diff = "2 * X";

  const roundTrip = serializeSDEState({
    paramRows: hydrated.paramRows,
    components: hydrated.components,
    tMax: hydrated.settings.tMax,
    dt: hydrated.settings.dt,
    numSims: hydrated.settings.numSims,
  }).payload;
  assert.equal(validateModelV2(roundTrip).ok, true);
  assert.equal(validateV2SavedSimulationPayload("sde", roundTrip).format, "markov-lab/model");
  assert.deepEqual(roundTrip.noiseSources, canonical.noiseSources);
  assert.deepEqual(roundTrip.correlations, canonical.correlations);
  assert.deepEqual(roundTrip.plots, canonical.plots);
  assert.deepEqual(roundTrip.sdeComponents.map((entry) => entry.id), [IDS.component1, IDS.component2]);
  assert.deepEqual(roundTrip.sdeComponents[0].boundary, canonical.sdeComponents[0].boundary);
  assert.equal(roundTrip.sdeComponents[0].diffusion[0].expression, "2 * X");
  assert.equal(roundTrip.sdeComponents[0].diffusion[1].expression, "0.25");
});

test("API integrity rejects dangling SDE noise references and invalid correlation matrices", () => {
  const base = {
    format: "markov-lab/model",
    version: 2,
    solverFamily: "sde",
    variables: [{ id: IDS.x, name: "X", initialValue: 1 }],
    parameters: [], helpers: [], transitions: [],
    noiseSources: [{ id: IDS.noise1, name: "W_X" }],
    sdeComponents: [{
      id: IDS.component1,
      variableId: IDS.x,
      drift: "0",
      diffusion: [{ noiseId: IDS.noise2, expression: "1" }],
      boundary: { type: "none" },
    }],
    correlations: [[1]],
    settings: { solver: "euler-maruyama-v2", tMax: 1, dt: 0.1, runs: 1, seed: "1" },
    plots: [],
  };
  assert.throws(() => validateV2SavedSimulationPayload("sde", base), /unknown noise source/);
  const badCorrelation = structuredClone(base);
  badCorrelation.sdeComponents[0].diffusion[0].noiseId = IDS.noise1;
  badCorrelation.correlations = [[0.5]];
  assert.throws(() => validateV2SavedSimulationPayload("sde", badCorrelation), /(?:unit diagonal|diagonal entries)/i);
});
