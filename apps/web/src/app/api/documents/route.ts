import { NextRequest, NextResponse } from "next/server";

import { PUBLIC_API_HEADERS } from "@/lib/db";
import { getDocumentListItems } from "@/lib/document-data";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const jurisdiction = sp.get("j")?.trim().toLowerCase() || "";
  const state = sp.get("s")?.trim().toLowerCase() || "";
  const frame = sp.get("f")?.trim().toLowerCase() || "";
  const binding = sp.get("b")?.trim().toLowerCase() || "";
  const docType = sp.get("t")?.trim().toLowerCase() || "";
  const requirement = sp.get("r")?.trim().toLowerCase() || "";
  const role = sp.get("role")?.trim().toLowerCase() || "";
  const lifecycle = sp.get("life")?.trim().toLowerCase() || "";
  const query = sp.get("q")?.trim().toLowerCase() || "";

  const allDocuments = await getDocumentListItems();
  const filtered = allDocuments.filter((doc) => {
    if (
      jurisdiction &&
      doc.jurisdictionSlug !== jurisdiction &&
      doc.jurisdictionShort.toLowerCase() !== jurisdiction
    ) {
      return false;
    }
    if (state && doc.analysisState !== state) return false;
    if (frame && doc.dominantFrame !== frame) return false;
    if (binding && doc.bindingStrength !== binding) return false;
    if (docType && doc.documentTypeKey !== docType) return false;
    if (requirement && !doc.requirementKeys.includes(requirement)) return false;
    if (role && (doc.corpusRole ?? "unclassified") !== role) return false;
    if (lifecycle && (doc.lifecycleStage ?? "unclassified") !== lifecycle) return false;
    if (
      query &&
      !doc.title.toLowerCase().includes(query) &&
      !doc.issuingBody.toLowerCase().includes(query) &&
      !doc.id.toLowerCase().includes(query) &&
      !doc.evidenceSearchText.includes(query)
    ) {
      return false;
    }
    return true;
  });

  // Omit internal evidenceSearchText from API wire payload to keep responses compact
  const compact = filtered.map((doc) => {
    const { evidenceSearchText: _search, ...rest } = doc;
    void _search;
    return rest;
  });

  return NextResponse.json(
    {
      total: allDocuments.length,
      count: compact.length,
      documents: compact,
    },
    { headers: PUBLIC_API_HEADERS },
  );
}
