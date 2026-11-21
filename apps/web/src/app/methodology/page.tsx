import type { Metadata } from "next";
import Link from "next/link";

import { CopyButton } from "@/app/_components/copy-button";
import { TopNav } from "@/app/_components/top-nav";
import { getGoldSetEvaluation } from "@/lib/eval-data";
import { getEvolutionData } from "@/lib/evolution-data";
import { formatObservatoryBibtex } from "@/lib/export-formatters";
import {
  frameAbbr,
  frameDefinition,
  frameHue,
  frameTextHue,
  scoreHexDark,
} from "@/lib/frame-vocab";
import { jurisdictionMeta, type JurisdictionKey } from "@/lib/jurisdictions";
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
  formatModelDisplayName,
  formatModelList,
  humanizeEnforcement,
  humanizeRequirement,
  TAXONOMY_SCHEMA_VERSION,
} from "@/lib/taxonomy-vocab";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Methodology, Validation & Scoring · Project Babel",
  description:
    "Exact Total Variation Distance and Regime Coverage Index equations, bootstrap uncertainty intervals, label-permutation null baselines, weight sensitivity stability, machine-coding disclosures, codebook v2.1.0, and BibTeX citation.",
  alternates: { canonical: "/methodology" },
};

function fmtMetric(val: number | null): string {
  return val !== null ? val.toFixed(3) : "—";
}

function fmtCI(ci: [number, number] | null): string {
  return ci ? `[${ci[0].toFixed(3)}, ${ci[1].toFixed(3)}]` : "—";
}

const JURISDICTION_LANG_LABEL: Record<string, string> = {
  united_states: "EN",
  european_union: "EN",
  south_korea: "KO / EN",
  japan: "JA / EN",
  china: "ZH / EN",
};

export default async function MethodologyPage() {
  const [headline, all, goldSet, evolution] = await Promise.all([
    getOverviewData("headline", false),
    getOverviewData("all", false),
    getGoldSetEvaluation(),
    getEvolutionData(false),
  ]);

  const bibtex = formatObservatoryBibtex({
    datasetVersion: headline.datasetVersion,
    latestPublicationDate: headline.snapshotDate,
    documentCount: headline.summary.publishedSources,
    taxonomyVersion: headline.taxonomyVersion,
  });

  const prov = headline.provenanceSummary;
  const nullCal = headline.nullCalibration;
  const activeModelsDisplay = formatModelList(prov.models);
  const isExpandedGoldSet = Boolean(goldSet && goldSet.evaluatedCount >= 10);
  const hasKrippAlpha = Boolean(
    goldSet &&
      (goldSet.dominantFrameKrippendorffsAlpha !== null ||
        goldSet.bindingStrengthKrippendorffsAlpha !== null),
  );
  const totalSubnational = evolution.subnationalCount;
  const totalSupersessions = evolution.supersessionDiffs.length;

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
                  machine-coded using {activeModelsDisplay} without an active
                  human review queue
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
                  {isExpandedGoldSet
                    ? "Stratified multilingual evaluation benchmark:"
                    : "Starter evaluation benchmark:"}
                </strong>{" "}
                {isExpandedGoldSet && goldSet ? (
                  <>
                    Evaluated against a{" "}
                    <strong className="font-medium text-[#f8fafc]">
                      {goldSet.evaluatedCount}-document stratified multilingual
                      gold set
                    </strong>{" "}
                    (status{" "}
                    <code className="font-mono text-[12px] text-[#e2e8f0]">
                      {goldSet.benchmarkStatus}
                    </code>
                    ) spanning US, EU, KR, JP, and CN across EN, KO, JA, and ZH
                    with per-jurisdiction metrics, nominal Krippendorff&apos;s α,
                    Cohen&apos;s κ, and 95% bootstrap confidence intervals.
                    {goldSet.annotatorNote ? ` ${goldSet.annotatorNote}` : ""}
                  </>
                ) : (
                  <>
                    An internal starter gold set (
                    <code className="font-mono text-[12px] text-[#e2e8f0]">
                      data/eval/gold_set_v1.json
                    </code>
                    , status{" "}
                    <code className="font-mono text-[12px] text-[#e2e8f0]">
                      {goldSet?.benchmarkStatus ?? "starter_v0.1_internal"}
                    </code>
                    , {goldSet?.evaluatedCount ?? 5} multilingual reference
                    instruments across US, EU, KR, JP, and CN) establishes the
                    automated regression scaffold. Full blind dual-annotator
                    inter-rater reliability (Krippendorff&apos;s α / Cohen&apos;s
                    κ) across a stratified sample is tracked under active
                    validation expansion.
                  </>
                )}
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
                  {prov.models.length > 0
                    ? prov.models.map((m) => formatModelDisplayName(m)).join(", ")
                    : "unrecorded (legacy v1)"}
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

          {/* Live Gold-Set Benchmark Scorecard (Stage 4A / Phase 5A) */}
          {goldSet ? (
            <div className="mt-4 rounded-[2px] border border-white/10 bg-[#0a0f18] p-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-2">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#67e8f9]">
                  {isExpandedGoldSet
                    ? `stratified multilingual gold-set scorecard · n=${goldSet.evaluatedCount}`
                    : `starter gold-set benchmark scorecard · n=${goldSet.evaluatedCount}`}
                </p>
                <span className="font-mono text-[11px] text-[#94a3b8]">
                  status: {goldSet.benchmarkStatus}
                  {goldSet.model
                    ? ` · ${formatModelDisplayName(goldSet.model)}`
                    : ""}
                  {goldSet.bootstrapIterations > 0
                    ? ` · ${goldSet.bootstrapIterations} bootstrap draws`
                    : ""}
                </span>
              </div>
              <div className="mt-2.5 overflow-x-auto">
                <table className="w-full text-left font-mono text-[12px]">
                  <thead>
                    <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-[#94a3b8]">
                      <th className="pb-1.5 pr-3 font-medium">dimension</th>
                      <th className="pb-1.5 pr-3 text-right font-medium">
                        micro P / R
                      </th>
                      <th className="pb-1.5 pr-3 text-right font-medium">
                        primary metric
                      </th>
                      <th className="pb-1.5 pr-3 text-right font-medium">
                        95% bootstrap CI
                      </th>
                      <th className="pb-1.5 text-right font-medium">
                        {hasKrippAlpha ? "macro F1 / κ · α" : "macro F1 / κ"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    <tr>
                      <td className="py-1.5 pr-3 font-sans text-[#f1f5f9]">
                        Safeguard requirements
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-[#cbd5e1]">
                        {fmtMetric(goldSet.requirementMicroPrecision)} /{" "}
                        {fmtMetric(goldSet.requirementMicroRecall)}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-[#67e8f9]">
                        F1 {fmtMetric(goldSet.requirementMicroF1)}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-[#94a3b8]">
                        {fmtCI(goldSet.bootstrap95CI.requirementMicroF1)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-[#cbd5e1]">
                        macro {fmtMetric(goldSet.requirementMacroF1)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 pr-3 font-sans text-[#f1f5f9]">
                        Enforcement mechanisms
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-[#cbd5e1]">
                        {fmtMetric(goldSet.enforcementMicroPrecision)} /{" "}
                        {fmtMetric(goldSet.enforcementMicroRecall)}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-[#67e8f9]">
                        F1 {fmtMetric(goldSet.enforcementMicroF1)}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-[#94a3b8]">
                        {fmtCI(goldSet.bootstrap95CI.enforcementMicroF1)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-[#cbd5e1]">
                        macro {fmtMetric(goldSet.enforcementMacroF1)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 pr-3 font-sans text-[#f1f5f9]">
                        Dominant risk frame
                      </td>
                      <td className="py-1.5 pr-3 text-right text-[#94a3b8]">
                        —
                      </td>
                      <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-[#38bdf8]">
                        acc {fmtMetric(goldSet.dominantFrameAccuracy)}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-[#94a3b8]">
                        {fmtCI(goldSet.bootstrap95CI.dominantFrameAccuracy)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-[#cbd5e1]">
                        κ {fmtMetric(goldSet.dominantFrameCohensKappa)}
                        {goldSet.dominantFrameKrippendorffsAlpha !== null
                          ? ` · α ${fmtMetric(goldSet.dominantFrameKrippendorffsAlpha)}`
                          : ""}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 pr-3 font-sans text-[#f1f5f9]">
                        Binding strength
                      </td>
                      <td className="py-1.5 pr-3 text-right text-[#94a3b8]">
                        —
                      </td>
                      <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-[#38bdf8]">
                        acc {fmtMetric(goldSet.bindingStrengthAccuracy)}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-[#94a3b8]">
                        {fmtCI(goldSet.bootstrap95CI.bindingStrengthAccuracy)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-[#cbd5e1]">
                        κ {fmtMetric(goldSet.bindingStrengthCohensKappa)}
                        {goldSet.bindingStrengthKrippendorffsAlpha !== null
                          ? ` · α ${fmtMetric(goldSet.bindingStrengthKrippendorffsAlpha)}`
                          : ""}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Per-Jurisdiction Multilingual Breakdown (Phase 5A) */}
              {goldSet.byJurisdiction.length > 0 ? (
                <div className="mt-3.5 border-t border-white/10 pt-3">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">
                    per-jurisdiction &amp; multilingual validation breakdown
                  </p>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-left font-mono text-[12px]">
                      <thead>
                        <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-[#94a3b8]">
                          <th className="pb-1.5 pr-3 font-medium">
                            jurisdiction
                          </th>
                          <th className="pb-1.5 pr-3 font-medium">lang</th>
                          <th className="pb-1.5 pr-3 text-right font-medium">
                            n
                          </th>
                          <th className="pb-1.5 pr-3 text-right font-medium">
                            req F1
                          </th>
                          <th className="pb-1.5 pr-3 text-right font-medium">
                            enf F1
                          </th>
                          <th className="pb-1.5 pr-3 text-right font-medium">
                            frame acc
                          </th>
                          <th className="pb-1.5 text-right font-medium">
                            binding acc
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {goldSet.byJurisdiction.map((row) => {
                          const meta =
                            jurisdictionMeta[
                              row.jurisdiction as JurisdictionKey
                            ];
                          return (
                            <tr key={row.jurisdiction}>
                              <td className="py-1.5 pr-3 font-sans text-[#f1f5f9]">
                                {meta
                                  ? `${meta.shortName} · ${meta.name}`
                                  : row.jurisdiction}
                              </td>
                              <td className="py-1.5 pr-3 text-[11px] text-[#94a3b8]">
                                {JURISDICTION_LANG_LABEL[row.jurisdiction] ??
                                  "—"}
                              </td>
                              <td className="py-1.5 pr-3 text-right tabular-nums text-[#cbd5e1]">
                                {row.evaluatedCount}
                              </td>
                              <td className="py-1.5 pr-3 text-right tabular-nums text-[#67e8f9]">
                                {fmtMetric(row.requirementMicroF1)}
                              </td>
                              <td className="py-1.5 pr-3 text-right tabular-nums text-[#67e8f9]">
                                {fmtMetric(row.enforcementMicroF1)}
                              </td>
                              <td className="py-1.5 pr-3 text-right tabular-nums text-[#38bdf8]">
                                {fmtMetric(row.dominantFrameAccuracy)}
                              </td>
                              <td className="py-1.5 text-right tabular-nums text-[#38bdf8]">
                                {fmtMetric(row.bindingStrengthAccuracy)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {/* Collapsible Per-Label Precision / Recall / F1 Table */}
              {goldSet.perLabelRequirements.length > 0 ||
              goldSet.perLabelEnforcement.length > 0 ? (
                <details className="mt-3.5 border-t border-white/10 pt-3">
                  <summary className="cursor-pointer font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#67e8f9] hover:text-white">
                    per-label precision / recall / F1 breakdown (
                    {goldSet.perLabelRequirements.length} requirements ·{" "}
                    {goldSet.perLabelEnforcement.length} enforcement)
                  </summary>
                  <div className="mt-3 grid gap-4 lg:grid-cols-2">
                    {goldSet.perLabelRequirements.length > 0 ? (
                      <div className="overflow-x-auto">
                        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
                          safeguard requirements
                        </p>
                        <table className="w-full text-left font-mono text-[11px]">
                          <thead>
                            <tr className="border-b border-white/10 uppercase text-[#94a3b8]">
                              <th className="pb-1 pr-2 font-medium">label</th>
                              <th className="pb-1 pr-2 text-right font-medium">
                                sup
                              </th>
                              <th className="pb-1 pr-2 text-right font-medium">
                                P / R
                              </th>
                              <th className="pb-1 text-right font-medium">
                                F1
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {goldSet.perLabelRequirements.map((item) => (
                              <tr key={item.label}>
                                <td className="py-1 pr-2 font-sans text-[12px] text-[#e2e8f0]">
                                  {humanizeRequirement(item.label)}
                                </td>
                                <td className="py-1 pr-2 text-right tabular-nums text-[#94a3b8]">
                                  {item.support}
                                </td>
                                <td className="py-1 pr-2 text-right tabular-nums text-[#cbd5e1]">
                                  {fmtMetric(item.precision)} /{" "}
                                  {fmtMetric(item.recall)}
                                </td>
                                <td className="py-1 text-right font-semibold tabular-nums text-[#67e8f9]">
                                  {fmtMetric(item.f1)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}

                    {goldSet.perLabelEnforcement.length > 0 ? (
                      <div className="overflow-x-auto">
                        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
                          enforcement mechanisms
                        </p>
                        <table className="w-full text-left font-mono text-[11px]">
                          <thead>
                            <tr className="border-b border-white/10 uppercase text-[#94a3b8]">
                              <th className="pb-1 pr-2 font-medium">label</th>
                              <th className="pb-1 pr-2 text-right font-medium">
                                sup
                              </th>
                              <th className="pb-1 pr-2 text-right font-medium">
                                P / R
                              </th>
                              <th className="pb-1 text-right font-medium">
                                F1
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {goldSet.perLabelEnforcement.map((item) => (
                              <tr key={item.label}>
                                <td className="py-1 pr-2 font-sans text-[12px] text-[#e2e8f0]">
                                  {humanizeEnforcement(item.label)}
                                </td>
                                <td className="py-1 pr-2 text-right tabular-nums text-[#94a3b8]">
                                  {item.support}
                                </td>
                                <td className="py-1 pr-2 text-right tabular-nums text-[#cbd5e1]">
                                  {fmtMetric(item.precision)} /{" "}
                                  {fmtMetric(item.recall)}
                                </td>
                                <td className="py-1 text-right font-semibold tabular-nums text-[#67e8f9]">
                                  {fmtMetric(item.f1)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null}

              <p className="mt-2.5 text-[12px] text-[#94a3b8]">
                {isExpandedGoldSet
                  ? `Caveat: Evaluated on ${goldSet.evaluatedCount} stratified official instruments (${goldSet.benchmarkStatus}) spanning EN, KO, JA, and ZH across US, EU, KR, JP, and CN. All production labels remain machine-coded without an active human review queue.`
                  : `Caveat: Evaluated on the internal ${goldSet.evaluatedCount}-document starter set (${goldSet.benchmarkStatus}) across US, EU, KR, JP, and CN — intended for automated pipeline regression testing rather than blind external inter-rater certification.`}
              </p>
            </div>
          ) : null}
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
                <li>
                  <strong className="text-[#e2e8f0]">
                    Opt-in U.S. state statutory overlay (
                    <code className="font-mono text-[#cbd5e1]">?states=1</code>
                    ):
                  </strong>{" "}
                  Enacted U.S. state AI statutes (
                  <code className="font-mono text-[#cbd5e1]">
                    corpus_role = subnational_overlay
                  </code>
                  ) are strictly excluded from the default sovereign national
                  baseline so federal vs. national comparisons stay
                  apples-to-apples, and can be opted into across every
                  observatory view and public API via{" "}
                  <code className="font-mono text-[#cbd5e1]">?states=1</code>.
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

        {/* 6. Corpus Freshness & Supersession Ledger (Phase 5A) */}
        <section
          id="freshness"
          className="mt-4 rounded-sm border border-white/10 bg-[#0f1623] px-5 py-4"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-2.5">
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
              6. Corpus Freshness &amp; Supersession Ledger
            </h2>
            <p className="font-mono text-[11px] text-[#94a3b8]">
              weekly source freshness watch · {totalSupersessions} tracked
              supersession chain{totalSupersessions === 1 ? "" : "s"}
              {totalSubnational > 0
                ? ` · ${totalSubnational} opt-in U.S. state statutes`
                : ""}
            </p>
          </header>

          <p className="mt-3 text-[13px] leading-relaxed text-[#cbd5e1]">
            An automated weekly GitHub Action (
            <code className="font-mono text-[12px] text-[#e2e8f0]">
              freshness-watch.yml
            </code>{" "}
            running{" "}
            <code className="font-mono text-[12px] text-[#e2e8f0]">
              observatory check-freshness
            </code>{" "}
            every Monday at 06:00 UTC) audits all official government URLs with
            polite conditional HTTP probes (
            <code className="font-mono text-[12px] text-[#e2e8f0]">ETag</code> /{" "}
            <code className="font-mono text-[12px] text-[#e2e8f0]">
              Last-Modified
            </code>
            ) and flags upstream document revisions or broken links without
            mutating verified snapshots. Statutory replacements linked via{" "}
            <code className="font-mono text-[12px] text-[#e2e8f0]">
              supersedes_id
            </code>{" "}
            are diffed on the{" "}
            <Link
              href="/evolution#supersessions"
              className="text-[#67e8f9] underline decoration-[#67e8f9]/40 underline-offset-2 hover:text-white"
            >
              Regime Evolution workbench →
            </Link>
          </p>

          {evolution.freshnessByJurisdiction.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left font-mono text-[12px]">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-[#94a3b8]">
                    <th className="pb-2 pr-3 font-medium">jurisdiction</th>
                    <th className="pb-2 pr-3 text-right font-medium">
                      total corpus
                    </th>
                    <th className="pb-2 pr-3 text-right font-medium">
                      active primary
                    </th>
                    <th className="pb-2 pr-3 text-right font-medium">
                      binding law
                    </th>
                    <th className="pb-2 pr-3 text-right font-medium">
                      state overlay
                    </th>
                    <th className="pb-2 pr-3 text-right font-medium">
                      supersessions
                    </th>
                    <th className="pb-2 pr-3 text-right font-medium">
                      latest published
                    </th>
                    <th className="pb-2 text-right font-medium">
                      latest ISO
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {evolution.freshnessByJurisdiction.map((row) => (
                    <tr key={row.jurisdictionKey}>
                      <td className="py-2 pr-3 font-sans font-medium text-[#f1f5f9]">
                        <Link
                          href={`/jurisdictions/${row.slug}`}
                          className="underline decoration-white/25 underline-offset-2 hover:text-[#67e8f9]"
                        >
                          {row.shortName} · {row.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-[#cbd5e1]">
                        {row.totalDocuments}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-[#38bdf8]">
                        {row.headlinePrimaryCount}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-[#67e8f9]">
                        {row.bindingLawCount}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-[#e6ae49]">
                        {row.subnationalCount}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-[#cbd5e1]">
                        {row.supersessionChainCount}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-[#94a3b8]">
                        {row.latestPublicationDate}
                      </td>
                      <td className="py-2 text-right tabular-nums text-[#94a3b8]">
                        {row.latestPublicationIso ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        {/* 7. Eight-frame codebook v2.1.0 reference (A13) */}
        <section className="mt-4 rounded-sm border border-white/10 bg-[#0f1623] px-5 py-4">
          <h2 className="border-b border-white/10 pb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
            7. The Eight Risk Framing Labels (Codebook v
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

        {/* 8. Public Read-Only API & Versioned BibTeX Citation (C8 / Phase 5A) */}
        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-sm border border-white/10 bg-[#0f1623] px-5 py-4">
            <h2 className="border-b border-white/10 pb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
              8. Public Read-Only API &amp; Research Exports (CORS-Enabled)
            </h2>
            <ul className="mt-3 space-y-2 text-[12px]">
              {[
                {
                  path: "/api/overview?mode=headline",
                  desc: "Full overview snapshot, POL/FRM/COV scores, 90% CIs, null calibration, sensitivity grid & timeline (supports states=1)",
                },
                {
                  path: "/api/matrix?mode=headline",
                  desc: "25×5 AI Legal Obligation & Clause Matrix with strongest binding level (0–4) and quoted instruments (supports states=1)",
                },
                {
                  path: "/api/clauses?category=requirement&control=red_teaming",
                  desc: "Cross-jurisdiction verbatim multilingual clause & citation explorer (supports mode, states, category, control, j, minLevel, obligation, q, format=json|csv, limit, offset)",
                },
                {
                  path: "/api/evolution",
                  desc: "Longitudinal 2019–2026 annual regime trajectories, supersedes_id amendment diffs & corpus freshness ledger (supports states=1)",
                },
                {
                  path: "/api/jurisdictions",
                  desc: "All five jurisdiction profiles, CIs & bilateral matrix (supports mode, states=1)",
                },
                {
                  path: "/api/jurisdictions/china",
                  desc: "Single jurisdiction readout, narrative synthesis & latest documents (supports mode, states=1)",
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
                9. Cite Project Babel (Versioned BibTeX)
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
