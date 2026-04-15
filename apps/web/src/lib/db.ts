import "server-only";

import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL?.trim() || "";

function isStrictDatabaseRuntime(): boolean {
  if (!databaseUrl) {
    return false;
  }

  return (
    process.env.VERCEL === "1" ||
    Boolean(process.env.VERCEL_ENV) ||
    process.env.OBSERVATORY_STRICT_DATABASE === "1"
  );
}

export function getDatabaseClient() {
  if (!databaseUrl) {
    return null;
  }

  return neon(databaseUrl);
}

export function allowLocalFallback(): boolean {
  return !isStrictDatabaseRuntime();
}

export function currentDatasetLabel(): string {
  if (!databaseUrl) {
    return "Local fallback snapshot";
  }
  if (isStrictDatabaseRuntime()) {
    return "Live Neon database snapshot";
  }
  return "Database-backed snapshot";
}

export function handleDatabaseReadFailure(context: string, error: unknown): never | void {
  console.error(`Failed to load ${context}`, error);
  if (isStrictDatabaseRuntime()) {
    throw error instanceof Error
      ? error
      : new Error(`Failed to load ${context}`);
  }
}
