"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { TopNav } from "@/app/_components/top-nav";
import type {
  EvolutionAnalysis,
  EvolutionYearPoint,
  SupersessionDiff,
} from "@/lib/evolution-engine";
import { frameTextHue } from "@/lib/frame-vocab";
import {
  jurisdictionMeta,
  jurisdictionOrder,
  type JurisdictionKey,
} from "@/lib/jurisdictions";
import { parseIncludeSubnational } from "@/lib/taxonomy-vocab";
import { replaceUrlQuery, useUrlSearch } from "@/lib/use-url-search";

type TrajectoryMetric =
  | "breadth"
  | "active"
  | "bindingCount"
  | "bindingShare";

const JUR_LINE_COLORS: Record<JurisdictionKey, string> = {
  united_states: "#38bdf8",
  european_union: "#6ea8f0",
  south_korea: "#4cc9a8",
  japan: "#e6ae49",
  china: "#f27aa5",
};

const METRIC_META: Record<
  TrajectoryMetric,
  { label: string; unit: string; desc: string; fixedMax?: number }
> = {
  breadth: {
    label: "requirement breadth (0–17)",
    unit: "controls",
    desc: "Distinct safeguard requirements active across each jurisdiction's non-superseded instruments by year.",
    fixedMax: 17,
  },
  active: {
    label: "active instruments",
    unit: "docs",
    desc: "Cumulative official instruments published up to each year whose superseding replacement (if any) had not yet been enacted.",
  },
  bindingCount: {
    label: "binding laws (L4)",
    unit: "laws",
    desc: "Active binding statutory instruments (binding_law tier) in force or adopted by year.",
  },
  bindingShare: {
    label: "binding-law share (%)",
    unit: "%",
    desc: "Percentage of active instruments carrying statutory binding_law authority by year.",
    fixedMax: 100,
  },
};

function metricValue(pt: EvolutionYearPoint, metric: TrajectoryMetric): number {
  if (metric === "breadth") return pt.cumulativeRequirementBreadth;
  if (metric === "active") return pt.activeDocuments;
  if (metric === "bindingCount") return pt.bindingLawCount;
  return pt.bindingLawShare;
}

export function EvolutionClient({
  baseline,
  withStates,
}: {
  baseline: EvolutionAnalysis;
  withStates: EvolutionAnalysis;
}) {
  const urlSearch = useUrlSearch();
  const hasSubnational = baseline.subnationalCount > 0;
  const includeSubnational =
    hasSubnational &&
    parseIncludeSubnational(new URLSearchParams(urlSearch).get("states"));
  const data = includeSubnational ? withStates : baseline;

  const [metric, setMetric] = useState<TrajectoryMetric>("breadth");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [visibleJurs, setVisibleJurs] = useState<Set<JurisdictionKey>>(
    () => new Set(jurisdictionOrder),
  );
  const [diffJurFilter, setDiffJurFilter] = useState<string>("all");

  function toggleSubnational() {
    replaceUrlQuery((params) => {
      if (includeSubnational) params.delete("states");
      else params.set("states", "1");
    });
  }

  function toggleJurisdiction(key: JurisdictionKey) {
    setVisibleJurs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const years = data.years;
  const metaInfo = METRIC_META[metric];

  // SVG chart geometry
  const W = 880;
  const H = 310;
  const padL = 52;
  const padR = 26;
  const padT = 20;
  const padB = 38;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const observedMax = Math.max(
    1,
    ...jurisdictionOrder
      .filter((k) => visibleJurs.has(k))
      .flatMap((k) =>
        (data.seriesByJurisdiction[k] ?? []).map((pt) => metricValue(pt, metric)),
      ),
  );
  const yMax =
    metaInfo.fixedMax ?? Math.max(5, Math.ceil((observedMax * 1.15) / 5) * 5);

  const sx = (idx: number) =>
    Number(
      (years.length <= 1
        ? padL + plotW / 2
        : padL + (idx / (years.length - 1)) * plotW
      ).toFixed(1),
    );
  const sy = (val: number) =>
    Number((padT + plotH - (Math.min(val, yMax) / yMax) * plotH).toFixed(1));

  const yTicks = [0, Math.round(yMax / 2), yMax];

  const filteredDiffs =
    diffJurFilter === "all"
      ? data.supersessionDiffs
      : data.supersessionDiffs.filter(
          (d) => d.jurisdictionKey === diffJurFilter,
        );

  return (
    <main className="min-h-screen bg-[#0a0f18] font-sans text-[14px] text-[#cdd6e1]">
      <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
        <TopNav active="evolution" />

        {/* Masthead */}
        <header className="border-y border-white/20 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">
                LONGITUDINAL OBSERVATORY · {years[0]}–{years[years.length - 1]}{" "}
                TRAJECTORIES &amp; SUPERSESSION DIFFS
              </p>
              <h1 className="mt-1.5 text-[24px] font-semibold tracking-[-0.01em] text-[#f1f5f9]">
                Regime Evolution &amp; Amendment Lineage
              </h1>
              <p className="mt-2 text-[14px] leading-relaxed text-[#cbd5e1]">
                Tracks how statutory breadth, binding-law share, and risk
                framings evolved from early voluntary principles ({years[0]}) to
                comprehensive {years[years.length - 1]} regimes — including{" "}
                <strong className="font-medium text-[#f8fafc] tabular-nums">
                  {data.supersessionDiffs.length}
                </strong>{" "}
                tracked{" "}
                <code className="font-mono text-[12px] text-[#67e8f9]">
                  supersedes_id
                </code>{" "}
                policy-shift diffs comparing superseded versions directly
                against their successors.
              </p>
            </div>

            <div className="flex flex-col items-end gap-2 font-mono text-[11px] uppercase tracking-[0.08em]">
              {hasSubnational ? (
                <button
                  type="button"
                  aria-pressed={includeSubnational}
                  onClick={toggleSubnational}
                  className={`rounded-[2px] border px-2.5 py-1 transition-colors ${
                    includeSubnational
                      ? "border-[#67e8f9]/70 bg-[#67e8f9]/15 font-semibold text-[#f8fafc]"
                      : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                  }`}
                >
                  + U.S. State Laws ({baseline.subnationalCount})
                </button>
              ) : null}
              <a
                href={`/api/evolution${includeSubnational ? "?states=1" : ""}`}
                className="text-[#67e8f9] underline decoration-[#67e8f9]/40 underline-offset-2 hover:text-white"
              >
                download evolution json →
              </a>
            </div>
          </div>
        </header>

        {/* Trajectory Chart / Table Section */}
        <section
          aria-label="Annual multi-jurisdiction trajectory"
          className="mt-4 rounded-sm border border-white/10 bg-[#0f1623] p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
                annual regime trajectory · {years[0]}–{years[years.length - 1]}
              </h2>
              <p className="mt-0.5 text-[13px] text-[#cbd5e1]">
                {metaInfo.desc}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em]">
              <div
                role="group"
                aria-label="Select trajectory metric"
                className="flex flex-wrap gap-1"
              >
                {(
                  Object.entries(METRIC_META) as [
                    TrajectoryMetric,
                    (typeof METRIC_META)[TrajectoryMetric],
                  ][]
                ).map(([key, info]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={metric === key}
                    onClick={() => setMetric(key)}
                    className={`rounded-[2px] border px-2 py-0.5 transition-colors ${
                      metric === key
                        ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 text-[#f1f5f9]"
                        : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                    }`}
                  >
                    {info.label}
                  </button>
                ))}
              </div>

              <div
                role="group"
                aria-label="Trajectory display view"
                className="flex items-center gap-1 border-l border-white/15 pl-2"
              >
                <button
                  type="button"
                  aria-pressed={view === "chart"}
                  onClick={() => setView("chart")}
                  className={`rounded-[2px] border px-2 py-0.5 transition-colors ${
                    view === "chart"
                      ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 text-[#f1f5f9]"
                      : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                  }`}
                >
                  chart
                </button>
                <button
                  type="button"
                  aria-pressed={view === "table"}
                  onClick={() => setView("table")}
                  className={`rounded-[2px] border px-2 py-0.5 transition-colors ${
                    view === "table"
                      ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 text-[#f1f5f9]"
                      : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                  }`}
                >
                  table
                </button>
              </div>
            </div>
          </div>

          {/* Interactive jurisdiction toggles */}
          <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px]">
            <span className="uppercase tracking-wider text-[#94a3b8]">
              jurisdictions:
            </span>
            {jurisdictionOrder.map((jKey) => {
              const meta = jurisdictionMeta[jKey];
              const isOn = visibleJurs.has(jKey);
              const color = JUR_LINE_COLORS[jKey];
              const latestPt =
                data.seriesByJurisdiction[jKey]?.[years.length - 1];
              return (
                <button
                  key={jKey}
                  type="button"
                  aria-pressed={isOn}
                  onClick={() => toggleJurisdiction(jKey)}
                  className={`inline-flex items-center gap-2 rounded-[2px] border px-2.5 py-1 transition-colors ${
                    isOn
                      ? "border-white/30 bg-[#0a0f18] text-[#f1f5f9]"
                      : "border-white/10 bg-transparent text-[#7c8a9e] opacity-65 hover:opacity-100"
                  }`}
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-[1px]"
                    style={{ background: color }}
                  />
                  <span>{meta.shortName}</span>
                  <span className="font-sans text-[#cbd5e1]">{meta.name}</span>
                  {latestPt ? (
                    <span
                      className="tabular-nums font-semibold"
                      style={{ color }}
                    >
                      {metricValue(latestPt, metric)}
                      {metric === "bindingShare" ? "%" : ""}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {view === "table" ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left font-mono text-[12px]">
                <thead>
                  <tr className="border-b border-white/15 text-[11px] uppercase tracking-wider text-[#94a3b8]">
                    <th className="pb-2 pr-3 font-medium">jurisdiction</th>
                    {years.map((y) => (
                      <th key={y} className="pb-2 px-2 text-right font-medium">
                        {y}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {jurisdictionOrder
                    .filter((k) => visibleJurs.has(k))
                    .map((jKey) => {
                      const meta = jurisdictionMeta[jKey];
                      const series = data.seriesByJurisdiction[jKey] ?? [];
                      return (
                        <tr key={jKey} className="hover:bg-white/[0.03]">
                          <td className="py-2 pr-3 font-sans font-medium text-[#f1f5f9]">
                            {meta.shortName} · {meta.name}
                          </td>
                          {series.map((pt) => (
                            <td
                              key={pt.year}
                              className="py-2 px-2 text-right tabular-nums text-[#cbd5e1]"
                            >
                              {metricValue(pt, metric)}
                              {metric === "bindingShare" ? "%" : ""}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-4">
              <svg
                viewBox={`0 0 ${W} ${H}`}
                role="img"
                aria-label={`Multi-jurisdiction annual trajectory chart for ${metaInfo.label} from ${years[0]} to ${years[years.length - 1]}`}
                className="h-auto w-full rounded-[2px] border border-white/10 bg-[#0a0f18]"
              >
                {/* Horizontal gridlines */}
                {yTicks.map((tick) => (
                  <g key={tick}>
                    <line
                      x1={padL}
                      y1={sy(tick)}
                      x2={W - padR}
                      y2={sy(tick)}
                      stroke="rgba(255,255,255,0.08)"
                    />
                    <text
                      x={padL - 8}
                      y={sy(tick) + 4}
                      textAnchor="end"
                      fill="#94a3b8"
                      fontSize="11"
                      fontFamily="var(--font-geist-mono), monospace"
                    >
                      {tick}
                      {metric === "bindingShare" ? "%" : ""}
                    </text>
                  </g>
                ))}

                {/* Year axis ticks */}
                {years.map((yr, idx) => (
                  <g key={yr}>
                    <line
                      x1={sx(idx)}
                      y1={padT}
                      x2={sx(idx)}
                      y2={padT + plotH}
                      stroke="rgba(255,255,255,0.05)"
                    />
                    <text
                      x={sx(idx)}
                      y={H - 12}
                      textAnchor="middle"
                      fill="#cbd5e1"
                      fontSize="11"
                      fontFamily="var(--font-geist-mono), monospace"
                    >
                      {yr}
                    </text>
                  </g>
                ))}

                {/* Jurisdiction trajectories */}
                {jurisdictionOrder
                  .filter((k) => visibleJurs.has(k))
                  .map((jKey) => {
                    const series = data.seriesByJurisdiction[jKey] ?? [];
                    if (series.length === 0) return null;
                    const color = JUR_LINE_COLORS[jKey];
                    const pathD = series
                      .map((pt, idx) => {
                        const x = sx(idx);
                        const y = sy(metricValue(pt, metric));
                        return `${idx === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
                      })
                      .join(" ");
                    return (
                      <g key={jKey}>
                        <path
                          d={pathD}
                          fill="none"
                          stroke={color}
                          strokeWidth={2.25}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                        {series.map((pt, idx) => (
                          <circle
                            key={`${jKey}-${pt.year}`}
                            cx={sx(idx)}
                            cy={sy(metricValue(pt, metric))}
                            r={3.5}
                            fill={color}
                            stroke="#0a0f18"
                            strokeWidth={1.25}
                          >
                            <title>
                              {`${jurisdictionMeta[jKey].name} (${pt.year}): ${metricValue(pt, metric)} ${metaInfo.unit}`}
                            </title>
                          </circle>
                        ))}
                      </g>
                    );
                  })}
              </svg>
            </div>
          )}
        </section>

        {/* Amendment & Supersession Diffs ("Then vs. Now") */}
        <section
          id="supersessions"
          aria-label="Amendment and supersession diffs"
          className="mt-5 scroll-mt-4 rounded-sm border border-white/10 bg-[#0f1623] p-4"
        >
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#38bdf8]">
                then vs. now · supersedes_id amendment lineage
              </p>
              <h2 className="mt-0.5 text-[18px] font-semibold text-[#f1f5f9]">
                Structured Policy Shifts &amp; Instrument Supersessions
              </h2>
              <p className="mt-1 text-[13px] text-[#94a3b8]">
                Every pair links a superseded predecessor instrument to its
                successor, computing exact added and removed safeguard
                requirements, enforcement hooks, binding transitions, and
                framing shifts.
              </p>
            </div>

            <div
              role="group"
              aria-label="Filter amendment diffs by jurisdiction"
              className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.06em]"
            >
              <button
                type="button"
                aria-pressed={diffJurFilter === "all"}
                onClick={() => setDiffJurFilter("all")}
                className={`rounded-[2px] border px-2 py-0.5 transition-colors ${
                  diffJurFilter === "all"
                    ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 text-[#f1f5f9]"
                    : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                }`}
              >
                all ({data.supersessionDiffs.length})
              </button>
              {jurisdictionOrder.map((jKey) => {
                const count = data.supersessionDiffs.filter(
                  (d) => d.jurisdictionKey === jKey,
                ).length;
                if (count === 0) return null;
                return (
                  <button
                    key={jKey}
                    type="button"
                    aria-pressed={diffJurFilter === jKey}
                    onClick={() => setDiffJurFilter(jKey)}
                    className={`rounded-[2px] border px-2 py-0.5 transition-colors ${
                      diffJurFilter === jKey
                        ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 text-[#f1f5f9]"
                        : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                    }`}
                  >
                    {jurisdictionMeta[jKey].shortName} ({count})
                  </button>
                );
              })}
            </div>
          </header>

          {filteredDiffs.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-[#94a3b8]">
              No supersession chains recorded for this selection yet.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {filteredDiffs.map((diff) => (
                <SupersessionCard key={diff.id} diff={diff} />
              ))}
            </div>
          )}
        </section>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
          <span>
            Project Babel · regime evolution {years[0]}–
            {years[years.length - 1]} · {data.supersessionDiffs.length}{" "}
            amendment chains
          </span>
          <Link href="/" className="transition-colors hover:text-[#f1f5f9]">
            ← back to overview
          </Link>
        </footer>
      </div>
    </main>
  );
}

function SupersessionCard({ diff }: { diff: SupersessionDiff }) {
  return (
    <article className="flex flex-col justify-between rounded-sm border border-white/10 bg-[#0a0f18] p-4">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[#cbd5e1]">
            {diff.flagUrl ? (
              <Image
                src={diff.flagUrl}
                alt=""
                width={18}
                height={13}
                className="h-[13px] w-[18px] rounded-[1px] border border-white/15 object-cover"
                unoptimized
              />
            ) : null}
            <span className="font-semibold text-[#f1f5f9]">
              {diff.jurisdictionShort}
            </span>
            <span className="text-[#94a3b8]">{diff.jurisdictionName}</span>
          </div>
          <span className="font-mono text-[11px] text-[#94a3b8]">
            {diff.predecessor.publicationDate} → {diff.successor.publicationDate}
          </span>
        </div>

        {/* Predecessor -> Successor titles */}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-[2px] border border-white/10 bg-[#0f1623] p-2.5">
            <p className="font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
              then · {diff.predecessor.lifecycleStageLabel}
            </p>
            <Link
              href={`/documents/${encodeURIComponent(diff.predecessor.id)}`}
              lang={diff.predecessor.languageCode}
              className="mt-1 block text-[13px] font-medium leading-snug text-[#cbd5e1] underline decoration-white/20 underline-offset-2 hover:text-white"
            >
              {diff.predecessor.title}
            </Link>
            <p className="mt-1 font-mono text-[11px] text-[#94a3b8]">
              {diff.predecessor.bindingStrengthLabel} ·{" "}
              {diff.predecessor.publicationDate}
            </p>
          </div>

          <div className="rounded-[2px] border border-[#38bdf8]/35 bg-[#0f1623] p-2.5">
            <p className="font-mono text-[11px] uppercase tracking-wider text-[#67e8f9]">
              now · {diff.successor.lifecycleStageLabel}
            </p>
            <Link
              href={`/documents/${encodeURIComponent(diff.successor.id)}`}
              lang={diff.successor.languageCode}
              className="mt-1 block text-[13px] font-semibold leading-snug text-[#f1f5f9] underline decoration-[#67e8f9]/30 underline-offset-2 hover:text-[#67e8f9]"
            >
              {diff.successor.title}
            </Link>
            <p className="mt-1 font-mono text-[11px] text-[#cbd5e1]">
              {diff.successor.bindingStrengthLabel} ·{" "}
              {diff.successor.publicationDate}
            </p>
          </div>
        </div>

        {/* Binding & Framing transitions */}
        <div className="mt-3 flex flex-wrap gap-2 font-mono text-[11px]">
          <span
            className={`rounded-[2px] border px-2 py-0.5 ${
              diff.bindingChange.changed
                ? "border-[#67e8f9]/50 bg-[#67e8f9]/12 text-[#67e8f9]"
                : "border-white/10 bg-white/[0.02] text-[#94a3b8]"
            }`}
          >
            binding: {diff.bindingChange.fromLabel}
            {diff.bindingChange.changed
              ? ` → ${diff.bindingChange.toLabel}`
              : " (unchanged)"}
          </span>

          {diff.dominantFrameChange.from && diff.dominantFrameChange.to ? (
            <span
              className={`rounded-[2px] border px-2 py-0.5 ${
                diff.dominantFrameChange.changed
                  ? "border-[#38bdf8]/45 bg-[#38bdf8]/10 text-[#f1f5f9]"
                  : "border-white/10 bg-white/[0.02] text-[#94a3b8]"
              }`}
            >
              frame:{" "}
              <span
                style={{
                  color: frameTextHue[diff.dominantFrameChange.from],
                }}
              >
                {diff.dominantFrameChange.fromLabel}
              </span>
              {diff.dominantFrameChange.changed ? (
                <>
                  {" → "}
                  <span
                    style={{
                      color: frameTextHue[diff.dominantFrameChange.to],
                    }}
                  >
                    {diff.dominantFrameChange.toLabel}
                  </span>
                </>
              ) : (
                " (retained)"
              )}
            </span>
          ) : null}
        </div>

        {/* Requirement & Enforcement Diff Chips */}
        <div className="mt-3 space-y-2 border-t border-white/10 pt-2.5 text-[12px]">
          {diff.addedRequirements.length > 0 ||
          diff.addedEnforcement.length > 0 ? (
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-[#67e8f9]">
                + added controls
              </p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {diff.addedRequirements.map((r) => (
                  <li
                    key={`add-req-${r.key}`}
                    className="rounded-[2px] border border-[#67e8f9]/40 bg-[#67e8f9]/12 px-2 py-0.5 text-[11px] text-[#f1f5f9]"
                  >
                    + {r.label}
                  </li>
                ))}
                {diff.addedEnforcement.map((e) => (
                  <li
                    key={`add-enf-${e.key}`}
                    className="rounded-[2px] border border-[#38bdf8]/40 bg-[#38bdf8]/12 px-2 py-0.5 text-[11px] text-[#7dd3fc]"
                  >
                    + {e.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {diff.removedRequirements.length > 0 ||
          diff.removedEnforcement.length > 0 ? (
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
                − removed / dropped controls
              </p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {diff.removedRequirements.map((r) => (
                  <li
                    key={`rem-req-${r.key}`}
                    className="rounded-[2px] border border-white/15 bg-white/[0.03] px-2 py-0.5 text-[11px] text-[#cbd5e1]"
                  >
                    − {r.label}
                  </li>
                ))}
                {diff.removedEnforcement.map((e) => (
                  <li
                    key={`rem-enf-${e.key}`}
                    className="rounded-[2px] border border-white/15 bg-white/[0.03] px-2 py-0.5 text-[11px] text-[#94a3b8]"
                  >
                    − {e.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="font-mono text-[11px] text-[#94a3b8]">
            {diff.retainedRequirements.length} safeguard requirement
            {diff.retainedRequirements.length === 1 ? "" : "s"} carried forward
          </p>
        </div>
      </div>
    </article>
  );
}
