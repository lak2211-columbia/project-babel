import "server-only";

import { unstable_cache } from "next/cache";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  allowLocalFallback,
  allowSeedFallback,
  currentDatasetLabel,
  getDatabaseClient,
  handleDatabaseReadFailure,
  isUndefinedColumnError,
  OBSERVATORY_CACHE_TAG,
  OBSERVATORY_REVALIDATE_SECONDS,
  withDbTimeout,
} from "@/lib/db";
import {
  computeUnifiedConfidence,
  getDocumentListItems,
  type DocumentListItem,
} from "@/lib/document-data";
import {
  jurisdictionMeta,
  jurisdictionOrder,
  type JurisdictionKey,
} from "@/lib/jurisdictions";
import {
  computeScoringEngine,
  isKnownFrameLabel,
  round2,
  type ScoringDocumentInput,
} from "@/lib/scoring";
import {
  buildEmptyOverviewData,
  frameLabels,
  matrixLabels,
  seedData,
  type CountrySnapshot,
  type FrameLabel,
  type OverviewData,
  type ProvenanceSummary,
  type QueueDocument,
  type ScoringMode,
} from "@/lib/seed-data";
import {
  buildSyntheticSources,
  formatLongDate,
  formatShortDate,
  inferDatePrecision,
  type SourceEntry,
} from "@/lib/sources-data";
import {
  humanizeBindingStrength,
  humanizeCorpusRole,
  humanizeDocumentType,
  humanizeLanguage,
  humanizeLifecycleStage,
  humanizeRequirement,
} from "@/lib/taxonomy-vocab";

type DbOverviewRow = {
  document_id: string;
  title: string;
  jurisdiction: string;
  publication_date: string | null;
  publication_date_precision: string | null;
  manifest_binding_strength: string | null;
  corpus_role: string | null;
  lifecycle_stage: string | null;
  overall_confidence: number | string | null;
  dominant_frame_confidence: number | string | null;
  grounding_ratio: number | string | null;
  taxonomy_version: string | null;
  model: string | null;
  frame_shares_json: Record<string, number> | null;
  machine_analysis_id: number;
  policy_extraction: {
    document_type?: string;
    binding_strength?: string;
    publication_date?: string | null;
    confidence?: number;
    safety_requirements?: { label: string; confidence?: number }[];
    enforcement_mechanisms?: { label: string; confidence?: number }[];
  };
  risk_framing: {
    dominant_frame?: string;
    frame_confidence?: Record<string, number>;
    frame_share?: Record<string, number> | null;
  };
  machine_updated_at: string | null;
};

const WORKSPACE_ROOT = path.resolve(
  /*turbopackIgnore: true*/ process.cwd(),
  "..",
  "..",
);
const PARSED_ROOT = path.join(WORKSPACE_ROOT, "data", "parsed");
const RAW_ROOT = path.join(WORKSPACE_ROOT, "data", "raw");
const ANALYSIS_ROOT = path.join(WORKSPACE_ROOT, "data", "analysis");
const SOURCES_ROOT = path.join(WORKSPACE_ROOT, "data", "sources");

/**
 * Parses URL/API mode parameter (A3):
 * - "headline" (or legacy alias "weighted") -> Codebook §8.2 primary active instruments
 * - "all" (or legacy alias "equal") -> full corpus unweighted
 */
export function parseScoringMode(value?: string | null): ScoringMode {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "all" || normalized === "equal") {
    return "all";
  }
  return "headline";
}

function emptyOrSeedFallback(mode: ScoringMode): OverviewData {
  // A1: Never silently serve fake seedData on Vercel deployments!
  if (!allowSeedFallback()) {
    return buildEmptyOverviewData(mode, "No observatory data loaded");
  }
  return { ...seedData, scoringMode: mode };
}

async function loadOverviewDataUncached(mode: ScoringMode): Promise<OverviewData> {
  const sql = getDatabaseClient();
  if (!sql) {
    if (allowLocalFallback()) {
      const fallbackInput = await loadOverviewInputFromFilesystem();
      if (fallbackInput && fallbackInput.documentCount > 0) {
        return buildOverviewFromRows({
          ...fallbackInput,
          datasetLabel: "Filesystem analysis snapshot",
          mode,
        });
      }
    }
    return emptyOrSeedFallback(mode);
  }

  try {
    const countPromise = withDbTimeout(
      sql`SELECT COUNT(*)::int AS count FROM documents`,
      "overview document count",
    ) as Promise<{ count: number }[]>;

    const rowsPromise = (async () => {
      try {
        return (await withDbTimeout(
          sql`
            SELECT
              d.id AS document_id,
              d.title,
              d.jurisdiction,
              COALESCE(
                d.publication_date::text,
                d.raw_metadata->>'publication_date',
                d.raw_metadata->>'source_publication_date'
              ) AS publication_date,
              COALESCE(d.publication_date_precision, d.raw_metadata->>'publication_date_precision') AS publication_date_precision,
              COALESCE(d.binding_strength, d.raw_metadata->>'binding_strength') AS manifest_binding_strength,
              COALESCE(d.corpus_role, d.raw_metadata->>'corpus_role') AS corpus_role,
              COALESCE(d.lifecycle_stage, d.raw_metadata->>'lifecycle_stage') AS lifecycle_stage,
              latest_machine.id AS machine_analysis_id,
              latest_machine.overall_confidence,
              latest_machine.dominant_frame_confidence,
              latest_machine.grounding_ratio,
              latest_machine.taxonomy_version,
              latest_machine.model,
              latest_machine.frame_shares_json,
              latest_machine.policy_extraction,
              latest_machine.risk_framing,
              latest_machine.analyzed_at::text AS machine_updated_at
            FROM documents d
            JOIN LATERAL (
              SELECT *
              FROM machine_document_analyses m
              WHERE m.document_id = d.id
              ORDER BY m.updated_at DESC, m.id DESC
              LIMIT 1
            ) latest_machine ON TRUE
            ORDER BY
              COALESCE(d.publication_date::text, d.raw_metadata->>'publication_date', d.raw_metadata->>'source_publication_date') DESC NULLS LAST,
              d.id ASC
          `,
          "overview rows v5",
        )) as DbOverviewRow[];
      } catch (error) {
        if (!isUndefinedColumnError(error)) throw error;
        return (await withDbTimeout(
          sql`
            SELECT
              d.id AS document_id,
              d.title,
              d.jurisdiction,
              COALESCE(
                d.publication_date::text,
                d.raw_metadata->>'publication_date',
                d.raw_metadata->>'source_publication_date'
              ) AS publication_date,
              d.raw_metadata->>'publication_date_precision' AS publication_date_precision,
              d.raw_metadata->>'binding_strength' AS manifest_binding_strength,
              d.raw_metadata->>'corpus_role' AS corpus_role,
              d.raw_metadata->>'lifecycle_stage' AS lifecycle_stage,
              latest_machine.id AS machine_analysis_id,
              latest_machine.overall_confidence,
              latest_machine.dominant_frame_confidence,
              NULL::numeric AS grounding_ratio,
              NULL::text AS taxonomy_version,
              latest_machine.model,
              NULL::jsonb AS frame_shares_json,
              latest_machine.policy_extraction,
              latest_machine.risk_framing,
              NULL::text AS machine_updated_at
            FROM documents d
            JOIN LATERAL (
              SELECT *
              FROM machine_document_analyses m
              WHERE m.document_id = d.id
              ORDER BY m.updated_at DESC, m.id DESC
              LIMIT 1
            ) latest_machine ON TRUE
            ORDER BY
              COALESCE(d.publication_date::text, d.raw_metadata->>'publication_date', d.raw_metadata->>'source_publication_date') DESC NULLS LAST,
              d.id ASC
          `,
          "overview rows v1",
        )) as DbOverviewRow[];
      }
    })();

    const [documentCountRow, rows] = await Promise.all([countPromise, rowsPromise]);

    if (!rows.length && (documentCountRow[0]?.count ?? 0) === 0) {
      if (allowLocalFallback()) {
        const fallbackInput = await loadOverviewInputFromFilesystem();
        if (fallbackInput && fallbackInput.documentCount > 0) {
          return buildOverviewFromRows({
            ...fallbackInput,
            datasetLabel: "Filesystem analysis snapshot",
            mode,
          });
        }
      }
      return emptyOrSeedFallback(mode);
    }

    return buildOverviewFromRows({
      documentCount: documentCountRow[0]?.count ?? rows.length,
      rows,
      datasetLabel: currentDatasetLabel(),
      mode,
    });
  } catch (error) {
    handleDatabaseReadFailure("overview data from Neon", error);
    if (!allowLocalFallback()) {
      throw error;
    }
    const fallbackInput = await loadOverviewInputFromFilesystem();
    if (fallbackInput && fallbackInput.documentCount > 0) {
      return buildOverviewFromRows({
        ...fallbackInput,
        datasetLabel: "Filesystem analysis snapshot",
        mode,
      });
    }
    return emptyOrSeedFallback(mode);
  }
}

const getOverviewDataCached = unstable_cache(
  loadOverviewDataUncached,
  ["observatory-overview-v3"],
  {
    revalidate: OBSERVATORY_REVALIDATE_SECONDS,
    tags: [OBSERVATORY_CACHE_TAG],
  },
);

export async function getOverviewData(
  mode: ScoringMode = "headline",
): Promise<OverviewData> {
  return getOverviewDataCached(mode);
}

function toNum(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function buildOverviewFromRows(input: {
  documentCount: number;
  rows: DbOverviewRow[];
  datasetLabel: string;
  mode: ScoringMode;
}): OverviewData {
  const scoringDocs: ScoringDocumentInput[] = [];
  const queueCandidates: (QueueDocument & { sortTs: number })[] = [];

  let legacyCount = 0;
  let v2Count = 0;
  const taxonomyVersionSet = new Set<string>();
  const modelSet = new Set<string>();
  const groundingValues: number[] = [];

  for (const row of input.rows) {
    if (!isJurisdictionKey(row.jurisdiction)) continue;
    const policy = row.policy_extraction ?? {};
    const framing = row.risk_framing ?? {};
    const pubIso = row.publication_date ?? policy.publication_date ?? null;
    const precision = inferDatePrecision(pubIso, row.publication_date_precision);

    // A5: Authoritative manifest binding_strength first
    const authoritativeBinding =
      row.manifest_binding_strength ?? policy.binding_strength ?? null;

    // A7: Unified confidence (policy + dominant frame)
    const policyConf = toNum(policy.confidence);
    const domFrame = framing.dominant_frame;
    const domFrameConf =
      toNum(row.dominant_frame_confidence) ??
      (domFrame && framing.frame_confidence
        ? toNum(framing.frame_confidence[domFrame])
        : null);
    const unifiedConf = computeUnifiedConfidence(
      policyConf,
      domFrameConf,
      toNum(row.overall_confidence),
    );

    // A8: Honest taxonomy version tracking
    const rawTax = row.taxonomy_version?.trim();
    if (!rawTax || rawTax === "legacy" || rawTax.startsWith("1.0")) {
      legacyCount += 1;
      taxonomyVersionSet.add("1.0-legacy");
    } else {
      v2Count += 1;
      taxonomyVersionSet.add(rawTax);
    }
    if (row.model) modelSet.add(row.model);
    const gr = toNum(row.grounding_ratio);
    if (gr !== null) groundingValues.push(gr);

    scoringDocs.push({
      documentId: row.document_id,
      jurisdiction: row.jurisdiction,
      publicationDate: pubIso,
      machineCreatedAt: row.machine_updated_at ?? null,
      documentType: policy.document_type ?? null,
      bindingStrength: authoritativeBinding,
      corpusRole: row.corpus_role?.trim() || null,
      lifecycleStage: row.lifecycle_stage?.trim() || null,
      policyConfidence: policyConf,
      dominantFrameConfidence: domFrameConf,
      overallConfidence: unifiedConf,
      safetyRequirements: policy.safety_requirements ?? [],
      enforcementMechanisms: policy.enforcement_mechanisms ?? [],
      dominantFrame: framing.dominant_frame ?? null,
      frameConfidence: framing.frame_confidence ?? null,
      frameShare: row.frame_shares_json ?? framing.frame_share ?? null,
    });

    const meta = jurisdictionMeta[row.jurisdiction];
    const dominantFrame: FrameLabel = isKnownFrameLabel(framing.dominant_frame)
      ? framing.dominant_frame
      : "innovation_enablement";
    const pubLabel = formatLongDate(pubIso, precision);
    queueCandidates.push({
      id: row.document_id,
      title: row.title,
      jurisdiction: meta.name,
      jurisdictionSlug: meta.slug,
      documentType: humanizeDocumentType(policy.document_type),
      bindingStrength: humanizeBindingStrength(authoritativeBinding),
      dominantFrame,
      publicationDate: pubLabel,
      updatedAt: pubLabel,
      sortTs: toTimestamp(pubIso ?? row.machine_updated_at),
    });
  }

  const scored = computeScoringEngine(scoringDocs, input.mode);

  const countries: CountrySnapshot[] = jurisdictionOrder.map((jurisdiction) => {
    const meta = jurisdictionMeta[jurisdiction];
    const result = scored.byJurisdiction.get(jurisdiction)!;
    const humanizedTop =
      result.topRequirementLabels.length > 0
        ? result.topRequirementLabels.map((label) => humanizeRequirement(label))
        : ["No extracted requirements yet"];
    const latestPubDate =
      result.latestPublicationTimestamp > 0
        ? formatLongDate(result.latestPublicationTimestamp)
        : "No publication date";
    const lastAnalyzed =
      result.lastAnalyzedTimestamp > 0
        ? formatLongDate(result.lastAnalyzedTimestamp)
        : "Legacy snapshot (unversioned)";

    return {
      ...meta,
      reviewedDocuments: result.documentCount,
      totalCorpusDocuments: result.totalCorpusCount,
      bindingLawCount: result.bindingLawCount,
      lowConfidenceCount: result.lowConfidenceCount,
      latestPublicationDate: latestPubDate,
      lastAnalyzedDate: lastAnalyzed,
      lastUpdated: latestPubDate,
      policyDivergence: result.policyDivergence,
      framingDivergence: result.framingDivergence,
      compositeDivergence: result.compositeDivergence,
      coverageDivergence: result.coverageDivergence,
      rawPolicyDivergence: result.rawPolicyDivergence,
      rawFramingDivergence: result.rawFramingDivergence,
      rawCompositeDivergence: result.rawCompositeDivergence,
      policyCI: result.policyCI,
      framingCI: result.framingCI,
      compositeCI: result.compositeCI,
      coverageCI: result.coverageCI,
      policyBreakdown: result.policyBreakdown,
      dominantFrame: result.dominantFrame,
      requirements: humanizedTop,
      distinctiveGaps: result.distinctiveGaps,
      requirementShares: result.requirementShares,
      enforcementShares: result.enforcementShares,
      bindingShares: result.bindingShares,
      obligationLevels: result.obligationLevels,
      rationale:
        result.documentCount > 0
          ? `${frameLabels[result.dominantFrame]} leads across ${result.documentCount} ${input.mode === "headline" ? "active primary instruments" : "analyzed documents"}.`
          : "No machine-analyzed documents loaded for this filter.",
      frameMix: result.frameMix,
    };
  });

  const nonZeroCountries = countries.filter((c) => c.reviewedDocuments > 0);
  const avgComposite =
    nonZeroCountries.length > 0
      ? Math.round(
          nonZeroCountries.reduce((sum, c) => sum + c.compositeDivergence, 0) /
            nonZeroCountries.length,
        )
      : 0;

  const bindingInstruments = countries.reduce((sum, c) => sum + c.bindingLawCount, 0);
  const lowConfidenceOutputs = countries.reduce(
    (sum, c) => sum + c.lowConfidenceCount,
    0,
  );

  const windowLabel =
    scored.minPublicationYear && scored.maxPublicationYear
      ? scored.minPublicationYear === scored.maxPublicationYear
        ? String(scored.maxPublicationYear)
        : `${scored.minPublicationYear} – ${scored.maxPublicationYear}`
      : "No date window";

  const snapshotDate =
    scored.latestPublicationTimestamp > 0
      ? formatLongDate(scored.latestPublicationTimestamp)
      : "No corpus date";

  const lastAnalyzedDate =
    scored.latestAnalyzedTimestamp > 0
      ? formatLongDate(scored.latestAnalyzedTimestamp)
      : "Legacy v1 snapshot";

  const taxVersions = [...taxonomyVersionSet].sort();
  const taxonomyVersion =
    taxVersions.length === 0
      ? "1.0-legacy"
      : taxVersions.length === 1
        ? taxVersions[0]
        : `mixed (${taxVersions.join(" + ")})`;

  const datasetVersion =
    scored.latestAnalyzedTimestamp > 0
      ? `${new Date(scored.latestAnalyzedTimestamp).toISOString().slice(0, 10)} (${taxonomyVersion})`
      : `2026-04-15 (${taxonomyVersion})`;

  const provenanceSummary: ProvenanceSummary = {
    totalAnalyzed: scoringDocs.length,
    headlineIncluded: scored.includedDocumentCount,
    legacyCount,
    v2Count,
    taxonomyVersions: taxVersions,
    models: [...modelSet].sort(),
    meanGroundingRatio:
      groundingValues.length > 0
        ? round2(
            groundingValues.reduce((s, v) => s + v, 0) / groundingValues.length,
          )
        : null,
    groundingSampleCount: groundingValues.length,
  };

  const queue: QueueDocument[] = queueCandidates
    .sort((left, right) => {
      if (right.sortTs !== left.sortTs) return right.sortTs - left.sortTs;
      return left.id.localeCompare(right.id);
    })
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      title: item.title,
      jurisdiction: item.jurisdiction,
      jurisdictionSlug: item.jurisdictionSlug,
      documentType: item.documentType,
      bindingStrength: item.bindingStrength,
      dominantFrame: item.dominantFrame,
      publicationDate: item.publicationDate,
      updatedAt: item.updatedAt,
    }));

  return {
    hasData: true,
    datasetLabel: input.datasetLabel,
    scoringMode: input.mode,
    taxonomyVersion,
    datasetVersion,
    snapshotDate,
    lastAnalyzedDate,
    corpusWindow: {
      startYear: scored.minPublicationYear,
      endYear: scored.maxPublicationYear,
      label: windowLabel,
    },
    provenanceSummary,
    nullCalibration: scored.nullCalibration,
    findings: scored.findings,
    sensitivityGrid: scored.sensitivityGrid,
    summary: {
      publishedSources: input.documentCount,
      reviewedOutputs: scoringDocs.length,
      headlineDocuments: scored.includedDocumentCount,
      bindingInstruments,
      lowConfidenceOutputs,
      compositeDivergence: avgComposite,
      hiddenFaultLine: highestDivergencePair(scored.matrix),
    },
    countries,
    matrix: scored.matrix,
    pairwiseDetails: scored.pairwiseDetails,
    timeline: scored.timeline,
    timelineByJurisdiction: scored.timelineByJurisdiction,
    queue,
  };
}

function highestDivergencePair(matrix: string[][]) {
  let bestScore = -1;
  let bestLabel = "No pair available";

  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    for (
      let cellIndex = rowIndex + 1;
      cellIndex < matrix[rowIndex].length;
      cellIndex += 1
    ) {
      const value = Number(matrix[rowIndex][cellIndex]);
      if (Number.isNaN(value) || value <= bestScore) continue;
      bestScore = value;
      bestLabel = `${matrixLabels[rowIndex]} / ${matrixLabels[cellIndex]}`;
    }
  }
  return bestLabel;
}

function toTimestamp(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return Date.UTC(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    );
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

type FilesystemParsedDocument = { title?: string };
type FilesystemMetadata = {
  title?: string;
  publication_date?: string | null;
  source_publication_date?: string | null;
  publication_date_precision?: string | null;
  binding_strength?: string | null;
  corpus_role?: string | null;
  lifecycle_stage?: string | null;
};
type FilesystemDocumentAnalysis = {
  analysis_metadata?: {
    model?: string | null;
    taxonomy_version?: string | null;
    grounding_ratio?: number | null;
    analyzed_at?: string | null;
  } | null;
  policy_extraction?: DbOverviewRow["policy_extraction"];
  risk_framing?: DbOverviewRow["risk_framing"];
};
type ManifestEntry = {
  id?: string;
  document_id?: string;
  publication_date?: string | null;
  publication_date_precision?: string | null;
  binding_strength?: string | null;
  corpus_role?: string | null;
  lifecycle_stage?: string | null;
};

async function loadManifestMetaMap(): Promise<Map<string, ManifestEntry>> {
  const map = new Map<string, ManifestEntry>();
  for (const jurisdiction of jurisdictionOrder) {
    const parsed = await safeReadJson<{
      seed_documents?: ManifestEntry[];
      documents?: ManifestEntry[];
      sources?: ManifestEntry[];
    }>(path.join(SOURCES_ROOT, `${jurisdiction}.json`));
    const items =
      parsed?.seed_documents ?? parsed?.documents ?? parsed?.sources ?? [];
    for (const entry of items) {
      const id = entry.document_id ?? entry.id;
      if (id) map.set(id, entry);
    }
  }
  return map;
}

async function loadOverviewInputFromFilesystem(): Promise<{
  documentCount: number;
  rows: DbOverviewRow[];
} | null> {
  const [jurisdictionDirs, manifestMap] = await Promise.all([
    safeReadDir(PARSED_ROOT),
    loadManifestMetaMap(),
  ]);
  let documentCount = 0;
  const rows: DbOverviewRow[] = [];

  for (const jurisdiction of jurisdictionDirs) {
    if (!isJurisdictionKey(jurisdiction)) continue;
    const documentDirs = await safeReadDir(path.join(PARSED_ROOT, jurisdiction));
    for (const documentId of documentDirs) {
      const parsedPath = path.join(
        PARSED_ROOT,
        jurisdiction,
        documentId,
        "normalized.json",
      );
      const parsed = await safeReadJson<FilesystemParsedDocument>(parsedPath);
      if (!parsed) continue;
      documentCount += 1;

      const [metadata, analysis] = await Promise.all([
        safeReadJson<FilesystemMetadata>(
          path.join(RAW_ROOT, jurisdiction, documentId, "metadata.json"),
        ),
        safeReadJson<FilesystemDocumentAnalysis>(
          path.join(ANALYSIS_ROOT, jurisdiction, documentId, "document_analysis.json"),
        ),
      ]);
      if (!analysis?.policy_extraction && !analysis?.risk_framing) continue;

      const manifest = manifestMap.get(documentId);
      const publicationDate =
        manifest?.publication_date ??
        metadata?.publication_date ??
        metadata?.source_publication_date ??
        analysis.policy_extraction?.publication_date ??
        null;

      // A7: Read model & analyzed_at strictly from analysis_metadata (NEVER stat().mtime!)
      let model = analysis.analysis_metadata?.model ?? null;
      if (!model) {
        const rawFraming = await safeReadJson<{ model?: string }>(
          path.join(
            ANALYSIS_ROOT,
            jurisdiction,
            documentId,
            "framing_response.raw.json",
          ),
        );
        model = rawFraming?.model ?? null;
      }

      rows.push({
        document_id: documentId,
        title: metadata?.title ?? parsed.title ?? documentId,
        jurisdiction,
        publication_date: publicationDate,
        publication_date_precision:
          manifest?.publication_date_precision ??
          metadata?.publication_date_precision ??
          null,
        manifest_binding_strength:
          manifest?.binding_strength ?? metadata?.binding_strength ?? null,
        corpus_role: manifest?.corpus_role ?? metadata?.corpus_role ?? null,
        lifecycle_stage:
          manifest?.lifecycle_stage ?? metadata?.lifecycle_stage ?? null,
        overall_confidence: null,
        dominant_frame_confidence: null,
        grounding_ratio: analysis.analysis_metadata?.grounding_ratio ?? null,
        taxonomy_version: analysis.analysis_metadata?.taxonomy_version ?? null,
        model,
        frame_shares_json: analysis.risk_framing?.frame_share ?? null,
        machine_analysis_id: rows.length + 1,
        policy_extraction: analysis.policy_extraction ?? {},
        risk_framing: analysis.risk_framing ?? {},
        machine_updated_at: analysis.analysis_metadata?.analyzed_at ?? null,
      });
    }
  }

  if (documentCount === 0) return null;
  return { documentCount, rows };
}

async function safeReadDir(directoryPath: string) {
  try {
    return await readdir(directoryPath);
  } catch {
    return [];
  }
}

async function safeReadJson<T>(filePath: string): Promise<T | null> {
  try {
    const contents = await readFile(filePath, "utf-8");
    return JSON.parse(contents) as T;
  } catch {
    return null;
  }
}

function isJurisdictionKey(value: string): value is JurisdictionKey {
  return (jurisdictionOrder as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* Latest sources query (balanced per-jurisdiction or SQL-filtered)    */
/* ------------------------------------------------------------------ */

type DbLatestSourceRow = {
  document_id: string;
  title: string;
  jurisdiction: string;
  language: string | null;
  publication_date: string | null;
  publication_date_precision: string | null;
  manifest_binding_strength: string | null;
  corpus_role: string | null;
  lifecycle_stage: string | null;
  policy_extraction: {
    document_type?: string;
    binding_strength?: string;
    publication_date?: string | null;
  } | null;
  risk_framing: {
    dominant_frame?: string;
  } | null;
  machine_updated_at: string | null;
};

export type LatestSourcesOptions = {
  limit?: number;
  perJurisdiction?: number;
  jurisdiction?: JurisdictionKey;
};

async function loadLatestSourcesUncached(
  limit: number,
  perJurisdiction: number,
  jurisdiction: JurisdictionKey | null,
): Promise<SourceEntry[]> {
  const sql = getDatabaseClient();
  if (!sql) {
    if (allowLocalFallback()) {
      return loadLatestSourcesFromFilesystem(limit, perJurisdiction, jurisdiction);
    }
    return [];
  }

  try {
    const queryRows = async (v5: boolean): Promise<DbLatestSourceRow[]> => {
      if (jurisdiction) {
        return (await withDbTimeout(
          v5
            ? sql`
                SELECT
                  d.id AS document_id,
                  d.title,
                  d.jurisdiction,
                  COALESCE(NULLIF(d.language, ''), d.raw_metadata->>'language') AS language,
                  COALESCE(
                    d.publication_date::text,
                    d.raw_metadata->>'publication_date',
                    d.raw_metadata->>'source_publication_date'
                  ) AS publication_date,
                  COALESCE(d.publication_date_precision, d.raw_metadata->>'publication_date_precision') AS publication_date_precision,
                  COALESCE(d.binding_strength, d.raw_metadata->>'binding_strength') AS manifest_binding_strength,
                  COALESCE(d.corpus_role, d.raw_metadata->>'corpus_role') AS corpus_role,
                  COALESCE(d.lifecycle_stage, d.raw_metadata->>'lifecycle_stage') AS lifecycle_stage,
                  latest_machine.policy_extraction,
                  latest_machine.risk_framing,
                  latest_machine.analyzed_at::text AS machine_updated_at
                FROM documents d
                LEFT JOIN LATERAL (
                  SELECT *
                  FROM machine_document_analyses m
                  WHERE m.document_id = d.id
                  ORDER BY m.updated_at DESC, m.id DESC
                  LIMIT 1
                ) latest_machine ON TRUE
                WHERE d.jurisdiction = ${jurisdiction}
                ORDER BY
                  COALESCE(
                    d.publication_date::text,
                    d.raw_metadata->>'publication_date',
                    d.raw_metadata->>'source_publication_date',
                    d.created_at::date::text
                  ) DESC NULLS LAST,
                  d.id ASC
                LIMIT ${limit}
              `
            : sql`
                SELECT
                  d.id AS document_id,
                  d.title,
                  d.jurisdiction,
                  COALESCE(NULLIF(d.language, ''), d.raw_metadata->>'language') AS language,
                  COALESCE(
                    d.publication_date::text,
                    d.raw_metadata->>'publication_date',
                    d.raw_metadata->>'source_publication_date'
                  ) AS publication_date,
                  d.raw_metadata->>'publication_date_precision' AS publication_date_precision,
                  d.raw_metadata->>'binding_strength' AS manifest_binding_strength,
                  d.raw_metadata->>'corpus_role' AS corpus_role,
                  d.raw_metadata->>'lifecycle_stage' AS lifecycle_stage,
                  latest_machine.policy_extraction,
                  latest_machine.risk_framing,
                  NULL::text AS machine_updated_at
                FROM documents d
                LEFT JOIN LATERAL (
                  SELECT *
                  FROM machine_document_analyses m
                  WHERE m.document_id = d.id
                  ORDER BY m.updated_at DESC, m.id DESC
                  LIMIT 1
                ) latest_machine ON TRUE
                WHERE d.jurisdiction = ${jurisdiction}
                ORDER BY
                  COALESCE(
                    d.publication_date::text,
                    d.raw_metadata->>'publication_date',
                    d.raw_metadata->>'source_publication_date',
                    d.created_at::date::text
                  ) DESC NULLS LAST,
                  d.id ASC
                LIMIT ${limit}
              `,
          `latest sources ${jurisdiction}`,
        )) as DbLatestSourceRow[];
      }

      return (await withDbTimeout(
        v5
          ? sql`
              WITH ranked AS (
                SELECT
                  d.id AS document_id,
                  d.title,
                  d.jurisdiction,
                  COALESCE(NULLIF(d.language, ''), d.raw_metadata->>'language') AS language,
                  COALESCE(
                    d.publication_date::text,
                    d.raw_metadata->>'publication_date',
                    d.raw_metadata->>'source_publication_date'
                  ) AS publication_date,
                  COALESCE(d.publication_date_precision, d.raw_metadata->>'publication_date_precision') AS publication_date_precision,
                  COALESCE(d.binding_strength, d.raw_metadata->>'binding_strength') AS manifest_binding_strength,
                  COALESCE(d.corpus_role, d.raw_metadata->>'corpus_role') AS corpus_role,
                  COALESCE(d.lifecycle_stage, d.raw_metadata->>'lifecycle_stage') AS lifecycle_stage,
                  latest_machine.policy_extraction,
                  latest_machine.risk_framing,
                  latest_machine.analyzed_at::text AS machine_updated_at,
                  ROW_NUMBER() OVER (
                    PARTITION BY d.jurisdiction
                    ORDER BY
                      COALESCE(
                        d.publication_date::text,
                        d.raw_metadata->>'publication_date',
                        d.raw_metadata->>'source_publication_date',
                        d.created_at::date::text
                      ) DESC NULLS LAST,
                      d.id ASC
                  ) AS rn
                FROM documents d
                LEFT JOIN LATERAL (
                  SELECT *
                  FROM machine_document_analyses m
                  WHERE m.document_id = d.id
                  ORDER BY m.updated_at DESC, m.id DESC
                  LIMIT 1
                ) latest_machine ON TRUE
              )
              SELECT
                document_id, title, jurisdiction, language, publication_date,
                publication_date_precision, manifest_binding_strength,
                corpus_role, lifecycle_stage, policy_extraction, risk_framing, machine_updated_at
              FROM ranked
              WHERE rn <= ${perJurisdiction}
              ORDER BY COALESCE(publication_date, machine_updated_at) DESC NULLS LAST, document_id ASC
              LIMIT ${limit}
            `
          : sql`
              WITH ranked AS (
                SELECT
                  d.id AS document_id,
                  d.title,
                  d.jurisdiction,
                  COALESCE(NULLIF(d.language, ''), d.raw_metadata->>'language') AS language,
                  COALESCE(
                    d.publication_date::text,
                    d.raw_metadata->>'publication_date',
                    d.raw_metadata->>'source_publication_date'
                  ) AS publication_date,
                  d.raw_metadata->>'publication_date_precision' AS publication_date_precision,
                  d.raw_metadata->>'binding_strength' AS manifest_binding_strength,
                  d.raw_metadata->>'corpus_role' AS corpus_role,
                  d.raw_metadata->>'lifecycle_stage' AS lifecycle_stage,
                  latest_machine.policy_extraction,
                  latest_machine.risk_framing,
                  NULL::text AS machine_updated_at,
                  ROW_NUMBER() OVER (
                    PARTITION BY d.jurisdiction
                    ORDER BY
                      COALESCE(
                        d.publication_date::text,
                        d.raw_metadata->>'publication_date',
                        d.raw_metadata->>'source_publication_date',
                        d.created_at::date::text
                      ) DESC NULLS LAST,
                      d.id ASC
                  ) AS rn
                FROM documents d
                LEFT JOIN LATERAL (
                  SELECT *
                  FROM machine_document_analyses m
                  WHERE m.document_id = d.id
                  ORDER BY m.updated_at DESC, m.id DESC
                  LIMIT 1
                ) latest_machine ON TRUE
              )
              SELECT
                document_id, title, jurisdiction, language, publication_date,
                publication_date_precision, manifest_binding_strength,
                corpus_role, lifecycle_stage, policy_extraction, risk_framing, machine_updated_at
              FROM ranked
              WHERE rn <= ${perJurisdiction}
              ORDER BY COALESCE(publication_date, machine_updated_at) DESC NULLS LAST, document_id ASC
              LIMIT ${limit}
            `,
        "latest sources balanced",
      )) as DbLatestSourceRow[];
    };

    let rows: DbLatestSourceRow[];
    try {
      rows = await queryRows(true);
    } catch (error) {
      if (!isUndefinedColumnError(error)) throw error;
      rows = await queryRows(false);
    }

    if (!rows.length) {
      if (allowLocalFallback()) {
        return loadLatestSourcesFromFilesystem(limit, perJurisdiction, jurisdiction);
      }
      return [];
    }

    return rows.map((row) => {
      const meta = isJurisdictionKey(row.jurisdiction)
        ? jurisdictionMeta[row.jurisdiction]
        : {
            slug: row.jurisdiction,
            name: row.jurisdiction,
            shortName: row.jurisdiction.slice(0, 2).toUpperCase(),
            flagUrl: "",
          };
      const policy = row.policy_extraction ?? {};
      const framing = row.risk_framing ?? {};
      const dominantFrame: FrameLabel = isKnownFrameLabel(framing.dominant_frame)
        ? framing.dominant_frame
        : "innovation_enablement";
      const pubDateRaw =
        row.publication_date ?? policy.publication_date ?? row.machine_updated_at;
      const precision = inferDatePrecision(
        pubDateRaw,
        row.publication_date_precision,
      );
      const bindingKey =
        row.manifest_binding_strength ?? policy.binding_strength ?? "unclassified";
      const shortDate = formatShortDate(pubDateRaw, precision);

      return {
        id: row.document_id,
        title: row.title,
        jurisdiction: meta.name,
        jurisdictionSlug: meta.slug,
        flagUrl: meta.flagUrl,
        shortName: meta.shortName,
        language: humanizeLanguage(row.language),
        documentType: humanizeDocumentType(policy.document_type),
        bindingStrength: bindingKey,
        bindingStrengthLabel: humanizeBindingStrength(bindingKey),
        corpusRole: row.corpus_role?.trim() || null,
        corpusRoleLabel: humanizeCorpusRole(row.corpus_role),
        lifecycleStage: row.lifecycle_stage?.trim() || null,
        lifecycleStageLabel: humanizeLifecycleStage(row.lifecycle_stage),
        analysisState:
          row.policy_extraction || row.risk_framing ? "analyzed" : "parsed",
        dominantFrame,
        publicationDate: shortDate,
        updatedAt: shortDate,
        dateSort: toTimestamp(pubDateRaw),
      } satisfies SourceEntry;
    });
  } catch (error) {
    handleDatabaseReadFailure("latest sources from Neon", error);
    if (!allowLocalFallback()) {
      throw error;
    }
    return loadLatestSourcesFromFilesystem(limit, perJurisdiction, jurisdiction);
  }
}

async function loadLatestSourcesFromFilesystem(
  limit: number,
  perJurisdiction: number,
  jurisdiction: JurisdictionKey | null,
): Promise<SourceEntry[]> {
  const docs = await getDocumentListItems();
  if (docs.length === 0) {
    if (!allowSeedFallback()) return [];
    const synthetic = buildSyntheticSources(
      seedData.countries,
      seedData.snapshotDate,
    );
    if (jurisdiction) {
      const targetSlug = jurisdictionMeta[jurisdiction].slug;
      return synthetic
        .filter((item) => item.jurisdictionSlug === targetSlug)
        .slice(0, limit);
    }
    return synthetic.slice(0, limit);
  }

  if (jurisdiction) {
    const targetSlug = jurisdictionMeta[jurisdiction].slug;
    return docs
      .filter((doc) => doc.jurisdictionSlug === targetSlug)
      .sort((a, b) => b.dateSort - a.dateSort || a.id.localeCompare(b.id))
      .slice(0, limit)
      .map(documentListItemToSourceEntry);
  }

  const perJurBuckets = new Map<string, DocumentListItem[]>();
  for (const doc of docs) {
    const list = perJurBuckets.get(doc.jurisdictionSlug) ?? [];
    list.push(doc);
    perJurBuckets.set(doc.jurisdictionSlug, list);
  }

  const balanced: DocumentListItem[] = [];
  for (const list of perJurBuckets.values()) {
    list.sort((a, b) => b.dateSort - a.dateSort || a.id.localeCompare(b.id));
    balanced.push(...list.slice(0, perJurisdiction));
  }

  return balanced
    .sort((a, b) => b.dateSort - a.dateSort || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map(documentListItemToSourceEntry);
}

const getLatestSourcesCached = unstable_cache(
  loadLatestSourcesUncached,
  ["observatory-latest-sources-v3"],
  {
    revalidate: OBSERVATORY_REVALIDATE_SECONDS,
    tags: [OBSERVATORY_CACHE_TAG],
  },
);

export async function getLatestSources(
  options: LatestSourcesOptions | number = {},
): Promise<SourceEntry[]> {
  if (typeof options === "number") {
    return getLatestSourcesCached(options, 12, null);
  }
  const limit = options.limit ?? 50;
  const perJurisdiction = options.perJurisdiction ?? 12;
  const jurisdiction = options.jurisdiction ?? null;
  return getLatestSourcesCached(limit, perJurisdiction, jurisdiction);
}

function documentListItemToSourceEntry(doc: DocumentListItem): SourceEntry {
  const shortDate = formatShortDate(
    doc.publicationDateIso,
    doc.publicationDatePrecision,
  );
  return {
    id: doc.id,
    title: doc.title,
    jurisdiction: doc.jurisdiction,
    jurisdictionSlug: doc.jurisdictionSlug,
    flagUrl: doc.flagUrl,
    shortName: doc.jurisdictionShort,
    language: doc.language,
    documentType: doc.documentType,
    bindingStrength: doc.bindingStrength,
    bindingStrengthLabel: doc.bindingStrengthLabel,
    corpusRole: doc.corpusRole,
    corpusRoleLabel: doc.corpusRoleLabel,
    lifecycleStage: doc.lifecycleStage,
    lifecycleStageLabel: doc.lifecycleStageLabel,
    analysisState: doc.analysisState,
    dominantFrame: doc.dominantFrame ?? "innovation_enablement",
    publicationDate: shortDate,
    updatedAt: shortDate,
    dateSort: doc.dateSort,
  };
}
