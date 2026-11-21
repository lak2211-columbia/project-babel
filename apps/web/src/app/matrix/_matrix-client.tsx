"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { TopNav } from "@/app/_components/top-nav";
import type { JurisdictionKey } from "@/lib/jurisdictions";
import type {
  ObligationMatrixCell,
  ObligationMatrixData,
  ObligationMatrixRow,
} from "@/lib/matrix-data";
import type { ScoringMode } from "@/lib/seed-data";
import {
  BINDING_LEVEL_LABELS,
  formatSubnationalBadge,
  isCjkText,
  parseIncludeSubnational,
  toHtmlLang,
} from "@/lib/taxonomy-vocab";
import { replaceUrlQuery, useUrlSearch } from "@/lib/use-url-search";

const LEVEL_STYLES: Record<
  number,
  { short: string; bg: string; border: string; text: string }
> = {
  0: {
    short: "—",
    bg: "rgba(148, 163, 184, 0.04)",
    border: "rgba(255, 255, 255, 0.08)",
    text: "#94a3b8",
  },
  1: {
    short: "L1",
    bg: "rgba(148, 163, 184, 0.14)",
    border: "rgba(148, 163, 184, 0.30)",
    text: "#cbd5e1",
  },
  2: {
    short: "L2",
    bg: "rgba(125, 211, 252, 0.14)",
    border: "rgba(125, 211, 252, 0.32)",
    text: "#93c5fd",
  },
  3: {
    short: "L3",
    bg: "rgba(56, 189, 248, 0.20)",
    border: "rgba(56, 189, 248, 0.45)",
    text: "#38bdf8",
  },
  4: {
    short: "L4",
    bg: "rgba(103, 232, 249, 0.26)",
    border: "rgba(103, 232, 249, 0.60)",
    text: "#67e8f9",
  },
};

export function ObligationMatrixClient({
  headline,
  all,
  headlineWithStates,
  allWithStates,
}: {
  headline: ObligationMatrixData;
  all: ObligationMatrixData;
  headlineWithStates?: ObligationMatrixData;
  allWithStates?: ObligationMatrixData;
}) {
  const urlSearch = useUrlSearch();
  const searchParams = new URLSearchParams(urlSearch);
  const rawMode = searchParams.get("mode")?.toLowerCase();
  const mode: ScoringMode =
    rawMode === "all" || rawMode === "equal" ? "all" : "headline";
  const subnationalCount = headline.subnationalCount;
  const canToggleStates =
    subnationalCount > 0 && Boolean(headlineWithStates && allWithStates);
  const includeSubnational =
    canToggleStates && parseIncludeSubnational(searchParams.get("states"));
  const data =
    mode === "all"
      ? includeSubnational && allWithStates
        ? allWithStates
        : all
      : includeSubnational && headlineWithStates
        ? headlineWithStates
        : headline;
  const activeHeadline =
    includeSubnational && headlineWithStates ? headlineWithStates : headline;
  const activeAll = includeSubnational && allWithStates ? allWithStates : all;
  const querySuffix = (() => {
    const qp = new URLSearchParams();
    if (mode === "all") qp.set("mode", "all");
    if (includeSubnational) qp.set("states", "1");
    const s = qp.toString();
    return s ? `?${s}` : "";
  })();

  const [groupFilter, setGroupFilter] = useState<
    "all" | "requirement" | "enforcement"
  >("all");
  const [minLevel, setMinLevel] = useState<number>(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{
    rowKey: string;
    jurisdictionKey: JurisdictionKey;
  } | null>(null);

  function selectMode(nextMode: ScoringMode) {
    replaceUrlQuery((params) => {
      if (nextMode === "all") {
        params.set("mode", "all");
      } else {
        params.delete("mode");
      }
    });
  }

  function toggleStates() {
    replaceUrlQuery((params) => {
      if (includeSubnational) {
        params.delete("states");
      } else {
        params.set("states", "1");
      }
    });
  }

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.rows.filter((row) => {
      if (groupFilter !== "all" && row.group !== groupFilter) return false;
      if (row.maxLevelAcrossPeers < minLevel) return false;
      if (q && !row.label.toLowerCase().includes(q) && !row.key.includes(q)) {
        return false;
      }
      return true;
    });
  }, [data.rows, groupFilter, minLevel, query]);

  const activeSelection: {
    row: ObligationMatrixRow;
    cell: ObligationMatrixCell;
  } | null = useMemo(() => {
    if (!selected) return null;
    const row = data.rows.find((r) => r.key === selected.rowKey);
    if (!row) return null;
    const cell = row.cells[selected.jurisdictionKey];
    if (!cell) return null;
    return { row, cell };
  }, [data.rows, selected]);

  return (
    <main className="min-h-screen bg-[#0a0f18] font-sans text-[14px] text-[#cdd6e1]">
      <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
        <TopNav active="matrix" />

        {/* Masthead */}
        <header className="border-y border-white/20 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">
                REGIME COVERAGE INDEX · 25 CONTROLS × 5 JURISDICTIONS
              </p>
              <h1 className="mt-1.5 text-[24px] font-semibold tracking-[-0.01em] text-[#f1f5f9]">
                AI Legal Obligation &amp; Clause Matrix
              </h1>
              <p className="mt-2 text-[14px] leading-relaxed text-[#cbd5e1]">
                Every cell reports the{" "}
                <strong className="font-medium text-[#f8fafc]">
                  strongest legal binding level (0–4)
                </strong>{" "}
                at which a jurisdiction imposes each safeguard requirement or
                enforcement mechanism — invariant to document-count inflation.
                Select any cell to inspect the underlying instruments and
                verbatim statutory quotes.
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div
                role="group"
                aria-label="Matrix corpus scope"
                className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em]"
              >
                <button
                  type="button"
                  aria-pressed={mode === "headline"}
                  onClick={() => selectMode("headline")}
                  className={`rounded-[2px] border px-2.5 py-1 transition-colors ${
                    mode === "headline"
                      ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 font-semibold text-[#f1f5f9]"
                      : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                  }`}
                >
                  active primary ({activeHeadline.totalInstrumentsInPool})
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "all"}
                  onClick={() => selectMode("all")}
                  className={`rounded-[2px] border px-2.5 py-1 transition-colors ${
                    mode === "all"
                      ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 font-semibold text-[#f1f5f9]"
                      : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                  }`}
                >
                  full corpus ({activeAll.totalInstrumentsInPool})
                </button>
                {canToggleStates ? (
                  <button
                    type="button"
                    aria-pressed={includeSubnational}
                    onClick={toggleStates}
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
              <a
                href={`/api/matrix?mode=${mode}${includeSubnational ? "&states=1" : ""}`}
                className="font-mono text-[11px] uppercase tracking-wider text-[#67e8f9] underline decoration-[#67e8f9]/40 underline-offset-2 hover:text-white"
              >
                download matrix json →
              </a>
            </div>
          </div>

          {includeSubnational ? (
            <p className="mt-3 rounded-[2px] border border-[#e6ae49]/35 bg-[#e6ae49]/10 px-3 py-2 text-[12px] leading-relaxed text-[#fef3c7]">
              <strong className="font-semibold">
                U.S. state statutory overlay active (+{subnationalCount} state
                statutes):
              </strong>{" "}
              Enacted U.S. state AI statutes (e.g. California, Colorado, Texas)
              are overlaid onto the United States column to reflect binding
              subnational compliance duties alongside sovereign federal
              instruments.
            </p>
          ) : null}

          {/* 0..4 Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3 font-mono text-[11px]">
            <span className="uppercase tracking-wider text-[#94a3b8]">
              binding scale:
            </span>
            {[0, 1, 2, 3, 4].map((lvl) => {
              const s = LEVEL_STYLES[lvl];
              return (
                <span
                  key={lvl}
                  className="inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5"
                  style={{
                    backgroundColor: s.bg,
                    borderColor: s.border,
                    color: s.text,
                  }}
                >
                  <strong className="font-semibold">{s.short}</strong>
                  <span>{BINDING_LEVEL_LABELS[lvl]}</span>
                </span>
              );
            })}
          </div>
        </header>

        {/* Filter bar */}
        <section
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-white/10 bg-[#0f1623] px-3.5 py-2.5"
          aria-label="Filter obligation matrix"
        >
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em]">
            <span className="text-[#94a3b8]">group</span>
            {(
              [
                ["all", "all (25)"],
                ["requirement", "requirements (17)"],
                ["enforcement", "enforcement (8)"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={groupFilter === key}
                onClick={() => setGroupFilter(key)}
                className={`rounded-[2px] border px-2 py-0.5 transition-colors ${
                  groupFilter === key
                    ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 text-[#f1f5f9]"
                    : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                }`}
              >
                {label}
              </button>
            ))}

            <span className="ml-2 text-[#94a3b8]">min level</span>
            {[0, 2, 3, 4].map((lvl) => (
              <button
                key={lvl}
                type="button"
                aria-pressed={minLevel === lvl}
                onClick={() => setMinLevel(lvl)}
                className={`rounded-[2px] border px-2 py-0.5 transition-colors ${
                  minLevel === lvl
                    ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 text-[#f1f5f9]"
                    : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
                }`}
              >
                {lvl === 0 ? "any" : `≥ L${lvl}`}
              </button>
            ))}
          </div>

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter controls (e.g. red-teaming, civil penalties)…"
            aria-label="Filter controls by name"
            className="w-full rounded-[2px] border border-white/15 bg-[#0a0f18] px-3 py-1.5 text-[12px] text-[#f1f5f9] placeholder:text-[#7c8a9e] sm:w-72"
          />
        </section>

        {/* Matrix Grid + Slide-Over Detail Panel */}
        <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_430px]">
          <div className="overflow-x-auto rounded-sm border border-white/10 bg-[#0f1623] p-3">
            <table className="w-full border-separate border-spacing-1 text-left">
              <thead>
                <tr className="font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
                  <th className="min-w-[230px] px-2 py-2 font-medium">
                    control · ({filteredRows.length} shown)
                  </th>
                  {data.jurisdictions.map((j) => (
                    <th
                      key={j.key}
                      className="min-w-[96px] px-2 py-2 text-center font-medium"
                    >
                      <Link
                        href={`/jurisdictions/${j.slug}${querySuffix}`}
                        className="inline-flex flex-col items-center gap-1 text-[#f1f5f9] hover:text-[#67e8f9]"
                      >
                        <span className="flex items-center gap-1.5">
                          <Image
                            src={j.flagUrl}
                            alt=""
                            width={18}
                            height={13}
                            className="h-[13px] w-[18px] rounded-[1px] border border-white/15 object-cover"
                            unoptimized
                          />
                          <span>{j.shortName}</span>
                        </span>
                        <span className="text-[11px] font-normal text-[#94a3b8]">
                          {j.bindingControlsCount} L4
                        </span>
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={`${row.group}-${row.key}`} className="group/row">
                    <th className="rounded-[2px] border border-white/5 bg-[#0a0f18] px-2.5 py-2 align-middle">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium text-[#e2e8f0]">
                          {row.label}
                        </span>
                        <span className="shrink-0 rounded-[2px] border border-white/10 px-1.5 py-0.5 font-mono text-[11px] uppercase text-[#94a3b8]">
                          {row.group === "requirement" ? "req" : "enf"}
                        </span>
                      </div>
                    </th>

                    {data.jurisdictions.map((j) => {
                      const cell = row.cells[j.key];
                      const style =
                        LEVEL_STYLES[cell.strongestLevel] ?? LEVEL_STYLES[0];
                      const isActive =
                        selected?.rowKey === row.key &&
                        selected?.jurisdictionKey === j.key;
                      return (
                        <td key={j.key} className="p-0 align-middle">
                          <button
                            type="button"
                            onClick={() =>
                              setSelected({
                                rowKey: row.key,
                                jurisdictionKey: j.key,
                              })
                            }
                            aria-pressed={isActive}
                            aria-label={`${row.label} in ${j.name}: ${cell.strongestLevelLabel} across ${cell.instrumentCount} instruments`}
                            className="flex h-full w-full flex-col items-center justify-center rounded-[2px] border px-2 py-2 font-mono transition-all hover:brightness-125"
                            style={{
                              backgroundColor: style.bg,
                              borderColor: isActive ? "#f8fafc" : style.border,
                              boxShadow: isActive
                                ? "0 0 0 1px #f8fafc"
                                : undefined,
                            }}
                          >
                            <span
                              className="text-[13px] font-semibold leading-none tabular-nums"
                              style={{ color: style.text }}
                            >
                              {style.short}
                            </span>
                            <span className="mt-1 text-[11px] leading-none tabular-nums text-[#94a3b8]">
                              {cell.instrumentCount > 0
                                ? `n=${cell.instrumentCount}`
                                : "0"}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Right-side cell drill-down drawer */}
          <aside
            aria-label="Selected obligation clause details"
            className="rounded-sm border border-white/10 bg-[#0f1623] p-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto"
          >
            {!activeSelection ? (
              <div className="py-10 text-center">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#38bdf8]">
                  clause drill-down
                </p>
                <h2 className="mt-2 text-[16px] font-semibold text-[#f1f5f9]">
                  Select any cell in the matrix
                </h2>
                <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-[#94a3b8]">
                  Click any jurisdiction × control cell to inspect every
                  official instrument establishing that obligation along with
                  verbatim quotes and translations.
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#38bdf8]">
                      {activeSelection.cell.jurisdictionShort} ·{" "}
                      {activeSelection.row.group === "requirement"
                        ? "safeguard requirement"
                        : "enforcement mechanism"}
                    </p>
                    <h2 className="mt-1 text-[17px] font-semibold text-[#f1f5f9]">
                      {activeSelection.row.label}
                    </h2>
                    <p className="mt-1 font-mono text-[11px] text-[#94a3b8]">
                      strongest:{" "}
                      <span className="text-[#67e8f9]">
                        L{activeSelection.cell.strongestLevel} ·{" "}
                        {activeSelection.cell.strongestLevelLabel}
                      </span>{" "}
                      · {activeSelection.cell.instrumentCount} instrument
                      {activeSelection.cell.instrumentCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="rounded-[2px] border border-white/15 px-2 py-0.5 font-mono text-[11px] text-[#94a3b8] hover:border-white/35 hover:text-[#f1f5f9]"
                  >
                    clear
                  </button>
                </div>

                {activeSelection.cell.instruments.length === 0 ? (
                  <p className="mt-4 text-[13px] leading-relaxed text-[#94a3b8]">
                    No analyzed instruments in the current scope (
                    {mode === "headline" ? "active primary" : "full corpus"})
                    specify{" "}
                    <strong className="text-[#e2e8f0]">
                      {activeSelection.row.label}
                    </strong>{" "}
                    for this jurisdiction.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-3">
                    {activeSelection.cell.instruments.map((inst) => (
                      <li
                        key={inst.documentId}
                        className="rounded-sm border border-white/10 bg-[#0a0f18] p-3"
                      >
                        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                          <span
                            className="rounded-[2px] border px-1.5 py-0.5 font-semibold"
                            style={{
                              backgroundColor:
                                LEVEL_STYLES[inst.bindingLevel]?.bg,
                              borderColor:
                                LEVEL_STYLES[inst.bindingLevel]?.border,
                              color: LEVEL_STYLES[inst.bindingLevel]?.text,
                            }}
                          >
                            L{inst.bindingLevel} · {inst.bindingStrengthLabel}
                          </span>
                          {inst.obligationStrengthLabel ? (
                            <span className="rounded-[2px] border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[#cbd5e1]">
                              {inst.obligationStrengthLabel}
                            </span>
                          ) : null}
                          {formatSubnationalBadge(inst.subnationalUnit) ? (
                            <span className="rounded-[2px] border border-[#e6ae49]/45 bg-[#e6ae49]/15 px-1.5 py-0.5 font-semibold text-[#fef3c7]">
                              {formatSubnationalBadge(inst.subnationalUnit)}
                            </span>
                          ) : null}
                          <span className="ml-auto text-[#94a3b8]">
                            {inst.publicationDate}
                          </span>
                        </div>

                        <h3
                          lang={toHtmlLang(inst.languageCode)}
                          className="mt-2 text-[14px] font-medium leading-snug text-[#f1f5f9]"
                        >
                          <Link
                            href={`/documents/${encodeURIComponent(inst.documentId)}`}
                            className="underline decoration-white/25 underline-offset-2 hover:text-[#67e8f9]"
                          >
                            {inst.title}
                          </Link>
                        </h3>

                        <p className="mt-1 font-mono text-[11px] text-[#94a3b8]">
                          {inst.corpusRoleLabel} · {inst.lifecycleStageLabel}
                          {inst.effectiveDate
                            ? ` · eff. ${inst.effectiveDate}`
                            : ""}
                        </p>

                        {inst.quotes.length > 0 ? (
                          <div className="mt-2.5 flex flex-col gap-2 border-t border-white/10 pt-2">
                            {inst.quotes.map((q, qIdx) => {
                              const cjk = isCjkText(q.quote);
                              return (
                                <blockquote
                                  key={`${inst.documentId}-q-${qIdx}`}
                                  className="border-l-2 border-[#38bdf8]/50 pl-2.5 text-[12px] leading-relaxed text-[#cbd5e1]"
                                >
                                  <p
                                    lang={toHtmlLang(inst.languageCode)}
                                    className={cjk ? "not-italic" : "italic"}
                                  >
                                    “{q.quote}”
                                  </p>
                                  {q.quoteEn ? (
                                    <p className="mt-1 text-[12px] text-[#94a3b8]">
                                      <span className="mr-1.5 rounded-[2px] border border-white/15 px-1 py-0.5 font-mono text-[11px] uppercase text-[#94a3b8]">
                                        machine translation
                                      </span>
                                      {q.quoteEn}
                                    </p>
                                  ) : null}
                                  {q.sourceSection ? (
                                    <footer className="mt-1 font-mono text-[11px] text-[#94a3b8]">
                                      — {q.sourceSection}
                                    </footer>
                                  ) : null}
                                </blockquote>
                              );
                            })}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}
