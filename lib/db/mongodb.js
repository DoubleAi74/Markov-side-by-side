import { MongoClient } from "mongodb";

const globalForMongo = globalThis;

function getMongoUri() {
  if (!process.env.MONGODB_URI) {
    throw new Error("Missing MONGODB_URI environment variable.");
  }
  return process.env.MONGODB_URI;
}

function createClient() {
  return new MongoClient(getMongoUri());
}

export function getMongoClient() {
  if (!globalForMongo.__mongoClient) {
    globalForMongo.__mongoClient = createClient();
  }
  return globalForMongo.__mongoClient;
}

export function getMongoClientPromise() {
  if (!globalForMongo.__mongoClientPromise) {
    globalForMongo.__mongoClientPromise = getMongoClient().connect();
  }
  return globalForMongo.__mongoClientPromise;
}

export default getMongoClientPromise;
