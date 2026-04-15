import "server-only";

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import {
  allowLocalFallback,
  getDatabaseClient,
  handleDatabaseReadFailure,
} from "@/lib/db";
import { jurisdictionMeta, jurisdictionOrder, type JurisdictionKey } from "@/lib/jurisdictions";
import { frameLabels, type FrameLabel } from "@/lib/seed-data";

type AnalysisState = "analyzed" | "parsed";

type ParsedSection = {
  heading?: string | null;
  level?: number | null;
  content: string;
};

type ParsedDocumentFile = {
  parser_version: string;
  title: string;
  language?: string | null;
  plain_text: string;
  sections?: ParsedSection[];
  warnings?: string[];
  source_artifact_path?: string | null;
};

type DocumentAnalysisFile = {
  policy_extraction?: {
    issuing_body?: string;
    document_type?: string;
    safety_requirements?: { label: string; confidence?: number }[];
    enforcement_mechanisms?: { label: string; confidence?: number }[];
  };
  risk_framing?: {
    dominant_frame?: FrameLabel;
    secondary_frames?: FrameLabel[];
    frame_confidence?: Record<string, number>;
    rationale_summary?: string;
  };
};

type MetadataFile = {
  jurisdiction?: JurisdictionKey;
  document_id?: string;
  title?: string;
  canonical_url?: string;
  source_url?: string;
  publication_date?: string;
  source_publication_date?: string;
  last_updated_date?: string;
  issuing_body?: string;
  language?: string;
  languages?: string[];
};

type DocumentIndexRow = {
  document_id: string;
  title: string;
  jurisdiction: JurisdictionKey;
  canonical_url: string | null;
  language: string;
  publication_date: string | null;
  normalized_text_path: string;
  machine_created_at: string | null;
  policy_extraction: {
    document_type?: string;
    issuing_body?: string;
    safety_requirements?: { label: string }[];
    enforcement_mechanisms?: { label: string }[];
  } | null;
  risk_framing: {
    dominant_frame?: FrameLabel;
    secondary_frames?: FrameLabel[];
    rationale_summary?: string;
  } | null;
};

type DocumentDetailRow = DocumentIndexRow & {
  normalized_text: string;
  raw_artifact_path: string | null;
  parser_version: string;
};

export type DocumentListItem = {
  id: string;
  title: string;
  href: string;
  jurisdiction: string;
  jurisdictionShort: string;
  publicationDate: string;
  language: string;
  documentType: string;
  sourceUrl: string | null;
  analysisState: AnalysisState;
  dominantFrame: FrameLabel | null;
  topRequirements: string[];
};

export type DocumentDetail = {
  id: string;
  title: string;
  jurisdiction: string;
  jurisdictionShort: string;
  publicationDate: string;
  language: string;
  sourceUrl: string | null;
  issuingBody: string;
  documentType: string;
  analysisState: AnalysisState;
  dominantFrame: FrameLabel | null;
  secondaryFrames: FrameLabel[];
  topRequirements: string[];
  enforcementMechanisms: string[];
  rationaleSummary: string;
  normalizedText: string;
  sections: ParsedSection[];
  warnings: string[];
  rawArtifactPath: string | null;
  parserVersion: string;
};

const WORKSPACE_ROOT = path.resolve(process.cwd(), "..", "..");
const PARSED_ROOT = path.join(WORKSPACE_ROOT, "data", "parsed");
const RAW_ROOT = path.join(WORKSPACE_ROOT, "data", "raw");
const ANALYSIS_ROOT = path.join(WORKSPACE_ROOT, "data", "analysis");

export async function getDocumentListItems(): Promise<DocumentListItem[]> {
  const sql = getDatabaseClient();
  if (!sql) {
    return loadFallbackDocumentList();
  }
  try {
    const rows = (await sql`
      SELECT
        d.id AS document_id,
        d.title,
        d.jurisdiction,
        COALESCE(d.canonical_url, d.raw_metadata->>'canonical_url', d.raw_metadata->>'source_url') AS canonical_url,
        COALESCE(NULLIF(d.language, ''), d.raw_metadata->>'language') AS language,
        COALESCE(
          d.publication_date::text,
          d.raw_metadata->>'publication_date',
          d.raw_metadata->>'source_publication_date'
        ) AS publication_date,
        d.normalized_text_path,
        latest_machine.created_at::text AS machine_created_at,
        latest_machine.policy_extraction,
        latest_machine.risk_framing
      FROM documents d
      LEFT JOIN LATERAL (
        SELECT *
        FROM machine_document_analyses m
        WHERE m.document_id = d.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) latest_machine ON TRUE
      WHERE latest_machine.id IS NOT NULL
      ORDER BY d.publication_date DESC NULLS LAST, d.id ASC
    `) as DocumentIndexRow[];

    if (!rows.length) {
      return loadFallbackDocumentList();
    }

    return rows.map((row) => {
      const policy = row.policy_extraction ?? {};
      const framing = row.risk_framing ?? {};
      return {
        id: row.document_id,
        title: row.title,
        href: `/documents/${row.document_id}`,
        jurisdiction: jurisdictionMeta[row.jurisdiction].name,
        jurisdictionShort: jurisdictionMeta[row.jurisdiction].shortName,
        publicationDate: formatDate(row.publication_date),
        language: humanizeLanguage(row.language),
        documentType: humanizeDocumentType(policy.document_type),
        sourceUrl: row.canonical_url,
        analysisState: deriveAnalysisState(Boolean(row.policy_extraction)),
        dominantFrame: toFrameLabel(framing.dominant_frame),
        topRequirements: (policy.safety_requirements ?? [])
          .slice(0, 3)
          .map((item) => humanizeLabel(item.label)),
      };
    });
  } catch (error) {
    handleDatabaseReadFailure("document index from Neon", error);
    if (!allowLocalFallback()) {
      throw error;
    }
    return loadFallbackDocumentList();
  }
}

export async function getDocumentDetail(documentId: string): Promise<DocumentDetail | null> {
  const sql = getDatabaseClient();
  if (!sql) {
    return loadFallbackDocumentDetail(documentId);
  }
  try {
    const rows = (await sql`
      SELECT
        d.id AS document_id,
        d.title,
        d.jurisdiction,
        COALESCE(d.canonical_url, d.raw_metadata->>'canonical_url', d.raw_metadata->>'source_url') AS canonical_url,
        COALESCE(NULLIF(d.language, ''), d.raw_metadata->>'language') AS language,
        COALESCE(
          d.publication_date::text,
          d.raw_metadata->>'publication_date',
          d.raw_metadata->>'source_publication_date'
        ) AS publication_date,
        d.normalized_text_path,
        d.normalized_text,
        d.raw_artifact_path,
        d.parser_version,
        latest_machine.created_at::text AS machine_created_at,
        latest_machine.policy_extraction,
        latest_machine.risk_framing
      FROM documents d
      LEFT JOIN LATERAL (
        SELECT *
        FROM machine_document_analyses m
        WHERE m.document_id = d.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) latest_machine ON TRUE
      WHERE d.id = ${documentId}
        AND latest_machine.id IS NOT NULL
      LIMIT 1
    `) as DocumentDetailRow[];

    const row = rows[0];
    if (!row) {
      return loadFallbackDocumentDetail(documentId);
    }

    const policy = row.policy_extraction ?? {};
    const framing = row.risk_framing ?? {};
    const parsed = await readParsedDocument(row.normalized_text_path);

    return {
      id: row.document_id,
      title: row.title,
      jurisdiction: jurisdictionMeta[row.jurisdiction].name,
      jurisdictionShort: jurisdictionMeta[row.jurisdiction].shortName,
      publicationDate: formatDate(row.publication_date),
      language: humanizeLanguage(row.language),
      sourceUrl: row.canonical_url,
      issuingBody: policy.issuing_body ?? "Unknown issuing body",
      documentType: humanizeDocumentType(policy.document_type),
      analysisState: deriveAnalysisState(Boolean(row.policy_extraction)),
      dominantFrame: toFrameLabel(framing.dominant_frame),
      secondaryFrames: (framing.secondary_frames ?? []).flatMap((frame) => {
        const typed = toFrameLabel(frame);
        return typed ? [typed] : [];
      }),
      topRequirements: (policy.safety_requirements ?? []).map((item) => humanizeLabel(item.label)),
      enforcementMechanisms: (policy.enforcement_mechanisms ?? []).map((item) =>
        humanizeLabel(item.label),
      ),
      rationaleSummary: framing.rationale_summary ?? "No rationale summary available yet.",
      normalizedText: parsed?.plain_text ?? row.normalized_text,
      sections: parsed?.sections?.length
        ? parsed.sections
        : [{ heading: "Full text", level: 1, content: row.normalized_text }],
      warnings: parsed?.warnings ?? [],
      rawArtifactPath: row.raw_artifact_path,
      parserVersion: row.parser_version,
    };
  } catch (error) {
    handleDatabaseReadFailure(`document detail for ${documentId} from Neon`, error);
    if (!allowLocalFallback()) {
      throw error;
    }
    return loadFallbackDocumentDetail(documentId);
  }
}

async function loadFallbackDocumentList(): Promise<DocumentListItem[]> {
  const records = await loadFallbackRecords();
  return records
    .sort((left, right) => right.sortTimestamp - left.sortTimestamp)
    .map((record) => ({
      id: record.documentId,
      title: record.title,
      href: `/documents/${record.documentId}`,
      jurisdiction: jurisdictionMeta[record.jurisdiction].name,
      jurisdictionShort: jurisdictionMeta[record.jurisdiction].shortName,
      publicationDate: formatDate(record.publicationDate),
      language: humanizeLanguage(record.language ?? record.metadata?.language ?? record.metadata?.languages?.[0] ?? "unknown"),
      documentType: humanizeDocumentType(record.analysis?.policy_extraction?.document_type),
      sourceUrl: record.metadata?.source_url ?? record.metadata?.canonical_url ?? null,
      analysisState: record.analysis ? "analyzed" : "parsed",
      dominantFrame: toFrameLabel(record.analysis?.risk_framing?.dominant_frame),
      topRequirements:
        record.analysis?.policy_extraction?.safety_requirements?.map((item) =>
          humanizeLabel(item.label),
        ) ?? [],
    }));
}

async function loadFallbackDocumentDetail(documentId: string): Promise<DocumentDetail | null> {
  const records = await loadFallbackRecords();
  const record = records.find((item) => item.documentId === documentId);
  if (!record) {
    return null;
  }

  return {
    id: record.documentId,
    title: record.title,
    jurisdiction: jurisdictionMeta[record.jurisdiction].name,
    jurisdictionShort: jurisdictionMeta[record.jurisdiction].shortName,
    publicationDate: formatDate(record.publicationDate),
    language: humanizeLanguage(record.language ?? record.metadata?.language ?? record.metadata?.languages?.[0] ?? "unknown"),
    sourceUrl: record.metadata?.source_url ?? record.metadata?.canonical_url ?? null,
    issuingBody: record.analysis?.policy_extraction?.issuing_body ?? record.metadata?.issuing_body ?? "Unknown issuing body",
    documentType: humanizeDocumentType(record.analysis?.policy_extraction?.document_type),
    analysisState: record.analysis ? "analyzed" : "parsed",
    dominantFrame: toFrameLabel(record.analysis?.risk_framing?.dominant_frame),
    secondaryFrames: (record.analysis?.risk_framing?.secondary_frames ?? []).flatMap((frame) => {
      const typed = toFrameLabel(frame);
      return typed ? [typed] : [];
    }),
    topRequirements:
      record.analysis?.policy_extraction?.safety_requirements?.map((item) =>
        humanizeLabel(item.label),
      ) ?? [],
    enforcementMechanisms:
      record.analysis?.policy_extraction?.enforcement_mechanisms?.map((item) =>
        humanizeLabel(item.label),
      ) ?? [],
    rationaleSummary:
      record.analysis?.risk_framing?.rationale_summary ?? "No framing analysis has been stored yet.",
    normalizedText: record.parsed.plain_text,
    sections:
      record.parsed.sections?.length
        ? record.parsed.sections
        : [{ heading: "Full text", level: 1, content: record.parsed.plain_text }],
    warnings: record.parsed.warnings ?? [],
    rawArtifactPath: record.parsed.source_artifact_path ?? null,
    parserVersion: record.parsed.parser_version,
  };
}

type FallbackRecord = {
  documentId: string;
  jurisdiction: JurisdictionKey;
  title: string;
  language: string | null | undefined;
  publicationDate: string | null | undefined;
  sortTimestamp: number;
  metadata: MetadataFile | null;
  parsed: ParsedDocumentFile;
  analysis: DocumentAnalysisFile | null;
};

async function loadFallbackRecords(): Promise<FallbackRecord[]> {
  const jurisdictionDirs = await safeReadDir(PARSED_ROOT);
  const records: FallbackRecord[] = [];

  for (const jurisdiction of jurisdictionDirs) {
    if (!isJurisdictionKey(jurisdiction)) {
      continue;
    }
    const documentDirs = await safeReadDir(path.join(PARSED_ROOT, jurisdiction));
    for (const documentId of documentDirs) {
      const parsedPath = path.join(PARSED_ROOT, jurisdiction, documentId, "normalized.json");
      const parsed = await safeReadJson<ParsedDocumentFile>(parsedPath);
      if (!parsed) {
        continue;
      }
      const metadata = await safeReadJson<MetadataFile>(
        path.join(RAW_ROOT, jurisdiction, documentId, "metadata.json"),
      );
      const analysis = await safeReadJson<DocumentAnalysisFile>(
        path.join(ANALYSIS_ROOT, jurisdiction, documentId, "document_analysis.json"),
      );
      const parsedStat = await stat(parsedPath);
      const title = metadata?.title ?? parsed.title ?? documentId;
      const publicationDate = metadata?.publication_date ?? metadata?.source_publication_date;
      records.push({
        documentId,
        jurisdiction,
        title,
        language: parsed.language ?? metadata?.language ?? metadata?.languages?.[0],
        publicationDate,
        sortTimestamp: publicationDate ? Date.parse(publicationDate) || parsedStat.mtimeMs : parsedStat.mtimeMs,
        metadata: metadata ?? null,
        parsed,
        analysis: analysis ?? null,
      });
    }
  }

  return records;
}

async function readParsedDocument(normalizedTextPath: string) {
  return safeReadJson<ParsedDocumentFile>(normalizedTextPath);
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

function deriveAnalysisState(hasMachineAnalysis: boolean): AnalysisState {
  if (hasMachineAnalysis) {
    return "analyzed";
  }
  return "parsed";
}

function humanizeLabel(label: string) {
  return label
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function humanizeDocumentType(label?: string) {
  if (!label) {
    return "Unclassified document";
  }
  const mapped: Record<string, string> = {
    legislation: "Legislation",
    executive_order: "Executive action",
    strategy_paper: "Strategy paper",
    regulatory_guidance: "Regulatory guidance",
    standards_guideline: "Standards guideline",
    voluntary_commitment: "Voluntary commitment",
  };
  return mapped[label] ?? humanizeLabel(label);
}

function humanizeLanguage(language: string) {
  const mapped: Record<string, string> = {
    en: "English",
    ja: "Japanese",
    ko: "Korean",
    zh: "Chinese",
    unknown: "Unknown",
  };
  return mapped[language] ?? language;
}

function toFrameLabel(value?: string | null): FrameLabel | null {
  if (!value) {
    return null;
  }
  return value in frameLabels ? (value as FrameLabel) : null;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "No date available";
  }
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "No date available";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(timestamp));
}

function isJurisdictionKey(value: string): value is JurisdictionKey {
  return (jurisdictionOrder as readonly string[]).includes(value);
}
