"use client";

import { frameAbbr, frameDefinition, frameHue } from "@/lib/frame-vocab";
import { frameLabels, type FrameLabel } from "@/lib/seed-data";

import { HoverTip } from "./hover-tip";

/**
 * Hover tooltip for a risk framing label. Renders its content into a
 * portal on document.body — no ancestor stacking context can clip it.
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
  const color = frameHue[frame];
  return (
    <HoverTip
      trigger={children}
      align={align}
      width={320}
    >
      <div aria-hidden className="h-[2px] w-full" style={{ background: color }} />
      <div className="px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{ color }}
          >
            {frameLabels[frame]}
          </p>
          <span className="text-[9px] uppercase tracking-[0.1em] text-[#5d6675]">
            {frameAbbr[frame]}
          </span>
        </div>
        <p className="mt-2.5 text-[11px] font-semibold leading-snug text-[#e6edf5]">
          {definition.short}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-[#7a8697]">
          {definition.long}
        </p>
        <div className="mt-3 border-t border-white/5 pt-2.5">
          <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#5d6675]">
            <span
              aria-hidden
              className="inline-block h-[1px] w-3"
              style={{ background: `${color}80` }}
            />
            Example
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-[#cdd6e1]">
            {definition.example}
          </p>
        </div>
      </div>
    </HoverTip>
  );
}

/**
 * Metric chip hover tooltip (POL/FRM/CMP).
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
    <HoverTip trigger={children} align="start" width={320}>
      <div aria-hidden className="h-[2px] w-full bg-[#cdd6e1]/40" />
      <div className="px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#e6edf5]">
            {metric.code} · {metric.label}
          </p>
          <span className="text-[9px] uppercase tracking-[0.1em] text-[#5d6675]">
            {metric.question}
          </span>
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-[#cdd6e1]">
          {metric.desc}
        </p>
        <div className="mt-3 border-t border-white/5 pt-2.5">
          <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#5d6675]">
            <span
              aria-hidden
              className="inline-block h-[1px] w-3 bg-[#cdd6e1]/40"
            />
            Example
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-[#7a8697]">
            {metric.example}
          </p>
        </div>
      </div>
    </HoverTip>
  );
}
