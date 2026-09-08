import "server-only";
import mongoose from "mongoose";
import { ObjectId } from "mongodb";
import connectToDatabase from "@/lib/db/mongoose";
import { getMongoClientPromise } from "@/lib/db/mongodb";
import SavedSimulation from "@/models/SavedSimulation";
import { isCommunityVisible, toPublicProfileImage } from "@/lib/community/profile";

const MAX_COMMUNITY_MEMBERS = 500;

function getUsersCollection(client) {
  return client.db(process.env.MONGODB_DB || undefined).collection("users");
}

function toUserObjectId(value) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

/**
 * Members are the users who have saved at least one model and have not opted
 * out. The model counts come from Mongoose and the profiles from the Auth.js
 * users collection, so this joins across the two clients in application code
 * rather than with $lookup.
 */
export async function listCommunityMembers() {
  await connectToDatabase();

  const grouped = await SavedSimulation.aggregate([
    {
      $group: {
        _id: "$userId",
        modelCount: { $sum: 1 },
        lastSavedAt: { $max: "$updatedAt" },
      },
    },
    { $sort: { lastSavedAt: -1 } },
    { $limit: MAX_COMMUNITY_MEMBERS },
  ]);

  if (grouped.length === 0) {
    return [];
  }

  const statsByUserId = new Map(
    grouped.map((entry) => [String(entry._id), entry]),
  );

  const client = await getMongoClientPromise();
  const users = await getUsersCollection(client)
    .find(
      { _id: { $in: grouped.map((entry) => new ObjectId(String(entry._id))) } },
      { projection: { username: 1, profileImage: 1, communityHidden: 1 } },
    )
    .toArray();

  return users
    .filter((user) => user.username && isCommunityVisible(user))
    .map((user) => {
      const stats = statsByUserId.get(user._id.toString());
      return {
        id: user._id.toString(),
        username: user.username,
        modelCount: stats?.modelCount ?? 0,
        lastSavedAt: stats?.lastSavedAt
          ? new Date(stats.lastSavedAt).toISOString()
          : null,
        profileImage: toPublicProfileImage(user.profileImage),
      };
    })
    .sort((a, b) => {
      if (a.lastSavedAt === b.lastSavedAt) {
        return a.username.localeCompare(b.username);
      }
      return (b.lastSavedAt ?? "").localeCompare(a.lastSavedAt ?? "");
    });
}

export async function getCommunityProfile(userId) {
  const objectId = toUserObjectId(userId);
  if (!objectId) {
    return null;
  }

  const client = await getMongoClientPromise();
  const user = await getUsersCollection(client).findOne(
    { _id: objectId },
    { projection: { username: 1, profileImage: 1, communityHidden: 1 } },
  );

  if (!user) {
    return null;
  }

  return {
    id: user._id.toString(),
    username: user.username ?? null,
    communityHidden: user.communityHidden === true,
    profileImage: toPublicProfileImage(user.profileImage),
    profileImageObjectKey: user.profileImage?.objectKey ?? null,
  };
}

export async function setUserProfileImage(userId, profileImage) {
  const objectId = toUserObjectId(userId);
  if (!objectId) {
    return null;
  }

  const client = await getMongoClientPromise();
  const result = await getUsersCollection(client).findOneAndUpdate(
    { _id: objectId },
    { $set: { profileImage } },
    {
      returnDocument: "after",
      projection: { username: 1, profileImage: 1, communityHidden: 1 },
    },
  );

  const user = result?.value ?? result;
  if (!user?._id) {
    return null;
  }

  return {
    id: user._id.toString(),
    username: user.username ?? null,
    communityHidden: user.communityHidden === true,
    profileImage: toPublicProfileImage(user.profileImage),
  };
}

export async function clearUserProfileImage(userId) {
  const objectId = toUserObjectId(userId);
  if (!objectId) {
    return null;
  }

  const client = await getMongoClientPromise();
  await getUsersCollection(client).updateOne(
    { _id: objectId },
    { $unset: { profileImage: "" } },
  );

  return getCommunityProfile(userId);
}

export async function setCommunityVisibility(userId, hidden) {
  const objectId = toUserObjectId(userId);
  if (!objectId) {
    return null;
  }

  const client = await getMongoClientPromise();
  await getUsersCollection(client).updateOne(
    { _id: objectId },
    hidden ? { $set: { communityHidden: true } } : { $unset: { communityHidden: "" } },
  );

  return getCommunityProfile(userId);
}

export async function countSavedSimulationsForUser(userId) {
  await connectToDatabase();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return 0;
  }

  return SavedSimulation.countDocuments({
    userId: new mongoose.Types.ObjectId(userId),
  });
}
