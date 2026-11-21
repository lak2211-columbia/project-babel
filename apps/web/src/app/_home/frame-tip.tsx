"use client";

import {
  frameAbbr,
  frameDefinition,
  frameHue,
  frameTextHue,
} from "@/lib/frame-vocab";
import { frameLabels, type FrameLabel } from "@/lib/seed-data";

import { HoverTip } from "./hover-tip";

/**
 * Tooltip for a risk framing label synced with Codebook v2.1.0 / label-definitions.json.
 * Enforces >= 11px typography floor and Geist Sans prose readability.
 */
export function FrameTip({
  frame,
  children,
  align = "start",
}: {
  frame: FrameLabel;
  children: React.ReactNode;
  align?: "start" | "center";
}) {
  const definition = frameDefinition[frame];
  const barColor = frameHue[frame];
  const textColor = frameTextHue[frame];
  return (
    <HoverTip trigger={children} align={align} width={360}>
      <div aria-hidden className="h-[2px] w-full" style={{ background: barColor }} />
      <div className="px-4 py-3.5 font-sans">
        <div className="flex items-baseline justify-between gap-3 border-b border-white/10 pb-2 font-mono">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: textColor }}
          >
            {frameLabels[frame]}
          </p>
          <span className="text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
            {frameAbbr[frame]}
          </span>
        </div>
        <p className="mt-2.5 text-[12.5px] font-semibold leading-snug text-[#f1f5f9]">
          {definition.short}
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-[#cbd5e1]">
          {definition.long}
        </p>
        <div className="mt-3 space-y-1.5 border-t border-white/10 pt-2.5 text-[11.5px] leading-relaxed">
          <p className="text-[#cbd5e1]">
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#67e8f9]">
              include:{" "}
            </span>
            {definition.includeWhen}
          </p>
          <p className="text-[#94a3b8]">
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
              exclude:{" "}
            </span>
            {definition.excludeWhen}
          </p>
        </div>
      </div>
    </HoverTip>
  );
}

/**
 * Metric chip tooltip (POL/FRM/COV/CMP).
 */
export function MetricTip({
  metric,
  children,
}: {
  metric: {
    code: string;
    label: string;
    question: string;
    desc: string;
    example: string;
  };
  children: React.ReactNode;
}) {
  return (
    <HoverTip trigger={children} align="start" width={360}>
      <div aria-hidden className="h-[2px] w-full bg-[#38bdf8]/60" />
      <div className="px-4 py-3.5 font-sans">
        <div className="flex items-baseline justify-between gap-3 border-b border-white/10 pb-2 font-mono">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#f1f5f9]">
            {metric.code} · {metric.label}
          </p>
          <span className="text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
            {metric.question}
          </span>
        </div>
        <p className="mt-2.5 text-[12px] leading-relaxed text-[#cbd5e1]">
          {metric.desc}
        </p>
        <div className="mt-3 border-t border-white/10 pt-2.5">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
            How to interpret
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[#a3b0c2]">
            {metric.example}
          </p>
        </div>
      </div>
    </HoverTip>
  );
}
