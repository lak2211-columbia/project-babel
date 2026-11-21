import { NextRequest, NextResponse } from "next/server";

import { getClausesDataset } from "@/lib/clauses-data";
import {
  filterClauses,
  formatClausesAsCsv,
  type ClauseCategory,
} from "@/lib/clauses-filter";
import { PUBLIC_API_HEADERS } from "@/lib/db";
import { parseScoringMode } from "@/lib/overview-data";
import { parseIncludeSubnational } from "@/lib/taxonomy-vocab";

function parseCategory(raw: string | null): ClauseCategory | "all" {
  if (raw === "requirement" || raw === "enforcement" || raw === "framing") {
    return raw;
  }
  return "all";
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const mode = parseScoringMode(sp.get("mode"));
  const includeSubnational = parseIncludeSubnational(sp.get("states"));
  const category = parseCategory(sp.get("category"));
  const control = sp.get("control");
  const jurisdiction = sp.get("j");
  const rawMinLevel = sp.get("minLevel");
  const minLevel = rawMinLevel ? Number(rawMinLevel) : 0;
  const obligation = sp.get("obligation");
  const query = sp.get("q");
  const format = (sp.get("format") ?? "json").trim().toLowerCase();

  const dataset = await getClausesDataset();
  const matched = filterClauses(dataset.clauses, {
    category,
    control,
    jurisdiction,
    minLevel: Number.isFinite(minLevel) ? minLevel : 0,
    obligation,
    mode,
    includeSubnational,
    query,
  });

  if (format === "csv") {
    const csv = formatClausesAsCsv(matched);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...PUBLIC_API_HEADERS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="project-babel-clauses.csv"',
      },
    });
  }

  const rawLimit = sp.get("limit");
  const rawOffset = sp.get("offset");
  const isDownload = sp.get("download") === "1";
  const maxLimit = isDownload ? 5000 : 500;
  const defaultLimit = isDownload ? 5000 : 100;
  const limit = rawLimit
    ? Math.max(1, Math.min(maxLimit, Math.floor(Number(rawLimit) || defaultLimit)))
    : defaultLimit;
  const offset = rawOffset
    ? Math.max(0, Math.floor(Number(rawOffset) || 0))
    : 0;

  const headers: Record<string, string> = { ...PUBLIC_API_HEADERS };
  if (isDownload) {
    headers["Content-Disposition"] =
      'attachment; filename="project-babel-clauses.json"';
  }

  return NextResponse.json(
    {
      mode,
      includeSubnational,
      subnationalCount: dataset.subnationalCount,
      totalDatasetClauses: dataset.totalClauses,
      matchedCount: matched.length,
      limit,
      offset,
      hasMore: offset + limit < matched.length,
      clauses: matched.slice(offset, offset + limit),
    },
    { headers },
  );
}
