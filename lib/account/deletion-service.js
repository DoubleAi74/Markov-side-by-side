import "server-only";
import mongoose from "mongoose";
import { ObjectId } from "mongodb";
import connectToDatabase from "@/lib/db/mongoose";
import { getMongoClientPromise } from "@/lib/db/mongodb";
import SavedSimulation from "@/models/SavedSimulation";
import UserCredential from "@/models/UserCredential";
import PasswordResetToken from "@/models/PasswordResetToken";
import {
  deleteProfileImageObject,
  deleteSavedSimulationPreviewObject,
} from "@/lib/storage/r2";

function getDatabase(client) {
  return client.db(process.env.MONGODB_DB || undefined);
}

/**
 * Permanently removes an account and everything attached to it.
 *
 * Ordering matters: stored-object keys are collected first, owned records are
 * removed next, and the user document is deleted last. If any step throws, the
 * user document still exists and the whole operation can be retried. Blob
 * cleanup runs at the very end and is best-effort — an orphaned image in R2 is
 * recoverable, a user record pointing at deleted data is not.
 */
export async function deleteAccountForUser(userId) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return null;
  }

  await connectToDatabase();
  const mongooseUserId = new mongoose.Types.ObjectId(userId);
  const nativeUserId = new ObjectId(userId);

  const client = await getMongoClientPromise();
  const database = getDatabase(client);
  const users = database.collection("users");

  const user = await users.findOne(
    { _id: nativeUserId },
    { projection: { email: 1, profileImage: 1 } },
  );
  if (!user) {
    return null;
  }

  // 1. Collect every stored object before the records that reference them go.
  const savedSimulations = await SavedSimulation.find({
    userId: mongooseUserId,
  })
    .select("preview")
    .lean();

  const previewKeys = savedSimulations
    .map((doc) => doc.preview?.objectKey)
    .filter(Boolean);
  const profileKey = user.profileImage?.objectKey ?? null;

  // 2. Application-owned records.
  const removedSimulations = await SavedSimulation.deleteMany({
    userId: mongooseUserId,
  });
  const removedCredentials = await UserCredential.deleteMany({
    userId: mongooseUserId,
  });
  const removedResetTokens = await PasswordResetToken.deleteMany({
    userId: mongooseUserId,
  });

  // 3. Auth.js adapter records. `accounts` has no documents while only the
  // email and credentials providers are configured, but delete defensively so
  // adding an OAuth provider later cannot leave orphans behind.
  const removedAccounts = await database
    .collection("accounts")
    .deleteMany({ userId: nativeUserId });
  const removedSessions = await database
    .collection("sessions")
    .deleteMany({ userId: nativeUserId });

  let removedVerificationTokens = { deletedCount: 0 };
  if (user.email) {
    removedVerificationTokens = await database
      .collection("verification_tokens")
      .deleteMany({ identifier: user.email });
  }

  // 4. The user document last, so a failure above leaves a retryable account.
  const removedUser = await users.deleteOne({ _id: nativeUserId });
  if (removedUser.deletedCount === 0) {
    return null;
  }

  // 5. Best-effort blob cleanup; never fail the deletion over storage.
  let storageFailures = 0;
  const removeObject = async (key, remove) => {
    try {
      await remove(key);
    } catch {
      storageFailures += 1;
    }
  };

  await Promise.all([
    ...previewKeys.map((key) =>
      removeObject(key, deleteSavedSimulationPreviewObject),
    ),
    ...(profileKey ? [removeObject(profileKey, deleteProfileImageObject)] : []),
  ]);

  return {
    savedSimulations: removedSimulations.deletedCount,
    credentials: removedCredentials.deletedCount,
    passwordResetTokens: removedResetTokens.deletedCount,
    accounts: removedAccounts.deletedCount,
    sessions: removedSessions.deletedCount,
    verificationTokens: removedVerificationTokens.deletedCount,
    storedObjects: previewKeys.length + (profileKey ? 1 : 0),
    storageFailures,
  };
}
