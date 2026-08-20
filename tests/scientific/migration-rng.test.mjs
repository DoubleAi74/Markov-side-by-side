import test from "node:test";
import assert from "node:assert/strict";
import { fromPersistedPayloadV2, migratePayloadV1, parseModelImport, validateModelV2, sha256Hex } from "../../lib/model-v2/index.js";
import { SeededRng, createRunRng, deriveRunSeed } from "../../lib/simulation/index.js";

const legacy = {
  format: "markov-side-by-side/model-config", payloadVersion: 1, simulatorType: "gillespie",
  payload: {
    varRows: [{ text: "A = 10" }, { text: "B = 0" }], paramRows: [{ text: "k = 2" }], helperRows: [],
    transitions: [{ rate: "k*A", deltas: ["-1", "1"] }], settings: { tMax: 4, numSims: 3 },
  },
};

test("v1 migration is deterministic, idempotent, and maps deltas to IDs", () => {
  const first = migratePayloadV1(legacy, { namespace: "fixture", seed: "42" });
  const second = migratePayloadV1(legacy, { namespace: "fixture", seed: "42" });
  assert.equal(first.needsRepair, false);
  assert.deepEqual(first.model, second.model);
  assert.equal(first.model.transitions[0].changes[0].variableId, first.model.variables[0].id);
  assert.equal(first.model.transitions[0].changes[1].variableId, first.model.variables[1].id);
  assert.equal(validateModelV2(first.model).ok, true);
  assert.equal(parseModelImport(first.model).changed, false);
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("unconvertible and random legacy models remain recoverable in repair mode", () => {
  const invalid = structuredClone(legacy); invalid.payload.transitions[0].rate = "random() * A";
  const migrated = migratePayloadV1(invalid, { namespace: "broken" });
  assert.equal(migrated.needsRepair, true);
  assert.deepEqual(migrated.model.legacyPayload, invalid);
});

test("uint64 RNG has stable vectors and run-index streams", () => {
  const rng = new SeededRng("1");
  assert.deepEqual(Array.from({ length: 4 }, () => rng.nextUint64().toString()), [
    "12966619160104079557", "9600361134598540522", "10590380919521690900", "7218738570589545383",
  ]);
  assert.notEqual(deriveRunSeed("99", 0), deriveRunSeed("99", 1));
  const a = createRunRng("99", 7), b = createRunRng("99", 7);
  assert.deepEqual(Array.from({ length: 20 }, () => a.nextFloat()), Array.from({ length: 20 }, () => b.nextFloat()));
});

test("old exported config MIME format remains importable", () => {
  const exported = {
    format: "markov-side-by-side/model-config", formatVersion: 1, simulatorType: "gillespie",
    model: { variables: [{ name: "X", initial: 3 }], parameters: [], transitions: [{ rate: "1", change: { X: "1" } }], time: { tMax: 2 } },
    run: { numSimulations: 2, seed: 17 },
  };
  const migrated = parseModelImport(exported, { namespace: "old-export" });
  assert.equal(migrated.needsRepair, false); assert.equal(migrated.model.settings.seed, "17");
  assert.equal(migrated.model.transitions[0].changes[0].variableId, migrated.model.variables[0].id);
});

test("persistence payload v2 adapts to canonical scientific model", () => {
  const migrated = migratePayloadV1(legacy, { namespace: "persist-adapter", seed: "5" }).model;
  const persisted = {
    variables: migrated.variables.map((x) => ({ id: x.id, name: x.name, initial: String(x.initialValue) })),
    parameters: migrated.parameters.map((x) => ({ id: x.id, name: x.name, value: String(x.value) })), helpers: [], transitions: migrated.transitions.map((x) => ({ ...x, changes: x.changes.map((c) => ({ ...c, delta: String(c.delta) })) })),
    settings: { solver: "direct-ssa-v2", tMax: 4, numSims: 3 }, plots: [],
  };
  const canonical = fromPersistedPayloadV2("gillespie", persisted, { seed: "5" });
  assert.equal(canonical.settings.solver, "gillespie-direct-v2"); assert.equal(validateModelV2(canonical).ok, true);
});
