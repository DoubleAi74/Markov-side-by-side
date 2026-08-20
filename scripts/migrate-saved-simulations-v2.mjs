import mongoose from "mongoose";
import SavedSimulation from "../models/SavedSimulation.js";
import { planSavedSimulationMigration } from "../lib/saved-simulations/migrations.js";
import { createSavedSimulationSlug, withNumericSlugSuffix } from "../lib/slugs.js";

const apply = process.argv.includes("--apply");
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is required.");

await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || undefined });
try {
  const documents = await SavedSimulation.find({}).lean();
  documents.sort((left, right) => String(left.createdAt ?? left._id).localeCompare(String(right.createdAt ?? right._id)));
  const occupiedSlugs = new Set(
    documents.filter((item) => item.slug).map((item) => `${item.userId}:${item.slug}`),
  );
  let changed = 0;
  for (const document of documents) {
    const plan = planSavedSimulationMigration(document);
    if (!document.slug) {
      const base = createSavedSimulationSlug(document.name);
      for (let suffix = 1; suffix <= 5000; suffix += 1) {
        const candidate = withNumericSlugSuffix(base, suffix, { maxLength: 80 });
        const key = `${document.userId}:${candidate}`;
        if (!occupiedSlugs.has(key)) {
          occupiedSlugs.add(key);
          plan.changes.slug = candidate;
          break;
        }
      }
    }
    if (Object.keys(plan.changes).length === 0) continue;
    changed += 1;
    process.stdout.write(`${JSON.stringify({ dryRun: !apply, ...plan })}\n`);
    if (apply) {
      await SavedSimulation.collection.updateOne({ _id: document._id }, { $set: plan.changes });
    }
  }
  process.stdout.write(`${JSON.stringify({ dryRun: !apply, scanned: documents.length, changed })}\n`);
} finally {
  await mongoose.disconnect();
}
