import "server-only";

import { unstable_cache } from "next/cache";

import { OBSERVATORY_CACHE_TAG, OBSERVATORY_REVALIDATE_SECONDS } from "@/lib/db";
import {
  getComparisonCorpus,
  type ComparisonCorpusDocument,
} from "@/lib/document-data";
import { jurisdictionMeta, type JurisdictionKey } from "@/lib/jurisdictions";
import { getOverviewData } from "@/lib/overview-data";
import {
  isHeadlineEligible,
  normalizeDocumentFrameConfidence,
  totalVariationDistance,
} from "@/lib/scoring";
import {
  allFrameLabels,
  frameLabels,
  type CountrySnapshot,
  type FrameLabel,
  type PairwiseDetail,
  type PolicyBreakdown,
  type ScoringMode,
} from "@/lib/seed-data";
import {
  humanizeBindingStrength,
  humanizeEnforcement,
  humanizeRequirement,
} from "@/lib/taxonomy-vocab";

export type EvidenceContrast = {
  documentId: string;
  title: string;
  languageCode: string;
  bindingStrength: string;
  dominantFrame: FrameLabel | null;
  quote: string;
  quoteEn: string | null;
  sourceSection: string | null;
};

/**
 * B7: Truly label-conditioned "Same Rule, Different Reason":
 * Compares the conditional frame distribution ONLY across documents carrying
 * requirement R on side A vs side B, verifies framing actually diverges, and
 * surfaces exact sample counts nA / nB plus requirement-specific quotes.
 */
export type SameRuleDifferentReasonItem = {
  requirementKey: string;
  requirementLabel: string;
  nA: number;
  nB: number;
  lowSample: boolean;
  conditionalFramingDistance: number;
  conditionalLeadingFrameA: FrameLabel;
  conditionalLeadingShareA: number;
  conditionalLeadingFrameB: FrameLabel;
  conditionalLeadingShareB: number;
  evidenceA: EvidenceContrast | null;
  evidenceB: EvidenceContrast | null;
};

/**
 * B7: Truly label-conditioned "Same Reason, Different Rule":
 * Compares binding-law share and distinctive requirements ONLY across documents
 * led by frame F on side A vs side B, showing exact nA / nB and strictly
 * frame-matched evidence (NEVER falling back to an unrelated frame).
 */
export type SameReasonDifferentRuleItem = {
  frame: FrameLabel;
  frameLabel: string;
  nA: number;
  nB: number;
  lowSample: boolean;
  bindingShareA: number;
  bindingShareB: number;
  bindingLeadLabel: string;
  distinctiveRulesA: string[];
  distinctiveRulesB: string[];
  evidenceA: EvidenceContrast | null;
  evidenceB: EvidenceContrast | null;
};

export type BilateralMetricRow = {
  key: string;
  label: string;
  shareA: number;
  shareB: number;
  countA: number;
  countB: number;
  delta: number;
};

export type FrameDeltaRow = {
  frame: FrameLabel;
  label: string;
  shareA: number;
  shareB: number;
  delta: number;
};

export type BilateralComparison = {
  hasData: boolean;
  mode: ScoringMode;
  countryA: CountrySnapshot;
  countryB: CountrySnapshot;
  policyDistance: number;
  framingDistance: number;
  compositeDistance: number;
  coverageDistance: number;
  policyBreakdown: PolicyBreakdown;
  frameDeltas: FrameDeltaRow[];
  requirementRows: BilateralMetricRow[];
  enforcementRows: BilateralMetricRow[];
  bindingRows: BilateralMetricRow[];
  sameRuleDifferentReason: SameRuleDifferentReasonItem[];
  sameReasonDifferentRule: SameReasonDifferentRuleItem[];
};

export function resolveJurisdictionSlug(
  slug: string | undefined,
  fallback: JurisdictionKey,
): JurisdictionKey {
  if (!slug) return fallback;
  const normalized = slug.trim().toLowerCase();
  for (const [key, meta] of Object.entries(jurisdictionMeta)) {
    if (
      meta.slug === normalized ||
      key === normalized ||
      meta.shortName.toLowerCase() === normalized
    ) {
      return key as JurisdictionKey;
    }
  }
  return fallback;
}

function conditionalFrameProfile(
  docs: readonly ComparisonCorpusDocument[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const doc of docs) {
    const norm = normalizeDocumentFrameConfidence(
      doc.frameScoresMap,
      doc.dominantFrame,
      doc.frameShare,
    );
    for (const [frame, weight] of norm.entries()) {
      totals.set(frame, (totals.get(frame) ?? 0) + weight);
    }
  }
  let sum = 0;
  for (const v of totals.values()) sum += v;
  if (sum <= 0) return new Map();
  const out = new Map<string, number>();
  for (const [k, v] of totals.entries()) out.set(k, v / sum);
  return out;
}

function topFrameFromProfile(profile: Map<string, number>): {
  frame: FrameLabel;
  share: number;
} {
  let best: FrameLabel = "innovation_enablement";
  let bestVal = -1;
  for (const frame of allFrameLabels) {
    const val = profile.get(frame) ?? 0;
    if (val > bestVal) {
      bestVal = val;
      best = frame;
    }
  }
  return { frame: best, share: Math.round(Math.max(0, bestVal) * 100) };
}

function pickRequirementEvidenceInMemory(
  docs: readonly ComparisonCorpusDocument[],
  requirementKey: string,
): EvidenceContrast | null {
  for (const doc of docs) {
    const control = doc.safetyRequirements.find(
      (req) => req.key === requirementKey && req.evidence.length > 0,
    );
    if (control) {
      const ev = control.evidence[0];
      return {
        documentId: doc.id,
        title: doc.title,
        languageCode: doc.languageCode,
        bindingStrength: doc.bindingStrengthLabel,
        dominantFrame: doc.dominantFrame,
        quote: ev.quote,
        quoteEn: ev.quoteEn,
        sourceSection: ev.sourceSection,
      };
    }
  }
  return null;
}

/**
 * B7: Strictly selects evidence from documents whose dominantFrame === frame
 * (preferring spans explicitly tagged with `ev.frame === frame`), and NEVER
 * falls back to a quote from a different frame.
 */
function pickStrictFrameEvidenceInMemory(
  docsLedByFrame: readonly ComparisonCorpusDocument[],
  frame: FrameLabel,
): EvidenceContrast | null {
  // First pass: span explicitly tagged with this exact frame
  for (const doc of docsLedByFrame) {
    const tagged = doc.framingEvidence.find((ev) => ev.frame === frame);
    if (tagged) {
      return {
        documentId: doc.id,
        title: doc.title,
        languageCode: doc.languageCode,
        bindingStrength: doc.bindingStrengthLabel,
        dominantFrame: doc.dominantFrame,
        quote: tagged.quote,
        quoteEn: tagged.quoteEn,
        sourceSection: tagged.sourceSection,
      };
    }
  }
  // Second pass: first framing evidence span on a doc whose dominant_frame === frame
  for (const doc of docsLedByFrame) {
    if (doc.dominantFrame !== frame) continue;
    const ev = doc.framingEvidence[0];
    if (ev && (!ev.frame || ev.frame === frame)) {
      return {
        documentId: doc.id,
        title: doc.title,
        languageCode: doc.languageCode,
        bindingStrength: doc.bindingStrengthLabel,
        dominantFrame: doc.dominantFrame,
        quote: ev.quote,
        quoteEn: ev.quoteEn,
        sourceSection: ev.sourceSection,
      };
    }
  }
  return null;
}

function mergeMetricRows(
  sharesA: CountrySnapshot["requirementShares"],
  sharesB: CountrySnapshot["requirementShares"],
  humanizer: (label?: string | null) => string,
): BilateralMetricRow[] {
  const mapA = new Map(sharesA.map((s) => [s.label, s]));
  const mapB = new Map(sharesB.map((s) => [s.label, s]));
  const keys = [...new Set([...mapA.keys(), ...mapB.keys()])];
  return keys
    .map((key) => {
      const a = mapA.get(key);
      const b = mapB.get(key);
      const shareA = a?.share ?? 0;
      const shareB = b?.share ?? 0;
      return {
        key,
        label: humanizer(key),
        shareA,
        shareB,
        countA: a?.count ?? 0,
        countB: b?.count ?? 0,
        delta: shareA - shareB,
      };
    })
    .sort((left, right) => {
      const maxRight = Math.max(right.shareA, right.shareB);
      const maxLeft = Math.max(left.shareA, left.shareB);
      if (maxRight !== maxLeft) return maxRight - maxLeft;
      return Math.abs(right.delta) - Math.abs(left.delta);
    });
}

function conditionalRequirementPrevalence(
  docs: readonly ComparisonCorpusDocument[],
): Map<string, number> {
  if (docs.length === 0) return new Map();
  const counts = new Map<string, number>();
  for (const doc of docs) {
    for (const key of new Set(doc.requirementKeys)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const out = new Map<string, number>();
  for (const [k, c] of counts.entries()) {
    out.set(k, Math.round((c / docs.length) * 100));
  }
  return out;
}

async function buildBilateralComparisonUncached(
  keyA: JurisdictionKey,
  keyB: JurisdictionKey,
  mode: ScoringMode,
): Promise<BilateralComparison> {
  const [overview, corpus] = await Promise.all([
    getOverviewData(mode),
    getComparisonCorpus(),
  ]);

  const slugA = jurisdictionMeta[keyA].slug;
  const slugB = jurisdictionMeta[keyB].slug;
  const countryA = overview.countries.find((c) => c.slug === slugA);
  const countryB = overview.countries.find((c) => c.slug === slugB);

  if (!overview.hasData || !countryA || !countryB) {
    const emptyCountry: CountrySnapshot = {
      slug: slugA,
      name: jurisdictionMeta[keyA].name,
      shortName: jurisdictionMeta[keyA].shortName,
      flagUrl: jurisdictionMeta[keyA].flagUrl,
      reviewedDocuments: 0,
      totalCorpusDocuments: 0,
      bindingLawCount: 0,
      lowConfidenceCount: 0,
      latestPublicationDate: "No data",
      lastAnalyzedDate: "No data",
      lastUpdated: "No data",
      policyDivergence: 0,
      framingDivergence: 0,
      compositeDivergence: 0,
      coverageDivergence: 0,
      rawPolicyDivergence: 0,
      rawFramingDivergence: 0,
      rawCompositeDivergence: 0,
      policyCI: { low: 0, high: 0 },
      framingCI: { low: 0, high: 0 },
      compositeCI: { low: 0, high: 0 },
      coverageCI: { low: 0, high: 0 },
      policyBreakdown: { requirements: 0, enforcement: 0, binding: 0 },
      dominantFrame: "innovation_enablement",
      requirements: [],
      distinctiveGaps: [],
      requirementShares: [],
      enforcementShares: [],
      bindingShares: [],
      obligationLevels: {},
      rationale: "No data loaded.",
      frameMix: [],
    };
    return {
      hasData: false,
      mode,
      countryA: countryA ?? emptyCountry,
      countryB: countryB ?? { ...emptyCountry, slug: slugB, name: jurisdictionMeta[keyB].name, shortName: jurisdictionMeta[keyB].shortName, flagUrl: jurisdictionMeta[keyB].flagUrl },
      policyDistance: 0,
      framingDistance: 0,
      compositeDistance: 0,
      coverageDistance: 0,
      policyBreakdown: { requirements: 0, enforcement: 0, binding: 0 },
      frameDeltas: [],
      requirementRows: [],
      enforcementRows: [],
      bindingRows: [],
      sameRuleDifferentReason: [],
      sameReasonDifferentRule: [],
    };
  }

  const pair: PairwiseDetail | undefined = overview.pairwiseDetails.find(
    (entry) => entry.leftSlug === countryA.slug && entry.rightSlug === countryB.slug,
  );

  const mixA = new Map(countryA.frameMix.map((f) => [f.label, f.value]));
  const mixB = new Map(countryB.frameMix.map((f) => [f.label, f.value]));

  const frameDeltas: FrameDeltaRow[] = allFrameLabels
    .map((frame) => {
      const shareA = mixA.get(frame) ?? 0;
      const shareB = mixB.get(frame) ?? 0;
      return {
        frame,
        label: frameLabels[frame],
        shareA,
        shareB,
        delta: shareA - shareB,
      };
    })
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));

  const requirementRows = mergeMetricRows(
    countryA.requirementShares,
    countryB.requirementShares,
    humanizeRequirement,
  );
  const enforcementRows = mergeMetricRows(
    countryA.enforcementShares,
    countryB.enforcementShares,
    humanizeEnforcement,
  );
  const bindingRows = mergeMetricRows(
    countryA.bindingShares,
    countryB.bindingShares,
    humanizeBindingStrength,
  );

  // Filter corpus to active mode population & sort binding_law first (zero N+1!)
  const pool =
    mode === "headline"
      ? corpus.filter(
          (doc) =>
            doc.analysisState === "analyzed" &&
            isHeadlineEligible({
              corpusRole: doc.corpusRole,
              lifecycleStage: doc.lifecycleStage,
            }),
        )
      : corpus.filter((doc) => doc.analysisState === "analyzed");

  const rankDocs = (slug: string) =>
    pool
      .filter((doc) => doc.jurisdictionSlug === slug)
      .sort((left, right) => {
        const lb = left.bindingStrength === "binding_law" ? 1 : 0;
        const rb = right.bindingStrength === "binding_law" ? 1 : 0;
        if (rb !== lb) return rb - lb;
        return right.dateSort - left.dateSort;
      });

  const docsA = rankDocs(countryA.slug);
  const docsB = rankDocs(countryB.slug);

  // B7: Label-conditioned "Same Rule, Different Reason"
  // Condition on docs carrying requirement R on both sides; verify framing actually diverges!
  const allReqKeys = [
    ...new Set([
      ...docsA.flatMap((d) => d.requirementKeys),
      ...docsB.flatMap((d) => d.requirementKeys),
    ]),
  ];

  const ruleCandidates: SameRuleDifferentReasonItem[] = [];
  for (const reqKey of allReqKeys) {
    const subA = docsA.filter((d) => d.requirementKeys.includes(reqKey));
    const subB = docsB.filter((d) => d.requirementKeys.includes(reqKey));
    if (subA.length < 2 || subB.length < 2) continue;

    const profA = conditionalFrameProfile(subA);
    const profB = conditionalFrameProfile(subB);
    const condFrmDist = Math.round(totalVariationDistance(profA, profB) * 100);
    const leadA = topFrameFromProfile(profA);
    const leadB = topFrameFromProfile(profB);

    // Require genuine framing divergence (>= 15 pts OR different conditional leading frames)
    if (condFrmDist < 15 && leadA.frame === leadB.frame) continue;

    ruleCandidates.push({
      requirementKey: reqKey,
      requirementLabel: humanizeRequirement(reqKey),
      nA: subA.length,
      nB: subB.length,
      lowSample: subA.length < 3 || subB.length < 3,
      conditionalFramingDistance: condFrmDist,
      conditionalLeadingFrameA: leadA.frame,
      conditionalLeadingShareA: leadA.share,
      conditionalLeadingFrameB: leadB.frame,
      conditionalLeadingShareB: leadB.share,
      evidenceA: pickRequirementEvidenceInMemory(subA, reqKey),
      evidenceB: pickRequirementEvidenceInMemory(subB, reqKey),
    });
  }

  const sameRuleDifferentReason = ruleCandidates
    .sort((left, right) => {
      if (left.lowSample !== right.lowSample) return left.lowSample ? 1 : -1;
      if (right.conditionalFramingDistance !== left.conditionalFramingDistance) {
        return right.conditionalFramingDistance - left.conditionalFramingDistance;
      }
      return Math.min(right.nA, right.nB) - Math.min(left.nA, left.nB);
    })
    .slice(0, 3);

  // B7: Label-conditioned "Same Reason, Different Rule"
  // Condition on docs whose dominant_frame === F on both sides!
  const reasonCandidates: SameReasonDifferentRuleItem[] = [];
  for (const frame of allFrameLabels) {
    const subA = docsA.filter((d) => d.dominantFrame === frame);
    const subB = docsB.filter((d) => d.dominantFrame === frame);
    if (subA.length < 2 || subB.length < 2) continue;

    const bindShareA = Math.round(
      (subA.filter((d) => d.bindingStrength === "binding_law").length /
        subA.length) *
        100,
    );
    const bindShareB = Math.round(
      (subB.filter((d) => d.bindingStrength === "binding_law").length /
        subB.length) *
        100,
    );

    const prevA = conditionalRequirementPrevalence(subA);
    const prevB = conditionalRequirementPrevalence(subB);
    const condReqKeys = [...new Set([...prevA.keys(), ...prevB.keys()])];
    const diffs = condReqKeys.map((k) => ({
      key: k,
      label: humanizeRequirement(k),
      delta: (prevA.get(k) ?? 0) - (prevB.get(k) ?? 0),
    }));

    const distinctiveRulesA = diffs
      .filter((d) => d.delta >= 12)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 3)
      .map((d) => `${d.label} (+${d.delta}pp)`);
    const distinctiveRulesB = diffs
      .filter((d) => d.delta <= -12)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 3)
      .map((d) => `${d.label} (+${Math.abs(d.delta)}pp)`);

    const bindingLeadLabel =
      bindShareA === bindShareB
        ? `Equal binding-law share (${bindShareA}%) among ${frameLabels[frame].toLowerCase()} documents`
        : bindShareA > bindShareB
          ? `${countryA.shortName} encodes ${bindShareA}% as binding law vs. ${bindShareB}% in ${countryB.shortName} (among docs led by this frame)`
          : `${countryB.shortName} encodes ${bindShareB}% as binding law vs. ${bindShareA}% in ${countryA.shortName} (among docs led by this frame)`;

    reasonCandidates.push({
      frame,
      frameLabel: frameLabels[frame],
      nA: subA.length,
      nB: subB.length,
      lowSample: subA.length < 3 || subB.length < 3,
      bindingShareA: bindShareA,
      bindingShareB: bindShareB,
      bindingLeadLabel,
      distinctiveRulesA,
      distinctiveRulesB,
      evidenceA: pickStrictFrameEvidenceInMemory(subA, frame),
      evidenceB: pickStrictFrameEvidenceInMemory(subB, frame),
    });
  }

  const sameReasonDifferentRule = reasonCandidates
    .sort((left, right) => {
      if (left.lowSample !== right.lowSample) return left.lowSample ? 1 : -1;
      return Math.min(right.nA, right.nB) - Math.min(left.nA, left.nB);
    })
    .slice(0, 2);

  return {
    hasData: true,
    mode,
    countryA,
    countryB,
    policyDistance: pair?.policyDistance ?? 0,
    framingDistance: pair?.framingDistance ?? 0,
    compositeDistance: pair?.compositeDistance ?? 0,
    coverageDistance: pair?.coverageDistance ?? 0,
    policyBreakdown: pair?.policyBreakdown ?? {
      requirements: 0,
      enforcement: 0,
      binding: 0,
    },
    frameDeltas,
    requirementRows,
    enforcementRows,
    bindingRows,
    sameRuleDifferentReason,
    sameReasonDifferentRule,
  };
}

const getBilateralComparisonCached = unstable_cache(
  buildBilateralComparisonUncached,
  ["observatory-bilateral-compare-v3"],
  {
    revalidate: OBSERVATORY_REVALIDATE_SECONDS,
    tags: [OBSERVATORY_CACHE_TAG],
  },
);

export async function getBilateralComparison(
  keyA: JurisdictionKey,
  keyB: JurisdictionKey,
  mode: ScoringMode = "headline",
): Promise<BilateralComparison> {
  return getBilateralComparisonCached(keyA, keyB, mode);
}
