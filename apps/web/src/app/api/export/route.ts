import { NextRequest, NextResponse } from "next/server";

import { PUBLIC_API_HEADERS } from "@/lib/db";
import { getExportDocuments } from "@/lib/document-data";
import {
  formatDocumentsAsBibtex,
  formatDocumentsAsCsv,
} from "@/lib/export-formatters";
import { getOverviewData, parseScoringMode } from "@/lib/overview-data";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const format = (sp.get("format") ?? "json").trim().toLowerCase();
  const jurisdiction = sp.get("j")?.trim().toLowerCase() || undefined;
  const mode = parseScoringMode(sp.get("mode"));

  const [overview, rows] = await Promise.all([
    getOverviewData(mode),
    getExportDocuments(jurisdiction),
  ]);

  const slugSuffix = jurisdiction
    ? `-${jurisdiction.replace(/[^a-z0-9-]/g, "")}`
    : "";

  if (format === "csv") {
    const csv = formatDocumentsAsCsv(rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...PUBLIC_API_HEADERS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="project-babel-corpus${slugSuffix}.csv"`,
      },
    });
  }

  if (format === "bibtex" || format === "bib") {
    const bibtex = formatDocumentsAsBibtex(rows, {
      datasetVersion: overview.datasetVersion,
      latestPublicationDate: overview.snapshotDate,
      taxonomyVersion: overview.taxonomyVersion,
    });
    return new NextResponse(bibtex, {
      status: 200,
      headers: {
        ...PUBLIC_API_HEADERS,
        "Content-Type": "application/x-bibtex; charset=utf-8",
        "Content-Disposition": `attachment; filename="project-babel-corpus${slugSuffix}.bib"`,
      },
    });
  }

  if (format === "json") {
    return NextResponse.json(
      {
        datasetLabel: overview.datasetLabel,
        datasetVersion: overview.datasetVersion,
        scoringMode: overview.scoringMode,
        taxonomyVersion: overview.taxonomyVersion,
        snapshotDate: overview.snapshotDate,
        lastAnalyzedDate: overview.lastAnalyzedDate,
        corpusWindow: overview.corpusWindow,
        provenanceSummary: overview.provenanceSummary,
        nullCalibration: overview.nullCalibration,
        filterJurisdiction: jurisdiction ?? null,
        summary: overview.summary,
        countries: jurisdiction
          ? overview.countries.filter((c) => c.slug === jurisdiction)
          : overview.countries,
        timeline: overview.timeline,
        documentsCount: rows.length,
        documents: rows,
      },
      {
        headers: {
          ...PUBLIC_API_HEADERS,
          "Content-Disposition": `attachment; filename="project-babel-corpus${slugSuffix}.json"`,
        },
      },
    );
  }

  return NextResponse.json(
    {
      error:
        "Unsupported export format. Use format=csv, format=json, or format=bibtex.",
    },
    { status: 400, headers: PUBLIC_API_HEADERS },
  );
}
