"use client";

import Image from "next/image";
import Link from "next/link";

import { TimelineChart } from "@/app/_components/timeline-chart";
import { TopNav } from "@/app/_components/top-nav";
import {
  frameAbbr,
  frameDefinition,
  frameHue,
  frameTextHue,
  scoreHexDark,
} from "@/lib/frame-vocab";
import type { JurisdictionAnalysis } from "@/lib/jurisdiction-analysis";
import type { JurisdictionKey } from "@/lib/jurisdictions";
import {
  allFrameLabels,
  frameLabels,
  type CountrySnapshot,
  type FrameLabel,
  type OverviewData,
  type ScoringMode,
  type YearlyTimelinePoint,
} from "@/lib/seed-data";
import type { AnalysisState, SourceEntry } from "@/lib/sources-data";
import {
  humanizeBindingStrength,
  humanizeEnforcement,
  humanizeRequirement,
  humanizeTaxonomyLabel,
  parseIncludeSubnational,
  toHtmlLang,
} from "@/lib/taxonomy-vocab";
import { replaceUrlQuery, useUrlSearch } from "@/lib/use-url-search";

const ALL_FRAMES: FrameLabel[] = allFrameLabels;

export function JurisdictionView({
  slug,
  jurisdictionKey,
  headline,
  all,
  headlineWithStates,
  allWithStates,
  analysis,
  countryDocuments,
}: {
  slug: string;
  jurisdictionKey: JurisdictionKey;
  headline: OverviewData;
  all: OverviewData;
  headlineWithStates?: OverviewData;
  allWithStates?: OverviewData;
  analysis: JurisdictionAnalysis | null;
  countryDocuments: SourceEntry[];
}) {
  const urlSearch = useUrlSearch();
  const sp = new URLSearchParams(urlSearch);
  const rawMode = sp.get("mode")?.toLowerCase();
  const mode: ScoringMode =
    rawMode === "all" || rawMode === "equal" ? "all" : "headline";
  const subnationalCount = headline.subnationalCount;
  const canToggleStates =
    subnationalCount > 0 && Boolean(headlineWithStates && allWithStates);
  const includeSubnational =
    canToggleStates && parseIncludeSubnational(sp.get("states"));
  const data =
    mode === "all"
      ? includeSubnational && allWithStates
        ? allWithStates
        : all
      : includeSubnational && headlineWithStates
        ? headlineWithStates
        : headline;
  const modeQuery = `${mode === "all" ? "&mode=all" : ""}${includeSubnational ? "&states=1" : ""}`;
  const modeParam = (() => {
    const qp = new URLSearchParams();
    if (mode === "all") qp.set("mode", "all");
    if (includeSubnational) qp.set("states", "1");
    const s = qp.toString();
    return s ? `?${s}` : "";
  })();

  function selectMode(nextMode: ScoringMode) {
    replaceUrlQuery((params) => {
      if (nextMode === "all") {
        params.set("mode", "all");
      } else {
        params.delete("mode");
      }
    });
  }

  function toggleStates() {
    replaceUrlQuery((params) => {
      if (includeSubnational) {
        params.delete("states");
      } else {
        params.set("states", "1");
      }
    });
  }

  const country = data.countries.find((c) => c.slug === slug);
  if (!country) return null;

  const nullCal = data.nullCalibration;
  const pairLookup = new Map(
    data.pairwiseDetails
      .filter((p) => p.leftSlug === slug)
      .map((p) => [p.rightSlug, p]),
  );

  const distances = data.countries
    .filter((other) => other.slug !== slug)
    .map((other) => {
      const pair = pairLookup.get(other.slug);
      return {
        other,
        pol: pair?.policyDistance ?? 0,
        frm: pair?.framingDistance ?? 0,
        cmp: pair?.compositeDistance ?? 0,
      };
    })
    .sort((a, b) => b.cmp - a.cmp);

  const farthest = distances[0];
  const closest = distances[distances.length - 1];

  const mixMap = new Map(country.frameMix.map((f) => [f.label, f.value]));
  const frameMax = Math.max(...country.frameMix.map((f) => f.value), 1);
  const totalMixShare = country.frameMix.reduce(
    (sum, frame) => sum + frame.value,
    0,
  );

  const jurisdictionTimeline: YearlyTimelinePoint[] =
    data.timelineByJurisdiction?.[jurisdictionKey] ?? [];

  return (
    <main className="min-h-screen bg-[#0a0f18] font-sans text-[14px] text-[#cdd6e1]">
      <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6 lg:px-8">
        <TopNav active="jurisdiction" />

        {/* Sub-nav: Breadcrumb + Scope toggle + Quick links */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2">
            <Link
              href={`/${modeParam}`}
              className="transition-colors hover:text-[#f1f5f9]"
            >
              overview
            </Link>
            <span aria-hidden className="text-[#475569]">
              /
            </span>
            <span>jurisdictions</span>
            <span aria-hidden className="text-[#475569]">
              /
            </span>
            <span className="text-[#f1f5f9]">{country.shortName}</span>
          </nav>

          <div className="flex flex-wrap items-center gap-3">
            <div
              role="group"
              aria-label="Jurisdiction scoring scope"
              className="flex items-center gap-1"
            >
              <button
                type="button"
                aria-pressed={mode === "headline"}
                onClick={() => selectMode("headline")}
                className={`rounded-[2px] border px-2 py-0.5 transition-colors ${
                  mode === "headline"
                    ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 text-[#f1f5f9]"
                    : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                }`}
              >
                active primary ({country.reviewedDocuments})
              </button>
              <button
                type="button"
                aria-pressed={mode === "all"}
                onClick={() => selectMode("all")}
                className={`rounded-[2px] border px-2 py-0.5 transition-colors ${
                  mode === "all"
                    ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 text-[#f1f5f9]"
                    : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                }`}
              >
                full corpus ({country.totalCorpusDocuments})
              </button>
              {canToggleStates ? (
                <button
                  type="button"
                  aria-pressed={includeSubnational}
                  onClick={toggleStates}
                  className={`rounded-[2px] border px-2 py-0.5 transition-colors ${
                    includeSubnational
                      ? "border-[#e6ae49]/60 bg-[#e6ae49]/15 text-[#fef3c7]"
                      : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                  }`}
                >
                  {includeSubnational ? "✓ " : "+ "}U.S. State Laws (
                  {subnationalCount})
                </button>
              ) : null}
            </div>

            <Link
              href={`/compare?a=${encodeURIComponent(country.slug)}&b=${encodeURIComponent(farthest?.other.slug ?? "china")}${modeQuery}`}
              className="text-[#67e8f9] underline decoration-[#67e8f9]/40 underline-offset-2 hover:text-white"
            >
              compare vs {farthest?.other.shortName ?? "peers"} →
            </Link>
            <a
              href={`/api/export?format=csv&j=${encodeURIComponent(country.slug)}&mode=${mode}`}
              className="hover:text-[#f1f5f9]"
            >
              csv ↓
            </a>
            <a
              href={`/api/jurisdictions/${encodeURIComponent(country.slug)}?mode=${mode}${includeSubnational ? "&states=1" : ""}`}
              className="hover:text-[#f1f5f9]"
            >
              json ↗
            </a>
          </div>
        </div>

        {/* Country masthead — lead with POL vs FRM + 90% CIs (C10) */}
        <header className="mt-3 border-y border-white/20 py-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-5">
              <Image
                src={country.flagUrl}
                alt={`${country.name} flag`}
                width={72}
                height={54}
                className="h-[54px] w-[72px] rounded-[3px] border border-white/15 object-cover shadow-[0_6px_18px_rgba(0,0,0,0.4)]"
                unoptimized
              />
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">
                  Jurisdiction · {country.shortName} ·{" "}
                  {mode === "headline" ? "active primary" : "full corpus"}
                </p>
                <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.01em] text-[#f1f5f9]">
                  {country.name}
                </h1>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
                  <span>
                    latest pub{" "}
                    <span className="text-[#f1f5f9]">
                      {country.latestPublicationDate}
                    </span>
                  </span>
                  <span aria-hidden className="text-[#475569]">
                    ·
                  </span>
                  <span>
                    <span className="tabular-nums text-[#f1f5f9]">
                      {country.reviewedDocuments}
                    </span>
                    /{country.totalCorpusDocuments} scored
                  </span>
                  <span aria-hidden className="text-[#475569]">
                    ·
                  </span>
                  <span>
                    <span className="tabular-nums text-[#67e8f9]">
                      {country.bindingLawCount}
                    </span>{" "}
                    binding laws
                  </span>
                  {country.lowConfidenceCount > 0 ? (
                    <>
                      <span aria-hidden className="text-[#475569]">
                        ·
                      </span>
                      <span>
                        <span className="tabular-nums text-[#e6ae49]">
                          {country.lowConfidenceCount}
                        </span>{" "}
                        low self-rep conf
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
            </div>

            {/* Hero scores: POL & FRM primary with 90% CIs, COV & CMP secondary */}
            <div className="flex flex-wrap items-start gap-5">
              <BigScore
                label="POL · rules"
                value={country.policyDivergence}
                ci={country.policyCI}
                color={scoreHexDark(
                  country.policyDivergence,
                  nullCal.countryPolicyMean,
                  nullCal.countryPolicyP90,
                  "country",
                )}
                sub={`req ${country.policyBreakdown.requirements} · enf ${country.policyBreakdown.enforcement} · bind ${country.policyBreakdown.binding}`}
                emphasis
              />
              <BigScore
                label="FRM · reasons"
                value={country.framingDivergence}
                ci={country.framingCI}
                color={scoreHexDark(
                  country.framingDivergence,
                  nullCal.countryFramingMean,
                  nullCal.countryFramingP90,
                  "country",
                )}
                sub={frameLabels[country.dominantFrame]}
                emphasis
              />
              <BigScore
                label="COV · reach L1"
                value={country.coverageDivergence}
                ci={country.coverageCI}
                color="#cbd5e1"
                sub="25-control regime L1"
              />
              <BigScore
                label="CMP · blend"
                value={country.compositeDivergence}
                ci={country.compositeCI}
                color={scoreHexDark(
                  country.compositeDivergence,
                  nullCal.countryCompositeMean,
                  nullCal.countryCompositeP90,
                  "country",
                )}
                sub="0.60 POL + 0.40 FRM"
              />
            </div>
          </div>
        </header>

        {/* Two-column body */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
          {/* LEFT: analysis + unified scoring engine operational profile */}
          <div className="flex flex-col gap-4">
            {/* Distinctive vs. peers banner */}
            {country.distinctiveGaps.length > 0 ? (
              <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-2">
                  <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
                    what distinguishes {country.shortName} from peers
                  </h2>
                  <Link
                    href={`/matrix${modeParam}`}
                    className="font-mono text-[11px] uppercase tracking-wider text-[#67e8f9] underline decoration-[#67e8f9]/40 underline-offset-2 hover:text-white"
                  >
                    view in 25×5 matrix →
                  </Link>
                </header>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {country.distinctiveGaps.slice(0, 6).map((gap) => (
                    <div
                      key={`${gap.dimension}-${gap.key}`}
                      className="rounded-[2px] border border-white/10 bg-[#0a0f18] px-3 py-2"
                    >
                      <p className="font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
                        {gap.dimension}
                      </p>
                      <p className="mt-0.5 truncate text-[13px] font-medium text-[#f1f5f9]">
                        {gap.label}
                      </p>
                      <p className="mt-1 flex items-baseline justify-between font-mono text-[11px] tabular-nums">
                        <span className="text-[#94a3b8]">
                          {gap.ownShare}% vs {gap.peerShare}% peers
                        </span>
                        <span
                          className={
                            gap.delta >= 0
                              ? "font-semibold text-[#67e8f9]"
                              : "font-semibold text-[#94a3b8]"
                          }
                        >
                          {gap.delta > 0 ? `+${gap.delta}pp` : `${gap.delta}pp`}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Jurisdiction readout */}
            <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-2">
                <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
                  jurisdiction readout
                </h2>
                <p className="font-mono text-[11px] text-[#94a3b8]">
                  {analysis
                    ? `corpus synthesis · ${analysis.source_count} analyzed sources`
                    : "scoring-engine readout"}
                </p>
              </header>
              <p className="mt-3 text-[15px] leading-relaxed text-[#f1f5f9]">
                {analysis?.summary ?? country.rationale}
              </p>
              {analysis ? (
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <NarrativePanel
                    label="governance posture"
                    body={analysis.governance_posture}
                  />
                  <NarrativePanel
                    label="implementation"
                    body={analysis.implementation_and_enforcement}
                  />
                  <NarrativePanel
                    label="source coverage"
                    body={analysis.source_coverage_note}
                  />
                </div>
              ) : null}
            </section>

            {/* Frame distribution */}
            <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
              <header className="flex items-baseline justify-between border-b border-white/10 pb-2">
                <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
                  eight-frame distribution
                </h2>
                <p className="font-mono text-[11px] text-[#94a3b8]">
                  {totalMixShare}% normalized share · {mode} scope
                </p>
              </header>

              <div className="mt-4">
                <div className="flex gap-2">
                  {ALL_FRAMES.map((frame) => {
                    const value = mixMap.get(frame) ?? 0;
                    return (
                      <span
                        key={frame}
                        className="flex-1 text-center font-mono text-[12px] tabular-nums"
                        style={{
                          color: value > 0 ? frameTextHue[frame] : "#7c8a9e",
                        }}
                      >
                        {value > 0 ? `${value}%` : "·"}
                      </span>
                    );
                  })}
                </div>
                <div className="mt-2 flex h-24 items-end gap-2 border-b border-white/15 pb-px">
                  {ALL_FRAMES.map((frame, index) => {
                    const value = mixMap.get(frame) ?? 0;
                    const pct = (value / frameMax) * 100;
                    const isDominant = frame === country.dominantFrame;
                    return (
                      <div
                        key={frame}
                        className="relative flex h-full flex-1 items-end"
                        title={`${frameLabels[frame]}: ${value}%`}
                      >
                        <div
                          className="ago-bar w-full rounded-t-[2px]"
                          style={{
                            height:
                              value === 0 ? "4px" : `${Math.max(pct, 6)}%`,
                            background:
                              value > 0
                                ? frameHue[frame]
                                : "rgba(255,255,255,0.08)",
                            boxShadow: isDominant
                              ? `0 0 0 1px ${frameTextHue[frame]}90`
                              : undefined,
                            animationDelay: `${index * 60}ms`,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-2 font-mono text-[11px] uppercase tracking-[0.06em]">
                  {ALL_FRAMES.map((frame) => {
                    const isDominant = frame === country.dominantFrame;
                    return (
                      <span
                        key={frame}
                        className="flex-1 text-center"
                        style={{
                          color: isDominant ? frameTextHue[frame] : "#94a3b8",
                          fontWeight: isDominant ? 600 : 400,
                        }}
                      >
                        {frameAbbr[frame]}
                      </span>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Framing landscape */}
            <section
              className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4"
              style={{
                borderTop: `2px solid ${frameHue[country.dominantFrame]}`,
              }}
            >
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
                dominant framing landscape
              </h2>
              <p
                className="mt-2 text-[18px] font-semibold"
                style={{ color: frameTextHue[country.dominantFrame] }}
              >
                {frameLabels[country.dominantFrame]}
              </p>
              <p className="mt-1 text-[13px] font-medium text-[#f1f5f9]">
                {frameDefinition[country.dominantFrame].short}
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#94a3b8]">
                {frameDefinition[country.dominantFrame].long}
              </p>
              <p className="mt-3 border-t border-white/10 pt-3 text-[13px] leading-relaxed text-[#cbd5e1]">
                {analysis?.framing_landscape ?? country.rationale}
              </p>
            </section>

            {/* C10: Unified Operational Profile strictly from the single web scoring engine */}
            <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-2">
                <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
                  operational profile · unified web scoring engine
                </h2>
                <p className="font-mono text-[11px] text-[#94a3b8]">
                  composition shares (%) &amp; doc counts · {mode} scope
                </p>
              </header>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <MetricPillList
                  label="safeguard requirements"
                  emptyLabel="No extracted requirements in this scope"
                  items={country.requirementShares.slice(0, 10).map((entry) => ({
                    label: humanizeRequirement(entry.label),
                    count: entry.count,
                    sharePct: entry.share,
                  }))}
                />
                <MetricPillList
                  label="enforcement hooks"
                  emptyLabel="No explicit enforcement hooks in this scope"
                  items={country.enforcementShares.map((entry) => ({
                    label: humanizeEnforcement(entry.label),
                    count: entry.count,
                    sharePct: entry.share,
                  }))}
                />
              </div>
            </section>

            {/* Per-jurisdiction longitudinal timeline */}
            {jurisdictionTimeline.length > 0 ? (
              <TimelineChart
                timeline={jurisdictionTimeline}
                title={`publication_timeline · ${country.shortName}`}
                subtitle={`${country.name} documents by official publication year (${mode} scope)`}
              />
            ) : null}

            {/* Latest documents */}
            <section className="rounded-sm border border-white/10 bg-[#0f1623]">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-4 py-3">
                <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
                  latest documents · {country.shortName}
                </h2>
                <div className="flex items-center gap-3 font-mono text-[11px] text-[#94a3b8]">
                  <span>{countryDocuments.length} shown · newest first</span>
                  <Link
                    href={`/documents?j=${encodeURIComponent(country.slug)}`}
                    className="text-[#67e8f9] underline decoration-[#67e8f9]/40 underline-offset-2 hover:text-white"
                  >
                    filter in corpus →
                  </Link>
                </div>
              </header>
              {countryDocuments.length === 0 ? (
                <p className="px-4 py-6 text-center text-[13px] text-[#94a3b8]">
                  No documents ingested yet.
                </p>
              ) : (
                <ol>
                  {countryDocuments.map((doc) => (
                    <li key={doc.id}>
                      <Link
                        href={`/documents/${encodeURIComponent(doc.id)}`}
                        className="group grid grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/5 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-white/[0.03]"
                      >
                        <span className="font-mono text-[11px] tabular-nums text-[#94a3b8]">
                          {doc.publicationDate}
                        </span>
                        <div className="min-w-0">
                          <p
                            lang={toHtmlLang(doc.language)}
                            className="truncate text-[13px] font-medium text-[#f1f5f9] underline decoration-transparent decoration-dotted underline-offset-2 transition-colors group-hover:text-white group-hover:decoration-white/40"
                          >
                            {doc.title}
                          </p>
                          <p className="truncate font-mono text-[11px] text-[#94a3b8]">
                            {doc.bindingStrengthLabel}
                            <span aria-hidden className="mx-1 text-[#475569]">
                              ·
                            </span>
                            <span
                              style={{ color: frameTextHue[doc.dominantFrame] }}
                            >
                              {frameAbbr[doc.dominantFrame]}{" "}
                              {frameLabels[doc.dominantFrame]}
                            </span>
                          </p>
                        </div>
                        <StatePill state={doc.analysisState} />
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          {/* RIGHT: context rail */}
          <aside className="flex flex-col gap-4">
            {/* Distance to peers */}
            <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
              <header className="flex items-baseline justify-between border-b border-white/10 pb-2">
                <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
                  distance to peers (POL / FRM)
                </h2>
                <p className="font-mono text-[11px] text-[#94a3b8]">
                  click to diff
                </p>
              </header>
              <ul className="mt-3 flex flex-col gap-2">
                {distances.map((entry, index) => {
                  const color = scoreHexDark(
                    entry.cmp,
                    nullCal.pairwiseCompositeMean,
                    nullCal.pairwiseCompositeP90,
                    "pairwise",
                  );
                  return (
                    <li key={entry.other.slug}>
                      <Link
                        href={`/compare?a=${encodeURIComponent(country.slug)}&b=${encodeURIComponent(entry.other.slug)}${modeQuery}`}
                        className="-mx-1.5 grid grid-cols-[20px_32px_minmax(0,1fr)_56px] items-center gap-2 rounded-[2px] px-1.5 py-1.5 transition-colors hover:bg-white/[0.05]"
                      >
                        <Image
                          src={entry.other.flagUrl}
                          alt=""
                          width={18}
                          height={13}
                          className="h-[13px] w-[18px] rounded-[1px] border border-white/15 object-cover"
                          unoptimized
                        />
                        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[#cbd5e1]">
                          {entry.other.shortName}
                        </span>
                        <div className="h-[6px] overflow-hidden rounded-[1px] bg-white/10">
                          <div
                            className="ago-bar-x h-[6px] rounded-[1px]"
                            style={{
                              width: `${Math.min(100, entry.cmp)}%`,
                              background: color,
                              animationDelay: `${index * 80}ms`,
                            }}
                          />
                        </div>
                        <span
                          className="text-right font-mono text-[12px] font-semibold tabular-nums"
                          style={{ color }}
                        >
                          {entry.pol}/{entry.frm}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              {farthest && closest ? (
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-3 font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
                  <div>
                    <p>farthest (CMP)</p>
                    <p
                      className="mt-1 text-[13px] font-semibold tabular-nums"
                      style={{
                        color: scoreHexDark(
                          farthest.cmp,
                          nullCal.pairwiseCompositeMean,
                          nullCal.pairwiseCompositeP90,
                          "pairwise",
                        ),
                      }}
                    >
                      {farthest.other.shortName} · {farthest.cmp}
                    </p>
                    <p className="mt-0.5 font-sans text-[12px] normal-case tracking-normal text-[#cbd5e1]">
                      {farthest.other.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p>closest (CMP)</p>
                    <p
                      className="mt-1 text-[13px] font-semibold tabular-nums"
                      style={{
                        color: scoreHexDark(
                          closest.cmp,
                          nullCal.pairwiseCompositeMean,
                          nullCal.pairwiseCompositeP90,
                          "pairwise",
                        ),
                      }}
                    >
                      {closest.other.shortName} · {closest.cmp}
                    </p>
                    <p className="mt-0.5 font-sans text-[12px] normal-case tracking-normal text-[#cbd5e1]">
                      {closest.other.name}
                    </p>
                  </div>
                </div>
              ) : null}
            </section>

            {/* Binding profile — driven strictly by unified web scoring engine (C10) */}
            <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
              <header className="flex items-baseline justify-between border-b border-white/10 pb-2">
                <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
                  binding profile · {mode} scope
                </h2>
                <p className="font-mono text-[11px] text-[#94a3b8]">
                  authoritative tiers
                </p>
              </header>
              <div className="mt-3">
                <MetricPillList
                  label="binding strengths"
                  emptyLabel="No binding profile in this scope"
                  items={country.bindingShares.map((entry) => ({
                    label: humanizeBindingStrength(entry.label),
                    count: entry.count,
                    sharePct: entry.share,
                  }))}
                />
              </div>
            </section>

            {/* Institutional anchors */}
            {analysis?.key_institutions?.length ? (
              <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
                <header className="flex items-baseline justify-between border-b border-white/10 pb-2">
                  <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
                    institutional anchors
                  </h2>
                  <p className="font-mono text-[11px] text-[#94a3b8]">
                    key issuers
                  </p>
                </header>
                <div className="mt-3">
                  <MetricPillList
                    label="institutions"
                    emptyLabel="No institutions extracted yet"
                    items={analysis.key_institutions.map((label) => ({
                      label: humanizeTaxonomyLabel(label),
                    }))}
                  />
                </div>
              </section>
            ) : null}

            {/* Jump to other jurisdictions */}
            <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
                jump to jurisdiction
              </h2>
              <ul className="mt-3 flex flex-col gap-1.5">
                {data.countries.map((other: CountrySnapshot) => {
                  const isCurrent = other.slug === slug;
                  return (
                    <li key={other.slug}>
                      <Link
                        href={`/jurisdictions/${other.slug}${modeParam}`}
                        aria-current={isCurrent ? "page" : undefined}
                        className={`flex items-center gap-2.5 rounded-[2px] border px-2.5 py-2 text-[12px] transition-colors ${
                          isCurrent
                            ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 text-[#f1f5f9]"
                            : "border-white/15 text-[#cbd5e1] hover:border-white/30 hover:bg-white/[0.03]"
                        }`}
                      >
                        <Image
                          src={other.flagUrl}
                          alt=""
                          width={18}
                          height={13}
                          className="h-[13px] w-[18px] rounded-[1px] border border-white/15 object-cover"
                          unoptimized
                        />
                        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94a3b8]">
                          {other.shortName}
                        </span>
                        <span className="truncate font-medium">
                          {other.name}
                        </span>
                        <span className="ml-auto font-mono text-[11px] tabular-nums text-[#cbd5e1]">
                          {other.policyDivergence}/{other.framingDivergence}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          </aside>
        </div>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
          <span>
            Project Babel · {country.name} · latest publication{" "}
            {country.latestPublicationDate} · snapshot {data.datasetVersion}
          </span>
          <Link
            href={`/${modeParam}`}
            className="transition-colors hover:text-[#f1f5f9]"
          >
            ← back to overview
          </Link>
        </footer>
      </div>
    </main>
  );
}

function BigScore({
  label,
  value,
  ci,
  color,
  sub,
  emphasis = false,
}: {
  label: string;
  value: number;
  ci: { low: number; high: number };
  color: string;
  sub?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-[2px] border border-white/10 bg-[#0f1623] px-3.5 py-2.5">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
        {label}
      </p>
      <p
        className={`mt-1 font-mono font-semibold leading-none tabular-nums ${
          emphasis ? "text-[28px]" : "text-[22px]"
        }`}
        style={{ color }}
      >
        {value}
      </p>
      <p className="mt-1 font-mono text-[11px] tabular-nums text-[#94a3b8]">
        90% [{ci.low}–{ci.high}]
      </p>
      {sub ? (
        <p className="mt-0.5 max-w-[170px] truncate font-mono text-[11px] text-[#cbd5e1]">
          {sub}
        </p>
      ) : null}
    </div>
  );
}

function NarrativePanel({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-[3px] border border-white/10 bg-[#0a0f18] px-3.5 py-3">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">
        {label}
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-[#cbd5e1]">{body}</p>
    </div>
  );
}

function MetricPillList({
  label,
  items,
  emptyLabel,
}: {
  label: string;
  items: { label: string; count?: number; sharePct?: number }[];
  emptyLabel: string;
}) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
        {label}
      </p>
      {items.length ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {items.map((item) => (
            <li
              key={`${item.label}-${item.count ?? 0}`}
              className="rounded-[3px] border border-white/15 bg-[#0a0f18] px-2.5 py-1 text-[12px]"
            >
              <span className="text-[#f1f5f9]">{item.label}</span>
              {item.count !== undefined ? (
                <span className="ml-2 font-mono text-[11px] tabular-nums text-[#94a3b8]">
                  {item.count}
                  {item.sharePct !== undefined ? ` · ${item.sharePct}%` : ""}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[12px] text-[#94a3b8]">{emptyLabel}</p>
      )}
    </div>
  );
}

function StatePill({ state }: { state: AnalysisState }) {
  const color = state === "analyzed" ? "#38bdf8" : "#94a3b8";
  return (
    <span
      className="rounded-[2px] px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider"
      style={{
        color,
        background: `${color}1a`,
        border: `1px solid ${color}40`,
      }}
    >
      {state}
    </span>
  );
}
