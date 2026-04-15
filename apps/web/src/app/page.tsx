import Image from "next/image";
import Link from "next/link";

import { getLatestSources, getOverviewData } from "@/lib/overview-data";
import { frameAbbr, frameHue, scoreHexDark } from "@/lib/frame-vocab";
import {
  allFrameLabels,
  frameLabels,
  type CountrySnapshot,
  type FrameLabel,
} from "@/lib/seed-data";

import { LatestSourcesPanel } from "./_home/sources-panel";
import { FrameTip, MetricTip } from "./_home/frame-tip";

export const dynamic = "force-dynamic";

const ALL_FRAMES: FrameLabel[] = allFrameLabels;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ j?: string }>;
}) {
  const data = await getOverviewData();
  const { j } = await searchParams;

  // Pull a richer source list for the latest_sources panel. The query
  // goes to the documents table directly so it picks up new ingests
  // without waiting for the overview snapshot to refresh.
  const latestSources = await getLatestSources(30);

  // Consistent histogram scale across all country cards so bar heights
  // are directly comparable between panels.
  const globalFrameMax = Math.max(
    ...data.countries.flatMap((country) =>
      country.frameMix.map((frame) => frame.value),
    ),
    1,
  );

  return (
    <main className="min-h-screen bg-[#0a0f18] font-mono text-[13px] text-[#cdd6e1]">
      <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
        {/* Minimal nav — sits on the axis of the centered masthead */}
        <nav className="mb-3 flex items-center justify-center gap-3 text-[10px] uppercase tracking-[0.14em] text-[#5d6675]">
          <Link
            href="/"
            aria-current="page"
            className="text-[#e6edf5]"
          >
            overview
          </Link>
          <span aria-hidden className="text-[#3f4857]">
            ·
          </span>
          <Link
            href="/documents"
            className="transition-colors hover:text-[#e6edf5]"
          >
            documents
          </Link>
        </nav>

        {/* Masthead — centered front matter */}
        <header className="border-y border-white/20 py-7 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7a8697]">
            PROJECT BABEL
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-[0.01em] text-[#e6edf5]">
            AI Governance Observatory
          </h1>
          <p className="mx-auto mt-3 max-w-[920px] text-[13px] leading-snug text-[#cdd6e1]">
            Measuring how five governments differ on{" "}
            <span className="text-[#e6edf5]">
              what they require of AI
            </span>{" "}
            — and{" "}
            <span className="text-[#e6edf5]">
              why they say those rules are necessary
            </span>
            .
          </p>
          <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-[#5d6675]">
            LLM-analyzed from official government sources
          </p>

          <div className="mx-auto mt-5 flex max-w-[900px] flex-wrap items-center justify-center gap-x-5 gap-y-1 border-t border-white/5 pt-4 text-[10px] uppercase tracking-[0.12em] text-[#5d6675]">
            <span>
              <span className="mr-1 text-[#cdd6e1] tabular-nums">
                {data.summary.publishedSources}
              </span>
              sources
            </span>
            <span className="text-[#3f4857]">·</span>
            <span>
              snapshot ·{" "}
              <span className="text-[#cdd6e1]">{data.snapshotDate}</span>
            </span>
            <span className="text-[#3f4857]">·</span>
            <span>window 2023 – 2026</span>
            <span className="text-[#3f4857]">·</span>
            <span>{data.datasetLabel}</span>
          </div>
        </header>

        {/* Tracking strip — the five jurisdictions, named once, up top */}
        <section
          className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px]"
          aria-label="Tracked jurisdictions"
        >
          <span className="flex items-baseline gap-1 text-[10px] uppercase tracking-[0.12em] text-[#7a8697]">
            tracking
            <span className="text-[#3f4857]">·</span>
            <span className="text-[#cdd6e1] tabular-nums">
              {data.countries.length} jurisdictions
            </span>
          </span>
          <ul className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
            {data.countries.map((country) => (
              <li key={country.slug}>
                <Link
                  href={`/jurisdictions/${country.slug}`}
                  className="group/track flex items-center gap-1.5 rounded-[2px] px-1.5 py-0.5 text-[#cdd6e1] transition-colors hover:bg-white/[0.04]"
                >
                  <Image
                    src={country.flagUrl}
                    alt=""
                    width={20}
                    height={15}
                    className="h-[15px] w-[20px] rounded-[1px] border border-white/10 object-cover"
                    unoptimized
                  />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7a8697] transition-colors group-hover/track:text-[#cdd6e1]">
                    {country.shortName}
                  </span>
                  <span className="text-[11px] text-[#e6edf5] underline decoration-transparent decoration-dotted underline-offset-2 transition-colors group-hover/track:decoration-white/30">
                    {country.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Scoring key + shared vocabulary — side-by-side reference panels */}
        <section className="mt-4 grid gap-3 lg:grid-cols-[1.3fr_1fr]">
          {/* Scoring key */}
          <div
            className="rounded-sm border border-white/10 bg-[#0f1623] px-3 py-2.5"
            aria-label="How to read the scores"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-[11px] uppercase tracking-[0.1em] text-[#7a8697]">
                how to read the scores
              </p>
              <p className="inline-flex items-center gap-1 text-[10px] text-[#5d6675]">
                <span
                  aria-hidden
                  className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#3f4857]/60 text-[8px] font-semibold text-[#5d6675]"
                >
                  i
                </span>
                hover for detail
              </p>
            </div>
            <p className="mt-1 text-[11px] text-[#7a8697]">
              each score compares one country to the average of{" "}
              <span className="text-[#cdd6e1]">the other four above</span>
            </p>

            <div className="mt-2.5">
              <div
                className="h-[6px] rounded-[1px]"
                style={{
                  background:
                    "linear-gradient(to right, #29d391 0%, #29d391 44%, #f5a623 44%, #f5a623 64%, #ff6b6b 64%, #ff6b6b 100%)",
                }}
              />
              <div className="mt-1 flex text-[9px] uppercase tracking-[0.08em]">
                <span
                  className="text-center text-[#29d391]"
                  style={{ flexGrow: 44, flexBasis: 0 }}
                >
                  0 – 44 · looks like peers
                </span>
                <span
                  className="text-center text-[#f5a623]"
                  style={{ flexGrow: 20, flexBasis: 0 }}
                >
                  45 – 64 · different
                </span>
                <span
                  className="text-center text-[#ff6b6b]"
                  style={{ flexGrow: 36, flexBasis: 0 }}
                >
                  65 – 100 · outlier
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 border-t border-white/5 pt-2.5">
              {[
                {
                  code: "POL",
                  label: "policy",
                  question: "Different rules?",
                  desc: "How different this country's required safeguards are from the other four — risk assessments, red-teaming, audits, transparency disclosures, registration, etc.",
                  example:
                    "The EU's conformity assessment vs China's security review vs the US relying on procurement leverage.",
                },
                {
                  code: "FRM",
                  label: "framing",
                  question: "Different reasons?",
                  desc: "How different the reasons this country gives for its rules are. Does the text justify AI regulation through rights, security, innovation, economic position, or social stability?",
                  example:
                    "The US leading with national security while Japan leads with innovation enablement.",
                },
                {
                  code: "CMP",
                  label: "composite",
                  question: "Overall outlier?",
                  desc: "The headline number. Weighted blend of policy and framing (0.6 × policy + 0.4 × framing). One comparable value for how much this country stands out from the other four overall.",
                  example:
                    "China at 71 is an outlier in this group; Japan at 36 aligns closely with its peers.",
                },
              ].map((metric) => (
                <MetricChip key={metric.code} metric={metric} />
              ))}
            </div>
          </div>

          {/* Shared vocabulary */}
          <div
            className="rounded-sm border border-white/10 bg-[#0f1623] px-3 py-2.5"
            aria-label="Shared vocabulary for risk framing labels"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-[11px] uppercase tracking-[0.1em] text-[#7a8697]">
                the six reasons
              </p>
              <p className="text-[10px] text-[#5d6675]">
                why it says what it says
              </p>
            </div>
            <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {ALL_FRAMES.map((frame) => (
                <FrameRow key={frame} frame={frame} />
              ))}
            </ul>
          </div>
        </section>

        {/* Country cards — histogram style */}
        <section className="mt-4">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-[11px] uppercase tracking-[0.1em] text-[#7a8697]">
              jurisdiction cards
            </p>
            <p className="text-[10px] uppercase tracking-wider text-[#3f4857]">
              histogram scale 0–{globalFrameMax} · shared
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {data.countries.map((country) => (
              <CountryCard
                key={country.slug}
                country={country}
                globalMax={globalFrameMax}
              />
            ))}
          </div>
        </section>

        {/* Pairwise divergence — full-width row of per-country panels */}
        <section className="mt-4">
          <div className="rounded-sm border border-white/10 bg-[#0f1623] px-3 py-3">
            <header className="flex items-baseline justify-between border-b border-white/5 pb-2">
              <p className="text-[11px] uppercase tracking-[0.1em] text-[#7a8697]">
                pairwise_divergence · per country
              </p>
              <p className="text-[10px] text-[#5d6675]">
                how far each jurisdiction sits from every other · sorted
              </p>
            </header>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              {data.countries.map((country, rowIndex) => (
                <PairwisePanel
                  key={country.slug}
                  country={country}
                  rowIndex={rowIndex}
                  countries={data.countries}
                  matrix={data.matrix}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Latest sources — client-side filtered panel */}
        <section className="mt-4">
          <LatestSourcesPanel
            allSources={latestSources}
            countries={data.countries}
            initialFilter={j}
          />
        </section>

        {/* Footer — provenance only */}
        <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[10px] uppercase tracking-wider text-[#3f4857]">
          <span>
            {data.countries.length} jurisdictions ·{" "}
            {data.summary.publishedSources} sources · snapshot{" "}
            {data.snapshotDate}
          </span>
          <span>Project Babel · LLM-analyzed observatory</span>
        </footer>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Country card — histogram style                                      */
/* ------------------------------------------------------------------ */

function CountryCard({
  country,
  globalMax,
}: {
  country: CountrySnapshot;
  globalMax: number;
}) {
  const mixMap = new Map(country.frameMix.map((f) => [f.label, f.value]));
  const totalMixCoverage = country.frameMix.reduce(
    (sum, frame) => sum + frame.value,
    0,
  );

  return (
    <article className="group/card flex flex-col gap-3 rounded-sm border border-white/10 bg-[#0f1623] px-3 py-3 transition-colors duration-200 hover:border-white/20 hover:bg-[#101a2c]">
      <Link
        href={`/jurisdictions/${country.slug}`}
        className="group/head -mx-1 -mt-1 flex items-start gap-2 rounded-[2px] px-1 py-1 transition-colors hover:bg-white/[0.04]"
      >
        <Image
          src={country.flagUrl}
          alt={`${country.name} flag`}
          width={28}
          height={21}
          className="h-[21px] w-[28px] rounded-[2px] border border-white/10 object-cover"
          unoptimized
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] text-[#7a8697]">
            {country.shortName}
            <span
              aria-hidden
              className="text-[#3f4857] transition-all duration-150 group-hover/head:translate-x-0.5 group-hover/head:text-[#7a8697]"
            >
              →
            </span>
          </p>
          <p className="truncate text-[13px] font-medium text-[#e6edf5] underline decoration-transparent decoration-dotted underline-offset-2 transition-colors group-hover/head:decoration-white/30">
            {country.name}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-wider text-[#5d6675]">
            cmp
          </p>
          <p
            className="text-[26px] font-semibold leading-none tabular-nums transition-colors"
            style={{ color: scoreHexDark(country.compositeDivergence) }}
          >
            {country.compositeDivergence}
          </p>
        </div>
      </Link>

      <div className="flex items-center gap-4 border-t border-white/5 pt-2 text-[10px]">
        <NumStat label="policy" value={country.policyDivergence} />
        <NumStat label="framing" value={country.framingDivergence} />
        <span className="ml-auto text-[9px] uppercase tracking-wider text-[#3f4857]">
          {country.lastUpdated}
        </span>
      </div>

      <div>
        <p className="text-[9px] uppercase tracking-wider text-[#5d6675]">
          frame distribution · {totalMixCoverage}% observed
        </p>
        <Histogram country={country} globalMax={globalMax} mixMap={mixMap} />
      </div>

      <div className="border-t border-white/5 pt-2">
        <p className="text-[9px] uppercase tracking-wider text-[#5d6675]">
          dominant frame
        </p>
        <FrameTip frame={country.dominantFrame}>
          <span className="group/dom mt-1 flex cursor-help items-center gap-2 rounded-[2px] border border-dashed border-white/15 bg-white/[0.02] px-1.5 py-1 transition-all duration-150 hover:border-solid hover:border-white/30 hover:bg-white/[0.05]">
            <span
              className="h-[8px] w-[8px] shrink-0 rounded-[1px]"
              style={{ background: frameHue[country.dominantFrame] }}
            />
            <span
              className="text-[12px] font-semibold"
              style={{ color: frameHue[country.dominantFrame] }}
            >
              {frameLabels[country.dominantFrame]}
            </span>
            <HoverHint />
          </span>
        </FrameTip>
      </div>

      <div className="border-t border-white/5 pt-2">
        <p className="text-[9px] uppercase tracking-wider text-[#5d6675]">
          top requirements
        </p>
        <ul className="mt-1 flex flex-wrap gap-1">
          {country.requirements.map((req) => (
            <li
              key={req}
              className="rounded-[1px] border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-[#cdd6e1]"
            >
              {req}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-white/5 pt-2 text-[10px] text-[#5d6675]">
        <span>
          analyzed{" "}
          <span className="text-[#cdd6e1]">{country.reviewedDocuments}</span>
        </span>
        <span>
          flagged{" "}
          <span className="text-[#f5a623]">{country.documentsInQueue}</span>
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
              className="flex-1 text-center text-[9px] tabular-nums"
              style={{
                color: value > 0 ? frameHue[frame] : "#3f4857",
              }}
            >
              {value > 0 ? value : "·"}
            </span>
          );
        })}
      </div>
      <div className="mt-1 flex h-14 items-end gap-1 border-b border-white/10 pb-px">
        {ALL_FRAMES.map((frame, index) => {
          const value = mixMap.get(frame) ?? 0;
          const pct = (value / globalMax) * 100;
          const isDominant = frame === country.dominantFrame;
          return (
            <div
              key={frame}
              className="relative flex h-full flex-1 items-end"
            >
              <div
                className="ago-bar w-full rounded-t-[1px] transition-[filter] duration-200 group-hover/card:brightness-110"
                style={{
                  height: value === 0 ? "3px" : `${Math.max(pct, 6)}%`,
                  background:
                    value > 0 ? frameHue[frame] : "rgba(255,255,255,0.06)",
                  boxShadow: isDominant
                    ? `0 0 0 1px ${frameHue[frame]}80`
                    : undefined,
                  animationDelay: `${index * 40}ms`,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1 text-[8px] uppercase tracking-[0.08em]">
        {ALL_FRAMES.map((frame) => {
          const isDominant = frame === country.dominantFrame;
          return (
            <span
              key={frame}
              className="flex-1 text-center"
              style={{
                color: isDominant ? frameHue[frame] : "#5d6675",
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
/* Pairwise panel — small multiples                                    */
/* ------------------------------------------------------------------ */

function PairwisePanel({
  country,
  rowIndex,
  countries,
  matrix,
}: {
  country: CountrySnapshot;
  rowIndex: number;
  countries: CountrySnapshot[];
  matrix: string[][];
}) {
  const distances = countries
    .map((other, colIndex) => {
      if (rowIndex === colIndex) return null;
      const raw = matrix[rowIndex][colIndex];
      if (raw === "-") return null;
      return { other, score: Number(raw) };
    })
    .filter(
      (entry): entry is { other: CountrySnapshot; score: number } =>
        entry !== null,
    )
    .sort((a, b) => b.score - a.score);

  const farthest = distances[0];
  const closest = distances[distances.length - 1];

  return (
    <article className="flex flex-col gap-2 rounded-sm border border-white/10 bg-[#0a0f18] px-2.5 py-2.5 transition-colors duration-200 hover:border-white/20 hover:bg-[#10192a]">
      <div className="flex items-center gap-2">
        <Image
          src={country.flagUrl}
          alt=""
          width={24}
          height={18}
          className="h-[18px] w-[24px] rounded-[2px] border border-white/10 object-cover"
          unoptimized
        />
        <div className="min-w-0 flex-1">
          <p className="text-[9px] uppercase tracking-[0.1em] text-[#7a8697]">
            {country.shortName}
          </p>
          <p className="truncate text-[11px] text-[#e6edf5]">{country.name}</p>
        </div>
      </div>

      <p className="text-[9px] uppercase tracking-wider text-[#5d6675]">
        distance to peers
      </p>

      <ul className="flex flex-col gap-0.5">
        {distances.map((entry, index) => {
          const color = scoreHexDark(entry.score);
          return (
            <li key={entry.other.slug}>
              <Link
                href={`/jurisdictions/${entry.other.slug}`}
                className="group/peer -mx-1 grid grid-cols-[16px_22px_minmax(0,1fr)_24px] items-center gap-1.5 rounded-[2px] px-1 py-0.5 transition-colors hover:bg-white/[0.04]"
              >
                <Image
                  src={entry.other.flagUrl}
                  alt=""
                  width={14}
                  height={10}
                  className="h-[10px] w-[14px] rounded-[1px] border border-white/10 object-cover"
                  unoptimized
                />
                <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#cdd6e1] transition-colors group-hover/peer:text-white">
                  {entry.other.shortName}
                </span>
                <div className="h-[5px] overflow-hidden rounded-[1px] bg-white/5">
                  <div
                    className="ago-bar-x h-[5px] rounded-[1px]"
                    style={{
                      width: `${entry.score}%`,
                      background: color,
                      animationDelay: `${index * 60}ms`,
                    }}
                  />
                </div>
                <span
                  className="text-right text-[10px] font-semibold tabular-nums"
                  style={{ color }}
                >
                  {entry.score}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {farthest && closest ? (
        <div className="mt-1 grid grid-cols-2 gap-2 border-t border-white/5 pt-2 text-[9px] uppercase tracking-wider text-[#5d6675]">
          <div>
            <p>farthest</p>
            <p
              className="mt-0.5 text-[10px] font-semibold tabular-nums"
              style={{ color: scoreHexDark(farthest.score) }}
            >
              {farthest.other.shortName} · {farthest.score}
            </p>
          </div>
          <div className="text-right">
            <p>closest</p>
            <p
              className="mt-0.5 text-[10px] font-semibold tabular-nums"
              style={{ color: scoreHexDark(closest.score) }}
            >
              {closest.other.shortName} · {closest.score}
            </p>
          </div>
        </div>
      ) : null}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Reference UI — frame row, popovers, metric chip, hover hint         */
/* ------------------------------------------------------------------ */

function HoverHint() {
  return (
    <span
      aria-hidden
      className="ml-auto flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#3f4857]/60 text-[8px] font-semibold leading-none text-[#5d6675] opacity-60 transition-all duration-150 group-hover/frame:border-[#7a8697] group-hover/frame:text-[#cdd6e1] group-hover/frame:opacity-100 group-hover/chip:border-[#7a8697] group-hover/chip:text-[#cdd6e1] group-hover/chip:opacity-100 group-hover/dom:border-[#7a8697] group-hover/dom:text-[#cdd6e1] group-hover/dom:opacity-100"
    >
      i
    </span>
  );
}

function FrameRow({ frame }: { frame: FrameLabel }) {
  return (
    <li className="group/frame flex items-stretch -mx-1.5">
      <FrameTip frame={frame}>
        <span className="flex w-full cursor-help items-center gap-2.5 rounded-[2px] border border-transparent px-1.5 py-1 transition-all duration-150 hover:border-white/10 hover:bg-white/[0.04]">
          <span
            aria-hidden
            className="h-3 w-[3px] shrink-0 rounded-[1px] transition-all duration-200 group-hover/frame:h-4"
            style={{ background: frameHue[frame] }}
          />
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.12em] tabular-nums"
            style={{ color: frameHue[frame] }}
          >
            {frameAbbr[frame]}
          </span>
          <span className="truncate text-[11px] font-semibold uppercase tracking-[0.04em] text-[#e6edf5]">
            {frameLabels[frame]}
          </span>
          <HoverHint />
        </span>
      </FrameTip>
    </li>
  );
}

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
      <span className="group/chip flex cursor-help items-center gap-2 rounded-[2px] border border-dashed border-white/15 bg-white/[0.02] px-2.5 py-1.5 transition-all duration-150 hover:border-solid hover:border-white/30 hover:bg-white/[0.05]">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] tabular-nums text-[#e6edf5]">
          {metric.code}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#cdd6e1]">
          {metric.label}
        </span>
        <span className="text-[10px] text-[#7a8697]">· {metric.question}</span>
        <HoverHint />
      </span>
    </MetricTip>
  );
}

function NumStat({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[9px] uppercase tracking-wider text-[#5d6675]">
        {label}
      </span>
      <span
        className="text-[14px] font-semibold tabular-nums"
        style={{ color: scoreHexDark(value) }}
      >
        {value}
      </span>
    </span>
  );
}
