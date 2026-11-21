"use client";

import { useRouter } from "next/navigation";

import type { ScoringMode } from "@/lib/seed-data";

type Option = { slug: string; name: string; shortName: string };

export function CompareControls({
  options,
  slugA,
  slugB,
  mode,
  includeSubnational = false,
  subnationalCount = 0,
}: {
  options: Option[];
  slugA: string;
  slugB: string;
  mode: ScoringMode;
  includeSubnational?: boolean;
  subnationalCount?: number;
}) {
  const router = useRouter();

  function navigate(
    nextA: string,
    nextB: string,
    nextMode: ScoringMode,
    nextStates: boolean,
  ) {
    const params = new URLSearchParams();
    params.set("a", nextA);
    params.set("b", nextB);
    if (nextMode === "all") {
      params.set("mode", "all");
    }
    if (nextStates) {
      params.set("states", "1");
    }
    router.push(`/compare?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-white/10 bg-[#0f1623] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
          <span>jurisdiction a</span>
          <select
            value={slugA}
            onChange={(e) => {
              const nextA = e.target.value;
              const nextB =
                nextA === slugB
                  ? (options.find((o) => o.slug !== nextA)?.slug ?? slugB)
                  : slugB;
              navigate(nextA, nextB, mode, includeSubnational);
            }}
            className="rounded-[2px] border border-white/20 bg-[#0a0f18] px-2.5 py-1.5 font-sans text-[13px] normal-case text-[#f1f5f9]"
          >
            {options.map((opt) => (
              <option key={opt.slug} value={opt.slug}>
                {opt.shortName} · {opt.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => navigate(slugB, slugA, mode, includeSubnational)}
          aria-label="Swap jurisdictions"
          className="rounded-[2px] border border-white/20 bg-white/[0.04] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[#f1f5f9] transition-colors hover:border-[#38bdf8]/60"
        >
          ⇄ swap
        </button>

        <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
          <span>jurisdiction b</span>
          <select
            value={slugB}
            onChange={(e) => {
              const nextB = e.target.value;
              const nextA =
                nextB === slugA
                  ? (options.find((o) => o.slug !== nextB)?.slug ?? slugA)
                  : slugA;
              navigate(nextA, nextB, mode, includeSubnational);
            }}
            className="rounded-[2px] border border-white/20 bg-[#0a0f18] px-2.5 py-1.5 font-sans text-[13px] normal-case text-[#f1f5f9]"
          >
            {options.map((opt) => (
              <option key={opt.slug} value={opt.slug}>
                {opt.shortName} · {opt.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        role="group"
        aria-label="Corpus scoring population"
        className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em]"
      >
        <span className="text-[#94a3b8]">scope</span>
        <button
          type="button"
          aria-pressed={mode === "headline"}
          onClick={() => navigate(slugA, slugB, "headline", includeSubnational)}
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
          onClick={() => navigate(slugA, slugB, "all", includeSubnational)}
          className={`rounded-[2px] border px-2.5 py-1 transition-colors ${
            mode === "all"
              ? "border-[#38bdf8]/60 bg-[#38bdf8]/15 font-semibold text-[#f1f5f9]"
              : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
          }`}
        >
          full corpus
        </button>
        {subnationalCount > 0 ? (
          <button
            type="button"
            aria-pressed={includeSubnational}
            onClick={() =>
              navigate(slugA, slugB, mode, !includeSubnational)
            }
            className={`rounded-[2px] border px-2.5 py-1 transition-colors ${
              includeSubnational
                ? "border-[#e6ae49]/60 bg-[#e6ae49]/15 font-semibold text-[#fef3c7]"
                : "border-white/15 text-[#94a3b8] hover:border-white/30 hover:text-[#f1f5f9]"
            }`}
          >
            {includeSubnational ? "✓ " : "+ "}U.S. State Laws ({subnationalCount}
            )
          </button>
        ) : null}
      </div>
    </div>
  );
}
