import "server-only";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import connectToDatabase from "@/lib/db/mongoose";
import SavedSimulation from "@/models/SavedSimulation";
import SimulationRun from "@/models/SimulationRun";
import { deleteSavedSimulationPreviewObject } from "@/lib/storage/r2";
import { purgeExpiredDocuments } from "@/lib/saved-simulations/purge-core";
import { findAuthUserByUsername } from "@/lib/auth/users";
import {
  asObjectId,
  ownerModelScope,
  publicModelScope,
} from "@/lib/access/saved-simulations";
import {
  createSavedSimulationSlug,
  normalizeSavedSimulationSlug,
  normalizeUsernameSlug,
  withNumericSlugSuffix,
} from "@/lib/slugs";

const SAVED_SIMULATION_SUMMARY_SELECT =
  "userId simulatorType name slug description tags visibility payloadVersion preview lastOpenedAt revision definitionHash validationStatus provenance deletedAt purgeAfter runCount preservedRunCount createdAt updatedAt";
const MAX_SLUG_ATTEMPTS = 5000;
const DELETION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export class RevisionConflictError extends Error {
  constructor(currentRevision) {
    super("The model changed since it was loaded.");
    this.name = "RevisionConflictError";
    this.currentRevision = currentRevision;
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function computeDefinitionHash({ simulatorType, payloadVersion, payload }) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize({ simulatorType, payloadVersion, payload })))
    .digest("hex");
}

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toPlainSavedSimulationPreview(preview) {
  if (!preview) return null;
  return {
    imageUrl: preview.imageUrl ?? null,
    blurDataURL: preview.blurDataURL ?? null,
    objectKey: preview.objectKey ?? null,
    width: Number.isFinite(preview.width) ? preview.width : null,
    height: Number.isFinite(preview.height) ? preview.height : null,
    format: preview.format ?? null,
    fileSize: Number.isFinite(preview.fileSize) ? preview.fileSize : null,
    generatedAt: toIso(preview.generatedAt),
  };
}

export function toPlainSavedSimulation(doc, { includePayload = false } = {}) {
  if (!doc) return null;
  const value = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const output = {
    id: String(value._id),
    userId: String(value.userId),
    simulatorType: value.simulatorType,
    name: value.name,
    slug: value.slug ?? null,
    description: value.description ?? "",
    tags: Array.isArray(value.tags) ? value.tags : [],
    visibility: value.visibility === "private" ? "private" : "public",
    payloadVersion: value.payloadVersion,
    revision: Number.isInteger(value.revision) ? value.revision : 1,
    definitionHash:
      value.definitionHash ||
      (value.payload !== undefined
        ? computeDefinitionHash({
            simulatorType: value.simulatorType,
            payloadVersion: value.payloadVersion,
            payload: value.payload,
          })
        : null),
    validationStatus: value.validationStatus ?? "valid",
    provenance: value.provenance ?? null,
    deletedAt: toIso(value.deletedAt),
    purgeAfter: toIso(value.purgeAfter),
    runCount: Number.isFinite(value.runCount) ? value.runCount : 0,
    preservedRunCount: Number.isFinite(value.preservedRunCount)
      ? value.preservedRunCount
      : 0,
    preview: toPlainSavedSimulationPreview(value.preview),
    lastOpenedAt: toIso(value.lastOpenedAt),
    createdAt: toIso(value.createdAt),
    updatedAt: toIso(value.updatedAt),
  };
  if (includePayload) output.payload = value.payload;
  return output;
}

function applyPayloadSelection(query, includePayload) {
  return includePayload ? query : query.select(SAVED_SIMULATION_SUMMARY_SELECT);
}

function getPublicOwnerProfile(user) {
  if (!user?._id || !user?.username) return null;
  return {
    id: String(user._id),
    username: user.username,
    name: typeof user.name === "string" ? user.name : "",
    image: typeof user.image === "string" ? user.image : null,
  };
}

async function createUniqueSavedSimulationSlug({ userId, name }) {
  const userObjectId = asObjectId(userId);
  if (!userObjectId) throw new Error("Invalid user id.");
  const baseSlug = createSavedSimulationSlug(name);
  for (let index = 1; index <= MAX_SLUG_ATTEMPTS; index += 1) {
    const candidate = withNumericSlugSuffix(baseSlug, index, { maxLength: 80 });
    if (!(await SavedSimulation.exists({ userId: userObjectId, slug: candidate }))) {
      return candidate;
    }
  }
  throw new Error("Unable to create a unique model slug.");
}

async function ensureSavedSimulationSlug(doc) {
  if (!doc?._id || !doc?.userId) return doc;
  const normalized = normalizeSavedSimulationSlug(doc.slug ?? "");
  if (normalized && normalized === doc.slug) return doc;
  const slug = await createUniqueSavedSimulationSlug({
    userId: doc.userId,
    name: doc.name,
  });
  // Raw collection write is limited to the one-time legacy backfill; normal model
  // updates cannot mutate the immutable schema field.
  await SavedSimulation.collection.updateOne(
    { _id: doc._id, slug: { $in: [null, ""] } },
    { $set: { slug } },
  );
  doc.slug = slug;
  return doc;
}

async function ensureSavedSimulationSlugList(docs) {
  const ordered = [...docs].sort((a, b) =>
    String(a?.createdAt ?? a?._id).localeCompare(String(b?.createdAt ?? b?._id)),
  );
  for (const doc of ordered) await ensureSavedSimulationSlug(doc);
  return docs;
}

function buildListQuery(userId, filters) {
  const query = ownerModelScope(userId, {
    includeDeleted: filters.deleted === "only" || filters.includeDeleted,
  });
  if (!query) return null;
  if (filters.deleted === "only") query.deletedAt = { $ne: null };
  if (filters.simulatorType) query.simulatorType = filters.simulatorType;
  if (filters.visibility) query.visibility = filters.visibility;
  if (filters.tags?.length) query.tags = { $all: filters.tags };
  if (filters.search) {
    const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { description: { $regex: escaped, $options: "i" } },
      { tags: { $regex: escaped, $options: "i" } },
    ];
  }
  if (filters.cursor) {
    const cursorDate = new Date(filters.cursor);
    if (Number.isFinite(cursorDate.getTime())) query.updatedAt = { $lt: cursorDate };
  }
  return query;
}

export async function listSavedSimulationsForUser(userId, filters = {}, options = {}) {
  await connectToDatabase();
  const query = buildListQuery(userId, filters);
  if (!query) return [];
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 50));
  const sort = filters.sort === "name" ? { name: 1, _id: 1 } : { updatedAt: -1, _id: -1 };
  const docs = await applyPayloadSelection(
    SavedSimulation.find(query).sort(sort).limit(limit),
    options.includePayload,
  ).lean();
  await ensureSavedSimulationSlugList(docs);
  return docs.map((doc) => toPlainSavedSimulation(doc, options));
}

export async function getSavedSimulationForUser(id, userId, options = {}) {
  await connectToDatabase();
  const documentId = asObjectId(id);
  const scope = ownerModelScope(userId, { includeDeleted: options.includeDeleted });
  if (!documentId || !scope) return null;
  const doc = await applyPayloadSelection(
    SavedSimulation.findOne({ _id: documentId, ...scope }),
    options.includePayload ?? true,
  ).lean();
  await ensureSavedSimulationSlug(doc);
  return toPlainSavedSimulation(doc, { includePayload: true, ...options });
}

export async function createSavedSimulationForUser(userId, input) {
  await connectToDatabase();
  const userObjectId = asObjectId(userId);
  if (!userObjectId) throw new Error("Invalid user id.");
  const slug = await createUniqueSavedSimulationSlug({ userId: userObjectId, name: input.name });
  const definitionHash = computeDefinitionHash(input);
  const doc = await SavedSimulation.create({
    userId: userObjectId,
    simulatorType: input.simulatorType,
    name: input.name,
    slug,
    description: input.description ?? "",
    tags: input.tags ?? [],
    visibility: input.visibility ?? "public",
    payloadVersion: input.payloadVersion,
    payload: input.payload,
    revision: 1,
    definitionHash,
    validationStatus: input.validationStatus ?? "valid",
    provenance: input.provenance ?? null,
  });
  return toPlainSavedSimulation(doc, { includePayload: true });
}

export async function updateSavedSimulationForUser(id, userId, input) {
  await connectToDatabase();
  const documentId = asObjectId(id);
  const scope = ownerModelScope(userId);
  if (!documentId || !scope) return null;
  const { expectedRevision, ...changes } = input;
  const current = await SavedSimulation.findOne({ _id: documentId, ...scope })
    .select("simulatorType payloadVersion payload revision definitionHash")
    .lean();
  if (!current) return null;
  if ((current.revision ?? 1) !== expectedRevision) {
    throw new RevisionConflictError(current.revision ?? 1);
  }
  const nextDefinition = {
    simulatorType: current.simulatorType,
    payloadVersion: changes.payloadVersion ?? current.payloadVersion,
    payload: changes.payload ?? current.payload,
  };
  const definitionChanged = "payload" in changes || "payloadVersion" in changes;
  if (definitionChanged) {
    changes.definitionHash = computeDefinitionHash(nextDefinition);
  }
  // A preview is evidence for one exact definition. Definition changes detach it;
  // a revision/hash-matched fresh upload may attach a replacement afterwards.
  if (definitionChanged || changes.visibility === "private") changes.preview = null;
  // Slugs are deliberately absent: renaming never changes a shared URL.
  const doc = await SavedSimulation.findOneAndUpdate(
    { _id: documentId, ...scope, revision: expectedRevision },
    { $set: changes, $inc: { revision: 1 } },
    { new: true, runValidators: true },
  ).lean();
  if (!doc) {
    const latest = await SavedSimulation.findOne({ _id: documentId, ...scope }).select("revision").lean();
    if (latest) throw new RevisionConflictError(latest.revision ?? 1);
    return null;
  }
  return toPlainSavedSimulation(doc, { includePayload: true });
}

export async function deleteSavedSimulationForUser(id, userId) {
  await connectToDatabase();
  const documentId = asObjectId(id);
  const scope = ownerModelScope(userId);
  if (!documentId || !scope) return null;
  const deletedAt = new Date();
  const purgeAfter = new Date(deletedAt.getTime() + DELETION_RETENTION_MS);
  const doc = await applyPayloadSelection(
    SavedSimulation.findOneAndUpdate(
      { _id: documentId, ...scope },
      { $set: { deletedAt, purgeAfter } },
      { new: true },
    ),
    false,
  ).lean();
  return toPlainSavedSimulation(doc);
}

export async function restoreSavedSimulationForUser(id, userId) {
  await connectToDatabase();
  const documentId = asObjectId(id);
  const scope = ownerModelScope(userId, { includeDeleted: true });
  if (!documentId || !scope) return null;
  const doc = await SavedSimulation.findOneAndUpdate(
    { _id: documentId, ...scope, deletedAt: { $ne: null }, purgeAfter: { $gt: new Date() } },
    { $set: { deletedAt: null, purgeAfter: null } },
    { new: true },
  ).lean();
  return toPlainSavedSimulation(doc, { includePayload: true });
}

export async function forkSavedSimulationForUser(id, userId, input = {}) {
  await connectToDatabase();
  const documentId = asObjectId(id);
  const targetOwner = asObjectId(userId);
  if (!documentId || !targetOwner) return null;
  const source = await SavedSimulation.findOne({
    _id: documentId,
    deletedAt: null,
    $or: [{ userId: targetOwner }, { visibility: { $ne: "private" } }],
  }).lean();
  if (!source) return null;
  return createSavedSimulationForUser(targetOwner, {
    simulatorType: source.simulatorType,
    name: input.name || `${source.name} (fork)`,
    description: input.description ?? source.description,
    tags: input.tags ?? source.tags,
    visibility: input.visibility ?? "public",
    payloadVersion: source.payloadVersion,
    payload: source.payload,
    validationStatus: source.validationStatus,
    provenance: {
      kind: "fork",
      sourceModelId: String(source._id),
      sourceOwnerId: String(source.userId),
      sourceRevision: source.revision ?? 1,
      sourceDefinitionHash: source.definitionHash ?? computeDefinitionHash(source),
      forkedAt: new Date().toISOString(),
    },
  });
}

export async function updateSavedSimulationPreviewForUser(id, userId, preview, expected = {}) {
  await connectToDatabase();
  const documentId = asObjectId(id);
  const scope = ownerModelScope(userId);
  if (!documentId || !scope) return null;
  const doc = await applyPayloadSelection(
    SavedSimulation.findOneAndUpdate(
      {
        _id: documentId,
        ...scope,
        revision: expected.expectedRevision,
        definitionHash: expected.expectedDefinitionHash,
        visibility: { $ne: "private" },
      },
      { $set: { preview } },
      { new: true },
    ),
    false,
  ).lean();
  return toPlainSavedSimulation(doc);
}

export async function listPublicSavedSimulationsByUsername(username) {
  await connectToDatabase();
  const normalizedUsername = normalizeUsernameSlug(username);
  if (!normalizedUsername) return null;
  const owner = getPublicOwnerProfile(await findAuthUserByUsername(normalizedUsername));
  if (!owner) return null;
  const scope = publicModelScope(owner.id);
  const docs = await SavedSimulation.find(scope)
    .sort({ updatedAt: -1 })
    .select(SAVED_SIMULATION_SUMMARY_SELECT)
    .lean();
  await ensureSavedSimulationSlugList(docs);
  return { owner, items: docs.map((doc) => toPlainSavedSimulation(doc)) };
}

export async function getPublicSavedSimulationByUsernameAndSlug(username, slug, options = {}) {
  await connectToDatabase();
  const normalizedUsername = normalizeUsernameSlug(username);
  const normalizedSlug = normalizeSavedSimulationSlug(slug);
  if (!normalizedUsername || !normalizedSlug) return null;
  const owner = getPublicOwnerProfile(await findAuthUserByUsername(normalizedUsername));
  if (!owner) return null;
  const scope = publicModelScope(owner.id);
  const doc = await applyPayloadSelection(
    SavedSimulation.findOne({ ...scope, slug: normalizedSlug }),
    options.includePayload ?? true,
  ).lean();
  if (!doc) return null;
  return {
    owner,
    savedSimulation: toPlainSavedSimulation(doc, { includePayload: true, ...options }),
  };
}

export async function purgeExpiredSavedSimulations({ before = new Date(), limit = 100 } = {}) {
  await connectToDatabase();
  return purgeExpiredDocuments({ SavedSimulation, SimulationRun, deletePreviewObject: deleteSavedSimulationPreviewObject, before, limit });
}
