"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { frameAbbr, frameHue } from "@/lib/frame-vocab";
import type { DocumentListItem } from "@/lib/document-data";
import { allFrameLabels, type FrameLabel } from "@/lib/seed-data";

type AnalysisState = DocumentListItem["analysisState"];
type JurisdictionOption = { slug: string; shortName: string; flagUrl: string };

export function DocumentsList({
  documents,
  jurisdictions,
  initialJurisdiction,
  initialState,
  initialFrame,
  initialQuery,
}: {
  documents: DocumentListItem[];
  jurisdictions: JurisdictionOption[];
  initialJurisdiction: string | undefined;
  initialState: string | undefined;
  initialFrame: string | undefined;
  initialQuery: string;
}) {
  const [jSlug, setJSlug] = useState<string | undefined>(initialJurisdiction);
  const [state, setState] = useState<AnalysisState | undefined>(
    isAnalysisState(initialState) ? initialState : undefined,
  );
  const [frame, setFrame] = useState<FrameLabel | undefined>(
    isFrameLabel(initialFrame) ? initialFrame : undefined,
  );
  const [query, setQuery] = useState(initialQuery);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((doc) => {
      if (jSlug && toSlug(doc.jurisdiction) !== jSlug) return false;
      if (state && doc.analysisState !== state) return false;
      if (frame && doc.dominantFrame !== frame) return false;
      if (q && !doc.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [documents, jSlug, state, frame, query]);

  // Facet counts — based on the current filter context (excluding the
  // facet being shown, so users can see what's still reachable).
  const jurisdictionCounts = useMemo(
    () => countBy(documents, jSlug, state, frame, query, "jurisdiction"),
    [documents, jSlug, state, frame, query],
  );
  const stateCounts = useMemo(
    () => countBy(documents, jSlug, state, frame, query, "state"),
    [documents, jSlug, state, frame, query],
  );
  const frameCounts = useMemo(
    () => countBy(documents, jSlug, state, frame, query, "frame"),
    [documents, jSlug, state, frame, query],
  );

  function syncUrl(
    updates: Partial<{
      j: string | undefined;
      s: string | undefined;
      f: string | undefined;
      q: string;
    }>,
  ) {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const current = {
      j: params.get("j") ?? undefined,
      s: params.get("s") ?? undefined,
      f: params.get("f") ?? undefined,
      q: params.get("q") ?? "",
    };
    const next = { ...current, ...updates };
    const out = new URLSearchParams();
    if (next.j) out.set("j", next.j);
    if (next.s) out.set("s", next.s);
    if (next.f) out.set("f", next.f);
    if (next.q) out.set("q", next.q);
    const qs = out.toString();
    const url = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(null, "", url);
  }

  function selectJurisdiction(slug: string | undefined) {
    setJSlug(slug);
    syncUrl({ j: slug });
  }
  function selectState(next: AnalysisState | undefined) {
    setState(next);
    syncUrl({ s: next });
  }
  function selectFrame(next: FrameLabel | undefined) {
    setFrame(next);
    syncUrl({ f: next });
  }
  function setQueryAndSync(next: string) {
    setQuery(next);
    syncUrl({ q: next });
  }

  const hasFilter = Boolean(jSlug || state || frame || query.trim());

  return (
    <div className="flex flex-col gap-3">
      {/* Filter panel */}
      <div className="rounded-sm border border-white/10 bg-[#0f1623]">
        <div className="flex items-baseline justify-between border-b border-white/5 px-4 py-2.5">
          <p className="text-[11px] uppercase tracking-[0.1em] text-[#7a8697]">
            filters
          </p>
          <p className="text-[10px] text-[#5d6675]">
            {filtered.length} of {documents.length} documents
            {hasFilter ? (
              <button
                type="button"
                onClick={() => {
                  setJSlug(undefined);
                  setState(undefined);
                  setFrame(undefined);
                  setQuery("");
                  if (typeof window !== "undefined") {
                    window.history.replaceState(
                      null,
                      "",
                      window.location.pathname,
                    );
                  }
                }}
                className="ml-3 rounded-[2px] border border-white/15 px-2 py-0.5 text-[9px] uppercase tracking-wider text-[#7a8697] transition-colors hover:border-white/30 hover:text-[#e6edf5]"
              >
                clear all
              </button>
            ) : null}
          </p>
        </div>

        <div className="grid gap-2.5 px-4 py-3 md:grid-cols-[auto_1fr]">
          {/* Search input */}
          <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-[#5d6675] md:col-span-2">
            <span>search</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQueryAndSync(e.target.value)}
              placeholder="title contains…"
              className="w-full min-w-0 flex-1 rounded-[2px] border border-white/10 bg-[#0a0f18] px-2.5 py-1 text-[12px] normal-case tracking-normal text-[#e6edf5] placeholder:text-[#3f4857] focus:border-white/30 focus:outline-none"
            />
          </label>

          {/* Jurisdiction row */}
          <span className="pt-1 text-[10px] uppercase tracking-[0.1em] text-[#5d6675]">
            jurisdiction
          </span>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip
              isActive={!jSlug}
              onClick={() => selectJurisdiction(undefined)}
              label="all"
              count={jurisdictionCounts.get("__all__") ?? 0}
            />
            {jurisdictions.map((jur) => {
              const isActive = jur.slug === jSlug;
              return (
                <FilterChip
                  key={jur.slug}
                  isActive={isActive}
                  onClick={() =>
                    selectJurisdiction(isActive ? undefined : jur.slug)
                  }
                  label={jur.shortName}
                  count={jurisdictionCounts.get(jur.slug) ?? 0}
                  flag={
                    <Image
                      src={jur.flagUrl}
                      alt=""
                      width={14}
                      height={10}
                      className="rounded-[1px] border border-white/10 object-cover"
                      unoptimized
                    />
                  }
                />
              );
            })}
          </div>

          {/* State row */}
          <span className="pt-1 text-[10px] uppercase tracking-[0.1em] text-[#5d6675]">
            analysis state
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { key: undefined, label: "all" },
                { key: "analyzed", label: "analyzed" },
                { key: "parsed", label: "parsed" },
              ] as const
            ).map((opt) => {
              const isActive =
                opt.key === undefined ? !state : state === opt.key;
              return (
                <FilterChip
                  key={opt.label}
                  isActive={isActive}
                  onClick={() =>
                    selectState(
                      opt.key === undefined
                        ? undefined
                        : isActive
                          ? undefined
                          : opt.key,
                    )
                  }
                  label={opt.label}
                  count={
                    opt.key === undefined
                      ? stateCounts.get("__all__") ?? 0
                      : stateCounts.get(opt.key) ?? 0
                  }
                />
              );
            })}
          </div>

          {/* Frame row */}
          <span className="pt-1 text-[10px] uppercase tracking-[0.1em] text-[#5d6675]">
            risk framing
          </span>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip
              isActive={!frame}
              onClick={() => selectFrame(undefined)}
              label="all"
              count={frameCounts.get("__all__") ?? 0}
            />
            {allFrameLabels.map((f) => {
              const isActive = frame === f;
              return (
                <FilterChip
                  key={f}
                  isActive={isActive}
                  onClick={() => selectFrame(isActive ? undefined : f)}
                  label={frameAbbr[f]}
                  count={frameCounts.get(f) ?? 0}
                  accentColor={frameHue[f]}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Document list */}
      <div className="rounded-sm border border-white/10 bg-[#0f1623]">
        <div className="flex items-baseline justify-between border-b border-white/5 px-4 py-2.5">
          <p className="text-[11px] uppercase tracking-[0.1em] text-[#7a8697]">
            documents
          </p>
          <p className="text-[10px] text-[#5d6675]">
            {filtered.length} shown · newest first
          </p>
        </div>

        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-[11px] text-[#5d6675]">
            no documents match the current filters
          </p>
        ) : (
          <ol className="divide-y divide-white/5">
            {filtered.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DocumentRow({ doc }: { doc: DocumentListItem }) {
  const frame = doc.dominantFrame;
  return (
    <li className="grid grid-cols-[72px_28px_minmax(0,2fr)_minmax(0,1fr)_88px_110px] items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02]">
      <span className="pt-0.5 text-[10px] tabular-nums text-[#5d6675]">
        {doc.publicationDate}
      </span>
      <div className="pt-0.5">
        <span
          aria-hidden
          className="block h-[13px] w-[18px] rounded-[1px] border border-white/10 bg-white/5"
        />
      </div>
      <div className="min-w-0">
        <Link
          href={doc.href}
          className="block truncate text-[12px] font-medium text-[#e6edf5] transition-colors hover:text-white"
        >
          {doc.title}
        </Link>
        <p className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-[#7a8697]">
          {doc.jurisdiction}
          <span className="mx-1 text-[#3f4857]">·</span>
          {doc.documentType}
        </p>
        {doc.topRequirements.length > 0 ? (
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {doc.topRequirements.slice(0, 3).map((req) => (
              <li
                key={`${doc.id}-${req}`}
                className="rounded-[1px] border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-[#cdd6e1]"
              >
                {req}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="min-w-0">
        {frame ? (
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-[8px] w-[8px] rounded-[1px]"
              style={{ background: frameHue[frame] }}
            />
            <span
              className="truncate text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: frameHue[frame] }}
            >
              {frameAbbr[frame]}
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-[#3f4857]">not classified</span>
        )}
      </div>
      <AnalysisPill state={doc.analysisState} />
    </li>
  );
}

function FilterChip({
  isActive,
  onClick,
  label,
  count,
  flag,
  accentColor,
}: {
  isActive: boolean;
  onClick: () => void;
  label: string;
  count: number;
  flag?: React.ReactNode;
  accentColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] transition-colors ${
        isActive
          ? "border-white/30 bg-white/[0.06] text-[#e6edf5]"
          : "border-white/10 text-[#7a8697] hover:border-white/20 hover:text-[#cdd6e1]"
      }`}
      style={
        isActive && accentColor
          ? { borderColor: `${accentColor}80`, color: accentColor }
          : undefined
      }
    >
      {flag}
      {accentColor && !flag ? (
        <span
          aria-hidden
          className="h-[8px] w-[8px] rounded-[1px]"
          style={{ background: accentColor }}
        />
      ) : null}
      {label}
      <span className="text-[#5d6675]">{count}</span>
    </button>
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
      className="inline-flex rounded-[2px] px-1.5 py-0.5 text-[9px] uppercase tracking-wider"
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

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function toSlug(jurisdictionName: string): string {
  return jurisdictionName.toLowerCase().replace(/\s+/g, "-");
}

function isAnalysisState(x: unknown): x is AnalysisState {
  return x === "analyzed" || x === "parsed";
}

function isFrameLabel(x: unknown): x is FrameLabel {
  return typeof x === "string" && allFrameLabels.includes(x as FrameLabel);
}

function countBy(
  docs: DocumentListItem[],
  jSlug: string | undefined,
  state: AnalysisState | undefined,
  frame: FrameLabel | undefined,
  query: string,
  dimension: "jurisdiction" | "state" | "frame",
): Map<string, number> {
  const q = query.trim().toLowerCase();
  const counts = new Map<string, number>();
  let total = 0;
  for (const doc of docs) {
    // Exclude the active dimension itself from the gate so its buckets
    // reflect "what would be left if I toggled a different value here".
    if (dimension !== "jurisdiction" && jSlug && toSlug(doc.jurisdiction) !== jSlug)
      continue;
    if (dimension !== "state" && state && doc.analysisState !== state)
      continue;
    if (dimension !== "frame" && frame && doc.dominantFrame !== frame)
      continue;
    if (q && !doc.title.toLowerCase().includes(q)) continue;

    total += 1;
    if (dimension === "jurisdiction") {
      const key = toSlug(doc.jurisdiction);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    } else if (dimension === "state") {
      counts.set(
        doc.analysisState,
        (counts.get(doc.analysisState) ?? 0) + 1,
      );
    } else if (dimension === "frame" && doc.dominantFrame) {
      counts.set(doc.dominantFrame, (counts.get(doc.dominantFrame) ?? 0) + 1);
    }
  }
  counts.set("__all__", total);
  return counts;
}
