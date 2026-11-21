import "server-only";

import { unstable_cache } from "next/cache";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

import {
  allowLocalFallback,
  getDatabaseClient,
  handleDatabaseReadFailure,
  isUndefinedColumnError,
  OBSERVATORY_CACHE_TAG,
  OBSERVATORY_REVALIDATE_SECONDS,
  withDbTimeout,
} from "@/lib/db";
import type { ExportDocumentRow } from "@/lib/export-formatters";
import {
  jurisdictionMeta,
  jurisdictionOrder,
  type JurisdictionKey,
} from "@/lib/jurisdictions";
import {
  hamiltonRound,
  isKnownFrameLabel,
  normalizeDocumentFrameConfidence,
  SCORING_FRAME_LABELS,
} from "@/lib/scoring";
import type { FrameLabel } from "@/lib/seed-data";
import {
  formatLongDate,
  inferDatePrecision,
  type AnalysisState,
  type DatePrecision,
} from "@/lib/sources-data";
import {
  extractGroundingRatio,
  humanizeBindingStrength,
  humanizeCorpusRole,
  humanizeDocumentType,
  humanizeDomain,
  humanizeEnforcement,
  humanizeLanguage,
  humanizeLifecycleStage,
  humanizeObligationStrength,
  humanizeProseTaxonomyKeys,
  humanizeRequirement,
  toHtmlLang,
} from "@/lib/taxonomy-vocab";
import { safeExternalUrl } from "@/lib/url-safety";

export type ParsedSection = {
  heading?: string | null;
  level?: number | null;
  content: string;
};

export type EvidenceSpan = {
  quote: string;
  quoteEn: string | null;
  sourceSection: string | null;
  frame: FrameLabel | null;
  groundingStatus: string | null;
  startChar: number | null;
  endChar: number | null;
};

export type ExtractedControl = {
  key: string;
  label: string;
  confidence: number | null;
  obligationStrength: string | null;
  obligationStrengthLabel: string | null;
  evidence: EvidenceSpan[];
};

export type FrameScoreBar = {
  label: FrameLabel;
  rawScore: number;
  share: number;
};

export type DocumentProvenance = {
  provider: string | null;
  model: string | null;
  effort: string | null;
  analysisVersion: string | null;
  taxonomyVersion: string;
  isLegacy: boolean;
  extractionPromptHash: string | null;
  framingPromptHash: string | null;
  groundingRatio: number | null;
  analyzedAt: string | null;
  analyzedAtIso: string | null;
};

type RawEvidenceItem = {
  quote?: string;
  quote_en?: string | null;
  text?: string;
  source_section?: string | null;
  section?: string | null;
  frame?: string | null;
  grounding_status?: string | null;
  start_char?: number | null;
  end_char?: number | null;
};

type RawControlItem = {
  label: string;
  confidence?: number;
  obligation_strength?: string | null;
  evidence?: RawEvidenceItem[];
};

type RawPolicyExtraction = {
  issuing_body?: string;
  document_type?: string;
  binding_strength?: string;
  publication_date?: string | null;
  effective_date?: string | null;
  covered_application_domains?: string[];
  implementation_notes?: string | null;
  confidence?: number;
  safety_requirements?: RawControlItem[];
  enforcement_mechanisms?: RawControlItem[];
};

type RawRiskFraming = {
  dominant_frame?: string;
  secondary_frames?: string[];
  frame_confidence?: Record<string, number>;
  frame_share?: Record<string, number> | null;
  rationale_summary?: string;
  evidence_spans?: RawEvidenceItem[];
  evidence?: RawEvidenceItem[];
};

type RawAnalysisMetadata = {
  provider?: string | null;
  model?: string | null;
  effort?: string | null;
  analysis_version?: string | null;
  taxonomy_version?: string | null;
  extraction_prompt_hash?: string | null;
  framing_prompt_hash?: string | null;
  grounding_ratio?: number | null;
  grounding_summary?: {
    grounding_ratio?: number | null;
  } | null;
  analyzed_at?: string | null;
};

type ParsedDocumentFile = {
  parser_version: string;
  extractor?: string | null;
  title: string;
  language?: string | null;
  plain_text: string;
  sections?: ParsedSection[];
  warnings?: string[];
};

type DocumentAnalysisFile = {
  analysis_metadata?: RawAnalysisMetadata | null;
  policy_extraction?: RawPolicyExtraction;
  risk_framing?: RawRiskFraming;
};

type MetadataFile = {
  jurisdiction?: JurisdictionKey;
  document_id?: string;
  title?: string;
  canonical_url?: string;
  source_url?: string;
  publication_date?: string;
  source_publication_date?: string;
  publication_date_precision?: string;
  effective_date?: string;
  issuing_body?: string;
  language?: string;
  languages?: string[];
  corpus_role?: string;
  lifecycle_stage?: string;
  source_tier?: string;
  binding_strength?: string;
  subnational_unit?: string | null;
  supersedes_id?: string | null;
};

type ManifestSeedEntry = {
  id?: string;
  document_id?: string;
  canonical_url?: string;
  source_url?: string;
  publication_date?: string;
  publication_date_precision?: string;
  effective_date?: string;
  issuing_body?: string;
  corpus_role?: string;
  lifecycle_stage?: string;
  source_tier?: string;
  binding_strength?: string;
  document_type?: string;
  subnational_unit?: string | null;
  supersedes_id?: string | null;
};

type DocumentIndexRow = {
  document_id: string;
  title: string;
  jurisdiction: string;
  canonical_url: string | null;
  language: string | null;
  publication_date: string | null;
  publication_date_precision: string | null;
  effective_date: string | null;
  manifest_binding_strength: string | null;
  corpus_role: string | null;
  lifecycle_stage: string | null;
  source_tier: string | null;
  subnational_unit?: string | null;
  supersedes_id?: string | null;
  issuing_body_hint: string | null;
  machine_updated_at: string | null;
  overall_confidence: number | string | null;
  dominant_frame_confidence: number | string | null;
  grounding_ratio: number | string | null;
  taxonomy_version: string | null;
  provider: string | null;
  model: string | null;
  effort: string | null;
  analysis_version: string | null;
  extraction_prompt_hash: string | null;
  framing_prompt_hash: string | null;
  frame_shares_json: Record<string, number> | null;
  obligation_strengths_json?: Record<string, string> | null;
  policy_extraction: RawPolicyExtraction | null;
  risk_framing: RawRiskFraming | null;
};

type DocumentDetailRow = DocumentIndexRow & {
  normalized_text_path: string;
  normalized_text: string;
  parser_version: string;
  sections_json?: ParsedSection[] | null;
  parser_warnings_json?: string[] | null;
};

export type DocumentListItem = {
  id: string;
  title: string;
  href: string;
  jurisdictionKey: string;
  jurisdiction: string;
  jurisdictionSlug: string;
  jurisdictionShort: string;
  flagUrl: string;
  publicationDate: string;
  publicationDateIso: string | null;
  publicationDatePrecision: DatePrecision;
  effectiveDateIso: string | null;
  dateSort: number;
  language: string;
  languageCode: string;
  issuingBody: string;
  documentType: string;
  documentTypeKey: string;
  bindingStrength: string;
  bindingStrengthLabel: string;
  modelBindingStrength: string | null;
  corpusRole: string | null;
  corpusRoleLabel: string;
  lifecycleStage: string | null;
  lifecycleStageLabel: string;
  subnationalUnit: string | null;
  supersedesId: string | null;
  overallConfidence: number | null;
  policyConfidence: number | null;
  dominantFrameConfidence: number | null;
  groundingRatio: number | null;
  taxonomyVersion: string;
  model: string | null;
  promptHashes: string | null;
  sourceUrl: string | null;
  analysisState: AnalysisState;
  dominantFrame: FrameLabel | null;
  frameScoresMap: Record<string, number>;
  topRequirements: string[];
  requirementKeys: string[];
  enforcementKeys: string[];
  /** Concatenated quote text used for client-side quote search on /documents (C7). */
  evidenceSearchText: string;
};

/** Full batch record used by compare-data.ts (A10), matrix-data.ts (C1), /clauses, and /evolution — zero N+1! */
export type ComparisonCorpusDocument = Omit<
  DocumentListItem,
  "evidenceSearchText"
> & {
  safetyRequirements: ExtractedControl[];
  enforcementMechanisms: ExtractedControl[];
  framingEvidence: EvidenceSpan[];
  frameScores: FrameScoreBar[];
  frameShare: Record<string, number> | null;
  effectiveDateLabel: string | null;
};

export type DocumentDetail = {
  id: string;
  title: string;
  jurisdictionKey: string;
  jurisdiction: string;
  jurisdictionSlug: string;
  jurisdictionShort: string;
  flagUrl: string;
  publicationDate: string;
  publicationDateIso: string | null;
  publicationDatePrecision: DatePrecision;
  effectiveDate: string | null;
  language: string;
  languageCode: string;
  sourceUrl: string | null;
  issuingBody: string;
  documentType: string;
  documentTypeKey: string;
  bindingStrength: string;
  bindingStrengthLabel: string;
  modelBindingStrength: string | null;
  modelBindingStrengthLabel: string | null;
  corpusRole: string | null;
  corpusRoleLabel: string;
  lifecycleStage: string | null;
  lifecycleStageLabel: string;
  subnationalUnit: string | null;
  supersedesId: string | null;
  overallConfidence: number | null;
  policyConfidence: number | null;
  dominantFrameConfidence: number | null;
  coveredApplicationDomains: { key: string; label: string }[];
  implementationNotes: string | null;
  analysisState: AnalysisState;
  dominantFrame: FrameLabel | null;
  secondaryFrames: FrameLabel[];
  frameScores: FrameScoreBar[];
  framingEvidence: EvidenceSpan[];
  safetyRequirements: ExtractedControl[];
  enforcementMechanisms: ExtractedControl[];
  rationaleSummary: string;
  sections: ParsedSection[];
  warnings: string[];
  parserVersion: string;
  provenance: DocumentProvenance;
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

function getJurisdictionSafe(key: string) {
  if (key in jurisdictionMeta) {
    return jurisdictionMeta[key as JurisdictionKey];
  }
  return {
    slug: key.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name: key.replaceAll("_", " "),
    shortName: key.slice(0, 2).toUpperCase(),
    flagUrl: "",
  };
}

function parseDateTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return Date.UTC(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    );
  }
  const yearMonth = value.match(/^(\d{4})-(\d{2})$/);
  if (yearMonth) {
    return Date.UTC(Number(yearMonth[1]), Number(yearMonth[2]) - 1, 1);
  }
  const yearOnly = value.match(/^(\d{4})$/);
  if (yearOnly) {
    return Date.UTC(Number(yearOnly[1]), 0, 1);
  }
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
}

function toNumberOrNull(
  value: number | string | null | undefined,
): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** A7: Unified mean confidence (policy + dominant frame) matching persistence.py. */
export function computeUnifiedConfidence(
  policyConfidence: number | null,
  dominantFrameConfidence: number | null,
  dbOverallConfidence?: number | null,
): number | null {
  if (
    typeof policyConfidence === "number" &&
    typeof dominantFrameConfidence === "number"
  ) {
    return Math.round(((policyConfidence + dominantFrameConfidence) / 2) * 1000) / 1000;
  }
  if (typeof dbOverallConfidence === "number") return dbOverallConfidence;
  return policyConfidence ?? dominantFrameConfidence ?? null;
}

function resolveDominantFrameConfidence(
  framing: RawRiskFraming | null | undefined,
  dbVal?: number | string | null,
): number | null {
  const fromDb = toNumberOrNull(dbVal);
  if (fromDb !== null) return fromDb;
  const dom = framing?.dominant_frame;
  if (dom && framing?.frame_confidence && dom in framing.frame_confidence) {
    return toNumberOrNull(framing.frame_confidence[dom]);
  }
  return null;
}

function normalizeEvidence(items: RawEvidenceItem[] | undefined): EvidenceSpan[] {
  if (!items || !Array.isArray(items)) return [];
  const out: EvidenceSpan[] = [];
  for (const item of items) {
    const quote = (item.quote ?? item.text ?? "").trim();
    if (!quote) continue;
    out.push({
      quote,
      quoteEn: item.quote_en?.trim() || null,
      sourceSection: item.source_section ?? item.section ?? null,
      frame: isKnownFrameLabel(item.frame) ? item.frame : null,
      groundingStatus: item.grounding_status ?? null,
      startChar: typeof item.start_char === "number" ? item.start_char : null,
      endChar: typeof item.end_char === "number" ? item.end_char : null,
    });
  }
  return out;
}

function normalizeControls(
  items: RawControlItem[] | undefined,
  humanizer: (label?: string | null) => string,
  obligationOverrides?: Record<string, string> | null,
): ExtractedControl[] {
  if (!items || !Array.isArray(items)) return [];
  return items
    .filter((item) => Boolean(item?.label))
    .map((item) => {
      const obligationStrength =
        obligationOverrides?.[item.label] ?? item.obligation_strength ?? null;
      return {
        key: item.label,
        label: humanizer(item.label),
        confidence: toNumberOrNull(item.confidence),
        obligationStrength,
        obligationStrengthLabel: obligationStrength
          ? humanizeObligationStrength(obligationStrength)
          : null,
        evidence: normalizeEvidence(item.evidence),
      };
    });
}

function buildFrameScores(
  framing: RawRiskFraming | null | undefined,
  frameSharesOverride?: Record<string, number> | null,
): FrameScoreBar[] {
  const fc = framing?.frame_confidence ?? {};
  const shareInput = frameSharesOverride ?? framing?.frame_share ?? null;
  const normalized = normalizeDocumentFrameConfidence(
    fc,
    framing?.dominant_frame,
    shareInput,
  );
  const rounded = hamiltonRound(
    SCORING_FRAME_LABELS.map((label) => ({
      label,
      value: normalized.get(label) ?? 0,
    })),
  );
  return rounded.map((entry) => ({
    label: entry.label,
    rawScore: toNumberOrNull(fc[entry.label]) ?? 0,
    share: entry.value,
  }));
}

function buildFrameScoreMap(framing: RawRiskFraming | null | undefined): Record<string, number> {
  const fc = framing?.frame_confidence ?? {};
  const out: Record<string, number> = {};
  for (const label of SCORING_FRAME_LABELS) {
    out[label] = toNumberOrNull(fc[label]) ?? 0;
  }
  return out;
}

function buildEvidenceSearchText(
  reqs: ExtractedControl[],
  enfs: ExtractedControl[],
  framingEv: EvidenceSpan[],
): string {
  const snippets: string[] = [];
  for (const c of [...reqs, ...enfs]) {
    for (const ev of c.evidence) {
      snippets.push(ev.quote);
      if (ev.quoteEn) snippets.push(ev.quoteEn);
    }
  }
  for (const ev of framingEv) {
    snippets.push(ev.quote);
    if (ev.quoteEn) snippets.push(ev.quoteEn);
  }
  return snippets.join(" ").slice(0, 6000).toLowerCase();
}

function toFrameLabel(value?: string | null): FrameLabel | null {
  return isKnownFrameLabel(value) ? value : null;
}

function buildDocumentHref(documentId: string): string {
  return `/documents/${encodeURIComponent(documentId)}`;
}

function formatPromptHashes(
  extHash?: string | null,
  frmHash?: string | null,
): string | null {
  const parts: string[] = [];
  if (extHash) parts.push(`ext:${extHash.slice(0, 8)}`);
  if (frmHash) parts.push(`frm:${frmHash.slice(0, 8)}`);
  return parts.length > 0 ? parts.join(";") : null;
}

function resolveTaxonomyVersion(raw?: string | null): {
  version: string;
  isLegacy: boolean;
} {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed === "legacy" || trimmed.startsWith("1.0")) {
    return { version: "1.0-legacy", isLegacy: true };
  }
  return { version: trimmed, isLegacy: false };
}

async function queryIndexRowsFromDb(
  jurisdiction: JurisdictionKey,
): Promise<DocumentIndexRow[]> {
  const sql = getDatabaseClient();
  if (!sql) return [];

  // Tier 1: Full schema including migration 005 (documents.binding_strength, frame_shares_json)
  try {
    return (await withDbTimeout(
      sql`
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
          COALESCE(d.publication_date_precision, d.raw_metadata->>'publication_date_precision') AS publication_date_precision,
          COALESCE(d.effective_date::text, d.raw_metadata->>'effective_date') AS effective_date,
          COALESCE(d.binding_strength, d.raw_metadata->>'binding_strength') AS manifest_binding_strength,
          COALESCE(d.corpus_role, d.raw_metadata->>'corpus_role') AS corpus_role,
          COALESCE(d.lifecycle_stage, d.raw_metadata->>'lifecycle_stage') AS lifecycle_stage,
          COALESCE(d.source_tier, d.raw_metadata->>'source_tier') AS source_tier,
          NULLIF(TRIM(d.raw_metadata->>'subnational_unit'), '') AS subnational_unit,
          NULLIF(TRIM(d.raw_metadata->>'supersedes_id'), '') AS supersedes_id,
          d.issuing_body_hint,
          latest_machine.analyzed_at::text AS machine_updated_at,
          latest_machine.overall_confidence,
          latest_machine.dominant_frame_confidence,
          latest_machine.grounding_ratio,
          latest_machine.taxonomy_version,
          latest_machine.provider,
          latest_machine.model,
          latest_machine.effort,
          latest_machine.analysis_version,
          latest_machine.extraction_prompt_hash,
          latest_machine.framing_prompt_hash,
          latest_machine.frame_shares_json,
          mpr_obligations.obligation_strengths_json,
          latest_machine.policy_extraction,
          latest_machine.risk_framing
        FROM documents d
        LEFT JOIN LATERAL (
          SELECT *
          FROM machine_document_analyses m
          WHERE m.document_id = d.id
          ORDER BY m.updated_at DESC, m.id DESC
          LIMIT 1
        ) latest_machine ON TRUE
        LEFT JOIN LATERAL (
          SELECT jsonb_object_agg(mpr.label, mpr.obligation_strength)
            FILTER (WHERE mpr.obligation_strength IS NOT NULL) AS obligation_strengths_json
          FROM machine_policy_requirements mpr
          WHERE mpr.machine_analysis_id = latest_machine.id
        ) mpr_obligations ON TRUE
        WHERE d.jurisdiction = ${jurisdiction}
        ORDER BY
          COALESCE(d.publication_date::text, d.raw_metadata->>'publication_date', d.raw_metadata->>'source_publication_date') DESC NULLS LAST,
          d.id ASC
      `,
      `document index v5 (${jurisdiction})`,
    )) as DocumentIndexRow[];
  } catch (error) {
    if (!isUndefinedColumnError(error)) throw error;
  }

  // Tier 2: Pre-005 / 001–003 schema fallback (still ordering by updated_at DESC, id DESC — A2)
  return (await withDbTimeout(
    sql`
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
        d.raw_metadata->>'publication_date_precision' AS publication_date_precision,
        d.raw_metadata->>'effective_date' AS effective_date,
        d.raw_metadata->>'binding_strength' AS manifest_binding_strength,
        d.raw_metadata->>'corpus_role' AS corpus_role,
        d.raw_metadata->>'lifecycle_stage' AS lifecycle_stage,
        d.raw_metadata->>'source_tier' AS source_tier,
        NULLIF(TRIM(d.raw_metadata->>'subnational_unit'), '') AS subnational_unit,
        NULLIF(TRIM(d.raw_metadata->>'supersedes_id'), '') AS supersedes_id,
        d.issuing_body_hint,
        NULL::text AS machine_updated_at,
        latest_machine.overall_confidence,
        latest_machine.dominant_frame_confidence,
        NULL::numeric AS grounding_ratio,
        NULL::text AS taxonomy_version,
        latest_machine.provider,
        latest_machine.model,
        latest_machine.effort,
        latest_machine.analysis_version,
        latest_machine.extraction_prompt_hash,
        latest_machine.framing_prompt_hash,
        NULL::jsonb AS frame_shares_json,
        NULL::jsonb AS obligation_strengths_json,
        latest_machine.policy_extraction,
        latest_machine.risk_framing
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
        COALESCE(d.publication_date::text, d.raw_metadata->>'publication_date', d.raw_metadata->>'source_publication_date') DESC NULLS LAST,
        d.id ASC
    `,
    `document index v1 (${jurisdiction})`,
  )) as DocumentIndexRow[];
}

function mapDbRowToComparisonDoc(row: DocumentIndexRow): ComparisonCorpusDocument {
  const meta = getJurisdictionSafe(row.jurisdiction);
  const policy = row.policy_extraction ?? {};
  const framing = row.risk_framing ?? {};

  // A5: Authoritative manifest binding_strength first; preserve model value separately
  const modelBinding = policy.binding_strength ?? null;
  const bindingKey =
    row.manifest_binding_strength ?? modelBinding ?? "unclassified";
  const docTypeKey = policy.document_type || "unclassified";
  // A4: Never silently default missing role/lifecycle to primary/active
  const corpusRoleKey = row.corpus_role?.trim() || null;
  const lifecycleKey = row.lifecycle_stage?.trim() || null;

  const safetyRequirements = normalizeControls(
    policy.safety_requirements,
    humanizeRequirement,
    row.obligation_strengths_json,
  );
  const enforcementMechanisms = normalizeControls(
    policy.enforcement_mechanisms,
    humanizeEnforcement,
  );
  const framingEvidence = normalizeEvidence(
    framing.evidence_spans ?? framing.evidence,
  );

  const pubIso = row.publication_date ?? policy.publication_date ?? null;
  const precision = inferDatePrecision(pubIso, row.publication_date_precision);
  // A7: Manifest/metadata effective_date FIRST, model fallback second
  const effIso = row.effective_date ?? policy.effective_date ?? null;

  const policyConf = toNumberOrNull(policy.confidence);
  const domFrameConf = resolveDominantFrameConfidence(
    framing,
    row.dominant_frame_confidence,
  );
  const unifiedConf = computeUnifiedConfidence(
    policyConf,
    domFrameConf,
    toNumberOrNull(row.overall_confidence),
  );
  const taxInfo = resolveTaxonomyVersion(row.taxonomy_version);
  const langCode = toHtmlLang(row.language);

  return {
    id: row.document_id,
    title: row.title,
    href: buildDocumentHref(row.document_id),
    jurisdictionKey: row.jurisdiction,
    jurisdiction: meta.name,
    jurisdictionSlug: meta.slug,
    jurisdictionShort: meta.shortName,
    flagUrl: meta.flagUrl,
    publicationDate: formatLongDate(pubIso, precision),
    publicationDateIso: pubIso,
    publicationDatePrecision: precision,
    effectiveDateIso: effIso,
    effectiveDateLabel: effIso ? formatLongDate(effIso) : null,
    dateSort: parseDateTimestamp(pubIso),
    language: humanizeLanguage(row.language),
    languageCode: langCode,
    issuingBody:
      policy.issuing_body ?? row.issuing_body_hint ?? "Unknown issuing body",
    documentType: humanizeDocumentType(policy.document_type),
    documentTypeKey: docTypeKey,
    bindingStrength: bindingKey,
    bindingStrengthLabel: humanizeBindingStrength(bindingKey),
    modelBindingStrength: modelBinding,
    corpusRole: corpusRoleKey,
    corpusRoleLabel: humanizeCorpusRole(corpusRoleKey),
    lifecycleStage: lifecycleKey,
    lifecycleStageLabel: humanizeLifecycleStage(lifecycleKey),
    subnationalUnit: row.subnational_unit?.trim() || null,
    supersedesId: row.supersedes_id?.trim() || null,
    overallConfidence: unifiedConf,
    policyConfidence: policyConf,
    dominantFrameConfidence: domFrameConf,
    groundingRatio: toNumberOrNull(row.grounding_ratio),
    taxonomyVersion: taxInfo.version,
    model: row.model ?? null,
    promptHashes: formatPromptHashes(
      row.extraction_prompt_hash,
      row.framing_prompt_hash,
    ),
    sourceUrl: safeExternalUrl(row.canonical_url),
    analysisState:
      row.policy_extraction || row.risk_framing ? "analyzed" : "parsed",
    dominantFrame: toFrameLabel(framing.dominant_frame),
    frameScoresMap: buildFrameScoreMap(framing),
    frameScores: buildFrameScores(framing, row.frame_shares_json),
    frameShare: row.frame_shares_json ?? framing.frame_share ?? null,
    topRequirements: safetyRequirements.slice(0, 3).map((r) => r.label),
    requirementKeys: safetyRequirements.map((r) => r.key),
    enforcementKeys: enforcementMechanisms.map((e) => e.key),
    safetyRequirements,
    enforcementMechanisms,
    framingEvidence,
  };
}

async function loadJurisdictionCorpusUncached(
  jurisdiction: JurisdictionKey,
): Promise<ComparisonCorpusDocument[]> {
  const sql = getDatabaseClient();
  if (!sql) {
    return allowLocalFallback()
      ? loadFallbackComparisonCorpus(jurisdiction)
      : [];
  }
  try {
    const rows = await queryIndexRowsFromDb(jurisdiction);
    if (!rows.length) {
      return allowLocalFallback()
        ? loadFallbackComparisonCorpus(jurisdiction)
        : [];
    }
    return rows.map(mapDbRowToComparisonDoc);
  } catch (error) {
    handleDatabaseReadFailure(
      `document corpus (${jurisdiction}) from Neon`,
      error,
    );
    if (!allowLocalFallback()) {
      throw error;
    }
    return loadFallbackComparisonCorpus(jurisdiction);
  }
}

/**
 * Per-jurisdiction cached shard so every Next.js Data Cache entry stays far
 * below the 2 MB item limit (~200–450 KB per shard even at 144+ instruments).
 */
const getJurisdictionCorpusCached = unstable_cache(
  loadJurisdictionCorpusUncached,
  ["observatory-jurisdiction-corpus-v5"],
  {
    revalidate: OBSERVATORY_REVALIDATE_SECONDS,
    tags: [OBSERVATORY_CACHE_TAG],
  },
);

/**
 * Single batch loader returning full corpus with extracted controls &
 * evidence quotes — eliminates all N+1 queries in compare-data.ts (A10) and
 * powers /matrix (C1), /documents (C7), /clauses, /evolution, and /api/export (C8).
 * Shards Next.js Data Cache per jurisdiction (<500 KB/shard) and deduplicates
 * across the current request via React cache().
 */
export const getComparisonCorpus = cache(
  async (): Promise<ComparisonCorpusDocument[]> => {
    const shards = await Promise.all(
      jurisdictionOrder.map((jurisdiction) =>
        getJurisdictionCorpusCached(jurisdiction),
      ),
    );
    return shards.flat().sort((left, right) => {
      if (right.dateSort !== left.dateSort) {
        return right.dateSort - left.dateSort;
      }
      return left.id.localeCompare(right.id);
    });
  },
);

export async function getDocumentListItems(): Promise<DocumentListItem[]> {
  const corpus = await getComparisonCorpus();
  return corpus.map((doc) => ({
    id: doc.id,
    title: doc.title,
    href: doc.href,
    jurisdictionKey: doc.jurisdictionKey,
    jurisdiction: doc.jurisdiction,
    jurisdictionSlug: doc.jurisdictionSlug,
    jurisdictionShort: doc.jurisdictionShort,
    flagUrl: doc.flagUrl,
    publicationDate: doc.publicationDate,
    publicationDateIso: doc.publicationDateIso,
    publicationDatePrecision: doc.publicationDatePrecision,
    effectiveDateIso: doc.effectiveDateIso,
    dateSort: doc.dateSort,
    language: doc.language,
    languageCode: doc.languageCode,
    issuingBody: doc.issuingBody,
    documentType: doc.documentType,
    documentTypeKey: doc.documentTypeKey,
    bindingStrength: doc.bindingStrength,
    bindingStrengthLabel: doc.bindingStrengthLabel,
    modelBindingStrength: doc.modelBindingStrength,
    corpusRole: doc.corpusRole,
    corpusRoleLabel: doc.corpusRoleLabel,
    lifecycleStage: doc.lifecycleStage,
    lifecycleStageLabel: doc.lifecycleStageLabel,
    subnationalUnit: doc.subnationalUnit,
    supersedesId: doc.supersedesId,
    overallConfidence: doc.overallConfidence,
    policyConfidence: doc.policyConfidence,
    dominantFrameConfidence: doc.dominantFrameConfidence,
    groundingRatio: doc.groundingRatio,
    taxonomyVersion: doc.taxonomyVersion,
    model: doc.model,
    promptHashes: doc.promptHashes,
    sourceUrl: doc.sourceUrl,
    analysisState: doc.analysisState,
    dominantFrame: doc.dominantFrame,
    frameScoresMap: doc.frameScoresMap,
    topRequirements: doc.topRequirements,
    requirementKeys: doc.requirementKeys,
    enforcementKeys: doc.enforcementKeys,
    evidenceSearchText: buildEvidenceSearchText(
      doc.safetyRequirements,
      doc.enforcementMechanisms,
      doc.framingEvidence,
    ),
  }));
}

async function loadDocumentDetailUncached(
  documentId: string,
): Promise<DocumentDetail | null> {
  const sql = getDatabaseClient();
  if (!sql) {
    return allowLocalFallback() ? loadFallbackDocumentDetail(documentId) : null;
  }
  try {
    let rows: DocumentDetailRow[];
    try {
      rows = (await withDbTimeout(
        sql`
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
            COALESCE(d.publication_date_precision, d.raw_metadata->>'publication_date_precision') AS publication_date_precision,
            COALESCE(d.effective_date::text, d.raw_metadata->>'effective_date') AS effective_date,
            COALESCE(d.binding_strength, d.raw_metadata->>'binding_strength') AS manifest_binding_strength,
            COALESCE(d.corpus_role, d.raw_metadata->>'corpus_role') AS corpus_role,
            COALESCE(d.lifecycle_stage, d.raw_metadata->>'lifecycle_stage') AS lifecycle_stage,
            COALESCE(d.source_tier, d.raw_metadata->>'source_tier') AS source_tier,
            NULLIF(TRIM(d.raw_metadata->>'subnational_unit'), '') AS subnational_unit,
            NULLIF(TRIM(d.raw_metadata->>'supersedes_id'), '') AS supersedes_id,
            d.issuing_body_hint,
            d.normalized_text_path,
            d.normalized_text,
            d.parser_version,
            d.sections_json,
            d.parser_warnings_json,
            latest_machine.analyzed_at::text AS machine_updated_at,
            latest_machine.overall_confidence,
            latest_machine.dominant_frame_confidence,
            latest_machine.grounding_ratio,
            latest_machine.taxonomy_version,
            latest_machine.provider,
            latest_machine.model,
            latest_machine.effort,
            latest_machine.analysis_version,
            latest_machine.extraction_prompt_hash,
            latest_machine.framing_prompt_hash,
            latest_machine.frame_shares_json,
            mpr_obligations.obligation_strengths_json,
            latest_machine.policy_extraction,
            latest_machine.risk_framing
          FROM documents d
          LEFT JOIN LATERAL (
            SELECT *
            FROM machine_document_analyses m
            WHERE m.document_id = d.id
            ORDER BY m.updated_at DESC, m.id DESC
            LIMIT 1
          ) latest_machine ON TRUE
          LEFT JOIN LATERAL (
            SELECT jsonb_object_agg(mpr.label, mpr.obligation_strength)
              FILTER (WHERE mpr.obligation_strength IS NOT NULL) AS obligation_strengths_json
            FROM machine_policy_requirements mpr
            WHERE mpr.machine_analysis_id = latest_machine.id
          ) mpr_obligations ON TRUE
          WHERE d.id = ${documentId}
          LIMIT 1
        `,
        `document detail v5 ${documentId}`,
      )) as DocumentDetailRow[];
    } catch (error) {
      if (!isUndefinedColumnError(error)) throw error;
      rows = (await withDbTimeout(
        sql`
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
            d.raw_metadata->>'publication_date_precision' AS publication_date_precision,
            d.raw_metadata->>'effective_date' AS effective_date,
            d.raw_metadata->>'binding_strength' AS manifest_binding_strength,
            d.raw_metadata->>'corpus_role' AS corpus_role,
            d.raw_metadata->>'lifecycle_stage' AS lifecycle_stage,
            d.raw_metadata->>'source_tier' AS source_tier,
            NULLIF(TRIM(d.raw_metadata->>'subnational_unit'), '') AS subnational_unit,
            NULLIF(TRIM(d.raw_metadata->>'supersedes_id'), '') AS supersedes_id,
            d.issuing_body_hint,
            d.normalized_text_path,
            d.normalized_text,
            d.parser_version,
            NULL::text AS machine_updated_at,
            latest_machine.overall_confidence,
            latest_machine.dominant_frame_confidence,
            NULL::numeric AS grounding_ratio,
            NULL::text AS taxonomy_version,
            latest_machine.provider,
            latest_machine.model,
            latest_machine.effort,
            latest_machine.analysis_version,
            latest_machine.extraction_prompt_hash,
            latest_machine.framing_prompt_hash,
            NULL::jsonb AS frame_shares_json,
            NULL::jsonb AS obligation_strengths_json,
            latest_machine.policy_extraction,
            latest_machine.risk_framing
          FROM documents d
          LEFT JOIN LATERAL (
            SELECT *
            FROM machine_document_analyses m
            WHERE m.document_id = d.id
            ORDER BY m.updated_at DESC, m.id DESC
            LIMIT 1
          ) latest_machine ON TRUE
          WHERE d.id = ${documentId}
          LIMIT 1
        `,
        `document detail v1 ${documentId}`,
      )) as DocumentDetailRow[];
    }

    const row = rows[0];
    if (!row) {
      return allowLocalFallback() ? loadFallbackDocumentDetail(documentId) : null;
    }

    const meta = getJurisdictionSafe(row.jurisdiction);
    const policy = row.policy_extraction ?? {};
    const framing = row.risk_framing ?? {};

    let sections: ParsedSection[] =
      Array.isArray(row.sections_json) && row.sections_json.length > 0
        ? row.sections_json
        : [];
    let warnings: string[] = Array.isArray(row.parser_warnings_json)
      ? row.parser_warnings_json
      : [];

    if (sections.length === 0 && allowLocalFallback() && row.normalized_text_path) {
      const parsed = await readParsedDocument(row.normalized_text_path);
      if (parsed?.sections?.length) sections = parsed.sections;
      if (warnings.length === 0 && parsed?.warnings?.length) warnings = parsed.warnings;
    }
    if (sections.length === 0) {
      sections = [{ heading: "Full text", level: 1, content: row.normalized_text }];
    }

    const pubIso = row.publication_date ?? policy.publication_date ?? null;
    const precision = inferDatePrecision(pubIso, row.publication_date_precision);
    const effIso = row.effective_date ?? policy.effective_date ?? null;

    const modelBinding = policy.binding_strength ?? null;
    const bindingKey =
      row.manifest_binding_strength ?? modelBinding ?? "unclassified";
    const docTypeKey = policy.document_type || "unclassified";
    const corpusRoleKey = row.corpus_role?.trim() || null;
    const lifecycleKey = row.lifecycle_stage?.trim() || null;

    const policyConf = toNumberOrNull(policy.confidence);
    const domFrameConf = resolveDominantFrameConfidence(
      framing,
      row.dominant_frame_confidence,
    );
    const unifiedConf = computeUnifiedConfidence(
      policyConf,
      domFrameConf,
      toNumberOrNull(row.overall_confidence),
    );
    const taxInfo = resolveTaxonomyVersion(row.taxonomy_version);

    return {
      id: row.document_id,
      title: row.title,
      jurisdictionKey: row.jurisdiction,
      jurisdiction: meta.name,
      jurisdictionSlug: meta.slug,
      jurisdictionShort: meta.shortName,
      flagUrl: meta.flagUrl,
      publicationDate: formatLongDate(pubIso, precision),
      publicationDateIso: pubIso,
      publicationDatePrecision: precision,
      effectiveDate: effIso ? formatLongDate(effIso) : null,
      language: humanizeLanguage(row.language),
      languageCode: toHtmlLang(row.language),
      sourceUrl: safeExternalUrl(row.canonical_url),
      issuingBody:
        policy.issuing_body ?? row.issuing_body_hint ?? "Unknown issuing body",
      documentType: humanizeDocumentType(policy.document_type),
      documentTypeKey: docTypeKey,
      bindingStrength: bindingKey,
      bindingStrengthLabel: humanizeBindingStrength(bindingKey),
      modelBindingStrength: modelBinding,
      modelBindingStrengthLabel: modelBinding
        ? humanizeBindingStrength(modelBinding)
        : null,
      corpusRole: corpusRoleKey,
      corpusRoleLabel: humanizeCorpusRole(corpusRoleKey),
      lifecycleStage: lifecycleKey,
      lifecycleStageLabel: humanizeLifecycleStage(lifecycleKey),
      subnationalUnit: row.subnational_unit?.trim() || null,
      supersedesId: row.supersedes_id?.trim() || null,
      overallConfidence: unifiedConf,
      policyConfidence: policyConf,
      dominantFrameConfidence: domFrameConf,
      coveredApplicationDomains: (policy.covered_application_domains ?? []).map(
        (key) => ({ key, label: humanizeDomain(key) }),
      ),
      implementationNotes: policy.implementation_notes?.trim()
        ? humanizeProseTaxonomyKeys(policy.implementation_notes.trim())
        : null,
      analysisState:
        row.policy_extraction || row.risk_framing ? "analyzed" : "parsed",
      dominantFrame: toFrameLabel(framing.dominant_frame),
      secondaryFrames: (framing.secondary_frames ?? []).flatMap((frame) => {
        const typed = toFrameLabel(frame);
        return typed ? [typed] : [];
      }),
      frameScores: buildFrameScores(framing, row.frame_shares_json),
      framingEvidence: normalizeEvidence(
        framing.evidence_spans ?? framing.evidence,
      ),
      safetyRequirements: normalizeControls(
        policy.safety_requirements,
        humanizeRequirement,
        row.obligation_strengths_json,
      ),
      enforcementMechanisms: normalizeControls(
        policy.enforcement_mechanisms,
        humanizeEnforcement,
      ),
      rationaleSummary: framing.rationale_summary
        ? humanizeProseTaxonomyKeys(framing.rationale_summary)
        : "No rationale summary available yet.",
      sections,
      warnings,
      parserVersion: row.parser_version,
      provenance: {
        provider: row.provider ?? null,
        model: row.model ?? null,
        effort: row.effort ?? null,
        analysisVersion: row.analysis_version ?? null,
        taxonomyVersion: taxInfo.version,
        isLegacy: taxInfo.isLegacy,
        extractionPromptHash: row.extraction_prompt_hash ?? null,
        framingPromptHash: row.framing_prompt_hash ?? null,
        groundingRatio: toNumberOrNull(row.grounding_ratio),
        analyzedAt: row.machine_updated_at
          ? formatLongDate(row.machine_updated_at)
          : null,
        analyzedAtIso: row.machine_updated_at ?? null,
      },
    };
  } catch (error) {
    handleDatabaseReadFailure(`document detail for ${documentId} from Neon`, error);
    if (!allowLocalFallback()) {
      throw error;
    }
    return loadFallbackDocumentDetail(documentId);
  }
}

const getDocumentDetailCached = unstable_cache(
  loadDocumentDetailUncached,
  ["observatory-document-detail-v4"],
  {
    revalidate: OBSERVATORY_REVALIDATE_SECONDS,
    tags: [OBSERVATORY_CACHE_TAG],
  },
);

export async function getDocumentDetail(
  documentId: string,
): Promise<DocumentDetail | null> {
  return getDocumentDetailCached(documentId);
}

/**
 * Loads all documents in canonical taxonomy-key export format (C8).
 */
export async function getExportDocuments(
  jurisdictionSlug?: string,
): Promise<ExportDocumentRow[]> {
  const list = await getDocumentListItems();
  const filtered = jurisdictionSlug
    ? list.filter((item) => item.jurisdictionSlug === jurisdictionSlug)
    : list;

  return filtered.map((doc) => ({
    id: doc.id,
    title: doc.title,
    jurisdictionKey: doc.jurisdictionKey,
    jurisdiction: doc.jurisdiction,
    jurisdictionShort: doc.jurisdictionShort,
    publicationDateIso: doc.publicationDateIso,
    publicationDatePrecision: doc.publicationDatePrecision,
    effectiveDateIso: doc.effectiveDateIso,
    languageCode: doc.languageCode,
    issuingBody: doc.issuingBody,
    documentTypeKey: doc.documentTypeKey,
    bindingStrengthKey: doc.bindingStrength,
    corpusRoleKey: doc.corpusRole,
    lifecycleStageKey: doc.lifecycleStage,
    dominantFrame: doc.dominantFrame,
    overallConfidence: doc.overallConfidence,
    groundingRatio: doc.groundingRatio,
    model: doc.model,
    promptHashes: doc.promptHashes,
    taxonomyVersion: doc.taxonomyVersion,
    frameScores: doc.frameScoresMap,
    safetyRequirements: doc.requirementKeys,
    enforcementMechanisms: doc.enforcementKeys,
    sourceUrl: doc.sourceUrl,
  }));
}

/* ------------------------------------------------------------------ */
/* Filesystem fallback loaders (local dev / local verification)        */
/* ------------------------------------------------------------------ */

type FallbackRecord = {
  documentId: string;
  jurisdiction: JurisdictionKey;
  title: string;
  language: string | null | undefined;
  publicationDate: string | null | undefined;
  publicationDatePrecision: DatePrecision;
  effectiveDate: string | null | undefined;
  sortTimestamp: number;
  metadata: MetadataFile | null;
  seed: ManifestSeedEntry | null;
  parsed: ParsedDocumentFile;
  analysis: DocumentAnalysisFile | null;
  legacyModelFromRaw: string | null;
};

async function loadManifestIndex(): Promise<Map<string, ManifestSeedEntry>> {
  const index = new Map<string, ManifestSeedEntry>();
  for (const jurisdiction of jurisdictionOrder) {
    const manifestPath = path.join(SOURCES_ROOT, `${jurisdiction}.json`);
    const manifest = await safeReadJson<{
      seed_documents?: ManifestSeedEntry[];
      documents?: ManifestSeedEntry[];
      sources?: ManifestSeedEntry[];
    }>(manifestPath);
    const items =
      manifest?.seed_documents ?? manifest?.documents ?? manifest?.sources ?? [];
    for (const entry of items) {
      const id = entry.document_id ?? entry.id;
      if (id) index.set(id, entry);
    }
  }
  return index;
}

async function readLegacyRawModel(
  jurisdiction: JurisdictionKey,
  documentId: string,
): Promise<string | null> {
  const rawFraming = await safeReadJson<{ model?: string }>(
    path.join(ANALYSIS_ROOT, jurisdiction, documentId, "framing_response.raw.json"),
  );
  if (rawFraming?.model) return rawFraming.model;
  const rawPolicy = await safeReadJson<{
    model?: string;
    metadata?: { model?: string };
  }>(
    path.join(ANALYSIS_ROOT, jurisdiction, documentId, "policy_response.raw.json"),
  );
  return rawPolicy?.model ?? rawPolicy?.metadata?.model ?? null;
}

async function loadFallbackRecords(
  onlyJurisdiction?: JurisdictionKey,
): Promise<FallbackRecord[]> {
  const [jurisdictionDirs, manifestIndex] = await Promise.all([
    onlyJurisdiction
      ? Promise.resolve([onlyJurisdiction])
      : safeReadDir(PARSED_ROOT),
    loadManifestIndex(),
  ]);
  const records: FallbackRecord[] = [];

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
      const parsed = await safeReadJson<ParsedDocumentFile>(parsedPath);
      if (!parsed) continue;

      const [metadata, analysis] = await Promise.all([
        safeReadJson<MetadataFile>(
          path.join(RAW_ROOT, jurisdiction, documentId, "metadata.json"),
        ),
        safeReadJson<DocumentAnalysisFile>(
          path.join(ANALYSIS_ROOT, jurisdiction, documentId, "document_analysis.json"),
        ),
      ]);
      const seed = manifestIndex.get(documentId) ?? null;

      let legacyModelFromRaw: string | null = null;
      if (analysis && !analysis.analysis_metadata?.model) {
        legacyModelFromRaw = await readLegacyRawModel(jurisdiction, documentId);
      }

      const title = metadata?.title ?? parsed.title ?? documentId;
      const publicationDate =
        seed?.publication_date ??
        metadata?.publication_date ??
        metadata?.source_publication_date ??
        analysis?.policy_extraction?.publication_date ??
        null;
      const publicationDatePrecision = inferDatePrecision(
        publicationDate,
        seed?.publication_date_precision ?? metadata?.publication_date_precision,
      );
      // A7: Manifest / metadata effective_date FIRST, model extraction second
      const effectiveDate =
        seed?.effective_date ??
        metadata?.effective_date ??
        analysis?.policy_extraction?.effective_date ??
        null;

      records.push({
        documentId,
        jurisdiction,
        title,
        language:
          parsed.language ??
          metadata?.language ??
          metadata?.languages?.[0] ??
          "unknown",
        publicationDate,
        publicationDatePrecision,
        effectiveDate,
        sortTimestamp: parseDateTimestamp(publicationDate),
        metadata,
        seed,
        parsed,
        analysis,
        legacyModelFromRaw,
      });
    }
  }

  return records;
}

function buildLocalProvenance(record: FallbackRecord): DocumentProvenance {
  const meta = record.analysis?.analysis_metadata ?? null;
  const taxInfo = resolveTaxonomyVersion(meta?.taxonomy_version);
  const analyzedIso = meta?.analyzed_at ?? null;
  return {
    provider: meta?.provider ?? (record.legacyModelFromRaw ? "anthropic" : null),
    model: meta?.model ?? record.legacyModelFromRaw ?? null,
    effort: meta?.effort ?? null,
    analysisVersion: meta?.analysis_version ?? (taxInfo.isLegacy ? "legacy_v1" : null),
    taxonomyVersion: taxInfo.version,
    isLegacy: taxInfo.isLegacy,
    extractionPromptHash: meta?.extraction_prompt_hash ?? null,
    framingPromptHash: meta?.framing_prompt_hash ?? null,
    groundingRatio: extractGroundingRatio(meta),
    analyzedAt: analyzedIso ? formatLongDate(analyzedIso) : null,
    analyzedAtIso: analyzedIso,
  };
}

async function loadFallbackComparisonCorpus(
  onlyJurisdiction?: JurisdictionKey,
): Promise<ComparisonCorpusDocument[]> {
  const records = await loadFallbackRecords(onlyJurisdiction);
  return records
    .sort((left, right) => {
      if (right.sortTimestamp !== left.sortTimestamp) {
        return right.sortTimestamp - left.sortTimestamp;
      }
      return left.documentId.localeCompare(right.documentId);
    })
    .map((record) => {
      const meta = jurisdictionMeta[record.jurisdiction];
      const policy = record.analysis?.policy_extraction;
      const framing = record.analysis?.risk_framing;

      // A5: Manifest binding_strength is authoritative; preserve model value separately
      const modelBinding = policy?.binding_strength ?? null;
      const bindingKey =
        record.seed?.binding_strength ??
        record.metadata?.binding_strength ??
        modelBinding ??
        "unclassified";
      const docTypeKey =
        record.seed?.document_type ?? policy?.document_type ?? "unclassified";
      // A4: Never silently default missing role/lifecycle to primary/active
      const corpusRoleKey =
        record.seed?.corpus_role?.trim() ??
        record.metadata?.corpus_role?.trim() ??
        null;
      const lifecycleKey =
        record.seed?.lifecycle_stage?.trim() ??
        record.metadata?.lifecycle_stage?.trim() ??
        null;

      const safetyRequirements = normalizeControls(
        policy?.safety_requirements,
        humanizeRequirement,
      );
      const enforcementMechanisms = normalizeControls(
        policy?.enforcement_mechanisms,
        humanizeEnforcement,
      );
      const framingEvidence = normalizeEvidence(
        framing?.evidence_spans ?? framing?.evidence,
      );

      const policyConf = toNumberOrNull(policy?.confidence);
      const domFrameConf = resolveDominantFrameConfidence(framing);
      const unifiedConf = computeUnifiedConfidence(policyConf, domFrameConf);
      const provenance = buildLocalProvenance(record);

      return {
        id: record.documentId,
        title: record.title,
        href: buildDocumentHref(record.documentId),
        jurisdictionKey: record.jurisdiction,
        jurisdiction: meta.name,
        jurisdictionSlug: meta.slug,
        jurisdictionShort: meta.shortName,
        flagUrl: meta.flagUrl,
        publicationDate: formatLongDate(
          record.publicationDate,
          record.publicationDatePrecision,
        ),
        publicationDateIso: record.publicationDate ?? null,
        publicationDatePrecision: record.publicationDatePrecision,
        effectiveDateIso: record.effectiveDate ?? null,
        effectiveDateLabel: record.effectiveDate
          ? formatLongDate(record.effectiveDate)
          : null,
        dateSort: record.sortTimestamp,
        language: humanizeLanguage(record.language),
        languageCode: toHtmlLang(record.language),
        issuingBody:
          policy?.issuing_body ??
          record.seed?.issuing_body ??
          record.metadata?.issuing_body ??
          "Unknown issuing body",
        documentType: humanizeDocumentType(docTypeKey),
        documentTypeKey: docTypeKey,
        bindingStrength: bindingKey,
        bindingStrengthLabel: humanizeBindingStrength(bindingKey),
        modelBindingStrength: modelBinding,
        corpusRole: corpusRoleKey,
        corpusRoleLabel: humanizeCorpusRole(corpusRoleKey),
        lifecycleStage: lifecycleKey,
        lifecycleStageLabel: humanizeLifecycleStage(lifecycleKey),
        subnationalUnit:
          record.seed?.subnational_unit?.trim() ||
          record.metadata?.subnational_unit?.trim() ||
          null,
        supersedesId:
          record.seed?.supersedes_id?.trim() ||
          record.metadata?.supersedes_id?.trim() ||
          null,
        overallConfidence: unifiedConf,
        policyConfidence: policyConf,
        dominantFrameConfidence: domFrameConf,
        groundingRatio: provenance.groundingRatio,
        taxonomyVersion: provenance.taxonomyVersion,
        model: provenance.model,
        promptHashes: formatPromptHashes(
          provenance.extractionPromptHash,
          provenance.framingPromptHash,
        ),
        sourceUrl: safeExternalUrl(
          record.seed?.canonical_url ??
            record.metadata?.canonical_url ??
            record.metadata?.source_url ??
            record.seed?.source_url,
        ),
        analysisState: record.analysis ? "analyzed" : "parsed",
        dominantFrame: toFrameLabel(framing?.dominant_frame),
        frameScoresMap: buildFrameScoreMap(framing),
        frameScores: buildFrameScores(framing),
        frameShare: framing?.frame_share ?? null,
        topRequirements: safetyRequirements.slice(0, 3).map((r) => r.label),
        requirementKeys: safetyRequirements.map((r) => r.key),
        enforcementKeys: enforcementMechanisms.map((e) => e.key),
        safetyRequirements,
        enforcementMechanisms,
        framingEvidence,
      };
    });
}

async function loadFallbackDocumentDetail(
  documentId: string,
): Promise<DocumentDetail | null> {
  const records = await loadFallbackRecords();
  const record = records.find((item) => item.documentId === documentId);
  if (!record) return null;

  const meta = jurisdictionMeta[record.jurisdiction];
  const policy = record.analysis?.policy_extraction;
  const framing = record.analysis?.risk_framing;

  const modelBinding = policy?.binding_strength ?? null;
  const bindingKey =
    record.seed?.binding_strength ??
    record.metadata?.binding_strength ??
    modelBinding ??
    "unclassified";
  const docTypeKey =
    record.seed?.document_type ?? policy?.document_type ?? "unclassified";
  const corpusRoleKey =
    record.seed?.corpus_role?.trim() ??
    record.metadata?.corpus_role?.trim() ??
    null;
  const lifecycleKey =
    record.seed?.lifecycle_stage?.trim() ??
    record.metadata?.lifecycle_stage?.trim() ??
    null;

  const policyConf = toNumberOrNull(policy?.confidence);
  const domFrameConf = resolveDominantFrameConfidence(framing);
  const unifiedConf = computeUnifiedConfidence(policyConf, domFrameConf);
  const provenance = buildLocalProvenance(record);

  return {
    id: record.documentId,
    title: record.title,
    jurisdictionKey: record.jurisdiction,
    jurisdiction: meta.name,
    jurisdictionSlug: meta.slug,
    jurisdictionShort: meta.shortName,
    flagUrl: meta.flagUrl,
    publicationDate: formatLongDate(
      record.publicationDate,
      record.publicationDatePrecision,
    ),
    publicationDateIso: record.publicationDate ?? null,
    publicationDatePrecision: record.publicationDatePrecision,
    effectiveDate: record.effectiveDate
      ? formatLongDate(record.effectiveDate)
      : null,
    language: humanizeLanguage(record.language),
    languageCode: toHtmlLang(record.language),
    sourceUrl: safeExternalUrl(
      record.seed?.canonical_url ??
        record.metadata?.canonical_url ??
        record.metadata?.source_url ??
        record.seed?.source_url,
    ),
    issuingBody:
      policy?.issuing_body ??
      record.seed?.issuing_body ??
      record.metadata?.issuing_body ??
      "Unknown issuing body",
    documentType: humanizeDocumentType(docTypeKey),
    documentTypeKey: docTypeKey,
    bindingStrength: bindingKey,
    bindingStrengthLabel: humanizeBindingStrength(bindingKey),
    modelBindingStrength: modelBinding,
    modelBindingStrengthLabel: modelBinding
      ? humanizeBindingStrength(modelBinding)
      : null,
    corpusRole: corpusRoleKey,
    corpusRoleLabel: humanizeCorpusRole(corpusRoleKey),
    lifecycleStage: lifecycleKey,
    lifecycleStageLabel: humanizeLifecycleStage(lifecycleKey),
    subnationalUnit:
      record.seed?.subnational_unit?.trim() ||
      record.metadata?.subnational_unit?.trim() ||
      null,
    supersedesId:
      record.seed?.supersedes_id?.trim() ||
      record.metadata?.supersedes_id?.trim() ||
      null,
    overallConfidence: unifiedConf,
    policyConfidence: policyConf,
    dominantFrameConfidence: domFrameConf,
    coveredApplicationDomains: (policy?.covered_application_domains ?? []).map(
      (key) => ({ key, label: humanizeDomain(key) }),
    ),
    implementationNotes: policy?.implementation_notes?.trim()
      ? humanizeProseTaxonomyKeys(policy.implementation_notes.trim())
      : null,
    analysisState: record.analysis ? "analyzed" : "parsed",
    dominantFrame: toFrameLabel(framing?.dominant_frame),
    secondaryFrames: (framing?.secondary_frames ?? []).flatMap((frame) => {
      const typed = toFrameLabel(frame);
      return typed ? [typed] : [];
    }),
    frameScores: buildFrameScores(framing),
    framingEvidence: normalizeEvidence(
      framing?.evidence_spans ?? framing?.evidence,
    ),
    safetyRequirements: normalizeControls(
      policy?.safety_requirements,
      humanizeRequirement,
    ),
    enforcementMechanisms: normalizeControls(
      policy?.enforcement_mechanisms,
      humanizeEnforcement,
    ),
    rationaleSummary: framing?.rationale_summary
      ? humanizeProseTaxonomyKeys(framing.rationale_summary)
      : "No framing analysis has been stored yet.",
    sections: record.parsed.sections?.length
      ? record.parsed.sections
      : [{ heading: "Full text", level: 1, content: record.parsed.plain_text }],
    warnings: record.parsed.warnings ?? [],
    parserVersion: record.parsed.parser_version,
    provenance,
  };
}

async function readParsedDocument(normalizedTextPath: string) {
  const candidates = path.isAbsolute(normalizedTextPath)
    ? [normalizedTextPath]
    : [
        path.resolve(/*turbopackIgnore: true*/ WORKSPACE_ROOT, normalizedTextPath),
        normalizedTextPath,
      ];
  for (const candidate of candidates) {
    const parsed = await safeReadJson<ParsedDocumentFile>(candidate);
    if (parsed) return parsed;
  }
  return null;
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
