import { createClient, type Client } from "@libsql/client";
import { config } from "../config/env.js";

let dbInstance: Client | null = null;

export function getDb(): Client {
  if (!dbInstance) {
    dbInstance = createClient({
      url: config.turso.url,
      authToken: config.turso.authToken,
    });
  }
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
