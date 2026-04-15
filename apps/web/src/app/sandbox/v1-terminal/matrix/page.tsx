import Image from "next/image";

import { getOverviewData } from "@/lib/overview-data";
import { matrixLabels, type CountrySnapshot } from "@/lib/seed-data";
import { scoreHexDark } from "../../_shared";

export const dynamic = "force-dynamic";

type Pair = {
  aIndex: number;
  bIndex: number;
  aLabel: string;
  bLabel: string;
  score: number;
};

const VARIANTS = [
  {
    id: "a",
    label: "A · Chord diagram",
    note: "Pentagon of countries, 10 weighted lines. Shows the whole relationship landscape in one shape.",
  },
  {
    id: "b",
    label: "B · Ranked pair list",
    note: "All 10 pairs, most divergent first. Best for 'which pairs should I care about?'",
  },
  {
    id: "c",
    label: "C · Upper triangle",
    note: "Grid stripped of duplicates. 10 cells instead of 25, larger and more readable.",
  },
  {
    id: "d",
    label: "D · Small multiples",
    note: "One mini panel per country showing its distance to the other four. Subject-centric.",
  },
  {
    id: "e",
    label: "E · Constellation",
    note: "2D projection where visual distance ≈ divergence score. Captures overall clustering.",
  },
] as const;

function bandLabel(score: number) {
  if (score >= 65) return "outlier";
  if (score >= 45) return "noticeably different";
  return "aligned";
}

function buildPairs(matrix: string[][]): Pair[] {
  const pairs: Pair[] = [];
  for (let i = 0; i < matrix.length; i += 1) {
    for (let j = i + 1; j < matrix[i].length; j += 1) {
      const raw = matrix[i][j];
      if (raw === "-") continue;
      const score = Number(raw);
      if (Number.isNaN(score)) continue;
      pairs.push({
        aIndex: i,
        bIndex: j,
        aLabel: matrixLabels[i],
        bLabel: matrixLabels[j],
        score,
      });
    }
  }
  return pairs;
}

export default async function V1TerminalMatrixVariants() {
  const data = await getOverviewData();
  const pairs = buildPairs(data.matrix);

  return (
    <main className="min-h-[calc(100vh-49px-41px)] bg-[#0a0f18] font-mono text-[13px] text-[#cdd6e1]">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-[#7a8697]">
              V1 Terminal · pairwise_divergence explorations
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
          <VariantSection variant={VARIANTS[0]}>
            <ChordDiagram countries={data.countries} pairs={pairs} />
          </VariantSection>

          <VariantSection variant={VARIANTS[1]}>
            <RankedPairs countries={data.countries} pairs={pairs} />
          </VariantSection>

          <VariantSection variant={VARIANTS[2]}>
            <UpperTriangle countries={data.countries} matrix={data.matrix} />
          </VariantSection>

          <VariantSection variant={VARIANTS[3]}>
            <SmallMultiples countries={data.countries} matrix={data.matrix} />
          </VariantSection>

          <VariantSection variant={VARIANTS[4]}>
            <Constellation countries={data.countries} matrix={data.matrix} />
          </VariantSection>
        </div>

        <footer className="mt-12 border-t border-white/10 pt-4 text-[10px] uppercase tracking-wider text-[#3f4857]">
          Tell me which direction to push · or which elements to mix
        </footer>
      </div>
    </main>
  );
}

function VariantSection({
  variant,
  children,
}: {
  variant: (typeof VARIANTS)[number];
  children: React.ReactNode;
}) {
  return (
    <section id={variant.id} className="scroll-mt-6">
      <div className="mb-4 flex items-baseline justify-between border-b border-white/5 pb-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-[#e6edf5]">
            {variant.label}
          </p>
          <p className="mt-0.5 text-[11px] text-[#7a8697]">{variant.note}</p>
        </div>
        <p className="text-[10px] uppercase tracking-wider text-[#3f4857]">
          variant {variant.id.toUpperCase()}
        </p>
      </div>
      <div className="rounded-sm border border-white/10 bg-[#0f1623] p-4">
        {children}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* A — Chord / radial pentagon                                         */
/* ------------------------------------------------------------------ */

function ChordDiagram({
  countries,
  pairs,
}: {
  countries: CountrySnapshot[];
  pairs: Pair[];
}) {
  const cx = 320;
  const cy = 280;
  const r = 180;
  const n = countries.length;

  const positions = countries.map((country, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n; // start at top, clockwise
    return {
      country,
      index: i,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      angle,
    };
  });

  return (
    <div>
      <svg
        viewBox="0 0 640 560"
        className="mx-auto block w-full max-w-[700px]"
      >
        <defs>
          {positions.map((p) => (
            <clipPath
              key={`clip-${p.country.slug}`}
              id={`clip-${p.country.slug}`}
            >
              <circle cx={p.x} cy={p.y} r={26} />
            </clipPath>
          ))}
        </defs>

        {/* Edges — drawn before nodes */}
        {pairs.map((pair) => {
          const a = positions[pair.aIndex];
          const b = positions[pair.bIndex];
          const color = scoreHexDark(pair.score);
          const strokeWidth = 1.5 + (pair.score / 100) * 6;
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const labelHalf = 16;
          return (
            <g key={`${pair.aIndex}-${pair.bIndex}`}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={color}
                strokeWidth={strokeWidth}
                strokeOpacity={0.55}
                strokeLinecap="round"
              />
              <rect
                x={mid.x - labelHalf}
                y={mid.y - 12}
                width={labelHalf * 2}
                height={24}
                rx={3}
                fill="#0a0f18"
                stroke={color}
                strokeOpacity={0.55}
              />
              <text
                x={mid.x}
                y={mid.y + 5}
                textAnchor="middle"
                fontSize={13}
                fontFamily="monospace"
                fontWeight={600}
                fill={color}
              >
                {pair.score}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {positions.map((p) => (
          <g key={p.country.slug}>
            <circle
              cx={p.x}
              cy={p.y}
              r={28}
              fill="#0f1623"
              stroke="#1a2333"
              strokeWidth={3}
            />
            <image
              href={p.country.flagUrl}
              x={p.x - 26}
              y={p.y - 18}
              width={52}
              height={36}
              clipPath={`url(#clip-${p.country.slug})`}
              preserveAspectRatio="xMidYMid slice"
            />
            <circle
              cx={p.x}
              cy={p.y}
              r={26}
              fill="none"
              stroke="#cdd6e1"
              strokeOpacity={0.5}
              strokeWidth={1.5}
            />
            {/* Label below node */}
            <text
              x={p.x}
              y={p.y + 50}
              textAnchor="middle"
              fontSize={11}
              fontFamily="monospace"
              fontWeight={600}
              letterSpacing={1}
              fill="#e6edf5"
            >
              {p.country.shortName}
            </text>
            <text
              x={p.x}
              y={p.y + 64}
              textAnchor="middle"
              fontSize={9}
              fontFamily="monospace"
              fill="#7a8697"
            >
              {p.country.name.toUpperCase()}
            </text>
          </g>
        ))}
      </svg>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[10px] uppercase tracking-wider text-[#7a8697]">
        <span className="flex items-center gap-2">
          <span className="inline-block h-[2px] w-5 bg-[#29d391]" />
          aligned
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-[4px] w-5 bg-[#f5a623]" />
          noticeably different
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-[6px] w-5 bg-[#ff6b6b]" />
          outlier pair
        </span>
        <span className="text-[#3f4857]">line thickness ∝ score</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* B — Ranked pair list                                                */
/* ------------------------------------------------------------------ */

function RankedPairs({
  countries,
  pairs,
}: {
  countries: CountrySnapshot[];
  pairs: Pair[];
}) {
  const sorted = [...pairs].sort((a, b) => b.score - a.score);

  return (
    <div>
      <div className="grid grid-cols-[28px_minmax(0,1.15fr)_72px_minmax(120px,1fr)_140px] gap-3 border-b border-white/10 pb-2 text-[9px] uppercase tracking-[0.12em] text-[#5d6675]">
        <span>#</span>
        <span>pair</span>
        <span className="text-right">score</span>
        <span>relative</span>
        <span className="text-right">band</span>
      </div>
      <ol>
        {sorted.map((pair, index) => {
          const countryA = countries[pair.aIndex];
          const countryB = countries[pair.bIndex];
          const color = scoreHexDark(pair.score);
          return (
            <li
              key={`${pair.aIndex}-${pair.bIndex}`}
              className="grid grid-cols-[28px_minmax(0,1.15fr)_72px_minmax(120px,1fr)_140px] items-center gap-3 border-b border-white/5 py-2.5 last:border-b-0"
            >
              <span className="text-[10px] tabular-nums text-[#5d6675]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="flex min-w-0 items-center gap-2">
                <Image
                  src={countryA.flagUrl}
                  alt=""
                  width={24}
                  height={18}
                  className="h-[18px] w-[24px] rounded-[2px] border border-white/10 object-cover"
                  unoptimized
                />
                <span className="text-[11px] font-semibold text-[#e6edf5]">
                  {countryA.shortName}
                </span>
                <span className="text-[#3f4857]">↔</span>
                <Image
                  src={countryB.flagUrl}
                  alt=""
                  width={24}
                  height={18}
                  className="h-[18px] w-[24px] rounded-[2px] border border-white/10 object-cover"
                  unoptimized
                />
                <span className="text-[11px] font-semibold text-[#e6edf5]">
                  {countryB.shortName}
                </span>
                <span className="ml-2 truncate text-[10px] text-[#7a8697]">
                  {countryA.name} · {countryB.name}
                </span>
              </div>
              <span
                className="text-right text-[22px] font-semibold leading-none tabular-nums"
                style={{ color }}
              >
                {pair.score}
              </span>
              <div className="h-[4px] rounded-[1px] bg-white/5">
                <div
                  className="h-[4px] rounded-[1px]"
                  style={{ width: `${pair.score}%`, background: color }}
                />
              </div>
              <span
                className="text-right text-[10px] uppercase tracking-wider"
                style={{ color }}
              >
                {bandLabel(pair.score)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* C — Upper triangle matrix                                           */
/* ------------------------------------------------------------------ */

function UpperTriangle({
  countries,
  matrix,
}: {
  countries: CountrySnapshot[];
  matrix: string[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="mx-auto border-separate border-spacing-[4px]">
        <thead>
          <tr>
            <th />
            {matrixLabels.slice(1).map((label, i) => {
              const country = countries[i + 1];
              return (
                <th key={label} className="pb-2 text-center align-bottom">
                  <div className="flex flex-col items-center gap-1">
                    <Image
                      src={country.flagUrl}
                      alt=""
                      width={36}
                      height={27}
                      className="h-[27px] w-[36px] rounded-[2px] border border-white/10 object-cover"
                      unoptimized
                    />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#e6edf5]">
                      {label}
                    </span>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {matrix.slice(0, -1).map((row, rowIndex) => (
            <tr key={matrixLabels[rowIndex]}>
              <th className="pr-3 text-right align-middle">
                <div className="flex items-center justify-end gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#e6edf5]">
                    {matrixLabels[rowIndex]}
                  </span>
                  <Image
                    src={countries[rowIndex].flagUrl}
                    alt=""
                    width={36}
                    height={27}
                    className="h-[27px] w-[36px] rounded-[2px] border border-white/10 object-cover"
                    unoptimized
                  />
                </div>
              </th>
              {Array.from({ length: rowIndex }).map((_, padIndex) => (
                <td key={`pad-${padIndex}`} className="h-[88px] w-[88px]" />
              ))}
              {row.slice(rowIndex + 1).map((value, cellIndex) => {
                const score = Number(value);
                const color = scoreHexDark(score);
                const actualColIndex = rowIndex + cellIndex + 1;
                return (
                  <td key={`${rowIndex}-${actualColIndex}`}>
                    <div
                      className="flex h-[88px] w-[88px] flex-col items-center justify-center rounded-[2px]"
                      style={{
                        background: `${color}20`,
                        border: `1px solid ${color}55`,
                      }}
                    >
                      <span
                        className="text-[28px] font-semibold leading-none tabular-nums"
                        style={{ color }}
                      >
                        {value}
                      </span>
                      <span
                        className="mt-1 text-[9px] uppercase tracking-wider"
                        style={{ color }}
                      >
                        {bandLabel(score)}
                      </span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* D — Small multiples (per-country)                                   */
/* ------------------------------------------------------------------ */

function SmallMultiples({
  countries,
  matrix,
}: {
  countries: CountrySnapshot[];
  matrix: string[][];
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {countries.map((country, rowIndex) => {
        const distances = countries
          .map((other, colIndex) => {
            if (rowIndex === colIndex) return null;
            const raw = matrix[rowIndex][colIndex];
            if (raw === "-") return null;
            return { other, score: Number(raw) };
          })
          .filter(
            (entry): entry is { other: CountrySnapshot; score: number } =>
              entry !== null,
          )
          .sort((a, b) => b.score - a.score);

        return (
          <article
            key={country.slug}
            className="flex flex-col gap-3 rounded-sm border border-white/10 bg-[#0a0f18] px-3 py-3"
          >
            <div className="flex items-center gap-2">
              <Image
                src={country.flagUrl}
                alt=""
                width={32}
                height={24}
                className="h-[24px] w-[32px] rounded-[2px] border border-white/10 object-cover"
                unoptimized
              />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.1em] text-[#7a8697]">
                  {country.shortName}
                </p>
                <p className="truncate text-[12px] text-[#e6edf5]">
                  {country.name}
                </p>
              </div>
            </div>
            <p className="text-[9px] uppercase tracking-wider text-[#5d6675]">
              distance to each other jurisdiction
            </p>
            <ul className="flex flex-col gap-2">
              {distances.map((entry) => {
                const color = scoreHexDark(entry.score);
                return (
                  <li
                    key={entry.other.slug}
                    className="grid grid-cols-[20px_28px_minmax(0,1fr)_28px] items-center gap-2"
                  >
                    <Image
                      src={entry.other.flagUrl}
                      alt=""
                      width={18}
                      height={13}
                      className="h-[13px] w-[18px] rounded-[1px] border border-white/10 object-cover"
                      unoptimized
                    />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#cdd6e1]">
                      {entry.other.shortName}
                    </span>
                    <div className="h-[6px] rounded-[1px] bg-white/5">
                      <div
                        className="h-[6px] rounded-[1px]"
                        style={{
                          width: `${entry.score}%`,
                          background: color,
                        }}
                      />
                    </div>
                    <span
                      className="text-right text-[11px] font-semibold tabular-nums"
                      style={{ color }}
                    >
                      {entry.score}
                    </span>
                  </li>
                );
              })}
            </ul>
          </article>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* E — Constellation (2D MDS projection)                               */
/* ------------------------------------------------------------------ */

type XY = { x: number; y: number };

function computeMDSPositions(
  matrix: string[][],
  width: number,
  height: number,
): XY[] {
  const n = matrix.length;
  const D: number[][] = matrix.map((row, i) =>
    row.map((cell, j) => {
      if (i === j) return 0;
      if (cell === "-") return 0;
      return Number(cell);
    }),
  );

  // Deterministic initial layout — place on a unit circle
  const positions: XY[] = Array.from({ length: n }, (_, i) => ({
    x: Math.cos((i * 2 * Math.PI) / n - Math.PI / 2),
    y: Math.sin((i * 2 * Math.PI) / n - Math.PI / 2),
  }));

  // Iterative stress minimization. Targets in pixel units.
  const targetScale = 3.0;
  const iterations = 400;
  const lr = 0.018;
  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const dx = positions[j].x - positions[i].x;
        const dy = positions[j].y - positions[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1e-6) continue;
        const target = D[i][j] * targetScale;
        const diff = ((dist - target) / dist) * lr;
        const moveX = diff * dx;
        const moveY = diff * dy;
        positions[i].x += moveX;
        positions[i].y += moveY;
        positions[j].x -= moveX;
        positions[j].y -= moveY;
      }
    }
  }

  // Center
  const mx = positions.reduce((sum, p) => sum + p.x, 0) / n;
  const my = positions.reduce((sum, p) => sum + p.y, 0) / n;
  const centered = positions.map((p) => ({ x: p.x - mx, y: p.y - my }));

  // Scale to fit viewBox with padding
  const padding = 70;
  const maxExtent = Math.max(
    ...centered.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)]),
    1e-6,
  );
  const scale =
    Math.min(width - padding * 2, height - padding * 2) / (2 * maxExtent);
  return centered.map((p) => ({
    x: p.x * scale + width / 2,
    y: p.y * scale + height / 2,
  }));
}

function Constellation({
  countries,
  matrix,
}: {
  countries: CountrySnapshot[];
  matrix: string[][];
}) {
  const width = 640;
  const height = 440;
  const positions = computeMDSPositions(matrix, width, height);

  // Build pair list for drawing faint connection lines
  const pairs = buildPairs(matrix);

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mx-auto block w-full max-w-[760px]"
      >
        <defs>
          {countries.map((country, i) => (
            <clipPath
              key={`cclip-${country.slug}`}
              id={`cclip-${country.slug}`}
            >
              <circle cx={positions[i].x} cy={positions[i].y} r={26} />
            </clipPath>
          ))}
        </defs>

        {/* Dotted gridlines — faint geography cue */}
        <g opacity={0.15}>
          {Array.from({ length: 10 }).map((_, k) => (
            <line
              key={`v-${k}`}
              x1={(k / 9) * width}
              y1={0}
              x2={(k / 9) * width}
              y2={height}
              stroke="#7a8697"
              strokeDasharray="2 4"
              strokeWidth={0.5}
            />
          ))}
          {Array.from({ length: 7 }).map((_, k) => (
            <line
              key={`h-${k}`}
              x1={0}
              y1={(k / 6) * height}
              x2={width}
              y2={(k / 6) * height}
              stroke="#7a8697"
              strokeDasharray="2 4"
              strokeWidth={0.5}
            />
          ))}
        </g>

        {/* Faint edges for context */}
        {pairs.map((pair) => {
          const a = positions[pair.aIndex];
          const b = positions[pair.bIndex];
          const color = scoreHexDark(pair.score);
          return (
            <line
              key={`${pair.aIndex}-${pair.bIndex}-line`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={color}
              strokeWidth={1}
              strokeOpacity={0.25}
              strokeDasharray="3 3"
            />
          );
        })}

        {/* Nodes */}
        {countries.map((country, i) => {
          const p = positions[i];
          return (
            <g key={country.slug}>
              <circle
                cx={p.x}
                cy={p.y}
                r={30}
                fill="#0a0f18"
                stroke="#1a2333"
                strokeWidth={3}
              />
              <image
                href={country.flagUrl}
                x={p.x - 26}
                y={p.y - 18}
                width={52}
                height={36}
                clipPath={`url(#cclip-${country.slug})`}
                preserveAspectRatio="xMidYMid slice"
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={26}
                fill="none"
                stroke="#cdd6e1"
                strokeOpacity={0.5}
                strokeWidth={1.5}
              />
              <text
                x={p.x}
                y={p.y + 48}
                textAnchor="middle"
                fontSize={12}
                fontFamily="monospace"
                fontWeight={700}
                fill="#e6edf5"
                letterSpacing={1.5}
              >
                {country.shortName}
              </text>
              <text
                x={p.x}
                y={p.y + 62}
                textAnchor="middle"
                fontSize={9}
                fontFamily="monospace"
                fill="#7a8697"
              >
                {country.name.toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[10px] uppercase tracking-wider text-[#7a8697]">
        <span>2D projection · visual distance ≈ divergence</span>
        <span className="text-[#3f4857]">
          nearby nodes share patterns · far nodes diverge
        </span>
      </div>
    </div>
  );
}
