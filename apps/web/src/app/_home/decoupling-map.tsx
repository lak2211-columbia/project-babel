"use client";

import Link from "next/link";
import { useState } from "react";

import { scoreHexDark } from "@/lib/frame-vocab";
import type {
  CountrySnapshot,
  NullCalibration,
  PairwiseDetail,
  ScoringMode,
} from "@/lib/seed-data";

type Box = { x1: number; y1: number; x2: number; y2: number };

type PlacedLabel = {
  lx: number;
  ly: number;
  anchor: "start" | "middle" | "end";
  needsLeader: boolean;
  box: Box;
};

function overlapArea(a: Box, b: Box): number {
  const ox = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const oy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  return ox * oy;
}

/**
 * Deterministic 2D label collision-avoidance solver (Phase 5A QA polish):
 * Evaluates directional candidate positions around each plotted point and picks
 * the lowest-penalty non-overlapping box within the SVG plot bounds so closely
 * spaced pairs (e.g., EU/US, CN/JP, JP/US, KR/US) never collide.
 */
function placePairLabels(
  points: { key: string; cx: number; cy: number; label: string }[],
  bounds: { left: number; right: number; top: number; bottom: number },
): Map<string, PlacedLabel> {
  const placed = new Map<string, PlacedLabel>();
  const placedBoxes: Box[] = [];
  const labelW = 42;
  const labelH = 14;
  const pad = 2;

  const candidates: {
    dx: number;
    dy: number;
    anchor: "start" | "middle" | "end";
    rankCost: number;
  }[] = [
    { dx: 10, dy: 4, anchor: "start", rankCost: 0 },
    { dx: -10, dy: 4, anchor: "end", rankCost: 1 },
    { dx: 0, dy: -11, anchor: "middle", rankCost: 2 },
    { dx: 0, dy: 19, anchor: "middle", rankCost: 3 },
    { dx: 11, dy: -9, anchor: "start", rankCost: 4 },
    { dx: -11, dy: -9, anchor: "end", rankCost: 5 },
    { dx: 11, dy: 17, anchor: "start", rankCost: 6 },
    { dx: -11, dy: 17, anchor: "end", rankCost: 7 },
    { dx: 18, dy: -16, anchor: "start", rankCost: 10 },
    { dx: -18, dy: -16, anchor: "end", rankCost: 11 },
    { dx: 18, dy: 24, anchor: "start", rankCost: 12 },
    { dx: -18, dy: 24, anchor: "end", rankCost: 13 },
    { dx: 0, dy: -24, anchor: "middle", rankCost: 14 },
    { dx: 0, dy: 30, anchor: "middle", rankCost: 15 },
    { dx: 26, dy: 4, anchor: "start", rankCost: 18 },
    { dx: -26, dy: 4, anchor: "end", rankCost: 19 },
  ];

  // Place densest / central points first so crowded clusters get clean spread
  const ordered = [...points].sort((a, b) => a.cx - b.cx || a.cy - b.cy);

  for (const pt of ordered) {
    let best: PlacedLabel | null = null;
    let bestPenalty = Number.POSITIVE_INFINITY;

    for (const cand of candidates) {
      const lx = pt.cx + cand.dx;
      const ly = pt.cy + cand.dy;
      const x1 =
        cand.anchor === "start"
          ? lx - pad
          : cand.anchor === "end"
            ? lx - labelW - pad
            : lx - labelW / 2 - pad;
      const x2 = x1 + labelW + pad * 2;
      const y1 = ly - labelH + 2 - pad;
      const y2 = ly + 3 + pad;
      const box: Box = { x1, y1, x2, y2 };

      let penalty = cand.rankCost;

      // Penalize clipping plot edges (including quadrant callout text zones)
      if (x1 < bounds.left) penalty += (bounds.left - x1) * 40;
      if (x2 > bounds.right) penalty += (x2 - bounds.right) * 40;
      if (y1 < bounds.top + 18) penalty += (bounds.top + 18 - y1) * 40;
      if (y2 > bounds.bottom - 16) penalty += (y2 - (bounds.bottom - 16)) * 40;

      // Heavily penalize overlapping any already-placed label box
      for (const prev of placedBoxes) {
        const area = overlapArea(box, prev);
        if (area > 0) penalty += 2000 + area * 12;
      }

      // Penalize overlapping any scatter dot
      for (const other of points) {
        const dotBox: Box = {
          x1: other.cx - 8,
          y1: other.cy - 8,
          x2: other.cx + 8,
          y2: other.cy + 8,
        };
        const area = overlapArea(box, dotBox);
        if (area > 0) penalty += 1500 + area * 10;
      }

      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        const dist = Math.hypot(cand.dx, cand.dy);
        best = {
          lx,
          ly,
          anchor: cand.anchor,
          needsLeader: dist >= 18,
          box,
        };
      }
    }

    if (best) {
      placed.set(pt.key, best);
      placedBoxes.push(best.box);
    }
  }

  return placed;
}

/**
 * Interactive 2D Policy–Framing Decoupling Map (C2 + Phase 5A collision solver):
 * Plots all 10 unique jurisdiction pairs on Policy Distance (X) vs. Framing
 * Distance (Y) with the POL = FRM diagonal, quadrant callouts, non-overlapping
 * labels, click-to-compare links, and an accessible tabular alternative (C6).
 */
export function DecouplingMap({
  countries,
  pairwiseDetails,
  nullCalibration,
  mode,
  includeSubnational = false,
}: {
  countries: CountrySnapshot[];
  pairwiseDetails: PairwiseDetail[];
  nullCalibration: NullCalibration;
  mode: ScoringMode;
  includeSubnational?: boolean;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const bySlug = new Map(countries.map((c) => [c.slug, c]));
  const uniquePairs = pairwiseDetails
    .filter((p) => p.leftSlug.localeCompare(p.rightSlug) < 0)
    .map((p) => {
      const left = bySlug.get(p.leftSlug);
      const right = bySlug.get(p.rightSlug);
      return {
        ...p,
        key: `${p.leftSlug}__${p.rightSlug}`,
        leftShort: left?.shortName ?? p.leftSlug.slice(0, 2).toUpperCase(),
        rightShort: right?.shortName ?? p.rightSlug.slice(0, 2).toUpperCase(),
        leftName: left?.name ?? p.leftSlug,
        rightName: right?.name ?? p.rightSlug,
      };
    });

  if (uniquePairs.length === 0) return null;

  const maxCoord = Math.max(
    55,
    ...uniquePairs.flatMap((p) => [p.policyDistance + 8, p.framingDistance + 8]),
  );
  const axisMax = Math.min(100, Math.ceil(maxCoord / 10) * 10);

  // SVG coordinate system
  const W = 540;
  const H = 348;
  const padL = 52;
  const padR = 26;
  const padT = 22;
  const padB = 46;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const sx = (val: number) => padL + (val / axisMax) * plotW;
  const sy = (val: number) => padT + plotH - (val / axisMax) * plotH;

  const labelPlacements = placePairLabels(
    uniquePairs.map((pair) => ({
      key: pair.key,
      cx: sx(Math.min(axisMax, pair.policyDistance)),
      cy: sy(Math.min(axisMax, pair.framingDistance)),
      label: `${pair.leftShort}/${pair.rightShort}`,
    })),
    { left: padL + 4, right: W - padR - 4, top: padT, bottom: padT + plotH },
  );

  const activePair =
    uniquePairs.find((p) => p.key === hoveredKey) ??
    [...uniquePairs].sort(
      (a, b) => Math.abs(b.decouplingGap) - Math.abs(a.decouplingGap),
    )[0];

  const querySuffix =
    (mode === "all" ? "&mode=all" : "") + (includeSubnational ? "&states=1" : "");
  const ticks = [0, Math.round(axisMax / 2), axisMax];

  return (
    <div className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
        <div>
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
            policy_vs_framing · 2d decoupling map
          </h2>
          <p className="mt-0.5 text-[12px] text-[#94a3b8]">
            All 10 country pairs plotted by Policy Distance (X) vs. Framing
            Distance (Y). Points off the diagonal indicate decoupling.
          </p>
        </div>

        <div
          role="group"
          aria-label="Decoupling map view mode"
          className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em]"
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
            scatter
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
      </header>

      {view === "table" ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left font-mono text-[12px]">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-[#94a3b8]">
                <th className="pb-2 pr-3 font-medium">pair</th>
                <th className="pb-2 pr-3 text-right font-medium">POL</th>
                <th className="pb-2 pr-3 text-right font-medium">FRM</th>
                <th className="pb-2 pr-3 text-right font-medium">POL − FRM</th>
                <th className="pb-2 pr-3 text-right font-medium">CMP</th>
                <th className="pb-2 text-right font-medium">coverage L1</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[...uniquePairs]
                .sort((a, b) => b.compositeDistance - a.compositeDistance)
                .map((p) => (
                  <tr key={p.key} className="hover:bg-white/[0.03]">
                    <td className="py-1.5 pr-3">
                      <Link
                        href={`/compare?a=${p.leftSlug}&b=${p.rightSlug}${querySuffix}`}
                        className="text-[#f1f5f9] underline decoration-white/25 underline-offset-2 hover:text-[#67e8f9]"
                      >
                        {p.leftShort} / {p.rightShort}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-[#cdd6e1]">
                      {p.policyDistance}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-[#cdd6e1]">
                      {p.framingDistance}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-[#94a3b8]">
                      {p.decouplingGap > 0
                        ? `+${p.decouplingGap}`
                        : p.decouplingGap}
                    </td>
                    <td
                      className="py-1.5 pr-3 text-right font-semibold tabular-nums"
                      style={{
                        color: scoreHexDark(
                          p.compositeDistance,
                          nullCalibration.pairwiseCompositeMean,
                          nullCalibration.pairwiseCompositeP90,
                          "pairwise",
                        ),
                      }}
                    >
                      {p.compositeDistance}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-[#94a3b8]">
                      {p.coverageDistance}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Scatter plot of 10 jurisdiction pairs comparing policy distance on the horizontal axis against framing distance on the vertical axis"
            className="h-auto w-full rounded-[2px] border border-white/10 bg-[#0a0f18]"
          >
            {/* Subtle null-noise box */}
            {nullCalibration.pairwisePolicyMean > 0 &&
            nullCalibration.pairwiseFramingMean > 0 ? (
              <rect
                x={sx(0)}
                y={sy(Math.min(axisMax, nullCalibration.pairwiseFramingMean))}
                width={
                  sx(Math.min(axisMax, nullCalibration.pairwisePolicyMean)) -
                  sx(0)
                }
                height={
                  sy(0) -
                  sy(Math.min(axisMax, nullCalibration.pairwiseFramingMean))
                }
                fill="rgba(148, 163, 184, 0.08)"
              />
            ) : null}

            {/* Grid lines */}
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={sx(t)}
                  y1={padT}
                  x2={sx(t)}
                  y2={padT + plotH}
                  stroke="rgba(255,255,255,0.07)"
                />
                <line
                  x1={padL}
                  y1={sy(t)}
                  x2={padL + plotW}
                  y2={sy(t)}
                  stroke="rgba(255,255,255,0.07)"
                />
                <text
                  x={sx(t)}
                  y={H - 22}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="11"
                  fontFamily="var(--font-geist-mono), monospace"
                >
                  {t}
                </text>
                <text
                  x={padL - 8}
                  y={sy(t) + 4}
                  textAnchor="end"
                  fill="#94a3b8"
                  fontSize="11"
                  fontFamily="var(--font-geist-mono), monospace"
                >
                  {t}
                </text>
              </g>
            ))}

            {/* POL = FRM diagonal */}
            <line
              x1={sx(0)}
              y1={sy(0)}
              x2={sx(axisMax)}
              y2={sy(axisMax)}
              stroke="rgba(148, 163, 184, 0.45)"
              strokeDasharray="4 4"
            />

            {/* Quadrant callouts */}
            <text
              x={padL + 8}
              y={padT + 14}
              fill="#94a3b8"
              fontSize="11"
              fontFamily="var(--font-geist-mono), monospace"
            >
              FRAMING &gt; POLICY (same rules, different reasons)
            </text>
            <text
              x={W - padR - 6}
              y={padT + plotH - 6}
              textAnchor="end"
              fill="#94a3b8"
              fontSize="11"
              fontFamily="var(--font-geist-mono), monospace"
            >
              POLICY &gt; FRAMING (same reasons, different rules)
            </text>

            {/* Axis labels */}
            <text
              x={padL + plotW / 2}
              y={H - 4}
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize="11"
              fontFamily="var(--font-geist-mono), monospace"
            >
              POLICY DISTANCE (TVD 0–100) →
            </text>
            <text
              x={14}
              y={padT + plotH / 2}
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize="11"
              fontFamily="var(--font-geist-mono), monospace"
              transform={`rotate(-90 14 ${padT + plotH / 2})`}
            >
              FRAMING DISTANCE →
            </text>

            {/* 10 clickable pair points with collision-free labels */}
            {uniquePairs.map((pair) => {
              const cx = sx(Math.min(axisMax, pair.policyDistance));
              const cy = sy(Math.min(axisMax, pair.framingDistance));
              const isSelected = activePair?.key === pair.key;
              const placement = labelPlacements.get(pair.key);
              const lx = placement?.lx ?? cx + 10;
              const ly = placement?.ly ?? cy + 4;
              const anchor = placement?.anchor ?? "start";
              const color = scoreHexDark(
                pair.compositeDistance,
                nullCalibration.pairwiseCompositeMean,
                nullCalibration.pairwiseCompositeP90,
                "pairwise",
              );
              return (
                <Link
                  key={pair.key}
                  href={`/compare?a=${pair.leftSlug}&b=${pair.rightSlug}${querySuffix}`}
                  aria-label={`Compare ${pair.leftName} vs ${pair.rightName}: Policy ${pair.policyDistance}, Framing ${pair.framingDistance}`}
                  onMouseEnter={() => setHoveredKey(pair.key)}
                  onFocus={() => setHoveredKey(pair.key)}
                >
                  <g className="cursor-pointer">
                    {placement?.needsLeader ? (
                      <line
                        x1={cx}
                        y1={cy}
                        x2={
                          anchor === "start"
                            ? lx - 2
                            : anchor === "end"
                              ? lx + 2
                              : lx
                        }
                        y2={ly - 4}
                        stroke="rgba(148, 163, 184, 0.45)"
                        strokeWidth={1}
                      />
                    ) : null}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isSelected ? 7.5 : 5.5}
                      fill={color}
                      stroke={isSelected ? "#f8fafc" : "#0a0f18"}
                      strokeWidth={isSelected ? 2 : 1.5}
                    />
                    <text
                      x={lx}
                      y={ly}
                      textAnchor={anchor}
                      fill={isSelected ? "#f8fafc" : "#cbd5e1"}
                      fontSize="11"
                      fontWeight={isSelected ? 700 : 500}
                      fontFamily="var(--font-geist-mono), monospace"
                    >
                      {pair.leftShort}/{pair.rightShort}
                    </text>
                  </g>
                </Link>
              );
            })}
          </svg>

          {/* Active pair focus readout */}
          {activePair ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[2px] border border-white/10 bg-[#0a0f18] px-3 py-2 text-[12px]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-[#f1f5f9]">
                  {activePair.leftName} / {activePair.rightName}
                </span>
                <span className="font-mono text-[#38bdf8]">
                  POL {activePair.policyDistance}
                </span>
                <span className="font-mono text-[#67e8f9]">
                  FRM {activePair.framingDistance}
                </span>
                <span className="font-mono text-[#94a3b8]">
                  COV {activePair.coverageDistance}
                </span>
              </div>
              <Link
                href={`/compare?a=${activePair.leftSlug}&b=${activePair.rightSlug}${querySuffix}`}
                className="font-mono text-[11px] uppercase tracking-wider text-[#67e8f9] underline decoration-[#67e8f9]/40 underline-offset-2 hover:text-white"
              >
                open diff →
              </Link>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
