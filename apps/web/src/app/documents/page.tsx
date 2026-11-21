import type { Metadata } from "next";

import { TopNav } from "@/app/_components/top-nav";
import { getDocumentListItems } from "@/lib/document-data";
import { jurisdictionMeta, jurisdictionOrder } from "@/lib/jurisdictions";
import { isHeadlineEligible } from "@/lib/scoring";
import { formatLongDate } from "@/lib/sources-data";

import { DocumentsList } from "./_documents-list";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Source Corpus · Project Babel",
  description:
    "Browse, filter, search quotes, and export every official government AI governance document ingested across the US, EU, South Korea, Japan, and China.",
  alternates: { canonical: "/documents" },
};

export default async function DocumentsPage() {
  const documents = await getDocumentListItems();

  const jurisdictions = jurisdictionOrder.map((key) => ({
    slug: jurisdictionMeta[key].slug,
    shortName: jurisdictionMeta[key].shortName,
    name: jurisdictionMeta[key].name,
    flagUrl: jurisdictionMeta[key].flagUrl,
  }));

  const stateCounts = {
    analyzed: documents.filter((d) => d.analysisState === "analyzed").length,
    parsed: documents.filter((d) => d.analysisState === "parsed").length,
    headline: documents.filter(
      (d) =>
        d.analysisState === "analyzed" &&
        isHeadlineEligible({
          corpusRole: d.corpusRole,
          lifecycleStage: d.lifecycleStage,
        }),
    ).length,
    binding: documents.filter((d) => d.bindingStrength === "binding_law").length,
  };

  let latestDoc = documents[0];
  for (const doc of documents) {
    if (doc.dateSort > (latestDoc?.dateSort ?? 0)) latestDoc = doc;
  }
  const latestPubDate =
    latestDoc && latestDoc.dateSort > 0
      ? formatLongDate(latestDoc.dateSort, latestDoc.publicationDatePrecision)
      : "No publication date";

  return (
    <main className="min-h-screen bg-[#0a0f18] font-sans text-[14px] text-[#cdd6e1]">
      <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
        <TopNav active="documents" />

        <header className="border-y border-white/20 py-7 text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">
            PROJECT BABEL · SOURCE CORPUS
          </p>
          <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.01em] text-[#f1f5f9]">
            Official Governance Corpus
          </h1>
          <p className="mx-auto mt-2.5 max-w-[820px] text-[14px] leading-relaxed text-[#cbd5e1]">
            Every official government document ingested, parsed, and structured
            — filter by jurisdiction, corpus role, lifecycle stage, binding
            strength, safeguard requirement, or search across extracted verbatim
            quotes.
          </p>

          <div className="mx-auto mt-5 flex max-w-[1040px] flex-wrap items-center justify-center gap-x-5 gap-y-1.5 border-t border-white/10 pt-4 font-mono text-[11px] uppercase tracking-[0.1em] text-[#94a3b8]">
            <span>
              <span className="mr-1 text-[#f1f5f9] tabular-nums">
                {documents.length}
              </span>
              corpus total
            </span>
            <span aria-hidden className="text-[#475569]">
              ·
            </span>
            <span>
              <span className="mr-1 text-[#38bdf8] tabular-nums">
                {stateCounts.headline}
              </span>
              active primary
            </span>
            <span aria-hidden className="text-[#475569]">
              ·
            </span>
            <span>
              <span className="mr-1 text-[#67e8f9] tabular-nums">
                {stateCounts.binding}
              </span>
              binding laws
            </span>
            {stateCounts.parsed > 0 ? (
              <>
                <span aria-hidden className="text-[#475569]">
                  ·
                </span>
                <span>
                  <span className="mr-1 text-[#94a3b8] tabular-nums">
                    {stateCounts.parsed}
                  </span>
                  parsed only
                </span>
              </>
            ) : null}
            <span aria-hidden className="text-[#475569]">
              ·
            </span>
            <span>
              latest pub{" "}
              <span className="text-[#f1f5f9]">{latestPubDate}</span>
            </span>
          </div>
        </header>

        <section className="mt-4">
          <DocumentsList documents={documents} jurisdictions={jurisdictions} />
        </section>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
          <span>
            Project Babel · document corpus · latest publication {latestPubDate}
          </span>
          <span>Evidence-grounded observatory</span>
        </footer>
      </div>
    </main>
  );
}
