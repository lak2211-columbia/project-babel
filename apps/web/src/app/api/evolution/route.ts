import { NextRequest, NextResponse } from "next/server";

import { PUBLIC_API_HEADERS } from "@/lib/db";
import { getEvolutionData } from "@/lib/evolution-data";
import { parseIncludeSubnational } from "@/lib/taxonomy-vocab";

export async function GET(request: NextRequest) {
  const includeSubnational = parseIncludeSubnational(
    request.nextUrl.searchParams.get("states"),
  );
  const evolution = await getEvolutionData(includeSubnational);
  return NextResponse.json(evolution, { headers: PUBLIC_API_HEADERS });
}
