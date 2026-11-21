/**
 * Pure research export formatters (CSV with UTF-8 BOM + canonical taxonomy keys,
 * and versioned BibTeX) for Project Babel (C8).
 */

import { safeExternalUrl } from "./url-safety.ts";

export type ExportDocumentRow = {
  id: string;
  title: string;
  jurisdictionKey: string;
  jurisdiction: string;
  jurisdictionShort: string;
  publicationDateIso: string | null;
  publicationDatePrecision: string | null;
  effectiveDateIso: string | null;
  languageCode: string;
  issuingBody: string;
  documentTypeKey: string;
  bindingStrengthKey: string;
  corpusRoleKey: string | null;
  lifecycleStageKey: string | null;
  dominantFrame: string | null;
  overallConfidence: number | null;
  groundingRatio: number | null;
  model: string | null;
  promptHashes: string | null;
  taxonomyVersion: string;
  frameScores: Record<string, number>;
  safetyRequirements: string[];
  enforcementMechanisms: string[];
  sourceUrl: string | null;
};

const FRAME_COLUMNS = [
  "existential_catastrophic",
  "national_security",
  "fundamental_rights",
  "economic_competitiveness",
  "innovation_enablement",
  "social_stability",
  "consumer_public_safety",
  "labor_transition",
] as const;

function escapeCsvCell(value: string): string {
  // Neutralize spreadsheet formula injection (=, +, -, @, \t, \r)
  const neutralized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(neutralized)) {
    return `"${neutralized.replaceAll('"', '""')}"`;
  }
  return neutralized;
}

/**
 * Formats corpus rows as RFC 4180 CSV with UTF-8 BOM (`\uFEFF`) so Excel
 * opens CJK titles cleanly, emitting canonical taxonomy keys across all columns (C8).
 */
export function formatDocumentsAsCsv(rows: readonly ExportDocumentRow[]): string {
  const headers = [
    "document_id",
    "jurisdiction",
    "jurisdiction_code",
    "title",
    "publication_date",
    "publication_date_precision",
    "effective_date",
    "language",
    "issuing_body",
    "document_type",
    "binding_strength",
    "corpus_role",
    "lifecycle_stage",
    "dominant_frame",
    ...FRAME_COLUMNS.map((f) => `frame_${f}`),
    "model_self_reported_confidence",
    "grounding_ratio",
    "model",
    "prompt_hashes",
    "taxonomy_version",
    "safety_requirements",
    "enforcement_mechanisms",
    "source_url",
  ];

  const lines = [headers.join(",")];
  for (const row of rows) {
    const cells = [
      row.id,
      row.jurisdictionKey,
      row.jurisdictionShort,
      row.title,
      row.publicationDateIso ?? "",
      row.publicationDatePrecision ?? "day",
      row.effectiveDateIso ?? "",
      row.languageCode,
      row.issuingBody,
      row.documentTypeKey,
      row.bindingStrengthKey,
      row.corpusRoleKey ?? "unclassified",
      row.lifecycleStageKey ?? "unclassified",
      row.dominantFrame ?? "",
      ...FRAME_COLUMNS.map((f) => {
        const val = row.frameScores[f];
        return typeof val === "number" && Number.isFinite(val)
          ? val.toFixed(3)
          : "0.000";
      }),
      row.overallConfidence != null ? row.overallConfidence.toFixed(3) : "",
      row.groundingRatio != null ? row.groundingRatio.toFixed(3) : "",
      row.model ?? "",
      row.promptHashes ?? "",
      row.taxonomyVersion,
      row.safetyRequirements.join("; "),
      row.enforcementMechanisms.join("; "),
      safeExternalUrl(row.sourceUrl) ?? "",
    ];
    lines.push(cells.map((cell) => escapeCsvCell(cell)).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

function escapeBibtex(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("{", "\\{")
    .replaceAll("}", "\\}")
    .replaceAll("&", "\\&")
    .replaceAll("%", "\\%")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatObservatoryBibtex(meta: {
  datasetVersion: string;
  latestPublicationDate: string;
  documentCount: number;
  taxonomyVersion: string;
  url?: string;
}): string {
  const yearMatch = meta.datasetVersion.match(/\b(\d{4})\b/);
  const year = yearMatch ? yearMatch[1] : "2026";
  const url = safeExternalUrl(meta.url) ?? "https://project-babel.com";
  const fields = [
    `  author       = {{Project Babel AI Governance Observatory}}`,
    `  title        = {{Project Babel: Comparative AI Policy Structure and Risk Framing Dataset (Taxonomy ${escapeBibtex(meta.taxonomyVersion)})}}`,
    `  year         = {${year}}`,
    `  version      = {${escapeBibtex(meta.datasetVersion)}}`,
    `  howpublished = {\\url{${url}}}`,
    `  note         = {Dataset snapshot ${escapeBibtex(meta.datasetVersion)}; ${meta.documentCount} official documents across US, EU, South Korea, Japan, and China; latest source publication ${escapeBibtex(meta.latestPublicationDate)}}`,
  ];
  return `@misc{project_babel_observatory_${year},\n${fields.join(",\n")}\n}`;
}

export function formatDocumentsAsBibtex(
  rows: readonly ExportDocumentRow[],
  meta: {
    datasetVersion: string;
    latestPublicationDate: string;
    taxonomyVersion: string;
  },
): string {
  const entries = [
    formatObservatoryBibtex({
      datasetVersion: meta.datasetVersion,
      latestPublicationDate: meta.latestPublicationDate,
      documentCount: rows.length,
      taxonomyVersion: meta.taxonomyVersion,
    }),
  ];

  for (const row of rows) {
    const key = row.id.replace(/[^a-zA-Z0-9_]/g, "_");
    const year = row.publicationDateIso?.slice(0, 4) || "n.d.";
    const fields = [
      `  author       = {{${escapeBibtex(row.issuingBody || row.jurisdiction)}}}`,
      `  title        = {{${escapeBibtex(row.title)}}}`,
      `  year         = {${year}}`,
      `  institution  = {{${escapeBibtex(row.jurisdiction)}}}`,
      `  note         = {${escapeBibtex(`type=${row.documentTypeKey}; binding=${row.bindingStrengthKey}; role=${row.corpusRoleKey ?? "unclassified"}; lifecycle=${row.lifecycleStageKey ?? "unclassified"}; frame=${row.dominantFrame ?? "unclassified"}; taxonomy=${row.taxonomyVersion}`)}}`,
    ];
    const safeUrl = safeExternalUrl(row.sourceUrl);
    if (safeUrl) {
      fields.push(`  howpublished = {\\url{${safeUrl}}}`);
    }
    entries.push(`@techreport{${key},\n${fields.join(",\n")}\n}`);
  }
  return entries.join("\n\n");
}
