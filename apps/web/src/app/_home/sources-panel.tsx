"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";

import { frameAbbr, frameTextHue } from "@/lib/frame-vocab";
import type { CountrySnapshot } from "@/lib/seed-data";
import {
  countByJurisdiction,
  type AnalysisState,
  type SourceEntry,
} from "@/lib/sources-data";
import { toHtmlLang } from "@/lib/taxonomy-vocab";
import { replaceUrlQuery, useUrlSearch } from "@/lib/use-url-search";

export function LatestSourcesPanel({
  allSources,
  countries,
}: {
  allSources: SourceEntry[];
  countries: CountrySnapshot[];
}) {
  const urlSearch = useUrlSearch();
  const active = new URLSearchParams(urlSearch).get("j") ?? undefined;

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
    replaceUrlQuery((params) => {
      if (slug) params.set("j", slug);
      else params.delete("j");
    });
  }

  const half = Math.ceil(visibleSources.length / 2);
  const leftCol = visibleSources.slice(0, half);
  const rightCol = visibleSources.slice(half);

  return (
    <div className="rounded-sm border border-white/10 bg-[#0f1623]">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-4 py-2.5">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
          latest_sources
        </h2>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-[#94a3b8]">
          <span>
            {activeCountry ? (
              <>
                {filtered.length} recent in{" "}
                <span className="text-[#f1f5f9]">{activeCountry.shortName}</span>{" "}
                · newest published first
              </>
            ) : (
              <>
                {visibleSources.length} of {allSources.length} recent across 5
                jurisdictions · newest published first
              </>
            )}
          </span>
          <Link
            href={
              active
                ? `/documents?j=${encodeURIComponent(active)}`
                : "/documents"
            }
            className="text-[#67e8f9] underline decoration-[#67e8f9]/35 underline-offset-2 transition-colors hover:text-white"
          >
            browse all →
          </Link>
        </div>
      </header>

      <div
        role="group"
        aria-label="Filter recent sources by jurisdiction"
        className="flex flex-wrap items-center gap-1.5 border-b border-white/10 px-4 py-2"
      >
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
                  className="h-[10px] w-[14px] rounded-[1px] border border-white/15 object-cover"
                  unoptimized
                />
              }
            />
          );
        })}
      </div>

      {visibleSources.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12px] text-[#94a3b8]">
          No sources match this filter.
        </p>
      ) : (
        <div className="grid md:grid-cols-2">
          <ol>
            {leftCol.map((source) => (
              <SourceRow key={source.id} source={source} />
            ))}
          </ol>
          <ol className="border-t border-white/5 md:border-l md:border-t-0 md:border-white/10">
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
      aria-pressed={isActive}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em] transition-colors ${
        isActive
          ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 text-[#f1f5f9]"
          : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
      }`}
    >
      {flag}
      {label}
      <span className="tabular-nums text-[#94a3b8]">{count}</span>
    </button>
  );
}

function SourceRow({ source }: { source: SourceEntry }) {
  const htmlLang = toHtmlLang(source.language);
  return (
    <li>
      <Link
        href={`/documents/${encodeURIComponent(source.id)}`}
        className="grid grid-cols-[74px_20px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-white/5 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-white/[0.03]"
      >
        <span className="font-mono text-[11px] tabular-nums text-[#94a3b8]">
          {source.publicationDate}
        </span>
        {source.flagUrl ? (
          <Image
            src={source.flagUrl}
            alt=""
            width={18}
            height={13}
            className="h-[13px] w-[18px] rounded-[1px] border border-white/15 object-cover"
            unoptimized
          />
        ) : (
          <span
            aria-hidden
            className="h-[13px] w-[18px] rounded-[1px] border border-white/10 bg-white/5"
          />
        )}
        <div className="min-w-0">
          <p
            lang={htmlLang}
            className="truncate font-sans text-[13px] font-medium text-[#f1f5f9]"
          >
            {source.title}
          </p>
          <p className="truncate font-mono text-[11px] uppercase tracking-wide text-[#94a3b8]">
            {source.shortName}
            <span aria-hidden className="mx-1 text-[#475569]">
              ·
            </span>
            {source.bindingStrengthLabel}
            <span aria-hidden className="mx-1 text-[#475569]">
              ·
            </span>
            <span style={{ color: frameTextHue[source.dominantFrame] }}>
              {frameAbbr[source.dominantFrame]}
            </span>
          </p>
        </div>
        <StatePill state={source.analysisState} />
      </Link>
    </li>
  );
}

function StatePill({ state }: { state: AnalysisState }) {
  const map = {
    analyzed: { color: "#67e8f9", label: "analyzed" },
    parsed: { color: "#94a3b8", label: "parsed" },
  }[state];
  return (
    <span
      className="rounded-[2px] px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide"
      style={{
        color: map.color,
        background: `${map.color}18`,
        border: `1px solid ${map.color}40`,
      }}
    >
      {map.label}
    </span>
  );
}
