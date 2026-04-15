import Image from "next/image";
import Link from "next/link";

import { getOverviewData } from "@/lib/overview-data";
import { frameLabels, type CountrySnapshot } from "@/lib/seed-data";
import { frameAbbr, frameHue } from "../../_shared";
import {
  buildSources,
  countByJurisdiction,
  FilterChips,
  StatePill,
  type SourceEntry,
} from "../_sources";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const VARIANTS = [
  {
    id: "a",
    label: "A · Dense table + filter chips",
    note: "Tabular. Filter chips at the top. Most rows per pixel.",
  },
  {
    id: "b",
    label: "B · Country tabs + list",
    note: "Tab bar selects one country. Larger cards below. Navigation metaphor.",
  },
  {
    id: "c",
    label: "C · Timeline stream",
    note: "Chronological rail on the left. Dates grouped. Editorial feel.",
  },
  {
    id: "d",
    label: "D · Featured + list",
    note: "Most recent item featured. 3 compact rows below. Hierarchical.",
  },
  {
    id: "e",
    label: "E · Grouped by country",
    note: "One block per jurisdiction. Filter collapses non-selected groups.",
  },
] as const;

type Variant = (typeof VARIANTS)[number];

export default async function V1TerminalSourcesVariants({
  searchParams,
}: {
  searchParams: Promise<{ j?: string }>;
}) {
  const data = await getOverviewData();
  const { j } = await searchParams;
  const allSources = buildSources(data.countries, data.snapshotDate);
  const filtered = j
    ? allSources.filter((source) => source.jurisdictionSlug === j)
    : allSources;

  const counts = countByJurisdiction(allSources);

  return (
    <main className="min-h-[calc(100vh-49px-41px)] bg-[#0a0f18] font-mono text-[13px] text-[#cdd6e1]">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-[#7a8697]">
              V1 Terminal · latest_sources explorations
            </p>
            <h1 className="mt-1 text-[16px] text-[#e6edf5]">
              Same space (~660px wide) · 5 approaches · shared filter state
            </h1>
          </div>
          <p className="text-[11px] text-[#7a8697]">
            {j ? (
              <>
                filter:{" "}
                <span className="text-[#e6edf5]">
                  {data.countries.find((c) => c.slug === j)?.name ?? j}
                </span>{" "}
                ·{" "}
                <Link
                  href="?"
                  className="text-[#7a8697] underline decoration-dotted hover:text-[#e6edf5]"
                >
                  clear
                </Link>
              </>
            ) : (
              "filter: all jurisdictions"
            )}
          </p>
        </header>

        <nav className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {VARIANTS.map((variant) => (
            <a
              key={variant.id}
              href={`#${variant.id}`}
              className="rounded-sm border border-white/10 px-2 py-1 uppercase tracking-wider text-[#cdd6e1] hover:border-white/30 hover:bg-white/5"
            >
              {variant.label}
            </a>
          ))}
        </nav>

        <div className="mt-8 space-y-12">
          <VariantSection variant={VARIANTS[0]}>
            <VariantFrame>
              <VariantA
                sources={filtered}
                countries={data.countries}
                active={j}
                counts={counts}
              />
            </VariantFrame>
          </VariantSection>

          <VariantSection variant={VARIANTS[1]}>
            <VariantFrame>
              <VariantB
                sources={filtered}
                countries={data.countries}
                active={j}
                counts={counts}
              />
            </VariantFrame>
          </VariantSection>

          <VariantSection variant={VARIANTS[2]}>
            <VariantFrame>
              <VariantC
                sources={filtered}
                countries={data.countries}
                active={j}
                counts={counts}
              />
            </VariantFrame>
          </VariantSection>

          <VariantSection variant={VARIANTS[3]}>
            <VariantFrame>
              <VariantD
                sources={filtered}
                countries={data.countries}
                active={j}
                counts={counts}
              />
            </VariantFrame>
          </VariantSection>

          <VariantSection variant={VARIANTS[4]}>
            <VariantFrame>
              <VariantE
                sources={allSources}
                countries={data.countries}
                active={j}
              />
            </VariantFrame>
          </VariantSection>
        </div>

        <footer className="mt-12 border-t border-white/10 pt-4 text-[10px] uppercase tracking-wider text-[#3f4857]">
          tell me which direction to push · or which elements to mix
        </footer>
      </div>
    </main>
  );
}

function VariantSection({
  variant,
  children,
}: {
  variant: Variant;
  children: React.ReactNode;
}) {
  return (
    <section id={variant.id} className="scroll-mt-6">
      <div className="mb-4 flex items-baseline justify-between border-b border-white/5 pb-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-[#e6edf5]">
            {variant.label}
          </p>
          <p className="mt-0.5 text-[11px] text-[#7a8697]">{variant.note}</p>
        </div>
        <p className="text-[10px] uppercase tracking-wider text-[#3f4857]">
          variant {variant.id.toUpperCase()}
        </p>
      </div>
      {children}
    </section>
  );
}

function VariantFrame({ children }: { children: React.ReactNode }) {
  // Same ~660px target width as the real queue section
  return (
    <div className="max-w-[660px]">
      <div className="rounded-sm border border-white/10 bg-[#0f1623]">
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared filter controls                                              */
/* ------------------------------------------------------------------ */

function EmptyMessage() {
  return (
    <p className="px-3 py-6 text-center text-[11px] text-[#5d6675]">
      no sources match this filter
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* A — Dense table                                                     */
/* ------------------------------------------------------------------ */

function VariantA({
  sources,
  countries,
  active,
  counts,
}: {
  sources: SourceEntry[];
  countries: CountrySnapshot[];
  active: string | undefined;
  counts: Map<string, number>;
}) {
  return (
    <div>
      <header className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <p className="text-[11px] uppercase tracking-[0.1em] text-[#7a8697]">
          latest_sources
        </p>
        <p className="text-[10px] text-[#5d6675]">
          {sources.length} shown · newest first
        </p>
      </header>
      <FilterChips countries={countries} active={active} counts={counts} />
      {sources.length === 0 ? (
        <EmptyMessage />
      ) : (
        <ol>
          {sources.map((source) => (
            <li
              key={source.id}
              className="grid grid-cols-[42px_22px_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/5 px-3 py-2 last:border-b-0 hover:bg-white/[0.02]"
            >
              <span className="text-[10px] tabular-nums text-[#5d6675]">
                {source.updatedAt}
              </span>
              <Image
                src={source.country.flagUrl}
                alt=""
                width={18}
                height={13}
                className="h-[13px] w-[18px] rounded-[1px] border border-white/10 object-cover"
                unoptimized
              />
              <div className="min-w-0">
                <p className="truncate text-[12px] text-[#e6edf5]">
                  {source.title}
                </p>
                <p className="truncate text-[9px] uppercase tracking-wider text-[#5d6675]">
                  {source.country.shortName}
                  <span className="mx-1 text-[#3f4857]">·</span>
                  {source.documentType}
                  <span className="mx-1 text-[#3f4857]">·</span>
                  <span style={{ color: frameHue[source.dominantFrame] }}>
                    {frameAbbr[source.dominantFrame]}
                  </span>
                </p>
              </div>
              <StatePill state={source.reviewState} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* B — Country tabs + larger list                                      */
/* ------------------------------------------------------------------ */

function VariantB({
  sources,
  countries,
  active,
  counts,
}: {
  sources: SourceEntry[];
  countries: CountrySnapshot[];
  active: string | undefined;
  counts: Map<string, number>;
}) {
  return (
    <div>
      <header className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <p className="text-[11px] uppercase tracking-[0.1em] text-[#7a8697]">
          latest_sources
        </p>
        <p className="text-[10px] text-[#5d6675]">
          {sources.length} shown
        </p>
      </header>
      <nav className="flex items-stretch border-b border-white/5">
        <Link
          href="?"
          className={`flex-1 border-r border-white/5 px-2 py-2 text-center text-[10px] uppercase tracking-[0.1em] transition-colors last:border-r-0 ${
            !active
              ? "bg-white/[0.05] text-[#e6edf5]"
              : "text-[#7a8697] hover:bg-white/[0.02] hover:text-[#cdd6e1]"
          }`}
        >
          all
          <span className="ml-1 text-[#5d6675]">
            {counts.get("__all__") ?? 0}
          </span>
        </Link>
        {countries.map((country) => {
          const isActive = country.slug === active;
          return (
            <Link
              key={country.slug}
              href={isActive ? "?" : `?j=${country.slug}`}
              className={`flex flex-1 items-center justify-center gap-1 border-r border-white/5 px-2 py-2 text-[10px] uppercase tracking-[0.1em] transition-colors last:border-r-0 ${
                isActive
                  ? "bg-white/[0.05] text-[#e6edf5]"
                  : "text-[#7a8697] hover:bg-white/[0.02] hover:text-[#cdd6e1]"
              }`}
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
      </nav>
      {sources.length === 0 ? (
        <EmptyMessage />
      ) : (
        <ol className="px-3 py-2">
          {sources.map((source) => (
            <li
              key={source.id}
              className="flex items-start justify-between gap-3 border-b border-white/5 py-2.5 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-[#e6edf5]">{source.title}</p>
                <p className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#5d6675]">
                  <Image
                    src={source.country.flagUrl}
                    alt=""
                    width={14}
                    height={10}
                    className="rounded-[1px] border border-white/10 object-cover"
                    unoptimized
                  />
                  {source.country.shortName}
                  <span className="text-[#3f4857]">·</span>
                  {source.documentType}
                  <span className="text-[#3f4857]">·</span>
                  <span style={{ color: frameHue[source.dominantFrame] }}>
                    {frameLabels[source.dominantFrame]}
                  </span>
                  <span className="text-[#3f4857]">·</span>
                  {source.updatedAt}
                </p>
              </div>
              <StatePill state={source.reviewState} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* C — Timeline stream                                                 */
/* ------------------------------------------------------------------ */

function VariantC({
  sources,
  countries,
  active,
  counts,
}: {
  sources: SourceEntry[];
  countries: CountrySnapshot[];
  active: string | undefined;
  counts: Map<string, number>;
}) {
  return (
    <div>
      <header className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <p className="text-[11px] uppercase tracking-[0.1em] text-[#7a8697]">
          latest_sources
        </p>
        <p className="text-[10px] text-[#5d6675]">timeline · newest first</p>
      </header>
      <FilterChips countries={countries} active={active} counts={counts} />
      {sources.length === 0 ? (
        <EmptyMessage />
      ) : (
        <ol className="relative px-3 py-3">
          {/* Vertical rule */}
          <div
            aria-hidden
            className="absolute bottom-3 left-[54px] top-3 w-px bg-white/10"
          />
          {sources.map((source) => {
            const color =
              source.reviewState === "approved"
                ? "#29d391"
                : source.reviewState === "review"
                  ? "#f5a623"
                  : "#7a8697";
            return (
              <li
                key={source.id}
                className="relative grid grid-cols-[42px_20px_minmax(0,1fr)] items-start gap-3 py-2"
              >
                <span className="pt-1 text-[10px] tabular-nums text-[#5d6675]">
                  {source.updatedAt}
                </span>
                <span
                  className="relative z-10 mt-[7px] h-[10px] w-[10px] rounded-full border-[2px] bg-[#0f1623]"
                  style={{ borderColor: color }}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Image
                      src={source.country.flagUrl}
                      alt=""
                      width={16}
                      height={12}
                      className="rounded-[1px] border border-white/10 object-cover"
                      unoptimized
                    />
                    <span className="text-[10px] uppercase tracking-wider text-[#7a8697]">
                      {source.country.shortName}
                    </span>
                    <span className="text-[#3f4857]">·</span>
                    <span className="text-[10px] uppercase tracking-wider text-[#5d6675]">
                      {source.documentType}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-[#e6edf5]">
                    {source.title}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <StatePill state={source.reviewState} />
                    <span
                      className="text-[9px] uppercase tracking-wider"
                      style={{ color: frameHue[source.dominantFrame] }}
                    >
                      {frameAbbr[source.dominantFrame]}{" "}
                      {frameLabels[source.dominantFrame]}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* D — Featured + compact list                                         */
/* ------------------------------------------------------------------ */

function VariantD({
  sources,
  countries,
  active,
  counts,
}: {
  sources: SourceEntry[];
  countries: CountrySnapshot[];
  active: string | undefined;
  counts: Map<string, number>;
}) {
  const featured = sources[0];
  const rest = sources.slice(1, 5);

  return (
    <div>
      <header className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <p className="text-[11px] uppercase tracking-[0.1em] text-[#7a8697]">
          latest_sources
        </p>
        <p className="text-[10px] text-[#5d6675]">featured + recent</p>
      </header>
      <FilterChips countries={countries} active={active} counts={counts} />
      {sources.length === 0 ? (
        <EmptyMessage />
      ) : (
        <div className="px-3 py-3">
          {featured ? (
            <article className="rounded-[2px] border border-white/10 bg-[#0a0f18] px-3 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.1em] text-[#7a8697]">
                  <span className="rounded-[1px] border border-white/10 px-1 py-0.5 text-[#e6edf5]">
                    featured
                  </span>
                  <span>{featured.updatedAt}</span>
                </div>
                <StatePill state={featured.reviewState} />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Image
                  src={featured.country.flagUrl}
                  alt=""
                  width={22}
                  height={16}
                  className="rounded-[2px] border border-white/10 object-cover"
                  unoptimized
                />
                <span className="text-[10px] uppercase tracking-wider text-[#7a8697]">
                  {featured.country.shortName} · {featured.jurisdiction}
                </span>
              </div>
              <p className="mt-2 text-[14px] leading-snug text-[#e6edf5]">
                {featured.title}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <span
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: frameHue[featured.dominantFrame] }}
                >
                  {frameAbbr[featured.dominantFrame]} ·{" "}
                  {frameLabels[featured.dominantFrame]}
                </span>
                <span className="text-[10px] text-[#7a8697]">
                  {featured.documentType}
                </span>
              </div>
            </article>
          ) : null}

          {rest.length > 0 ? (
            <ol className="mt-3">
              {rest.map((source) => (
                <li
                  key={source.id}
                  className="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/5 py-2 last:border-b-0"
                >
                  <span className="flex items-center gap-1.5 text-[10px] tabular-nums text-[#5d6675]">
                    {source.updatedAt}
                  </span>
                  <div className="flex min-w-0 items-center gap-2">
                    <Image
                      src={source.country.flagUrl}
                      alt=""
                      width={16}
                      height={12}
                      className="rounded-[1px] border border-white/10 object-cover"
                      unoptimized
                    />
                    <span className="truncate text-[11px] text-[#e6edf5]">
                      {source.title}
                    </span>
                  </div>
                  <StatePill state={source.reviewState} />
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* E — Grouped by country                                              */
/* ------------------------------------------------------------------ */

function VariantE({
  sources,
  countries,
  active,
}: {
  sources: SourceEntry[];
  countries: CountrySnapshot[];
  active: string | undefined;
}) {
  // Group all sources by country (ignores the external filter — this variant
  // handles filtering by collapsing non-selected groups).
  const byCountry = new Map<string, SourceEntry[]>();
  for (const source of sources) {
    const list = byCountry.get(source.jurisdictionSlug) ?? [];
    list.push(source);
    byCountry.set(source.jurisdictionSlug, list);
  }

  return (
    <div>
      <header className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <p className="text-[11px] uppercase tracking-[0.1em] text-[#7a8697]">
          latest_sources · grouped
        </p>
        <p className="text-[10px] text-[#5d6675]">
          click a flag to collapse others
        </p>
      </header>
      <ul>
        {countries.map((country) => {
          const list = (byCountry.get(country.slug) ?? []).sort(
            (a, b) => b.dateSort - a.dateSort,
          );
          const isActive = country.slug === active;
          const isCollapsed = active && !isActive;
          return (
            <li
              key={country.slug}
              className="border-b border-white/5 last:border-b-0"
            >
              <Link
                href={isActive ? "?" : `?j=${country.slug}`}
                className="flex items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-white/[0.02]"
              >
                <div className="flex items-center gap-2">
                  <Image
                    src={country.flagUrl}
                    alt=""
                    width={20}
                    height={15}
                    className="rounded-[1px] border border-white/10 object-cover"
                    unoptimized
                  />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#e6edf5]">
                    {country.shortName}
                  </span>
                  <span className="text-[11px] text-[#cdd6e1]">
                    {country.name}
                  </span>
                </div>
                <span className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[#5d6675]">
                  <span>{list.length} sources</span>
                  <span
                    aria-hidden
                    className={`transition-transform duration-150 ${
                      isCollapsed ? "-rotate-90" : ""
                    }`}
                  >
                    ▾
                  </span>
                </span>
              </Link>
              {!isCollapsed ? (
                <ol className="px-3 pb-3">
                  {list.map((source) => (
                    <li
                      key={source.id}
                      className="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 border-t border-white/5 py-1.5 first:border-t-0"
                    >
                      <span className="text-[10px] tabular-nums text-[#5d6675]">
                        {source.updatedAt}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[11px] text-[#e6edf5]">
                          {source.title}
                        </p>
                        <p className="truncate text-[9px] uppercase tracking-wider text-[#5d6675]">
                          {source.documentType}
                          <span className="mx-1 text-[#3f4857]">·</span>
                          <span
                            style={{ color: frameHue[source.dominantFrame] }}
                          >
                            {frameAbbr[source.dominantFrame]}
                          </span>
                        </p>
                      </div>
                      <StatePill state={source.reviewState} />
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
