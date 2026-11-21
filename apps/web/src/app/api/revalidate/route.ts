import { timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { OBSERVATORY_CACHE_TAG } from "@/lib/db";

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.OBSERVATORY_REVALIDATE_SECRET?.trim();
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Revalidation webhook is not configured on this environment." },
      { status: 503 },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const headerToken = request.headers.get("x-revalidate-secret")?.trim() ?? "";
  const provided = bearerToken || headerToken;

  if (!provided || !secretsMatch(provided, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidateTag(OBSERVATORY_CACHE_TAG, { expire: 0 });
  revalidatePath("/", "layout");

  return NextResponse.json(
    {
      revalidated: true,
      tag: OBSERVATORY_CACHE_TAG,
      timestamp: new Date().toISOString(),
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
