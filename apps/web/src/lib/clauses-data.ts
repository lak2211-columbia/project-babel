import "server-only";

import { cache } from "react";

import type { ClauseRecord } from "@/lib/clauses-filter";
import { getComparisonCorpus } from "@/lib/document-data";
import { isHeadlineEligible } from "@/lib/scoring";
import { frameLabels } from "@/lib/seed-data";
import { bindingLevelOf } from "@/lib/taxonomy-vocab";

export type ClausesDataset = {
  totalClauses: number;
  totalDocuments: number;
  subnationalCount: number;
  clauses: ClauseRecord[];
};

async function buildClausesDatasetUncached(): Promise<ClausesDataset> {
  const corpus = await getComparisonCorpus();
  const analyzed = corpus.filter((doc) => doc.analysisState === "analyzed");
  const subnationalCount = analyzed.filter(
    (doc) => doc.corpusRole === "subnational_overlay",
  ).length;

  const clauses: ClauseRecord[] = [];

  for (const doc of analyzed) {
    const bindingLevel = bindingLevelOf(doc.bindingStrength);
    const isHeadlineFederal = isHeadlineEligible(
      {
        corpusRole: doc.corpusRole,
        lifecycleStage: doc.lifecycleStage,
      },
      { includeSubnational: false },
    );
    const isSubnationalOverlay = doc.corpusRole === "subnational_overlay";

    const base = {
      documentId: doc.id,
      documentTitle: doc.title,
      jurisdictionKey: doc.jurisdictionKey,
      jurisdictionSlug: doc.jurisdictionSlug,
      jurisdictionName: doc.jurisdiction,
      jurisdictionShort: doc.jurisdictionShort,
      flagUrl: doc.flagUrl,
      languageCode: doc.languageCode,
      publicationDate: doc.publicationDate,
      publicationDateIso: doc.publicationDateIso,
      dateSort: doc.dateSort,
      bindingStrength: doc.bindingStrength,
      bindingStrengthLabel: doc.bindingStrengthLabel,
      bindingLevel,
      corpusRole: doc.corpusRole,
      corpusRoleLabel: doc.corpusRoleLabel,
      lifecycleStage: doc.lifecycleStage,
      lifecycleStageLabel: doc.lifecycleStageLabel,
      subnationalUnit: doc.subnationalUnit,
      isHeadlineFederal,
      isSubnationalOverlay,
    };

    // 1. Safeguard requirement quotes — anchorId matches _evidence-reader.tsx 1:1
    for (const req of doc.safetyRequirements) {
      req.evidence.forEach((ev, idx) => {
        const anchorId = `quote-req-${req.key}-${idx + 1}`;
        clauses.push({
          ...base,
          id: `${doc.id}::${anchorId}`,
          anchorId,
          category: "requirement",
          controlKey: req.key,
          controlLabel: req.label,
          obligationStrength: req.obligationStrength,
          obligationStrengthLabel: req.obligationStrengthLabel,
          quote: ev.quote,
          quoteEn: ev.quoteEn,
          sourceSection: ev.sourceSection,
          groundingStatus: ev.groundingStatus,
        });
      });
    }

    // 2. Enforcement mechanism quotes — anchorId matches _evidence-reader.tsx 1:1
    for (const enf of doc.enforcementMechanisms) {
      enf.evidence.forEach((ev, idx) => {
        const anchorId = `quote-enf-${enf.key}-${idx + 1}`;
        clauses.push({
          ...base,
          id: `${doc.id}::${anchorId}`,
          anchorId,
          category: "enforcement",
          controlKey: enf.key,
          controlLabel: enf.label,
          obligationStrength: enf.obligationStrength,
          obligationStrengthLabel: enf.obligationStrengthLabel,
          quote: ev.quote,
          quoteEn: ev.quoteEn,
          sourceSection: ev.sourceSection,
          groundingStatus: ev.groundingStatus,
        });
      });
    }

    // 3. Risk framing quotes — anchorId matches _evidence-reader.tsx 1:1
    doc.framingEvidence.forEach((ev, idx) => {
      const frameKey = ev.frame ?? doc.dominantFrame ?? "innovation_enablement";
      const anchorId = `quote-frm-${idx + 1}`;
      clauses.push({
        ...base,
        id: `${doc.id}::${anchorId}`,
        anchorId,
        category: "framing",
        controlKey: frameKey,
        controlLabel: frameLabels[frameKey] ?? frameKey,
        obligationStrength: null,
        obligationStrengthLabel: null,
        quote: ev.quote,
        quoteEn: ev.quoteEn,
        sourceSection: ev.sourceSection,
        groundingStatus: ev.groundingStatus,
      });
    });
  }

  // Deterministic ordering: strongest binding level first, then newest publication, then doc ID
  clauses.sort((left, right) => {
    if (right.bindingLevel !== left.bindingLevel) {
      return right.bindingLevel - left.bindingLevel;
    }
    if (right.dateSort !== left.dateSort) {
      return right.dateSort - left.dateSort;
    }
    return left.id.localeCompare(right.id);
  });

  return {
    totalClauses: clauses.length,
    totalDocuments: analyzed.length,
    subnationalCount,
    clauses,
  };
}

/**
 * Builds the flat grounded clause index from the already-cached comparison
 * corpus (<3 ms in memory). Avoids wrapping >2MB flattened clause payloads in
 * Next.js unstable_cache while deduplicating within a single server render.
 */
export const getClausesDataset = cache(buildClausesDatasetUncached);
