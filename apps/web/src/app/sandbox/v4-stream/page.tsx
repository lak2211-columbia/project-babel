import Image from "next/image";

import { getOverviewData } from "@/lib/overview-data";
import { frameLabels, matrixLabels, type QueueDocument } from "@/lib/seed-data";
import { frameHue, scoreHexLight } from "../_shared";

export const dynamic = "force-dynamic";

type EventKind = "ingested" | "extracted" | "approved" | "escalated" | "shift";

type FeedEvent = {
  id: string;
  kind: EventKind;
  timestamp: string;
  jurisdiction: string;
  title: string;
  subtitle: string;
  frame?: QueueDocument["dominantFrame"];
  state?: QueueDocument["reviewState"];
};

export default async function StreamVariation() {
  const data = await getOverviewData();

  // Synthesize shifts: signed framing-minus-policy gap per jurisdiction
  const shifts = data.countries
    .map((country) => ({
      country,
      delta: country.framingDivergence - country.policyDivergence,
    }))
    .sort(
      (left, right) => Math.abs(right.delta) - Math.abs(left.delta),
    )
    .slice(0, 3);

  // Build feed events from the queue
  const events: FeedEvent[] = data.queue.map((doc, index) => {
    const kind: EventKind =
      doc.reviewState === "approved"
        ? "approved"
        : doc.reviewState === "review"
          ? index % 2 === 0
            ? "escalated"
            : "extracted"
          : "ingested";
    return {
      id: `${doc.title}-${index}`,
      kind,
      timestamp: doc.updatedAt,
      jurisdiction: doc.jurisdiction,
      title: doc.title,
      subtitle: doc.documentType,
      frame: doc.dominantFrame,
      state: doc.reviewState,
    };
  });

  // Insert synthetic shift events at the top
  for (const shift of shifts) {
    events.unshift({
      id: `shift-${shift.country.slug}`,
      kind: "shift",
      timestamp: shift.country.lastUpdated,
      jurisdiction: shift.country.name,
      title: `${frameLabels[shift.country.dominantFrame]} signal ${
        shift.delta >= 0 ? "strengthens" : "recedes"
      } by ${Math.abs(shift.delta)} points`,
      subtitle: "Framing minus policy divergence",
      frame: shift.country.dominantFrame,
    });
  }

  return (
    <main className="min-h-[calc(100vh-49px-41px)] bg-[#f6f7f6] text-[#111827]">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="flex flex-col gap-3 border-b border-[#111827]/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#6b7280]">
              AI Governance Observatory · Stream
            </p>
            <h1 className="mt-1 text-[22px] font-semibold">
              What&rsquo;s moving · {data.snapshotDate}
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#6b7280]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#16a34a]" />
              live
            </span>
            <span>·</span>
            <span>{data.summary.publishedSources} sources monitored</span>
          </div>
        </header>

        {/* Today's shifts pinned */}
        <section className="mt-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#6b7280]">
            Today&rsquo;s shifts
          </p>
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            {shifts.map((shift) => (
              <ShiftCallout
                key={shift.country.slug}
                country={shift.country}
                delta={shift.delta}
              />
            ))}
          </div>
        </section>

        {/* Two-col: feed + aggregates rail */}
        <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Feed */}
          <div>
            <div className="flex items-baseline justify-between border-b border-[#111827]/10 pb-3">
              <h2 className="text-[15px] font-semibold">Activity</h2>
              <div className="flex items-center gap-1 text-[11px] text-[#6b7280]">
                <FeedFilterChip label="All" active />
                <FeedFilterChip label="Extracted" />
                <FeedFilterChip label="Approved" />
                <FeedFilterChip label="Escalated" />
              </div>
            </div>
            <ol className="mt-3 flex flex-col divide-y divide-[#111827]/10 rounded-lg border border-[#111827]/10 bg-white">
              {events.map((event) => (
                <FeedRow key={event.id} event={event} />
              ))}
            </ol>
          </div>

          {/* Aggregates rail */}
          <aside className="flex flex-col gap-4">
            <div className="rounded-lg border border-[#111827]/10 bg-white p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#6b7280]">
                Snapshot at a glance
              </p>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                <Mini label="sources" value={data.summary.publishedSources} />
                <Mini label="reviewed" value={data.summary.reviewedOutputs} />
                <Mini
                  label="queue"
                  value={data.summary.reviewQueue}
                  accent="#d97706"
                />
              </div>
            </div>

            <div className="rounded-lg border border-[#111827]/10 bg-white p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#6b7280]">
                Composite by jurisdiction
              </p>
              <ul className="mt-3 space-y-2.5">
                {data.countries.map((country) => {
                  const delta =
                    country.framingDivergence - country.policyDivergence;
                  const color = scoreHexLight(country.compositeDivergence);
                  return (
                    <li
                      key={country.slug}
                      className="flex items-center gap-3 text-xs"
                    >
                      <Image
                        src={country.flagUrl}
                        alt={`${country.name} flag`}
                        width={24}
                        height={18}
                        className="rounded-[2px] border border-[#111827]/10 object-cover"
                        unoptimized
                      />
                      <span className="w-16 shrink-0 font-medium">
                        {country.shortName}
                      </span>
                      <div className="flex-1">
                        <div className="h-[5px] rounded-full bg-[#e5e7eb]">
                          <div
                            className="h-[5px] rounded-full"
                            style={{
                              width: `${country.compositeDivergence}%`,
                              background: color,
                            }}
                          />
                        </div>
                      </div>
                      <span
                        className="w-8 shrink-0 text-right font-semibold tabular-nums"
                        style={{ color }}
                      >
                        {country.compositeDivergence}
                      </span>
                      <span
                        className={`w-10 shrink-0 text-right text-[10px] tabular-nums ${
                          delta >= 0 ? "text-[#b45309]" : "text-[#15803d]"
                        }`}
                      >
                        {delta >= 0 ? "+" : ""}
                        {delta}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="rounded-lg border border-[#111827]/10 bg-white p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#6b7280]">
                Pairwise divergence
              </p>
              <table className="mt-3 w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    <th />
                    {matrixLabels.map((label) => (
                      <th
                        key={label}
                        className="pb-1 text-center font-medium uppercase text-[#6b7280]"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.matrix.map((row, rowIndex) => (
                    <tr key={matrixLabels[rowIndex]}>
                      <th className="pr-2 text-left font-medium uppercase text-[#6b7280]">
                        {matrixLabels[rowIndex]}
                      </th>
                      {row.map((value, cellIndex) => {
                        if (value === "-") {
                          return (
                            <td
                              key={`${rowIndex}-${cellIndex}`}
                              className="h-7 text-center text-[#9ca3af]"
                            >
                              ·
                            </td>
                          );
                        }
                        const score = Number(value);
                        return (
                          <td
                            key={`${rowIndex}-${cellIndex}`}
                            className="p-[2px]"
                          >
                            <div
                              className="flex h-7 items-center justify-center rounded-[4px] font-semibold tabular-nums"
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
          </aside>
        </section>
      </div>
    </main>
  );
}

function ShiftCallout({
  country,
  delta,
}: {
  country: Awaited<ReturnType<typeof getOverviewData>>["countries"][number];
  delta: number;
}) {
  const color = delta >= 0 ? "#b45309" : "#15803d";
  return (
    <article className="flex items-center gap-3 rounded-lg border border-[#111827]/10 bg-white px-4 py-3">
      <Image
        src={country.flagUrl}
        alt={`${country.name} flag`}
        width={36}
        height={27}
        className="rounded-[3px] border border-[#111827]/10 object-cover"
        unoptimized
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{country.name}</p>
        <p
          className="text-[11px] font-medium uppercase tracking-wider"
          style={{ color: frameHue[country.dominantFrame] }}
        >
          {frameLabels[country.dominantFrame]}
        </p>
      </div>
      <div className="text-right">
        <p
          className="text-2xl font-semibold leading-none tabular-nums"
          style={{ color }}
        >
          {delta >= 0 ? "+" : ""}
          {delta}
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-wider text-[#6b7280]">
          framing vs policy
        </p>
      </div>
    </article>
  );
}

function FeedRow({ event }: { event: FeedEvent }) {
  const kinds: Record<EventKind, { dot: string; label: string }> = {
    ingested: { dot: "#6b7280", label: "Ingested" },
    extracted: { dot: "#0284c7", label: "Extracted" },
    approved: { dot: "#16a34a", label: "Approved" },
    escalated: { dot: "#d97706", label: "Escalated" },
    shift: { dot: "#7c3aed", label: "Shift" },
  };
  const k = kinds[event.kind];
  return (
    <li className="grid grid-cols-[120px_120px_1fr_auto] items-start gap-4 px-4 py-3 text-[13px]">
      <span className="text-[11px] text-[#6b7280]">{event.timestamp}</span>
      <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: k.dot }}
        />
        <span style={{ color: k.dot }}>{k.label}</span>
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium text-[#111827]">{event.title}</p>
        <p className="mt-0.5 text-[11px] text-[#6b7280]">
          {event.jurisdiction} · {event.subtitle}
          {event.frame ? (
            <>
              {" "}
              ·{" "}
              <span style={{ color: frameHue[event.frame] }}>
                {frameLabels[event.frame]}
              </span>
            </>
          ) : null}
        </p>
      </div>
      {event.state ? <StreamStatePill state={event.state} /> : <span />}
    </li>
  );
}

function FeedFilterChip({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 ${
        active
          ? "border-[#111827] bg-[#111827] text-white"
          : "border-transparent bg-transparent text-[#6b7280]"
      }`}
    >
      {label}
    </span>
  );
}

function Mini({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div>
      <p
        className="text-xl font-semibold tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-wider text-[#6b7280]">
        {label}
      </p>
    </div>
  );
}

function StreamStatePill({
  state,
}: {
  state: "approved" | "review" | "draft";
}) {
  const map = {
    approved: { bg: "#dcfce7", color: "#15803d" },
    review: { bg: "#fef3c7", color: "#b45309" },
    draft: { bg: "#e5e7eb", color: "#374151" },
  } as const;
  const s = map[state];
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
      style={{ background: s.bg, color: s.color }}
    >
      {state}
    </span>
  );
}
