import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TopNav } from "@/app/_components/top-nav";
import { getDocumentDetail } from "@/lib/document-data";
import { getOverviewData } from "@/lib/overview-data";
import type { AnalysisState } from "@/lib/sources-data";
import { BINDING_STRENGTH_COLORS } from "@/lib/taxonomy-vocab";

import { DocumentEvidenceReader } from "./_evidence-reader";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ documentId: string }>;
}): Promise<Metadata> {
  const { documentId } = await params;
  const doc = await getDocumentDetail(documentId);
  if (!doc) {
    return { title: "Document Not Found" };
  }
  return {
    title: `${doc.title} (${doc.jurisdictionShort})`,
    description: `${doc.jurisdiction} · ${doc.bindingStrengthLabel} · ${doc.documentType}. ${doc.rationaleSummary.slice(0, 140)}`,
    alternates: { canonical: `/documents/${encodeURIComponent(doc.id)}` },
  };
}

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const [document, overview] = await Promise.all([
    getDocumentDetail(documentId),
    getOverviewData("headline"),
  ]);

  if (!document) {
    notFound();
  }

  const countrySnapshot = overview.countries.find(
    (c) => c.slug === document.jurisdictionSlug,
  );
  const bindingColor =
    BINDING_STRENGTH_COLORS[document.bindingStrength] ?? "#94a3b8";
  const modelDiffers =
    Boolean(document.modelBindingStrength) &&
    document.modelBindingStrength !== document.bindingStrength;

  return (
    <main className="min-h-screen bg-[#0a0f18] font-sans text-[14px] text-[#cdd6e1]">
      <div className="mx-auto max-w-[1520px] px-4 py-4 sm:px-6 lg:px-8">
        <TopNav active="documents" />

        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-[#94a3b8]"
        >
          <Link href="/" className="transition-colors hover:text-[#f1f5f9]">
            overview
          </Link>
          <span aria-hidden className="text-[#475569]">
            /
          </span>
          <Link
            href="/documents"
            className="transition-colors hover:text-[#f1f5f9]"
          >
            documents
          </Link>
          <span aria-hidden className="text-[#475569]">
            /
          </span>
          <span className="truncate text-[#f1f5f9]">{document.id}</span>
        </nav>

        {/* Masthead */}
        <header className="mt-3 border-y border-white/20 py-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            {/* Left: title block */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {document.flagUrl ? (
                  <Image
                    src={document.flagUrl}
                    alt={`${document.jurisdiction} flag`}
                    width={24}
                    height={18}
                    className="h-[18px] w-[24px] rounded-[2px] border border-white/15 object-cover"
                    unoptimized
                  />
                ) : null}
                <Link
                  href={`/jurisdictions/${document.jurisdictionSlug}`}
                  className="flex items-center gap-1.5 rounded-[2px] border border-dashed border-white/20 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[#cbd5e1] transition-colors hover:border-solid hover:border-white/40 hover:text-[#f1f5f9]"
                >
                  <span>{document.jurisdictionShort}</span>
                  <span className="text-[#94a3b8]">{document.jurisdiction}</span>
                  <span aria-hidden className="text-[#94a3b8]">
                    →
                  </span>
                </Link>
                <AnalysisPill state={document.analysisState} />
                <span
                  className="rounded-[2px] border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em]"
                  style={{
                    color: bindingColor,
                    borderColor: `${bindingColor}55`,
                    background: `${bindingColor}14`,
                  }}
                >
                  {document.bindingStrengthLabel}
                </span>
                <span className="rounded-[2px] border border-white/15 bg-white/[0.02] px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[#cbd5e1]">
                  {document.documentType}
                </span>
              </div>

              <p className="mt-3 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">
                {document.corpusRoleLabel} · {document.lifecycleStageLabel} ·
                taxonomy v{document.provenance.taxonomyVersion}
              </p>
              <h1
                lang={document.languageCode}
                className="mt-1.5 text-[23px] font-semibold leading-snug tracking-[-0.01em] text-[#f1f5f9]"
              >
                {document.title}
              </h1>
              <p className="mt-3 max-w-[780px] text-[14px] leading-relaxed text-[#cbd5e1]">
                {document.rationaleSummary}
              </p>
            </div>

            {/* Right: metadata card */}
            <aside className="w-full min-w-[310px] rounded-sm border border-white/10 bg-[#0f1623] px-4 py-3.5 lg:w-auto">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">
                metadata &amp; provenance
              </p>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[12px]">
                <MetaRow label="published" value={document.publicationDate} />
                {document.effectiveDate ? (
                  <MetaRow label="effective" value={document.effectiveDate} />
                ) : null}
                <MetaRow label="language" value={document.language} />
                <MetaRow label="issuing body" value={document.issuingBody} />
                <MetaRow
                  label="authoritative tier"
                  value={document.bindingStrengthLabel}
                />
                {modelDiffers && document.modelBindingStrengthLabel ? (
                  <MetaRow
                    label="model suggested"
                    value={document.modelBindingStrengthLabel}
                  />
                ) : null}
                <MetaRow
                  label="model self-reported"
                  value={
                    document.overallConfidence !== null
                      ? `${Math.round(document.overallConfidence * 100)}%`
                      : "N/A"
                  }
                />
                {document.provenance.groundingRatio !== null ? (
                  <MetaRow
                    label="verified grounding"
                    value={`${Math.round(document.provenance.groundingRatio * 100)}%`}
                  />
                ) : null}
              </dl>
              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3 font-mono text-[11px] uppercase tracking-[0.08em]">
                {document.sourceUrl ? (
                  <a
                    href={document.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[#67e8f9] transition-colors hover:text-white"
                  >
                    <span>official source</span>
                    <span aria-hidden>↗</span>
                  </a>
                ) : (
                  <span className="text-[#94a3b8]">source url unavailable</span>
                )}
                <a
                  href={`/api/documents/${encodeURIComponent(document.id)}`}
                  className="text-[#cbd5e1] transition-colors hover:text-[#f1f5f9]"
                >
                  json api ↗
                </a>
              </div>
            </aside>
          </div>
        </header>

        {/* Interactive sticky two-column evidence reader (C4) */}
        <DocumentEvidenceReader
          document={document}
          countrySnapshot={countrySnapshot}
          nullCalibration={overview.nullCalibration}
        />

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 font-mono text-[11px] uppercase tracking-wider text-[#94a3b8]">
          <span>
            Project Babel · {document.jurisdictionShort} document · published{" "}
            {document.publicationDate}
          </span>
          <Link
            href="/documents"
            className="transition-colors hover:text-[#f1f5f9]"
          >
            ← back to documents
          </Link>
        </footer>
      </div>
    </main>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">
        {label}
      </dt>
      <dd className="text-right text-[12px] text-[#f1f5f9]">{value}</dd>
    </>
  );
}

function AnalysisPill({ state }: { state: AnalysisState }) {
  const map: Record<AnalysisState, { color: string; label: string }> = {
    analyzed: { color: "#38bdf8", label: "analyzed" },
    parsed: { color: "#94a3b8", label: "parsed" },
  };
  const s = map[state];
  return (
    <span
      className="rounded-[2px] px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider"
      style={{
        color: s.color,
        background: `${s.color}1a`,
        border: `1px solid ${s.color}40`,
      }}
    >
      {s.label}
    </span>
  );
}
