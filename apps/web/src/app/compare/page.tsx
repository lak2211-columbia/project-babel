import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { TopNav } from "@/app/_components/top-nav";
import {
  getBilateralComparison,
  resolveJurisdictionSlug,
  type BilateralMetricRow,
  type EvidenceContrast,
} from "@/lib/compare-data";
import {
  frameAbbr,
  frameHue,
  frameTextHue,
  scoreHexDark,
} from "@/lib/frame-vocab";
import { jurisdictionMeta, jurisdictionOrder } from "@/lib/jurisdictions";
import { getOverviewData, parseScoringMode } from "@/lib/overview-data";
import { frameLabels } from "@/lib/seed-data";
import {
  isCjkText,
  parseIncludeSubnational,
  toHtmlLang,
} from "@/lib/taxonomy-vocab";

import { CompareControls } from "./_compare-controls";

function resolvePairKeys(a?: string, b?: string) {
  const keyA = resolveJurisdictionSlug(a, "united_states");
  let keyB = resolveJurisdictionSlug(b, "china");
  if (keyA === keyB) {
    keyB = keyA === "china" ? "european_union" : "china";
  }
  return { keyA, keyB };
}

/** C9: Dynamic pair-specific SEO & social metadata */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}): Promise<Metadata> {
  const { a, b } = await searchParams;
  const { keyA, keyB } = resolvePairKeys(a, b);
  const metaA = jurisdictionMeta[keyA];
  const metaB = jurisdictionMeta[keyB];
  return {
    title: `${metaA.name} vs. ${metaB.name} · Bilateral AI Governance Comparison`,
    description: `Head-to-head comparison of AI policy structure, regime coverage, and risk framing between ${metaA.name} and ${metaB.name} with label-conditioned verbatim evidence quotes.`,
    alternates: {
      canonical: `/compare?a=${metaA.slug}&b=${metaB.slug}`,
    },
  };
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{
    a?: string;
    b?: string;
    mode?: string;
    states?: string;
  }>;
}) {
  const { a, b, mode: rawMode, states: rawStates } = await searchParams;
  const mode = parseScoringMode(rawMode);
  const requestedStates = parseIncludeSubnational(rawStates);
  const { keyA, keyB } = resolvePairKeys(a, b);

  const [diff, overview] = await Promise.all([
    getBilateralComparison(keyA, keyB, mode, requestedStates),
    getOverviewData(mode, requestedStates),
  ]);
  const includeSubnational =
    overview.subnationalCount > 0 && overview.includeSubnational;

  const options = jurisdictionOrder.map((key) => ({
    slug: jurisdictionMeta[key].slug,
    name: jurisdictionMeta[key].name,
    shortName: jurisdictionMeta[key].shortName,
  }));

  if (!diff.hasData) {
    return (
      <main className="min-h-screen bg-[#0a0f18] font-sans text-[14px] text-[#cdd6e1]">
        <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6 lg:px-8">
          <TopNav active="compare" />
          <section className="mt-8 rounded-sm border border-white/15 bg-[#0f1623] px-6 py-10 text-center">
            <h1 className="text-[22px] font-semibold text-[#f1f5f9]">
              No bilateral comparison data loaded
            </h1>
            <p className="mt-2 text-[14px] text-[#94a3b8]">
              Connect the observatory database and sync analyzed instruments to
              compare jurisdictions.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const nullCal = overview.nullCalibration;
  const modeParam = (() => {
    const qp = new URLSearchParams();
    if (mode === "all") qp.set("mode", "all");
    if (includeSubnational) qp.set("states", "1");
    const s = qp.toString();
    return s ? `?${s}` : "";
  })();
  const maxFrameVal = Math.max(
    ...diff.frameDeltas.flatMap((row) => [row.shareA, row.shareB]),
    1,
  );

  return (
    <main className="min-h-screen bg-[#0a0f18] font-sans text-[14px] text-[#cdd6e1]">
      <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6 lg:px-8">
        <TopNav active="compare" />

        <header className="border-y border-white/20 py-7 text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">
            PROJECT BABEL · BILATERAL DIFF ·{" "}
            {mode === "headline" ? "ACTIVE PRIMARY" : "FULL CORPUS"}
          </p>
          <h1 className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[24px] font-semibold text-[#f1f5f9]">
            <span className="inline-flex items-center gap-2">
              <Image
                src={diff.countryA.flagUrl}
                alt=""
                width={26}
                height={19}
                className="h-[19px] w-[26px] rounded-[2px] border border-white/15 object-cover"
                unoptimized
              />
              {diff.countryA.name}
            </span>
            <span className="font-mono text-[14px] uppercase tracking-[0.14em] text-[#94a3b8]">
              vs
            </span>
            <span className="inline-flex items-center gap-2">
              <Image
                src={diff.countryB.flagUrl}
                alt=""
                width={26}
                height={19}
                className="h-[19px] w-[26px] rounded-[2px] border border-white/15 object-cover"
                unoptimized
              />
              {diff.countryB.name}
            </span>
          </h1>
          <p className="mx-auto mt-2.5 max-w-[820px] text-[14px] leading-relaxed text-[#cbd5e1]">
            Head-to-head divergence across policy rules, regime coverage,
            binding tiers, and eight-frame risk rationales — paired with
            label-conditioned official evidence quotes.
          </p>
        </header>

        <div className="mt-4">
          <CompareControls
            options={options}
            slugA={diff.countryA.slug}
            slugB={diff.countryB.slug}
            mode={mode}
            includeSubnational={includeSubnational}
            subnationalCount={overview.subnationalCount}
          />
          {includeSubnational ? (
            <p className="mt-2 rounded-[2px] border border-[#e6ae49]/35 bg-[#e6ae49]/10 px-3 py-2 text-[12px] leading-relaxed text-[#fef3c7]">
              <strong className="font-semibold">
                U.S. state statutory overlay active (+
                {overview.subnationalCount} state statutes):
              </strong>{" "}
              Enacted U.S. state AI statutes are included alongside federal
              instruments when computing United States policy, coverage, and
              framing distributions.
            </p>
          ) : null}
        </div>

        {/* Hero bilateral divergence scoreboard — lead with POL vs FRM + COV L1 */}
        <section
          aria-label="Bilateral divergence scores"
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          <ScoreCard
            label="policy distance (POL)"
            value={diff.policyDistance}
            color={scoreHexDark(
              diff.policyDistance,
              nullCal.pairwisePolicyMean,
              nullCal.pairwisePolicyP90,
              "pairwise",
            )}
            detail={`req ${diff.policyBreakdown.requirements} · enf ${diff.policyBreakdown.enforcement} · bind ${diff.policyBreakdown.binding}`}
          />
          <ScoreCard
            label="framing distance (FRM)"
            value={diff.framingDistance}
            color={scoreHexDark(
              diff.framingDistance,
              nullCal.pairwiseFramingMean,
              nullCal.pairwiseFramingP90,
              "pairwise",
            )}
            detail={`${diff.countryA.shortName}: ${frameAbbr[diff.countryA.dominantFrame]} vs ${diff.countryB.shortName}: ${frameAbbr[diff.countryB.dominantFrame]}`}
          />
          <ScoreCard
            label="regime coverage (COV L1)"
            value={diff.coverageDistance}
            color="#cbd5e1"
            detail="25-control max binding level L1"
          />
          <ScoreCard
            label="composite blend (CMP)"
            value={diff.compositeDistance}
            color={scoreHexDark(
              diff.compositeDistance,
              nullCal.pairwiseCompositeMean,
              nullCal.pairwiseCompositeP90,
              "pairwise",
            )}
            detail={`null mean ${nullCal.pairwiseCompositeMean} · p90 ${nullCal.pairwiseCompositeP90}`}
          />
          <div className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
              scored instruments
            </p>
            <div className="mt-2.5 flex items-baseline justify-between text-[13px]">
              <Link
                href={`/jurisdictions/${diff.countryA.slug}${modeParam}`}
                className="font-medium text-[#f1f5f9] underline decoration-white/25 underline-offset-2 hover:text-[#67e8f9]"
              >
                {diff.countryA.shortName}: {diff.countryA.reviewedDocuments}/
                {diff.countryA.totalCorpusDocuments}
              </Link>
              <span className="font-mono text-[11px] text-[#67e8f9]">
                {diff.countryA.bindingLawCount} law
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between text-[13px]">
              <Link
                href={`/jurisdictions/${diff.countryB.slug}${modeParam}`}
                className="font-medium text-[#f1f5f9] underline decoration-white/25 underline-offset-2 hover:text-[#67e8f9]"
              >
                {diff.countryB.shortName}: {diff.countryB.reviewedDocuments}/
                {diff.countryB.totalCorpusDocuments}
              </Link>
              <span className="font-mono text-[11px] text-[#67e8f9]">
                {diff.countryB.bindingLawCount} law
              </span>
            </div>
          </div>
        </section>

        {/* 8-Frame Delta Butterfly Chart */}
        <section
          aria-label="Eight-frame butterfly comparison"
          className="mt-4 rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-2">
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
              eight-frame framing delta · {diff.countryA.shortName} vs{" "}
              {diff.countryB.shortName}
            </h2>
            <p className="font-mono text-[11px] text-[#94a3b8]">
              sorted by largest bilateral framing gap (percentage points)
            </p>
          </header>

          <div className="mt-3 flex flex-col gap-2">
            {diff.frameDeltas.map((row) => {
              const widthA = Math.round((row.shareA / maxFrameVal) * 100);
              const widthB = Math.round((row.shareB / maxFrameVal) * 100);
              const deltaLabel =
                row.delta === 0
                  ? "0pp"
                  : row.delta > 0
                    ? `${diff.countryA.shortName} +${row.delta}pp`
                    : `${diff.countryB.shortName} +${Math.abs(row.delta)}pp`;
              return (
                <div
                  key={row.frame}
                  className="grid grid-cols-1 items-center gap-2 rounded-[2px] border border-white/5 bg-[#0a0f18] px-3 py-2 md:grid-cols-[210px_minmax(0,1fr)_115px]"
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-[1px]"
                      style={{ background: frameHue[row.frame] }}
                    />
                    <span
                      className="font-mono text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: frameTextHue[row.frame] }}
                    >
                      {frameAbbr[row.frame]}
                    </span>
                    <span className="truncate text-[12px] text-[#f1f5f9]">
                      {row.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-[44px_1fr_1px_1fr_44px] items-center gap-2">
                    <span className="text-right font-mono text-[11px] tabular-nums text-[#f1f5f9]">
                      {row.shareA}%
                    </span>
                    <div className="flex justify-end bg-white/5">
                      <div
                        className="h-2.5 rounded-l-[1px]"
                        style={{
                          width: `${Math.max(widthA, row.shareA > 0 ? 4 : 0)}%`,
                          background: frameHue[row.frame],
                        }}
                      />
                    </div>
                    <div aria-hidden className="h-4 bg-white/25" />
                    <div className="flex justify-start bg-white/5">
                      <div
                        className="h-2.5 rounded-r-[1px]"
                        style={{
                          width: `${Math.max(widthB, row.shareB > 0 ? 4 : 0)}%`,
                          background: frameHue[row.frame],
                          opacity: 0.78,
                        }}
                      />
                    </div>
                    <span className="font-mono text-[11px] tabular-nums text-[#f1f5f9]">
                      {row.shareB}%
                    </span>
                  </div>

                  <p className="text-right font-mono text-[11px] font-semibold uppercase tracking-wider text-[#cbd5e1] tabular-nums">
                    {deltaLabel}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-2.5 flex justify-between font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
            <span>← {diff.countryA.name} share (%)</span>
            <span>{diff.countryB.name} share (%) →</span>
          </div>
        </section>

        {/* B7: Strictly Label-Conditioned Same Rule / Same Reason Cards */}
        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* Same Rule, Different Reason */}
          <div className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
            <header className="border-b border-white/10 pb-2.5">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#38bdf8]">
                fragile alignment · label-conditioned
              </p>
              <h2 className="mt-0.5 text-[16px] font-semibold text-[#f1f5f9]">
                Same Rule, Different Reason
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-[#94a3b8]">
                For each safeguard requirement present in ≥ 2 instruments on
                both sides, compares the framing distribution{" "}
                <strong className="font-medium text-[#cbd5e1]">
                  strictly within documents carrying that rule
                </strong>
                .
              </p>
            </header>

            <div className="mt-3 flex flex-col gap-3">
              {diff.sameRuleDifferentReason.length === 0 ? (
                <p className="text-[13px] text-[#94a3b8]">
                  No shared safeguard requirement (≥ 2 documents each) exhibits
                  meaningful conditional framing divergence between{" "}
                  {diff.countryA.shortName} and {diff.countryB.shortName} in
                  this scope.
                </p>
              ) : (
                diff.sameRuleDifferentReason.map((item) => (
                  <article
                    key={item.requirementKey}
                    className="rounded-[2px] border border-white/10 bg-[#0a0f18] p-3.5"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-[14px] font-semibold text-[#f1f5f9]">
                        {item.requirementLabel}
                      </h3>
                      <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
                        <span className="text-[#cbd5e1]">
                          {diff.countryA.shortName} n={item.nA} ·{" "}
                          {diff.countryB.shortName} n={item.nB}
                        </span>
                        <span className="rounded-[2px] border border-[#38bdf8]/40 bg-[#38bdf8]/10 px-1.5 py-0.5 text-[#67e8f9]">
                          cond. FRM {item.conditionalFramingDistance}
                        </span>
                        {item.lowSample ? (
                          <span className="rounded-[2px] border border-[#e6ae49]/40 bg-[#e6ae49]/10 px-1.5 py-0.5 text-[#e6ae49]">
                            low n
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px]">
                      <span
                        className="rounded-[2px] border border-white/10 px-2 py-0.5"
                        style={{
                          color: frameTextHue[item.conditionalLeadingFrameA],
                        }}
                      >
                        {diff.countryA.shortName}:{" "}
                        {frameLabels[item.conditionalLeadingFrameA]} (
                        {item.conditionalLeadingShareA}%)
                      </span>
                      <span className="text-[#94a3b8]">vs</span>
                      <span
                        className="rounded-[2px] border border-white/10 px-2 py-0.5"
                        style={{
                          color: frameTextHue[item.conditionalLeadingFrameB],
                        }}
                      >
                        {diff.countryB.shortName}:{" "}
                        {frameLabels[item.conditionalLeadingFrameB]} (
                        {item.conditionalLeadingShareB}%)
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                      <EvidenceMiniBox
                        shortName={diff.countryA.shortName}
                        evidence={item.evidenceA}
                      />
                      <EvidenceMiniBox
                        shortName={diff.countryB.shortName}
                        evidence={item.evidenceB}
                      />
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>

          {/* Same Reason, Different Rule */}
          <div className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
            <header className="border-b border-white/10 pb-2.5">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#67e8f9]">
                convergence candidates · label-conditioned
              </p>
              <h2 className="mt-0.5 text-[16px] font-semibold text-[#f1f5f9]">
                Same Reason, Different Rule
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-[#94a3b8]">
                For each framing rationale leading ≥ 2 instruments on both
                sides, compares statutory binding share and distinctive
                safeguards{" "}
                <strong className="font-medium text-[#cbd5e1]">
                  strictly within documents led by that frame
                </strong>
                .
              </p>
            </header>

            <div className="mt-3 flex flex-col gap-3">
              {diff.sameReasonDifferentRule.length === 0 ? (
                <p className="text-[13px] text-[#94a3b8]">
                  No risk frame leads at least 2 instruments on both sides in
                  this scope. Switch to Full Corpus to widen the sample.
                </p>
              ) : (
                diff.sameReasonDifferentRule.map((item) => (
                  <article
                    key={item.frame}
                    className="rounded-[2px] border border-white/10 bg-[#0a0f18] p-3.5"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3
                        className="text-[14px] font-semibold"
                        style={{ color: frameTextHue[item.frame] }}
                      >
                        {frameAbbr[item.frame]} · {item.frameLabel}
                      </h3>
                      <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
                        <span className="text-[#cbd5e1]">
                          {diff.countryA.shortName} n={item.nA} ·{" "}
                          {diff.countryB.shortName} n={item.nB}
                        </span>
                        {item.lowSample ? (
                          <span className="rounded-[2px] border border-[#e6ae49]/40 bg-[#e6ae49]/10 px-1.5 py-0.5 text-[#e6ae49]">
                            low n
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <p className="mt-1.5 text-[13px] text-[#e2e8f0]">
                      {item.bindingLeadLabel}
                    </p>

                    <div className="mt-2 grid gap-2 text-[12px] text-[#94a3b8] sm:grid-cols-2">
                      <div>
                        <span className="font-semibold text-[#f1f5f9]">
                          {diff.countryA.shortName} distinctive rules:{" "}
                        </span>
                        {item.distinctiveRulesA.join(", ") || "no ≥12pp lead"}
                      </div>
                      <div>
                        <span className="font-semibold text-[#f1f5f9]">
                          {diff.countryB.shortName} distinctive rules:{" "}
                        </span>
                        {item.distinctiveRulesB.join(", ") || "no ≥12pp lead"}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                      <EvidenceMiniBox
                        shortName={diff.countryA.shortName}
                        evidence={item.evidenceA}
                      />
                      <EvidenceMiniBox
                        shortName={diff.countryB.shortName}
                        evidence={item.evidenceB}
                      />
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Detailed Policy Structure Comparison Tables */}
        <section className="mt-4 grid gap-4 lg:grid-cols-3">
          <MetricComparisonTable
            title="safeguard requirements (45% of POL)"
            shortA={diff.countryA.shortName}
            shortB={diff.countryB.shortName}
            rows={diff.requirementRows.slice(0, 12)}
          />
          <MetricComparisonTable
            title="enforcement mechanisms (30% of POL)"
            shortA={diff.countryA.shortName}
            shortB={diff.countryB.shortName}
            rows={diff.enforcementRows}
          />
          <MetricComparisonTable
            title="binding strength (25% of POL)"
            shortA={diff.countryA.shortName}
            shortB={diff.countryB.shortName}
            rows={diff.bindingRows}
          />
        </section>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
          <span>
            Project Babel · bilateral comparison · {diff.countryA.shortName} vs{" "}
            {diff.countryB.shortName} · scope {mode}
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

function ScoreCard({
  label,
  value,
  color,
  detail,
}: {
  label: string;
  value: number;
  color: string;
  detail: string;
}) {
  return (
    <div className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
        {label}
      </p>
      <p
        className="mt-1.5 font-mono text-[28px] font-semibold leading-none tabular-nums"
        style={{ color }}
      >
        {value}
      </p>
      <p className="mt-2 font-mono text-[11px] text-[#94a3b8]">{detail}</p>
    </div>
  );
}

function EvidenceMiniBox({
  shortName,
  evidence,
}: {
  shortName: string;
  evidence: EvidenceContrast | null;
}) {
  if (!evidence) {
    return (
      <div className="rounded-[2px] border border-white/10 bg-[#0f1623] p-3 text-[12px] text-[#94a3b8]">
        {shortName}: no verbatim evidence span matched to this exact label.
      </div>
    );
  }
  const cjk = isCjkText(evidence.quote);
  const lang = toHtmlLang(evidence.languageCode);
  return (
    <div className="rounded-[2px] border border-white/10 bg-[#0f1623] p-3">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">
        {shortName} · {evidence.bindingStrength}
      </p>
      <blockquote
        lang={lang}
        className={`mt-1.5 line-clamp-4 text-[12px] leading-relaxed text-[#e2e8f0] ${
          cjk ? "not-italic" : "italic"
        }`}
      >
        &ldquo;{evidence.quote}&rdquo;
      </blockquote>
      {evidence.quoteEn ? (
        <p className="mt-1 line-clamp-3 text-[12px] leading-snug text-[#94a3b8]">
          <span className="mr-1 rounded-[2px] border border-white/15 px-1 py-0.5 font-mono text-[11px] uppercase">
            MT
          </span>
          {evidence.quoteEn}
        </p>
      ) : null}
      <Link
        href={`/documents/${encodeURIComponent(evidence.documentId)}`}
        lang={lang}
        className="mt-2 block truncate text-[11px] text-[#67e8f9] underline decoration-[#67e8f9]/40 underline-offset-2 hover:text-white"
      >
        {evidence.title} →
      </Link>
    </div>
  );
}

function MetricComparisonTable({
  title,
  shortA,
  shortB,
  rows,
}: {
  title: string;
  shortA: string;
  shortB: string;
  rows: BilateralMetricRow[];
}) {
  return (
    <div className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
      <h2 className="border-b border-white/10 pb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">
        {title}
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-white/10 font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
              <th className="pb-1.5 font-medium">dimension</th>
              <th className="pb-1.5 text-right font-medium">{shortA}</th>
              <th className="pb-1.5 text-right font-medium">{shortB}</th>
              <th className="pb-1.5 text-right font-medium">Δ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="py-1.5 pr-2 text-[#f1f5f9]">{row.label}</td>
                <td className="py-1.5 text-right font-mono tabular-nums text-[#cbd5e1]">
                  {row.shareA}%
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums text-[#cbd5e1]">
                  {row.shareB}%
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums text-[#94a3b8]">
                  {row.delta > 0 ? `+${row.delta}` : row.delta}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
