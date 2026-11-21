/**
 * Pure filtering, search, and UTF-8 BOM CSV export helpers for the
 * Cross-Jurisdiction Clause & Citation Explorer (/clauses & /api/clauses).
 * Zero Node fs / server-only imports so server routes, client UI, and unit
 * tests execute identically.
 */

import type { ScoringMode } from "./seed-data";

export type ClauseCategory = "requirement" | "enforcement" | "framing";

export type ClauseRecord = {
  /** Unique deterministic quote anchor matching /documents/[id]#quote-... */
  id: string;
  anchorId: string;
  documentId: string;
  documentTitle: string;
  jurisdictionKey: string;
  jurisdictionSlug: string;
  jurisdictionName: string;
  jurisdictionShort: string;
  flagUrl: string;
  languageCode: string;
  publicationDate: string;
  publicationDateIso: string | null;
  dateSort: number;
  bindingStrength: string;
  bindingStrengthLabel: string;
  bindingLevel: number;
  corpusRole: string | null;
  corpusRoleLabel: string;
  lifecycleStage: string | null;
  lifecycleStageLabel: string;
  subnationalUnit: string | null;
  isHeadlineFederal: boolean;
  isSubnationalOverlay: boolean;
  category: ClauseCategory;
  controlKey: string;
  controlLabel: string;
  obligationStrength: string | null;
  obligationStrengthLabel: string | null;
  quote: string;
  quoteEn: string | null;
  sourceSection: string | null;
  groundingStatus: string | null;
};

export type ClauseFilterOptions = {
  category?: ClauseCategory | "all";
  control?: string | null;
  jurisdiction?: string | null;
  minLevel?: number | null;
  obligation?: string | null;
  mode?: ScoringMode;
  includeSubnational?: boolean;
  query?: string | null;
};

export function filterClauses(
  clauses: readonly ClauseRecord[],
  opts: ClauseFilterOptions,
): ClauseRecord[] {
  const mode: ScoringMode = opts.mode ?? "headline";
  const includeSubnational = Boolean(opts.includeSubnational);
  const category = opts.category && opts.category !== "all" ? opts.category : null;
  const control = opts.control?.trim() || null;
  const jur = opts.jurisdiction?.trim().toLowerCase() || null;
  const minLevel =
    typeof opts.minLevel === "number" && Number.isFinite(opts.minLevel)
      ? opts.minLevel
      : 0;
  const obligation = opts.obligation?.trim().toLowerCase() || null;
  const q = opts.query?.trim().toLowerCase() || "";

  return clauses.filter((item) => {
    if (item.isSubnationalOverlay && !includeSubnational) return false;
    if (mode === "headline") {
      if (item.isSubnationalOverlay) {
        // Included only if active/adopted_not_yet_effective (already enforced by lifecycle check)
        if (
          item.lifecycleStage !== "active" &&
          item.lifecycleStage !== "adopted_not_yet_effective"
        ) {
          return false;
        }
      } else if (!item.isHeadlineFederal) {
        return false;
      }
    }
    if (category && item.category !== category) return false;
    if (control) {
      if (control.includes(":")) {
        const [catPrefix, keyPart] = control.split(":", 2);
        if (item.category !== catPrefix || item.controlKey !== keyPart) {
          return false;
        }
      } else if (item.controlKey !== control) {
        return false;
      }
    }
    if (
      jur &&
      item.jurisdictionSlug !== jur &&
      item.jurisdictionKey !== jur &&
      item.jurisdictionShort.toLowerCase() !== jur
    ) {
      return false;
    }
    if (minLevel > 0 && item.bindingLevel < minLevel) return false;
    if (obligation && (item.obligationStrength ?? "").toLowerCase() !== obligation) {
      return false;
    }
    if (q) {
      const hit =
        item.quote.toLowerCase().includes(q) ||
        (item.quoteEn ?? "").toLowerCase().includes(q) ||
        item.documentTitle.toLowerCase().includes(q) ||
        item.controlLabel.toLowerCase().includes(q) ||
        (item.sourceSection ?? "").toLowerCase().includes(q) ||
        (item.subnationalUnit ?? "").toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });
}

function escapeCsvCell(value: string): string {
  const neutralized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(neutralized)) {
    return `"${neutralized.replaceAll('"', '""')}"`;
  }
  return neutralized;
}

/**
 * Formats filtered clauses as RFC 4180 CSV with UTF-8 BOM (`\uFEFF`) so Excel
 * opens CJK native quotes cleanly alongside English translations and deep links.
 */
export function formatClausesAsCsv(
  clauses: readonly ClauseRecord[],
  siteOrigin = "https://project-babel.com",
): string {
  const headers = [
    "jurisdiction",
    "jurisdiction_code",
    "subnational_unit",
    "document_id",
    "document_title",
    "publication_date",
    "binding_level",
    "binding_strength",
    "corpus_role",
    "lifecycle_stage",
    "category",
    "control_key",
    "control_label",
    "obligation_strength",
    "source_section",
    "grounding_status",
    "quote_native",
    "quote_en",
    "citation_url",
  ];
  const lines = [headers.join(",")];
  for (const c of clauses) {
    const url = `${siteOrigin}/documents/${encodeURIComponent(c.documentId)}#${c.anchorId}`;
    const cells = [
      c.jurisdictionKey,
      c.jurisdictionShort,
      c.subnationalUnit ?? "",
      c.documentId,
      c.documentTitle,
      c.publicationDateIso ?? c.publicationDate,
      `L${c.bindingLevel}`,
      c.bindingStrength,
      c.corpusRole ?? "unclassified",
      c.lifecycleStage ?? "unclassified",
      c.category,
      c.controlKey,
      c.controlLabel,
      c.obligationStrength ?? "",
      c.sourceSection ?? "",
      c.groundingStatus ?? "",
      c.quote,
      c.quoteEn ?? "",
      url,
    ];
    lines.push(cells.map((cell) => escapeCsvCell(cell)).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}
