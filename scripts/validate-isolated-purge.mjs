import mongodb from "mongodb";
import mongoose from "mongoose";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

const { MongoClient, ObjectId } = mongodb;
const uri = process.env.MONGODB_URI;
const targetArg = process.argv.find((entry) => entry.startsWith("--target-db="));
const targetName = targetArg?.slice("--target-db=".length);
if (!uri) throw new Error("MONGODB_URI is required.");
if (!/^markov_lab_rc_[a-z0-9_-]{8,80}$/.test(targetName ?? "")) throw new Error("--target-db must be a dedicated markov_lab_rc_* database name.");
if (targetName === process.env.MONGODB_DB) throw new Error("The purge target must differ from the configured source database.");

const required = (name) => {
  if (!process.env[name]) throw new Error(`${name} is required for isolated storage verification.`);
  return process.env[name];
};
const endpoint = process.env.R2_ENDPOINT || `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;
const bucket = required("R2_BUCKET_NAME");
const r2 = new S3Client({ region: "auto", endpoint, credentials: { accessKeyId: required("R2_ACCESS_KEY_ID"), secretAccessKey: required("R2_SECRET_ACCESS_KEY") } });
const modelId = new ObjectId(), userId = new ObjectId();
const token = globalThis.crypto.randomUUID();
const prefix = (process.env.R2_PREVIEW_PREFIX || "model-previews").replace(/^\/+|\/+$/g, "");
const objectKey = `${prefix}/rc-verification/${token}/preview.webp`;
const now = new Date(), expired = new Date(now.getTime() - 60_000);

const client = new MongoClient(uri);
await client.connect();
try {
  const target = client.db(targetName);
  if ((await target.listCollections({}, { nameOnly: true }).toArray()).length) throw new Error(`Refusing to overwrite non-empty isolated database ${targetName}.`);
  await target.collection("savedsimulations").insertOne({ _id: modelId, userId, simulatorType: "gillespie", name: "RC purge fixture", slug: `rc-purge-${token}`, payloadVersion: 2, payload: {}, visibility: "private", revision: 1, validationStatus: "valid", deletedAt: expired, purgeAfter: expired, preview: { objectKey }, createdAt: now, updatedAt: now });
  await target.collection("simulationruns").insertOne({ _id: new ObjectId(), modelId, userId, modelRevision: 1, definitionHash: "fixture", inputSnapshot: {}, seed: "0", solver: {}, backend: {}, warnings: [], summary: {}, status: "complete", preserved: false, createdAt: now, updatedAt: now });
} finally { await client.close(); }

process.env.MONGODB_DB = targetName;
const { uploadSavedSimulationPreview, deleteSavedSimulationPreviewObject } = await import("../lib/storage/r2-core.js");
const SavedSimulation = (await import("../models/SavedSimulation.js")).default;
const SimulationRun = (await import("../models/SimulationRun.js")).default;
const { purgeExpiredDocuments } = await import("../lib/saved-simulations/purge-core.js");
await uploadSavedSimulationPreview({ objectKey, body: Buffer.from([0x52, 0x43]), contentType: "image/webp" });
await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
await mongoose.connect(uri, { dbName: targetName });
const result = await purgeExpiredDocuments({ SavedSimulation, SimulationRun, deletePreviewObject: deleteSavedSimulationPreviewObject, before: now, limit: 10 });
await mongoose.disconnect();

const verify = new MongoClient(uri);
await verify.connect();
let modelCount, runCount;
try {
  const target = verify.db(targetName);
  modelCount = await target.collection("savedsimulations").countDocuments({ _id: modelId });
  runCount = await target.collection("simulationruns").countDocuments({ modelId });
} finally { await verify.close(); }
let objectDeleted = false;
try { await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey })); }
catch (error) { objectDeleted = error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound"; }
process.stdout.write(`${JSON.stringify({ isolatedDatabase: targetName, purged: result.count, previewObjectsDeleted: result.previewObjectsDeleted, previewDeleteFailures: result.previewDeleteFailures.length, modelRecordsRemaining: modelCount, runRecordsRemaining: runCount, objectDeleted })}\n`);
if (result.count !== 1 || modelCount || runCount || !objectDeleted) process.exitCode = 1;
