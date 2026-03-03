import "server-only";
import mongoose from "mongoose";
import connectToDatabase from "@/lib/db/mongoose";
import SavedSimulation from "@/models/SavedSimulation";

function toPlainSavedSimulation(doc) {
  if (!doc) return null;

  const value = typeof doc.toObject === "function" ? doc.toObject() : doc;

  return {
    id: value._id.toString(),
    userId: value.userId.toString(),
    simulatorType: value.simulatorType,
    name: value.name,
    description: value.description ?? "",
    payloadVersion: value.payloadVersion,
    payload: value.payload,
    lastOpenedAt: value.lastOpenedAt ? value.lastOpenedAt.toISOString() : null,
    createdAt: value.createdAt ? value.createdAt.toISOString() : null,
    updatedAt: value.updatedAt ? value.updatedAt.toISOString() : null,
  };
}

function toObjectId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }
  return new mongoose.Types.ObjectId(id);
}

export async function listSavedSimulationsForUser(userId, filters = {}) {
  await connectToDatabase();

  const userObjectId = toObjectId(userId);
  if (!userObjectId) {
    return [];
  }

  const query = { userId: userObjectId };
  if (filters.simulatorType) {
    query.simulatorType = filters.simulatorType;
  }

  const docs = await SavedSimulation.find(query)
    .sort({ updatedAt: -1 })
    .lean();

  return docs.map(toPlainSavedSimulation);
}

export async function getSavedSimulationForUser(id, userId) {
  await connectToDatabase();

  const documentId = toObjectId(id);
  const userObjectId = toObjectId(userId);
  if (!documentId || !userObjectId) {
    return null;
  }

  const doc = await SavedSimulation.findOne({
    _id: documentId,
    userId: userObjectId,
  }).lean();

  return toPlainSavedSimulation(doc);
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

  return toPlainSavedSimulation(doc);
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

  return toPlainSavedSimulation(doc);
}

export async function deleteSavedSimulationForUser(id, userId) {
  await connectToDatabase();

  const documentId = toObjectId(id);
  const userObjectId = toObjectId(userId);
  if (!documentId || !userObjectId) {
    return false;
  }

  const result = await SavedSimulation.deleteOne({
    _id: documentId,
    userId: userObjectId,
  });

  return result.deletedCount > 0;
}
