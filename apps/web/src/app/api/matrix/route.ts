import { NextRequest, NextResponse } from "next/server";

import { PUBLIC_API_HEADERS } from "@/lib/db";
import { getObligationMatrix } from "@/lib/matrix-data";
import { parseScoringMode } from "@/lib/overview-data";

export async function GET(request: NextRequest) {
  const mode = parseScoringMode(request.nextUrl.searchParams.get("mode"));
  const matrix = await getObligationMatrix(mode);
  return NextResponse.json(matrix, { headers: PUBLIC_API_HEADERS });
}
