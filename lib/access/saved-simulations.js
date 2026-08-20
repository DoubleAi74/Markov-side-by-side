import mongoose from "mongoose";

export const NOT_DELETED_SCOPE = { deletedAt: null };
export const PUBLIC_SCOPE = { visibility: { $ne: "private" }, deletedAt: null };

export function asObjectId(value) {
  if (!mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

export function ownerModelScope(userId, { includeDeleted = false } = {}) {
  const ownerId = asObjectId(userId);
  if (!ownerId) return null;
  return {
    userId: ownerId,
    ...(includeDeleted ? {} : NOT_DELETED_SCOPE),
  };
}

export function publicModelScope(ownerId) {
  const userId = asObjectId(ownerId);
  if (!userId) return null;
  return { userId, ...PUBLIC_SCOPE };
}

export function modelAccessScope({ userId = null, allowPublic = false } = {}) {
  const ownerId = asObjectId(userId);
  if (ownerId && allowPublic) {
    return {
      deletedAt: null,
      $or: [{ userId: ownerId }, { visibility: { $ne: "private" } }],
    };
  }
  if (ownerId) return { userId: ownerId, deletedAt: null };
  return allowPublic ? { ...PUBLIC_SCOPE } : { _id: null };
}

export function isOwner(model, userId) {
  return Boolean(model?.userId && userId && String(model.userId) === String(userId));
}

// Intentionally one response for absent, private, deleted, and unauthorized models.
export const PRIVATE_SAFE_NOT_FOUND = Object.freeze({
  error: "Saved simulation not found.",
});
