import "server-only";

import { unstable_cache } from "next/cache";

import { OBSERVATORY_CACHE_TAG, OBSERVATORY_REVALIDATE_SECONDS } from "@/lib/db";
import {
  getComparisonCorpus,
  type EvidenceSpan,
} from "@/lib/document-data";
import {
  jurisdictionMeta,
  jurisdictionOrder,
  type JurisdictionKey,
} from "@/lib/jurisdictions";
import { isHeadlineEligible } from "@/lib/scoring";
import type { FrameLabel, ScoringMode } from "@/lib/seed-data";
import {
  BINDING_LEVEL_LABELS,
  bindingLevelOf,
  ENFORCEMENT_MECHANISM_ORDER,
  humanizeEnforcement,
  humanizeRequirement,
  POLICY_REQUIREMENT_ORDER,
} from "@/lib/taxonomy-vocab";

export type MatrixInstrumentRef = {
  documentId: string;
  title: string;
  languageCode: string;
  bindingStrength: string;
  bindingStrengthLabel: string;
  bindingLevel: number;
  obligationStrength: string | null;
  obligationStrengthLabel: string | null;
  publicationDate: string;
  effectiveDate: string | null;
  corpusRoleLabel: string;
  lifecycleStageLabel: string;
  subnationalUnit: string | null;
  dominantFrame: FrameLabel | null;
  quotes: EvidenceSpan[];
};

export type ObligationMatrixCell = {
  jurisdictionKey: JurisdictionKey;
  jurisdictionSlug: string;
  jurisdictionShort: string;
  strongestLevel: number; // 0..4
  strongestLevelLabel: string;
  strongestBindingKey: string | null;
  instrumentCount: number;
  instruments: MatrixInstrumentRef[];
};

export type ObligationMatrixRow = {
  group: "requirement" | "enforcement";
  key: string;
  label: string;
  cells: Record<JurisdictionKey, ObligationMatrixCell>;
  maxLevelAcrossPeers: number;
  jurisdictionsImposing: number;
};

export type ObligationMatrixData = {
  mode: ScoringMode;
  includeSubnational: boolean;
  subnationalCount: number;
  totalInstrumentsInPool: number;
  jurisdictions: {
    key: JurisdictionKey;
    slug: string;
    name: string;
    shortName: string;
    flagUrl: string;
    instrumentCount: number;
    bindingControlsCount: number;
  }[];
  rows: ObligationMatrixRow[];
};

async function buildObligationMatrixUncached(
  mode: ScoringMode,
  includeSubnational = false,
): Promise<ObligationMatrixData> {
  const corpus = await getComparisonCorpus();
  const analyzed = corpus.filter((doc) => doc.analysisState === "analyzed");
  const subnationalCount = analyzed.filter(
    (doc) => doc.corpusRole === "subnational_overlay",
  ).length;
  const scoped = includeSubnational
    ? analyzed
    : analyzed.filter((doc) => doc.corpusRole !== "subnational_overlay");
  const pool =
    mode === "headline"
      ? scoped.filter((doc) =>
          isHeadlineEligible(
            {
              corpusRole: doc.corpusRole,
              lifecycleStage: doc.lifecycleStage,
            },
            { includeSubnational },
          ),
        )
      : scoped;

  const controlSpecs: { group: "requirement" | "enforcement"; key: string; label: string }[] = [
    ...POLICY_REQUIREMENT_ORDER.map((key) => ({
      group: "requirement" as const,
      key,
      label: humanizeRequirement(key),
    })),
    ...ENFORCEMENT_MECHANISM_ORDER.filter((k) => k !== "none_specified").map(
      (key) => ({
        group: "enforcement" as const,
        key,
        label: humanizeEnforcement(key),
      }),
    ),
  ];

  const rows: ObligationMatrixRow[] = controlSpecs.map((spec) => {
    const cells = {} as Record<JurisdictionKey, ObligationMatrixCell>;
    let maxLevelAcrossPeers = 0;
    let jurisdictionsImposing = 0;

    for (const jKey of jurisdictionOrder) {
      const meta = jurisdictionMeta[jKey];
      const instruments: MatrixInstrumentRef[] = [];

      for (const doc of pool) {
        if (doc.jurisdictionKey !== jKey) continue;
        const control =
          spec.group === "requirement"
            ? doc.safetyRequirements.find((r) => r.key === spec.key)
            : doc.enforcementMechanisms.find((e) => e.key === spec.key);
        if (!control) continue;

        const level = bindingLevelOf(doc.bindingStrength);
        instruments.push({
          documentId: doc.id,
          title: doc.title,
          languageCode: doc.languageCode,
          bindingStrength: doc.bindingStrength,
          bindingStrengthLabel: doc.bindingStrengthLabel,
          bindingLevel: level,
          obligationStrength: control.obligationStrength,
          obligationStrengthLabel: control.obligationStrengthLabel,
          publicationDate: doc.publicationDate,
          effectiveDate: doc.effectiveDateLabel,
          corpusRoleLabel: doc.corpusRoleLabel,
          lifecycleStageLabel: doc.lifecycleStageLabel,
          subnationalUnit: doc.subnationalUnit,
          dominantFrame: doc.dominantFrame,
          quotes: control.evidence.slice(0, 2),
        });
      }

      instruments.sort((a, b) => {
        if (b.bindingLevel !== a.bindingLevel) return b.bindingLevel - a.bindingLevel;
        return a.title.localeCompare(b.title);
      });

      const strongest = instruments[0];
      const strongestLevel = strongest ? strongest.bindingLevel : 0;
      if (strongestLevel > maxLevelAcrossPeers) maxLevelAcrossPeers = strongestLevel;
      if (strongestLevel > 0) jurisdictionsImposing += 1;

      cells[jKey] = {
        jurisdictionKey: jKey,
        jurisdictionSlug: meta.slug,
        jurisdictionShort: meta.shortName,
        strongestLevel,
        strongestLevelLabel: BINDING_LEVEL_LABELS[strongestLevel] ?? "Not imposed",
        strongestBindingKey: strongest ? strongest.bindingStrength : null,
        instrumentCount: instruments.length,
        instruments,
      };
    }

    return {
      group: spec.group,
      key: spec.key,
      label: spec.label,
      cells,
      maxLevelAcrossPeers,
      jurisdictionsImposing,
    };
  });

  const jurisdictions = jurisdictionOrder.map((jKey) => {
    const meta = jurisdictionMeta[jKey];
    const instrumentCount = pool.filter((d) => d.jurisdictionKey === jKey).length;
    const bindingControlsCount = rows.filter(
      (row) => row.cells[jKey].strongestLevel === 4,
    ).length;
    return {
      key: jKey,
      slug: meta.slug,
      name: meta.name,
      shortName: meta.shortName,
      flagUrl: meta.flagUrl,
      instrumentCount,
      bindingControlsCount,
    };
  });

  return {
    mode,
    includeSubnational,
    subnationalCount,
    totalInstrumentsInPool: pool.length,
    jurisdictions,
    rows,
  };
}

const getObligationMatrixCached = unstable_cache(
  buildObligationMatrixUncached,
  ["observatory-obligation-matrix-v4"],
  {
    revalidate: OBSERVATORY_REVALIDATE_SECONDS,
    tags: [OBSERVATORY_CACHE_TAG],
  },
);

export async function getObligationMatrix(
  mode: ScoringMode = "headline",
  includeSubnational = false,
): Promise<ObligationMatrixData> {
  return getObligationMatrixCached(mode, includeSubnational);
}
