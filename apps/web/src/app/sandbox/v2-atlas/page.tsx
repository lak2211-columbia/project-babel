import Image from "next/image";
import Link from "next/link";

import { getOverviewData } from "@/lib/overview-data";
import { frameLabels, matrixLabels, type CountrySnapshot } from "@/lib/seed-data";
import { frameHue, scoreHexLight } from "../_shared";

export const dynamic = "force-dynamic";

type Metric = "policy" | "framing" | "composite";

const METRIC_LABEL: Record<Metric, string> = {
  policy: "Policy",
  framing: "Framing",
  composite: "Composite",
};

const PIN_POSITIONS: Record<string, { left: string; top: string }> = {
  "united-states": { left: "18%", top: "42%" },
  "european-union": { left: "46%", top: "32%" },
  "south-korea": { left: "72%", top: "42%" },
  japan: { left: "82%", top: "46%" },
  china: { left: "68%", top: "52%" },
};

function metricValue(country: CountrySnapshot, metric: Metric) {
  if (metric === "policy") return country.policyDivergence;
  if (metric === "framing") return country.framingDivergence;
  return country.compositeDivergence;
}

export default async function AtlasVariation({
  searchParams,
}: {
  searchParams: Promise<{ metric?: string }>;
}) {
  const data = await getOverviewData();
  const { metric: raw } = await searchParams;
  const metric: Metric =
    raw === "policy" || raw === "framing" ? raw : "composite";

  return (
    <main className="min-h-[calc(100vh-49px-41px)] bg-[#f8f6f2]">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        {/* Header strip */}
        <header className="flex flex-col gap-3 border-b border-[#1c1f26]/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#6b7280]">
              AI Governance Observatory · Atlas
            </p>
            <h1 className="mt-1 text-[22px] font-semibold text-[#1c1f26]">
              Five jurisdictions, one snapshot · {data.snapshotDate}
            </h1>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-[#1c1f26]/10 bg-white p-1 text-xs">
            {(["policy", "framing", "composite"] as Metric[]).map((m) => {
              const active = m === metric;
              return (
                <Link
                  key={m}
                  href={`?metric=${m}`}
                  className={`rounded-full px-3 py-1.5 transition ${
                    active
                      ? "bg-[#1c1f26] text-white"
                      : "text-[#4b5563] hover:bg-[#eef2ef]"
                  }`}
                >
                  {METRIC_LABEL[m]} divergence
                </Link>
              );
            })}
          </div>
        </header>

        {/* Map panel */}
        <section className="relative mt-5 overflow-hidden rounded-xl border border-[#1c1f26]/10 bg-white">
          <div
            className="relative h-[440px] w-full"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, #1c1f26 0.8px, transparent 0.8px)",
              backgroundSize: "18px 18px",
              backgroundColor: "#fbfaf7",
            }}
          >
            {/* Subtle latitude guides */}
            <div className="pointer-events-none absolute inset-x-0 top-[30%] border-t border-dashed border-[#1c1f26]/10" />
            <div className="pointer-events-none absolute inset-x-0 top-[50%] border-t border-dashed border-[#1c1f26]/10" />
            <div className="pointer-events-none absolute inset-x-0 top-[70%] border-t border-dashed border-[#1c1f26]/10" />

            {data.countries.map((country) => {
              const pos = PIN_POSITIONS[country.slug];
              if (!pos) return null;
              const value = metricValue(country, metric);
              const size = 56 + Math.round((value / 100) * 56);
              const color = scoreHexLight(value);
              return (
                <div
                  key={country.slug}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: pos.left, top: pos.top }}
                >
                  <div
                    className="relative flex items-center justify-center rounded-full shadow-[0_8px_24px_rgba(28,31,38,0.12)] ring-2 ring-white"
                    style={{
                      width: size,
                      height: size,
                      background: color,
                    }}
                  >
                    <Image
                      src={country.flagUrl}
                      alt={`${country.name} flag`}
                      width={size - 14}
                      height={Math.round((size - 14) * 0.72)}
                      className="rounded-[3px] object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-center gap-2 whitespace-nowrap">
                    <span className="text-xs font-semibold text-[#1c1f26]">
                      {country.name}
                    </span>
                    <span
                      className="tabular-nums text-xs font-semibold"
                      style={{ color }}
                    >
                      {value}
                    </span>
                  </div>
                  <p
                    className="mt-0.5 text-center text-[10px] uppercase tracking-wider"
                    style={{ color: frameHue[country.dominantFrame] }}
                  >
                    {frameLabels[country.dominantFrame]}
                  </p>
                </div>
              );
            })}

            {/* Scale legend overlay */}
            <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-[#1c1f26]/10 bg-white/90 px-3 py-1.5 text-[10px] uppercase tracking-wider text-[#6b7280] backdrop-blur">
              <span>{METRIC_LABEL[metric]}</span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#1f9d73]" />
                ≤44
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#d7a623]" />
                45–64
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#d95b4d]" />
                ≥65
              </span>
            </div>
          </div>
        </section>

        {/* Three supporting panels */}
        <section className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.85fr_1fr]">
          {/* Compact matrix */}
          <div className="rounded-xl border border-[#1c1f26]/10 bg-white p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-[#6b7280]">
              Pairwise divergence
            </p>
            <table className="mt-3 w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th />
                  {matrixLabels.map((label) => (
                    <th
                      key={label}
                      className="pb-1 text-center text-[10px] font-medium uppercase text-[#6b7280]"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.matrix.map((row, rowIndex) => (
                  <tr key={matrixLabels[rowIndex]}>
                    <th className="pr-2 text-left text-[10px] font-medium uppercase text-[#6b7280]">
                      {matrixLabels[rowIndex]}
                    </th>
                    {row.map((value, cellIndex) => {
                      if (value === "-") {
                        return (
                          <td
                            key={`${rowIndex}-${cellIndex}`}
                            className="h-9 text-center text-[#9ca3af]"
                          >
                            ·
                          </td>
                        );
                      }
                      const score = Number(value);
                      return (
                        <td key={`${rowIndex}-${cellIndex}`} className="p-[2px]">
                          <div
                            className="flex h-9 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums"
                            style={{
                              background: `${scoreHexLight(score)}22`,
                              color: scoreHexLight(score),
                            }}
                          >
                            {value}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Widest gap callout */}
          <div className="rounded-xl border border-[#1c1f26]/10 bg-white p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-[#6b7280]">
              Widest gap
            </p>
            <WidestGap data={data} />
          </div>

          {/* Queue top 5 */}
          <div className="rounded-xl border border-[#1c1f26]/10 bg-white p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-[11px] uppercase tracking-[0.12em] text-[#6b7280]">
                Review queue
              </p>
              <span className="text-[10px] text-[#9ca3af]">
                {data.summary.reviewQueue} open
              </span>
            </div>
            <ul className="mt-3 space-y-2.5">
              {data.queue.slice(0, 5).map((doc) => (
                <li key={doc.title} className="flex items-start gap-3 text-xs">
                  <span
                    className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: frameHue[doc.dominantFrame] }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[#1c1f26]">
                      {doc.title}
                    </p>
                    <p className="mt-0.5 text-[#6b7280]">
                      {doc.jurisdiction} · {doc.documentType}
                    </p>
                  </div>
                  <AtlasStatePill state={doc.reviewState} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}

function WidestGap({
  data,
}: {
  data: Awaited<ReturnType<typeof getOverviewData>>;
}) {
  // parse hiddenFaultLine like "United States / European Union"
  const [leftName, rightName] = data.summary.hiddenFaultLine
    .split("/")
    .map((part) => part.trim());
  const left = data.countries.find((country) => country.name === leftName);
  const right = data.countries.find((country) => country.name === rightName);

  // also find actual numerical peak from the matrix
  let peak = 0;
  for (const row of data.matrix) {
    for (const value of row) {
      if (value === "-") continue;
      const score = Number(value);
      if (score > peak) peak = score;
    }
  }

  if (!left || !right) {
    return (
      <p className="mt-3 text-sm text-[#4b5563]">
        {data.summary.hiddenFaultLine}
      </p>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <CountryChip country={left} />
        <span
          className="mx-3 text-2xl font-semibold tabular-nums"
          style={{ color: scoreHexLight(peak) }}
        >
          {peak || "—"}
        </span>
        <CountryChip country={right} />
      </div>
      <p className="mt-3 text-xs text-[#4b5563]">
        {left.name} ({frameLabels[left.dominantFrame].toLowerCase()}) and{" "}
        {right.name} ({frameLabels[right.dominantFrame].toLowerCase()}) sit at
        the farthest composite distance in the current snapshot.
      </p>
    </div>
  );
}

function CountryChip({ country }: { country: CountrySnapshot }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <Image
        src={country.flagUrl}
        alt={`${country.name} flag`}
        width={40}
        height={30}
        className="rounded-[3px] border border-[#1c1f26]/10 object-cover"
        unoptimized
      />
      <span className="text-[10px] font-medium uppercase tracking-wider text-[#1c1f26]">
        {country.shortName}
      </span>
    </div>
  );
}

function AtlasStatePill({ state }: { state: "approved" | "review" | "draft" }) {
  const map = {
    approved: { bg: "#d9efe6", text: "#16614b", label: "approved" },
    review: { bg: "#f6e6bb", text: "#7a5710", label: "review" },
    draft: { bg: "#e2e5e1", text: "#44504a", label: "draft" },
  } as const;
  const s = map[state];
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider"
      style={{ background: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}
