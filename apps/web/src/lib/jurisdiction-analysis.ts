import "server-only";

import { unstable_cache } from "next/cache";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  allowLocalFallback,
  getDatabaseClient,
  handleDatabaseReadFailure,
  OBSERVATORY_CACHE_TAG,
  OBSERVATORY_REVALIDATE_SECONDS,
  withDbTimeout,
} from "@/lib/db";
import { frameTextHue } from "@/lib/frame-vocab";
import { jurisdictionMeta, type JurisdictionKey } from "@/lib/jurisdictions";
import type { FrameLabel } from "@/lib/seed-data";
import {
  humanizeProseTaxonomyKeys,
  humanizeTaxonomyLabel,
} from "@/lib/taxonomy-vocab";

export type JurisdictionAnalysisLabelStat = {
  label: string;
  count: number;
  share: number;
};

export type JurisdictionAnalysisFrameStat = {
  label: string;
  score: number;
  share: number;
  document_mentions: number;
};

export type JurisdictionAnalysisSource = {
  document_id: string;
  title: string;
  publication_date?: string | null;
  document_type?: string | null;
  binding_strength?: string | null;
  dominant_frame?: string | null;
  contribution: string;
};

export type JurisdictionAnalysis = {
  jurisdiction: JurisdictionKey;
  analysis_method: string;
  analysis_version: string;
  generated_at: string;
  source_count: number;
  source_document_ids: string[];
  source_window_start?: string | null;
  source_window_end?: string | null;
  summary: string;
  governance_posture: string;
  framing_landscape: string;
  implementation_and_enforcement: string;
  source_coverage_note: string;
  key_sources: JurisdictionAnalysisSource[];
  top_document_types: JurisdictionAnalysisLabelStat[];
  top_binding_strengths: JurisdictionAnalysisLabelStat[];
  top_requirements: JurisdictionAnalysisLabelStat[];
  top_enforcement_mechanisms: JurisdictionAnalysisLabelStat[];
  top_frames: JurisdictionAnalysisFrameStat[];
  key_institutions: string[];
  confidence: number;
};

type DbRow = {
  analysis_payload: JurisdictionAnalysis;
};

const WORKSPACE_ROOT = path.resolve(
  /*turbopackIgnore: true*/ process.cwd(),
  "..",
  "..",
);

async function loadJurisdictionAnalysisUncached(
  jurisdiction: JurisdictionKey,
): Promise<JurisdictionAnalysis | null> {
  const sql = getDatabaseClient();
  if (sql) {
    try {
      const rows = (await withDbTimeout(
        sql`
          SELECT analysis_payload
          FROM machine_jurisdiction_analyses
          WHERE jurisdiction = ${jurisdiction}
          ORDER BY created_at DESC
          LIMIT 1
        `,
        `jurisdiction analysis ${jurisdiction}`,
      )) as DbRow[];
      const payload = rows[0]?.analysis_payload;
      if (payload) {
        return normalizeJurisdictionAnalysis(payload, jurisdiction);
      }
      if (!allowLocalFallback()) {
        return null;
      }
    } catch (error) {
      handleDatabaseReadFailure(
        `jurisdiction analysis for ${jurisdiction} from Neon`,
        error,
      );
      if (!allowLocalFallback()) {
        throw error;
      }
    }
  }

  return loadFallbackJurisdictionAnalysis(jurisdiction);
}

const getJurisdictionAnalysisCached = unstable_cache(
  loadJurisdictionAnalysisUncached,
  ["observatory-jurisdiction-analysis-v2"],
  {
    revalidate: OBSERVATORY_REVALIDATE_SECONDS,
    tags: [OBSERVATORY_CACHE_TAG],
  },
);

export async function getJurisdictionAnalysis(
  jurisdiction: JurisdictionKey,
): Promise<JurisdictionAnalysis | null> {
  return getJurisdictionAnalysisCached(jurisdiction);
}

async function loadFallbackJurisdictionAnalysis(
  jurisdiction: JurisdictionKey,
): Promise<JurisdictionAnalysis | null> {
  const filePath = path.join(
    WORKSPACE_ROOT,
    "data",
    "analysis",
    "jurisdictions",
    jurisdiction,
    "jurisdiction_analysis.json",
  );
  try {
    const contents = await readFile(filePath, "utf-8");
    return normalizeJurisdictionAnalysis(
      JSON.parse(contents) as JurisdictionAnalysis,
      jurisdiction,
    );
  } catch {
    return null;
  }
}

function normalizeJurisdictionAnalysis(
  payload: JurisdictionAnalysis,
  jurisdiction: JurisdictionKey,
): JurisdictionAnalysis {
  return {
    ...payload,
    jurisdiction,
    summary: humanizeProseTaxonomyKeys(payload.summary ?? ""),
    governance_posture: humanizeProseTaxonomyKeys(
      payload.governance_posture ?? "",
    ),
    framing_landscape: humanizeProseTaxonomyKeys(
      payload.framing_landscape ?? "",
    ),
    implementation_and_enforcement: humanizeProseTaxonomyKeys(
      payload.implementation_and_enforcement ?? "",
    ),
    source_coverage_note: humanizeProseTaxonomyKeys(
      payload.source_coverage_note ?? "",
    ),
    key_sources: (payload.key_sources ?? []).map((src) => ({
      ...src,
      contribution: humanizeProseTaxonomyKeys(src.contribution ?? ""),
    })),
    top_document_types: payload.top_document_types ?? [],
    top_binding_strengths: payload.top_binding_strengths ?? [],
    top_requirements: payload.top_requirements ?? [],
    top_enforcement_mechanisms: payload.top_enforcement_mechanisms ?? [],
    top_frames: payload.top_frames ?? [],
    key_institutions: payload.key_institutions ?? [],
    source_document_ids: payload.source_document_ids ?? [],
  };
}

export function humanizeJurisdictionAnalysisLabel(
  label?: string | null,
): string {
  return humanizeTaxonomyLabel(label);
}

export function jurisdictionAnalysisFrameColor(frame?: string | null): string {
  if (frame && frame in frameTextHue) {
    return frameTextHue[frame as FrameLabel];
  }
  return "#a3b0c2";
}

export function jurisdictionName(jurisdiction: JurisdictionKey): string {
  return jurisdictionMeta[jurisdiction].name;
}
