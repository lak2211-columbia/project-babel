"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { TimelineChart } from "@/app/_components/timeline-chart";
import { TopNav } from "@/app/_components/top-nav";
import {
  frameAbbr,
  frameHue,
  frameTextHue,
  scoreFillDark,
  scoreHexDark,
} from "@/lib/frame-vocab";
import {
  allFrameLabels,
  frameLabels,
  type CountrySnapshot,
  type FrameLabel,
  type NullCalibration,
  type OverviewData,
  type PairwiseDetail,
  type ScoringMode,
} from "@/lib/seed-data";
import type { SourceEntry } from "@/lib/sources-data";
import {
  formatModelList,
  getProvenanceBannerKind,
} from "@/lib/taxonomy-vocab";
import { replaceUrlQuery, useUrlSearch } from "@/lib/use-url-search";

import { DecouplingMap } from "./decoupling-map";
import { FrameTip, MetricTip } from "./frame-tip";
import { LatestSourcesPanel } from "./sources-panel";

const ALL_FRAMES: FrameLabel[] = allFrameLabels;

export function OverviewDashboard({
  headline,
  all,
  latestSources,
}: {
  headline: OverviewData;
  all: OverviewData;
  latestSources: SourceEntry[];
}) {
  const urlSearch = useUrlSearch();
  const [cardView, setCardView] = useState<"cards" | "table">("cards");

  const rawMode = new URLSearchParams(urlSearch).get("mode")?.toLowerCase();
  const mode: ScoringMode =
    rawMode === "all" || rawMode === "equal" ? "all" : "headline";

  const data = mode === "all" ? all : headline;

  function selectMode(nextMode: ScoringMode) {
    replaceUrlQuery((params) => {
      if (nextMode === "all") {
        params.set("mode", "all");
      } else {
        params.delete("mode");
      }
    });
  }

  // A1: Explicit empty-state refusal instead of silent fake seed data
  if (!data.hasData || data.countries.length === 0) {
    return (
      <main className="min-h-screen bg-[#0a0f18] font-sans text-[14px] text-[#cdd6e1]">
        <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
          <TopNav active="overview" />
          <section className="mt-8 rounded-sm border border-white/15 bg-[#0f1623] px-6 py-10 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#94a3b8]">
              PROJECT BABEL · OBSERVATORY STATUS
            </p>
            <h1 className="mt-2 text-[22px] font-semibold text-[#f1f5f9]">
              No observatory data loaded
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-[14px] leading-relaxed text-[#94a3b8]">
              {data.datasetLabel}. Configure{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[12px] text-[#e2e8f0]">
                DATABASE_URL
              </code>{" "}
              with synced observatory tables and trigger revalidation to publish
              live scores.
            </p>
            <div className="mt-5 flex justify-center gap-4 font-mono text-[12px]">
              <Link
                href="/methodology"
                className="rounded-[2px] border border-white/20 px-3 py-1.5 text-[#e2e8f0] hover:border-white/40"
              >
                Read methodology →
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const globalFrameMax = Math.max(
    ...data.countries.flatMap((country) =>
      country.frameMix.map((frame) => frame.value),
    ),
    1,
  );

  const nullCal = data.nullCalibration;
  const prov = data.provenanceSummary;

  return (
    <main className="min-h-screen bg-[#0a0f18] font-sans text-[14px] text-[#cdd6e1]">
      <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
        <TopNav active="overview" />

        {/* Masthead */}
        <header className="border-y border-white/20 py-7 text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">
            PROJECT BABEL
          </p>
          <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.01em] text-[#f1f5f9] sm:text-[26px]">
            AI Governance Observatory
          </h1>
          <p className="mx-auto mt-3 max-w-[820px] text-[15px] leading-relaxed text-[#cbd5e1]">
            Measuring how five governments diverge on{" "}
            <span className="font-medium text-[#f8fafc]">
              what they require of AI
            </span>{" "}
            — and{" "}
            <span className="font-medium text-[#f8fafc]">
              why they say those rules are necessary
            </span>
            .
          </p>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#94a3b8]">
            Evidence-grounded extraction from official government texts ·
            artifacts{" "}
            <span className="text-[#cbd5e1]">v{data.taxonomyVersion}</span> ·{" "}
            snapshot{" "}
            <span className="text-[#cbd5e1]">{data.datasetVersion}</span>
          </p>

          <div className="mx-auto mt-5 flex max-w-[1100px] flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-white/10 pt-4 font-mono text-[11px] uppercase tracking-[0.1em] text-[#94a3b8]">
            <span>
              <span className="mr-1 text-[#f1f5f9] tabular-nums">
                {data.summary.headlineDocuments}
              </span>
              active primary
            </span>
            <span aria-hidden className="hidden text-[#475569] sm:inline">
              ·
            </span>
            <span>
              <span className="mr-1 text-[#f1f5f9] tabular-nums">
                {data.summary.publishedSources}
              </span>
              corpus total
            </span>
            <span aria-hidden className="hidden text-[#475569] sm:inline">
              ·
            </span>
            <span>
              <span className="mr-1 text-[#67e8f9] tabular-nums">
                {data.summary.bindingInstruments}
              </span>
              binding laws
            </span>
            <span aria-hidden className="hidden text-[#475569] sm:inline">
              ·
            </span>
            <span>
              latest pub{" "}
              <span className="text-[#f1f5f9]">{data.snapshotDate}</span>
            </span>
            <span aria-hidden className="hidden text-[#475569] sm:inline">
              ·
            </span>
            <span>
              window{" "}
              <span className="text-[#f1f5f9]">{data.corpusWindow.label}</span>
            </span>
          </div>
        </header>

        {/* Honest dynamic provenance strip (A8, B1, Stage 4A) */}
        {(() => {
          const bannerKind = getProvenanceBannerKind(prov);
          const modelDisplay = formatModelList(prov.models);
          if (bannerKind === "legacy_warning") {
            return (
              <div
                role="note"
                className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-sm border border-[#e6ae49]/35 bg-[#0f1623] px-3.5 py-2 text-[12px] text-[#cbd5e1]"
              >
                <p className="leading-snug">
                  <span className="mr-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#e6ae49]">
                    provenance note
                  </span>
                  {prov.legacyCount} of {prov.totalAnalyzed} analyzed documents
                  currently use legacy v1 machine extractions ({modelDisplay},
                  no human review queue); schema v2.1 full re-analysis and
                  verification are pending.
                </p>
                <Link
                  href="/methodology#validation"
                  className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-[#67e8f9] underline decoration-[#67e8f9]/40 underline-offset-2 hover:text-white"
                >
                  validation &amp; limits →
                </Link>
              </div>
            );
          }
          if (bannerKind === "v2_verified") {
            return (
              <div
                role="note"
                className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-sm border border-[#38bdf8]/30 bg-[#0f1623] px-3.5 py-2 text-[12px] text-[#cbd5e1]"
              >
                <p className="leading-snug">
                  <span className="mr-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#67e8f9]">
                    v2.1 verified provenance
                  </span>
                  Coded via{" "}
                  <strong className="font-medium text-[#f1f5f9]">
                    {modelDisplay}
                  </strong>{" "}
                  (automated extraction, no human review queue) · Taxonomy v
                  {data.taxonomyVersion}
                  {prov.meanGroundingRatio !== null
                    ? ` · ${Math.round(prov.meanGroundingRatio * 100)}% verified quote grounding (n=${prov.groundingSampleCount})`
                    : ""}
                </p>
                <Link
                  href="/methodology#validation"
                  className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-[#67e8f9] underline decoration-[#67e8f9]/40 underline-offset-2 hover:text-white"
                >
                  validation &amp; gold set →
                </Link>
              </div>
            );
          }
          return null;
        })()}

        {/* Lead With Findings (C5) */}
        {data.findings.length > 0 ? (
          <section className="mt-4" aria-label="Headline empirical findings">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
                headline findings · computed from{" "}
                {mode === "headline"
                  ? `active primary instruments (n=${data.summary.headlineDocuments})`
                  : `full corpus (n=${data.summary.reviewedOutputs})`}
              </h2>
              <Link
                href={mode === "all" ? "/matrix?mode=all" : "/matrix"}
                className="font-mono text-[11px] uppercase tracking-wider text-[#67e8f9] underline decoration-[#67e8f9]/40 underline-offset-2 hover:text-white"
              >
                inspect 25×5 obligation matrix →
              </Link>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {data.findings.map((finding) => (
                <article
                  key={finding.id}
                  className="flex flex-col justify-between rounded-sm border border-white/10 bg-[#0f1623] px-4 py-3.5 transition-colors hover:border-[#38bdf8]/40"
                >
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#38bdf8]">
                      {finding.kicker}
                    </p>
                    <h3 className="mt-1.5 text-[15px] font-semibold leading-snug text-[#f1f5f9]">
                      {finding.headline}
                    </h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-[#94a3b8]">
                      {finding.detail}
                    </p>
                  </div>
                  <div className="mt-3 border-t border-white/10 pt-2">
                    <Link
                      href={finding.href}
                      className="font-mono text-[11px] uppercase tracking-wider text-[#67e8f9] underline decoration-[#67e8f9]/40 underline-offset-2 hover:text-white"
                    >
                      {finding.hrefLabel}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {/* Tracking strip + scoring mode switch (A3) */}
        <section
          className="mt-4 flex flex-wrap items-center justify-between gap-x-5 gap-y-2.5 border-y border-white/10 py-2.5"
          aria-label="Tracked jurisdictions and corpus scope"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="flex items-baseline gap-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[#94a3b8]">
              tracking
              <span aria-hidden className="text-[#475569]">
                ·
              </span>
              <span className="text-[#f1f5f9] tabular-nums">
                {data.countries.length} jurisdictions
              </span>
            </span>
            <ul className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              {data.countries.map((country) => (
                <li key={country.slug}>
                  <Link
                    href={`/jurisdictions/${country.slug}${mode === "all" ? "?mode=all" : ""}`}
                    className="group/track flex items-center gap-1.5 rounded-[2px] px-1.5 py-0.5 text-[#cdd6e1] transition-colors hover:bg-white/[0.05]"
                  >
                    <Image
                      src={country.flagUrl}
                      alt=""
                      width={20}
                      height={15}
                      className="h-[15px] w-[20px] rounded-[1px] border border-white/15 object-cover"
                      unoptimized
                    />
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8] transition-colors group-hover/track:text-[#f1f5f9]">
                      {country.shortName}
                    </span>
                    <span className="text-[12px] text-[#f1f5f9] underline decoration-transparent decoration-dotted underline-offset-2 transition-colors group-hover/track:decoration-white/40">
                      {country.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div
            role="group"
            aria-label="Corpus scoring population"
            className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em]"
          >
            <span className="text-[#94a3b8]">scope</span>
            <button
              type="button"
              aria-pressed={mode === "headline"}
              onClick={() => selectMode("headline")}
              className={`rounded-[2px] border px-2.5 py-1 transition-colors ${
                mode === "headline"
                  ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 font-semibold text-[#f1f5f9]"
                  : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
              }`}
            >
              headline · active primary ({headline.summary.headlineDocuments})
            </button>
            <button
              type="button"
              aria-pressed={mode === "all"}
              onClick={() => selectMode("all")}
              className={`rounded-[2px] border px-2.5 py-1 transition-colors ${
                mode === "all"
                  ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 font-semibold text-[#f1f5f9]"
                  : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
              }`}
            >
              all · full corpus ({all.summary.reviewedOutputs})
            </button>
          </div>
        </section>

        {/* Country Scorecards — leading with POL vs FRM + 90% CIs + Distinctive Gaps */}
        <section className="mt-4" aria-label="Jurisdiction scorecards">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
                jurisdiction scorecards · POL vs. FRM with 90% bootstrap CIs
              </h2>
              <p className="mt-0.5 text-[12px] text-[#94a3b8]">
                Each jurisdiction is measured against the mean of the other four
                peers. Histograms share a 0–{globalFrameMax}% scale and sum to
                100%.
              </p>
            </div>
            <div
              role="group"
              aria-label="Jurisdiction scorecards display mode"
              className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em]"
            >
              <button
                type="button"
                aria-pressed={cardView === "cards"}
                onClick={() => setCardView("cards")}
                className={`rounded-[2px] border px-2 py-0.5 transition-colors ${
                  cardView === "cards"
                    ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 text-[#f1f5f9]"
                    : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                }`}
              >
                cards
              </button>
              <button
                type="button"
                aria-pressed={cardView === "table"}
                onClick={() => setCardView("table")}
                className={`rounded-[2px] border px-2 py-0.5 transition-colors ${
                  cardView === "table"
                    ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 text-[#f1f5f9]"
                    : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                }`}
              >
                table
              </button>
            </div>
          </div>

          {cardView === "table" ? (
            <div className="overflow-x-auto rounded-sm border border-white/10 bg-[#0f1623] p-4">
              <table className="w-full text-left font-mono text-[12px]">
                <thead>
                  <tr className="border-b border-white/15 text-[11px] uppercase tracking-wider text-[#94a3b8]">
                    <th className="pb-2 pr-3 font-medium">jurisdiction</th>
                    <th className="pb-2 pr-3 text-right font-medium">docs</th>
                    <th className="pb-2 pr-3 text-right font-medium">
                      POL [90% CI]
                    </th>
                    <th className="pb-2 pr-3 text-right font-medium">
                      FRM [90% CI]
                    </th>
                    <th className="pb-2 pr-3 text-right font-medium">CMP</th>
                    <th className="pb-2 pr-3 text-right font-medium">COV L1</th>
                    {ALL_FRAMES.map((frame) => (
                      <th
                        key={frame}
                        className="pb-2 px-1.5 text-right font-medium"
                        title={frameLabels[frame]}
                      >
                        {frameAbbr[frame]}%
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.countries.map((c) => {
                    const mix = new Map(c.frameMix.map((f) => [f.label, f.value]));
                    return (
                      <tr key={c.slug} className="hover:bg-white/[0.03]">
                        <td className="py-2 pr-3 font-sans font-medium text-[#f1f5f9]">
                          <Link
                            href={`/jurisdictions/${c.slug}${mode === "all" ? "?mode=all" : ""}`}
                            className="underline decoration-white/25 underline-offset-2 hover:text-[#67e8f9]"
                          >
                            {c.name}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-[#94a3b8]">
                          {c.reviewedDocuments}/{c.totalCorpusDocuments}
                        </td>
                        <td
                          className="py-2 pr-3 text-right font-semibold tabular-nums"
                          style={{
                            color: scoreHexDark(
                              c.policyDivergence,
                              nullCal.countryPolicyMean,
                              nullCal.countryPolicyP90,
                              "country",
                            ),
                          }}
                        >
                          {c.policyDivergence}{" "}
                          <span className="font-normal text-[#94a3b8]">
                            [{c.policyCI.low}–{c.policyCI.high}]
                          </span>
                        </td>
                        <td
                          className="py-2 pr-3 text-right font-semibold tabular-nums"
                          style={{
                            color: scoreHexDark(
                              c.framingDivergence,
                              nullCal.countryFramingMean,
                              nullCal.countryFramingP90,
                              "country",
                            ),
                          }}
                        >
                          {c.framingDivergence}{" "}
                          <span className="font-normal text-[#94a3b8]">
                            [{c.framingCI.low}–{c.framingCI.high}]
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-[#e2e8f0]">
                          {c.compositeDivergence}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-[#94a3b8]">
                          {c.coverageDivergence}
                        </td>
                        {ALL_FRAMES.map((frame) => (
                          <td
                            key={frame}
                            className="py-2 px-1.5 text-right tabular-nums text-[#cbd5e1]"
                          >
                            {mix.get(frame) ?? 0}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {data.countries.map((country) => (
                <CountryCard
                  key={country.slug}
                  country={country}
                  globalMax={globalFrameMax}
                  nullCalibration={nullCal}
                  mode={mode}
                />
              ))}
            </div>
          )}
        </section>

        {/* Flagship 2D Decoupling Map + ONE clean 5×5 Pairwise Divergence Matrix (C2) */}
        <section
          className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_1fr]"
          aria-label="Policy versus framing decoupling and bilateral matrix"
        >
          <DecouplingMap
            countries={data.countries}
            pairwiseDetails={data.pairwiseDetails}
            nullCalibration={nullCal}
            mode={mode}
          />

          <PairwiseMatrixPanel
            countries={data.countries}
            pairwiseDetails={data.pairwiseDetails}
            nullCalibration={nullCal}
            hiddenFaultLine={data.summary.hiddenFaultLine}
            mode={mode}
          />
        </section>

        {/* Scoring key + Eight Frames reference panels */}
        <section className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
          <div
            className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-3.5"
            aria-label="How to read the scores"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
                how to read the scores · null-calibrated scale
              </h2>
              <Link
                href="/methodology"
                className="font-mono text-[11px] uppercase tracking-wider text-[#67e8f9] underline decoration-[#67e8f9]/40 underline-offset-2 hover:text-white"
              >
                full methodology →
              </Link>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#cbd5e1]">
              Total Variation Distance (0–100) comparing one jurisdiction to the
              unweighted mean of the other four peers. Divergence is{" "}
              <strong className="font-medium text-[#f1f5f9]">
                value-neutral
              </strong>
              : colors track distance relative to a 200-draw random label
              permutation baseline (mean{" "}
              <span className="font-mono text-[#e2e8f0]">
                {nullCal.countryCompositeMean}
              </span>
              , 90th pct{" "}
              <span className="font-mono text-[#e2e8f0]">
                {nullCal.countryCompositeP90}
              </span>
              ).
            </p>

            {/* Sequential single-hue legend (C6) */}
            <div className="mt-3">
              <div
                className="h-[6px] rounded-[1px]"
                style={{
                  background:
                    "linear-gradient(to right, #94a3b8 0%, #94a3b8 33%, #38bdf8 33%, #38bdf8 66%, #67e8f9 66%, #67e8f9 100%)",
                }}
              />
              <div className="mt-1.5 flex flex-wrap justify-between gap-2 font-mono text-[11px] uppercase tracking-[0.06em]">
                <span className="text-[#94a3b8]">
                  &lt; {nullCal.countryCompositeMean || 18} · within null noise
                </span>
                <span className="text-[#38bdf8]">
                  {nullCal.countryCompositeMean || 18} –{" "}
                  {(nullCal.countryCompositeP90 || 26) - 1} · above random null
                </span>
                <span className="text-[#67e8f9]">
                  ≥ {nullCal.countryCompositeP90 || 26} · above 90th-pct null
                </span>
              </div>
            </div>

            <div className="mt-3.5 flex flex-wrap gap-2 border-t border-white/10 pt-3">
              {[
                {
                  code: "POL",
                  label: "policy",
                  question: "Different rules?",
                  desc: "Total Variation Distance combining normalized safeguard requirements (45%), enforcement mechanisms (30%, with explicit none_specified), and authoritative binding-tier distribution (25%).",
                  example:
                    "Separates statutory penalty regimes (binding law + civil sanctions) from executive procurement and voluntary standards.",
                },
                {
                  code: "FRM",
                  label: "framing",
                  question: "Different reasons?",
                  desc: "Total Variation Distance over the normalized eight-frame rationale mix. Sub-0.15 background noise is zeroed before document normalization so dominant justifications drive the signal.",
                  example:
                    "Captures whether governments justify rules via fundamental rights, social stability, consumer safety, or innovation enablement.",
                },
                {
                  code: "COV",
                  label: "coverage L1",
                  question: "Different regime reach?",
                  desc: "Regime Coverage Index comparing each jurisdiction's strongest binding level (0–4) across all 25 statutory requirement and enforcement controls — invariant to document-count inflation.",
                  example:
                    "Inspect the full 25×5 cell-by-cell legal obligation matrix on the Matrix page.",
                },
                {
                  code: "CMP",
                  label: "composite",
                  question: "Combined blend",
                  desc: "Secondary summary blend: round(0.60 × POL + 0.40 × FRM) on the raw 0–100 TVD scale with zero min-max stretching.",
                  example:
                    "Use POL and FRM side-by-side first; CMP only summarizes overall distance.",
                },
              ].map((metric) => (
                <MetricChip key={metric.code} metric={metric} />
              ))}
            </div>
          </div>

          <div
            className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-3.5"
            aria-label="Shared vocabulary for the eight risk framing labels"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
                the eight frames · codebook v2.1.0
              </h2>
              <p className="font-mono text-[11px] text-[#94a3b8]">
                hover or tap for inclusion rules
              </p>
            </div>
            <ul className="mt-2.5 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {ALL_FRAMES.map((frame) => (
                <FrameRow key={frame} frame={frame} />
              ))}
            </ul>
          </div>
        </section>

        {/* Longitudinal timeline */}
        <div className="mt-4">
          <TimelineChart timeline={data.timeline} />
        </div>

        {/* Latest sources */}
        <section className="mt-4" aria-label="Recent official sources">
          <LatestSourcesPanel
            allSources={latestSources}
            countries={data.countries}
          />
        </section>

        {/* Footer — provenance + research export links */}
        <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3 font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
          <span>
            {data.countries.length} jurisdictions ·{" "}
            {data.summary.headlineDocuments} primary /{" "}
            {data.summary.publishedSources} corpus · snapshot{" "}
            {data.datasetVersion}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`/api/export?format=csv&mode=${mode}`}
              className="transition-colors hover:text-[#f1f5f9]"
            >
              export csv
            </a>
            <span aria-hidden className="text-[#475569]">
              ·
            </span>
            <a
              href={`/api/export?format=json&mode=${mode}`}
              className="transition-colors hover:text-[#f1f5f9]"
            >
              json
            </a>
            <span aria-hidden className="text-[#475569]">
              ·
            </span>
            <a
              href={`/api/export?format=bibtex&mode=${mode}`}
              className="transition-colors hover:text-[#f1f5f9]"
            >
              bibtex
            </a>
            <span aria-hidden className="text-[#475569]">
              ·
            </span>
            <Link
              href="/methodology"
              className="transition-colors hover:text-[#f1f5f9]"
            >
              methodology
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Country card — POL vs FRM hero + 90% CIs + Distinctive Gaps (C5/C6) */
/* ------------------------------------------------------------------ */

function CountryCard({
  country,
  globalMax,
  nullCalibration,
  mode,
}: {
  country: CountrySnapshot;
  globalMax: number;
  nullCalibration: NullCalibration;
  mode: ScoringMode;
}) {
  const mixMap = new Map(country.frameMix.map((f) => [f.label, f.value]));
  const totalMixShare = country.frameMix.reduce(
    (sum, frame) => sum + frame.value,
    0,
  );
  const polColor = scoreHexDark(
    country.policyDivergence,
    nullCalibration.countryPolicyMean,
    nullCalibration.countryPolicyP90,
    "country",
  );
  const frmColor = scoreHexDark(
    country.framingDivergence,
    nullCalibration.countryFramingMean,
    nullCalibration.countryFramingP90,
    "country",
  );

  return (
    <article className="group/card flex flex-col gap-3 rounded-sm border border-white/10 bg-[#0f1623] px-3.5 py-3.5 transition-colors duration-200 hover:border-white/25 hover:bg-[#101a2c]">
      <Link
        href={`/jurisdictions/${country.slug}${mode === "all" ? "?mode=all" : ""}`}
        className="group/head -mx-1 -mt-1 flex items-center gap-2.5 rounded-[2px] px-1 py-1 transition-colors hover:bg-white/[0.04]"
      >
        <Image
          src={country.flagUrl}
          alt={`${country.name} flag`}
          width={28}
          height={21}
          className="h-[21px] w-[28px] rounded-[2px] border border-white/15 object-cover"
          unoptimized
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.1em] text-[#94a3b8]">
            {country.shortName}
            <span
              aria-hidden
              className="text-[#94a3b8] transition-all duration-150 group-hover/head:translate-x-0.5 group-hover/head:text-[#f1f5f9]"
            >
              →
            </span>
          </p>
          <h3 className="truncate text-[14px] font-semibold text-[#f1f5f9] underline decoration-transparent decoration-dotted underline-offset-2 transition-colors group-hover/head:decoration-white/40">
            {country.name}
          </h3>
        </div>
      </Link>

      {/* Primary pair: POL vs FRM side-by-side with 90% CIs (B2/B6) */}
      <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-2.5">
        <div className="rounded-[2px] border border-white/10 bg-[#0a0f18] px-2.5 py-2">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
            POL · rules
          </p>
          <p
            className="mt-0.5 font-mono text-[22px] font-semibold leading-none tabular-nums"
            style={{ color: polColor }}
          >
            {country.policyDivergence}
          </p>
          <p className="mt-1 font-mono text-[11px] tabular-nums text-[#94a3b8]">
            90% [{country.policyCI.low}–{country.policyCI.high}]
          </p>
        </div>
        <div className="rounded-[2px] border border-white/10 bg-[#0a0f18] px-2.5 py-2">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
            FRM · reasons
          </p>
          <p
            className="mt-0.5 font-mono text-[22px] font-semibold leading-none tabular-nums"
            style={{ color: frmColor }}
          >
            {country.framingDivergence}
          </p>
          <p className="mt-1 font-mono text-[11px] tabular-nums text-[#94a3b8]">
            90% [{country.framingCI.low}–{country.framingCI.high}]
          </p>
        </div>
      </div>

      {/* Secondary summary strip: CMP + COV L1 + policy sub-dimensions */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-[2px] border border-white/5 bg-[#0a0f18] px-2.5 py-1.5 font-mono text-[11px] text-[#94a3b8]">
        <span>
          CMP{" "}
          <strong className="tabular-nums text-[#e2e8f0]">
            {country.compositeDivergence}
          </strong>
        </span>
        <span>
          COV{" "}
          <strong className="tabular-nums text-[#e2e8f0]">
            {country.coverageDivergence}
          </strong>
        </span>
        <span
          title={`Policy sub-distances — requirements: ${country.policyBreakdown.requirements}, enforcement: ${country.policyBreakdown.enforcement}, binding: ${country.policyBreakdown.binding}`}
          className="tabular-nums"
        >
          {country.policyBreakdown.requirements}/
          {country.policyBreakdown.enforcement}/
          {country.policyBreakdown.binding}
        </span>
      </div>

      <div>
        <p className="font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
          frame mix · {totalMixShare}%
        </p>
        <Histogram country={country} globalMax={globalMax} mixMap={mixMap} />
      </div>

      <div className="border-t border-white/10 pt-2">
        <p className="font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
          dominant frame
        </p>
        <FrameTip frame={country.dominantFrame}>
          <span className="group/dom mt-1 flex w-full cursor-help items-center gap-2 rounded-[2px] border border-dashed border-white/20 bg-white/[0.02] px-2 py-1 transition-all duration-150 hover:border-solid hover:border-white/35 hover:bg-white/[0.05]">
            <span
              className="h-[8px] w-[8px] shrink-0 rounded-[1px]"
              style={{ background: frameHue[country.dominantFrame] }}
            />
            <span
              className="truncate text-[12px] font-semibold"
              style={{ color: frameTextHue[country.dominantFrame] }}
            >
              {frameLabels[country.dominantFrame]}
            </span>
            <HoverHint />
          </span>
        </FrameTip>
      </div>

      {/* Distinctive vs peers (C5 — replaces generic top requirements) */}
      <div className="border-t border-white/10 pt-2">
        <p className="font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
          distinctive vs. peers
        </p>
        {country.distinctiveGaps.length > 0 ? (
          <ul className="mt-1.5 flex flex-col gap-1">
            {country.distinctiveGaps.slice(0, 3).map((gap) => (
              <li
                key={`${gap.dimension}-${gap.key}`}
                className="flex items-center justify-between gap-2 rounded-[2px] border border-white/10 bg-white/[0.02] px-2 py-0.5 text-[12px]"
              >
                <span className="truncate text-[#cbd5e1]">{gap.label}</span>
                <span
                  className={`shrink-0 font-mono text-[11px] font-semibold tabular-nums ${
                    gap.delta >= 0 ? "text-[#67e8f9]" : "text-[#94a3b8]"
                  }`}
                >
                  {gap.delta > 0 ? `+${gap.delta}pp` : `${gap.delta}pp`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {country.requirements.map((req) => (
              <li
                key={req}
                className="rounded-[2px] border border-white/15 bg-white/[0.03] px-1.5 py-0.5 text-[11px] text-[#cbd5e1]"
              >
                {req}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 font-mono text-[11px] text-[#94a3b8]">
        <span>
          <span className="tabular-nums text-[#f1f5f9]">
            {country.reviewedDocuments}
          </span>
          /{country.totalCorpusDocuments} docs
        </span>
        <span className="flex items-center gap-2">
          <span>
            <span className="tabular-nums text-[#67e8f9]">
              {country.bindingLawCount}
            </span>{" "}
            binding
          </span>
          {country.lowConfidenceCount > 0 ? (
            <span title="Documents below codebook self-reported confidence thresholds (policy < 0.70 or framing < 0.60)">
              <span className="tabular-nums text-[#e6ae49]">
                {country.lowConfidenceCount}
              </span>{" "}
              low-conf
            </span>
          ) : null}
        </span>
      </div>
    </article>
  );
}

function Histogram({
  country,
  globalMax,
  mixMap,
}: {
  country: CountrySnapshot;
  globalMax: number;
  mixMap: Map<FrameLabel, number>;
}) {
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {ALL_FRAMES.map((frame) => {
          const value = mixMap.get(frame) ?? 0;
          return (
            <span
              key={frame}
              className="flex-1 text-center font-mono text-[11px] tabular-nums"
              style={{
                color: value > 0 ? frameTextHue[frame] : "#7c8a9e",
              }}
            >
              {value > 0 ? value : "·"}
            </span>
          );
        })}
      </div>
      <div className="mt-1 flex h-14 items-end gap-1 border-b border-white/15 pb-px">
        {ALL_FRAMES.map((frame, index) => {
          const value = mixMap.get(frame) ?? 0;
          const pct = (value / globalMax) * 100;
          const isDominant = frame === country.dominantFrame;
          return (
            <div
              key={frame}
              className="relative flex h-full flex-1 items-end"
              title={`${frameLabels[frame]}: ${value}%`}
            >
              <div
                className="ago-bar w-full rounded-t-[1px] transition-[filter] duration-200 group-hover/card:brightness-110"
                style={{
                  height: value === 0 ? "3px" : `${Math.max(pct, 6)}%`,
                  background:
                    value > 0 ? frameHue[frame] : "rgba(255,255,255,0.08)",
                  boxShadow: isDominant
                    ? `0 0 0 1px ${frameTextHue[frame]}90`
                    : undefined,
                  animationDelay: `${index * 40}ms`,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1 font-mono text-[11px] uppercase">
        {ALL_FRAMES.map((frame) => {
          const isDominant = frame === country.dominantFrame;
          return (
            <span
              key={frame}
              className="flex-1 truncate text-center"
              title={frameLabels[frame]}
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
  );
}

/* ------------------------------------------------------------------ */
/* ONE clean 5×5 Pairwise Divergence Matrix (C2 — replaces 5 panels)  */
/* ------------------------------------------------------------------ */

function PairwiseMatrixPanel({
  countries,
  pairwiseDetails,
  nullCalibration,
  hiddenFaultLine,
  mode,
}: {
  countries: CountrySnapshot[];
  pairwiseDetails: PairwiseDetail[];
  nullCalibration: NullCalibration;
  hiddenFaultLine: string;
  mode: ScoringMode;
}) {
  const pairLookup = new Map<string, PairwiseDetail>();
  for (const detail of pairwiseDetails) {
    pairLookup.set(`${detail.leftSlug}__${detail.rightSlug}`, detail);
  }
  const modeQuery = mode === "all" ? "&mode=all" : "";

  return (
    <div className="flex flex-col justify-between rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
      <div>
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-2.5">
          <div>
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
              pairwise_matrix · 5×5 bilateral POL / FRM
            </h2>
            <p className="mt-0.5 text-[12px] text-[#94a3b8]">
              Click any cell to inspect label-conditioned diffs &amp; bilingual
              quotes.
            </p>
          </div>
          <Link
            href={`/compare${mode === "all" ? "?mode=all" : ""}`}
            className="font-mono text-[11px] uppercase tracking-wider text-[#67e8f9] underline decoration-[#67e8f9]/40 underline-offset-2 hover:text-white"
          >
            open compare →
          </Link>
        </header>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-separate border-spacing-1.5 text-center font-mono text-[12px]">
            <thead>
              <tr>
                <th className="w-12 p-1 text-left text-[11px] uppercase tracking-wider text-[#94a3b8]">
                  pair
                </th>
                {countries.map((col) => (
                  <th
                    key={col.slug}
                    className="p-1 text-[11px] font-semibold uppercase tracking-wider text-[#cbd5e1]"
                  >
                    {col.shortName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {countries.map((row) => (
                <tr key={row.slug}>
                  <th className="p-1 text-left text-[11px] font-semibold uppercase tracking-wider text-[#cbd5e1]">
                    {row.shortName}
                  </th>
                  {countries.map((col) => {
                    if (row.slug === col.slug) {
                      return (
                        <td
                          key={col.slug}
                          aria-hidden="true"
                          className="rounded-[2px] border border-white/5 bg-[#0a0f18] px-2 py-2.5 text-[#7c8a9e]"
                        >
                          —
                        </td>
                      );
                    }
                    const detail = pairLookup.get(`${row.slug}__${col.slug}`);
                    const pol = detail?.policyDistance ?? 0;
                    const frm = detail?.framingDistance ?? 0;
                    const cmp = detail?.compositeDistance ?? 0;
                    const textColor = scoreHexDark(
                      cmp,
                      nullCalibration.pairwiseCompositeMean,
                      nullCalibration.pairwiseCompositeP90,
                      "pairwise",
                    );
                    const bgFill = scoreFillDark(
                      cmp,
                      nullCalibration.pairwiseCompositeMean,
                      nullCalibration.pairwiseCompositeP90,
                      "pairwise",
                    );
                    return (
                      <td
                        key={col.slug}
                        className="rounded-[2px] border border-white/10 p-0 transition-colors hover:border-[#67e8f9]/60"
                        style={{ backgroundColor: bgFill }}
                      >
                        <Link
                          href={`/compare?a=${encodeURIComponent(row.slug)}&b=${encodeURIComponent(col.slug)}${modeQuery}`}
                          aria-label={`Compare ${row.name} versus ${col.name}: Policy ${pol}, Framing ${frm}, Composite ${cmp}`}
                          className="block px-1.5 py-2"
                        >
                          <div
                            className="text-[13px] font-semibold leading-none tabular-nums"
                            style={{ color: textColor }}
                          >
                            {pol}/{frm}
                          </div>
                          <div className="mt-1 text-[11px] leading-none tabular-nums text-[#94a3b8]">
                            c{cmp}
                          </div>
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5 font-mono text-[11px] text-[#94a3b8]">
        <span>cell format: POL/FRM · cCMP</span>
        <span>
          widest fault line:{" "}
          <strong className="text-[#f1f5f9]">{hiddenFaultLine}</strong>
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reference helper components                                         */
/* ------------------------------------------------------------------ */

function MetricChip({
  metric,
}: {
  metric: {
    code: string;
    label: string;
    question: string;
    desc: string;
    example: string;
  };
}) {
  return (
    <MetricTip metric={metric}>
      <span className="group/chip inline-flex cursor-help items-center gap-1.5 rounded-[2px] border border-dashed border-white/20 bg-white/[0.02] px-2 py-1 text-[12px] transition-all duration-150 hover:border-solid hover:border-white/40 hover:bg-white/[0.06]">
        <span className="font-mono font-semibold uppercase text-[#f1f5f9]">
          {metric.code}
        </span>
        <span className="text-[#cbd5e1]">{metric.question}</span>
        <HoverHint />
      </span>
    </MetricTip>
  );
}

function FrameRow({ frame }: { frame: FrameLabel }) {
  return (
    <li>
      <FrameTip frame={frame}>
        <span className="group/row flex w-full cursor-help items-center gap-2 rounded-[2px] px-1.5 py-1 transition-colors hover:bg-white/[0.05]">
          <span
            className="h-[8px] w-[8px] shrink-0 rounded-[1px]"
            style={{ background: frameHue[frame] }}
          />
          <span className="w-[30px] shrink-0 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94a3b8]">
            {frameAbbr[frame]}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-[12px] underline decoration-dotted decoration-white/25 underline-offset-[3px] transition-colors group-hover/row:decoration-white/60"
            style={{ color: frameTextHue[frame] }}
          >
            {frameLabels[frame]}
          </span>
          <HoverHint />
        </span>
      </FrameTip>
    </li>
  );
}

function HoverHint() {
  return (
    <span
      aria-hidden
      className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-white/25 font-mono text-[11px] font-semibold leading-none text-[#94a3b8] transition-colors group-hover/chip:border-white/50 group-hover/chip:text-[#f1f5f9] group-hover/row:border-white/50 group-hover/row:text-[#f1f5f9] group-hover/dom:border-white/50 group-hover/dom:text-[#f1f5f9]"
    >
      i
    </span>
  );
}
