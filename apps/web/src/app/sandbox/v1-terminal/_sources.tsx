import Image from "next/image";
import Link from "next/link";

import type { CountrySnapshot, FrameLabel } from "@/lib/seed-data";

/* ------------------------------------------------------------------ */
/* Types + synthetic data                                              */
/* ------------------------------------------------------------------ */
/*
 * NOTE: Once the DB-backed query in overview-data returns a richer set
 * of recent documents, this file can be deleted and the page can use
 * real data directly. The synthetic list below is sized so the UI has
 * enough rows to show filtering behavior (3 per jurisdiction × 5 = 15).
 */

export type ReviewState = "approved" | "review" | "draft";

export type SourceEntry = {
  id: string;
  title: string;
  jurisdiction: string;
  jurisdictionSlug: string;
  country: CountrySnapshot;
  documentType: string;
  reviewState: ReviewState;
  dominantFrame: FrameLabel;
  updatedAt: string;
  dateSort: number;
};

const TITLES_BY_COUNTRY: Record<
  string,
  Array<{ type: string; title: string; state: ReviewState; dayOffset: number }>
> = {
  "united-states": [
    {
      type: "Executive action",
      title: "Executive branch safety reporting memorandum",
      state: "review",
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
      state: "review",
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
      state: "review",
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
      state: "review",
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
      state: "review",
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

export function buildSources(
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
        country,
        documentType: tmpl.type,
        reviewState: tmpl.state,
        dominantFrame: country.dominantFrame,
        updatedAt: formatShort(ts),
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

function formatShort(ts: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(ts));
}

/* ------------------------------------------------------------------ */
/* Shared UI — FilterChips + StatePill                                 */
/* ------------------------------------------------------------------ */

export function FilterChips({
  countries,
  active,
  counts,
  hrefFor,
}: {
  countries: CountrySnapshot[];
  active: string | undefined;
  counts: Map<string, number>;
  /**
   * Pass a function that builds the href for a given jurisdiction slug
   * (or undefined to clear the filter). Defaults to query-only links
   * (e.g. `?j=united-states`), which is fine for pages where the filter
   * is the only query param on the URL.
   */
  hrefFor?: (slug: string | undefined) => string;
}) {
  const href = hrefFor ?? defaultHrefFor;
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-white/5 px-3 py-2">
      <Link
        href={href(undefined)}
        className={chipClass(!active)}
      >
        all
        <span className="ml-1.5 text-[#5d6675]">
          {counts.get("__all__") ?? 0}
        </span>
      </Link>
      {countries.map((country) => {
        const isActive = country.slug === active;
        return (
          <Link
            key={country.slug}
            href={href(isActive ? undefined : country.slug)}
            className={`${chipClass(isActive)} flex items-center gap-1.5`}
          >
            <Image
              src={country.flagUrl}
              alt=""
              width={14}
              height={10}
              className="rounded-[1px] border border-white/10 object-cover"
              unoptimized
            />
            {country.shortName}
            <span className="text-[#5d6675]">
              {counts.get(country.slug) ?? 0}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function defaultHrefFor(slug: string | undefined) {
  return slug ? `?j=${slug}` : "?";
}

function chipClass(isActive: boolean) {
  return `rounded-[2px] border px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] transition-colors ${
    isActive
      ? "border-white/30 bg-white/[0.06] text-[#e6edf5]"
      : "border-white/10 text-[#7a8697] hover:border-white/20 hover:text-[#cdd6e1]"
  }`;
}

export function StatePill({ state }: { state: ReviewState }) {
  const map = {
    approved: { color: "#29d391", label: "approved" },
    review: { color: "#f5a623", label: "in review" },
    draft: { color: "#7a8697", label: "draft" },
  }[state];
  return (
    <span
      className="rounded-[2px] px-1.5 py-0.5 text-[9px] uppercase tracking-wider"
      style={{
        color: map.color,
        background: `${map.color}1a`,
        border: `1px solid ${map.color}33`,
      }}
    >
      {map.label}
    </span>
  );
}
