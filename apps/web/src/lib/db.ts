import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export const OBSERVATORY_CACHE_TAG = "observatory";
export const OBSERVATORY_REVALIDATE_SECONDS = 3600;
const DB_QUERY_TIMEOUT_MS = 12_000;

/**
 * Shared headers for public read-only GET APIs:
 * - Short stale-while-revalidate window (60s) so CDN copies stay tight after revalidation.
 * - Permissive CORS so external notebooks, scripts, and research tools can query directly.
 */
export const PUBLIC_API_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const;

let cachedClient: NeonQueryFunction<false, false> | null = null;
let cachedUrl = "";

function readDatabaseUrl(): string {
  return process.env.DATABASE_URL?.trim() || "";
}

export function isVercelDeployment(): boolean {
  return Boolean(process.env.VERCEL_ENV?.trim());
}

export function isStrictDatabaseRuntime(): boolean {
  if (process.env.OBSERVATORY_STRICT_DATABASE === "1") {
    return true;
  }
  if (isVercelDeployment()) {
    return true;
  }
  const databaseUrl = readDatabaseUrl();
  if (!databaseUrl) {
    return false;
  }
  if (process.env.OBSERVATORY_ALLOW_LOCAL_FALLBACK === "1") {
    return false;
  }
  return process.env.VERCEL === "1";
}

export function getDatabaseClient(): NeonQueryFunction<false, false> | null {
  const databaseUrl = readDatabaseUrl();
  if (!databaseUrl) {
    return null;
  }
  if (cachedClient && cachedUrl === databaseUrl) {
    return cachedClient;
  }
  cachedUrl = databaseUrl;
  cachedClient = neon(databaseUrl);
  return cachedClient;
}

export function allowLocalFallback(): boolean {
  if (isVercelDeployment()) {
    return false;
  }
  return !isStrictDatabaseRuntime();
}

/**
 * Never serve synthetic seed data on Vercel deployments (A1).
 * Only local environments with neither DB nor local filesystem corpus may use seedData.
 */
export function allowSeedFallback(): boolean {
  return !isVercelDeployment() && !isStrictDatabaseRuntime();
}

export function currentDatasetLabel(): string {
  if (!readDatabaseUrl()) {
    return isVercelDeployment()
      ? "No observatory data loaded"
      : "Filesystem analysis snapshot";
  }
  if (isStrictDatabaseRuntime()) {
    return "Live Neon database snapshot";
  }
  return "Database-backed snapshot";
}

export function handleDatabaseReadFailure(
  context: string,
  error: unknown,
): never | void {
  console.error(`Failed to load ${context}`, error);
  if (isStrictDatabaseRuntime()) {
    throw error instanceof Error
      ? error
      : new Error(`Failed to load ${context}`);
  }
}

export async function withDbTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = DB_QUERY_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Database query timed out after ${timeoutMs}ms (${label})`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export function isUndefinedColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  return (
    candidate.code === "42703" ||
    Boolean(candidate.message?.includes("does not exist"))
  );
}
