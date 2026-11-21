"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";

import { copyTextToClipboard } from "@/app/_components/copy-button";

import type {
  DocumentDetail,
  EvidenceSpan,
  ExtractedControl,
} from "@/lib/document-data";
import {
  frameAbbr,
  frameDefinition,
  frameHue,
  frameTextHue,
  scoreHexDark,
} from "@/lib/frame-vocab";
import {
  findQuoteAcrossSections,
  type QuoteGroundingStatus,
  type QuoteMatchResult,
} from "@/lib/quote-matcher";
import {
  frameLabels,
  type CountrySnapshot,
  type FrameLabel,
  type NullCalibration,
} from "@/lib/seed-data";
import {
  isCjkText,
  OBLIGATION_STRENGTH_COLORS,
} from "@/lib/taxonomy-vocab";

type IndexedQuote = {
  id: string;
  label: string;
  span: EvidenceSpan;
  match: QuoteMatchResult;
};

const HASH_EVENT = "observatory:hashchange";

function subscribeHash(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("hashchange", callback);
  window.addEventListener(HASH_EVENT, callback);
  return () => {
    window.removeEventListener("hashchange", callback);
    window.removeEventListener(HASH_EVENT, callback);
  };
}

function getHashSnapshot(): string {
  return typeof window === "undefined" ? "" : window.location.hash;
}

function getServerHashSnapshot(): string {
  return "";
}

function setUrlHash(nextHash: string) {
  if (typeof window === "undefined") return;
  const target = `${window.location.pathname}${window.location.search}${nextHash}`;
  window.history.replaceState(null, "", target);
  window.dispatchEvent(new Event(HASH_EVENT));
}

function renderSpanHighlight(
  content: string,
  startChar: number,
  endChar: number,
) {
  if (startChar < 0 || endChar <= startChar || endChar > content.length) {
    return content;
  }
  const before = content.slice(0, startChar);
  const matched = content.slice(startChar, endChar);
  const after = content.slice(endChar);
  return (
    <>
      {before}
      <mark
        id="active-evidence-mark"
        className="rounded-[2px] bg-[#38bdf8]/25 px-0.5 text-[#f8fafc] ring-1 ring-[#67e8f9]/70"
      >
        {matched}
      </mark>
      {after}
    </>
  );
}

export function DocumentEvidenceReader({
  document,
  countrySnapshot,
  nullCalibration,
}: {
  document: DocumentDetail;
  countrySnapshot?: CountrySnapshot;
  nullCalibration?: NullCalibration;
}) {
  const urlHash = useSyncExternalStore(
    subscribeHash,
    getHashSnapshot,
    getServerHashSnapshot,
  );
  const [sectionFilter, setSectionFilter] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Precompute verified quote grounding across all parsed sections via NFKC +
  // whitespace/hyphen-insensitive offset mapping (C4).
  const quoteIndex = useMemo(() => {
    const byId = new Map<string, IndexedQuote>();

    const register = (id: string, label: string, span: EvidenceSpan) => {
      const match = findQuoteAcrossSections(document.sections, span.quote, {
        startChar: span.startChar,
        endChar: span.endChar,
      });
      byId.set(id, { id, label, span, match });
    };

    document.framingEvidence.forEach((span, idx) => {
      register(`quote-frm-${idx + 1}`, "Risk framing", span);
    });
    document.safetyRequirements.forEach((req) => {
      req.evidence.forEach((span, idx) => {
        register(`quote-req-${req.key}-${idx + 1}`, req.label, span);
      });
    });
    document.enforcementMechanisms.forEach((mech) => {
      mech.evidence.forEach((span, idx) => {
        register(`quote-enf-${mech.key}-${idx + 1}`, mech.label, span);
      });
    });

    return byId;
  }, [document]);

  const groundingCounts = useMemo(() => {
    let verbatim = 0;
    let approximate = 0;
    let notFound = 0;
    for (const entry of quoteIndex.values()) {
      if (entry.match.status === "verbatim") verbatim += 1;
      else if (entry.match.status === "approximate") approximate += 1;
      else notFound += 1;
    }
    return { total: quoteIndex.size, verbatim, approximate, notFound };
  }, [quoteIndex]);

  // Active quote driven directly from #quote-... URL hash (supports deep permalinks!)
  const activeQuote: IndexedQuote | null = useMemo(() => {
    const hashId = urlHash.replace(/^#/, "");
    if (!hashId) return null;
    return quoteIndex.get(hashId) ?? null;
  }, [urlHash, quoteIndex]);

  function selectQuote(id: string) {
    const target = quoteIndex.get(id);
    if (!target) return;
    setUrlHash(`#${id}`);
    setSectionFilter("");

    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        const markEl = window.document.getElementById("active-evidence-mark");
        if (markEl) {
          markEl.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
        if (target.match.sectionIndex >= 0) {
          const secEl = window.document.getElementById(
            `doc-section-${target.match.sectionIndex}`,
          );
          secEl?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 45);
    }
  }

  function clearActiveQuote() {
    setUrlHash("");
  }

  async function copyCitation(entry: IndexedQuote) {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/documents/${encodeURIComponent(document.id)}#${entry.id}`
        : `https://project-babel.com/documents/${encodeURIComponent(document.id)}#${entry.id}`;
    const sectionPart = entry.span.sourceSection
      ? `, ${entry.span.sourceSection}`
      : "";
    const text = `"${entry.span.quote}" — ${document.title} (${document.jurisdiction}, ${document.publicationDate}${sectionPart}). ${url}`;
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedId(entry.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    }
  }

  const visibleSections = useMemo(() => {
    const q = sectionFilter.trim().toLowerCase();
    return document.sections
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => {
        if (!q) return true;
        return (
          (section.heading ?? "").toLowerCase().includes(q) ||
          section.content.toLowerCase().includes(q)
        );
      });
  }, [document.sections, sectionFilter]);

  const maxFrameShare = Math.max(
    ...document.frameScores.map((f) => f.share),
    1,
  );

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start">
      {/* STICKY LEFT RAIL (C4) */}
      <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
        {/* Verification status summary */}
        {groundingCounts.total > 0 ? (
          <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
              <span className="font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
                quote verification
              </span>
              <span className="tabular-nums text-[#67e8f9]">
                {groundingCounts.verbatim}/{groundingCounts.total} verbatim
              </span>
            </div>
            <p className="mt-1 text-[12px] text-[#94a3b8]">
              {groundingCounts.verbatim} exact · {groundingCounts.approximate}{" "}
              approximate · {groundingCounts.notFound} unmatched in parsed text.
              Click any quote to jump and link directly via{" "}
              <code className="font-mono text-[11px] text-[#cbd5e1]">
                #quote
              </code>
              .
            </p>
          </section>
        ) : null}

        {/* Dominant frame */}
        <section
          className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4"
          style={
            document.dominantFrame
              ? { borderTop: `2px solid ${frameHue[document.dominantFrame]}` }
              : undefined
          }
        >
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
            dominant framing
          </h2>
          {document.dominantFrame ? (
            <>
              <div className="mt-2 flex items-baseline gap-2">
                <span
                  className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em]"
                  style={{ color: frameTextHue[document.dominantFrame] }}
                >
                  {frameAbbr[document.dominantFrame]}
                </span>
                <p
                  className="text-[15px] font-semibold"
                  style={{ color: frameTextHue[document.dominantFrame] }}
                >
                  {frameLabels[document.dominantFrame]}
                </p>
              </div>
              <p className="mt-1 text-[13px] font-medium text-[#f1f5f9]">
                {frameDefinition[document.dominantFrame].short}
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[#94a3b8]">
                {frameDefinition[document.dominantFrame].long}
              </p>
            </>
          ) : (
            <p className="mt-2 text-[12px] text-[#94a3b8]">
              Not classified yet.
            </p>
          )}

          {document.secondaryFrames.length > 0 ? (
            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
                secondary frames
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {document.secondaryFrames.map((frame) => (
                  <FrameChip key={frame} frame={frame} />
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {/* All 8 frame confidence bars */}
        <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
              8-frame distribution
            </h2>
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
              100% share · self-rep
            </span>
          </div>
          <ul className="mt-3 flex flex-col gap-1.5 font-mono text-[11px]">
            {document.frameScores.map((item) => (
              <li
                key={item.label}
                className="grid grid-cols-[34px_minmax(0,1fr)_38px_40px] items-center gap-2"
              >
                <span
                  className="font-semibold uppercase tracking-wider"
                  style={{
                    color: item.share > 0 ? frameTextHue[item.label] : "#7c8a9e",
                  }}
                >
                  {frameAbbr[item.label]}
                </span>
                <div className="h-[6px] overflow-hidden rounded-[1px] bg-white/10">
                  <div
                    className="h-full rounded-[1px]"
                    style={{
                      width: `${Math.round((item.share / maxFrameShare) * 100)}%`,
                      background:
                        item.share > 0
                          ? frameHue[item.label]
                          : "rgba(255,255,255,0.08)",
                    }}
                  />
                </div>
                <span className="text-right tabular-nums text-[#f1f5f9]">
                  {item.share}%
                </span>
                <span
                  className="text-right tabular-nums text-[#94a3b8]"
                  title="Model self-reported frame score (0.00–1.00)"
                >
                  {item.rawScore > 0 ? item.rawScore.toFixed(2) : "—"}
                </span>
              </li>
            ))}
          </ul>

          {document.framingEvidence.length > 0 ? (
            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
                framing evidence ({document.framingEvidence.length})
              </p>
              <EvidenceList
                ids={document.framingEvidence.map(
                  (_, idx) => `quote-frm-${idx + 1}`,
                )}
                quoteIndex={quoteIndex}
                languageCode={document.languageCode}
                activeId={activeQuote?.id ?? null}
                onSelect={selectQuote}
              />
            </div>
          ) : null}
        </section>

        {/* Safeguard requirements */}
        <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
              safeguard requirements
            </h2>
            <span className="font-mono text-[11px] tabular-nums text-[#94a3b8]">
              {document.safetyRequirements.length}
            </span>
          </div>
          {document.safetyRequirements.length > 0 ? (
            <ul className="mt-2.5 flex flex-col gap-2">
              {document.safetyRequirements.map((req) => (
                <ControlCard
                  key={req.key}
                  control={req}
                  prefix={`quote-req-${req.key}`}
                  dotColor="#38bdf8"
                  quoteIndex={quoteIndex}
                  languageCode={document.languageCode}
                  activeId={activeQuote?.id ?? null}
                  onSelect={selectQuote}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] text-[#94a3b8]">
              No safeguard requirements extracted.
            </p>
          )}
        </section>

        {/* Enforcement mechanisms */}
        <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
              enforcement mechanisms
            </h2>
            <span className="font-mono text-[11px] tabular-nums text-[#94a3b8]">
              {document.enforcementMechanisms.length}
            </span>
          </div>
          {document.enforcementMechanisms.length > 0 ? (
            <ul className="mt-2.5 flex flex-col gap-2">
              {document.enforcementMechanisms.map((mech) => (
                <ControlCard
                  key={mech.key}
                  control={mech}
                  prefix={`quote-enf-${mech.key}`}
                  dotColor="#67e8f9"
                  quoteIndex={quoteIndex}
                  languageCode={document.languageCode}
                  activeId={activeQuote?.id ?? null}
                  onSelect={selectQuote}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] text-[#94a3b8]">
              No enforcement mechanisms extracted.
            </p>
          )}
        </section>

        {/* Covered application domains + implementation notes */}
        {document.coveredApplicationDomains.length > 0 ||
        document.implementationNotes ? (
          <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
              scope &amp; implementation notes
            </h2>
            {document.coveredApplicationDomains.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {document.coveredApplicationDomains.map((domain) => (
                  <li
                    key={domain.key}
                    className="rounded-[2px] border border-white/15 bg-white/[0.03] px-2 py-0.5 text-[11px] text-[#cbd5e1]"
                  >
                    {domain.label}
                  </li>
                ))}
              </ul>
            ) : null}
            {document.implementationNotes ? (
              <p className="mt-3 text-[13px] leading-relaxed text-[#cbd5e1]">
                {document.implementationNotes}
              </p>
            ) : null}
          </section>
        ) : null}

        {/* Provenance & parser notes */}
        <section className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
            provenance &amp; parser notes
          </h2>
          <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 font-mono text-[11px]">
            <dt className="uppercase tracking-[0.06em] text-[#94a3b8]">
              parser
            </dt>
            <dd className="text-right text-[#cbd5e1]">
              {document.parserVersion}
            </dd>
            <dt className="uppercase tracking-[0.06em] text-[#94a3b8]">
              taxonomy
            </dt>
            <dd className="text-right text-[#cbd5e1]">
              v{document.provenance.taxonomyVersion}
            </dd>
            {document.provenance.model ? (
              <>
                <dt className="uppercase tracking-[0.06em] text-[#94a3b8]">
                  model
                </dt>
                <dd className="text-right text-[#cbd5e1]">
                  {document.provenance.model}
                </dd>
              </>
            ) : null}
            {document.provenance.analyzedAt ? (
              <>
                <dt className="uppercase tracking-[0.06em] text-[#94a3b8]">
                  analyzed
                </dt>
                <dd className="text-right text-[#cbd5e1]">
                  {document.provenance.analyzedAt}
                </dd>
              </>
            ) : null}
            {document.provenance.extractionPromptHash ? (
              <>
                <dt className="uppercase tracking-[0.06em] text-[#94a3b8]">
                  prompt hash
                </dt>
                <dd className="truncate text-right text-[#94a3b8]">
                  {document.provenance.extractionPromptHash.slice(0, 12)}
                </dd>
              </>
            ) : null}
          </dl>
          {document.warnings.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1.5 border-t border-white/10 pt-3">
              {document.warnings.map((warning) => (
                <li
                  key={warning}
                  className="rounded-[2px] border border-[#e6ae49]/35 bg-[#e6ae49]/10 px-2.5 py-1.5 text-[11px] leading-snug text-[#e6ae49]"
                >
                  {warning}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2.5 border-t border-white/10 pt-2 font-mono text-[11px] text-[#94a3b8]">
              no parser warnings recorded
            </p>
          )}
        </section>

        {/* Jurisdiction context */}
        {countrySnapshot ? (
          <Link
            href={`/jurisdictions/${countrySnapshot.slug}`}
            className="flex flex-col gap-2 rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4 transition-colors hover:border-white/25 hover:bg-[#101a2c]"
          >
            <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.1em] text-[#94a3b8]">
              <p className="font-semibold">jurisdiction context</p>
              <span aria-hidden>→</span>
            </div>
            <div className="flex items-center gap-2">
              <Image
                src={countrySnapshot.flagUrl}
                alt=""
                width={22}
                height={16}
                className="h-[16px] w-[22px] rounded-[1px] border border-white/15 object-cover"
                unoptimized
              />
              <span className="text-[13px] font-medium text-[#f1f5f9]">
                {countrySnapshot.name}
              </span>
            </div>
            <dl className="mt-1 grid grid-cols-3 gap-2 border-t border-white/10 pt-2 text-center font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
              <div>
                <dt>POL</dt>
                <dd
                  className="mt-0.5 text-[15px] font-semibold tabular-nums"
                  style={{
                    color: scoreHexDark(
                      countrySnapshot.policyDivergence,
                      nullCalibration?.countryPolicyMean,
                      nullCalibration?.countryPolicyP90,
                      "country",
                    ),
                  }}
                >
                  {countrySnapshot.policyDivergence}
                </dd>
              </div>
              <div>
                <dt>FRM</dt>
                <dd
                  className="mt-0.5 text-[15px] font-semibold tabular-nums"
                  style={{
                    color: scoreHexDark(
                      countrySnapshot.framingDivergence,
                      nullCalibration?.countryFramingMean,
                      nullCalibration?.countryFramingP90,
                      "country",
                    ),
                  }}
                >
                  {countrySnapshot.framingDivergence}
                </dd>
              </div>
              <div>
                <dt>COV</dt>
                <dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-[#e2e8f0]">
                  {countrySnapshot.coverageDivergence}
                </dd>
              </div>
            </dl>
          </Link>
        ) : null}
      </aside>

      {/* MAIN — normalized text with NFKC verified highlighting & section contents */}
      <section className="rounded-sm border border-white/10 bg-[#0f1623]">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-5 py-3.5">
          <div>
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
              normalized text &amp; verified evidence grounding
            </h2>
            <p className="mt-0.5 text-[12px] text-[#94a3b8]">
              {document.sections.length} section
              {document.sections.length === 1 ? "" : "s"} · select any quote on
              the left to highlight its verified span
            </p>
          </div>
          <input
            type="search"
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            placeholder="filter sections…"
            aria-label="Filter document sections"
            className="w-52 rounded-[2px] border border-white/15 bg-[#0a0f18] px-2.5 py-1.5 text-[12px] text-[#f1f5f9] placeholder:text-[#7c8a9e]"
          />
        </header>

        {/* Jumpable Section Contents when multiple sections exist (C4) */}
        {document.sections.length > 1 ? (
          <nav
            aria-label="Section contents"
            className="border-b border-white/10 bg-[#0a0f18]/60 px-5 py-2.5"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#94a3b8]">
              contents
            </p>
            <ol className="mt-1.5 flex flex-wrap gap-1.5">
              {document.sections.map((section, idx) => (
                <li key={`toc-${idx}`}>
                  <a
                    href={`#doc-section-${idx}`}
                    className="inline-flex items-center gap-1 rounded-[2px] border border-white/10 bg-white/[0.02] px-2 py-0.5 text-[11px] text-[#cbd5e1] transition-colors hover:border-[#38bdf8]/50 hover:text-white"
                  >
                    <span className="font-mono text-[#94a3b8]">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="max-w-[200px] truncate">
                      {section.heading || `Section ${idx + 1}`}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        {/* Active highlighted quote banner with grounding badge + Copy Citation */}
        {activeQuote ? (
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#38bdf8]/35 bg-[#38bdf8]/10 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                <span className="font-semibold uppercase tracking-[0.08em] text-[#67e8f9]">
                  {activeQuote.label}
                </span>
                <GroundingBadge status={activeQuote.match.status} />
                {activeQuote.span.sourceSection ? (
                  <span className="text-[#cbd5e1]">
                    § {activeQuote.span.sourceSection}
                  </span>
                ) : null}
                {activeQuote.match.sectionIndex >= 0 ? (
                  <span className="text-[#94a3b8]">
                    section{" "}
                    {String(activeQuote.match.sectionIndex + 1).padStart(2, "0")}
                  </span>
                ) : (
                  <span className="text-[#e6ae49]">
                    span not located in parsed text
                  </span>
                )}
              </div>

              <blockquote
                lang={document.languageCode}
                className={`mt-2 text-[13px] leading-relaxed text-[#f1f5f9] ${
                  isCjkText(activeQuote.span.quote) ? "not-italic" : "italic"
                }`}
              >
                &ldquo;{activeQuote.span.quote}&rdquo;
              </blockquote>

              {activeQuote.span.quoteEn ? (
                <p className="mt-1.5 text-[12px] leading-relaxed text-[#cbd5e1]">
                  <span className="mr-1.5 rounded-[2px] border border-white/20 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] uppercase text-[#94a3b8]">
                    machine translation
                  </span>
                  {activeQuote.span.quoteEn}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2 font-mono text-[11px]">
              <button
                type="button"
                aria-live="polite"
                onClick={() => copyCitation(activeQuote)}
                className="rounded-[2px] border border-[#38bdf8]/50 bg-[#0a0f18] px-2.5 py-1 uppercase tracking-wider text-[#67e8f9] transition-colors hover:border-[#67e8f9] hover:text-white"
              >
                {copiedId === activeQuote.id ? "copied ✓" : "copy citation"}
              </button>
              <button
                type="button"
                onClick={clearActiveQuote}
                className="rounded-[2px] border border-white/20 px-2.5 py-1 uppercase tracking-wider text-[#e2e8f0] hover:border-white/40"
              >
                clear
              </button>
            </div>
          </div>
        ) : null}

        <div className="px-5 py-5">
          {visibleSections.length === 0 ? (
            <p className="text-[13px] text-[#94a3b8]">
              No sections match that filter.
            </p>
          ) : (
            <ol className="flex flex-col gap-6">
              {visibleSections.map(({ section, index }) => {
                const isMatchedSection =
                  activeQuote !== null &&
                  activeQuote.match.sectionIndex === index &&
                  activeQuote.match.startChar >= 0;
                return (
                  <li
                    key={`${section.heading ?? "section"}-${index}`}
                    id={`doc-section-${index}`}
                    className={`flex flex-col gap-2 rounded-[2px] transition-colors ${
                      isMatchedSection
                        ? "border border-[#38bdf8]/45 bg-[#38bdf8]/[0.05] p-3.5"
                        : ""
                    }`}
                  >
                    <div className="flex items-baseline gap-3 border-b border-white/10 pb-1.5">
                      <span className="font-mono text-[11px] tabular-nums text-[#94a3b8]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <h3
                        lang={document.languageCode}
                        className="text-[14px] font-semibold text-[#f1f5f9]"
                      >
                        {section.heading || `Section ${index + 1}`}
                      </h3>
                    </div>
                    <p
                      lang={document.languageCode}
                      className="max-w-[76ch] whitespace-pre-wrap text-[14px] leading-[1.8] text-[#cbd5e1]"
                    >
                      {isMatchedSection && activeQuote
                        ? renderSpanHighlight(
                            section.content,
                            activeQuote.match.startChar,
                            activeQuote.match.endChar,
                          )
                        : section.content}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}

function GroundingBadge({ status }: { status: QuoteGroundingStatus }) {
  if (status === "verbatim") {
    return (
      <span className="rounded-[2px] border border-[#67e8f9]/45 bg-[#67e8f9]/15 px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wider text-[#67e8f9]">
        verbatim
      </span>
    );
  }
  if (status === "approximate") {
    return (
      <span className="rounded-[2px] border border-[#38bdf8]/40 bg-[#38bdf8]/12 px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wider text-[#7dd3fc]">
        approx
      </span>
    );
  }
  return (
    <span className="rounded-[2px] border border-white/15 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
      unmatched
    </span>
  );
}

function ControlCard({
  control,
  prefix,
  dotColor,
  quoteIndex,
  languageCode,
  activeId,
  onSelect,
}: {
  control: ExtractedControl;
  prefix: string;
  dotColor: string;
  quoteIndex: Map<string, IndexedQuote>;
  languageCode: string;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const oblColor = control.obligationStrength
    ? (OBLIGATION_STRENGTH_COLORS[control.obligationStrength] ?? "#94a3b8")
    : null;

  return (
    <li className="rounded-[2px] border border-white/10 bg-[#0a0f18] px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-[#f1f5f9]">
          <span
            aria-hidden
            className="h-[6px] w-[6px] shrink-0 rounded-[1px]"
            style={{ background: dotColor }}
          />
          <span className="truncate">{control.label}</span>
        </span>
        <div className="flex items-center gap-1.5 font-mono text-[11px]">
          {control.obligationStrengthLabel && oblColor ? (
            <span
              className="rounded-[2px] border px-1.5 py-0.5 uppercase"
              style={{
                color: oblColor,
                borderColor: `${oblColor}50`,
                backgroundColor: `${oblColor}14`,
              }}
            >
              {control.obligationStrengthLabel}
            </span>
          ) : null}
          {control.confidence !== null ? (
            <span
              className="tabular-nums text-[#94a3b8]"
              title="Model self-reported confidence"
            >
              {Math.round(control.confidence * 100)}%
            </span>
          ) : null}
        </div>
      </div>
      {control.evidence.length > 0 ? (
        <EvidenceList
          ids={control.evidence.map((_, idx) => `${prefix}-${idx + 1}`)}
          quoteIndex={quoteIndex}
          languageCode={languageCode}
          activeId={activeId}
          onSelect={onSelect}
        />
      ) : null}
    </li>
  );
}

function EvidenceList({
  ids,
  quoteIndex,
  languageCode,
  activeId,
  onSelect,
}: {
  ids: string[];
  quoteIndex: Map<string, IndexedQuote>;
  languageCode: string;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {ids.map((id) => {
        const entry = quoteIndex.get(id);
        if (!entry) return null;
        const isSelected = activeId === id;
        const cjk = isCjkText(entry.span.quote);
        return (
          <li key={id} id={id}>
            <button
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(id)}
              className={`w-full rounded-[2px] border px-2.5 py-2 text-left text-[12px] leading-relaxed transition-colors ${
                isSelected
                  ? "border-[#67e8f9]/70 bg-[#38bdf8]/15 text-[#f8fafc]"
                  : "border-white/10 bg-white/[0.02] text-[#cbd5e1] hover:border-white/25 hover:text-[#f8fafc]"
              }`}
            >
              <span
                lang={languageCode}
                className={`line-clamp-3 block ${cjk ? "not-italic" : ""}`}
              >
                &ldquo;{entry.span.quote}&rdquo;
              </span>
              {entry.span.quoteEn ? (
                <span className="mt-1 line-clamp-2 block text-[11px] text-[#94a3b8]">
                  [MT] {entry.span.quoteEn}
                </span>
              ) : null}
              <span className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5 font-mono text-[11px] text-[#94a3b8]">
                <span className="truncate">
                  {entry.span.sourceSection
                    ? `§ ${entry.span.sourceSection}`
                    : "jump to text"}
                </span>
                <GroundingBadge status={entry.match.status} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function FrameChip({ frame }: { frame: FrameLabel }) {
  const barColor = frameHue[frame];
  const textColor = frameTextHue[frame];
  return (
    <li
      className="flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em]"
      style={{
        borderColor: `${barColor}66`,
        color: textColor,
        background: `${barColor}18`,
      }}
    >
      <span
        aria-hidden
        className="h-[8px] w-[8px] rounded-[1px]"
        style={{ background: barColor }}
      />
      {frameAbbr[frame]}
      <span className="font-sans normal-case text-[#cbd5e1]">
        {frameLabels[frame]}
      </span>
    </li>
  );
}
