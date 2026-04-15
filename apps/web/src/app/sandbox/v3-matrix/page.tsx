import Image from "next/image";

import { getOverviewData } from "@/lib/overview-data";
import { frameLabels, matrixLabels, type CountrySnapshot } from "@/lib/seed-data";
import { frameHue, scoreHexLight } from "../_shared";

export const dynamic = "force-dynamic";

export default async function MatrixVariation() {
  const data = await getOverviewData();
  const slugToLabel = Object.fromEntries(
    data.countries.map((country, index) => [matrixLabels[index], country.name]),
  );

  // find peak for narrative
  let peakValue = 0;
  let peakPair = ["", ""];
  for (let i = 0; i < data.matrix.length; i += 1) {
    for (let j = i + 1; j < data.matrix[i].length; j += 1) {
      const value = Number(data.matrix[i][j]);
      if (!Number.isNaN(value) && value > peakValue) {
        peakValue = value;
        peakPair = [matrixLabels[i], matrixLabels[j]];
      }
    }
  }

  return (
    <main className="min-h-[calc(100vh-49px-41px)] bg-[#faf9f5] text-[#0f172a]">
      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        {/* Masthead */}
        <header className="flex flex-col gap-3 border-b border-[#0f172a]/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#64748b]">
              AI Governance Observatory · Cross-jurisdiction study
            </p>
            <h1 className="mt-2 text-[28px] font-semibold leading-tight">
              How far apart the five jurisdictions actually sit
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-[#334155]">
              The matrix below scores each pair on combined policy structure and
              risk framing (60 / 40). The widest gap in the{" "}
              <span className="font-medium text-[#0f172a]">
                {data.snapshotDate}
              </span>{" "}
              snapshot runs between{" "}
              <span
                className="font-semibold"
                style={{ color: scoreHexLight(peakValue) }}
              >
                {slugToLabel[peakPair[0]]} and {slugToLabel[peakPair[1]]}
              </span>{" "}
              at {peakValue}.
            </p>
          </div>
          <dl className="flex gap-6 text-sm">
            <Stat label="Sources" value={data.summary.publishedSources} />
            <Stat label="Reviewed" value={data.summary.reviewedOutputs} />
            <Stat label="In queue" value={data.summary.reviewQueue} />
          </dl>
        </header>

        {/* Hero: matrix + right rail */}
        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <HeroMatrix data={data} />
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#64748b]">
              Per-jurisdiction read
            </p>
            {data.countries.map((country) => (
              <CountryCard key={country.slug} country={country} />
            ))}
          </div>
        </section>

        {/* Queue strip */}
        <section className="mt-10">
          <div className="flex items-baseline justify-between border-b border-[#0f172a]/10 pb-3">
            <h2 className="text-[18px] font-semibold">Latest in the review queue</h2>
            <p className="text-xs text-[#64748b]">
              {data.queue.length} most recent · newest first
            </p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            {data.queue.map((doc) => (
              <article
                key={doc.title}
                className="flex flex-col gap-3 rounded-lg border border-[#0f172a]/10 bg-white p-4"
              >
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-[#64748b]">
                  <span>{doc.jurisdiction}</span>
                  <QueueBadge state={doc.reviewState} />
                </div>
                <p className="flex-1 text-sm font-medium leading-snug text-[#0f172a]">
                  {doc.title}
                </p>
                <div className="flex items-center justify-between text-[11px] text-[#64748b]">
                  <span>{doc.documentType}</span>
                  <span
                    className="font-medium"
                    style={{ color: frameHue[doc.dominantFrame] }}
                  >
                    {frameLabels[doc.dominantFrame]}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function HeroMatrix({
  data,
}: {
  data: Awaited<ReturnType<typeof getOverviewData>>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#0f172a]/10 bg-white">
      <div className="flex items-center justify-between border-b border-[#0f172a]/10 bg-[#faf9f5] px-5 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#64748b]">
          Pairwise composite divergence
        </p>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[#64748b]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-[#1f9d73]" />
            aligned
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-[#d7a623]" />
            divergent
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-[#d95b4d]" />
            far
          </span>
        </div>
      </div>
      <div className="overflow-x-auto p-5">
        <table className="w-full border-separate border-spacing-[6px]">
          <thead>
            <tr>
              <th />
              {matrixLabels.map((label, index) => (
                <th key={label} className="pb-1 text-left">
                  <div className="flex items-center gap-2">
                    <Image
                      src={data.countries[index].flagUrl}
                      alt={`${data.countries[index].name} flag`}
                      width={28}
                      height={21}
                      className="h-[21px] w-[28px] rounded-[3px] border border-[#0f172a]/10 object-cover"
                      unoptimized
                    />
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#0f172a]">
                      {label}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.matrix.map((row, rowIndex) => (
              <tr key={matrixLabels[rowIndex]}>
                <th className="pr-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#0f172a]">
                      {matrixLabels[rowIndex]}
                    </span>
                    <Image
                      src={data.countries[rowIndex].flagUrl}
                      alt={`${data.countries[rowIndex].name} flag`}
                      width={28}
                      height={21}
                      className="h-[21px] w-[28px] rounded-[3px] border border-[#0f172a]/10 object-cover"
                      unoptimized
                    />
                  </div>
                </th>
                {row.map((value, cellIndex) => {
                  if (value === "-") {
                    return (
                      <td
                        key={`${rowIndex}-${cellIndex}`}
                        className="h-[88px] w-[88px] rounded-lg bg-[#f1f3ee] text-center align-middle text-[11px] uppercase tracking-wider text-[#94a3b8]"
                      >
                        self
                      </td>
                    );
                  }
                  const score = Number(value);
                  return (
                    <td
                      key={`${rowIndex}-${cellIndex}`}
                      className="h-[88px] w-[88px] rounded-lg text-center align-middle"
                      style={{
                        background: `${scoreHexLight(score)}20`,
                        border: `1px solid ${scoreHexLight(score)}55`,
                      }}
                      title={`${data.countries[rowIndex].name} vs ${data.countries[cellIndex].name}: ${value}`}
                    >
                      <div
                        className="text-[26px] font-semibold tabular-nums leading-none"
                        style={{ color: scoreHexLight(score) }}
                      >
                        {value}
                      </div>
                      <div className="mt-1 text-[9px] uppercase tracking-wider text-[#64748b]">
                        {score >= 65 ? "far" : score >= 45 ? "divergent" : "aligned"}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CountryCard({ country }: { country: CountrySnapshot }) {
  const color = scoreHexLight(country.compositeDivergence);
  return (
    <article className="rounded-lg border border-[#0f172a]/10 bg-white px-4 py-4">
      <div className="flex items-center gap-3">
        <div
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
          style={{
            background: `${color}20`,
            border: `2px solid ${color}`,
          }}
        >
          <span
            className="text-sm font-semibold tabular-nums"
            style={{ color }}
          >
            {country.compositeDivergence}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#0f172a]">{country.name}</p>
          <p
            className="text-[11px] font-medium uppercase tracking-wider"
            style={{ color: frameHue[country.dominantFrame] }}
          >
            {frameLabels[country.dominantFrame]}
          </p>
        </div>
        <Image
          src={country.flagUrl}
          alt={`${country.name} flag`}
          width={32}
          height={24}
          className="rounded-[3px] border border-[#0f172a]/10 object-cover"
          unoptimized
        />
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-[#475569]">
        {country.rationale}
      </p>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#64748b]">
        {label}
      </dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-[#0f172a]">
        {value}
      </dd>
    </div>
  );
}

function QueueBadge({ state }: { state: "approved" | "review" | "draft" }) {
  const map = {
    approved: { color: "#16614b", bg: "#d9efe6" },
    review: { color: "#7a5710", bg: "#f6e6bb" },
    draft: { color: "#44504a", bg: "#e2e5e1" },
  } as const;
  const s = map[state];
  return (
    <span
      className="rounded-full px-2 py-0.5 font-semibold"
      style={{ color: s.color, background: s.bg }}
    >
      {state}
    </span>
  );
}
