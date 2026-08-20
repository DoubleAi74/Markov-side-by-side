import test from "node:test";
import assert from "node:assert/strict";
import { migratePayloadV1ToV2, planSavedSimulationMigration } from "../../lib/saved-simulations/migrations.js";
import { createSBMLExport, parseSBMLImport, SBMLCompatibilityError } from "../../lib/interchange/sbml.js";
import { validateModelV2 } from "../../lib/model-v2/schema.js";
import { createMarkovLabModelExport, parseMarkovLabModelImport } from "../../lib/interchange/json.js";

const legacy = {
  _id: "507f1f77bcf86cd799439011", simulatorType: "gillespie", payloadVersion: 1,
  payload: {
    varRows: [{ text: "X = 5" }], paramRows: [{ text: "b = 2" }],
    transitions: [{ rate: "b * X", deltas: ["1"] }], settings: { tMax: 2, numSims: 3 },
  },
};

test("migration maps positional deltas to deterministic canonical IDs", () => {
  const first = migratePayloadV1ToV2({ id: legacy._id, simulatorType: legacy.simulatorType, payload: legacy.payload });
  const second = migratePayloadV1ToV2({ id: legacy._id, simulatorType: legacy.simulatorType, payload: legacy.payload });
  assert.deepEqual(first, second);
  assert.equal(validateModelV2(first).ok, true);
  assert.equal(first.format, "markov-lab/model");
  assert.equal(first.transitions[0].changes[0].variableId, first.variables[0].id);
});

test("helper function syntax migrates through the canonical migrator", () => {
  const model = migratePayloadV1ToV2({
    id: legacy._id, simulatorType: "ctmp-inhomo",
    payload: { ...legacy.payload, helperRows: [{ text: "Season(t) = 1 + t" }], settings: { ...legacy.payload.settings, dt: 0.1 } },
  });
  assert.equal(model.helpers[0].name, "Season");
  assert.equal(model.helpers[0].expression, "1 + t");
});

test("malformed legacy payload stays untouched in repair mode", () => {
  const broken = { ...legacy, payload: { ...legacy.payload, varRows: [{ text: "not an assignment" }] } };
  const plan = planSavedSimulationMigration(broken);
  assert.equal(plan.changes.validationStatus, "needsRepair");
  assert.equal(Object.hasOwn(plan.changes, "payload"), false);
});

test("strict SBML subset round trips integer amount reactions", () => {
  const payload = migratePayloadV1ToV2({ id: legacy._id, simulatorType: legacy.simulatorType, payload: legacy.payload });
  const xml = createSBMLExport({ ...legacy, id: legacy._id, slug: "birth", name: "Birth", payloadVersion: 2, payload });
  const imported = parseSBMLImport(xml);
  assert.equal(imported.payload.variables[0].initialValue, 5);
  assert.equal(imported.payload.transitions[0].changes[0].delta, 1);
  assert.equal(validateModelV2(imported.payload).ok, true);
});

test("strict SBML subset reports unsupported rules", () => {
  for (const rule of ["assignmentRule", "rateRule", "algebraicRule"]) {
    assert.throws(
      () => parseSBMLImport(`<sbml level="3"><model><listOfRules><core:${rule} xmlns:core="urn:core"/></listOfRules></model></sbml>`),
      (error) =>
        error instanceof SBMLCompatibilityError &&
        error.issues.some((issue) => issue.path === rule && /not approximated/.test(issue.message)),
    );
  }
});

test("strict SBML import resolves namespace-prefixed species references", () => {
  const payload = migratePayloadV1ToV2({ id: legacy._id, simulatorType: legacy.simulatorType, payload: legacy.payload });
  const xml = createSBMLExport({ ...legacy, id: legacy._id, slug: "birth", name: "Birth", payloadVersion: 2, payload })
    .replace("<sbml ", '<sbml xmlns:core="urn:core" ')
    .replaceAll("<listOfReactants>", "<core:listOfReactants>")
    .replaceAll("</listOfReactants>", "</core:listOfReactants>")
    .replaceAll("<listOfProducts>", "<core:listOfProducts>")
    .replaceAll("</listOfProducts>", "</core:listOfProducts>")
    .replaceAll("<speciesReference ", "<core:speciesReference ");
  const imported = parseSBMLImport(xml);
  assert.equal(imported.payload.transitions[0].changes[0].delta, 1);
});

test("canonical JSON uses version while the legacy format keeps formatVersion", () => {
  const payload = migratePayloadV1ToV2({ id: legacy._id, simulatorType: legacy.simulatorType, payload: legacy.payload });
  const exported = createMarkovLabModelExport({ ...legacy, id: legacy._id, payloadVersion: 2, payload });
  const imported = parseMarkovLabModelImport(exported);
  assert.equal(imported.format, "markov-lab/model");
  assert.equal(imported.version, 2);
  assert.equal(Object.hasOwn(imported, "formatVersion"), false);
});
