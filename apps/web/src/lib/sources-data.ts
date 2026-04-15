import type { CountrySnapshot, FrameLabel } from "./seed-data";

/**
 * Canonical source-entry type used by the latest_sources panel.
 * Kept pure (no React, no server-only) so both server and client
 * components can share the type without bundling server code.
 */

export type ReviewState = "approved" | "review" | "draft";

export type SourceEntry = {
  id: string;
  title: string;
  jurisdiction: string;
  jurisdictionSlug: string;
  flagUrl: string;
  shortName: string;
  documentType: string;
  reviewState: ReviewState;
  dominantFrame: FrameLabel;
  updatedAt: string;
  dateSort: number;
};

/* ------------------------------------------------------------------ */
/* Synthetic fallback                                                  */
/* ------------------------------------------------------------------ */
/*
 * Used when the database is empty or DATABASE_URL isn't set. Three
 * plausible entries per jurisdiction so the UI has enough rows to
 * show filtering behavior. Dates are derived from the snapshot anchor
 * so the list is deterministic.
 */

const TITLES_BY_COUNTRY: Record<
  string,
  Array<{ type: string; title: string; state: ReviewState; dayOffset: number }>
> = {
  "united-states": [
    {
      type: "Executive action",
      title: "Executive branch safety reporting memorandum",
      state: "approved",
      dayOffset: 1,
    },
    {
      type: "Legislation",
      title: "Algorithmic accountability bill · committee draft",
      state: "draft",
      dayOffset: 6,
    },
    {
      type: "Regulatory guidance",
      title: "NIST AI risk management framework update",
      state: "approved",
      dayOffset: 11,
    },
  ],
  "european-union": [
    {
      type: "Regulatory guidance",
      title: "General-purpose model implementation note",
      state: "approved",
      dayOffset: 2,
    },
    {
      type: "Regulatory guidance",
      title: "High-risk system conformity assessment guide",
      state: "approved",
      dayOffset: 8,
    },
    {
      type: "Standards guideline",
      title: "Harmonised transparency standard draft",
      state: "approved",
      dayOffset: 15,
    },
  ],
  "south-korea": [
    {
      type: "Strategy paper",
      title: "Industrial AI strategy revision",
      state: "draft",
      dayOffset: 3,
    },
    {
      type: "Legislation",
      title: "AI industry promotion and trust act",
      state: "approved",
      dayOffset: 9,
    },
    {
      type: "Standards guideline",
      title: "AI ethics framework alignment",
      state: "approved",
      dayOffset: 16,
    },
  ],
  japan: [
    {
      type: "Standards guideline",
      title: "Foundation model disclosure guidance",
      state: "approved",
      dayOffset: 4,
    },
    {
      type: "Voluntary commitment",
      title: "Hiroshima AI process code of conduct",
      state: "approved",
      dayOffset: 10,
    },
    {
      type: "Strategy paper",
      title: "AI governance contact group report",
      state: "approved",
      dayOffset: 17,
    },
  ],
  china: [
    {
      type: "Regulatory guidance",
      title: "Generative service security notice",
      state: "approved",
      dayOffset: 5,
    },
    {
      type: "Regulatory guidance",
      title: "Algorithmic recommendation oversight update",
      state: "approved",
      dayOffset: 12,
    },
    {
      type: "Legislation",
      title: "National AI supervision regulation",
      state: "approved",
      dayOffset: 19,
    },
  ],
};

export function buildSyntheticSources(
  countries: CountrySnapshot[],
  snapshotDate: string,
): SourceEntry[] {
  const anchor = Date.parse(snapshotDate) || Date.now();
  const result: SourceEntry[] = [];
  for (const country of countries) {
    const templates = TITLES_BY_COUNTRY[country.slug] ?? [];
    for (const tmpl of templates) {
      const ts = anchor - tmpl.dayOffset * 24 * 60 * 60 * 1000;
      result.push({
        id: `${country.slug}-${tmpl.type}-${tmpl.dayOffset}`,
        title: tmpl.title,
        jurisdiction: country.name,
        jurisdictionSlug: country.slug,
        flagUrl: country.flagUrl,
        shortName: country.shortName,
        documentType: tmpl.type,
        reviewState: tmpl.state,
        dominantFrame: country.dominantFrame,
        updatedAt: formatShortDate(ts),
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

export function formatShortDate(ts: number | string | null): string {
  if (ts == null) return "—";
  const n = typeof ts === "number" ? ts : Date.parse(ts);
  if (Number.isNaN(n) || n === 0) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(n));
}
