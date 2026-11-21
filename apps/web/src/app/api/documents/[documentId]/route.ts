import { NextResponse } from "next/server";

import { PUBLIC_API_HEADERS } from "@/lib/db";
import { getDocumentDetail } from "@/lib/document-data";

export async function GET(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await context.params;
  const document = await getDocumentDetail(documentId);
  if (!document) {
    return NextResponse.json(
      { error: "Document not found", documentId },
      { status: 404, headers: PUBLIC_API_HEADERS },
    );
  }
  return NextResponse.json({ document }, { headers: PUBLIC_API_HEADERS });
}
