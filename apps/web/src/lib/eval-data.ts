import "server-only";

import { unstable_cache } from "next/cache";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { OBSERVATORY_CACHE_TAG, OBSERVATORY_REVALIDATE_SECONDS } from "@/lib/db";
import {
  parseGoldSetEvaluation,
  type GoldSetEvaluationSummary,
} from "@/lib/eval-parser";

const WORKSPACE_ROOT = path.resolve(
  /*turbopackIgnore: true*/ process.cwd(),
  "..",
  "..",
);

async function tryReadEvalFile(
  filePath: string,
): Promise<GoldSetEvaluationSummary | null> {
  try {
    const rawText = await readFile(/*turbopackIgnore: true*/ filePath, "utf8");
    return parseGoldSetEvaluation(JSON.parse(rawText));
  } catch {
    return null;
  }
}

async function readGoldSetEvaluationUncached(): Promise<GoldSetEvaluationSummary | null> {
  const repoEvalPath = path.join(
    WORKSPACE_ROOT,
    "data",
    "eval",
    "gold_set_results.json",
  );
  const fromRepo = await tryReadEvalFile(repoEvalPath);
  if (fromRepo) return fromRepo;

  const snapshotPath = path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    "src",
    "lib",
    "gold-set-results.snapshot.json",
  );
  return tryReadEvalFile(snapshotPath);
}

const getGoldSetEvaluationCached = unstable_cache(
  readGoldSetEvaluationUncached,
  ["observatory-gold-set-eval-v1"],
  {
    revalidate: OBSERVATORY_REVALIDATE_SECONDS,
    tags: [OBSERVATORY_CACHE_TAG],
  },
);

export async function getGoldSetEvaluation(): Promise<GoldSetEvaluationSummary | null> {
  return getGoldSetEvaluationCached();
}
