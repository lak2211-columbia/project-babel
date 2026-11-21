import { NextRequest, NextResponse } from "next/server";

import { PUBLIC_API_HEADERS } from "@/lib/db";
import { getJurisdictionAnalysis } from "@/lib/jurisdiction-analysis";
import { jurisdictionMeta, type JurisdictionKey } from "@/lib/jurisdictions";
import {
  getLatestSources,
  getOverviewData,
  parseScoringMode,
} from "@/lib/overview-data";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const mode = parseScoringMode(request.nextUrl.searchParams.get("mode"));

  const jurisdictionEntry = Object.entries(jurisdictionMeta).find(
    ([key, meta]) => meta.slug === slug || key === slug,
  );
  if (!jurisdictionEntry) {
    return NextResponse.json(
      { error: "Jurisdiction not found", slug },
      { status: 404, headers: PUBLIC_API_HEADERS },
    );
  }
  const [jurisdictionKey, meta] = jurisdictionEntry as [
    JurisdictionKey,
    (typeof jurisdictionMeta)[JurisdictionKey],
  ];

  const [overview, analysis, documents] = await Promise.all([
    getOverviewData(mode),
    getJurisdictionAnalysis(jurisdictionKey),
    getLatestSources({ jurisdiction: jurisdictionKey, limit: 50 }),
  ]);

  const snapshot = overview.countries.find((c) => c.slug === meta.slug) ?? null;
  const pairwise = overview.pairwiseDetails.filter(
    (pair) => pair.leftSlug === meta.slug,
  );

  return NextResponse.json(
    {
      hasData: overview.hasData,
      datasetLabel: overview.datasetLabel,
      scoringMode: overview.scoringMode,
      taxonomyVersion: overview.taxonomyVersion,
      datasetVersion: overview.datasetVersion,
      snapshotDate: overview.snapshotDate,
      jurisdiction: snapshot,
      pairwise,
      analysis,
      documents,
    },
    { headers: PUBLIC_API_HEADERS },
  );
}
