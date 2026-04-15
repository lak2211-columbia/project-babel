import "server-only";

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import {
  allowLocalFallback,
  currentDatasetLabel,
  getDatabaseClient,
  handleDatabaseReadFailure,
} from "@/lib/db";
import {
  allFrameLabels,
  frameLabels,
  matrixLabels,
  seedData,
  type CountrySnapshot,
  type FrameLabel,
  type OverviewData,
  type QueueDocument,
} from "@/lib/seed-data";
import { jurisdictionMeta, jurisdictionOrder, type JurisdictionKey } from "@/lib/jurisdictions";
import {
  buildSyntheticSources,
  formatShortDate,
  type ReviewState,
  type SourceEntry,
} from "@/lib/sources-data";
import { getDocumentListItems, type DocumentListItem } from "@/lib/document-data";

type DbOverviewRow = {
  document_id: string;
  title: string;
  jurisdiction: JurisdictionKey;
  publication_date: string | null;
  machine_analysis_id: number;
  policy_extraction: {
    document_type?: string;
    safety_requirements?: { label: string }[];
  };
  risk_framing: {
    dominant_frame?: FrameLabel;
    frame_confidence?: Record<string, number>;
  };
  machine_created_at: string;
};

type JurisdictionAccumulator = {
  snapshot: CountrySnapshot;
  requirementCounts: Map<string, number>;
  frameCounts: Map<FrameLabel, number>;
  documentCount: number;
  latestTimestamp: number;
};

const documentTypeLabels: Record<string, string> = {
  legislation: "Legislation",
  executive_order: "Executive action",
  strategy_paper: "Strategy paper",
  regulatory_guidance: "Regulatory guidance",
  standards_guideline: "Standards guideline",
  voluntary_commitment: "Voluntary commitment",
};

const WORKSPACE_ROOT = path.resolve(process.cwd(), "..", "..");
const PARSED_ROOT = path.join(WORKSPACE_ROOT, "data", "parsed");
const RAW_ROOT = path.join(WORKSPACE_ROOT, "data", "raw");
const ANALYSIS_ROOT = path.join(WORKSPACE_ROOT, "data", "analysis");

export async function getOverviewData(): Promise<OverviewData> {
  const sql = getDatabaseClient();
  if (!sql) {
    const fallbackInput = await loadOverviewInputFromFilesystem();
    if (!fallbackInput || fallbackInput.documentCount === 0) {
      return seedData;
    }
    return buildOverviewFromRows({
      ...fallbackInput,
      datasetLabel: "Filesystem analysis snapshot",
    });
  }
  try {
    const [documentCountRow, rows] = (await Promise.all([
      sql`SELECT COUNT(*)::int AS count FROM documents`,
      sql`
        SELECT
          d.id AS document_id,
          d.title,
          d.jurisdiction,
          d.publication_date::text,
          latest_machine.id AS machine_analysis_id,
          latest_machine.policy_extraction,
          latest_machine.risk_framing,
          latest_machine.created_at::text AS machine_created_at
        FROM documents d
        JOIN LATERAL (
          SELECT *
          FROM machine_document_analyses m
          WHERE m.document_id = d.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) latest_machine ON TRUE
        ORDER BY d.jurisdiction, d.publication_date NULLS LAST, d.id
      `,
    ])) as [{ count: number }[], DbOverviewRow[]];

    if (!rows.length && (documentCountRow[0]?.count ?? 0) === 0) {
      return seedData;
    }

    return buildOverviewFromRows({
      documentCount: documentCountRow[0]?.count ?? 0,
      rows,
      datasetLabel: currentDatasetLabel(),
    });
  } catch (error) {
    handleDatabaseReadFailure("overview data from Neon", error);
    if (!allowLocalFallback()) {
      throw error;
    }
    const fallbackInput = await loadOverviewInputFromFilesystem();
    if (!fallbackInput || fallbackInput.documentCount === 0) {
      return seedData;
    }
    return buildOverviewFromRows({
      ...fallbackInput,
      datasetLabel: "Filesystem analysis snapshot",
    });
  }
}

function buildOverviewFromRows(input: {
  documentCount: number;
  rows: DbOverviewRow[];
  datasetLabel: string;
}): OverviewData {
  const accumulators = new Map<JurisdictionKey, JurisdictionAccumulator>(
    jurisdictionOrder.map((jurisdiction) => [
      jurisdiction,
      {
        snapshot: {
          ...jurisdictionMeta[jurisdiction],
          reviewedDocuments: 0,
          documentsInQueue: 0,
          lastUpdated: "No analyzed documents yet",
          policyDivergence: 0,
          framingDivergence: 0,
          compositeDivergence: 0,
          dominantFrame: "innovation_enablement",
          requirements: ["No extracted requirements yet"],
          rationale: "No machine-analyzed documents have been loaded yet.",
          frameMix: [],
        },
        requirementCounts: new Map(),
        frameCounts: new Map(),
        documentCount: 0,
        latestTimestamp: 0,
      },
    ]),
  );

  const queue: QueueDocument[] = [];

  for (const row of input.rows) {
    const bucket = accumulators.get(row.jurisdiction);
    if (!bucket) {
      continue;
    }

    const policy = row.policy_extraction;
    const framing = row.risk_framing;
    const dominantFrame = toFrameLabel(framing.dominant_frame);
    const updatedAt = row.machine_created_at ?? row.publication_date;
    const updatedTimestamp = toTimestamp(updatedAt);

    bucket.documentCount += 1;
    bucket.latestTimestamp = Math.max(bucket.latestTimestamp, updatedTimestamp);
    bucket.snapshot.reviewedDocuments += 1;

    for (const requirement of policy.safety_requirements ?? []) {
      bucket.requirementCounts.set(
        requirement.label,
        (bucket.requirementCounts.get(requirement.label) ?? 0) + 1,
      );
    }

    const frameConfidence = framing.frame_confidence ?? {};
    if (Object.keys(frameConfidence).length > 0) {
      for (const [frame, score] of Object.entries(frameConfidence)) {
        const typedFrame = toFrameLabel(frame);
        if (!typedFrame) {
          continue;
        }
        bucket.frameCounts.set(typedFrame, (bucket.frameCounts.get(typedFrame) ?? 0) + score);
      }
    } else if (dominantFrame) {
      bucket.frameCounts.set(dominantFrame, (bucket.frameCounts.get(dominantFrame) ?? 0) + 1);
    }

    queue.push({
      title: row.title,
      jurisdiction: jurisdictionMeta[row.jurisdiction].name,
      documentType: humanizeDocumentType(policy.document_type),
      reviewState: "approved",
      dominantFrame: dominantFrame ?? "innovation_enablement",
      updatedAt: formatDate(updatedAt),
    });
  }

  const policyProfiles = buildProfiles(accumulators, "requirementCounts");
  const framingProfiles = buildProfiles(accumulators, "frameCounts");
  const matrix = buildPairwiseMatrix(policyProfiles, framingProfiles);

  for (const jurisdiction of jurisdictionOrder) {
    const bucket = accumulators.get(jurisdiction);
    if (!bucket) {
      continue;
    }
    const policyScore = divergenceFromPeers(policyProfiles, jurisdiction);
    const framingScore = divergenceFromPeers(framingProfiles, jurisdiction);
    const compositeScore = Math.round(policyScore * 0.6 + framingScore * 0.4);
    const topRequirements = topEntries(bucket.requirementCounts, 3).map(([label]) =>
      humanizeRequirement(label),
    );
    const rankedFrames = topEntries(bucket.frameCounts, allFrameLabels.length);
    const frameMixTotal = [...bucket.frameCounts.values()].reduce((sum, value) => sum + value, 0);
    const dominantFrame = rankedFrames[0]?.[0] ?? "innovation_enablement";

    bucket.snapshot.policyDivergence = policyScore;
    bucket.snapshot.framingDivergence = framingScore;
    bucket.snapshot.compositeDivergence = compositeScore;
    bucket.snapshot.lastUpdated = formatDate(bucket.latestTimestamp || null);
    bucket.snapshot.dominantFrame = dominantFrame;
    bucket.snapshot.requirements =
      topRequirements.length > 0 ? topRequirements : ["No extracted requirements yet"];
    bucket.snapshot.frameMix = allFrameLabels.map((label) => ({
      label,
      value:
        frameMixTotal > 0
          ? Math.round(((bucket.frameCounts.get(label) ?? 0) / frameMixTotal) * 100)
          : 0,
    }));
    bucket.snapshot.rationale =
      bucket.documentCount > 0
        ? `${frameLabels[dominantFrame]} is the leading framing signal across ${bucket.documentCount} analyzed documents, with ${bucket.snapshot.requirements.join(", ").toLowerCase()} appearing most often.`
        : "No machine-analyzed documents have been loaded yet.";
  }

  const countries = jurisdictionOrder.map((jurisdiction) => accumulators.get(jurisdiction)!.snapshot);
  const nonZeroCompositeScores = countries.filter((country) => country.compositeDivergence > 0);
  const highestPair = highestDivergencePair(matrix);

  return {
    datasetLabel: input.datasetLabel,
    snapshotDate: formatDate(new Date().toISOString()),
    summary: {
      publishedSources: input.documentCount,
      reviewedOutputs: input.rows.length,
      reviewQueue: 0,
      compositeDivergence:
        nonZeroCompositeScores.length > 0
          ? Math.round(
              nonZeroCompositeScores.reduce((sum, country) => sum + country.compositeDivergence, 0) /
                nonZeroCompositeScores.length,
            )
          : 0,
      hiddenFaultLine: highestPair,
    },
    countries,
    matrix,
    queue: queue
      .sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt))
      .slice(0, 5),
  };
}

function buildProfiles(
  accumulators: Map<JurisdictionKey, JurisdictionAccumulator>,
  key: "requirementCounts" | "frameCounts",
) {
  return new Map(
    jurisdictionOrder.map((jurisdiction) => {
      const bucket = accumulators.get(jurisdiction)!;
      return [jurisdiction, normalizeCounts(bucket[key])];
    }),
  );
}

function buildPairwiseMatrix(
  policyProfiles: Map<JurisdictionKey, Map<string, number>>,
  framingProfiles: Map<JurisdictionKey, Map<string, number>>,
): string[][] {
  return jurisdictionOrder.map((leftJurisdiction) =>
    jurisdictionOrder.map((rightJurisdiction) => {
      if (leftJurisdiction === rightJurisdiction) {
        return "-";
      }

      const policyDistance = distributionDistance(
        policyProfiles.get(leftJurisdiction) ?? new Map(),
        policyProfiles.get(rightJurisdiction) ?? new Map(),
      );
      const framingDistance = distributionDistance(
        framingProfiles.get(leftJurisdiction) ?? new Map(),
        framingProfiles.get(rightJurisdiction) ?? new Map(),
      );

      return String(Math.round((policyDistance * 0.6 + framingDistance * 0.4) * 100));
    }),
  );
}

function divergenceFromPeers(
  profiles: Map<JurisdictionKey, Map<string, number>>,
  target: JurisdictionKey,
) {
  const targetProfile = profiles.get(target) ?? new Map();
  const peerProfiles = jurisdictionOrder
    .filter((jurisdiction) => jurisdiction !== target)
    .map((jurisdiction) => profiles.get(jurisdiction) ?? new Map());

  if (peerProfiles.every((profile) => profile.size === 0)) {
    return 0;
  }

  const peerAverage = averageProfiles(peerProfiles);
  return Math.round(distributionDistance(targetProfile, peerAverage) * 100);
}

function averageProfiles(profiles: Map<string, number>[]) {
  const totals = new Map<string, number>();
  for (const profile of profiles) {
    for (const [label, value] of profile.entries()) {
      totals.set(label, (totals.get(label) ?? 0) + value);
    }
  }
  const divisor = profiles.length || 1;
  for (const [label, value] of totals.entries()) {
    totals.set(label, value / divisor);
  }
  return totals;
}

function distributionDistance(left: Map<string, number>, right: Map<string, number>) {
  const keys = new Set([...left.keys(), ...right.keys()]);
  let total = 0;
  for (const key of keys) {
    total += Math.abs((left.get(key) ?? 0) - (right.get(key) ?? 0));
  }
  return Math.min(1, total / 2);
}

function normalizeCounts(input: Map<string, number>) {
  const total = [...input.values()].reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return new Map<string, number>();
  }
  return new Map([...input.entries()].map(([label, value]) => [label, value / total]));
}

function topEntries<T extends string>(counts: Map<T, number>, limit: number) {
  return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, limit);
}

function highestDivergencePair(matrix: string[][]) {
  let bestScore = -1;
  let bestLabel = "No pair available";

  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    for (let cellIndex = rowIndex + 1; cellIndex < matrix[rowIndex].length; cellIndex += 1) {
      const value = Number(matrix[rowIndex][cellIndex]);
      if (Number.isNaN(value) || value <= bestScore) {
        continue;
      }
      bestScore = value;
      bestLabel = `${matrixLabels[rowIndex]} / ${matrixLabels[cellIndex]}`;
    }
  }

  return bestLabel;
}

function humanizeRequirement(label: string) {
  return label
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function humanizeDocumentType(label?: string) {
  if (!label) {
    return "Unknown type";
  }
  return documentTypeLabels[label] ?? humanizeRequirement(label);
}

function toFrameLabel(label?: string | null): FrameLabel | null {
  if (!label) {
    return null;
  }
  return label in frameLabels ? (label as FrameLabel) : null;
}

function formatDate(value: string | number | null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) {
    return "No date available";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(timestamp));
}

function toTimestamp(value: string | number | null) {
  if (typeof value === "number") {
    return value;
  }
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

type FilesystemParsedDocument = {
  title?: string;
};

type FilesystemMetadata = {
  title?: string;
  publication_date?: string | null;
  source_publication_date?: string | null;
};

type FilesystemDocumentAnalysis = {
  policy_extraction?: DbOverviewRow["policy_extraction"];
  risk_framing?: DbOverviewRow["risk_framing"];
};

async function loadOverviewInputFromFilesystem(): Promise<{
  documentCount: number;
  rows: DbOverviewRow[];
} | null> {
  const jurisdictionDirs = await safeReadDir(PARSED_ROOT);
  let documentCount = 0;
  const rows: DbOverviewRow[] = [];

  for (const jurisdiction of jurisdictionDirs) {
    if (!isJurisdictionKey(jurisdiction)) {
      continue;
    }

    const documentDirs = await safeReadDir(path.join(PARSED_ROOT, jurisdiction));
    for (const documentId of documentDirs) {
      const parsedPath = path.join(PARSED_ROOT, jurisdiction, documentId, "normalized.json");
      const parsed = await safeReadJson<FilesystemParsedDocument>(parsedPath);
      if (!parsed) {
        continue;
      }

      documentCount += 1;

      const metadata = await safeReadJson<FilesystemMetadata>(
        path.join(RAW_ROOT, jurisdiction, documentId, "metadata.json"),
      );
      const analysisPath = path.join(ANALYSIS_ROOT, jurisdiction, documentId, "document_analysis.json");
      const analysis = await safeReadJson<FilesystemDocumentAnalysis>(analysisPath);
      if (!analysis?.policy_extraction && !analysis?.risk_framing) {
        continue;
      }

      let machineCreatedAt = metadata?.publication_date ?? metadata?.source_publication_date ?? "";
      try {
        const analysisStats = await stat(analysisPath);
        machineCreatedAt = analysisStats.mtime.toISOString();
      } catch {
        // Fall back to source dates when the analysis file timestamp is unavailable.
      }

      rows.push({
        document_id: documentId,
        title: metadata?.title ?? parsed.title ?? documentId,
        jurisdiction,
        publication_date: metadata?.publication_date ?? metadata?.source_publication_date ?? null,
        machine_analysis_id: rows.length + 1,
        policy_extraction: analysis.policy_extraction ?? {},
        risk_framing: analysis.risk_framing ?? {},
        machine_created_at: machineCreatedAt,
      });
    }
  }

  if (documentCount === 0) {
    return null;
  }

  rows.sort((left, right) => {
    if (left.jurisdiction !== right.jurisdiction) {
      return left.jurisdiction.localeCompare(right.jurisdiction);
    }

    const publicationDelta = toTimestamp(right.publication_date) - toTimestamp(left.publication_date);
    if (publicationDelta !== 0) {
      return publicationDelta;
    }

    return left.document_id.localeCompare(right.document_id);
  });

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
/* Latest sources query                                                */
/* ------------------------------------------------------------------ */
/**
 * Returns the N most recent documents for the `latest_sources` panel.
 * Reads from Neon when DATABASE_URL is set, otherwise falls back
 * to the synthetic demo list so the UI stays populated in dev.
 */

type DbLatestSourceRow = {
  document_id: string;
  title: string;
  jurisdiction: JurisdictionKey;
  machine_analysis_id: number;
  policy_extraction: {
    document_type?: string;
  };
  risk_framing: {
    dominant_frame?: FrameLabel;
  };
  machine_created_at: string;
};

export async function getLatestSources(limit = 20): Promise<SourceEntry[]> {
  const sql = getDatabaseClient();
  if (!sql) {
    // Share the same fallback as the documents list so home-page links
    // and the /documents page point at the same real document IDs.
    const docs = await getDocumentListItems();
    if (docs.length > 0) {
      return docs
        .slice(0, limit)
        .map(documentListItemToSourceEntry)
        .sort((a, b) => b.dateSort - a.dateSort);
    }
    return buildSyntheticSources(
      seedData.countries,
      seedData.snapshotDate,
    ).slice(0, limit);
  }

  try {
    const rows = (await sql`
      SELECT
        d.id AS document_id,
        d.title,
        d.jurisdiction,
        latest_machine.id AS machine_analysis_id,
        latest_machine.policy_extraction,
        latest_machine.risk_framing,
        latest_machine.created_at::text AS machine_created_at
      FROM documents d
      JOIN LATERAL (
        SELECT *
        FROM machine_document_analyses m
        WHERE m.document_id = d.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) latest_machine ON TRUE
      ORDER BY latest_machine.created_at DESC NULLS LAST
      LIMIT ${limit}
    `) as DbLatestSourceRow[];

    if (!rows.length) {
      return buildSyntheticSources(
        seedData.countries,
        seedData.snapshotDate,
      ).slice(0, limit);
    }

    return rows.map((row) => {
      const meta = jurisdictionMeta[row.jurisdiction] ?? {
        slug: row.jurisdiction,
        name: row.jurisdiction,
        shortName: row.jurisdiction.slice(0, 2).toUpperCase(),
        flagUrl: "",
      };
      const policy = row.policy_extraction;
      const framing = row.risk_framing;
      const dominantFrame =
        toFrameLabel(framing?.dominant_frame) ?? "innovation_enablement";
      const updatedAtRaw = row.machine_created_at ?? null;
      const reviewState: ReviewState = "approved";
      return {
        id: row.document_id,
        title: row.title,
        jurisdiction: meta.name,
        jurisdictionSlug: meta.slug,
        flagUrl: meta.flagUrl,
        shortName: meta.shortName,
        documentType: humanizeDocumentType(policy?.document_type),
        reviewState,
        dominantFrame,
        updatedAt: formatShortDate(updatedAtRaw),
        dateSort: toTimestamp(updatedAtRaw),
      } satisfies SourceEntry;
    });
  } catch (error) {
    handleDatabaseReadFailure("latest sources from Neon", error);
    if (!allowLocalFallback()) {
      throw error;
    }
    return buildSyntheticSources(
      seedData.countries,
      seedData.snapshotDate,
    ).slice(0, limit);
  }
}

function documentListItemToSourceEntry(doc: DocumentListItem): SourceEntry {
  // Look up the canonical jurisdiction slug from the display name/short code.
  const entry = jurisdictionOrder
    .map((key) => jurisdictionMeta[key])
    .find(
      (meta) =>
        meta.name === doc.jurisdiction ||
        meta.shortName === doc.jurisdictionShort,
    );
  const slug = entry?.slug ?? doc.jurisdictionShort.toLowerCase();
  const flagUrl = entry?.flagUrl ?? "";
  const shortName = entry?.shortName ?? doc.jurisdictionShort;
  return {
    id: doc.id,
    title: doc.title,
    jurisdiction: doc.jurisdiction,
    jurisdictionSlug: slug,
    flagUrl,
    shortName,
    documentType: doc.documentType,
    reviewState: "approved",
    dominantFrame: doc.dominantFrame ?? "innovation_enablement",
    updatedAt: doc.publicationDate,
    dateSort: toTimestamp(doc.publicationDate),
  };
}
