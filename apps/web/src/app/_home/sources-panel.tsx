"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { CountrySnapshot } from "@/lib/seed-data";
import {
  countByJurisdiction,
  type ReviewState,
  type SourceEntry,
} from "@/lib/sources-data";
import { frameAbbr, frameHue } from "@/lib/frame-vocab";

/**
 * Client-side latest_sources panel.
 *
 * The filter is held in local state so clicking a chip is instant —
 * no server roundtrip, no scroll reset, no hydration delay. We still
 * sync the active filter into the URL via history.replaceState so a
 * filtered view is shareable and survives a refresh, but we bypass
 * the Next.js router entirely to avoid re-rendering the rest of the
 * page.
 */
export function LatestSourcesPanel({
  allSources,
  countries,
  initialFilter,
}: {
  allSources: SourceEntry[];
  countries: CountrySnapshot[];
  initialFilter: string | undefined;
}) {
  const [active, setActive] = useState<string | undefined>(initialFilter);

  const counts = useMemo(() => countByJurisdiction(allSources), [allSources]);

  const filtered = useMemo(
    () =>
      active
        ? allSources.filter((source) => source.jurisdictionSlug === active)
        : allSources,
    [allSources, active],
  );

  const visibleSources = filtered.slice(0, 20);
  const activeCountry = active
    ? countries.find((country) => country.slug === active)
    : undefined;

  function setFilter(slug: string | undefined) {
    setActive(slug);
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (slug) {
      params.set("j", slug);
    } else {
      params.delete("j");
    }
    const qs = params.toString();
    const nextUrl = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }

  const half = Math.ceil(visibleSources.length / 2);
  const leftCol = visibleSources.slice(0, half);
  const rightCol = visibleSources.slice(half);

  return (
    <div className="rounded-sm border border-white/10 bg-[#0f1623]">
      <header className="flex items-baseline justify-between border-b border-white/5 px-3 py-2">
        <p className="text-[11px] uppercase tracking-[0.1em] text-[#7a8697]">
          latest_sources
        </p>
        <p className="text-[10px] text-[#5d6675]">
          {activeCountry ? (
            <>
              {filtered.length} in{" "}
              <span className="text-[#cdd6e1]">
                {activeCountry.shortName}
              </span>{" "}
              · newest first
            </>
          ) : (
            <>
              {visibleSources.length} of {allSources.length} · newest first
            </>
          )}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/5 px-3 py-2">
        <ChipButton
          isActive={!active}
          onClick={() => setFilter(undefined)}
          label="all"
          count={counts.get("__all__") ?? 0}
        />
        {countries.map((country) => {
          const isActive = country.slug === active;
          return (
            <ChipButton
              key={country.slug}
              isActive={isActive}
              onClick={() => setFilter(isActive ? undefined : country.slug)}
              label={country.shortName}
              count={counts.get(country.slug) ?? 0}
              flag={
                <Image
                  src={country.flagUrl}
                  alt=""
                  width={14}
                  height={10}
                  className="rounded-[1px] border border-white/10 object-cover"
                  unoptimized
                />
              }
            />
          );
        })}
      </div>

      {visibleSources.length === 0 ? (
        <p className="px-3 py-6 text-center text-[11px] text-[#5d6675]">
          no sources match this filter
        </p>
      ) : (
        <div className="grid md:grid-cols-2">
          <ol>
            {leftCol.map((source) => (
              <SourceRow key={source.id} source={source} />
            ))}
          </ol>
          <ol className="md:border-l md:border-white/5">
            {rightCol.map((source) => (
              <SourceRow key={source.id} source={source} />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function ChipButton({
  isActive,
  onClick,
  label,
  count,
  flag,
}: {
  isActive: boolean;
  onClick: () => void;
  label: string;
  count: number;
  flag?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] transition-colors ${
        isActive
          ? "border-white/30 bg-white/[0.06] text-[#e6edf5]"
          : "border-white/10 text-[#7a8697] hover:border-white/20 hover:text-[#cdd6e1]"
      }`}
    >
      {flag}
      {label}
      <span className="text-[#5d6675]">{count}</span>
    </button>
  );
}

function SourceRow({ source }: { source: SourceEntry }) {
  return (
    <li>
      <Link
        href={`/documents/${source.id}`}
        className="grid grid-cols-[42px_22px_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/5 px-3 py-2 transition-colors last:border-b-0 hover:bg-white/[0.03]"
      >
        <span className="text-[10px] tabular-nums text-[#5d6675]">
          {source.updatedAt}
        </span>
        {source.flagUrl ? (
          <Image
            src={source.flagUrl}
            alt=""
            width={18}
            height={13}
            className="h-[13px] w-[18px] rounded-[1px] border border-white/10 object-cover"
            unoptimized
          />
        ) : (
          <span
            aria-hidden
            className="h-[13px] w-[18px] rounded-[1px] border border-white/10 bg-white/5"
          />
        )}
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-[#e6edf5]">
            {source.title}
          </p>
          <p className="truncate text-[9px] uppercase tracking-wider text-[#5d6675]">
            {source.shortName}
            <span className="mx-1 text-[#3f4857]">·</span>
            {source.documentType}
            <span className="mx-1 text-[#3f4857]">·</span>
            <span style={{ color: frameHue[source.dominantFrame] }}>
              {frameAbbr[source.dominantFrame]}
            </span>
          </p>
        </div>
        <StatePill state={source.reviewState} />
      </Link>
    </li>
  );
}

function StatePill({ state }: { state: ReviewState }) {
  const map = {
    approved: { color: "#29d391", label: "analyzed" },
    review: { color: "#f5a623", label: "flagged" },
    draft: { color: "#7a8697", label: "parsed" },
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
