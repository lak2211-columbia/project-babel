import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getJurisdictionAnalysis,
  humanizeJurisdictionAnalysisLabel,
  jurisdictionAnalysisFrameColor,
} from "@/lib/jurisdiction-analysis";
import { getLatestSources, getOverviewData } from "@/lib/overview-data";
import {
  frameAbbr,
  frameDefinition,
  frameHue,
  scoreHexDark,
} from "@/lib/frame-vocab";
import { jurisdictionMeta, type JurisdictionKey } from "@/lib/jurisdictions";
import {
  allFrameLabels,
  frameLabels,
  type CountrySnapshot,
  type FrameLabel,
} from "@/lib/seed-data";

export const dynamic = "force-dynamic";

const ALL_FRAMES: FrameLabel[] = allFrameLabels;

export default async function JurisdictionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getOverviewData();
  const country = data.countries.find((c) => c.slug === slug);
  if (!country) {
    notFound();
  }
  const jurisdictionKey = (Object.entries(jurisdictionMeta).find(
    ([, meta]) => meta.slug === slug,
  )?.[0] ?? null) as JurisdictionKey | null;
  if (!jurisdictionKey) {
    notFound();
  }
  const analysis = await getJurisdictionAnalysis(jurisdictionKey);

  const rowIndex = data.countries.findIndex((c) => c.slug === slug);

  // Pairwise row for this jurisdiction
  const distances = data.countries
    .map((other, colIndex) => {
      if (colIndex === rowIndex) return null;
      const raw = data.matrix[rowIndex]?.[colIndex];
      if (!raw || raw === "-") return null;
      return { other, score: Number(raw) };
    })
    .filter(
      (entry): entry is { other: CountrySnapshot; score: number } =>
        entry !== null,
    )
    .sort((a, b) => b.score - a.score);

  const farthest = distances[0];
  const closest = distances[distances.length - 1];

  // Country-specific latest sources (client-filtered server-side for safety)
  const allSources = await getLatestSources(60);
  const countryDocuments = allSources
    .filter((source) => source.jurisdictionSlug === slug)
    .slice(0, 20);

  // Frame distribution
  const mixMap = new Map(country.frameMix.map((f) => [f.label, f.value]));
  const frameMax = Math.max(...country.frameMix.map((f) => f.value), 1);
  const totalMixCoverage = country.frameMix.reduce(
    (sum, frame) => sum + frame.value,
    0,
  );
  const topRequirements = analysis?.top_requirements ?? [];
  const topEnforcement = analysis?.top_enforcement_mechanisms ?? [];
  const topBinding = analysis?.top_binding_strengths ?? [];
  const topDocumentTypes = analysis?.top_document_types ?? [];

  return (
    <main className="min-h-screen bg-[#0a0f18] font-mono text-[13px] text-[#cdd6e1]">
      <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-[#5d6675]">
          <Link
            href="/"
            className="transition-colors hover:text-[#e6edf5]"
          >
            ← overview
          </Link>
          <span className="text-[#3f4857]">/</span>
          <span>jurisdictions</span>
          <span className="text-[#3f4857]">/</span>
          <span className="text-[#cdd6e1]">{country.shortName}</span>
        </div>

        {/* Country masthead */}
        <header className="mt-4 border-y border-white/20 py-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
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
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7a8697]">
                  Jurisdiction · {country.shortName}
                </p>
                <h1 className="mt-1 text-[28px] font-semibold tracking-[0.01em] text-[#e6edf5]">
                  {country.name}
                </h1>
                <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[#5d6675]">
                  last updated {country.lastUpdated} ·{" "}
                  {country.reviewedDocuments} analyzed ·{" "}
                  <span className="text-[#f5a623]">
                    {country.documentsInQueue}
                  </span>{" "}
                  flagged
                </p>
              </div>
            </div>

            {/* Big scores — composite with pol/frm beneath */}
            <div className="flex items-start gap-6">
              <BigScore
                label="composite"
                value={country.compositeDivergence}
                emphasis
              />
              <BigScore label="policy" value={country.policyDivergence} />
              <BigScore label="framing" value={country.framingDivergence} />
            </div>
          </div>
        </header>

        {/* Two-column body */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          {/* LEFT: analysis content */}
          <div className="flex flex-col gap-4">
            <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/5 pb-2">
                <p className="text-[11px] uppercase tracking-[0.1em] text-[#7a8697]">
                  jurisdiction readout
                </p>
                <p className="text-[10px] text-[#5d6675]">
                  {analysis
                    ? `${analysis.source_count} analyzed sources${
                        analysis.source_window_start && analysis.source_window_end
                          ? ` · ${analysis.source_window_start} to ${analysis.source_window_end}`
                          : ""
                      }`
                    : "overview-derived snapshot"}
                </p>
              </header>
              <p className="mt-3 text-[14px] leading-7 text-[#e6edf5]">
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
              <header className="flex items-baseline justify-between border-b border-white/5 pb-2">
                <p className="text-[11px] uppercase tracking-[0.1em] text-[#7a8697]">
                  frame distribution
                </p>
                <p className="text-[10px] text-[#5d6675]">
                  {totalMixCoverage}% of framings observed
                </p>
              </header>

              {/* Large histogram */}
              <div className="mt-4">
                <div className="flex gap-2">
                  {ALL_FRAMES.map((frame) => {
                    const value = mixMap.get(frame) ?? 0;
                    return (
                      <span
                        key={frame}
                        className="flex-1 text-center text-[11px] tabular-nums"
                        style={{
                          color: value > 0 ? frameHue[frame] : "#3f4857",
                        }}
                      >
                        {value > 0 ? value : "·"}
                      </span>
                    );
                  })}
                </div>
                <div className="mt-2 flex h-24 items-end gap-2 border-b border-white/10 pb-px">
                  {ALL_FRAMES.map((frame, index) => {
                    const value = mixMap.get(frame) ?? 0;
                    const pct = (value / frameMax) * 100;
                    const isDominant = frame === country.dominantFrame;
                    return (
                      <div
                        key={frame}
                        className="relative flex h-full flex-1 items-end"
                      >
                        <div
                          className="ago-bar w-full rounded-t-[2px]"
                          style={{
                            height: value === 0 ? "4px" : `${Math.max(pct, 6)}%`,
                            background:
                              value > 0
                                ? frameHue[frame]
                                : "rgba(255,255,255,0.06)",
                            boxShadow: isDominant
                              ? `0 0 0 1px ${frameHue[frame]}80`
                              : undefined,
                            animationDelay: `${index * 60}ms`,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-2 text-[10px] uppercase tracking-[0.08em]">
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
            </section>

            {/* Framing landscape */}
            <section
              className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4"
              style={{
                borderTop: `2px solid ${frameHue[country.dominantFrame]}`,
              }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7a8697]">
                framing landscape
              </p>
              <p
                className="mt-2 text-[18px] font-semibold"
                style={{ color: frameHue[country.dominantFrame] }}
              >
                {frameLabels[country.dominantFrame]}
              </p>
              <p className="mt-1 text-[12px] font-semibold text-[#e6edf5]">
                {frameDefinition[country.dominantFrame].short}
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-[#7a8697]">
                {frameDefinition[country.dominantFrame].long}
              </p>
              <p className="mt-3 border-t border-white/5 pt-3 text-[12px] leading-relaxed text-[#cdd6e1]">
                {analysis?.framing_landscape ?? country.rationale}
              </p>
            </section>

            <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
              <header className="flex items-baseline justify-between border-b border-white/5 pb-2">
                <p className="text-[11px] uppercase tracking-[0.1em] text-[#7a8697]">
                  operational profile
                </p>
                <p className="text-[10px] text-[#5d6675]">
                  recurring requirements and consequences
                </p>
              </header>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <MetricPillList
                  label="top safeguard requirements"
                  emptyLabel="No extracted requirements yet"
                  items={
                    topRequirements.length
                      ? topRequirements.map((entry) => ({
                          label: humanizeJurisdictionAnalysisLabel(entry.label),
                          count: entry.count,
                          share: entry.share,
                        }))
                      : country.requirements.map((label) => ({
                          label,
                        }))
                  }
                />
                <MetricPillList
                  label="top enforcement hooks"
                  emptyLabel="No explicit enforcement hooks yet"
                  items={topEnforcement.map((entry) => ({
                    label: humanizeJurisdictionAnalysisLabel(entry.label),
                    count: entry.count,
                    share: entry.share,
                  }))}
                />
              </div>
            </section>

            {analysis?.key_sources?.length ? (
              <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
                <header className="flex items-baseline justify-between border-b border-white/5 pb-2">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-[#7a8697]">
                    key sources in this readout
                  </p>
                  <p className="text-[10px] text-[#5d6675]">
                    selected from the analyzed corpus
                  </p>
                </header>
                <div className="mt-3 grid gap-3">
                  {analysis.key_sources.map((source) => (
                    <div
                      key={source.document_id}
                      className="rounded-[4px] border border-white/10 bg-white/[0.03] px-3 py-3"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Link
                          href={`/documents/${source.document_id}`}
                          className="text-[12px] font-semibold text-[#e6edf5] transition-colors hover:text-white"
                        >
                          {source.title}
                        </Link>
                        <span className="text-[10px] uppercase tracking-[0.08em] text-[#5d6675]">
                          {source.publication_date ?? "date unknown"}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.08em] text-[#7a8697]">
                        {source.document_type ? (
                          <span>
                            {humanizeJurisdictionAnalysisLabel(
                              source.document_type,
                            )}
                          </span>
                        ) : null}
                        {source.binding_strength ? (
                          <span className="text-[#5d6675]">
                            {humanizeJurisdictionAnalysisLabel(
                              source.binding_strength,
                            )}
                          </span>
                        ) : null}
                        {source.dominant_frame ? (
                          <span
                            style={{
                              color: jurisdictionAnalysisFrameColor(
                                source.dominant_frame,
                              ),
                            }}
                          >
                            {humanizeJurisdictionAnalysisLabel(
                              source.dominant_frame,
                            )}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-[12px] leading-relaxed text-[#cdd6e1]">
                        {source.contribution}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Latest documents for this jurisdiction */}
            <section className="rounded-sm border border-white/10 bg-[#0f1623]">
              <header className="flex items-baseline justify-between border-b border-white/5 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.1em] text-[#7a8697]">
                  latest documents · {country.shortName}
                </p>
                <p className="text-[10px] text-[#5d6675]">
                  {countryDocuments.length} shown
                </p>
              </header>
              {countryDocuments.length === 0 ? (
                <p className="px-4 py-6 text-center text-[11px] text-[#5d6675]">
                  no documents ingested yet
                </p>
              ) : (
                <ol>
                  {countryDocuments.map((doc) => (
                    <li key={doc.id}>
                      <Link
                        href={`/documents/${doc.id}`}
                        className="grid grid-cols-[60px_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/5 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-white/[0.03]"
                      >
                        <span className="text-[10px] tabular-nums text-[#5d6675]">
                          {doc.updatedAt}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-medium text-[#e6edf5] underline decoration-transparent decoration-dotted underline-offset-2 transition-colors group-hover:text-white">
                            {doc.title}
                          </p>
                          <p className="truncate text-[9px] uppercase tracking-wider text-[#5d6675]">
                            {doc.documentType}
                            <span className="mx-1 text-[#3f4857]">·</span>
                            <span style={{ color: frameHue[doc.dominantFrame] }}>
                              {frameAbbr[doc.dominantFrame]}{" "}
                              {frameLabels[doc.dominantFrame]}
                            </span>
                          </p>
                        </div>
                        <StatePill state={doc.reviewState} />
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
              <header className="flex items-baseline justify-between border-b border-white/5 pb-2">
                <p className="text-[11px] uppercase tracking-[0.1em] text-[#7a8697]">
                  distance to peers
                </p>
                <p className="text-[10px] text-[#5d6675]">composite score</p>
              </header>
              <ul className="mt-3 flex flex-col gap-2.5">
                {distances.map((entry, index) => {
                  const color = scoreHexDark(entry.score);
                  return (
                    <li
                      key={entry.other.slug}
                      className="grid grid-cols-[20px_32px_minmax(0,1fr)_28px] items-center gap-2"
                    >
                      <Image
                        src={entry.other.flagUrl}
                        alt=""
                        width={18}
                        height={13}
                        className="h-[13px] w-[18px] rounded-[1px] border border-white/10 object-cover"
                        unoptimized
                      />
                      <Link
                        href={`/jurisdictions/${entry.other.slug}`}
                        className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#cdd6e1] transition-colors hover:text-[#e6edf5]"
                      >
                        {entry.other.shortName}
                      </Link>
                      <div className="h-[6px] overflow-hidden rounded-[1px] bg-white/5">
                        <div
                          className="ago-bar-x h-[6px] rounded-[1px]"
                          style={{
                            width: `${entry.score}%`,
                            background: color,
                            animationDelay: `${index * 80}ms`,
                          }}
                        />
                      </div>
                      <span
                        className="text-right text-[12px] font-semibold tabular-nums"
                        style={{ color }}
                      >
                        {entry.score}
                      </span>
                    </li>
                  );
                })}
              </ul>

              {farthest && closest ? (
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/5 pt-3 text-[10px] uppercase tracking-wider text-[#5d6675]">
                  <div>
                    <p>farthest</p>
                    <p
                      className="mt-1 text-[13px] font-semibold tabular-nums"
                      style={{ color: scoreHexDark(farthest.score) }}
                    >
                      {farthest.other.shortName} · {farthest.score}
                    </p>
                    <p className="mt-0.5 text-[10px] normal-case tracking-normal text-[#7a8697]">
                      {farthest.other.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p>closest</p>
                    <p
                      className="mt-1 text-[13px] font-semibold tabular-nums"
                      style={{ color: scoreHexDark(closest.score) }}
                    >
                      {closest.other.shortName} · {closest.score}
                    </p>
                    <p className="mt-0.5 text-[10px] normal-case tracking-normal text-[#7a8697]">
                      {closest.other.name}
                    </p>
                  </div>
                </div>
              ) : null}
            </section>

            {analysis ? (
              <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
                <header className="flex items-baseline justify-between border-b border-white/5 pb-2">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-[#7a8697]">
                    institutional anchors
                  </p>
                  <p className="text-[10px] text-[#5d6675]">
                    repeated issuers and authorities
                  </p>
                </header>
                <div className="mt-3">
                  <MetricPillList
                    label="institutions"
                    emptyLabel="No institutions extracted yet"
                    items={analysis.key_institutions.map((label) => ({ label }))}
                  />
                </div>
              </section>
            ) : null}

            {analysis ? (
              <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
                <header className="flex items-baseline justify-between border-b border-white/5 pb-2">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-[#7a8697]">
                    policy mix
                  </p>
                  <p className="text-[10px] text-[#5d6675]">
                    binding profile and document types
                  </p>
                </header>
                <div className="mt-3 grid gap-4">
                  <MetricPillList
                    label="binding strengths"
                    emptyLabel="No binding profile yet"
                    items={topBinding.map((entry) => ({
                      label: humanizeJurisdictionAnalysisLabel(entry.label),
                      count: entry.count,
                      share: entry.share,
                    }))}
                  />
                  <MetricPillList
                    label="document types"
                    emptyLabel="No document-type mix yet"
                    items={topDocumentTypes.map((entry) => ({
                      label: humanizeJurisdictionAnalysisLabel(entry.label),
                      count: entry.count,
                      share: entry.share,
                    }))}
                  />
                </div>
              </section>
            ) : null}

            {/* Jump to other jurisdictions */}
            <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.1em] text-[#7a8697]">
                jump to
              </p>
              <ul className="mt-3 flex flex-col gap-1.5">
                {data.countries.map((other) => {
                  const isCurrent = other.slug === slug;
                  return (
                    <li key={other.slug}>
                      <Link
                        href={`/jurisdictions/${other.slug}`}
                        aria-current={isCurrent ? "page" : undefined}
                        className={`flex items-center gap-2.5 rounded-[2px] border px-2 py-1.5 text-[11px] transition-colors ${
                          isCurrent
                            ? "border-white/30 bg-white/[0.06] text-[#e6edf5]"
                            : "border-white/10 text-[#cdd6e1] hover:border-white/20 hover:bg-white/[0.03]"
                        }`}
                      >
                        <Image
                          src={other.flagUrl}
                          alt=""
                          width={18}
                          height={13}
                          className="h-[13px] w-[18px] rounded-[1px] border border-white/10 object-cover"
                          unoptimized
                        />
                        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7a8697]">
                          {other.shortName}
                        </span>
                        <span className="truncate">{other.name}</span>
                        <span
                          className="ml-auto text-[11px] font-semibold tabular-nums"
                          style={{
                            color: scoreHexDark(other.compositeDivergence),
                          }}
                        >
                          {other.compositeDivergence}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          </aside>
        </div>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[10px] uppercase tracking-wider text-[#3f4857]">
          <span>
            Project Babel · {country.name} · snapshot {data.snapshotDate}
          </span>
          <Link href="/" className="transition-colors hover:text-[#e6edf5]">
            ← back to overview
          </Link>
        </footer>
      </div>
    </main>
  );
}

function NarrativePanel({
  label,
  body,
}: {
  label: string;
  body: string;
}) {
  return (
    <div className="rounded-[4px] border border-white/10 bg-white/[0.03] px-3 py-3">
      <p className="text-[10px] uppercase tracking-[0.08em] text-[#7a8697]">
        {label}
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-[#cdd6e1]">{body}</p>
    </div>
  );
}

function MetricPillList({
  label,
  items,
  emptyLabel,
}: {
  label: string;
  items: { label: string; count?: number; share?: number }[];
  emptyLabel: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.08em] text-[#7a8697]">
        {label}
      </p>
      {items.length ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {items.map((item) => (
            <li
              key={`${item.label}-${item.count ?? 0}`}
              className="rounded-[4px] border border-white/10 bg-white/[0.03] px-2.5 py-1"
            >
              <span className="text-[12px] text-[#e6edf5]">{item.label}</span>
              {item.count !== undefined ? (
                <span className="ml-2 text-[10px] uppercase tracking-[0.08em] text-[#7a8697]">
                  {item.count}
                  {item.share !== undefined
                    ? ` · ${Math.round(item.share * 100)}%`
                    : ""}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[12px] text-[#5d6675]">{emptyLabel}</p>
      )}
    </div>
  );
}

function BigScore({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  const color = scoreHexDark(value);
  return (
    <div className={emphasis ? "text-center" : "text-center"}>
      <p className="text-[9px] uppercase tracking-[0.14em] text-[#5d6675]">
        {label}
      </p>
      <p
        className={`mt-1 font-semibold leading-none tabular-nums ${
          emphasis ? "text-[44px]" : "text-[24px]"
        }`}
        style={{ color }}
      >
        {value}
      </p>
      <div
        className="mx-auto mt-2 h-[3px] rounded-[1px]"
        style={{
          width: emphasis ? 72 : 48,
          background: `linear-gradient(to right, ${color}, ${color}40)`,
        }}
      />
    </div>
  );
}

function StatePill({ state }: { state: "approved" | "review" | "draft" }) {
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
