import "server-only";
import { ObjectId } from "mongodb";
import { getMongoClientPromise } from "@/lib/db/mongodb";

function getDatabase(client) {
  return client.db(process.env.MONGODB_DB || undefined);
}

function getUsersCollection(client) {
  return getDatabase(client).collection("users");
}

export async function findAuthUserByEmail(email) {
  const client = await getMongoClientPromise();
  return getUsersCollection(client).findOne({ email });
}

export async function findAuthUserById(id) {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  const client = await getMongoClientPromise();
  return getUsersCollection(client).findOne({ _id: new ObjectId(id) });
}

export async function createAuthUser({ email }) {
  const client = await getMongoClientPromise();
  const users = getUsersCollection(client);

  const document = {
    name: null,
    email,
    emailVerified: null,
    image: null,
  };

  const result = await users.insertOne(document);
  return { ...document, _id: result.insertedId };
}
