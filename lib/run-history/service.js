import "server-only";
import connectToDatabase from "@/lib/db/mongoose";
import SavedSimulation from "@/models/SavedSimulation";
import SimulationRun from "@/models/SimulationRun";
import { asObjectId, ownerModelScope } from "@/lib/access/saved-simulations";
import { computeDefinitionHash } from "@/lib/saved-simulations/service";

const MAX_RECENT = 100;
const MAX_PRESERVED = 20;

function plainRun(doc, { includeSnapshot = false } = {}) {
  if (!doc) return null;
  const value = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const output = {
    id: String(value._id),
    modelId: String(value.modelId),
    modelRevision: value.modelRevision,
    definitionHash: value.definitionHash,
    seed: value.seed,
    solver: value.solver,
    backend: value.backend,
    warnings: value.warnings ?? [],
    summary: value.summary,
    status: value.status,
    preserved: Boolean(value.preserved),
    label: value.label ?? "",
    notes: value.notes ?? "",
    completedAt: value.completedAt?.toISOString?.() ?? value.completedAt ?? null,
    createdAt: value.createdAt?.toISOString?.() ?? value.createdAt ?? null,
    updatedAt: value.updatedAt?.toISOString?.() ?? value.updatedAt ?? null,
  };
  if (includeSnapshot) output.inputSnapshot = value.inputSnapshot;
  return output;
}

async function ownedModel(modelId, userId) {
  const id = asObjectId(modelId);
  const scope = ownerModelScope(userId);
  if (!id || !scope) return null;
  return SavedSimulation.findOne({ _id: id, ...scope }).lean();
}

export async function listRunsForModel(modelId, userId, options = {}) {
  await connectToDatabase();
  const model = await ownedModel(modelId, userId);
  if (!model) return null;
  const query = { modelId: model._id, userId: model.userId };
  if (options.preserved === true) query.preserved = true;
  if (options.cursor) {
    const date = new Date(options.cursor);
    if (Number.isFinite(date.getTime())) query.createdAt = { $lt: date };
  }
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
  const docs = await SimulationRun.find(query).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
  return docs.map((doc) => plainRun(doc));
}

export async function createRunForModel(modelId, userId, input) {
  await connectToDatabase();
  const model = await ownedModel(modelId, userId);
  if (!model) return null;
  const run = await SimulationRun.create({
    ...input,
    modelId: model._id,
    userId: model.userId,
    modelRevision: model.revision ?? 1,
    definitionHash: model.definitionHash || computeDefinitionHash(model),
  });
  const overflow = await SimulationRun.find({ modelId: model._id, preserved: false })
    .sort({ createdAt: -1 })
    .skip(MAX_RECENT)
    .select("_id")
    .lean();
  if (overflow.length) await SimulationRun.deleteMany({ _id: { $in: overflow.map((item) => item._id) } });
  const [runCount, preservedRunCount] = await Promise.all([
    SimulationRun.countDocuments({ modelId: model._id }),
    SimulationRun.countDocuments({ modelId: model._id, preserved: true }),
  ]);
  await SavedSimulation.updateOne(
    { _id: model._id },
    { $set: { runCount, preservedRunCount } },
  );
  return plainRun(run, { includeSnapshot: true });
}

export async function getRunForModel(modelId, runId, userId) {
  await connectToDatabase();
  const model = await ownedModel(modelId, userId);
  const id = asObjectId(runId);
  if (!model || !id) return null;
  const run = await SimulationRun.findOne({ _id: id, modelId: model._id, userId: model.userId }).lean();
  return plainRun(run, { includeSnapshot: true });
}

export async function updateRunForModel(modelId, runId, userId, changes) {
  await connectToDatabase();
  const model = await ownedModel(modelId, userId);
  const id = asObjectId(runId);
  if (!model || !id) return null;
  const current = await SimulationRun.findOne({ _id: id, modelId: model._id, userId: model.userId }).lean();
  if (!current) return null;
  if (changes.preserved === true && !current.preserved) {
    const preservedCount = await SimulationRun.countDocuments({ modelId: model._id, preserved: true });
    if (preservedCount >= MAX_PRESERVED) {
      const error = new Error(`At most ${MAX_PRESERVED} runs can be preserved per model.`);
      error.code = "PRESERVED_RUN_LIMIT";
      throw error;
    }
  }
  const run = await SimulationRun.findOneAndUpdate(
    { _id: id, modelId: model._id, userId: model.userId },
    { $set: changes },
    { new: true, runValidators: true },
  ).lean();
  const overflow = await SimulationRun.find({ modelId: model._id, preserved: false })
    .sort({ createdAt: -1 })
    .skip(MAX_RECENT)
    .select("_id")
    .lean();
  if (overflow.length) await SimulationRun.deleteMany({ _id: { $in: overflow.map((item) => item._id) } });
  const [runCount, preservedRunCount] = await Promise.all([
    SimulationRun.countDocuments({ modelId: model._id }),
    SimulationRun.countDocuments({ modelId: model._id, preserved: true }),
  ]);
  await SavedSimulation.updateOne({ _id: model._id }, { $set: { runCount, preservedRunCount } });
  return plainRun(run, { includeSnapshot: true });
}
