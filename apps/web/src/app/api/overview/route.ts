import { NextRequest, NextResponse } from "next/server";

import { PUBLIC_API_HEADERS } from "@/lib/db";
import { getOverviewData, parseScoringMode } from "@/lib/overview-data";
import { parseIncludeSubnational } from "@/lib/taxonomy-vocab";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const mode = parseScoringMode(sp.get("mode"));
  const includeSubnational = parseIncludeSubnational(sp.get("states"));
  const overviewData = await getOverviewData(mode, includeSubnational);
  return NextResponse.json(overviewData, { headers: PUBLIC_API_HEADERS });
}
