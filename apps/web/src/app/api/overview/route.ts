import { NextResponse } from "next/server";

import { getOverviewData } from "@/lib/overview-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const overviewData = await getOverviewData();
  return NextResponse.json(overviewData);
}
