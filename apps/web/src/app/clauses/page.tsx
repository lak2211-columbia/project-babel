import type { Metadata } from "next";

import { getClausesDataset } from "@/lib/clauses-data";
import { filterClauses } from "@/lib/clauses-filter";
import { jurisdictionMeta, jurisdictionOrder } from "@/lib/jurisdictions";

import { ClausesExplorer } from "./_clauses-explorer";

export const revalidate = 3600;

const INITIAL_PAGE_SIZE = 40;

export const metadata: Metadata = {
  title: "Cross-Jurisdiction Clause & Citation Explorer · Project Babel",
  description:
    "Search, filter, compare, and export 2,200+ verbatim multilingual statutory clauses and risk-framing citations across the US, EU, South Korea, Japan, and China.",
  alternates: { canonical: "/clauses" },
};

export default async function ClausesPage() {
  const dataset = await getClausesDataset();
  const defaultHeadline = filterClauses(dataset.clauses, {
    mode: "headline",
    includeSubnational: false,
  });

  const jurisdictions = jurisdictionOrder.map((key) => ({
    key,
    slug: jurisdictionMeta[key].slug,
    shortName: jurisdictionMeta[key].shortName,
    name: jurisdictionMeta[key].name,
    flagUrl: jurisdictionMeta[key].flagUrl,
  }));

  return (
    <ClausesExplorer
      totalDatasetClauses={dataset.totalClauses}
      totalDocuments={dataset.totalDocuments}
      subnationalCount={dataset.subnationalCount}
      initialMatchedCount={defaultHeadline.length}
      initialClauses={defaultHeadline.slice(0, INITIAL_PAGE_SIZE)}
      jurisdictions={jurisdictions}
    />
  );
}
