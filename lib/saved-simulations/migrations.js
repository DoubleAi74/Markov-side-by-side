import { createHash } from "node:crypto";
import { migratePayloadV1 } from "../model-v2/migrate.js";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function definitionHash(simulatorType, payloadVersion, payload) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize({ simulatorType, payloadVersion, payload })))
    .digest("hex");
}

export function migratePayloadV1ToV2({ id, simulatorType, payload }) {
  const migration = migratePayloadV1(
    { payloadVersion: 1, simulatorType, payload },
    { namespace: String(id), simulatorType },
  );
  if (migration.needsRepair) {
    const error = new Error(migration.report.join(" ") || "Legacy payload requires repair.");
    error.migration = migration;
    throw error;
  }
  return migration.model;
}

export function planSavedSimulationMigration(document) {
  const changes = {};
  if (!document.visibility) changes.visibility = "public";
  if (!Number.isInteger(document.revision)) changes.revision = 1;
  if (!document.validationStatus) changes.validationStatus = "valid";
  if (!Array.isArray(document.tags)) changes.tags = [];
  if (document.deletedAt === undefined) changes.deletedAt = null;
  if (!Number.isFinite(document.runCount)) changes.runCount = 0;
  if (!Number.isFinite(document.preservedRunCount)) changes.preservedRunCount = 0;

  if (document.payloadVersion === 1) {
    const migration = migratePayloadV1(
      {
        payloadVersion: 1,
        simulatorType: document.simulatorType,
        payload: document.payload,
      },
      { namespace: String(document._id), simulatorType: document.simulatorType },
    );
    if (migration.needsRepair) {
      changes.validationStatus = "needsRepair";
      changes.provenance = {
        ...(document.provenance ?? {}),
        migrationError: migration.report.join(" "),
        migrationReport: migration.report,
      };
      // Do not replace payload or payloadVersion. The legacy value remains exactly
      // as stored and therefore byte-for-byte recoverable for the repair editor.
    } else {
      changes.payload = migration.model;
      changes.payloadVersion = 2;
      changes.validationStatus = "valid";
      changes.definitionHash = definitionHash(document.simulatorType, 2, migration.model);
      changes.provenance = {
        ...(document.provenance ?? {}),
        migratedFrom: {
          payloadVersion: 1,
          migratedAt: new Date().toISOString(),
          report: migration.report,
        },
      };
    }
  }
  if (!document.definitionHash && !changes.definitionHash && document.payload) {
    changes.definitionHash = definitionHash(document.simulatorType, document.payloadVersion, document.payload);
  }
  return { id: String(document._id), changes };
}
