"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";

import type { DocumentListItem } from "@/lib/document-data";
import { frameAbbr, frameHue, frameTextHue } from "@/lib/frame-vocab";
import { allFrameLabels, type FrameLabel } from "@/lib/seed-data";
import {
  BINDING_STRENGTH_COLORS,
  BINDING_STRENGTH_ORDER,
  CORPUS_ROLE_ORDER,
  DOCUMENT_TYPE_LABELS,
  formatSubnationalBadge,
  humanizeBindingStrength,
  humanizeCorpusRole,
  humanizeDocumentType,
  humanizeLifecycleStage,
  humanizeRequirement,
  LIFECYCLE_STAGE_ORDER,
} from "@/lib/taxonomy-vocab";
import { replaceUrlQuery, useUrlSearch } from "@/lib/use-url-search";

type AnalysisState = DocumentListItem["analysisState"];
type SortOption =
  | "date_desc"
  | "date_asc"
  | "conf_desc"
  | "conf_asc"
  | "title_asc";
type JurisdictionOption = {
  slug: string;
  shortName: string;
  name: string;
  flagUrl: string;
};

export function DocumentsList({
  documents,
  jurisdictions,
}: {
  documents: DocumentListItem[];
  jurisdictions: JurisdictionOption[];
}) {
  const urlSearch = useUrlSearch();
  const params = useMemo(() => new URLSearchParams(urlSearch), [urlSearch]);

  const jSlug = params.get("j") ?? undefined;
  const rawState = params.get("s");
  const state = isAnalysisState(rawState) ? rawState : undefined;
  const rawFrame = params.get("f");
  const frame = isFrameLabel(rawFrame) ? rawFrame : undefined;
  const binding = params.get("b") ?? undefined;
  const role = params.get("role") ?? undefined;
  const life = params.get("life") ?? undefined;
  const docType = params.get("t") ?? undefined;
  const requirement = params.get("r") ?? undefined;
  const query = params.get("q") ?? "";
  const rawSort = params.get("sort");
  const sort: SortOption = isSortOption(rawSort) ? rawSort : "date_desc";

  function syncUrl(
    updates: Partial<{
      j: string | undefined;
      s: string | undefined;
      f: string | undefined;
      b: string | undefined;
      role: string | undefined;
      life: string | undefined;
      t: string | undefined;
      r: string | undefined;
      q: string;
      sort: SortOption;
    }>,
  ) {
    replaceUrlQuery((p) => {
      const setOrDel = (key: string, val: string | undefined) => {
        if (val) p.set(key, val);
        else p.delete(key);
      };
      if ("j" in updates) setOrDel("j", updates.j);
      if ("s" in updates) setOrDel("s", updates.s);
      if ("f" in updates) setOrDel("f", updates.f);
      if ("b" in updates) setOrDel("b", updates.b);
      if ("role" in updates) setOrDel("role", updates.role);
      if ("life" in updates) setOrDel("life", updates.life);
      if ("t" in updates) setOrDel("t", updates.t);
      if ("r" in updates) setOrDel("r", updates.r);
      if ("q" in updates) setOrDel("q", updates.q);
      if ("sort" in updates) {
        if (updates.sort && updates.sort !== "date_desc") {
          p.set("sort", updates.sort);
        } else {
          p.delete("sort");
        }
      }
    });
  }

  function clearAllFilters() {
    replaceUrlQuery((p) => {
      for (const key of [
        "j",
        "s",
        "f",
        "b",
        "role",
        "life",
        "t",
        "r",
        "q",
        "sort",
      ]) {
        p.delete(key);
      }
    });
  }

  const availableRequirements = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of documents) {
      for (const key of doc.requirementKeys) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key, count]) => ({ key, label: humanizeRequirement(key), count }));
  }, [documents]);

  const availableDocTypes = useMemo(() => {
    const keys = new Set<string>(Object.keys(DOCUMENT_TYPE_LABELS));
    for (const doc of documents) {
      if (doc.documentTypeKey && doc.documentTypeKey !== "unclassified") {
        keys.add(doc.documentTypeKey);
      }
    }
    return [...keys];
  }, [documents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = documents.filter((doc) => {
      if (jSlug && doc.jurisdictionSlug !== jSlug) return false;
      if (state && doc.analysisState !== state) return false;
      if (frame && doc.dominantFrame !== frame) return false;
      if (binding && doc.bindingStrength !== binding) return false;
      if (role && (doc.corpusRole ?? "unclassified") !== role) return false;
      if (life && (doc.lifecycleStage ?? "unclassified") !== life) return false;
      if (docType && doc.documentTypeKey !== docType) return false;
      if (requirement && !doc.requirementKeys.includes(requirement)) return false;
      if (q && !matchesQuery(doc, q)) return false;
      return true;
    });

    return [...matched].sort((left, right) => {
      switch (sort) {
        case "date_asc":
          return (left.dateSort || 9e15) - (right.dateSort || 9e15);
        case "conf_desc":
          return (
            (right.overallConfidence ?? -1) - (left.overallConfidence ?? -1)
          );
        case "conf_asc":
          return (left.overallConfidence ?? 2) - (right.overallConfidence ?? 2);
        case "title_asc":
          return left.title.localeCompare(right.title);
        case "date_desc":
        default:
          return (
            right.dateSort - left.dateSort || left.id.localeCompare(right.id)
          );
      }
    });
  }, [
    documents,
    jSlug,
    state,
    frame,
    binding,
    role,
    life,
    docType,
    requirement,
    query,
    sort,
  ]);

  const filterContext = useMemo(
    () => ({
      jSlug,
      state,
      frame,
      binding,
      role,
      life,
      docType,
      requirement,
      query,
    }),
    [jSlug, state, frame, binding, role, life, docType, requirement, query],
  );

  const jurisdictionCounts = useMemo(
    () => countBy(documents, filterContext, "jurisdiction"),
    [documents, filterContext],
  );
  const roleCounts = useMemo(
    () => countBy(documents, filterContext, "role"),
    [documents, filterContext],
  );
  const lifeCounts = useMemo(
    () => countBy(documents, filterContext, "life"),
    [documents, filterContext],
  );
  const bindingCounts = useMemo(
    () => countBy(documents, filterContext, "binding"),
    [documents, filterContext],
  );
  const frameCounts = useMemo(
    () => countBy(documents, filterContext, "frame"),
    [documents, filterContext],
  );
  const stateCounts = useMemo(
    () => countBy(documents, filterContext, "state"),
    [documents, filterContext],
  );

  const hasFilter = Boolean(
    jSlug ||
      state ||
      frame ||
      binding ||
      role ||
      life ||
      docType ||
      requirement ||
      query.trim(),
  );

  const exportSuffix = jSlug ? `&j=${encodeURIComponent(jSlug)}` : "";

  return (
    <div className="flex flex-col gap-3">
      {/* Filter panel */}
      <div className="rounded-sm border border-white/10 bg-[#0f1623]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
            filters, quote search &amp; research export
          </h2>
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-[#94a3b8]">
            <span>
              <span className="tabular-nums text-[#f1f5f9]">
                {filtered.length}
              </span>{" "}
              of {documents.length} documents
            </span>
            {hasFilter ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="rounded-[2px] border border-white/20 px-2 py-0.5 text-[11px] uppercase tracking-wider text-[#cbd5e1] transition-colors hover:border-white/35 hover:text-white"
              >
                clear all
              </button>
            ) : null}
            <div className="flex items-center gap-1.5 border-l border-white/10 pl-3">
              <a
                href={`/api/export?format=csv${exportSuffix}`}
                className="rounded-[2px] border border-white/15 px-2 py-0.5 text-[11px] uppercase tracking-wider text-[#cbd5e1] transition-colors hover:border-white/30 hover:text-white"
              >
                csv ↓
              </a>
              <a
                href={`/api/export?format=json${exportSuffix}`}
                className="rounded-[2px] border border-white/15 px-2 py-0.5 text-[11px] uppercase tracking-wider text-[#cbd5e1] transition-colors hover:border-white/30 hover:text-white"
              >
                json ↓
              </a>
              <a
                href={`/api/export?format=bibtex${exportSuffix}`}
                className="rounded-[2px] border border-white/15 px-2 py-0.5 text-[11px] uppercase tracking-wider text-[#cbd5e1] transition-colors hover:border-white/30 hover:text-white"
              >
                bibtex ↓
              </a>
            </div>
          </div>
        </div>

        <div className="grid gap-3 px-4 py-3.5 md:grid-cols-[126px_1fr]">
          {/* Search + dropdown controls */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center md:col-span-2">
            <label className="flex min-w-[240px] flex-1 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
              <span className="shrink-0">search</span>
              <input
                type="search"
                value={query}
                onChange={(e) => syncUrl({ q: e.target.value })}
                placeholder="title, issuing body, ID, or quoted evidence…"
                className="w-full min-w-0 flex-1 rounded-[2px] border border-white/15 bg-[#0a0f18] px-2.5 py-1.5 font-sans text-[13px] normal-case tracking-normal text-[#f1f5f9] placeholder:text-[#7c8a9e]"
              />
            </label>

            <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
              <span>type</span>
              <select
                value={docType ?? ""}
                onChange={(e) => syncUrl({ t: e.target.value || undefined })}
                className="rounded-[2px] border border-white/15 bg-[#0a0f18] px-2 py-1.5 font-sans text-[12px] normal-case text-[#f1f5f9]"
              >
                <option value="">All types</option>
                {availableDocTypes.map((key) => (
                  <option key={key} value={key}>
                    {humanizeDocumentType(key)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
              <span>requirement</span>
              <select
                value={requirement ?? ""}
                onChange={(e) => syncUrl({ r: e.target.value || undefined })}
                className="max-w-[230px] rounded-[2px] border border-white/15 bg-[#0a0f18] px-2 py-1.5 font-sans text-[12px] normal-case text-[#f1f5f9]"
              >
                <option value="">All requirements</option>
                {availableRequirements.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label} ({item.count})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
              <span>sort</span>
              <select
                value={sort}
                onChange={(e) =>
                  syncUrl({ sort: e.target.value as SortOption })
                }
                className="rounded-[2px] border border-white/15 bg-[#0a0f18] px-2 py-1.5 font-sans text-[12px] normal-case text-[#f1f5f9]"
              >
                <option value="date_desc">Newest published</option>
                <option value="date_asc">Oldest published</option>
                <option value="conf_desc">Highest self-reported conf.</option>
                <option value="conf_asc">Lowest self-reported conf.</option>
                <option value="title_asc">Title A–Z</option>
              </select>
            </label>
          </div>

          {/* Jurisdiction row */}
          <span className="pt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
            jurisdiction
          </span>
          <div
            role="group"
            aria-label="Filter by jurisdiction"
            className="flex flex-wrap gap-1.5"
          >
            <FilterChip
              isActive={!jSlug}
              onClick={() => syncUrl({ j: undefined })}
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
                    syncUrl({ j: isActive ? undefined : jur.slug })
                  }
                  label={jur.shortName}
                  count={jurisdictionCounts.get(jur.slug) ?? 0}
                  flag={
                    <Image
                      src={jur.flagUrl}
                      alt=""
                      width={16}
                      height={11}
                      className="h-[11px] w-[16px] rounded-[1px] border border-white/15 object-cover"
                      unoptimized
                    />
                  }
                />
              );
            })}
          </div>

          {/* Corpus role row (C7) */}
          <span className="pt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
            corpus role
          </span>
          <div
            role="group"
            aria-label="Filter by corpus role"
            className="flex flex-wrap gap-1.5"
          >
            <FilterChip
              isActive={!role}
              onClick={() => syncUrl({ role: undefined })}
              label="all"
              count={roleCounts.get("__all__") ?? 0}
            />
            {CORPUS_ROLE_ORDER.map((key) => {
              const isActive = role === key;
              const count = roleCounts.get(key) ?? 0;
              if (key === "subnational_overlay" && count === 0 && !isActive) {
                return null;
              }
              return (
                <FilterChip
                  key={key}
                  isActive={isActive}
                  onClick={() => syncUrl({ role: isActive ? undefined : key })}
                  label={humanizeCorpusRole(key)}
                  count={count}
                />
              );
            })}
            {(roleCounts.get("unclassified") ?? 0) > 0 ||
            role === "unclassified" ? (
              <FilterChip
                isActive={role === "unclassified"}
                onClick={() =>
                  syncUrl({
                    role: role === "unclassified" ? undefined : "unclassified",
                  })
                }
                label="Unclassified"
                count={roleCounts.get("unclassified") ?? 0}
              />
            ) : null}
          </div>

          {/* Lifecycle stage row (C7) */}
          <span className="pt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
            lifecycle
          </span>
          <div
            role="group"
            aria-label="Filter by lifecycle stage"
            className="flex flex-wrap gap-1.5"
          >
            <FilterChip
              isActive={!life}
              onClick={() => syncUrl({ life: undefined })}
              label="all"
              count={lifeCounts.get("__all__") ?? 0}
            />
            {LIFECYCLE_STAGE_ORDER.map((key) => {
              const isActive = life === key;
              return (
                <FilterChip
                  key={key}
                  isActive={isActive}
                  onClick={() => syncUrl({ life: isActive ? undefined : key })}
                  label={humanizeLifecycleStage(key)}
                  count={lifeCounts.get(key) ?? 0}
                />
              );
            })}
            {(lifeCounts.get("unclassified") ?? 0) > 0 ||
            life === "unclassified" ? (
              <FilterChip
                isActive={life === "unclassified"}
                onClick={() =>
                  syncUrl({
                    life: life === "unclassified" ? undefined : "unclassified",
                  })
                }
                label="Unclassified"
                count={lifeCounts.get("unclassified") ?? 0}
              />
            ) : null}
          </div>

          {/* Binding strength row */}
          <span className="pt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
            binding
          </span>
          <div
            role="group"
            aria-label="Filter by binding strength"
            className="flex flex-wrap gap-1.5"
          >
            <FilterChip
              isActive={!binding}
              onClick={() => syncUrl({ b: undefined })}
              label="all"
              count={bindingCounts.get("__all__") ?? 0}
            />
            {BINDING_STRENGTH_ORDER.map((key) => {
              const isActive = binding === key;
              return (
                <FilterChip
                  key={key}
                  isActive={isActive}
                  onClick={() => syncUrl({ b: isActive ? undefined : key })}
                  label={humanizeBindingStrength(key)}
                  count={bindingCounts.get(key) ?? 0}
                  accentColor={BINDING_STRENGTH_COLORS[key]}
                />
              );
            })}
          </div>

          {/* Frame row */}
          <span className="pt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
            risk framing
          </span>
          <div
            role="group"
            aria-label="Filter by risk framing"
            className="flex flex-wrap gap-1.5"
          >
            <FilterChip
              isActive={!frame}
              onClick={() => syncUrl({ f: undefined })}
              label="all"
              count={frameCounts.get("__all__") ?? 0}
            />
            {allFrameLabels.map((f) => {
              const isActive = frame === f;
              return (
                <FilterChip
                  key={f}
                  isActive={isActive}
                  onClick={() => syncUrl({ f: isActive ? undefined : f })}
                  label={frameAbbr[f]}
                  count={frameCounts.get(f) ?? 0}
                  accentColor={frameTextHue[f]}
                  swatchColor={frameHue[f]}
                />
              );
            })}
          </div>

          {/* State row */}
          {(stateCounts.get("parsed") ?? 0) > 0 || state ? (
            <>
              <span className="pt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
                state
              </span>
              <div
                role="group"
                aria-label="Filter by analysis state"
                className="flex flex-wrap gap-1.5"
              >
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
                        syncUrl({
                          s:
                            opt.key === undefined
                              ? undefined
                              : isActive
                                ? undefined
                                : opt.key,
                        })
                      }
                      label={opt.label}
                      count={
                        opt.key === undefined
                          ? (stateCounts.get("__all__") ?? 0)
                          : (stateCounts.get(opt.key) ?? 0)
                      }
                    />
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Document list */}
      <div className="rounded-sm border border-white/10 bg-[#0f1623]">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-4 py-2.5">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
            documents
          </h2>
          <p className="font-mono text-[11px] text-[#94a3b8]">
            {filtered.length} shown · select any document for verified evidence
            highlighting
          </p>
        </div>

        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-[#94a3b8]">
            No documents match the current filters.
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
  const bindingColor =
    BINDING_STRENGTH_COLORS[doc.bindingStrength] ?? "#94a3b8";
  const isPrimaryActive =
    doc.corpusRole === "primary_instrument" &&
    (doc.lifecycleStage === "active" ||
      doc.lifecycleStage === "adopted_not_yet_effective");

  return (
    <li className="px-4 py-3.5 transition-colors hover:bg-white/[0.03]">
      <div className="flex flex-col gap-2.5 md:grid md:grid-cols-[124px_24px_minmax(0,2fr)_140px_100px] md:items-start md:gap-3">
        {/* Col 1: publication date */}
        <div className="flex items-center justify-between gap-2 md:block">
          <span className="font-mono text-[11px] tabular-nums text-[#94a3b8]">
            {doc.publicationDate}
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-[#cbd5e1] md:hidden">
            {doc.flagUrl ? (
              <Image
                src={doc.flagUrl}
                alt={`${doc.jurisdiction} flag`}
                width={18}
                height={13}
                className="h-[13px] w-[18px] rounded-[1px] border border-white/15 object-cover"
                unoptimized
              />
            ) : null}
            {doc.jurisdictionShort}
          </span>
        </div>

        {/* Col 2: desktop flag */}
        <div className="hidden pt-0.5 md:block">
          {doc.flagUrl ? (
            <Image
              src={doc.flagUrl}
              alt={`${doc.jurisdiction} flag`}
              width={20}
              height={14}
              className="h-[14px] w-[20px] rounded-[1px] border border-white/15 object-cover"
              unoptimized
            />
          ) : (
            <span
              aria-hidden
              className="block h-[14px] w-[20px] rounded-[1px] border border-white/15 bg-white/5"
            />
          )}
        </div>

        {/* Col 3: Title, corpus role + lifecycle badges, metadata, top requirements */}
        <div className="min-w-0">
          <Link
            href={doc.href}
            lang={doc.languageCode}
            className="block text-[14px] font-medium leading-snug text-[#f1f5f9] underline decoration-transparent decoration-dotted underline-offset-2 transition-colors hover:text-white hover:decoration-white/40"
          >
            {doc.title}
          </Link>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
            <span
              className={`rounded-[2px] border px-1.5 py-0.5 ${
                isPrimaryActive
                  ? "border-[#38bdf8]/40 bg-[#38bdf8]/10 text-[#7dd3fc]"
                  : "border-white/15 bg-white/[0.03] text-[#94a3b8]"
              }`}
            >
              {doc.corpusRoleLabel}
            </span>
            <span
              className={`rounded-[2px] border px-1.5 py-0.5 ${
                doc.lifecycleStage === "active"
                  ? "border-white/20 bg-white/[0.04] text-[#e2e8f0]"
                  : "border-white/15 bg-white/[0.02] text-[#94a3b8]"
              }`}
            >
              {doc.lifecycleStageLabel}
            </span>
            <span
              className="rounded-[2px] border px-1.5 py-0.5"
              style={{
                color: bindingColor,
                borderColor: `${bindingColor}45`,
                backgroundColor: `${bindingColor}14`,
              }}
            >
              {doc.bindingStrengthLabel}
            </span>
            {formatSubnationalBadge(doc.subnationalUnit) ? (
              <span className="rounded-[2px] border border-[#e6ae49]/45 bg-[#e6ae49]/15 px-1.5 py-0.5 font-semibold text-[#fef3c7]">
                {formatSubnationalBadge(doc.subnationalUnit)}
              </span>
            ) : null}
            {doc.supersedesId ? (
              <span className="rounded-[2px] border border-[#67e8f9]/35 bg-[#67e8f9]/10 px-1.5 py-0.5 text-[#67e8f9]">
                Supersedes prior
              </span>
            ) : null}
          </div>

          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-[#94a3b8]">
            <span>{doc.jurisdiction}</span>
            <span aria-hidden className="text-[#475569]">
              ·
            </span>
            <span>{doc.documentType}</span>
            {doc.overallConfidence !== null ? (
              <>
                <span aria-hidden className="text-[#475569]">
                  ·
                </span>
                <span
                  className="tabular-nums"
                  title="Model self-reported extraction confidence"
                >
                  self-rep {Math.round(doc.overallConfidence * 100)}%
                </span>
              </>
            ) : null}
            {doc.groundingRatio !== null ? (
              <>
                <span aria-hidden className="text-[#475569]">
                  ·
                </span>
                <span className="tabular-nums text-[#67e8f9]">
                  grounding {Math.round(doc.groundingRatio * 100)}%
                </span>
              </>
            ) : null}
          </p>

          {doc.topRequirements.length > 0 ? (
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {doc.topRequirements.slice(0, 3).map((req) => (
                <li
                  key={`${doc.id}-${req}`}
                  className="rounded-[2px] border border-white/10 bg-white/[0.02] px-1.5 py-0.5 text-[11px] text-[#cbd5e1]"
                >
                  {req}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* Col 4: Dominant frame */}
        <div className="flex items-center justify-between gap-2 md:block">
          {frame ? (
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-[8px] w-[8px] shrink-0 rounded-[1px]"
                style={{ background: frameHue[frame] }}
              />
              <span
                className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.06em]"
                style={{ color: frameTextHue[frame] }}
              >
                {frameAbbr[frame]}
              </span>
            </div>
          ) : (
            <span className="font-mono text-[11px] text-[#94a3b8]">
              unclassified
            </span>
          )}
          <div className="md:hidden">
            <AnalysisPill state={doc.analysisState} />
          </div>
        </div>

        {/* Col 5: Desktop analysis state pill */}
        <div className="hidden justify-end md:flex">
          <AnalysisPill state={doc.analysisState} />
        </div>
      </div>
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
  swatchColor,
}: {
  isActive: boolean;
  onClick: () => void;
  label: string;
  count: number;
  flag?: React.ReactNode;
  accentColor?: string;
  swatchColor?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em] transition-colors ${
        isActive
          ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 text-[#f1f5f9]"
          : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
      }`}
      style={
        isActive && accentColor
          ? { borderColor: `${accentColor}90`, color: accentColor }
          : undefined
      }
    >
      {flag}
      {(swatchColor || accentColor) && !flag ? (
        <span
          aria-hidden
          className="h-[8px] w-[8px] rounded-[1px]"
          style={{ background: swatchColor ?? accentColor }}
        />
      ) : null}
      {label}
      <span className="tabular-nums text-[#94a3b8]">{count}</span>
    </button>
  );
}

function AnalysisPill({ state }: { state: AnalysisState }) {
  const map: Record<AnalysisState, { color: string; label: string }> = {
    analyzed: { color: "#38bdf8", label: "analyzed" },
    parsed: { color: "#94a3b8", label: "parsed" },
  };
  const s = map[state];
  return (
    <span
      className="inline-flex rounded-[2px] px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider"
      style={{
        color: s.color,
        background: `${s.color}1a`,
        border: `1px solid ${s.color}40`,
      }}
    >
      {s.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function matchesQuery(doc: DocumentListItem, q: string): boolean {
  return (
    doc.title.toLowerCase().includes(q) ||
    doc.issuingBody.toLowerCase().includes(q) ||
    doc.id.toLowerCase().includes(q) ||
    doc.evidenceSearchText.includes(q)
  );
}

function isAnalysisState(x: unknown): x is AnalysisState {
  return x === "analyzed" || x === "parsed";
}

function isFrameLabel(x: unknown): x is FrameLabel {
  return typeof x === "string" && allFrameLabels.includes(x as FrameLabel);
}

function isSortOption(x: unknown): x is SortOption {
  return (
    x === "date_desc" ||
    x === "date_asc" ||
    x === "conf_desc" ||
    x === "conf_asc" ||
    x === "title_asc"
  );
}

function countBy(
  docs: DocumentListItem[],
  ctx: {
    jSlug?: string;
    state?: AnalysisState;
    frame?: FrameLabel;
    binding?: string;
    role?: string;
    life?: string;
    docType?: string;
    requirement?: string;
    query: string;
  },
  dimension: "jurisdiction" | "state" | "frame" | "binding" | "role" | "life",
): Map<string, number> {
  const q = ctx.query.trim().toLowerCase();
  const counts = new Map<string, number>();
  let total = 0;

  for (const doc of docs) {
    if (
      dimension !== "jurisdiction" &&
      ctx.jSlug &&
      doc.jurisdictionSlug !== ctx.jSlug
    )
      continue;
    if (dimension !== "state" && ctx.state && doc.analysisState !== ctx.state)
      continue;
    if (dimension !== "frame" && ctx.frame && doc.dominantFrame !== ctx.frame)
      continue;
    if (
      dimension !== "binding" &&
      ctx.binding &&
      doc.bindingStrength !== ctx.binding
    )
      continue;
    if (
      dimension !== "role" &&
      ctx.role &&
      (doc.corpusRole ?? "unclassified") !== ctx.role
    )
      continue;
    if (
      dimension !== "life" &&
      ctx.life &&
      (doc.lifecycleStage ?? "unclassified") !== ctx.life
    )
      continue;
    if (ctx.docType && doc.documentTypeKey !== ctx.docType) continue;
    if (ctx.requirement && !doc.requirementKeys.includes(ctx.requirement))
      continue;
    if (q && !matchesQuery(doc, q)) continue;

    total += 1;
    if (dimension === "jurisdiction") {
      counts.set(
        doc.jurisdictionSlug,
        (counts.get(doc.jurisdictionSlug) ?? 0) + 1,
      );
    } else if (dimension === "state") {
      counts.set(doc.analysisState, (counts.get(doc.analysisState) ?? 0) + 1);
    } else if (dimension === "binding") {
      counts.set(
        doc.bindingStrength,
        (counts.get(doc.bindingStrength) ?? 0) + 1,
      );
    } else if (dimension === "role") {
      const k = doc.corpusRole ?? "unclassified";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    } else if (dimension === "life") {
      const k = doc.lifecycleStage ?? "unclassified";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    } else if (dimension === "frame" && doc.dominantFrame) {
      counts.set(doc.dominantFrame, (counts.get(doc.dominantFrame) ?? 0) + 1);
    }
  }
  counts.set("__all__", total);
  return counts;
}
