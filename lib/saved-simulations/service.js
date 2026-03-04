import "server-only";
import mongoose from "mongoose";
import connectToDatabase from "@/lib/db/mongoose";
import SavedSimulation from "@/models/SavedSimulation";

const SAVED_SIMULATION_SUMMARY_SELECT =
  "userId simulatorType name description payloadVersion preview lastOpenedAt createdAt updatedAt";

function toPlainSavedSimulationPreview(preview) {
  if (!preview) {
    return null;
  }

  return {
    imageUrl: preview.imageUrl ?? null,
    blurDataURL: preview.blurDataURL ?? null,
    objectKey: preview.objectKey ?? null,
    width: Number.isFinite(preview.width) ? preview.width : null,
    height: Number.isFinite(preview.height) ? preview.height : null,
    format: preview.format ?? null,
    fileSize: Number.isFinite(preview.fileSize) ? preview.fileSize : null,
    generatedAt: preview.generatedAt ? preview.generatedAt.toISOString() : null,
  };
}

function toPlainSavedSimulation(doc, { includePayload = false } = {}) {
  if (!doc) return null;

  const value = typeof doc.toObject === "function" ? doc.toObject() : doc;

  const output = {
    id: value._id.toString(),
    userId: value.userId.toString(),
    simulatorType: value.simulatorType,
    name: value.name,
    description: value.description ?? "",
    payloadVersion: value.payloadVersion,
    preview: toPlainSavedSimulationPreview(value.preview),
    lastOpenedAt: value.lastOpenedAt ? value.lastOpenedAt.toISOString() : null,
    createdAt: value.createdAt ? value.createdAt.toISOString() : null,
    updatedAt: value.updatedAt ? value.updatedAt.toISOString() : null,
  };

  if (includePayload) {
    output.payload = value.payload;
  }

  return output;
}

function toObjectId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }
  return new mongoose.Types.ObjectId(id);
}

function applyPayloadSelection(query, includePayload) {
  return includePayload ? query : query.select(SAVED_SIMULATION_SUMMARY_SELECT);
}

export async function listSavedSimulationsForUser(
  userId,
  filters = {},
  options = {},
) {
  await connectToDatabase();

  const userObjectId = toObjectId(userId);
  if (!userObjectId) {
    return [];
  }

  const query = { userId: userObjectId };
  if (filters.simulatorType) {
    query.simulatorType = filters.simulatorType;
  }

  const docs = await applyPayloadSelection(
    SavedSimulation.find(query).sort({ updatedAt: -1 }),
    options.includePayload,
  ).lean();

  return docs.map((doc) => toPlainSavedSimulation(doc, options));
}

export async function getSavedSimulationForUser(id, userId, options = {}) {
  await connectToDatabase();

  const documentId = toObjectId(id);
  const userObjectId = toObjectId(userId);
  if (!documentId || !userObjectId) {
    return null;
  }

  const doc = await applyPayloadSelection(
    SavedSimulation.findOne({
      _id: documentId,
      userId: userObjectId,
    }),
    options.includePayload ?? true,
  ).lean();

  return toPlainSavedSimulation(doc, {
    includePayload: true,
    ...options,
  });
}

export async function createSavedSimulationForUser(userId, input) {
  await connectToDatabase();

  const userObjectId = toObjectId(userId);
  if (!userObjectId) {
    throw new Error("Invalid user id.");
  }

  const doc = await SavedSimulation.create({
    userId: userObjectId,
    simulatorType: input.simulatorType,
    name: input.name,
    description: input.description ?? "",
    payloadVersion: input.payloadVersion,
    payload: input.payload,
  });

  return toPlainSavedSimulation(doc, { includePayload: true });
}

export async function updateSavedSimulationForUser(id, userId, input) {
  await connectToDatabase();

  const documentId = toObjectId(id);
  const userObjectId = toObjectId(userId);
  if (!documentId || !userObjectId) {
    return null;
  }

  const doc = await SavedSimulation.findOneAndUpdate(
    { _id: documentId, userId: userObjectId },
    { $set: input },
    { new: true },
  ).lean();

  return toPlainSavedSimulation(doc, { includePayload: true });
}

export async function deleteSavedSimulationForUser(id, userId) {
  await connectToDatabase();

  const documentId = toObjectId(id);
  const userObjectId = toObjectId(userId);
  if (!documentId || !userObjectId) {
    return null;
  }

  const doc = await applyPayloadSelection(
    SavedSimulation.findOneAndDelete({
      _id: documentId,
      userId: userObjectId,
    }),
    false,
  ).lean();

  return toPlainSavedSimulation(doc, { includePayload: false });
}

export async function updateSavedSimulationPreviewForUser(
  id,
  userId,
  preview,
) {
  await connectToDatabase();

  const documentId = toObjectId(id);
  const userObjectId = toObjectId(userId);
  if (!documentId || !userObjectId) {
    return null;
  }

  const doc = await applyPayloadSelection(
    SavedSimulation.findOneAndUpdate(
      { _id: documentId, userId: userObjectId },
      { $set: { preview } },
      { new: true },
    ),
    false,
  ).lean();

  return toPlainSavedSimulation(doc, { includePayload: false });
}
