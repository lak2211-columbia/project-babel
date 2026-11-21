"use client";

import { useState } from "react";

import { frameAbbr, frameHue, frameTextHue } from "@/lib/frame-vocab";
import {
  allFrameLabels,
  frameLabels,
  type YearlyTimelinePoint,
} from "@/lib/seed-data";

/**
 * Longitudinal timeline chart with sparse-year visual muting (n < 3 -> "low n"),
 * exact proportional binding-law height (no artificial 14% floor — B8), and an
 * accessible tabular data alternative (C6).
 */
export function TimelineChart({
  timeline,
  title = "longitudinal_corpus · policy & framing by publication year",
  subtitle,
}: {
  timeline: YearlyTimelinePoint[];
  title?: string;
  subtitle?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");

  if (timeline.length === 0) {
    return null;
  }

  const maxDocs = Math.max(...timeline.map((point) => point.totalDocuments), 1);
  const firstYear = timeline[0].year;
  const lastYear = timeline[timeline.length - 1].year;
  const totalDocs = timeline.reduce((sum, point) => sum + point.totalDocuments, 0);
  const totalBinding = timeline.reduce(
    (sum, point) => sum + point.bindingDocuments,
    0,
  );

  return (
    <section
      aria-label="Longitudinal timeline by publication year"
      className="rounded-sm border border-white/10 bg-[#0f1623] px-4 py-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
        <div>
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
            {title}
          </h2>
          <p className="mt-0.5 text-[12px] text-[#94a3b8]">
            {subtitle ??
              `${firstYear}–${lastYear} · ${totalDocs} dated documents (${totalBinding} binding statutes); years with n < 3 are muted`}
          </p>
        </div>

        <div
          role="group"
          aria-label="Timeline view mode"
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
            chart
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
                <th className="pb-2 pr-3 font-medium">year</th>
                <th className="pb-2 pr-3 text-right font-medium">docs (n)</th>
                <th className="pb-2 pr-3 text-right font-medium">binding law</th>
                <th className="pb-2 pr-3 font-medium">leading frame</th>
                <th className="pb-2 font-medium">sample note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {timeline.map((point) => {
                const isSparse = point.totalDocuments < 3;
                return (
                  <tr key={point.year}>
                    <td className="py-1.5 pr-3 font-semibold text-[#f1f5f9]">
                      {point.year}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-[#cdd6e1]">
                      {point.totalDocuments}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-[#67e8f9]">
                      {point.bindingDocuments}
                    </td>
                    <td
                      className="py-1.5 pr-3 font-sans"
                      style={{
                        color: isSparse
                          ? "#94a3b8"
                          : frameTextHue[point.dominantFrame],
                      }}
                    >
                      {frameLabels[point.dominantFrame]} (
                      {point.frameShares[point.dominantFrame] ?? 0}%)
                    </td>
                    <td className="py-1.5 text-[11px] text-[#94a3b8]">
                      {isSparse ? "low n (< 3 docs)" : "sufficient sample"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto pb-1">
          <div
            className="grid min-w-[580px] gap-2"
            style={{
              gridTemplateColumns: `repeat(${timeline.length}, minmax(64px, 1fr))`,
            }}
          >
            {timeline.map((point) => {
              const isSparse = point.totalDocuments < 3;
              const barHeightPct = Math.max(
                Math.round((point.totalDocuments / maxDocs) * 100),
                6,
              );
              // B8: Exact proportional binding share (no artificial 14% floor!)
              const bindingRatioPct =
                point.totalDocuments > 0
                  ? (point.bindingDocuments / point.totalDocuments) * 100
                  : 0;

              return (
                <div
                  key={point.year}
                  className={`flex flex-col items-stretch rounded-[2px] border px-2 py-2 ${
                    isSparse
                      ? "ago-sparse-hatch border-white/10 bg-[#0a0f18]/70 opacity-75"
                      : "border-white/10 bg-[#0a0f18]"
                  }`}
                >
                  <div className="flex items-baseline justify-between font-mono text-[11px] tabular-nums">
                    <span className="font-semibold text-[#f1f5f9]">
                      {point.year}
                    </span>
                    <span className="text-[#94a3b8]">n={point.totalDocuments}</span>
                  </div>

                  {/* Proportional volume bar + true binding overlay */}
                  <div
                    className="mt-2 flex h-16 items-end border-b border-white/15 pb-px"
                    title={`${point.year}: ${point.totalDocuments} documents (${point.bindingDocuments} binding laws)`}
                  >
                    <div
                      className="ago-bar relative w-full overflow-hidden rounded-t-[1px] bg-white/15"
                      style={{ height: `${barHeightPct}%` }}
                    >
                      {point.bindingDocuments > 0 ? (
                        <div
                          className="absolute inset-x-0 bottom-0 bg-[#67e8f9]/85"
                          style={{ height: `${bindingRatioPct}%` }}
                        />
                      ) : null}
                    </div>
                  </div>

                  {/* Stacked 8-frame strip (muted on sparse low-n years — B8) */}
                  <div
                    className={`mt-2 flex h-2.5 w-full overflow-hidden rounded-[1px] bg-white/5 ${
                      isSparse ? "grayscale opacity-60" : ""
                    }`}
                    aria-label={`${point.year} framing distribution led by ${frameLabels[point.dominantFrame]}`}
                  >
                    {allFrameLabels.map((frame) => {
                      const share = point.frameShares[frame] ?? 0;
                      if (share <= 0) return null;
                      return (
                        <span
                          key={frame}
                          style={{
                            width: `${share}%`,
                            background: frameHue[frame],
                          }}
                          title={`${frameLabels[frame]}: ${share}%`}
                        />
                      );
                    })}
                  </div>

                  <div className="mt-1.5 flex items-center justify-between font-mono text-[11px]">
                    {isSparse ? (
                      <span className="text-[#94a3b8]">low n</span>
                    ) : (
                      <span
                        className="font-semibold"
                        style={{ color: frameTextHue[point.dominantFrame] }}
                      >
                        {frameAbbr[point.dominantFrame]}
                      </span>
                    )}
                    <span className="tabular-nums text-[#94a3b8]">
                      {point.bindingDocuments > 0
                        ? `${point.bindingDocuments} law`
                        : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5 text-[11px] text-[#94a3b8]">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[1px] bg-white/25" />
            all dated docs
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[1px] bg-[#67e8f9]/85" />
            binding statute share (proportional)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="ago-sparse-hatch inline-block h-2.5 w-3.5 rounded-[1px] border border-white/20" />
            low n (&lt; 3 docs, muted)
          </span>
        </div>
        <span className="font-mono">grouped by official publication date</span>
      </div>
    </section>
  );
}
