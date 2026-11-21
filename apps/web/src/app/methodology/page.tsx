import type { Metadata } from "next";
import Link from "next/link";

import { CopyButton } from "@/app/_components/copy-button";
import { TopNav } from "@/app/_components/top-nav";
import { formatObservatoryBibtex } from "@/lib/export-formatters";
import {
  frameAbbr,
  frameDefinition,
  frameHue,
  frameTextHue,
  scoreHexDark,
} from "@/lib/frame-vocab";
import { getOverviewData } from "@/lib/overview-data";
import {
  BOOTSTRAP_RESAMPLES,
  COMPOSITE_WEIGHTS,
  FRAME_MENTION_FLOOR,
  LOW_CONFIDENCE_FRAMING_THRESHOLD,
  LOW_CONFIDENCE_POLICY_THRESHOLD,
  PERMUTATION_DRAWS,
  POLICY_COMPONENT_WEIGHTS,
} from "@/lib/scoring";
import { allFrameLabels, frameLabels } from "@/lib/seed-data";
import {
  BINDING_LEVEL_LABELS,
  CANONICAL_THRESHOLDS,
  TAXONOMY_SCHEMA_VERSION,
} from "@/lib/taxonomy-vocab";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Methodology, Validation & Scoring · Project Babel",
  description:
    "Exact Total Variation Distance and Regime Coverage Index equations, bootstrap uncertainty intervals, label-permutation null baselines, weight sensitivity stability, machine-coding disclosures, codebook v2.1.0, and BibTeX citation.",
  alternates: { canonical: "/methodology" },
};

export default async function MethodologyPage() {
  const [headline, all] = await Promise.all([
    getOverviewData("headline"),
    getOverviewData("all"),
  ]);

  const bibtex = formatObservatoryBibtex({
    datasetVersion: headline.datasetVersion,
    latestPublicationDate: headline.snapshotDate,
    documentCount: headline.summary.publishedSources,
    taxonomyVersion: headline.taxonomyVersion,
  });

  const prov = headline.provenanceSummary;
  const nullCal = headline.nullCalibration;

  return (
    <main className="min-h-screen bg-[#0a0f18] font-sans text-[14px] text-[#cdd6e1]">
      <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6 lg:px-8">
        <TopNav active="methodology" />

        <header className="border-y border-white/20 py-7 text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">
            PROJECT BABEL · METHODOLOGY, VALIDATION &amp; REPRODUCIBILITY
          </p>
          <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.01em] text-[#f1f5f9]">
            Scoring Engine, Statistical Calibration &amp; Codebook v
            {TAXONOMY_SCHEMA_VERSION}
          </h1>
          <p className="mx-auto mt-2.5 max-w-[840px] text-[14px] leading-relaxed text-[#cbd5e1]">
            Every index number on Project Babel is deterministically computed
            from official government texts with zero black-box rank stretching,
            bootstrap uncertainty intervals, permutation null baselines, and
            transparent four-specification sensitivity checks.
          </p>
        </header>

        {/* 1. Machine Coding Disclosure, Live Provenance & Validation Status (B1, A8) */}
        <section
          id="validation"
          className="mt-4 rounded-sm border border-[#38bdf8]/30 bg-[#0f1623] px-5 py-4"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-2.5">
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#38bdf8]">
              1. Machine-Coding Disclosure, Live Provenance &amp; Validation
              Status
            </h2>
            <span className="font-mono text-[11px] text-[#94a3b8]">
              snapshot {headline.datasetVersion} · artifacts v
              {headline.taxonomyVersion}
            </span>
          </header>

          <div className="mt-3 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <div className="space-y-2.5 text-[13px] leading-relaxed text-[#cbd5e1]">
              <p>
                <strong className="font-semibold text-[#f1f5f9]">
                  Automated extraction disclosure:
                </strong>{" "}
                All structured labels and evidence quotes currently displayed in
                the observatory are{" "}
                <strong className="font-medium text-[#f8fafc]">
                  machine-coded using Anthropic Claude Sonnet 4.6 without an
                  active human review queue
                </strong>
                . Confidence scores displayed across the site are{" "}
                <strong className="font-medium text-[#f8fafc]">
                  model self-reported estimates
                </strong>{" "}
                (flagged as low-confidence below{" "}
                <code className="font-mono text-[12px] text-[#e2e8f0]">
                  {LOW_CONFIDENCE_POLICY_THRESHOLD.toFixed(2)}
                </code>{" "}
                for policy extraction or{" "}
                <code className="font-mono text-[12px] text-[#e2e8f0]">
                  {LOW_CONFIDENCE_FRAMING_THRESHOLD.toFixed(2)}
                </code>{" "}
                for risk framing), separate from mechanical substring quote
                grounding (pass threshold{" "}
                <code className="font-mono text-[12px] text-[#e2e8f0]">
                  ≥ {Math.round(CANONICAL_THRESHOLDS.groundingPass * 100)}%
                </code>
                ).
              </p>
              <p>
                <strong className="font-semibold text-[#f1f5f9]">
                  Authoritative legal bindingness:
                </strong>{" "}
                A document&apos;s binding tier (e.g.{" "}
                <code className="font-mono text-[12px] text-[#e2e8f0]">
                  binding_law
                </code>{" "}
                vs.{" "}
                <code className="font-mono text-[12px] text-[#e2e8f0]">
                  regulatory_guidance
                </code>
                ) is sourced from curated source-manifest metadata first so the
                model cannot misclassify binding statutes as voluntary guidance;
                model suggestions are preserved separately when they differ.
              </p>
              <p>
                <strong className="font-semibold text-[#f1f5f9]">
                  Starter evaluation benchmark:
                </strong>{" "}
                An internal starter gold set (
                <code className="font-mono text-[12px] text-[#e2e8f0]">
                  data/eval/gold_set_v1.json
                </code>
                , status{" "}
                <code className="font-mono text-[12px] text-[#e2e8f0]">
                  starter_v0.1_internal
                </code>
                , 5 multilingual reference instruments across US, EU, KR, JP,
                and CN) establishes the automated regression scaffold. Full
                blind dual-annotator inter-rater reliability (Krippendorff&apos;s
                α / Cohen&apos;s κ) across a stratified sample has not yet been
                published.
              </p>
            </div>

            <div className="rounded-[2px] border border-white/10 bg-[#0a0f18] p-3.5">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">
                live corpus provenance readout
              </p>
              <dl className="mt-2.5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[12px]">
                <dt className="text-[#94a3b8]">Total analyzed instruments</dt>
                <dd className="font-mono tabular-nums text-[#f1f5f9]">
                  {prov.totalAnalyzed}
                </dd>
                <dt className="text-[#94a3b8]">
                  Active primary (headline scope)
                </dt>
                <dd className="font-mono tabular-nums text-[#38bdf8]">
                  {prov.headlineIncluded}
                </dd>
                <dt className="text-[#94a3b8]">
                  Legacy v1 extractions (pre-metadata)
                </dt>
                <dd className="font-mono tabular-nums text-[#e6ae49]">
                  {prov.legacyCount}
                </dd>
                <dt className="text-[#94a3b8]">
                  v2.x extractions (full provenance)
                </dt>
                <dd className="font-mono tabular-nums text-[#67e8f9]">
                  {prov.v2Count}
                </dd>
                <dt className="text-[#94a3b8]">Artifact taxonomy versions</dt>
                <dd className="font-mono text-[#e2e8f0]">
                  {prov.taxonomyVersions.join(", ") || "none"}
                </dd>
                <dt className="text-[#94a3b8]">Recorded models</dt>
                <dd className="font-mono text-[#e2e8f0]">
                  {prov.models.join(", ") || "claude-sonnet-4-6 (legacy)"}
                </dd>
                <dt className="text-[#94a3b8]">Persisted grounding ratio</dt>
                <dd className="font-mono tabular-nums text-[#e2e8f0]">
                  {prov.meanGroundingRatio !== null
                    ? `${Math.round(prov.meanGroundingRatio * 100)}% (n=${prov.groundingSampleCount})`
                    : "pending v2 re-run (live client verification active)"}
                </dd>
              </dl>
            </div>
          </div>
        </section>

        {/* 2. Equations & Population Filter + Null Calibration (B2, B3, B4) */}
        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-sm border border-white/10 bg-[#0f1623] px-5 py-4">
            <h2 className="border-b border-white/10 pb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
              2. Divergence &amp; Regime Coverage Equations
            </h2>
            <div className="mt-3 space-y-3 text-[13px] leading-relaxed text-[#cbd5e1]">
              <p>
                Headline scores follow{" "}
                <strong className="font-medium text-[#f1f5f9]">
                  Codebook §8.2
                </strong>
                : strictly filtered to{" "}
                <code className="font-mono text-[12px] text-[#e2e8f0]">
                  corpus_role = primary_instrument
                </code>{" "}
                and{" "}
                <code className="font-mono text-[12px] text-[#e2e8f0]">
                  lifecycle_stage ∈ &#123;active, adopted_not_yet_effective&#125;
                </code>
                . Unclassified rows are excluded from headline calculations
                rather than silently promoted.
              </p>
              <pre className="overflow-x-auto rounded-[2px] border border-white/10 bg-[#0a0f18] p-3 font-mono text-[11px] leading-relaxed text-[#f1f5f9]">
{`TVD(p, q) = 50 × Σ |p(k) − q(k)|                     ∈ [0, 100]

POL(J)    = ${POLICY_COMPONENT_WEIGHTS.requirements.toFixed(2)} × TVD(Req_J,  PeerMean(Req))
          + ${POLICY_COMPONENT_WEIGHTS.enforcement.toFixed(2)} × TVD(Enf_J,  PeerMean(Enf))
          + ${POLICY_COMPONENT_WEIGHTS.binding.toFixed(2)} × TVD(Bind_J, PeerMean(Bind))

FRM(J)    = TVD(Frame_J, PeerMean(Frame))            (floor ≥ ${FRAME_MENTION_FLOOR.toFixed(2)})

COV_L1(J) = 100 × (1 / 25) × Σ |L_J(c) − PeerMean(L(c))| / 4

CMP(J)    = round(${COMPOSITE_WEIGHTS.policy.toFixed(2)} × POL(J) + ${COMPOSITE_WEIGHTS.framing.toFixed(2)} × FRM(J))`}
              </pre>
              <ul className="list-disc space-y-1.5 pl-4 text-[12px] text-[#94a3b8]">
                <li>
                  <strong className="text-[#e2e8f0]">
                    Noise floor &amp; simplex framing (B3):
                  </strong>{" "}
                  When explicit{" "}
                  <code className="font-mono text-[#cbd5e1]">frame_share</code>{" "}
                  is present, it is used directly; otherwise{" "}
                  <code className="font-mono text-[#cbd5e1]">
                    frame_confidence &lt; {FRAME_MENTION_FLOOR.toFixed(2)}
                  </code>{" "}
                  values are zeroed before per-document normalization so
                  residual background scores do not flatten country contrasts.
                </li>
                <li>
                  <strong className="text-[#e2e8f0]">
                    Symmetric absence handling (B4):
                  </strong>{" "}
                  Documents with no explicit enforcement mechanisms contribute
                  explicitly to{" "}
                  <code className="font-mono text-[#cbd5e1]">
                    none_specified
                  </code>{" "}
                  rather than dropping out of the denominator.
                </li>
                <li>
                  <strong className="text-[#e2e8f0]">
                    Regime Coverage Index (COV L1):
                  </strong>{" "}
                  Evaluates the strongest legal binding level{" "}
                  <code className="font-mono text-[#cbd5e1]">L ∈ &#123;0..4&#125;</code>{" "}
                  across all 17 requirements and 8 active enforcement controls —
                  invariant to how many guidance documents a government
                  publishes.
                </li>
                <li>
                  <strong className="text-[#e2e8f0]">
                    Hamilton apportionment:
                  </strong>{" "}
                  All 8-frame percentages use Largest Remainder rounding so
                  displayed shares always sum to exact 100%.
                </li>
              </ul>
            </div>
          </div>

          <div className="rounded-sm border border-white/10 bg-[#0f1623] px-5 py-4">
            <h2 className="border-b border-white/10 pb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
              3. Bootstrap 90% CIs &amp; Label-Permutation Null Calibration
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-[#cbd5e1]">
              Small document samples naturally exhibit non-zero Total Variation
              Distance even under random assignment. To avoid over-interpreting
              sampling noise, the engine runs{" "}
              <strong className="text-[#f1f5f9]">
                {BOOTSTRAP_RESAMPLES} seeded within-jurisdiction bootstrap
                resamples
              </strong>{" "}
              for 90% confidence intervals alongside{" "}
              <strong className="text-[#f1f5f9]">
                {PERMUTATION_DRAWS} random jurisdiction-label permutations
              </strong>{" "}
              preserving exact document counts per country.
            </p>

            {/* Live Null Calibration Table */}
            <div className="mt-3 overflow-x-auto rounded-[2px] border border-white/10 bg-[#0a0f18] p-3">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">
                live permutation null baseline ({nullCal.permutations} draws ·
                headline scope)
              </p>
              <table className="mt-2 w-full text-left font-mono text-[12px]">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase text-[#94a3b8]">
                    <th className="pb-1.5 font-medium">dimension</th>
                    <th className="pb-1.5 text-right font-medium">
                      country mean / p90
                    </th>
                    <th className="pb-1.5 text-right font-medium">
                      pairwise mean / p90
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr>
                    <td className="py-1.5 text-[#f1f5f9]">Policy (POL)</td>
                    <td className="py-1.5 text-right tabular-nums text-[#cbd5e1]">
                      {nullCal.countryPolicyMean} / {nullCal.countryPolicyP90}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-[#cbd5e1]">
                      {nullCal.pairwisePolicyMean} / {nullCal.pairwisePolicyP90}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-[#f1f5f9]">Framing (FRM)</td>
                    <td className="py-1.5 text-right tabular-nums text-[#cbd5e1]">
                      {nullCal.countryFramingMean} / {nullCal.countryFramingP90}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-[#cbd5e1]">
                      {nullCal.pairwiseFramingMean} /{" "}
                      {nullCal.pairwiseFramingP90}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-[#f1f5f9]">Composite (CMP)</td>
                    <td className="py-1.5 text-right tabular-nums text-[#cbd5e1]">
                      {nullCal.countryCompositeMean} /{" "}
                      {nullCal.countryCompositeP90}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-[#cbd5e1]">
                      {nullCal.pairwiseCompositeMean} /{" "}
                      {nullCal.pairwiseCompositeP90}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Regime coverage 0..4 scale */}
            <div className="mt-3 rounded-[2px] border border-white/10 bg-[#0a0f18] p-3">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">
                ordinal binding scale (0–4 · COV L1 &amp; /matrix)
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] sm:grid-cols-3">
                {[0, 1, 2, 3, 4].map((lvl) => (
                  <div key={lvl} className="flex items-center gap-1.5">
                    <dt className="font-semibold text-[#67e8f9]">L{lvl}</dt>
                    <dd className="text-[#cbd5e1]">
                      {BINDING_LEVEL_LABELS[lvl]}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* 4. Weight Sensitivity & Spearman Rank Stability Grid (B10) */}
        <section className="mt-4 rounded-sm border border-white/10 bg-[#0f1623] px-5 py-4">
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-2.5">
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
              4. Four-Specification Sensitivity &amp; Spearman Rank Stability
              Grid
            </h2>
            <p className="font-mono text-[11px] text-[#94a3b8]">
              tests whether jurisdiction rankings hold across weighting &amp;
              population choices
            </p>
          </header>

          {headline.sensitivityGrid.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left font-mono text-[12px]">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-[#94a3b8]">
                    <th className="pb-2 pr-3 font-medium">specification</th>
                    {headline.countries.map((c) => (
                      <th
                        key={c.slug}
                        className="pb-2 px-2 text-right font-medium"
                      >
                        {c.shortName}
                      </th>
                    ))}
                    <th className="pb-2 pl-3 text-right font-medium">
                      Spearman ρ vs. headline
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {headline.sensitivityGrid.map((row) => (
                    <tr key={row.modeId} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 pr-3">
                        <p className="font-sans text-[13px] font-medium text-[#f1f5f9]">
                          {row.label}
                        </p>
                        <p className="font-sans text-[12px] text-[#94a3b8]">
                          {row.description}
                        </p>
                      </td>
                      {headline.countries.map((c) => (
                        <td
                          key={c.slug}
                          className="py-2.5 px-2 text-right tabular-nums text-[#e2e8f0]"
                        >
                          {row.scoresByJurisdiction[c.slug] ?? "—"}
                        </td>
                      ))}
                      <td className="py-2.5 pl-3 text-right font-semibold tabular-nums text-[#67e8f9]">
                        {row.spearmanVsHeadline.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-[13px] text-[#94a3b8]">
              Sensitivity grid unavailable while corpus is empty.
            </p>
          )}
        </section>

        {/* 5. Live Jurisdiction Diagnostics & Bootstrap CIs */}
        <section className="mt-4 rounded-sm border border-white/10 bg-[#0f1623] px-5 py-4">
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-2.5">
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
              5. Live Corpus Diagnostics &amp; 90% Bootstrap Confidence
              Intervals
            </h2>
            <p className="font-mono text-[11px] text-[#94a3b8]">
              low self-rep conf: policy &lt;{" "}
              {Math.round(LOW_CONFIDENCE_POLICY_THRESHOLD * 100)}% or framing
              &lt; {Math.round(LOW_CONFIDENCE_FRAMING_THRESHOLD * 100)}%
            </p>
          </header>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left font-mono text-[12px]">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-[#94a3b8]">
                  <th className="pb-2 pr-3 font-medium">jurisdiction</th>
                  <th className="pb-2 pr-3 text-right font-medium">
                    primary / corpus
                  </th>
                  <th className="pb-2 pr-3 text-right font-medium">
                    binding law
                  </th>
                  <th className="pb-2 pr-3 text-right font-medium">
                    POL [90% CI]
                  </th>
                  <th className="pb-2 pr-3 text-right font-medium">
                    FRM [90% CI]
                  </th>
                  <th className="pb-2 pr-3 text-right font-medium">COV L1</th>
                  <th className="pb-2 pr-3 text-right font-medium">
                    all-corpus CMP
                  </th>
                  <th className="pb-2 text-right font-medium">latest pub</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {headline.countries.map((hCountry) => {
                  const aCountry = all.countries.find(
                    (c) => c.slug === hCountry.slug,
                  );
                  return (
                    <tr key={hCountry.slug}>
                      <td className="py-2 pr-3 font-sans font-medium text-[#f1f5f9]">
                        <Link
                          href={`/jurisdictions/${hCountry.slug}`}
                          className="underline decoration-white/25 underline-offset-2 hover:text-[#67e8f9]"
                        >
                          {hCountry.shortName} · {hCountry.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-[#cbd5e1]">
                        {hCountry.reviewedDocuments}/
                        {hCountry.totalCorpusDocuments}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-[#67e8f9]">
                        {hCountry.bindingLawCount}
                      </td>
                      <td
                        className="py-2 pr-3 text-right font-semibold tabular-nums"
                        style={{
                          color: scoreHexDark(
                            hCountry.policyDivergence,
                            nullCal.countryPolicyMean,
                            nullCal.countryPolicyP90,
                            "country",
                          ),
                        }}
                      >
                        {hCountry.policyDivergence}{" "}
                        <span className="font-normal text-[#94a3b8]">
                          [{hCountry.policyCI.low}–{hCountry.policyCI.high}]
                        </span>
                      </td>
                      <td
                        className="py-2 pr-3 text-right font-semibold tabular-nums"
                        style={{
                          color: scoreHexDark(
                            hCountry.framingDivergence,
                            nullCal.countryFramingMean,
                            nullCal.countryFramingP90,
                            "country",
                          ),
                        }}
                      >
                        {hCountry.framingDivergence}{" "}
                        <span className="font-normal text-[#94a3b8]">
                          [{hCountry.framingCI.low}–{hCountry.framingCI.high}]
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-[#e2e8f0]">
                        {hCountry.coverageDivergence}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-[#94a3b8]">
                        {aCountry?.compositeDivergence ?? "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-[#94a3b8]">
                        {hCountry.latestPublicationDate}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* 6. Eight-frame codebook v2.1.0 reference (A13) */}
        <section className="mt-4 rounded-sm border border-white/10 bg-[#0f1623] px-5 py-4">
          <h2 className="border-b border-white/10 pb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
            6. The Eight Risk Framing Labels (Codebook v
            {TAXONOMY_SCHEMA_VERSION} · Include / Exclude Rules)
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {allFrameLabels.map((frame) => (
              <article
                key={frame}
                className="rounded-[2px] border border-white/10 bg-[#0a0f18] p-3.5"
                style={{ borderLeft: `3px solid ${frameHue[frame]}` }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3
                    className="text-[14px] font-semibold"
                    style={{ color: frameTextHue[frame] }}
                  >
                    {frameLabels[frame]}
                  </h3>
                  <span className="font-mono text-[11px] font-semibold text-[#94a3b8]">
                    {frameAbbr[frame]}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] font-medium text-[#f1f5f9]">
                  {frameDefinition[frame].short}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#cbd5e1]">
                  {frameDefinition[frame].long}
                </p>
                <div className="mt-2.5 space-y-1 border-t border-white/10 pt-2 text-[12px] leading-snug">
                  <p className="text-[#cbd5e1]">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-[#67e8f9]">
                      include:{" "}
                    </span>
                    {frameDefinition[frame].includeWhen}
                  </p>
                  <p className="text-[#94a3b8]">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
                      exclude:{" "}
                    </span>
                    {frameDefinition[frame].excludeWhen}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* 7. Public Read-Only API & Versioned BibTeX Citation (C8) */}
        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-sm border border-white/10 bg-[#0f1623] px-5 py-4">
            <h2 className="border-b border-white/10 pb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
              7. Public Read-Only API &amp; Research Exports (CORS-Enabled)
            </h2>
            <ul className="mt-3 space-y-2 text-[12px]">
              {[
                {
                  path: "/api/overview?mode=headline",
                  desc: "Full overview snapshot, POL/FRM/COV scores, 90% CIs, null calibration, sensitivity grid & timeline",
                },
                {
                  path: "/api/matrix?mode=headline",
                  desc: "25×5 AI Legal Obligation & Clause Matrix with strongest binding level (0–4) and quoted instruments",
                },
                {
                  path: "/api/jurisdictions",
                  desc: "All five jurisdiction profiles, CIs & bilateral matrix",
                },
                {
                  path: "/api/jurisdictions/china",
                  desc: "Single jurisdiction readout, narrative synthesis & latest documents",
                },
                {
                  path: "/api/documents?j=european-union&role=primary_instrument",
                  desc: "Filterable corpus index (supports j, s, f, b, role, life, t, r, q)",
                },
                {
                  path: "/api/export?format=csv",
                  desc: "UTF-8 BOM CSV with canonical taxonomy keys, all 8 frame columns, provenance & JSON/BibTeX options",
                },
              ].map((ep) => (
                <li
                  key={ep.path}
                  className="rounded-[2px] border border-white/10 bg-[#0a0f18] px-3 py-2"
                >
                  <a
                    href={ep.path}
                    className="font-mono text-[12px] font-semibold text-[#67e8f9] hover:underline"
                  >
                    GET {ep.path}
                  </a>
                  <p className="mt-0.5 text-[12px] text-[#94a3b8]">{ep.desc}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-sm border border-white/10 bg-[#0f1623] px-5 py-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
                8. Cite Project Babel (Versioned BibTeX)
              </h2>
              <CopyButton text={bibtex} label="copy bibtex" />
            </div>
            <pre className="mt-3 overflow-x-auto rounded-[2px] border border-white/10 bg-[#0a0f18] p-3 font-mono text-[11px] leading-relaxed text-[#f1f5f9]">
              {bibtex}
            </pre>
            <div className="mt-3 flex flex-wrap gap-2 font-mono text-[11px] uppercase tracking-wider">
              <a
                href="/api/export?format=bibtex"
                className="rounded-[2px] border border-white/20 px-2.5 py-1 text-[#cbd5e1] hover:border-white/40 hover:text-white"
              >
                download full corpus .bib ↓
              </a>
              <a
                href="/api/export?format=csv"
                className="rounded-[2px] border border-white/20 px-2.5 py-1 text-[#cbd5e1] hover:border-white/40 hover:text-white"
              >
                download .csv (BOM) ↓
              </a>
              <a
                href="/api/export?format=json"
                className="rounded-[2px] border border-white/20 px-2.5 py-1 text-[#cbd5e1] hover:border-white/40 hover:text-white"
              >
                download .json ↓
              </a>
            </div>
          </div>
        </section>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
          <span>
            Project Babel · artifacts v{headline.taxonomyVersion} · snapshot{" "}
            {headline.datasetVersion} · corpus window{" "}
            {headline.corpusWindow.label}
          </span>
          <Link href="/" className="transition-colors hover:text-[#f1f5f9]">
            ← back to overview
          </Link>
        </footer>
      </div>
    </main>
  );
}
