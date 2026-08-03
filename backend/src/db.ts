import mongoose from "mongoose";
import { loadEnv } from "./env.ts";

let connecting = false;

export async function connectDb(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connecting) {
    // Await an in-flight connect rather than opening a second connection.
    await new Promise((r) => setTimeout(r, 100));
    return connectDb();
  }
  connecting = true;
  const env = loadEnv();
  await mongoose.connect(env.mongoUrl, {
    dbName: env.mongoUrl.includes("/finne") ? undefined : "finne",
  });
  connecting = false;
  return mongoose;
}

export async function disconnectDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
