"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { copyTextToClipboard } from "@/app/_components/copy-button";
import { TopNav } from "@/app/_components/top-nav";
import type { ClauseCategory, ClauseRecord } from "@/lib/clauses-filter";
import { frameAbbr, frameHue, frameTextHue } from "@/lib/frame-vocab";
import {
  allFrameLabels,
  frameLabels,
  type FrameLabel,
  type ScoringMode,
} from "@/lib/seed-data";
import {
  BINDING_LEVEL_LABELS,
  ENFORCEMENT_MECHANISM_ORDER,
  formatSubnationalBadge,
  humanizeEnforcement,
  humanizeObligationStrength,
  humanizeRequirement,
  isCjkText,
  OBLIGATION_STRENGTH_COLORS,
  parseIncludeSubnational,
  POLICY_REQUIREMENT_ORDER,
} from "@/lib/taxonomy-vocab";
import { replaceUrlQuery, useUrlSearch } from "@/lib/use-url-search";

type JurisdictionOption = {
  key: string;
  slug: string;
  shortName: string;
  name: string;
  flagUrl: string;
};

type ClausesApiPayload = {
  matchedCount: number;
  hasMore: boolean;
  clauses: ClauseRecord[];
};

const OBLIGATION_OPTIONS = [
  "mandatory",
  "conditional",
  "recommended",
  "aspirational",
] as const;

const PAGE_STEP = 40;

export function ClausesExplorer({
  totalDatasetClauses,
  totalDocuments,
  subnationalCount,
  initialMatchedCount,
  initialClauses,
  jurisdictions,
}: {
  totalDatasetClauses: number;
  totalDocuments: number;
  subnationalCount: number;
  initialMatchedCount: number;
  initialClauses: ClauseRecord[];
  jurisdictions: JurisdictionOption[];
}) {
  const urlSearch = useUrlSearch();
  const params = useMemo(() => new URLSearchParams(urlSearch), [urlSearch]);

  const rawMode = params.get("mode")?.toLowerCase();
  const mode: ScoringMode =
    rawMode === "all" || rawMode === "equal" ? "all" : "headline";
  const hasSubnational = subnationalCount > 0;
  const includeSubnational =
    hasSubnational && parseIncludeSubnational(params.get("states"));

  const rawCategory = params.get("category");
  const category: ClauseCategory | "all" =
    rawCategory === "requirement" ||
    rawCategory === "enforcement" ||
    rawCategory === "framing"
      ? rawCategory
      : "all";
  const control = params.get("control") ?? "";
  const jurisdiction = params.get("j") ?? "";
  const minLevel = Number(params.get("minLevel") ?? "0") || 0;
  const obligation = params.get("obligation") ?? "";
  const query = params.get("q") ?? "";

  const [clauses, setClauses] = useState<ClauseRecord[]>(initialClauses);
  const [matchedCount, setMatchedCount] = useState<number>(initialMatchedCount);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const isDefaultFilter =
    mode === "headline" &&
    !includeSubnational &&
    category === "all" &&
    !control &&
    !jurisdiction &&
    minLevel === 0 &&
    !obligation &&
    !query.trim();

  function syncUrl(
    updates: Partial<{
      mode: ScoringMode;
      states: boolean;
      category: ClauseCategory | "all";
      control: string;
      j: string;
      minLevel: number;
      obligation: string;
      q: string;
    }>,
  ) {
    replaceUrlQuery((p) => {
      if ("mode" in updates) {
        if (updates.mode === "all") p.set("mode", "all");
        else p.delete("mode");
      }
      if ("states" in updates) {
        if (updates.states) p.set("states", "1");
        else p.delete("states");
      }
      if ("category" in updates) {
        if (updates.category && updates.category !== "all") {
          p.set("category", updates.category);
        } else {
          p.delete("category");
        }
      }
      if ("control" in updates) {
        if (updates.control) p.set("control", updates.control);
        else p.delete("control");
      }
      if ("j" in updates) {
        if (updates.j) p.set("j", updates.j);
        else p.delete("j");
      }
      if ("minLevel" in updates) {
        if (updates.minLevel && updates.minLevel > 0) {
          p.set("minLevel", String(updates.minLevel));
        } else {
          p.delete("minLevel");
        }
      }
      if ("obligation" in updates) {
        if (updates.obligation) p.set("obligation", updates.obligation);
        else p.delete("obligation");
      }
      if ("q" in updates) {
        if (updates.q) p.set("q", updates.q);
        else p.delete("q");
      }
    });
  }

  function clearFilters() {
    replaceUrlQuery((p) => {
      for (const k of [
        "category",
        "control",
        "j",
        "minLevel",
        "obligation",
        "q",
      ]) {
        p.delete(k);
      }
    });
  }

  const controlOptions = useMemo(() => {
    const reqOpts = POLICY_REQUIREMENT_ORDER.map((k) => ({
      value: `requirement:${k}`,
      label: humanizeRequirement(k),
      group: "Safeguard Requirements (17)",
    }));
    const enfOpts = ENFORCEMENT_MECHANISM_ORDER.filter(
      (k) => k !== "none_specified",
    ).map((k) => ({
      value: `enforcement:${k}`,
      label: humanizeEnforcement(k),
      group: "Enforcement Mechanisms (8)",
    }));
    const frmOpts = allFrameLabels.map((k) => ({
      value: `framing:${k}`,
      label: frameLabels[k],
      group: "Risk Framing Rationales (8)",
    }));
    if (category === "requirement") return reqOpts;
    if (category === "enforcement") return enfOpts;
    if (category === "framing") return frmOpts;
    return [...reqOpts, ...enfOpts, ...frmOpts];
  }, [category]);

  const apiQuery = useMemo(() => {
    const sp = new URLSearchParams();
    if (mode === "all") sp.set("mode", "all");
    if (includeSubnational) sp.set("states", "1");
    if (category !== "all") sp.set("category", category);
    if (control) sp.set("control", control);
    if (jurisdiction) sp.set("j", jurisdiction);
    if (minLevel > 0) sp.set("minLevel", String(minLevel));
    if (obligation) sp.set("obligation", obligation);
    if (query.trim()) sp.set("q", query.trim());
    return sp.toString();
  }, [
    mode,
    includeSubnational,
    category,
    control,
    jurisdiction,
    minLevel,
    obligation,
    query,
  ]);

  // Progressive server-side query against /api/clauses whenever filters differ from default SSR page
  useEffect(() => {
    if (isDefaultFilter) {
      setClauses(initialClauses);
      setMatchedCount(initialMatchedCount);
      setLoadError(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const delayMs = query.trim() ? 180 : 0;
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const qs = new URLSearchParams(apiQuery);
        qs.set("limit", String(PAGE_STEP));
        qs.set("offset", "0");
        const res = await fetch(`/api/clauses?${qs.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as ClausesApiPayload;
        setClauses(json.clauses);
        setMatchedCount(json.matchedCount);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          setLoadError("Unable to refresh clauses right now.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    apiQuery,
    initialClauses,
    initialMatchedCount,
    isDefaultFilter,
    query,
  ]);

  async function handleLoadMore() {
    if (isLoadingMore || clauses.length >= matchedCount) return;
    setIsLoadingMore(true);
    setLoadError(null);
    try {
      const qs = new URLSearchParams(apiQuery);
      qs.set("limit", String(PAGE_STEP));
      qs.set("offset", String(clauses.length));
      const res = await fetch(`/api/clauses?${qs.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ClausesApiPayload;
      setClauses((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        const next = json.clauses.filter((c) => !seen.has(c.id));
        return [...prev, ...next];
      });
      setMatchedCount(json.matchedCount);
    } catch {
      setLoadError("Unable to load additional clauses right now.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function handleCopyCitation(item: ClauseRecord) {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://project-babel.com";
    const url = `${origin}/documents/${encodeURIComponent(item.documentId)}#${item.anchorId}`;
    const sec = item.sourceSection ? `, ${item.sourceSection}` : "";
    const citation = `"${item.quote}" — ${item.documentTitle} (${item.jurisdictionName}, ${item.publicationDate}${sec}). ${url}`;
    const ok = await copyTextToClipboard(citation);
    if (ok) {
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    }
  }

  const hasFilters = Boolean(
    category !== "all" ||
      control ||
      jurisdiction ||
      minLevel > 0 ||
      obligation ||
      query.trim(),
  );

  const csvDownloadHref = `/api/clauses?${apiQuery ? `${apiQuery}&` : ""}format=csv`;
  const jsonDownloadHref = `/api/clauses?${apiQuery ? `${apiQuery}&` : ""}format=json&download=1`;

  return (
    <main className="min-h-screen bg-[#0a0f18] font-sans text-[14px] text-[#cdd6e1]">
      <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
        <TopNav active="clauses" />

        {/* Masthead */}
        <header className="border-y border-white/20 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">
                CROSS-JURISDICTION CITATION WORKBENCH · 100% VERBATIM QUOTES
              </p>
              <h1 className="mt-1.5 text-[24px] font-semibold tracking-[-0.01em] text-[#f1f5f9]">
                Clause &amp; Citation Explorer
              </h1>
              <p className="mt-2 text-[14px] leading-relaxed text-[#cbd5e1]">
                Search, filter, and export{" "}
                <strong className="font-medium text-[#f8fafc] tabular-nums">
                  {totalDatasetClauses.toLocaleString()}
                </strong>{" "}
                evidence-grounded multilingual clauses across{" "}
                <span className="tabular-nums text-[#f1f5f9]">
                  {totalDocuments}
                </span>{" "}
                official documents. Every citation deep-links directly to its
                highlighted verbatim passage in the full primary text.
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div
                role="group"
                aria-label="Clause corpus scope"
                className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em]"
              >
                <button
                  type="button"
                  aria-pressed={mode === "headline"}
                  onClick={() => syncUrl({ mode: "headline" })}
                  className={`rounded-[2px] border px-2.5 py-1 transition-colors ${
                    mode === "headline"
                      ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 font-semibold text-[#f1f5f9]"
                      : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                  }`}
                >
                  active primary
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "all"}
                  onClick={() => syncUrl({ mode: "all" })}
                  className={`rounded-[2px] border px-2.5 py-1 transition-colors ${
                    mode === "all"
                      ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 font-semibold text-[#f1f5f9]"
                      : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                  }`}
                >
                  full corpus
                </button>
                {hasSubnational ? (
                  <button
                    type="button"
                    aria-pressed={includeSubnational}
                    onClick={() => syncUrl({ states: !includeSubnational })}
                    className={`rounded-[2px] border px-2.5 py-1 transition-colors ${
                      includeSubnational
                        ? "border-[#e6ae49]/60 bg-[#e6ae49]/15 font-semibold text-[#fef3c7]"
                        : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                    }`}
                  >
                    {includeSubnational ? "✓ " : "+ "}U.S. State Laws (
                    {subnationalCount})
                  </button>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
                <a
                  href={csvDownloadHref}
                  className="rounded-[2px] border border-white/20 bg-white/[0.04] px-2.5 py-1 text-[#cbd5e1] transition-colors hover:border-[#67e8f9]/60 hover:text-white"
                >
                  download csv ({matchedCount.toLocaleString()}) ↓
                </a>
                <a
                  href={jsonDownloadHref}
                  className="rounded-[2px] border border-white/20 bg-white/[0.04] px-2.5 py-1 text-[#cbd5e1] transition-colors hover:border-[#67e8f9]/60 hover:text-white"
                >
                  json ↓
                </a>
                <a
                  href={`/api/clauses${apiQuery ? `?${apiQuery}` : ""}`}
                  className="text-[#67e8f9] underline decoration-[#67e8f9]/40 underline-offset-2 hover:text-white"
                >
                  api ↗
                </a>
              </div>
            </div>
          </div>
          {includeSubnational ? (
            <p className="mt-3 rounded-[2px] border border-[#e6ae49]/35 bg-[#e6ae49]/10 px-3 py-2 text-[12px] leading-relaxed text-[#fef3c7]">
              <strong className="font-semibold">
                U.S. state statutory overlay active (+{subnationalCount} state
                statutes):
              </strong>{" "}
              Enacted U.S. state AI statutes are included alongside sovereign
              federal instruments and labeled by state.
            </p>
          ) : null}
        </header>

        {/* Filter Bar */}
        <section
          aria-label="Filter clauses"
          className="mt-4 rounded-sm border border-white/10 bg-[#0f1623] p-4"
        >
          <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr]">
            <label className="flex flex-col gap-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
              <span>full-text search (native, [mt] english, title, section)</span>
              <input
                type="search"
                value={query}
                onChange={(e) => syncUrl({ q: e.target.value })}
                placeholder="e.g. red-teaming, watermark, 제31조, 生成合成, systemic risk…"
                className="rounded-[2px] border border-white/15 bg-[#0a0f18] px-3 py-1.5 font-sans text-[13px] normal-case tracking-normal text-[#f1f5f9] placeholder:text-[#7c8a9e]"
              />
            </label>

            <label className="flex flex-col gap-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
              <span>taxonomy control / frame</span>
              <select
                value={control}
                onChange={(e) => syncUrl({ control: e.target.value })}
                className="rounded-[2px] border border-white/15 bg-[#0a0f18] px-2.5 py-1.5 font-sans text-[13px] normal-case text-[#f1f5f9]"
              >
                <option value="">All controls &amp; frames</option>
                {controlOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
              <span>obligation strength</span>
              <select
                value={obligation}
                onChange={(e) => syncUrl({ obligation: e.target.value })}
                className="rounded-[2px] border border-white/15 bg-[#0a0f18] px-2.5 py-1.5 font-sans text-[13px] normal-case text-[#f1f5f9]"
              >
                <option value="">Any obligation strength</option>
                {OBLIGATION_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {humanizeObligationStrength(o)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3 font-mono text-[11px] uppercase tracking-[0.06em]">
            {/* Category chips */}
            <div
              role="group"
              aria-label="Filter by taxonomy category"
              className="flex flex-wrap items-center gap-1.5"
            >
              <span className="text-[#94a3b8]">type</span>
              {(
                [
                  ["all", "all"],
                  ["requirement", "requirements"],
                  ["enforcement", "enforcement"],
                  ["framing", "risk framing"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={category === key}
                  onClick={() => syncUrl({ category: key, control: "" })}
                  className={`rounded-[2px] border px-2 py-0.5 transition-colors ${
                    category === key
                      ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 text-[#f1f5f9]"
                      : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Jurisdiction chips */}
            <div
              role="group"
              aria-label="Filter by jurisdiction"
              className="flex flex-wrap items-center gap-1.5"
            >
              <span className="text-[#94a3b8]">jurisdiction</span>
              <button
                type="button"
                aria-pressed={!jurisdiction}
                onClick={() => syncUrl({ j: "" })}
                className={`rounded-[2px] border px-2 py-0.5 transition-colors ${
                  !jurisdiction
                    ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 text-[#f1f5f9]"
                    : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                }`}
              >
                all
              </button>
              {jurisdictions.map((j) => {
                const active = jurisdiction === j.slug;
                return (
                  <button
                    key={j.slug}
                    type="button"
                    aria-pressed={active}
                    onClick={() => syncUrl({ j: active ? "" : j.slug })}
                    className={`inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 transition-colors ${
                      active
                        ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 text-[#f1f5f9]"
                        : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                    }`}
                  >
                    <Image
                      src={j.flagUrl}
                      alt=""
                      width={14}
                      height={10}
                      className="h-[10px] w-[14px] rounded-[1px] border border-white/15 object-cover"
                      unoptimized
                    />
                    {j.shortName}
                  </button>
                );
              })}
            </div>

            {/* Minimum binding level chips */}
            <div
              role="group"
              aria-label="Filter by minimum binding level"
              className="flex flex-wrap items-center gap-1.5"
            >
              <span className="text-[#94a3b8]">binding</span>
              {[0, 1, 2, 3, 4].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  aria-pressed={minLevel === lvl}
                  onClick={() => syncUrl({ minLevel: lvl })}
                  className={`rounded-[2px] border px-2 py-0.5 transition-colors ${
                    minLevel === lvl
                      ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 text-[#f1f5f9]"
                      : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                  }`}
                >
                  {lvl === 0 ? "any" : lvl === 4 ? "L4 law" : `≥ L${lvl}`}
                </button>
              ))}
              {hasFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="ml-2 rounded-[2px] border border-white/25 px-2 py-0.5 text-[#f1f5f9] hover:border-white/45"
                >
                  clear
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {/* Results summary */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
          <span>
            {isLoading ? (
              <span className="text-[#67e8f9]">filtering citations…</span>
            ) : (
              <>
                showing{" "}
                <strong className="tabular-nums text-[#f1f5f9]">
                  {clauses.length}
                </strong>{" "}
                of{" "}
                <strong className="tabular-nums text-[#67e8f9]">
                  {matchedCount.toLocaleString()}
                </strong>{" "}
                matching verbatim citations
              </>
            )}
          </span>
          <span>
            deep links jump directly to highlighted &lt;mark&gt; passage
          </span>
        </div>

        {loadError ? (
          <p className="mt-3 rounded-sm border border-[#e6ae49]/40 bg-[#e6ae49]/10 px-4 py-2.5 text-[13px] text-[#fef3c7]">
            {loadError}
          </p>
        ) : null}

        {/* Citation cards */}
        {clauses.length === 0 && !isLoading ? (
          <div className="mt-3 rounded-sm border border-white/10 bg-[#0f1623] px-6 py-12 text-center">
            <p className="text-[15px] font-medium text-[#f1f5f9]">
              No verbatim clauses match your current filters.
            </p>
            <p className="mt-1.5 text-[13px] text-[#94a3b8]">
              Try switching to Full Corpus, clearing a constraint, or searching
              with broader keywords.
            </p>
          </div>
        ) : (
          <ol className="mt-3 grid gap-3 lg:grid-cols-2">
            {clauses.map((item) => (
              <ClauseCard
                key={item.id}
                item={item}
                copied={copiedId === item.id}
                onCopy={() => handleCopyCitation(item)}
              />
            ))}
          </ol>
        )}

        {clauses.length < matchedCount ? (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              disabled={isLoadingMore}
              onClick={handleLoadMore}
              className="rounded-[2px] border border-[#38bdf8]/50 bg-[#0f1623] px-5 py-2 font-mono text-[12px] uppercase tracking-wider text-[#67e8f9] transition-colors hover:border-[#67e8f9] hover:bg-[#38bdf8]/15 hover:text-white disabled:opacity-60"
            >
              {isLoadingMore
                ? "loading more citations…"
                : `load ${Math.min(PAGE_STEP, matchedCount - clauses.length)} more citations (${(matchedCount - clauses.length).toLocaleString()} remaining)`}
            </button>
          </div>
        ) : null}

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
          <span>
            Project Babel · {totalDatasetClauses.toLocaleString()} grounded
            citations across {totalDocuments} official instruments
          </span>
          <Link href="/" className="transition-colors hover:text-[#f1f5f9]">
            ← back to overview
          </Link>
        </footer>
      </div>
    </main>
  );
}

function ClauseCard({
  item,
  copied,
  onCopy,
}: {
  item: ClauseRecord;
  copied: boolean;
  onCopy: () => void;
}) {
  const cjk = isCjkText(item.quote);
  const stateBadge = formatSubnationalBadge(item.subnationalUnit);
  const oblColor = item.obligationStrength
    ? (OBLIGATION_STRENGTH_COLORS[item.obligationStrength] ?? "#94a3b8")
    : null;
  const frameKey =
    item.category === "framing" ? (item.controlKey as FrameLabel) : null;

  return (
    <li className="flex flex-col justify-between rounded-sm border border-white/10 bg-[#0f1623] p-4 transition-colors hover:border-white/25">
      <div>
        {/* Top badges */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
          <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-white/15 bg-[#0a0f18] px-2 py-0.5 text-[#f1f5f9]">
            {item.flagUrl ? (
              <Image
                src={item.flagUrl}
                alt=""
                width={15}
                height={11}
                className="h-[11px] w-[15px] rounded-[1px] border border-white/15 object-cover"
                unoptimized
              />
            ) : null}
            {item.jurisdictionShort}
          </span>

          {frameKey && frameTextHue[frameKey] ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 font-semibold"
              style={{
                color: frameTextHue[frameKey],
                borderColor: `${frameHue[frameKey]}66`,
                backgroundColor: `${frameHue[frameKey]}1a`,
              }}
            >
              {frameAbbr[frameKey]} · {item.controlLabel}
            </span>
          ) : (
            <span className="rounded-[2px] border border-[#38bdf8]/40 bg-[#38bdf8]/12 px-2 py-0.5 font-semibold text-[#7dd3fc]">
              {item.category === "requirement" ? "REQ" : "ENF"} ·{" "}
              {item.controlLabel}
            </span>
          )}

          <span
            className="rounded-[2px] border border-white/15 bg-[#0a0f18] px-1.5 py-0.5 text-[#cbd5e1]"
            title={BINDING_LEVEL_LABELS[item.bindingLevel]}
          >
            L{item.bindingLevel} · {item.bindingStrengthLabel}
          </span>

          {item.obligationStrengthLabel && oblColor ? (
            <span
              className="rounded-[2px] border px-1.5 py-0.5 uppercase"
              style={{
                color: oblColor,
                borderColor: `${oblColor}50`,
                backgroundColor: `${oblColor}14`,
              }}
            >
              {item.obligationStrengthLabel}
            </span>
          ) : null}

          {stateBadge ? (
            <span className="rounded-[2px] border border-[#e6ae49]/45 bg-[#e6ae49]/15 px-1.5 py-0.5 font-semibold text-[#fef3c7]">
              {stateBadge}
            </span>
          ) : null}
        </div>

        {/* Verbatim native excerpt */}
        <blockquote className="mt-3 border-l-2 border-[#38bdf8]/60 pl-3">
          <p
            lang={item.languageCode}
            className={`text-[13.5px] leading-relaxed text-[#f1f5f9] ${
              cjk ? "not-italic" : "italic"
            }`}
          >
            &ldquo;{item.quote}&rdquo;
          </p>
          {item.quoteEn ? (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#cbd5e1]">
              <span className="mr-1.5 rounded-[2px] border border-white/20 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] uppercase text-[#94a3b8]">
                MT
              </span>
              {item.quoteEn}
            </p>
          ) : null}
        </blockquote>
      </div>

      {/* Document metadata & deep-link footer */}
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5">
        <div className="min-w-0 flex-1">
          <Link
            href={`/documents/${encodeURIComponent(item.documentId)}#${item.anchorId}`}
            lang={item.languageCode}
            className="block truncate text-[12.5px] font-medium text-[#e2e8f0] underline decoration-white/25 underline-offset-2 hover:text-[#67e8f9]"
          >
            {item.documentTitle}
          </Link>
          <p className="mt-0.5 truncate font-mono text-[11px] text-[#94a3b8]">
            {item.publicationDate}
            {item.sourceSection ? ` · § ${item.sourceSection}` : ""}
            {item.groundingStatus ? ` · ${item.groundingStatus}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 font-mono text-[11px]">
          <button
            type="button"
            aria-live="polite"
            onClick={onCopy}
            className={`rounded-[2px] border px-2 py-0.5 uppercase tracking-wider transition-colors ${
              copied
                ? "border-[#38bdf8]/70 bg-[#38bdf8]/15 text-[#67e8f9]"
                : "border-white/15 text-[#cbd5e1] hover:border-white/35 hover:text-white"
            }`}
          >
            {copied ? "copied ✓" : "cite"}
          </button>
          <Link
            href={`/documents/${encodeURIComponent(item.documentId)}#${item.anchorId}`}
            className="rounded-[2px] border border-[#38bdf8]/45 bg-[#38bdf8]/10 px-2 py-0.5 uppercase tracking-wider text-[#67e8f9] transition-colors hover:border-[#67e8f9] hover:text-white"
          >
            open passage →
          </Link>
        </div>
      </div>
    </li>
  );
}
