import mongoose from "mongoose";

const globalForMongoose = globalThis;

function getMongoUri() {
  if (!process.env.MONGODB_URI) {
    throw new Error("Missing MONGODB_URI environment variable.");
  }
  return process.env.MONGODB_URI;
}

export async function connectToDatabase() {
  if (!globalForMongoose.__mongooseConnection) {
    globalForMongoose.__mongooseConnection = { conn: null, promise: null };
  }

  const cached = globalForMongoose.__mongooseConnection;

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(getMongoUri(), {
      dbName: process.env.MONGODB_DB || undefined,
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectToDatabase;
