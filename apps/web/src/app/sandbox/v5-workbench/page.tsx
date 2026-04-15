import Image from "next/image";
import Link from "next/link";

import { getOverviewData } from "@/lib/overview-data";
import {
  frameLabels,
  matrixLabels,
  type CountrySnapshot,
  type FrameLabel,
  type QueueDocument,
} from "@/lib/seed-data";
import { frameHue, scoreHexLight } from "../_shared";

export const dynamic = "force-dynamic";

type ReviewState = "approved" | "review" | "draft";

type WorkbenchDoc = {
  id: string;
  title: string;
  jurisdiction: string;
  jurisdictionSlug: string;
  documentType: string;
  reviewState: ReviewState;
  dominantFrame: FrameLabel;
  updatedAt: string;
  requirements: string[];
  rationale: string;
  confidence: number;
  composite: number;
  policy: number;
  framing: number;
};

function buildList(
  data: Awaited<ReturnType<typeof getOverviewData>>,
): WorkbenchDoc[] {
  const list: WorkbenchDoc[] = [];
  // Queue items first (recent)
  data.queue.forEach((doc, index) => {
    const country = data.countries.find((c) => c.name === doc.jurisdiction);
    list.push({
      id: `q-${index}`,
      title: doc.title,
      jurisdiction: doc.jurisdiction,
      jurisdictionSlug: country?.slug ?? "",
      documentType: doc.documentType,
      reviewState: doc.reviewState,
      dominantFrame: doc.dominantFrame,
      updatedAt: doc.updatedAt,
      requirements: country?.requirements ?? [],
      rationale: country?.rationale ?? "",
      confidence: 62 + ((index * 7) % 30),
      composite: country?.compositeDivergence ?? 0,
      policy: country?.policyDivergence ?? 0,
      framing: country?.framingDivergence ?? 0,
    });
  });
  // Synthesize one "dossier" per country
  data.countries.forEach((country, index) => {
    list.push({
      id: `d-${country.slug}`,
      title: `${country.name} · jurisdiction dossier`,
      jurisdiction: country.name,
      jurisdictionSlug: country.slug,
      documentType: "Country profile",
      reviewState: "approved",
      dominantFrame: country.dominantFrame,
      updatedAt: country.lastUpdated,
      requirements: country.requirements,
      rationale: country.rationale,
      confidence: 85 + (index % 10),
      composite: country.compositeDivergence,
      policy: country.policyDivergence,
      framing: country.framingDivergence,
    });
  });
  return list;
}

export default async function WorkbenchVariation({
  searchParams,
}: {
  searchParams: Promise<{
    j?: string;
    s?: string;
    f?: string;
    doc?: string;
  }>;
}) {
  const data = await getOverviewData();
  const { j, s, f, doc: selectedId } = await searchParams;

  const fullList = buildList(data);
  const filtered = fullList.filter((item) => {
    if (j && item.jurisdictionSlug !== j) return false;
    if (s && item.reviewState !== s) return false;
    if (f && item.dominantFrame !== f) return false;
    return true;
  });

  const selected =
    fullList.find((item) => item.id === selectedId) ?? filtered[0] ?? fullList[0];

  // jurisdiction counts for facets
  const byJurisdiction = new Map<string, number>();
  const byState = new Map<ReviewState, number>();
  const byFrame = new Map<FrameLabel, number>();
  for (const item of fullList) {
    byJurisdiction.set(
      item.jurisdictionSlug,
      (byJurisdiction.get(item.jurisdictionSlug) ?? 0) + 1,
    );
    byState.set(item.reviewState, (byState.get(item.reviewState) ?? 0) + 1);
    byFrame.set(
      item.dominantFrame,
      (byFrame.get(item.dominantFrame) ?? 0) + 1,
    );
  }

  const current = { j, s, f, doc: selectedId };

  return (
    <main className="h-[calc(100vh-49px-41px)] bg-[#f4f5f5] text-[#0f172a]">
      <div className="mx-auto flex h-full max-w-[1800px] flex-col">
        {/* Workbench top bar */}
        <header className="flex items-center justify-between border-b border-[#0f172a]/10 bg-white px-4 py-2 text-xs">
          <div className="flex items-center gap-4">
            <span className="font-semibold uppercase tracking-[0.12em] text-[#0f172a]">
              Workbench
            </span>
            <span className="text-[#64748b]">
              {data.snapshotDate} · {data.summary.publishedSources} sources ·{" "}
              {data.summary.reviewQueue} open
            </span>
          </div>
          <div className="flex items-center gap-1 text-[#64748b]">
            <kbd className="rounded border border-[#0f172a]/10 bg-[#f4f5f5] px-1.5 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>
            <span>search</span>
            <span className="px-1">·</span>
            <kbd className="rounded border border-[#0f172a]/10 bg-[#f4f5f5] px-1.5 py-0.5 font-mono text-[10px]">
              J / K
            </kbd>
            <span>next / prev</span>
          </div>
        </header>

        {/* Three panes */}
        <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,420px)_minmax(0,1fr)]">
          {/* Left rail — facets */}
          <aside className="flex flex-col overflow-y-auto border-r border-[#0f172a]/10 bg-white">
            <FacetGroup title="Jurisdiction">
              <FacetRow
                label="All"
                count={fullList.length}
                active={!j}
                href={buildHref(current, { j: undefined })}
              />
              {data.countries.map((country) => (
                <FacetRow
                  key={country.slug}
                  icon={
                    <Image
                      src={country.flagUrl}
                      alt=""
                      width={14}
                      height={10}
                      className="rounded-[1px] object-cover"
                      unoptimized
                    />
                  }
                  label={country.name}
                  count={byJurisdiction.get(country.slug) ?? 0}
                  active={j === country.slug}
                  href={buildHref(current, {
                    j: j === country.slug ? undefined : country.slug,
                  })}
                />
              ))}
            </FacetGroup>

            <FacetGroup title="Review state">
              {(["approved", "review", "draft"] as ReviewState[]).map(
                (state) => (
                  <FacetRow
                    key={state}
                    label={state}
                    count={byState.get(state) ?? 0}
                    active={s === state}
                    icon={
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          background:
                            state === "approved"
                              ? "#16a34a"
                              : state === "review"
                                ? "#d97706"
                                : "#94a3b8",
                        }}
                      />
                    }
                    href={buildHref(current, {
                      s: s === state ? undefined : state,
                    })}
                  />
                ),
              )}
            </FacetGroup>

            <FacetGroup title="Dominant frame">
              {(Object.keys(frameLabels) as FrameLabel[]).map((frame) => (
                <FacetRow
                  key={frame}
                  label={frameLabels[frame]}
                  count={byFrame.get(frame) ?? 0}
                  active={f === frame}
                  icon={
                    <span
                      className="h-2 w-2 rounded-sm"
                      style={{ background: frameHue[frame] }}
                    />
                  }
                  href={buildHref(current, {
                    f: f === frame ? undefined : frame,
                  })}
                />
              ))}
            </FacetGroup>

            <div className="mt-auto border-t border-[#0f172a]/10 px-3 py-2 text-[10px] uppercase tracking-wider text-[#94a3b8]">
              {filtered.length} / {fullList.length} shown
            </div>
          </aside>

          {/* Middle pane — document list */}
          <section className="flex flex-col overflow-y-auto border-r border-[#0f172a]/10 bg-white">
            <div className="flex items-center justify-between border-b border-[#0f172a]/10 px-3 py-2 text-[11px] uppercase tracking-wider text-[#64748b]">
              <span>{filtered.length} documents</span>
              <span>updated ↓</span>
            </div>
            <ol className="divide-y divide-[#0f172a]/10">
              {filtered.map((item) => {
                const isSelected = item.id === selected?.id;
                return (
                  <li key={item.id}>
                    <Link
                      href={buildHref(current, { doc: item.id })}
                      scroll={false}
                      className={`block px-3 py-3 transition ${
                        isSelected
                          ? "border-l-2 border-[#0f172a] bg-[#f4f5f5]"
                          : "border-l-2 border-transparent hover:bg-[#f8f8f8]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-[#64748b]">
                        <span>{item.jurisdiction}</span>
                        <WbStatePill state={item.reviewState} />
                      </div>
                      <p className="mt-1.5 text-[13px] font-medium leading-snug text-[#0f172a]">
                        {item.title}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-[#64748b]">
                        <span>{item.documentType}</span>
                        <span
                          className="font-medium"
                          style={{ color: frameHue[item.dominantFrame] }}
                        >
                          {frameLabels[item.dominantFrame]}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
              {filtered.length === 0 ? (
                <li className="px-3 py-8 text-center text-xs text-[#94a3b8]">
                  No documents match the current filters.
                </li>
              ) : null}
            </ol>
          </section>

          {/* Right pane — detail or default overview */}
          <section className="overflow-y-auto bg-[#f4f5f5]">
            {selected ? (
              <DetailPane doc={selected} />
            ) : (
              <OverviewFallback data={data} />
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function buildHref(
  current: { j?: string; s?: string; f?: string; doc?: string },
  patch: Partial<typeof current>,
) {
  const params = new URLSearchParams();
  const next = { ...current, ...patch };
  if (next.j) params.set("j", next.j);
  if (next.s) params.set("s", next.s);
  if (next.f) params.set("f", next.f);
  if (next.doc) params.set("doc", next.doc);
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}

function FacetGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[#0f172a]/10 py-2">
      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">
        {title}
      </p>
      <ul>{children}</ul>
    </div>
  );
}

function FacetRow({
  label,
  count,
  active,
  href,
  icon,
}: {
  label: string;
  count: number;
  active?: boolean;
  href: string;
  icon?: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        className={`flex items-center justify-between gap-2 px-3 py-1.5 text-xs ${
          active
            ? "bg-[#0f172a] text-white"
            : "text-[#0f172a] hover:bg-[#f4f5f5]"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate capitalize">{label}</span>
        </span>
        <span
          className={`shrink-0 text-[10px] tabular-nums ${
            active ? "text-white/80" : "text-[#94a3b8]"
          }`}
        >
          {count}
        </span>
      </Link>
    </li>
  );
}

function DetailPane({ doc }: { doc: WorkbenchDoc }) {
  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#64748b]">
            {doc.jurisdiction} · {doc.documentType}
          </p>
          <h2 className="mt-1 text-[20px] font-semibold leading-snug text-[#0f172a]">
            {doc.title}
          </h2>
          <p className="mt-1 text-xs text-[#64748b]">
            Last updated {doc.updatedAt}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <WbStatePill state={doc.reviewState} large />
          <button
            type="button"
            className="rounded-md border border-[#0f172a]/15 bg-white px-3 py-1.5 text-xs font-medium text-[#0f172a] hover:bg-[#f8f8f8]"
          >
            Open in review
          </button>
        </div>
      </div>

      {/* Scorecards */}
      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <ScoreCard label="Composite" value={doc.composite} />
        <ScoreCard label="Policy" value={doc.policy} />
        <ScoreCard label="Framing" value={doc.framing} />
        <div className="rounded-lg border border-[#0f172a]/10 bg-white px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[#64748b]">
            Model confidence
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[#0f172a]">
            {doc.confidence}%
          </p>
          <div className="mt-2 h-1 rounded-full bg-[#e5e7eb]">
            <div
              className="h-1 rounded-full bg-[#0f172a]"
              style={{ width: `${doc.confidence}%` }}
            />
          </div>
        </div>
      </div>

      {/* Dominant frame */}
      <div className="mt-5 rounded-lg border border-[#0f172a]/10 bg-white px-4 py-4">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[#64748b]">
          Dominant frame
        </p>
        <p
          className="mt-1 text-base font-semibold"
          style={{ color: frameHue[doc.dominantFrame] }}
        >
          {frameLabels[doc.dominantFrame]}
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-[#334155]">
          {doc.rationale}
        </p>
      </div>

      {/* Requirements */}
      <div className="mt-5 rounded-lg border border-[#0f172a]/10 bg-white px-4 py-4">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[#64748b]">
          Extracted requirements
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {doc.requirements.map((req) => (
            <li
              key={req}
              className="rounded-md border border-[#0f172a]/10 bg-[#f8f8f8] px-2.5 py-1 text-xs font-medium text-[#0f172a]"
            >
              {req}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function OverviewFallback({
  data,
}: {
  data: Awaited<ReturnType<typeof getOverviewData>>;
}) {
  return (
    <div className="p-6">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#64748b]">
        No document selected · snapshot
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {data.countries.map((country: CountrySnapshot) => (
          <article
            key={country.slug}
            className="rounded-lg border border-[#0f172a]/10 bg-white px-3 py-3"
          >
            <div className="flex items-center gap-2">
              <Image
                src={country.flagUrl}
                alt=""
                width={24}
                height={18}
                className="rounded-[2px] border border-[#0f172a]/10 object-cover"
                unoptimized
              />
              <span className="text-sm font-medium">{country.shortName}</span>
              <span
                className="ml-auto text-sm font-semibold tabular-nums"
                style={{ color: scoreHexLight(country.compositeDivergence) }}
              >
                {country.compositeDivergence}
              </span>
            </div>
            <p
              className="mt-2 text-[10px] font-medium uppercase tracking-wider"
              style={{ color: frameHue[country.dominantFrame] }}
            >
              {frameLabels[country.dominantFrame]}
            </p>
          </article>
        ))}
      </div>

      {/* compact matrix */}
      <div className="mt-5 rounded-lg border border-[#0f172a]/10 bg-white p-4">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[#64748b]">
          Pairwise divergence
        </p>
        <table className="mt-3 w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th />
              {matrixLabels.map((label) => (
                <th
                  key={label}
                  className="pb-1 text-center font-medium uppercase text-[#64748b]"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.matrix.map((row, rowIndex) => (
              <tr key={matrixLabels[rowIndex]}>
                <th className="pr-2 text-left font-medium uppercase text-[#64748b]">
                  {matrixLabels[rowIndex]}
                </th>
                {row.map((value, cellIndex) => {
                  if (value === "-") {
                    return (
                      <td
                        key={`${rowIndex}-${cellIndex}`}
                        className="h-8 text-center text-[#94a3b8]"
                      >
                        ·
                      </td>
                    );
                  }
                  const score = Number(value);
                  return (
                    <td key={`${rowIndex}-${cellIndex}`} className="p-[2px]">
                      <div
                        className="flex h-8 items-center justify-center rounded font-semibold tabular-nums"
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
    </div>
  );
}

function ScoreCard({ label, value }: { label: string; value: number }) {
  const color = scoreHexLight(value);
  return (
    <div className="rounded-lg border border-[#0f172a]/10 bg-white px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-[#64748b]">
        {label}
      </p>
      <p
        className="mt-1 text-xl font-semibold tabular-nums"
        style={{ color }}
      >
        {value}
      </p>
      <div className="mt-2 h-1 rounded-full bg-[#e5e7eb]">
        <div
          className="h-1 rounded-full"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
    </div>
  );
}

function WbStatePill({
  state,
  large,
}: {
  state: "approved" | "review" | "draft";
  large?: boolean;
}) {
  const map = {
    approved: { bg: "#dcfce7", color: "#15803d" },
    review: { bg: "#fef3c7", color: "#b45309" },
    draft: { bg: "#e5e7eb", color: "#374151" },
  } as const;
  const s = map[state];
  const size = large ? "px-2.5 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span
      className={`rounded-full font-semibold uppercase tracking-wider ${size}`}
      style={{ background: s.bg, color: s.color }}
    >
      {state}
    </span>
  );
}
