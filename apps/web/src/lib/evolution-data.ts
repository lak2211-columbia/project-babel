import "server-only";

import { unstable_cache } from "next/cache";

import { OBSERVATORY_CACHE_TAG, OBSERVATORY_REVALIDATE_SECONDS } from "@/lib/db";
import { getComparisonCorpus } from "@/lib/document-data";
import {
  computeEvolutionAnalysis,
  type EvolutionAnalysis,
  type EvolutionDocumentInput,
} from "@/lib/evolution-engine";
import { jurisdictionOrder, type JurisdictionKey } from "@/lib/jurisdictions";

function isJurisdictionKey(value: string): value is JurisdictionKey {
  return (jurisdictionOrder as readonly string[]).includes(value);
}

async function buildEvolutionDataUncached(
  includeSubnational = false,
): Promise<EvolutionAnalysis> {
  const corpus = await getComparisonCorpus();
  const inputs: EvolutionDocumentInput[] = [];

  for (const doc of corpus) {
    if (doc.analysisState !== "analyzed") continue;
    if (!isJurisdictionKey(doc.jurisdictionKey)) continue;
    inputs.push({
      id: doc.id,
      title: doc.title,
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
      corpusRole: doc.corpusRole,
      corpusRoleLabel: doc.corpusRoleLabel,
      lifecycleStage: doc.lifecycleStage,
      lifecycleStageLabel: doc.lifecycleStageLabel,
      subnationalUnit: doc.subnationalUnit,
      supersedesId: doc.supersedesId,
      dominantFrame: doc.dominantFrame,
      frameScoresMap: doc.frameScoresMap,
      frameShare: doc.frameShare,
      requirementKeys: doc.requirementKeys,
      enforcementKeys: doc.enforcementKeys,
    });
  }

  return computeEvolutionAnalysis(inputs, { includeSubnational });
}

const getEvolutionDataCached = unstable_cache(
  buildEvolutionDataUncached,
  ["observatory-evolution-v1"],
  {
    revalidate: OBSERVATORY_REVALIDATE_SECONDS,
    tags: [OBSERVATORY_CACHE_TAG],
  },
);

export async function getEvolutionData(
  includeSubnational = false,
): Promise<EvolutionAnalysis> {
  return getEvolutionDataCached(includeSubnational);
}
