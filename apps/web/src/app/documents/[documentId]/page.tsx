import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";

import { getDocumentDetail } from "@/lib/document-data";
import { getOverviewData } from "@/lib/overview-data";
import { frameAbbr, frameDefinition, frameHue } from "@/lib/frame-vocab";
import { frameLabels, type FrameLabel } from "@/lib/seed-data";
import { jurisdictionMeta, jurisdictionOrder } from "@/lib/jurisdictions";

export const dynamic = "force-dynamic";

type AnalysisState = "analyzed" | "parsed";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const [document, overview] = await Promise.all([
    getDocumentDetail(documentId),
    getOverviewData(),
  ]);

  if (!document) {
    notFound();
  }

  // Look up the jurisdiction slug by matching the display name back to a key.
  // getDocumentDetail returns jurisdiction as a display string ("United States")
  // and jurisdictionShort ("US"), but not the slug — reverse-lookup here.
  const jurisdictionEntry = jurisdictionOrder
    .map((key) => jurisdictionMeta[key])
    .find(
      (meta) =>
        meta.name === document.jurisdiction ||
        meta.shortName === document.jurisdictionShort,
    );
  const jurisdictionSlug = jurisdictionEntry?.slug;
  const jurisdictionFlag = jurisdictionEntry?.flagUrl;
  const countrySnapshot = overview.countries.find(
    (c) => c.slug === jurisdictionSlug,
  );

  return (
    <main className="min-h-screen bg-[#0a0f18] font-mono text-[13px] text-[#cdd6e1]">
      <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-[#5d6675]">
          <Link
            href="/"
            className="transition-colors hover:text-[#e6edf5]"
          >
            overview
          </Link>
          <span className="text-[#3f4857]">/</span>
          <Link
            href="/documents"
            className="transition-colors hover:text-[#e6edf5]"
          >
            documents
          </Link>
          <span className="text-[#3f4857]">/</span>
          <span className="truncate text-[#cdd6e1]">{document.id}</span>
        </div>

        {/* Masthead */}
        <header className="mt-4 border-y border-white/20 py-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            {/* Left: title block */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {jurisdictionFlag ? (
                  <Image
                    src={jurisdictionFlag}
                    alt=""
                    width={24}
                    height={18}
                    className="h-[18px] w-[24px] rounded-[2px] border border-white/15 object-cover"
                    unoptimized
                  />
                ) : null}
                {jurisdictionSlug ? (
                  <Link
                    href={`/jurisdictions/${jurisdictionSlug}`}
                    className="flex items-center gap-1 rounded-[2px] border border-dashed border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[#cdd6e1] transition-colors hover:border-solid hover:border-white/30 hover:text-[#e6edf5]"
                  >
                    <span>{document.jurisdictionShort}</span>
                    <span className="text-[#7a8697]">{document.jurisdiction}</span>
                    <span aria-hidden className="text-[#7a8697]">→</span>
                  </Link>
                ) : (
                  <span className="rounded-[2px] border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[#cdd6e1]">
                    {document.jurisdictionShort} {document.jurisdiction}
                  </span>
                )}
                <AnalysisPill state={document.analysisState as AnalysisState} />
                <span className="rounded-[2px] border border-white/10 bg-white/[0.02] px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-[#7a8697]">
                  {document.documentType}
                </span>
              </div>

              <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7a8697]">
                Document
              </p>
              <h1 className="mt-1 text-[22px] font-semibold leading-snug tracking-[0.005em] text-[#e6edf5]">
                {document.title}
              </h1>
              <p className="mt-4 max-w-[760px] text-[12.5px] leading-relaxed text-[#cdd6e1]">
                {document.rationaleSummary}
              </p>
            </div>

            {/* Right: metadata card */}
            <aside className="w-full min-w-[280px] rounded-sm border border-white/10 bg-[#0f1623] px-4 py-3 lg:w-auto">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7a8697]">
                metadata
              </p>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[11px]">
                <MetaRow label="published" value={document.publicationDate} />
                <MetaRow label="language" value={document.language} />
                <MetaRow label="issuing body" value={document.issuingBody} />
                <MetaRow label="parser" value={document.parserVersion} />
              </dl>
              {document.sourceUrl ? (
                <a
                  href={document.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 border-t border-white/5 pt-3 text-[10px] uppercase tracking-[0.12em] text-[#7a8697] transition-colors hover:text-[#e6edf5]"
                >
                  <span>official source</span>
                  <span aria-hidden>↗</span>
                </a>
              ) : null}
            </aside>
          </div>
        </header>

        {/* Two-column body */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* LEFT RAIL — classification + extraction */}
          <aside className="flex flex-col gap-3">
            {/* Dominant frame */}
            <section
              className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4"
              style={
                document.dominantFrame
                  ? {
                      borderTop: `2px solid ${frameHue[document.dominantFrame]}`,
                    }
                  : undefined
              }
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7a8697]">
                dominant framing
              </p>
              {document.dominantFrame ? (
                <>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span
                      className="text-[9px] font-semibold uppercase tracking-[0.14em]"
                      style={{ color: frameHue[document.dominantFrame] }}
                    >
                      {frameAbbr[document.dominantFrame]}
                    </span>
                    <p
                      className="text-[14px] font-semibold"
                      style={{ color: frameHue[document.dominantFrame] }}
                    >
                      {frameLabels[document.dominantFrame]}
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold text-[#e6edf5]">
                    {frameDefinition[document.dominantFrame].short}
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-[#7a8697]">
                    {frameDefinition[document.dominantFrame].long}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-[11px] text-[#5d6675]">
                  not classified yet
                </p>
              )}
            </section>

            {/* Secondary frames */}
            <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7a8697]">
                secondary frames
              </p>
              {document.secondaryFrames.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {document.secondaryFrames.map((frame) => (
                    <FrameChip key={frame} frame={frame} />
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[11px] text-[#5d6675]">
                  no secondary frames assigned
                </p>
              )}
            </section>

            {/* Requirements */}
            <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7a8697]">
                safeguard requirements
              </p>
              {document.topRequirements.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {document.topRequirements.map((req) => (
                    <li
                      key={req}
                      className="flex items-center gap-2 rounded-[2px] border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-[#cdd6e1]"
                    >
                      <span
                        aria-hidden
                        className="h-[6px] w-[6px] rounded-[1px] bg-[#29d391]"
                      />
                      <span className="truncate">{req}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[11px] text-[#5d6675]">
                  no requirements extracted
                </p>
              )}
            </section>

            {/* Enforcement */}
            <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7a8697]">
                enforcement
              </p>
              {document.enforcementMechanisms.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {document.enforcementMechanisms.map((mechanism) => (
                    <li
                      key={mechanism}
                      className="flex items-center gap-2 rounded-[2px] border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-[#cdd6e1]"
                    >
                      <span
                        aria-hidden
                        className="h-[6px] w-[6px] rounded-[1px] bg-[#f5a623]"
                      />
                      <span className="truncate">{mechanism}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[11px] text-[#5d6675]">
                  no enforcement mechanisms extracted
                </p>
              )}
            </section>

            {/* Parser notes */}
            <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7a8697]">
                parser notes
              </p>
              <p className="mt-2 text-[10px] uppercase tracking-[0.1em] text-[#5d6675]">
                version{" "}
                <span className="text-[#cdd6e1]">{document.parserVersion}</span>
              </p>
              {document.warnings.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {document.warnings.map((warning) => (
                    <li
                      key={warning}
                      className="rounded-[2px] border border-[#f5a623]/30 bg-[#f5a623]/10 px-2 py-1.5 text-[10px] leading-snug text-[#f5a623]"
                    >
                      {warning}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[10px] text-[#5d6675]">
                  no warnings recorded
                </p>
              )}
              {document.rawArtifactPath ? (
                <p className="mt-3 break-all border-t border-white/5 pt-3 text-[9px] text-[#3f4857]">
                  {document.rawArtifactPath}
                </p>
              ) : null}
            </section>

            {/* Context: jurisdiction scorecard */}
            {countrySnapshot ? (
              <Link
                href={`/jurisdictions/${countrySnapshot.slug}`}
                className="flex flex-col gap-2 rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4 transition-colors hover:border-white/20 hover:bg-[#101a2c]"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7a8697]">
                    jurisdiction context
                  </p>
                  <span
                    aria-hidden
                    className="text-[10px] text-[#7a8697]"
                  >
                    →
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Image
                    src={countrySnapshot.flagUrl}
                    alt=""
                    width={22}
                    height={16}
                    className="rounded-[1px] border border-white/10 object-cover"
                    unoptimized
                  />
                  <span className="text-[12px] text-[#e6edf5]">
                    {countrySnapshot.name}
                  </span>
                </div>
                <dl className="mt-1 grid grid-cols-3 gap-2 border-t border-white/5 pt-2 text-center text-[9px] uppercase tracking-wider text-[#5d6675]">
                  <div>
                    <dt>policy</dt>
                    <dd className="mt-0.5 text-[14px] font-semibold tabular-nums text-[#cdd6e1]">
                      {countrySnapshot.policyDivergence}
                    </dd>
                  </div>
                  <div>
                    <dt>framing</dt>
                    <dd className="mt-0.5 text-[14px] font-semibold tabular-nums text-[#cdd6e1]">
                      {countrySnapshot.framingDivergence}
                    </dd>
                  </div>
                  <div>
                    <dt>composite</dt>
                    <dd className="mt-0.5 text-[14px] font-semibold tabular-nums text-[#e6edf5]">
                      {countrySnapshot.compositeDivergence}
                    </dd>
                  </div>
                </dl>
              </Link>
            ) : null}
          </aside>

          {/* MAIN — normalized text */}
          <section className="rounded-sm border border-white/10 bg-[#0f1623]">
            <header className="flex items-baseline justify-between border-b border-white/5 px-5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7a8697]">
                normalized text
              </p>
              <p className="text-[10px] text-[#5d6675]">
                {document.sections.length} section
                {document.sections.length === 1 ? "" : "s"}
              </p>
            </header>
            <div className="px-5 py-5">
              {document.sections.length === 0 ? (
                <p className="text-[11px] text-[#5d6675]">
                  no parsed sections available
                </p>
              ) : (
                <ol className="flex flex-col gap-6">
                  {document.sections.map((section, index) => (
                    <li
                      key={`${section.heading ?? "section"}-${index}`}
                      className="flex flex-col gap-2"
                    >
                      <div className="flex items-baseline gap-3 border-b border-white/5 pb-1.5">
                        <span className="text-[10px] tabular-nums text-[#3f4857]">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#e6edf5]">
                          {section.heading || `Section ${index + 1}`}
                        </h2>
                      </div>
                      <p className="max-w-[75ch] whitespace-pre-wrap text-[12.5px] leading-[1.75] text-[#cdd6e1]">
                        {section.content}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[10px] uppercase tracking-wider text-[#3f4857]">
          <span>
            Project Babel · {document.jurisdictionShort} document · published{" "}
            {document.publicationDate}
          </span>
          <Link
            href="/documents"
            className="transition-colors hover:text-[#e6edf5]"
          >
            ← back to documents
          </Link>
        </footer>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[10px] uppercase tracking-[0.1em] text-[#5d6675]">
        {label}
      </dt>
      <dd className="text-right text-[11px] text-[#e6edf5]">{value}</dd>
    </>
  );
}

function FrameChip({ frame }: { frame: FrameLabel }) {
  const color = frameHue[frame];
  return (
    <li
      className="flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]"
      style={{
        borderColor: `${color}55`,
        color,
        background: `${color}10`,
      }}
    >
      <span
        aria-hidden
        className="h-[8px] w-[8px] rounded-[1px]"
        style={{ background: color }}
      />
      {frameAbbr[frame]}
      <span className="text-[#7a8697]">{frameLabels[frame]}</span>
    </li>
  );
}

function AnalysisPill({ state }: { state: AnalysisState }) {
  const map: Record<AnalysisState, { color: string; label: string }> = {
    analyzed: { color: "#4dd0e1", label: "analyzed" },
    parsed: { color: "#7a8697", label: "parsed" },
  };
  const s = map[state];
  return (
    <span
      className="rounded-[2px] px-1.5 py-0.5 text-[9px] uppercase tracking-wider"
      style={{
        color: s.color,
        background: `${s.color}1a`,
        border: `1px solid ${s.color}33`,
      }}
    >
      {s.label}
    </span>
  );
}
