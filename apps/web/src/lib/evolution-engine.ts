/**
 * Pure Longitudinal Regime Evolution (2019–2026) & Amendment Supersession Diff
 * engine for Project Babel (/evolution, /api/evolution, and /methodology).
 * Zero Node fs / server-only imports so server routes and unit tests share
 * one deterministic computation layer.
 */

import { jurisdictionMeta, type JurisdictionKey } from "./jurisdictions.ts";
import {
  hamiltonRound,
  isHeadlineEligible,
  normalizeDocumentFrameConfidence,
  SCORING_FRAME_LABELS,
  SCORING_JURISDICTION_ORDER,
} from "./scoring.ts";
import { frameLabels, type FrameLabel } from "./seed-data.ts";
import {
  humanizeEnforcement,
  humanizeRequirement,
} from "./taxonomy-vocab.ts";

export type EvolutionDocumentInput = {
  id: string;
  title: string;
  jurisdictionKey: JurisdictionKey;
  jurisdictionSlug: string;
  jurisdictionName: string;
  jurisdictionShort: string;
  flagUrl: string;
  languageCode: string;
  publicationDate: string;
  publicationDateIso: string | null;
  dateSort: number;
  bindingStrength: string;
  bindingStrengthLabel: string;
  corpusRole: string | null;
  corpusRoleLabel: string;
  lifecycleStage: string | null;
  lifecycleStageLabel: string;
  subnationalUnit: string | null;
  supersedesId: string | null;
  dominantFrame: FrameLabel | null;
  frameScoresMap: Record<string, number>;
  frameShare: Record<string, number> | null;
  requirementKeys: string[];
  enforcementKeys: string[];
};

export type EvolutionYearPoint = {
  year: number;
  newDocuments: number;
  cumulativeDocuments: number;
  activeDocuments: number;
  cumulativeRequirementBreadth: number;
  bindingLawCount: number;
  bindingLawShare: number;
  dominantFrame: FrameLabel | null;
  frameShares: Record<FrameLabel, number>;
};

export type SupersessionDocRef = {
  id: string;
  title: string;
  publicationDate: string;
  publicationDateIso: string | null;
  bindingStrength: string;
  bindingStrengthLabel: string;
  lifecycleStageLabel: string;
  languageCode: string;
  subnationalUnit: string | null;
};

export type SupersessionDiff = {
  id: string;
  jurisdictionKey: JurisdictionKey;
  jurisdictionSlug: string;
  jurisdictionShort: string;
  jurisdictionName: string;
  flagUrl: string;
  predecessor: SupersessionDocRef;
  successor: SupersessionDocRef;
  addedRequirements: { key: string; label: string }[];
  removedRequirements: { key: string; label: string }[];
  retainedRequirements: { key: string; label: string }[];
  addedEnforcement: { key: string; label: string }[];
  removedEnforcement: { key: string; label: string }[];
  bindingChange: {
    from: string;
    fromLabel: string;
    to: string;
    toLabel: string;
    changed: boolean;
  };
  dominantFrameChange: {
    from: FrameLabel | null;
    fromLabel: string | null;
    to: FrameLabel | null;
    toLabel: string | null;
    changed: boolean;
  };
};

export type JurisdictionFreshnessRow = {
  jurisdictionKey: JurisdictionKey;
  slug: string;
  name: string;
  shortName: string;
  flagUrl: string;
  totalDocuments: number;
  headlinePrimaryCount: number;
  subnationalCount: number;
  bindingLawCount: number;
  supersessionChainCount: number;
  latestPublicationDate: string;
  latestPublicationIso: string | null;
};

export type EvolutionAnalysis = {
  includeSubnational: boolean;
  subnationalCount: number;
  years: number[];
  globalSeries: EvolutionYearPoint[];
  seriesByJurisdiction: Record<JurisdictionKey, EvolutionYearPoint[]>;
  supersessionDiffs: SupersessionDiff[];
  freshnessByJurisdiction: JurisdictionFreshnessRow[];
};

function extractYear(iso: string | null): number | null {
  if (!iso) return null;
  const match = iso.match(/^(\d{4})/);
  if (!match) return null;
  const yr = Number(match[1]);
  return Number.isFinite(yr) && yr >= 1990 && yr <= 2100 ? yr : null;
}

function computeYearPoint(
  docs: readonly EvolutionDocumentInput[],
  year: number,
  supersededByYear: ReadonlyMap<string, number>,
): EvolutionYearPoint {
  const publishedUpToYear = docs.filter((d) => {
    const y = extractYear(d.publicationDateIso);
    return y !== null && y <= year;
  });
  const newInYear = docs.filter(
    (d) => extractYear(d.publicationDateIso) === year,
  );
  // Active in year `y` means published <= y and not superseded by a successor published <= y
  const activeInYear = publishedUpToYear.filter((d) => {
    const replacedYear = supersededByYear.get(d.id);
    if (replacedYear !== undefined && replacedYear <= year) return false;
    return true;
  });

  const reqSet = new Set<string>();
  let bindingLawCount = 0;
  const frameTotals = new Map<FrameLabel, number>(
    SCORING_FRAME_LABELS.map((f) => [f, 0]),
  );

  for (const doc of activeInYear) {
    for (const req of doc.requirementKeys) reqSet.add(req);
    if (doc.bindingStrength === "binding_law") bindingLawCount += 1;
    const norm = normalizeDocumentFrameConfidence(
      doc.frameScoresMap,
      doc.dominantFrame,
      doc.frameShare,
    );
    for (const [frame, w] of norm.entries()) {
      if (frameTotals.has(frame as FrameLabel)) {
        frameTotals.set(
          frame as FrameLabel,
          (frameTotals.get(frame as FrameLabel) ?? 0) + w,
        );
      }
    }
  }

  const totalFrameWeight = [...frameTotals.values()].reduce((s, v) => s + v, 0);
  const roundedFrames = hamiltonRound(
    SCORING_FRAME_LABELS.map((label) => ({
      label,
      value: frameTotals.get(label) ?? 0,
    })),
  );
  const frameShares = Object.fromEntries(
    roundedFrames.map((r) => [r.label, r.value]),
  ) as Record<FrameLabel, number>;

  let dominantFrame: FrameLabel | null = null;
  if (totalFrameWeight > 0) {
    dominantFrame =
      [...SCORING_FRAME_LABELS].sort(
        (a, b) => (frameTotals.get(b) ?? 0) - (frameTotals.get(a) ?? 0),
      )[0] ?? null;
  }

  return {
    year,
    newDocuments: newInYear.length,
    cumulativeDocuments: publishedUpToYear.length,
    activeDocuments: activeInYear.length,
    cumulativeRequirementBreadth: reqSet.size,
    bindingLawCount,
    bindingLawShare:
      activeInYear.length > 0
        ? Math.round((bindingLawCount / activeInYear.length) * 100)
        : 0,
    dominantFrame,
    frameShares,
  };
}

export function computeEvolutionAnalysis(
  allDocs: readonly EvolutionDocumentInput[],
  options?: { includeSubnational?: boolean },
): EvolutionAnalysis {
  const includeSubnational = Boolean(options?.includeSubnational);
  const subnationalCount = allDocs.filter(
    (d) => d.corpusRole === "subnational_overlay",
  ).length;
  const scopedDocs = includeSubnational
    ? [...allDocs]
    : allDocs.filter((d) => d.corpusRole !== "subnational_overlay");

  const docById = new Map<string, EvolutionDocumentInput>(
    allDocs.map((d) => [d.id, d]),
  );

  // Map predecessorId -> earliest successor publication year
  const supersededByYear = new Map<string, number>();
  const supersessionDiffs: SupersessionDiff[] = [];

  for (const successor of scopedDocs) {
    const predId = successor.supersedesId;
    if (!predId) continue;
    const predecessor = docById.get(predId);
    if (!predecessor) continue;

    const succYear = extractYear(successor.publicationDateIso);
    if (succYear !== null) {
      const existing = supersededByYear.get(predecessor.id);
      if (existing === undefined || succYear < existing) {
        supersededByYear.set(predecessor.id, succYear);
      }
    }

    const prevReqs = new Set(predecessor.requirementKeys);
    const nextReqs = new Set(successor.requirementKeys);
    const addedRequirements = [...nextReqs]
      .filter((k) => !prevReqs.has(k))
      .sort()
      .map((key) => ({ key, label: humanizeRequirement(key) }));
    const removedRequirements = [...prevReqs]
      .filter((k) => !nextReqs.has(k))
      .sort()
      .map((key) => ({ key, label: humanizeRequirement(key) }));
    const retainedRequirements = [...nextReqs]
      .filter((k) => prevReqs.has(k))
      .sort()
      .map((key) => ({ key, label: humanizeRequirement(key) }));

    const prevEnf = new Set(
      predecessor.enforcementKeys.filter((k) => k !== "none_specified"),
    );
    const nextEnf = new Set(
      successor.enforcementKeys.filter((k) => k !== "none_specified"),
    );
    const addedEnforcement = [...nextEnf]
      .filter((k) => !prevEnf.has(k))
      .sort()
      .map((key) => ({ key, label: humanizeEnforcement(key) }));
    const removedEnforcement = [...prevEnf]
      .filter((k) => !nextEnf.has(k))
      .sort()
      .map((key) => ({ key, label: humanizeEnforcement(key) }));

    supersessionDiffs.push({
      id: `${predecessor.id}__to__${successor.id}`,
      jurisdictionKey: successor.jurisdictionKey,
      jurisdictionSlug: successor.jurisdictionSlug,
      jurisdictionShort: successor.jurisdictionShort,
      jurisdictionName: successor.jurisdictionName,
      flagUrl: successor.flagUrl,
      predecessor: {
        id: predecessor.id,
        title: predecessor.title,
        publicationDate: predecessor.publicationDate,
        publicationDateIso: predecessor.publicationDateIso,
        bindingStrength: predecessor.bindingStrength,
        bindingStrengthLabel: predecessor.bindingStrengthLabel,
        lifecycleStageLabel: predecessor.lifecycleStageLabel,
        languageCode: predecessor.languageCode,
        subnationalUnit: predecessor.subnationalUnit,
      },
      successor: {
        id: successor.id,
        title: successor.title,
        publicationDate: successor.publicationDate,
        publicationDateIso: successor.publicationDateIso,
        bindingStrength: successor.bindingStrength,
        bindingStrengthLabel: successor.bindingStrengthLabel,
        lifecycleStageLabel: successor.lifecycleStageLabel,
        languageCode: successor.languageCode,
        subnationalUnit: successor.subnationalUnit,
      },
      addedRequirements,
      removedRequirements,
      retainedRequirements,
      addedEnforcement,
      removedEnforcement,
      bindingChange: {
        from: predecessor.bindingStrength,
        fromLabel: predecessor.bindingStrengthLabel,
        to: successor.bindingStrength,
        toLabel: successor.bindingStrengthLabel,
        changed: predecessor.bindingStrength !== successor.bindingStrength,
      },
      dominantFrameChange: {
        from: predecessor.dominantFrame,
        fromLabel: predecessor.dominantFrame
          ? frameLabels[predecessor.dominantFrame]
          : null,
        to: successor.dominantFrame,
        toLabel: successor.dominantFrame
          ? frameLabels[successor.dominantFrame]
          : null,
        changed: predecessor.dominantFrame !== successor.dominantFrame,
      },
    });
  }

  supersessionDiffs.sort((a, b) => {
    const aIso = a.successor.publicationDateIso ?? "";
    const bIso = b.successor.publicationDateIso ?? "";
    if (bIso !== aIso) return bIso.localeCompare(aIso);
    return a.id.localeCompare(b.id);
  });

  // Determine 2019..maxYear window cleanly
  const allYears = scopedDocs
    .map((d) => extractYear(d.publicationDateIso))
    .filter((y): y is number => y !== null);
  const maxYear = Math.max(2026, ...allYears);
  const startYear = 2019;
  const years: number[] = [];
  for (let y = startYear; y <= maxYear; y += 1) {
    years.push(y);
  }

  const globalSeries = years.map((y) =>
    computeYearPoint(scopedDocs, y, supersededByYear),
  );

  const seriesByJurisdiction = {} as Record<
    JurisdictionKey,
    EvolutionYearPoint[]
  >;
  const freshnessByJurisdiction: JurisdictionFreshnessRow[] = [];

  for (const jKey of SCORING_JURISDICTION_ORDER) {
    const jScoped = scopedDocs.filter((d) => d.jurisdictionKey === jKey);
    const jAll = allDocs.filter((d) => d.jurisdictionKey === jKey);
    seriesByJurisdiction[jKey] = years.map((y) =>
      computeYearPoint(jScoped, y, supersededByYear),
    );

    const sample = jAll[0];
    const newest = [...jScoped].sort((a, b) => b.dateSort - a.dateSort)[0];
    const headlinePrimaryCount = jAll.filter((d) =>
      isHeadlineEligible(
        { corpusRole: d.corpusRole, lifecycleStage: d.lifecycleStage },
        { includeSubnational: false },
      ),
    ).length;
    const jSubnationalCount = jAll.filter(
      (d) => d.corpusRole === "subnational_overlay",
    ).length;
    const bindingLawCount = jScoped.filter(
      (d) => d.bindingStrength === "binding_law",
    ).length;
    const supersessionChainCount = supersessionDiffs.filter(
      (diff) => diff.jurisdictionKey === jKey,
    ).length;

    const meta = jurisdictionMeta[jKey];
    freshnessByJurisdiction.push({
      jurisdictionKey: jKey,
      slug: sample?.jurisdictionSlug ?? meta.slug,
      name: sample?.jurisdictionName ?? meta.name,
      shortName: sample?.jurisdictionShort ?? meta.shortName,
      flagUrl: sample?.flagUrl || meta.flagUrl,
      totalDocuments: jScoped.length,
      headlinePrimaryCount,
      subnationalCount: jSubnationalCount,
      bindingLawCount,
      supersessionChainCount,
      latestPublicationDate: newest?.publicationDate ?? "No data",
      latestPublicationIso: newest?.publicationDateIso ?? null,
    });
  }

  return {
    includeSubnational,
    subnationalCount,
    years,
    globalSeries,
    seriesByJurisdiction,
    supersessionDiffs,
    freshnessByJurisdiction,
  };
}
