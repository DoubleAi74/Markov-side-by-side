import { createHash } from "node:crypto";
import mongodb from "mongodb";
import { planSavedSimulationMigration } from "../lib/saved-simulations/migrations.js";
import { createSavedSimulationSlug, withNumericSlugSuffix } from "../lib/slugs.js";

const { EJSON } = mongodb.BSON;
const { MongoClient } = mongodb;
const uri = process.env.MONGODB_URI;
const sourceName = process.env.MONGODB_DB;
const targetArg = process.argv.find((entry) => entry.startsWith("--target-db="));
const targetName = targetArg?.slice("--target-db=".length);
if (!uri || !sourceName) throw new Error("MONGODB_URI and MONGODB_DB are required.");
if (!/^markov_lab_rc_[a-z0-9_-]{8,80}$/.test(targetName ?? "")) throw new Error("--target-db must be a dedicated markov_lab_rc_* database name.");
if (targetName === sourceName) throw new Error("The isolated target must differ from the configured source database.");

const digest = (value) => createHash("sha256").update(EJSON.stringify(value, { canonical: true })).digest("hex");
const ordered = (documents) => documents.slice().sort((left, right) => String(left._id).localeCompare(String(right._id)));

async function applyMigration(collection) {
  const documents = await collection.find({}).sort({ createdAt: 1, _id: 1 }).toArray();
  const occupiedSlugs = new Set(documents.filter((item) => item.slug).map((item) => `${item.userId}:${item.slug}`));
  let changed = 0, converted = 0, needsRepair = 0;
  for (const document of documents) {
    const plan = planSavedSimulationMigration(document);
    if (!document.slug) {
      const base = createSavedSimulationSlug(document.name);
      for (let suffix = 1; suffix <= 5000; suffix += 1) {
        const candidate = withNumericSlugSuffix(base, suffix, { maxLength: 80 });
        const key = `${document.userId}:${candidate}`;
        if (!occupiedSlugs.has(key)) { occupiedSlugs.add(key); plan.changes.slug = candidate; break; }
      }
    }
    if (!Object.keys(plan.changes).length) continue;
    changed += 1;
    if (document.payloadVersion === 1 && plan.changes.payloadVersion === 2) converted += 1;
    if (plan.changes.validationStatus === "needsRepair") needsRepair += 1;
    await collection.updateOne({ _id: document._id }, { $set: plan.changes });
  }
  return { changed, converted, needsRepair };
}

const client = new MongoClient(uri);
await client.connect();
try {
  const source = client.db(sourceName), target = client.db(targetName);
  if ((await target.listCollections({}, { nameOnly: true }).toArray()).length) throw new Error(`Refusing to overwrite non-empty isolated database ${targetName}.`);
  const originals = {
    savedsimulations: await source.collection("savedsimulations").find({}).toArray(),
    simulationruns: await source.collection("simulationruns").find({}).toArray(),
  };
  for (const [name, documents] of Object.entries(originals)) if (documents.length) await target.collection(name).insertMany(documents, { ordered: true });
  const beforeHash = digest(Object.fromEntries(Object.entries(originals).map(([name, docs]) => [name, ordered(docs)])));
  const originalSlugs = new Map(originals.savedsimulations.filter((doc) => doc.slug).map((doc) => [String(doc._id), doc.slug]));
  const originalMissingVisibility = originals.savedsimulations.filter((doc) => !doc.visibility).map((doc) => String(doc._id));

  const migration = await applyMigration(target.collection("savedsimulations"));
  const migrated = await target.collection("savedsimulations").find({}).toArray();
  const secondPass = await applyMigration(target.collection("savedsimulations"));
  const slugContinuity = migrated.every((doc) => !originalSlugs.has(String(doc._id)) || originalSlugs.get(String(doc._id)) === doc.slug);
  const publicDefaults = migrated.filter((doc) => originalMissingVisibility.includes(String(doc._id))).every((doc) => doc.visibility === "public");
  const legacyRepairExact = originals.savedsimulations.filter((doc) => doc.payloadVersion === 1).every((original) => {
    const after = migrated.find((doc) => String(doc._id) === String(original._id));
    return after?.payloadVersion === 2 || (after?.validationStatus === "needsRepair" && digest(after.payload) === digest(original.payload));
  });

  await target.collection("savedsimulations").deleteMany({});
  await target.collection("simulationruns").deleteMany({});
  if (originals.savedsimulations.length) await target.collection("savedsimulations").insertMany(originals.savedsimulations);
  if (originals.simulationruns.length) await target.collection("simulationruns").insertMany(originals.simulationruns);
  const rolledBack = {
    savedsimulations: await target.collection("savedsimulations").find({}).toArray(),
    simulationruns: await target.collection("simulationruns").find({}).toArray(),
  };
  const rollbackExact = beforeHash === digest(Object.fromEntries(Object.entries(rolledBack).map(([name, docs]) => [name, ordered(docs)])));
  const finalMigration = await applyMigration(target.collection("savedsimulations"));
  const finalDocuments = await target.collection("savedsimulations").find({}).toArray();
  process.stdout.write(`${JSON.stringify({ sourceCollections: { savedsimulations: originals.savedsimulations.length, simulationruns: originals.simulationruns.length }, isolatedDatabase: targetName, initialMigration: migration, idempotent: secondPass.changed === 0, slugContinuity, publicDefaults, legacyRepairExact, rollbackExact, reappliedMigration: finalMigration, finalDigest: digest(ordered(finalDocuments)) })}\n`);
} finally {
  await client.close();
}
