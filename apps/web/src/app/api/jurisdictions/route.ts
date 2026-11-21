import { NextRequest, NextResponse } from "next/server";

import { PUBLIC_API_HEADERS } from "@/lib/db";
import { getOverviewData, parseScoringMode } from "@/lib/overview-data";

export async function GET(request: NextRequest) {
  const mode = parseScoringMode(request.nextUrl.searchParams.get("mode"));
  const overview = await getOverviewData(mode);
  return NextResponse.json(
    {
      hasData: overview.hasData,
      datasetLabel: overview.datasetLabel,
      scoringMode: overview.scoringMode,
      taxonomyVersion: overview.taxonomyVersion,
      datasetVersion: overview.datasetVersion,
      snapshotDate: overview.snapshotDate,
      lastAnalyzedDate: overview.lastAnalyzedDate,
      corpusWindow: overview.corpusWindow,
      nullCalibration: overview.nullCalibration,
      jurisdictions: overview.countries,
      matrix: overview.matrix,
      pairwiseDetails: overview.pairwiseDetails,
    },
    { headers: PUBLIC_API_HEADERS },
  );
}
