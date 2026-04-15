import Link from "next/link";

import { getDocumentListItems } from "@/lib/document-data";
import { getOverviewData } from "@/lib/overview-data";

import { DocumentsList } from "./_documents-list";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ j?: string; s?: string; f?: string; q?: string }>;
}) {
  const { j, s, f, q } = await searchParams;
  const [documents, overview] = await Promise.all([
    getDocumentListItems(),
    getOverviewData(),
  ]);

  const jurisdictions = overview.countries.map((country) => ({
    slug: country.slug,
    shortName: country.shortName,
    flagUrl: country.flagUrl,
  }));

  // Aggregate counts for the masthead summary
  const stateCounts = {
    analyzed: documents.filter((d) => d.analysisState === "analyzed").length,
    parsed: documents.filter((d) => d.analysisState === "parsed").length,
  };

  return (
    <main className="min-h-screen bg-[#0a0f18] font-mono text-[13px] text-[#cdd6e1]">
      <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
        {/* Minimal nav — sits on the axis of the centered masthead */}
        <nav className="mb-3 flex items-center justify-center gap-3 text-[10px] uppercase tracking-[0.14em] text-[#5d6675]">
          <Link
            href="/"
            className="transition-colors hover:text-[#e6edf5]"
          >
            overview
          </Link>
          <span aria-hidden className="text-[#3f4857]">
            ·
          </span>
          <Link
            href="/documents"
            aria-current="page"
            className="text-[#e6edf5]"
          >
            documents
          </Link>
        </nav>

        {/* Masthead — same rhythm as home but rephrased for the documents view */}
        <header className="border-y border-white/20 py-7 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7a8697]">
            PROJECT BABEL · DOCUMENTS
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-[0.01em] text-[#e6edf5]">
            Source corpus
          </h1>
          <p className="mx-auto mt-3 max-w-[720px] text-[13px] leading-snug text-[#cdd6e1]">
            Every official government document the observatory has ingested,
            parsed, and analyzed — filter by jurisdiction, analysis state, or
            framing.
          </p>
          <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-[#5d6675]">
            LLM-analyzed from official government sources
          </p>

          <div className="mx-auto mt-5 flex max-w-[960px] flex-wrap items-center justify-center gap-x-5 gap-y-1 border-t border-white/5 pt-4 text-[10px] uppercase tracking-[0.12em] text-[#5d6675]">
            <span>
              <span className="mr-1 text-[#cdd6e1] tabular-nums">
                {documents.length}
              </span>
              total
            </span>
            <span className="text-[#3f4857]">·</span>
            <span>
              <span className="mr-1 text-[#4dd0e1] tabular-nums">
                {stateCounts.analyzed}
              </span>
              analyzed
            </span>
            <span className="text-[#3f4857]">·</span>
            <span>
              <span className="mr-1 text-[#7a8697] tabular-nums">
                {stateCounts.parsed}
              </span>
              parsed
            </span>
          </div>
        </header>

        <section className="mt-4">
          <DocumentsList
            documents={documents}
            jurisdictions={jurisdictions}
            initialJurisdiction={j}
            initialState={s}
            initialFrame={f}
            initialQuery={q ?? ""}
          />
        </section>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[10px] uppercase tracking-wider text-[#3f4857]">
          <span>
            Project Babel · document corpus · snapshot{" "}
            {overview.snapshotDate}
          </span>
          <span>LLM-analyzed observatory</span>
        </footer>
      </div>
    </main>
  );
}
