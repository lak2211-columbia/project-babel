import Image from "next/image";

import { getOverviewData } from "@/lib/overview-data";
import {
  frameLabels,
  type CountrySnapshot,
  type FrameLabel,
} from "@/lib/seed-data";
import { frameHue, frameShort, scoreHexDark } from "../../_shared";

export const dynamic = "force-dynamic";

const ALL_FRAMES: FrameLabel[] = [
  "national_security",
  "fundamental_rights",
  "economic_competitiveness",
  "innovation_enablement",
  "social_stability",
  "consumer_public_safety",
];

const VARIANTS = [
  {
    id: "a",
    label: "A · Numeric grid",
    note: "Pure numbers, no charts. Tabular, most terminal-like.",
    Component: CardA,
    grid: "grid-cols-5",
  },
  {
    id: "b",
    label: "B · Radial dial",
    note: "SVG donut for composite, ring segmented by frame mix.",
    Component: CardB,
    grid: "grid-cols-5",
  },
  {
    id: "c",
    label: "C · Stacked ribbon",
    note: "Single stacked horizontal frame-mix bar. Minimal.",
    Component: CardC,
    grid: "grid-cols-5",
  },
  {
    id: "d",
    label: "D · Histogram",
    note: "All 6 frames as vertical bars. Full distribution visible.",
    Component: CardD,
    grid: "grid-cols-5",
  },
  {
    id: "e",
    label: "E · Stripe row",
    note: "Horizontal row per country, breaks the 5-col grid.",
    Component: CardE,
    grid: "grid-cols-1",
  },
] as const;

export default async function V1TerminalCards() {
  const data = await getOverviewData();

  return (
    <main className="min-h-[calc(100vh-49px-41px)] bg-[#0a0f18] font-mono text-[13px] text-[#cdd6e1]">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-[#7a8697]">
              V1 Terminal · country card explorations
            </p>
            <h1 className="mt-1 text-[16px] text-[#e6edf5]">
              Same data · 5 approaches · scroll to compare
            </h1>
          </div>
          <a
            href="#a"
            className="text-[11px] uppercase tracking-wider text-[#7a8697] hover:text-[#cdd6e1]"
          >
            jump ↓
          </a>
        </header>

        <nav className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {VARIANTS.map((variant) => (
            <a
              key={variant.id}
              href={`#${variant.id}`}
              className="rounded-sm border border-white/10 px-2 py-1 uppercase tracking-wider text-[#cdd6e1] hover:border-white/30 hover:bg-white/5"
            >
              {variant.label}
            </a>
          ))}
        </nav>

        <div className="mt-8 space-y-12">
          {VARIANTS.map((variant) => (
            <section key={variant.id} id={variant.id} className="scroll-mt-6">
              <div className="mb-3 flex items-baseline justify-between border-b border-white/5 pb-2">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-[#e6edf5]">
                    {variant.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#7a8697]">
                    {variant.note}
                  </p>
                </div>
                <p className="text-[10px] uppercase tracking-wider text-[#3f4857]">
                  variant {variant.id.toUpperCase()}
                </p>
              </div>

              <div className={`grid gap-3 ${variant.grid}`}>
                {data.countries.map((country) => (
                  <variant.Component key={country.slug} country={country} />
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-12 border-t border-white/10 pt-4 text-[10px] uppercase tracking-wider text-[#3f4857]">
          Tell me which direction to push · or which elements to mix
        </footer>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* A — Numeric grid                                                    */
/* ------------------------------------------------------------------ */

function CardA({ country }: { country: CountrySnapshot }) {
  return (
    <article className="rounded-sm border border-white/10 bg-[#0f1623] px-3 py-3">
      <div className="flex items-center gap-2">
        <Image
          src={country.flagUrl}
          alt=""
          width={28}
          height={21}
          className="h-[21px] w-[28px] rounded-[2px] border border-white/10 object-cover"
          unoptimized
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.1em] text-[#7a8697]">
            {country.shortName}
          </p>
          <p className="truncate text-[12px] text-[#e6edf5]">{country.name}</p>
        </div>
        <span
          className="text-[28px] font-semibold leading-none tabular-nums"
          style={{ color: scoreHexDark(country.compositeDivergence) }}
        >
          {country.compositeDivergence}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-white/5 pt-3 text-[11px]">
        <NumRow label="pol" value={country.policyDivergence} tone />
        <NumRow label="frm" value={country.framingDivergence} tone />
        <NumRow label="rev" value={country.reviewedDocuments} />
        <NumRow label="que" value={country.documentsInQueue} accent="#f5a623" />
      </div>

      <div className="mt-3 border-t border-white/5 pt-3">
        <p className="text-[9px] uppercase tracking-wider text-[#5d6675]">
          dominant
        </p>
        <p
          className="mt-0.5 text-[12px]"
          style={{ color: frameHue[country.dominantFrame] }}
        >
          {frameLabels[country.dominantFrame]}
        </p>
      </div>

      <dl className="mt-3 space-y-1 border-t border-white/5 pt-3 text-[11px]">
        {country.frameMix.map((frame) => (
          <div
            key={frame.label}
            className="flex items-baseline justify-between"
          >
            <dt
              className="text-[10px]"
              style={{ color: frameHue[frame.label] }}
            >
              {frameShort[frame.label]}
            </dt>
            <dd className="tabular-nums text-[#cdd6e1]">
              {String(frame.value).padStart(2, "0")}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function NumRow({
  label,
  value,
  tone,
  accent,
}: {
  label: string;
  value: number;
  tone?: boolean;
  accent?: string;
}) {
  const color = accent ?? (tone ? scoreHexDark(value) : "#cdd6e1");
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[9px] uppercase tracking-wider text-[#5d6675]">
        {label}
      </span>
      <span className="tabular-nums" style={{ color }}>
        {String(value).padStart(2, "0")}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* B — Radial dial                                                     */
/* ------------------------------------------------------------------ */

function CardB({ country }: { country: CountrySnapshot }) {
  const size = 116;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // Build segmented ring for the frame mix (sum <= 100)
  const mixTotal = country.frameMix.reduce((sum, f) => sum + f.value, 0);
  let offset = 0;
  const segments = country.frameMix.map((frame) => {
    const portion = (frame.value / Math.max(mixTotal, 1)) * circumference;
    const seg = {
      frame,
      dash: `${portion} ${circumference - portion}`,
      offset,
    };
    offset += portion;
    return seg;
  });

  return (
    <article className="rounded-sm border border-white/10 bg-[#0f1623] px-3 py-3">
      <div className="flex items-center gap-2">
        <Image
          src={country.flagUrl}
          alt=""
          width={28}
          height={21}
          className="h-[21px] w-[28px] rounded-[2px] border border-white/10 object-cover"
          unoptimized
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.1em] text-[#7a8697]">
            {country.shortName}
          </p>
          <p className="truncate text-[12px] text-[#e6edf5]">{country.name}</p>
        </div>
      </div>

      <div className="relative mt-3 flex items-center justify-center">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          {/* base ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#1a2333"
            strokeWidth={stroke}
            fill="none"
          />
          {/* segment ring */}
          {segments.map((seg) => (
            <circle
              key={seg.frame.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={frameHue[seg.frame.label]}
              strokeWidth={stroke}
              strokeDasharray={seg.dash}
              strokeDashoffset={-seg.offset}
              fill="none"
              strokeLinecap="butt"
            />
          ))}
          {/* inner composite arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius - stroke - 2}
            stroke="#141c2a"
            strokeWidth={3}
            fill="#0f1623"
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-[26px] font-semibold leading-none tabular-nums"
            style={{ color: scoreHexDark(country.compositeDivergence) }}
          >
            {country.compositeDivergence}
          </span>
          <span className="mt-0.5 text-[9px] uppercase tracking-wider text-[#5d6675]">
            composite
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
        <MiniStat label="pol" value={country.policyDivergence} tone />
        <MiniStat label="frm" value={country.framingDivergence} tone />
      </div>

      <div className="mt-3 border-t border-white/5 pt-2">
        <p
          className="text-[11px]"
          style={{ color: frameHue[country.dominantFrame] }}
        >
          {frameLabels[country.dominantFrame]}
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5 text-[9px] uppercase tracking-wider">
          {country.frameMix.map((frame) => (
            <span
              key={frame.label}
              className="flex items-center gap-1"
              style={{ color: frameHue[frame.label] }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: frameHue[frame.label] }}
              />
              {frame.value}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-[#5d6675]">
        <span>
          rev <span className="text-[#cdd6e1]">{country.reviewedDocuments}</span>
        </span>
        <span>
          q <span className="text-[#f5a623]">{country.documentsInQueue}</span>
        </span>
      </div>
    </article>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: boolean;
}) {
  const color = tone ? scoreHexDark(value) : "#cdd6e1";
  return (
    <div className="flex items-baseline justify-between border-t border-white/5 pt-1.5">
      <span className="text-[9px] uppercase tracking-wider text-[#5d6675]">
        {label}
      </span>
      <span className="tabular-nums" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* C — Stacked ribbon                                                  */
/* ------------------------------------------------------------------ */

function CardC({ country }: { country: CountrySnapshot }) {
  const mixTotal = country.frameMix.reduce((sum, f) => sum + f.value, 0);
  // Normalize segments to fill full ribbon width
  const segments = country.frameMix.map((frame) => ({
    frame,
    width: (frame.value / Math.max(mixTotal, 1)) * 100,
  }));

  return (
    <article className="rounded-sm border border-white/10 bg-[#0f1623] px-3 py-3">
      <div className="flex items-start gap-2">
        <Image
          src={country.flagUrl}
          alt=""
          width={28}
          height={21}
          className="h-[21px] w-[28px] rounded-[2px] border border-white/10 object-cover"
          unoptimized
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.1em] text-[#7a8697]">
            {country.shortName}
          </p>
          <p className="truncate text-[12px] text-[#e6edf5]">{country.name}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-wider text-[#5d6675]">
            cmp
          </p>
          <p
            className="text-[22px] font-semibold leading-none tabular-nums"
            style={{ color: scoreHexDark(country.compositeDivergence) }}
          >
            {country.compositeDivergence}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <TinyBar label="pol" value={country.policyDivergence} />
        <TinyBar label="frm" value={country.framingDivergence} />
      </div>

      <div className="mt-3 border-t border-white/5 pt-3">
        <div className="flex h-2 overflow-hidden rounded-[1px] bg-white/5">
          {segments.map((seg) => (
            <div
              key={seg.frame.label}
              style={{
                width: `${seg.width}%`,
                background: frameHue[seg.frame.label],
              }}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] uppercase tracking-wider">
          {country.frameMix.map((frame) => (
            <span
              key={frame.label}
              className="flex items-center gap-1"
              style={{ color: frameHue[frame.label] }}
            >
              <span
                className="h-1.5 w-1.5 rounded-[1px]"
                style={{ background: frameHue[frame.label] }}
              />
              {frameShort[frame.label]} {frame.value}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2 text-[10px] text-[#5d6675]">
        <span
          className="truncate"
          style={{ color: frameHue[country.dominantFrame] }}
        >
          {frameShort[country.dominantFrame]}
        </span>
        <span>
          rev <span className="text-[#cdd6e1]">{country.reviewedDocuments}</span>
          <span className="mx-1 text-[#3f4857]">·</span>q{" "}
          <span className="text-[#f5a623]">{country.documentsInQueue}</span>
        </span>
      </div>
    </article>
  );
}

function TinyBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-6 text-[#5d6675]">{label}</span>
      <div className="h-[4px] flex-1 rounded-[1px] bg-white/5">
        <div
          className="h-[4px] rounded-[1px]"
          style={{ width: `${value}%`, background: scoreHexDark(value) }}
        />
      </div>
      <span
        className="w-6 text-right tabular-nums"
        style={{ color: scoreHexDark(value) }}
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* D — Histogram (all 6 frames)                                        */
/* ------------------------------------------------------------------ */

function CardD({ country }: { country: CountrySnapshot }) {
  // Build a map of frame → value, then render all 6 bars in fixed order
  const mixMap = new Map(country.frameMix.map((f) => [f.label, f.value]));
  const maxValue = Math.max(...country.frameMix.map((f) => f.value), 1);

  return (
    <article className="rounded-sm border border-white/10 bg-[#0f1623] px-3 py-3">
      <div className="flex items-start gap-2">
        <Image
          src={country.flagUrl}
          alt=""
          width={28}
          height={21}
          className="h-[21px] w-[28px] rounded-[2px] border border-white/10 object-cover"
          unoptimized
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.1em] text-[#7a8697]">
            {country.shortName}
          </p>
          <p className="truncate text-[12px] text-[#e6edf5]">{country.name}</p>
          <p
            className="mt-0.5 truncate text-[10px]"
            style={{ color: frameHue[country.dominantFrame] }}
          >
            {frameShort[country.dominantFrame]}
          </p>
        </div>
        <span
          className="text-[24px] font-semibold leading-none tabular-nums"
          style={{ color: scoreHexDark(country.compositeDivergence) }}
        >
          {country.compositeDivergence}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3 text-[10px]">
        <span className="text-[#5d6675]">pol</span>
        <span
          className="tabular-nums"
          style={{ color: scoreHexDark(country.policyDivergence) }}
        >
          {country.policyDivergence}
        </span>
        <span className="text-[#3f4857]">·</span>
        <span className="text-[#5d6675]">frm</span>
        <span
          className="tabular-nums"
          style={{ color: scoreHexDark(country.framingDivergence) }}
        >
          {country.framingDivergence}
        </span>
      </div>

      <div className="mt-3 border-t border-white/5 pt-3">
        <p className="text-[9px] uppercase tracking-wider text-[#5d6675]">
          frame distribution
        </p>
        <div className="mt-2 flex h-14 items-end gap-1.5">
          {ALL_FRAMES.map((frame) => {
            const value = mixMap.get(frame) ?? 0;
            const height = value === 0 ? 2 : Math.round((value / maxValue) * 100);
            return (
              <div
                key={frame}
                className="group flex flex-1 flex-col items-center justify-end"
              >
                <span
                  className="mb-1 text-[9px] tabular-nums"
                  style={{
                    color: value > 0 ? frameHue[frame] : "#3f4857",
                  }}
                >
                  {value || ""}
                </span>
                <div
                  className="w-full rounded-[1px]"
                  style={{
                    height: `${height}%`,
                    background:
                      value > 0 ? frameHue[frame] : "rgba(255,255,255,0.04)",
                    minHeight: 2,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-1.5 text-[8px] uppercase tracking-wider">
          {ALL_FRAMES.map((frame) => (
            <span
              key={frame}
              className="flex-1 truncate text-center"
              style={{
                color:
                  frame === country.dominantFrame
                    ? frameHue[frame]
                    : "#5d6675",
              }}
            >
              {frameShort[frame].slice(0, 4)}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2 text-[10px] text-[#5d6675]">
        <span>
          rev <span className="text-[#cdd6e1]">{country.reviewedDocuments}</span>
        </span>
        <span>
          queue{" "}
          <span className="text-[#f5a623]">{country.documentsInQueue}</span>
        </span>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* E — Stripe row (horizontal, one country per full row)               */
/* ------------------------------------------------------------------ */

function CardE({ country }: { country: CountrySnapshot }) {
  const mixTotal = country.frameMix.reduce((sum, f) => sum + f.value, 0);

  return (
    <article className="grid items-center gap-4 rounded-sm border border-white/10 bg-[#0f1623] px-4 py-3 text-[12px] md:grid-cols-[220px_80px_minmax(140px,200px)_minmax(0,1fr)_160px]">
      {/* Flag + name + dominant frame */}
      <div className="flex items-center gap-3">
        <Image
          src={country.flagUrl}
          alt=""
          width={36}
          height={27}
          className="h-[27px] w-[36px] rounded-[2px] border border-white/10 object-cover"
          unoptimized
        />
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-[0.1em] text-[#7a8697]">
              {country.shortName}
            </span>
            <span className="truncate text-[13px] text-[#e6edf5]">
              {country.name}
            </span>
          </div>
          <p
            className="mt-0.5 truncate text-[10px] uppercase tracking-wider"
            style={{ color: frameHue[country.dominantFrame] }}
          >
            {frameLabels[country.dominantFrame]}
          </p>
        </div>
      </div>

      {/* Composite big number */}
      <div className="flex flex-col items-center">
        <span className="text-[9px] uppercase tracking-wider text-[#5d6675]">
          cmp
        </span>
        <span
          className="text-[28px] font-semibold leading-none tabular-nums"
          style={{ color: scoreHexDark(country.compositeDivergence) }}
        >
          {country.compositeDivergence}
        </span>
      </div>

      {/* pol + frm stacked bars */}
      <div className="space-y-1.5">
        <TinyBar label="pol" value={country.policyDivergence} />
        <TinyBar label="frm" value={country.framingDivergence} />
      </div>

      {/* Frame-mix stacked ribbon with inline labels */}
      <div>
        <div className="flex h-2 overflow-hidden rounded-[1px] bg-white/5">
          {country.frameMix.map((frame) => (
            <div
              key={frame.label}
              style={{
                width: `${(frame.value / Math.max(mixTotal, 1)) * 100}%`,
                background: frameHue[frame.label],
              }}
            />
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[9px] uppercase tracking-wider">
          {country.frameMix.map((frame) => (
            <span
              key={frame.label}
              className="flex items-center gap-1"
              style={{ color: frameHue[frame.label] }}
            >
              <span
                className="h-1.5 w-1.5 rounded-[1px]"
                style={{ background: frameHue[frame.label] }}
              />
              {frameShort[frame.label]} {frame.value}
            </span>
          ))}
        </div>
      </div>

      {/* Counts */}
      <div className="flex items-center justify-end gap-4 text-[10px]">
        <div className="flex flex-col items-end">
          <span className="text-[9px] uppercase tracking-wider text-[#5d6675]">
            reviewed
          </span>
          <span className="text-[16px] text-[#e6edf5] tabular-nums">
            {country.reviewedDocuments}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[9px] uppercase tracking-wider text-[#5d6675]">
            queue
          </span>
          <span className="text-[16px] text-[#f5a623] tabular-nums">
            {country.documentsInQueue}
          </span>
        </div>
      </div>
    </article>
  );
}
