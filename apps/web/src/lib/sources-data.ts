import type { CountrySnapshot, FrameLabel } from "./seed-data";

/**
 * Canonical source-entry type and precision-aware date formatters.
 * Kept pure (no React, no server-only) so both server and client
 * components share one formatting layer.
 */

export type AnalysisState = "analyzed" | "parsed";
export type DatePrecision = "day" | "month" | "year";

export type SourceEntry = {
  id: string;
  title: string;
  jurisdiction: string;
  jurisdictionSlug: string;
  flagUrl: string;
  shortName: string;
  language: string;
  documentType: string;
  bindingStrength: string;
  bindingStrengthLabel: string;
  corpusRole: string | null;
  corpusRoleLabel: string;
  lifecycleStage: string | null;
  lifecycleStageLabel: string;
  analysisState: AnalysisState;
  dominantFrame: FrameLabel;
  publicationDate: string;
  updatedAt: string;
  dateSort: number;
};

const TITLES_BY_COUNTRY: Record<
  string,
  Array<{
    type: string;
    bindingStrength: string;
    bindingLabel: string;
    title: string;
    dayOffset: number;
  }>
> = {
  "united-states": [
    {
      type: "Executive action",
      bindingStrength: "executive_action",
      bindingLabel: "Executive action",
      title: "Executive branch safety reporting memorandum",
      dayOffset: 1,
    },
    {
      type: "Standards guideline",
      bindingStrength: "standards_guideline",
      bindingLabel: "Standards guideline",
      title: "NIST AI risk management framework update",
      dayOffset: 11,
    },
  ],
  "european-union": [
    {
      type: "Legislation",
      bindingStrength: "binding_law",
      bindingLabel: "Binding law",
      title: "Regulation (EU) 2024/1689 (AI Act)",
      dayOffset: 2,
    },
    {
      type: "Regulatory guidance",
      bindingStrength: "regulatory_guidance",
      bindingLabel: "Regulatory guidance",
      title: "General-purpose model implementation note",
      dayOffset: 8,
    },
  ],
  "south-korea": [
    {
      type: "Legislation",
      bindingStrength: "binding_law",
      bindingLabel: "Binding law",
      title: "AI Basic Act",
      dayOffset: 3,
    },
    {
      type: "Regulatory guidance",
      bindingStrength: "regulatory_guidance",
      bindingLabel: "Regulatory guidance",
      title: "AI safety and transparency implementation guideline",
      dayOffset: 9,
    },
  ],
  japan: [
    {
      type: "Regulatory guidance",
      bindingStrength: "regulatory_guidance",
      bindingLabel: "Regulatory guidance",
      title: "AI Guidelines for Business",
      dayOffset: 4,
    },
    {
      type: "Voluntary commitment",
      bindingStrength: "voluntary_commitment",
      bindingLabel: "Voluntary commitment",
      title: "Hiroshima AI Process code of conduct",
      dayOffset: 10,
    },
  ],
  china: [
    {
      type: "Legislation",
      bindingStrength: "binding_law",
      bindingLabel: "Binding law",
      title: "Measures for Generative AI Services",
      dayOffset: 5,
    },
    {
      type: "Regulatory guidance",
      bindingStrength: "regulatory_guidance",
      bindingLabel: "Regulatory guidance",
      title: "Algorithmic recommendation oversight notice",
      dayOffset: 12,
    },
  ],
};

export function buildSyntheticSources(
  countries: CountrySnapshot[],
  snapshotDate: string,
): SourceEntry[] {
  const anchor = Date.parse(snapshotDate) || Date.UTC(2026, 3, 10);
  const result: SourceEntry[] = [];
  for (const country of countries) {
    const templates = TITLES_BY_COUNTRY[country.slug] ?? [];
    for (const tmpl of templates) {
      const ts = anchor - tmpl.dayOffset * 24 * 60 * 60 * 1000;
      const formatted = formatShortDate(ts);
      result.push({
        id: `${country.slug}-${tmpl.dayOffset}`,
        title: tmpl.title,
        jurisdiction: country.name,
        jurisdictionSlug: country.slug,
        flagUrl: country.flagUrl,
        shortName: country.shortName,
        language: "English",
        documentType: tmpl.type,
        bindingStrength: tmpl.bindingStrength,
        bindingStrengthLabel: tmpl.bindingLabel,
        corpusRole: "primary_instrument",
        corpusRoleLabel: "Primary instrument",
        lifecycleStage: "active",
        lifecycleStageLabel: "Active",
        analysisState: "analyzed",
        dominantFrame: country.dominantFrame,
        publicationDate: formatted,
        updatedAt: formatted,
        dateSort: ts,
      });
    }
  }
  return result.sort((a, b) => b.dateSort - a.dateSort);
}

export function countByJurisdiction(sources: SourceEntry[]) {
  const counts = new Map<string, number>();
  counts.set("__all__", sources.length);
  for (const source of sources) {
    counts.set(
      source.jurisdictionSlug,
      (counts.get(source.jurisdictionSlug) ?? 0) + 1,
    );
  }
  return counts;
}

export function inferDatePrecision(
  value: string | null | undefined,
  explicit?: string | null,
): DatePrecision {
  if (explicit === "year" || explicit === "month" || explicit === "day") {
    return explicit;
  }
  if (!value) return "day";
  const trimmed = value.trim();
  if (/^\d{4}$/.test(trimmed)) return "year";
  if (/^\d{4}-\d{2}$/.test(trimmed)) return "month";
  return "day";
}

/**
 * Formats a date concisely while honoring publication_date_precision (A8):
 * year-only dates render as "2025", month-only as "Apr 2025" — NEVER "Jan 1".
 */
export function formatShortDate(
  ts: number | string | null | undefined,
  precision?: string | null,
): string {
  if (ts == null) return "—";
  if (typeof ts === "string") {
    const trimmed = ts.trim();
    const effPrecision = inferDatePrecision(trimmed, precision);

    const yearMatch = trimmed.match(/^(\d{4})/);
    if (effPrecision === "year" && yearMatch) {
      return yearMatch[1];
    }

    const ymMatch = trimmed.match(/^(\d{4})-(\d{2})/);
    if (effPrecision === "month" && ymMatch) {
      const date = new Date(
        Date.UTC(Number(ymMatch[1]), Number(ymMatch[2]) - 1, 1),
      );
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
    }

    const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      const date = new Date(
        Date.UTC(
          Number(dateOnly[1]),
          Number(dateOnly[2]) - 1,
          Number(dateOnly[3]),
        ),
      );
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "2-digit",
        timeZone: "UTC",
      }).format(date);
    }
  }

  const n = typeof ts === "number" ? ts : Date.parse(ts);
  if (Number.isNaN(n) || n === 0) return "—";
  const d = new Date(n);
  if (precision === "year") {
    return String(d.getUTCFullYear());
  }
  if (precision === "month") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(d);
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
    timeZone: "UTC",
  }).format(d);
}

/**
 * Formats a full date while honoring publication_date_precision (A8):
 * year-only dates render as "2025", month-only as "April 2025" — NEVER "January 1".
 */
export function formatLongDate(
  value: string | number | null | undefined,
  precision?: string | null,
): string {
  if (value == null) return "No date available";
  if (typeof value === "string") {
    const trimmed = value.trim();
    const effPrecision = inferDatePrecision(trimmed, precision);

    const yearMatch = trimmed.match(/^(\d{4})/);
    if (effPrecision === "year" && yearMatch) {
      return yearMatch[1];
    }

    const ymMatch = trimmed.match(/^(\d{4})-(\d{2})/);
    if (effPrecision === "month" && ymMatch) {
      return new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(
        new Date(Date.UTC(Number(ymMatch[1]), Number(ymMatch[2]) - 1, 1)),
      );
    }

    const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      return new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(
        new Date(
          Date.UTC(
            Number(dateOnly[1]),
            Number(dateOnly[2]) - 1,
            Number(dateOnly[3]),
          ),
        ),
      );
    }
  }

  const n = typeof value === "number" ? value : Date.parse(value);
  if (Number.isNaN(n) || n === 0) return "No date available";
  const d = new Date(n);
  if (precision === "year") {
    return String(d.getUTCFullYear());
  }
  if (precision === "month") {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(d);
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}
