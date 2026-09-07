import "server-only";
import mongoose from "mongoose";
import connectToDatabase from "@/lib/db/mongoose";
import SavedSimulation from "@/models/SavedSimulation";
import { findAuthUserByUsername } from "@/lib/auth/users";
import {
  createSavedSimulationSlug,
  normalizeSavedSimulationSlug,
  normalizeUsernameSlug,
  withNumericSlugSuffix,
} from "@/lib/slugs";

const SAVED_SIMULATION_SUMMARY_SELECT =
  "userId simulatorType name slug description payloadVersion preview lastOpenedAt createdAt updatedAt";
const MAX_SLUG_ATTEMPTS = 5000;

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
    slug: value.slug ?? null,
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

function getPublicOwnerProfile(user) {
  if (!user?._id || !user?.username) {
    return null;
  }

  return {
    id: user._id.toString(),
    username: user.username,
    name: typeof user.name === "string" ? user.name : "",
    image: typeof user.image === "string" ? user.image : null,
  };
}

async function createUniqueSavedSimulationSlug({
  userId,
  name,
  excludeId = null,
}) {
  const userObjectId = toObjectId(userId);
  if (!userObjectId) {
    throw new Error("Invalid user id.");
  }

  const excludeObjectId = excludeId ? toObjectId(excludeId) : null;
  const baseSlug = createSavedSimulationSlug(name);

  for (let index = 1; index <= MAX_SLUG_ATTEMPTS; index += 1) {
    const candidate = withNumericSlugSuffix(baseSlug, index, {
      maxLength: 80,
    });

    const query = {
      userId: userObjectId,
      slug: candidate,
    };
    if (excludeObjectId) {
      query._id = { $ne: excludeObjectId };
    }

    const existing = await SavedSimulation.exists(query);
    if (!existing) {
      return candidate;
    }
  }

  throw new Error("Unable to create a unique model slug.");
}

async function ensureSavedSimulationSlug(doc) {
  if (!doc?._id || !doc?.userId) {
    return doc;
  }

  const normalizedSlug = normalizeSavedSimulationSlug(doc.slug ?? "");
  if (normalizedSlug && normalizedSlug === doc.slug) {
    return doc;
  }

  const nextSlug = await createUniqueSavedSimulationSlug({
    userId: doc.userId,
    name: doc.name,
    excludeId: doc._id,
  });

  await SavedSimulation.updateOne(
    { _id: doc._id },
    {
      $set: {
        slug: nextSlug,
      },
    },
  );

  doc.slug = nextSlug;
  return doc;
}

async function ensureSavedSimulationSlugList(docs) {
  const orderedDocs = [...docs].sort((a, b) => {
    const aCreatedAt = new Date(a?.createdAt ?? 0).getTime();
    const bCreatedAt = new Date(b?.createdAt ?? 0).getTime();
    if (aCreatedAt !== bCreatedAt) {
      return aCreatedAt - bCreatedAt;
    }

    return String(a?._id ?? "").localeCompare(String(b?._id ?? ""));
  });

  for (const doc of orderedDocs) {
    // Process serially to avoid initial backfill collisions for similarly named models.
    await ensureSavedSimulationSlug(doc);
  }

  return docs;
}

async function ensureMissingSavedSimulationSlugsForUser(userId) {
  const userObjectId = toObjectId(userId);
  if (!userObjectId) {
    return;
  }

  const docs = await SavedSimulation.find({
    userId: userObjectId,
    $or: [{ slug: null }, { slug: "" }],
  })
    .select("_id userId name slug")
    .lean();

  await ensureSavedSimulationSlugList(docs);
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

  await ensureSavedSimulationSlugList(docs);
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

  await ensureSavedSimulationSlug(doc);
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

  const slug = await createUniqueSavedSimulationSlug({
    userId: userObjectId,
    name: input.name,
  });

  const doc = await SavedSimulation.create({
    userId: userObjectId,
    simulatorType: input.simulatorType,
    name: input.name,
    slug,
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

  const updateInput = { ...input };
  if (typeof updateInput.name === "string") {
    updateInput.slug = await createUniqueSavedSimulationSlug({
      userId: userObjectId,
      name: updateInput.name,
      excludeId: documentId,
    });
  }

  const doc = await SavedSimulation.findOneAndUpdate(
    { _id: documentId, userId: userObjectId },
    { $set: updateInput },
    { new: true },
  ).lean();

  await ensureSavedSimulationSlug(doc);
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

  await ensureSavedSimulationSlug(doc);
  return toPlainSavedSimulation(doc, { includePayload: false });
}

export async function listPublicSavedSimulationsByUsername(username) {
  await connectToDatabase();

  const normalizedUsername = normalizeUsernameSlug(username);
  if (!normalizedUsername) {
    return null;
  }

  const authUser = await findAuthUserByUsername(normalizedUsername);
  const owner = getPublicOwnerProfile(authUser);
  if (!owner) {
    return null;
  }

  const docs = await SavedSimulation.find({
    userId: toObjectId(owner.id),
  })
    .sort({ updatedAt: -1 })
    .select(SAVED_SIMULATION_SUMMARY_SELECT)
    .lean();

  await ensureSavedSimulationSlugList(docs);

  return {
    owner,
    items: docs.map((doc) => toPlainSavedSimulation(doc, { includePayload: false })),
  };
}

export async function getPublicSavedSimulationByUsernameAndSlug(
  username,
  slug,
  options = {},
) {
  await connectToDatabase();

  const normalizedUsername = normalizeUsernameSlug(username);
  const normalizedSlug = normalizeSavedSimulationSlug(slug);
  if (!normalizedUsername || !normalizedSlug) {
    return null;
  }

  const authUser = await findAuthUserByUsername(normalizedUsername);
  const owner = getPublicOwnerProfile(authUser);
  if (!owner) {
    return null;
  }

  const userObjectId = toObjectId(owner.id);
  if (!userObjectId) {
    return null;
  }

  let doc = await applyPayloadSelection(
    SavedSimulation.findOne({
      userId: userObjectId,
      slug: normalizedSlug,
    }),
    options.includePayload ?? true,
  ).lean();

  if (!doc) {
    await ensureMissingSavedSimulationSlugsForUser(userObjectId);
    doc = await applyPayloadSelection(
      SavedSimulation.findOne({
        userId: userObjectId,
        slug: normalizedSlug,
      }),
      options.includePayload ?? true,
    ).lean();
  }

  await ensureSavedSimulationSlug(doc);
  if (!doc) {
    return null;
  }

  return {
    owner,
    savedSimulation: toPlainSavedSimulation(doc, {
      includePayload: true,
      ...options,
    }),
  };
}
