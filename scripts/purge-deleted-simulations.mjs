import mongoose from "mongoose";
import SavedSimulation from "../models/SavedSimulation.js";
import SimulationRun from "../models/SimulationRun.js";
import { deleteSavedSimulationPreviewObject } from "../lib/storage/r2-core.js";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is required.");
const limitArg = process.argv.find((value) => value.startsWith("--limit="));
const limit = Math.min(1000, Math.max(1, Number(limitArg?.slice(8)) || 100));

await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || undefined });
try {
  const expired = await SavedSimulation.find({
    deletedAt: { $ne: null },
    purgeAfter: { $lte: new Date() },
  })
    .select("_id preview.objectKey")
    .limit(limit)
    .lean();
  const purgeable = [];
  const previewDeleteFailures = [];
  for (const item of expired) {
    try {
      if (item.preview?.objectKey) await deleteSavedSimulationPreviewObject(item.preview.objectKey);
      purgeable.push(item);
    } catch (error) {
      previewDeleteFailures.push({ id: String(item._id), message: error.message });
    }
  }
  const ids = purgeable.map((item) => item._id);
  if (ids.length) {
    await SimulationRun.deleteMany({ modelId: { $in: ids } });
    await SavedSimulation.deleteMany({ _id: { $in: ids } });
  }
  process.stdout.write(
    `${JSON.stringify({ purged: ids.length, previewObjectsDeleted: purgeable.filter((item) => item.preview?.objectKey).length, previewDeleteFailures })}\n`,
  );
} finally {
  await mongoose.disconnect();
}
