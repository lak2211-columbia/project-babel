import { NextRequest, NextResponse } from "next/server";

import { PUBLIC_API_HEADERS } from "@/lib/db";
import { getOverviewData, parseScoringMode } from "@/lib/overview-data";

export async function GET(request: NextRequest) {
  const mode = parseScoringMode(request.nextUrl.searchParams.get("mode"));
  const overviewData = await getOverviewData(mode);
  return NextResponse.json(overviewData, { headers: PUBLIC_API_HEADERS });
}
