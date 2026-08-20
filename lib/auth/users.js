import "server-only";
import { ObjectId } from "mongodb";
import { getMongoClientPromise } from "@/lib/db/mongodb";
import {
  createUsernameSlug,
  normalizeUsernameSlug,
  withNumericSlugSuffix,
} from "@/lib/slugs";

const globalForUsers = globalThis;
const USERNAME_INDEX_NAME = "users_unique_username";
const USERNAME_MAX_ATTEMPTS = 5000;

function getDatabase(client) {
  return client.db(process.env.MONGODB_DB || undefined);
}

function getUsersCollection(client) {
  return getDatabase(client).collection("users");
}

function toObjectId(value) {
  if (!ObjectId.isValid(value)) {
    return null;
  }

  return new ObjectId(value);
}

function extractEmailHandle(value) {
  if (typeof value !== "string") {
    return "";
  }

  const [localPart = ""] = value.trim().toLowerCase().split("@");
  return localPart;
}

function buildUsernameSeed({ preferredUsername, user }) {
  const preferred = normalizeUsernameSlug(preferredUsername ?? "");
  if (preferred) {
    return preferred;
  }

  const fromName = normalizeUsernameSlug(user?.name ?? "");
  if (fromName) {
    return fromName;
  }

  const fromEmail = normalizeUsernameSlug(extractEmailHandle(user?.email ?? ""));
  if (fromEmail) {
    return fromEmail;
  }

  const idSuffix = String(user?._id ?? "").slice(-6);
  return createUsernameSlug(idSuffix, "user");
}

async function ensureUsersIndexes(users) {
  if (globalForUsers.__usersUsernameIndexReady) {
    return;
  }

  await users.createIndex(
    { username: 1 },
    {
      name: USERNAME_INDEX_NAME,
      unique: true,
      sparse: true,
    },
  );

  globalForUsers.__usersUsernameIndexReady = true;
}

async function findAvailableUsername(users, baseUsername, { excludeUserId } = {}) {
  for (let index = 1; index <= USERNAME_MAX_ATTEMPTS; index += 1) {
    const candidate = withNumericSlugSuffix(baseUsername, index, {
      maxLength: 32,
    });

    const query = { username: candidate };
    if (excludeUserId) {
      query._id = { $ne: excludeUserId };
    }

    const existing = await users.findOne(query, { projection: { _id: 1 } });
    if (!existing) {
      return candidate;
    }
  }

  throw new UsernameConflictError(
    "Unable to generate a unique username. Please choose a different one.",
  );
}

export class UsernameInputError extends Error {}

export class UsernameConflictError extends Error {}

export async function findAuthUserByEmail(email) {
  const client = await getMongoClientPromise();
  return getUsersCollection(client).findOne({ email });
}

export async function findAuthUserById(id) {
  const objectId = toObjectId(id);
  if (!objectId) {
    return null;
  }

  const client = await getMongoClientPromise();
  return getUsersCollection(client).findOne({ _id: objectId });
}

export async function findAuthUserByUsername(username) {
  const normalized = normalizeUsernameSlug(username);
  if (!normalized) {
    return null;
  }

  const client = await getMongoClientPromise();
  return getUsersCollection(client).findOne({ username: normalized });
}

export async function ensureAuthUserUsername(userId, preferredUsername) {
  const objectId = toObjectId(userId);
  if (!objectId) {
    return null;
  }

  const client = await getMongoClientPromise();
  const users = getUsersCollection(client);
  await ensureUsersIndexes(users);

  const user = await users.findOne({ _id: objectId });
  if (!user) {
    return null;
  }

  const storedUsername = normalizeUsernameSlug(user.username ?? "");
  if (storedUsername && storedUsername === user.username) {
    return user;
  }

  const baseUsername = storedUsername || buildUsernameSeed({ preferredUsername, user });
  const nextUsername = await findAvailableUsername(users, baseUsername, {
    excludeUserId: objectId,
  });

  await users.updateOne(
    { _id: objectId },
    {
      $set: {
        username: nextUsername,
      },
    },
  );

  return {
    ...user,
    username: nextUsername,
  };
}

export async function updateAuthUsername(userId, requestedUsername) {
  const objectId = toObjectId(userId);
  if (!objectId) {
    throw new UsernameInputError("Invalid user id.");
  }

  const normalized = normalizeUsernameSlug(requestedUsername);
  if (!normalized) {
    throw new UsernameInputError(
      "Username must include letters or numbers.",
    );
  }

  const client = await getMongoClientPromise();
  const users = getUsersCollection(client);
  await ensureUsersIndexes(users);

  const user = await users.findOne({ _id: objectId });
  if (!user) {
    return null;
  }

  if (user.username === normalized) {
    return user;
  }

  const conflict = await users.findOne(
    {
      username: normalized,
      _id: { $ne: objectId },
    },
    { projection: { _id: 1 } },
  );

  if (conflict) {
    throw new UsernameConflictError("Username is already taken.");
  }

  await users.updateOne(
    { _id: objectId },
    {
      $set: {
        username: normalized,
      },
    },
  );

  return {
    ...user,
    username: normalized,
  };
}

export async function createAuthUser({ email }) {
  const client = await getMongoClientPromise();
  const users = getUsersCollection(client);

  const document = {
    name: null,
    email,
    emailVerified: null,
    image: null,
    username: null,
  };

  const result = await users.insertOne(document);
  const created = {
    ...document,
    _id: result.insertedId,
  };

  const withUsername = await ensureAuthUserUsername(
    result.insertedId.toString(),
    extractEmailHandle(email),
  );

  return withUsername || created;
}
