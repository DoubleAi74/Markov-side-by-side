import { migratePayloadV1 } from "../model-v2/migrate.js";
import { MODEL_FORMAT, MODEL_VERSION, validateModelV2 } from "../model-v2/schema.js";

export const MARKOV_LAB_MODEL_FORMAT = MODEL_FORMAT;
export const MARKOV_LAB_MODEL_FORMAT_VERSION = MODEL_VERSION;
export const LEGACY_MODEL_FORMAT = "markov-side-by-side/model-config";

export function createMarkovLabModelExport(savedSimulation) {
  const model = savedSimulation.payloadVersion === 1
    ? migratePayloadV1(
        {
          payloadVersion: 1,
          simulatorType: savedSimulation.simulatorType,
          payload: savedSimulation.payload,
        },
        { namespace: savedSimulation.id, simulatorType: savedSimulation.simulatorType },
      ).model
    : savedSimulation.payload;
  const validation = validateModelV2(model);
  if (!validation.ok || model.needsRepair) {
    const messages = validation.issues.map((issue) => `${issue.path}: ${issue.message}`);
    if (model.needsRepair) messages.push(...(model.repairIssues ?? ["Model requires repair."]));
    throw new Error(messages.join(" "));
  }
  return model;
}

export function parseMarkovLabModelImport(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Imported JSON must be an object.");
  }
  if (value.format === LEGACY_MODEL_FORMAT && value.formatVersion === 1) {
    const migration = migratePayloadV1(value);
    return {
      format: LEGACY_MODEL_FORMAT,
      formatVersion: 1,
      model: migration.model,
      needsRepair: migration.needsRepair,
      report: migration.report,
    };
  }
  const validation = validateModelV2(value);
  if (!validation.ok) {
    throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join(" "));
  }
  return {
    format: MODEL_FORMAT,
    version: MODEL_VERSION,
    model: value,
    needsRepair: Boolean(value.needsRepair),
    report: [],
  };
}
