/**
 * Pure, deterministic statistical scoring engine for Project Babel (Phase 3).
 * Zero Node fs / server-only / DB imports so server code, sensitivity audits,
 * and unit tests execute identically.
 *
 * Key methodological guarantees:
 *  - Codebook §8.2 headline population filter (primary_instrument + active/adopted)
 *  - Sub-0.15 frame_confidence noise thresholding (or direct frame_share preference)
 *  - Non-circular multi-dimensional POL + symmetric none_specified handling
 *  - Regime Coverage Index (strongest binding level 0..4 per control, normalized L1)
 *  - Seeded deterministic bootstrap 90% CIs (200 resamples) + label-permutation null
 *  - Weight sensitivity & Spearman rank stability grid across 4 scoring specifications
 *  - Largest Remainder (Hamilton) rounding guaranteeing exact 100% frame mixes
 */

import type { JurisdictionKey } from "./jurisdictions";
import type {
  ConfidenceInterval,
  DistinctiveGap,
  FrameLabel,
  HeadlineFinding,
  LabelShare,
  NullCalibration,
  PairwiseDetail,
  PolicyBreakdown,
  ScoringMode,
  SensitivityModeRow,
  YearlyTimelinePoint,
} from "./seed-data";

export const SCORING_JURISDICTION_ORDER: readonly JurisdictionKey[] = [
  "united_states",
  "european_union",
  "south_korea",
  "japan",
  "china",
] as const;

export const SCORING_FRAME_LABELS: readonly FrameLabel[] = [
  "existential_catastrophic",
  "national_security",
  "fundamental_rights",
  "economic_competitiveness",
  "innovation_enablement",
  "social_stability",
  "consumer_public_safety",
  "labor_transition",
] as const;

export const COVERAGE_CONTROL_KEYS: readonly string[] = [
  // 17 policy_requirements (Taxonomy v2.1.0)
  "risk_assessment",
  "pre_deployment_testing",
  "red_teaming",
  "incident_reporting",
  "transparency_disclosure",
  "model_documentation",
  "third_party_audit",
  "access_controls",
  "compute_governance",
  "content_provenance",
  "human_oversight",
  "registration_licensing",
  "agentic_autonomy_controls",
  "training_data_governance",
  "frontier_safety_evaluation",
  "open_weight_obligations",
  "domestic_representative",
  // 8 active enforcement_mechanisms (excluding none_specified)
  "civil_penalty",
  "criminal_penalty",
  "market_access_restriction",
  "procurement_condition",
  "licensing_requirement",
  "regulatory_supervision",
  "reporting_obligation",
  "soft_enforcement",
] as const;

export const POLICY_COMPONENT_WEIGHTS = {
  requirements: 0.45,
  enforcement: 0.3,
  binding: 0.25,
} as const;

export const COMPOSITE_WEIGHTS = {
  policy: 0.6,
  framing: 0.4,
} as const;

/** Canonical Codebook / label-definitions.json thresholds (A13). */
export const LOW_CONFIDENCE_POLICY_THRESHOLD = 0.7;
export const LOW_CONFIDENCE_FRAMING_THRESHOLD = 0.6;
export const FRAME_MENTION_FLOOR = 0.15;

export const BOOTSTRAP_RESAMPLES = 200;
export const PERMUTATION_DRAWS = 200;
const PRNG_SEED = 20261120;

const BINDING_LEVEL_MAP: Record<string, number> = {
  strategy_statement: 1,
  voluntary_commitment: 1,
  standards_guideline: 2,
  regulatory_guidance: 2,
  executive_action: 3,
  binding_law: 4,
};

const SENSITIVITY_BINDING_WEIGHTS: Record<string, number> = {
  binding_law: 4.0,
  executive_action: 3.0,
  regulatory_guidance: 2.0,
  standards_guideline: 1.5,
  voluntary_commitment: 1.0,
  strategy_statement: 1.0,
};

const FRAME_SET = new Set<string>(SCORING_FRAME_LABELS);

const SLUG_BY_KEY: Record<JurisdictionKey, string> = {
  united_states: "united-states",
  european_union: "european-union",
  south_korea: "south-korea",
  japan: "japan",
  china: "china",
};

const NAME_BY_KEY: Record<JurisdictionKey, string> = {
  united_states: "United States",
  european_union: "European Union",
  south_korea: "South Korea",
  japan: "Japan",
  china: "China",
};

const SHORT_BY_KEY: Record<JurisdictionKey, string> = {
  united_states: "US",
  european_union: "EU",
  south_korea: "KR",
  japan: "JP",
  china: "CN",
};

const LABEL_DISPLAY_MAP: Record<string, string> = {
  risk_assessment: "Risk assessment",
  pre_deployment_testing: "Pre-deployment testing",
  red_teaming: "Red-teaming",
  incident_reporting: "Incident reporting",
  transparency_disclosure: "Transparency & disclosure",
  model_documentation: "Model documentation",
  third_party_audit: "Third-party audit",
  access_controls: "Access controls",
  compute_governance: "Compute governance",
  content_provenance: "Content provenance",
  human_oversight: "Human oversight",
  registration_licensing: "Registration or licensing",
  agentic_autonomy_controls: "Agentic autonomy controls",
  training_data_governance: "Training data governance",
  frontier_safety_evaluation: "Frontier safety evaluation",
  open_weight_obligations: "Open-weight obligations",
  domestic_representative: "Domestic representative",
  civil_penalty: "Civil penalties",
  criminal_penalty: "Criminal penalties",
  market_access_restriction: "Market-access restrictions",
  procurement_condition: "Procurement conditions",
  licensing_requirement: "Licensing requirements",
  regulatory_supervision: "Regulatory supervision",
  reporting_obligation: "Reporting obligations",
  soft_enforcement: "Soft enforcement",
  none_specified: "No explicit control",
  binding_law: "Binding law",
  executive_action: "Executive action",
  regulatory_guidance: "Regulatory guidance",
  standards_guideline: "Standards guideline",
  voluntary_commitment: "Voluntary commitment",
  strategy_statement: "Strategy statement",
  existential_catastrophic: "Existential & catastrophic risk",
  national_security: "National security",
  fundamental_rights: "Fundamental rights",
  economic_competitiveness: "Economic competitiveness",
  innovation_enablement: "Innovation enablement",
  social_stability: "Social stability & public order",
  consumer_public_safety: "Consumer & public safety",
  labor_transition: "Labor & workforce transition",
};

export type ScoringDocumentInput = {
  documentId: string;
  jurisdiction: JurisdictionKey;
  publicationDate: string | null;
  machineCreatedAt: string | null;
  documentType?: string | null;
  /** Authoritative binding_strength (manifest first, model fallback). */
  bindingStrength?: string | null;
  corpusRole?: string | null;
  lifecycleStage?: string | null;
  policyConfidence?: number | null;
  dominantFrameConfidence?: number | null;
  overallConfidence?: number | null;
  safetyRequirements: { label: string; confidence?: number }[];
  enforcementMechanisms: { label: string; confidence?: number }[];
  dominantFrame?: string | null;
  frameConfidence?: Record<string, number> | null;
  /** Optional direct frame_share distribution from v2+ analyses summing to 1.0 (B3). */
  frameShare?: Record<string, number> | null;
};

export type JurisdictionScoreOutput = {
  jurisdiction: JurisdictionKey;
  documentCount: number;
  totalCorpusCount: number;
  bindingLawCount: number;
  lowConfidenceCount: number;
  latestPublicationTimestamp: number;
  lastAnalyzedTimestamp: number;
  rawPolicyDivergence: number;
  rawFramingDivergence: number;
  rawCompositeDivergence: number;
  policyDivergence: number;
  framingDivergence: number;
  compositeDivergence: number;
  coverageDivergence: number;
  policyCI: ConfidenceInterval;
  framingCI: ConfidenceInterval;
  compositeCI: ConfidenceInterval;
  coverageCI: ConfidenceInterval;
  policyBreakdown: PolicyBreakdown;
  dominantFrame: FrameLabel;
  frameMix: { label: FrameLabel; value: number }[];
  topRequirementLabels: string[];
  distinctiveGaps: DistinctiveGap[];
  requirementShares: LabelShare[];
  enforcementShares: LabelShare[];
  bindingShares: LabelShare[];
  obligationLevels: Record<string, number>;
};

export type ScoringEngineOutput = {
  mode: ScoringMode;
  includedDocumentCount: number;
  byJurisdiction: Map<JurisdictionKey, JurisdictionScoreOutput>;
  matrix: string[][];
  pairwiseDetails: PairwiseDetail[];
  nullCalibration: NullCalibration;
  findings: HeadlineFinding[];
  sensitivityGrid: SensitivityModeRow[];
  timeline: YearlyTimelinePoint[];
  timelineByJurisdiction: Record<string, YearlyTimelinePoint[]>;
  minPublicationYear: number | null;
  maxPublicationYear: number | null;
  latestPublicationTimestamp: number;
  latestAnalyzedTimestamp: number;
};

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isKnownFrameLabel(value?: string | null): value is FrameLabel {
  return Boolean(value && FRAME_SET.has(value));
}

/**
 * Codebook §8.2 headline population predicate (A3, A4, Phase 5A):
 * Only documents explicitly tagged as `primary_instrument` (or `subnational_overlay`
 * ONLY when `options.includeSubnational === true`) AND `active` or
 * `adopted_not_yet_effective` enter headline scoring. Missing/unclassified rows
 * are strictly excluded, and subnational overlays are excluded by default so the
 * federal-sovereign baseline remains unpolluted.
 */
export function isHeadlineEligible(
  doc: Pick<ScoringDocumentInput, "corpusRole" | "lifecycleStage">,
  options?: { includeSubnational?: boolean },
): boolean {
  const activeStage =
    doc.lifecycleStage === "active" ||
    doc.lifecycleStage === "adopted_not_yet_effective";
  if (!activeStage) return false;
  if (doc.corpusRole === "primary_instrument") return true;
  if (doc.corpusRole === "subnational_overlay") {
    return Boolean(options?.includeSubnational);
  }
  return false;
}

export function isLowConfidenceDocument(
  doc: Pick<
    ScoringDocumentInput,
    "policyConfidence" | "dominantFrameConfidence" | "overallConfidence"
  >,
): boolean {
  if (
    typeof doc.policyConfidence === "number" &&
    doc.policyConfidence < LOW_CONFIDENCE_POLICY_THRESHOLD
  ) {
    return true;
  }
  if (
    typeof doc.dominantFrameConfidence === "number" &&
    doc.dominantFrameConfidence < LOW_CONFIDENCE_FRAMING_THRESHOLD
  ) {
    return true;
  }
  if (
    doc.policyConfidence == null &&
    doc.dominantFrameConfidence == null &&
    typeof doc.overallConfidence === "number" &&
    doc.overallConfidence < LOW_CONFIDENCE_POLICY_THRESHOLD
  ) {
    return true;
  }
  return false;
}

/**
 * Largest Remainder Method (Hamilton apportionment).
 * Guarantees integer percentages ALWAYS sum to exact 100 (or all 0 when total == 0).
 */
export function hamiltonRound<T extends string>(
  entries: readonly { label: T; value: number }[],
): { label: T; value: number }[] {
  const sanitized = entries.map((entry) => ({
    label: entry.label,
    value: Number.isFinite(entry.value) && entry.value > 0 ? entry.value : 0,
  }));
  const total = sanitized.reduce((sum, entry) => sum + entry.value, 0);
  if (total <= 0) {
    return sanitized.map((entry) => ({ label: entry.label, value: 0 }));
  }

  const exact = sanitized.map((entry, index) => {
    const quota = (entry.value / total) * 100;
    const floor = Math.floor(quota);
    return {
      index,
      label: entry.label,
      floor,
      remainder: quota - floor,
      raw: entry.value,
    };
  });

  const floorSum = exact.reduce((sum, item) => sum + item.floor, 0);
  let remaining = 100 - floorSum;

  const ranked = [...exact].sort((left, right) => {
    if (right.remainder !== left.remainder) {
      return right.remainder - left.remainder;
    }
    if (right.raw !== left.raw) {
      return right.raw - left.raw;
    }
    return left.index - right.index;
  });

  const bonus = new Set<number>();
  for (let i = 0; i < ranked.length && remaining > 0; i += 1) {
    bonus.add(ranked[i].index);
    remaining -= 1;
  }

  return exact.map((item) => ({
    label: item.label,
    value: item.floor + (bonus.has(item.index) ? 1 : 0),
  }));
}

export function normalizeDistribution(
  input: Map<string, number>,
): Map<string, number> {
  let total = 0;
  for (const value of input.values()) {
    if (Number.isFinite(value) && value > 0) {
      total += value;
    }
  }
  if (total <= 0) {
    return new Map<string, number>();
  }
  const out = new Map<string, number>();
  for (const [label, value] of input.entries()) {
    if (Number.isFinite(value) && value > 0) {
      out.set(label, value / total);
    }
  }
  return out;
}

export function totalVariationDistance(
  left: Map<string, number>,
  right: Map<string, number>,
): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  const keys = new Set([...left.keys(), ...right.keys()]);
  let l1 = 0;
  for (const key of keys) {
    l1 += Math.abs((left.get(key) ?? 0) - (right.get(key) ?? 0));
  }
  return Math.min(1, l1 / 2);
}

export function averageNonEmptyProfiles(
  profiles: Map<string, number>[],
): Map<string, number> {
  const nonEmpty = profiles.filter((profile) => profile.size > 0);
  if (nonEmpty.length === 0) {
    return new Map<string, number>();
  }
  const totals = new Map<string, number>();
  for (const profile of nonEmpty) {
    for (const [label, value] of profile.entries()) {
      totals.set(label, (totals.get(label) ?? 0) + value);
    }
  }
  const divisor = nonEmpty.length;
  for (const [label, value] of totals.entries()) {
    totals.set(label, value / divisor);
  }
  return totals;
}

export function divergenceFromPeersExact(
  profiles: Map<JurisdictionKey, Map<string, number>>,
  target: JurisdictionKey,
  order: readonly JurisdictionKey[] = SCORING_JURISDICTION_ORDER,
): number {
  const targetProfile = profiles.get(target) ?? new Map<string, number>();
  if (targetProfile.size === 0) {
    return 0;
  }
  const peerProfiles = order
    .filter((jurisdiction) => jurisdiction !== target)
    .map((jurisdiction) => profiles.get(jurisdiction) ?? new Map<string, number>());

  const peerAverage = averageNonEmptyProfiles(peerProfiles);
  if (peerAverage.size === 0) {
    return 0;
  }
  return totalVariationDistance(targetProfile, peerAverage) * 100;
}

/**
 * Normalizes a single document's framing distribution to sum to 1.0 (B3):
 * - Prefers explicit `frameShare` when provided by v2+ pipeline analyses.
 * - Otherwise zeroes out sub-0.15 noise values (`FRAME_MENTION_FLOOR`) in
 *   `frameConfidence` before normalizing (falling back to keeping `dominantFrame`
 *   if no frame reaches 0.15).
 */
export function normalizeDocumentFrameConfidence(
  frameConfidence: Record<string, number> | null | undefined,
  dominantFrame: string | null | undefined,
  frameShare?: Record<string, number> | null,
): Map<FrameLabel, number> {
  if (frameShare) {
    const shareEntries: [FrameLabel, number][] = [];
    for (const [label, val] of Object.entries(frameShare)) {
      if (isKnownFrameLabel(label) && Number.isFinite(val) && val > 0) {
        shareEntries.push([label, val]);
      }
    }
    const shareTotal = shareEntries.reduce((sum, [, v]) => sum + v, 0);
    if (shareTotal > 0) {
      return new Map(shareEntries.map(([l, v]) => [l, v / shareTotal]));
    }
  }

  const aboveFloor: [FrameLabel, number][] = [];
  const positiveFallback: [FrameLabel, number][] = [];
  if (frameConfidence) {
    for (const [label, rawScore] of Object.entries(frameConfidence)) {
      if (!isKnownFrameLabel(label) || !Number.isFinite(rawScore) || rawScore <= 0) {
        continue;
      }
      positiveFallback.push([label, rawScore]);
      if (rawScore >= FRAME_MENTION_FLOOR) {
        aboveFloor.push([label, rawScore]);
      }
    }
  }

  const chosen = aboveFloor.length > 0 ? aboveFloor : positiveFallback;
  const total = chosen.reduce((sum, [, score]) => sum + score, 0);
  if (total > 0) {
    return new Map(chosen.map(([label, score]) => [label, score / total]));
  }
  if (isKnownFrameLabel(dominantFrame)) {
    return new Map([[dominantFrame, 1]]);
  }
  return new Map();
}

/**
 * Computes strongest ordinal binding level (0..4) per requirement & enforcement
 * control key across a jurisdiction's documents (B4).
 */
export function computeObligationLevels(
  docs: readonly ScoringDocumentInput[],
): Record<string, number> {
  const levels: Record<string, number> = {};
  for (const key of COVERAGE_CONTROL_KEYS) {
    levels[key] = 0;
  }
  for (const doc of docs) {
    const level = doc.bindingStrength
      ? (BINDING_LEVEL_MAP[doc.bindingStrength] ?? 1)
      : 1;
    for (const req of doc.safetyRequirements) {
      const k = req.label?.trim();
      if (!k) continue;
      if ((levels[k] ?? 0) < level) {
        levels[k] = level;
      }
    }
    for (const enf of doc.enforcementMechanisms) {
      const k = enf.label?.trim();
      if (!k || k === "none_specified") continue;
      if ((levels[k] ?? 0) < level) {
        levels[k] = level;
      }
    }
  }
  return levels;
}

/**
 * Normalized L1 Regime Coverage distance in [0, 100] between two obligation-level vectors.
 */
export function coverageL1Distance(
  left: Record<string, number>,
  right: Record<string, number>,
  keys: readonly string[] = COVERAGE_CONTROL_KEYS,
): number {
  if (keys.length === 0) return 0;
  let sum = 0;
  for (const key of keys) {
    sum += Math.abs((left[key] ?? 0) - (right[key] ?? 0)) / 4;
  }
  return (sum / keys.length) * 100;
}

function coverageDivergenceFromPeers(
  levelsByJurisdiction: Map<JurisdictionKey, Record<string, number>>,
  countsByJurisdiction: Map<JurisdictionKey, number>,
  target: JurisdictionKey,
): number {
  if ((countsByJurisdiction.get(target) ?? 0) === 0) return 0;
  const targetLevels = levelsByJurisdiction.get(target);
  if (!targetLevels) return 0;

  const nonEmptyPeers = SCORING_JURISDICTION_ORDER.filter(
    (j) => j !== target && (countsByJurisdiction.get(j) ?? 0) > 0,
  );
  if (nonEmptyPeers.length === 0) return 0;

  const peerMean: Record<string, number> = {};
  for (const key of COVERAGE_CONTROL_KEYS) {
    let s = 0;
    for (const peer of nonEmptyPeers) {
      s += levelsByJurisdiction.get(peer)?.[key] ?? 0;
    }
    peerMean[key] = s / nonEmptyPeers.length;
  }
  return coverageL1Distance(targetLevels, peerMean);
}

/** Seeded deterministic PRNG (Mulberry32) for reproducible bootstrap & null draws. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(
    0,
    Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)),
  );
  return sorted[idx];
}

function meanOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Lightweight core evaluation pass (reused for point estimate, 200 bootstrap
 * resamples, 200 permutation null draws, and sensitivity specifications).
 */
type CoreEvalSpec = "standard" | "binding_weighted";

type CoreEvalResult = {
  reqProfiles: Map<JurisdictionKey, Map<string, number>>;
  enfProfiles: Map<JurisdictionKey, Map<string, number>>;
  bindProfiles: Map<JurisdictionKey, Map<string, number>>;
  frameProfiles: Map<JurisdictionKey, Map<string, number>>;
  obligationLevels: Map<JurisdictionKey, Record<string, number>>;
  counts: Map<JurisdictionKey, number>;
  polByJur: Map<JurisdictionKey, number>;
  frmByJur: Map<JurisdictionKey, number>;
  cmpByJur: Map<JurisdictionKey, number>;
  covByJur: Map<JurisdictionKey, number>;
  breakdownByJur: Map<JurisdictionKey, PolicyBreakdown>;
  pairwisePol: number[];
  pairwiseFrm: number[];
  pairwiseCmp: number[];
};

function evaluateCore(
  docsByJurisdiction: Map<JurisdictionKey, ScoringDocumentInput[]>,
  spec: CoreEvalSpec = "standard",
): CoreEvalResult {
  const reqProfiles = new Map<JurisdictionKey, Map<string, number>>();
  const enfProfiles = new Map<JurisdictionKey, Map<string, number>>();
  const bindProfiles = new Map<JurisdictionKey, Map<string, number>>();
  const frameProfiles = new Map<JurisdictionKey, Map<string, number>>();
  const obligationLevels = new Map<JurisdictionKey, Record<string, number>>();
  const counts = new Map<JurisdictionKey, number>();

  for (const j of SCORING_JURISDICTION_ORDER) {
    const list = docsByJurisdiction.get(j) ?? [];
    counts.set(j, list.length);
    const reqW = new Map<string, number>();
    const enfW = new Map<string, number>();
    const bindW = new Map<string, number>();
    const frameW = new Map<string, number>();

    for (const doc of list) {
      const w =
        spec === "binding_weighted" && doc.bindingStrength
          ? (SENSITIVITY_BINDING_WEIGHTS[doc.bindingStrength] ?? 1.0)
          : 1.0;

      // Symmetrical none_specified handling for requirements & enforcement (B4)
      const uniqueReqs = [
        ...new Set(
          doc.safetyRequirements
            .map((r) => r.label?.trim())
            .filter((l): l is string => Boolean(l)),
        ),
      ];
      const reqList = uniqueReqs.length > 0 ? uniqueReqs : ["none_specified"];
      const reqMass = w / reqList.length;
      for (const label of reqList) {
        reqW.set(label, (reqW.get(label) ?? 0) + reqMass);
      }

      const uniqueEnf = [
        ...new Set(
          doc.enforcementMechanisms
            .map((e) => e.label?.trim())
            .filter((l): l is string => Boolean(l)),
        ),
      ];
      const enfList = uniqueEnf.length > 0 ? uniqueEnf : ["none_specified"];
      const enfMass = w / enfList.length;
      for (const label of enfList) {
        enfW.set(label, (enfW.get(label) ?? 0) + enfMass);
      }

      // Non-circular binding profile: each document counts 1.0 in binding distribution (B4)
      const bindKey = doc.bindingStrength?.trim() || "unclassified";
      bindW.set(bindKey, (bindW.get(bindKey) ?? 0) + 1.0);

      // Thresholded / frame_share normalized framing distribution (B3)
      const docFrames = normalizeDocumentFrameConfidence(
        doc.frameConfidence,
        doc.dominantFrame,
        doc.frameShare,
      );
      for (const [frame, share] of docFrames.entries()) {
        frameW.set(frame, (frameW.get(frame) ?? 0) + share * w);
      }
    }

    reqProfiles.set(j, normalizeDistribution(reqW));
    enfProfiles.set(j, normalizeDistribution(enfW));
    bindProfiles.set(j, normalizeDistribution(bindW));
    frameProfiles.set(j, normalizeDistribution(frameW));
    obligationLevels.set(j, computeObligationLevels(list));
  }

  const polByJur = new Map<JurisdictionKey, number>();
  const frmByJur = new Map<JurisdictionKey, number>();
  const cmpByJur = new Map<JurisdictionKey, number>();
  const covByJur = new Map<JurisdictionKey, number>();
  const breakdownByJur = new Map<JurisdictionKey, PolicyBreakdown>();

  for (const j of SCORING_JURISDICTION_ORDER) {
    const reqDiv = divergenceFromPeersExact(reqProfiles, j);
    const enfDiv = divergenceFromPeersExact(enfProfiles, j);
    const bindDiv = divergenceFromPeersExact(bindProfiles, j);
    const rawPol = round2(
      reqDiv * POLICY_COMPONENT_WEIGHTS.requirements +
        enfDiv * POLICY_COMPONENT_WEIGHTS.enforcement +
        bindDiv * POLICY_COMPONENT_WEIGHTS.binding,
    );
    const rawFrm = round2(divergenceFromPeersExact(frameProfiles, j));
    const rawCmp = round2(
      rawPol * COMPOSITE_WEIGHTS.policy + rawFrm * COMPOSITE_WEIGHTS.framing,
    );
    const cov = round2(coverageDivergenceFromPeers(obligationLevels, counts, j));

    polByJur.set(j, rawPol);
    frmByJur.set(j, rawFrm);
    cmpByJur.set(j, rawCmp);
    covByJur.set(j, cov);
    breakdownByJur.set(j, {
      requirements: Math.round(reqDiv),
      enforcement: Math.round(enfDiv),
      binding: Math.round(bindDiv),
    });
  }

  const pairwisePol: number[] = [];
  const pairwiseFrm: number[] = [];
  const pairwiseCmp: number[] = [];
  for (let i = 0; i < SCORING_JURISDICTION_ORDER.length; i += 1) {
    for (let k = i + 1; k < SCORING_JURISDICTION_ORDER.length; k += 1) {
      const a = SCORING_JURISDICTION_ORDER[i];
      const b = SCORING_JURISDICTION_ORDER[k];
      if ((counts.get(a) ?? 0) === 0 || (counts.get(b) ?? 0) === 0) continue;
      const dReq = totalVariationDistance(reqProfiles.get(a)!, reqProfiles.get(b)!) * 100;
      const dEnf = totalVariationDistance(enfProfiles.get(a)!, enfProfiles.get(b)!) * 100;
      const dBind = totalVariationDistance(bindProfiles.get(a)!, bindProfiles.get(b)!) * 100;
      const p =
        dReq * POLICY_COMPONENT_WEIGHTS.requirements +
        dEnf * POLICY_COMPONENT_WEIGHTS.enforcement +
        dBind * POLICY_COMPONENT_WEIGHTS.binding;
      const f = totalVariationDistance(frameProfiles.get(a)!, frameProfiles.get(b)!) * 100;
      const c = p * COMPOSITE_WEIGHTS.policy + f * COMPOSITE_WEIGHTS.framing;
      pairwisePol.push(p);
      pairwiseFrm.push(f);
      pairwiseCmp.push(c);
    }
  }

  return {
    reqProfiles,
    enfProfiles,
    bindProfiles,
    frameProfiles,
    obligationLevels,
    counts,
    polByJur,
    frmByJur,
    cmpByJur,
    covByJur,
    breakdownByJur,
    pairwisePol,
    pairwiseFrm,
    pairwiseCmp,
  };
}

function computeBootstrapCIs(
  docsByJurisdiction: Map<JurisdictionKey, ScoringDocumentInput[]>,
  resamples = BOOTSTRAP_RESAMPLES,
): Map<
  JurisdictionKey,
  {
    pol: ConfidenceInterval;
    frm: ConfidenceInterval;
    cmp: ConfidenceInterval;
    cov: ConfidenceInterval;
  }
> {
  const rng = mulberry32(PRNG_SEED);
  const samples = new Map<
    JurisdictionKey,
    { pol: number[]; frm: number[]; cmp: number[]; cov: number[] }
  >(
    SCORING_JURISDICTION_ORDER.map((j) => [
      j,
      { pol: [], frm: [], cmp: [], cov: [] },
    ]),
  );

  for (let r = 0; r < resamples; r += 1) {
    const draw = new Map<JurisdictionKey, ScoringDocumentInput[]>();
    for (const j of SCORING_JURISDICTION_ORDER) {
      const source = docsByJurisdiction.get(j) ?? [];
      if (source.length === 0) {
        draw.set(j, []);
        continue;
      }
      const resampled: ScoringDocumentInput[] = new Array(source.length);
      for (let i = 0; i < source.length; i += 1) {
        resampled[i] = source[Math.floor(rng() * source.length)];
      }
      draw.set(j, resampled);
    }
    const evaluated = evaluateCore(draw, "standard");
    for (const j of SCORING_JURISDICTION_ORDER) {
      const bucket = samples.get(j)!;
      bucket.pol.push(evaluated.polByJur.get(j) ?? 0);
      bucket.frm.push(evaluated.frmByJur.get(j) ?? 0);
      bucket.cmp.push(evaluated.cmpByJur.get(j) ?? 0);
      bucket.cov.push(evaluated.covByJur.get(j) ?? 0);
    }
  }

  const out = new Map<
    JurisdictionKey,
    {
      pol: ConfidenceInterval;
      frm: ConfidenceInterval;
      cmp: ConfidenceInterval;
      cov: ConfidenceInterval;
    }
  >();

  for (const j of SCORING_JURISDICTION_ORDER) {
    const bucket = samples.get(j)!;
    const ci = (arr: number[]): ConfidenceInterval => {
      const sorted = [...arr].sort((a, b) => a - b);
      return {
        low: Math.round(percentile(sorted, 0.05)),
        high: Math.round(percentile(sorted, 0.95)),
      };
    };
    out.set(j, {
      pol: ci(bucket.pol),
      frm: ci(bucket.frm),
      cmp: ci(bucket.cmp),
      cov: ci(bucket.cov),
    });
  }
  return out;
}

function computePermutationNull(
  docsByJurisdiction: Map<JurisdictionKey, ScoringDocumentInput[]>,
  draws = PERMUTATION_DRAWS,
): NullCalibration {
  const pool: ScoringDocumentInput[] = [];
  const sizes: [JurisdictionKey, number][] = [];
  for (const j of SCORING_JURISDICTION_ORDER) {
    const list = docsByJurisdiction.get(j) ?? [];
    sizes.push([j, list.length]);
    pool.push(...list);
  }
  if (pool.length < 4) {
    return {
      permutations: 0,
      countryPolicyMean: 0,
      countryPolicyP90: 0,
      countryFramingMean: 0,
      countryFramingP90: 0,
      countryCompositeMean: 0,
      countryCompositeP90: 0,
      pairwisePolicyMean: 0,
      pairwisePolicyP90: 0,
      pairwiseFramingMean: 0,
      pairwiseFramingP90: 0,
      pairwiseCompositeMean: 0,
      pairwiseCompositeP90: 0,
    };
  }

  const rng = mulberry32(PRNG_SEED ^ 0x9e3779b9);
  const cPol: number[] = [];
  const cFrm: number[] = [];
  const cCmp: number[] = [];
  const pPol: number[] = [];
  const pFrm: number[] = [];
  const pCmp: number[] = [];

  for (let d = 0; d < draws; d += 1) {
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const swap = Math.floor(rng() * (i + 1));
      const tmp = shuffled[i];
      shuffled[i] = shuffled[swap];
      shuffled[swap] = tmp;
    }

    const permMap = new Map<JurisdictionKey, ScoringDocumentInput[]>();
    let cursor = 0;
    for (const [j, size] of sizes) {
      permMap.set(j, shuffled.slice(cursor, cursor + size));
      cursor += size;
    }

    const res = evaluateCore(permMap, "standard");
    for (const [j, size] of sizes) {
      if (size === 0) continue;
      cPol.push(res.polByJur.get(j) ?? 0);
      cFrm.push(res.frmByJur.get(j) ?? 0);
      cCmp.push(res.cmpByJur.get(j) ?? 0);
    }
    pPol.push(...res.pairwisePol);
    pFrm.push(...res.pairwiseFrm);
    pCmp.push(...res.pairwiseCmp);
  }

  const stats = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return {
      mean: Math.round(meanOf(sorted)),
      p90: Math.round(percentile(sorted, 0.9)),
    };
  };

  const sCPol = stats(cPol);
  const sCFrm = stats(cFrm);
  const sCCmp = stats(cCmp);
  const sPPol = stats(pPol);
  const sPFrm = stats(pFrm);
  const sPCmp = stats(pCmp);

  return {
    permutations: draws,
    countryPolicyMean: sCPol.mean,
    countryPolicyP90: sCPol.p90,
    countryFramingMean: sCFrm.mean,
    countryFramingP90: sCFrm.p90,
    countryCompositeMean: sCCmp.mean,
    countryCompositeP90: sCCmp.p90,
    pairwisePolicyMean: sPPol.mean,
    pairwisePolicyP90: sPPol.p90,
    pairwiseFramingMean: sPFrm.mean,
    pairwiseFramingP90: sPFrm.p90,
    pairwiseCompositeMean: sPCmp.mean,
    pairwiseCompositeP90: sPCmp.p90,
  };
}

/** Spearman rank correlation ρ in [-1, 1] with average-rank tie handling. */
export function spearmanRankCorrelation(
  a: readonly number[],
  b: readonly number[],
): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 1;

  const rankVector = (vals: readonly number[]): number[] => {
    const indexed = vals
      .slice(0, n)
      .map((v, i) => ({ v, i }))
      .sort((x, y) => x.v - y.v);
    const ranks = new Array<number>(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && indexed[j + 1].v === indexed[i].v) j += 1;
      const avgRank = (i + j) / 2 + 1;
      for (let k = i; k <= j; k += 1) {
        ranks[indexed[k].i] = avgRank;
      }
      i = j + 1;
    }
    return ranks;
  };

  const ra = rankVector(a);
  const rb = rankVector(b);
  const meanA = meanOf(ra);
  const meanB = meanOf(rb);

  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = ra[i] - meanA;
    const db = rb[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  if (denA === 0 || denB === 0) return 1;
  return round2(num / Math.sqrt(denA * denB));
}

function groupByJurisdiction(
  docs: readonly ScoringDocumentInput[],
): Map<JurisdictionKey, ScoringDocumentInput[]> {
  const map = new Map<JurisdictionKey, ScoringDocumentInput[]>(
    SCORING_JURISDICTION_ORDER.map((j) => [j, []]),
  );
  for (const doc of docs) {
    const list = map.get(doc.jurisdiction);
    if (list) list.push(doc);
  }
  return map;
}

export function computeWeightSensitivityGrid(
  allDocs: readonly ScoringDocumentInput[],
  options?: { includeSubnational?: boolean },
): SensitivityModeRow[] {
  const includeSubnational = Boolean(options?.includeSubnational);
  const scopedAll = includeSubnational
    ? allDocs
    : allDocs.filter((doc) => doc.corpusRole !== "subnational_overlay");
  const headlineDocs = scopedAll.filter((doc) =>
    isHeadlineEligible(doc, { includeSubnational }),
  );
  const headlinePool = headlineDocs.length > 0 ? headlineDocs : scopedAll;
  const headlineMap = groupByJurisdiction(headlinePool);
  const allMap = groupByJurisdiction(scopedAll);

  const evalHeadline = evaluateCore(headlineMap, "standard");
  const evalWeighted = evaluateCore(headlineMap, "binding_weighted");
  const evalAll = evaluateCore(allMap, "standard");

  const toRecord = (getter: (j: JurisdictionKey) => number) =>
    Object.fromEntries(
      SCORING_JURISDICTION_ORDER.map((j) => [SLUG_BY_KEY[j], Math.round(getter(j))]),
    );

  const baseVec = SCORING_JURISDICTION_ORDER.map(
    (j) => evalHeadline.cmpByJur.get(j) ?? 0,
  );
  const weightedVec = SCORING_JURISDICTION_ORDER.map(
    (j) => evalWeighted.cmpByJur.get(j) ?? 0,
  );
  const covVec = SCORING_JURISDICTION_ORDER.map(
    (j) => evalHeadline.covByJur.get(j) ?? 0,
  );
  const allVec = SCORING_JURISDICTION_ORDER.map(
    (j) => evalAll.cmpByJur.get(j) ?? 0,
  );

  return [
    {
      modeId: "headline",
      label: "Headline (Primary Active)",
      description:
        "Codebook §8.2 default: active/adopted primary instruments, equal per-instrument weight, non-circular binding profile.",
      scoresByJurisdiction: toRecord((j) => evalHeadline.cmpByJur.get(j) ?? 0),
      spearmanVsHeadline: 1.0,
    },
    {
      modeId: "binding_weighted",
      label: "Binding-Weighted Primary",
      description:
        "Primary active instruments weighted 4× binding law, 3× executive, 2× guidance, 1.5× standard, 1× voluntary/strategy.",
      scoresByJurisdiction: toRecord((j) => evalWeighted.cmpByJur.get(j) ?? 0),
      spearmanVsHeadline: spearmanRankCorrelation(baseVec, weightedVec),
    },
    {
      modeId: "coverage_l1",
      label: "Regime Coverage L1",
      description:
        "Volume-invariant L1 distance over strongest binding level (0–4) imposed across all 25 requirement & enforcement controls.",
      scoresByJurisdiction: toRecord((j) => evalHeadline.covByJur.get(j) ?? 0),
      spearmanVsHeadline: spearmanRankCorrelation(baseVec, covVec),
    },
    {
      modeId: "all",
      label: "All-Corpus Unfiltered",
      description:
        "Includes companion FAQs, draft consultations, and historical baselines alongside primary instruments (w = 1.0).",
      scoresByJurisdiction: toRecord((j) => evalAll.cmpByJur.get(j) ?? 0),
      spearmanVsHeadline: spearmanRankCorrelation(baseVec, allVec),
    },
  ];
}

function parseTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  const yearMonth = value.match(/^(\d{4})-(\d{2})$/);
  if (yearMonth) {
    return Date.UTC(Number(yearMonth[1]), Number(yearMonth[2]) - 1, 1);
  }
  const yearOnly = value.match(/^(\d{4})$/);
  if (yearOnly) {
    return Date.UTC(Number(yearOnly[1]), 0, 1);
  }
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
}

function extractYear(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})/);
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 1990 && year <= 2100 ? year : null;
}

function buildLabelShares(
  profile: Map<string, number>,
  rawCounts: Map<string, number>,
  limit = 17,
): LabelShare[] {
  const entries = [...profile.entries()]
    .filter(([key, val]) => val > 0 && key !== "none_specified")
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])));
  if (entries.length === 0) return [];
  const rounded = hamiltonRound(entries.map(([label, value]) => ({ label, value })));
  return rounded.slice(0, limit).map((item) => ({
    label: item.label,
    share: item.value,
    count: rawCounts.get(item.label) ?? 0,
  }));
}

function computeDistinctiveGaps(
  target: JurisdictionKey,
  core: CoreEvalResult,
): DistinctiveGap[] {
  const candidates: DistinctiveGap[] = [];
  const dimensions: {
    dimension: DistinctiveGap["dimension"];
    profiles: Map<JurisdictionKey, Map<string, number>>;
  }[] = [
    { dimension: "binding", profiles: core.bindProfiles },
    { dimension: "requirement", profiles: core.reqProfiles },
    { dimension: "enforcement", profiles: core.enfProfiles },
    { dimension: "frame", profiles: core.frameProfiles },
  ];

  for (const { dimension, profiles } of dimensions) {
    const own = profiles.get(target) ?? new Map<string, number>();
    const peerAvg = averageNonEmptyProfiles(
      SCORING_JURISDICTION_ORDER.filter((j) => j !== target).map(
        (j) => profiles.get(j) ?? new Map<string, number>(),
      ),
    );
    const keys = new Set([...own.keys(), ...peerAvg.keys()]);
    for (const key of keys) {
      if (key === "none_specified" || key === "unclassified") continue;
      const ownPct = Math.round((own.get(key) ?? 0) * 100);
      const peerPct = Math.round((peerAvg.get(key) ?? 0) * 100);
      const delta = ownPct - peerPct;
      if (Math.abs(delta) < 5) continue;
      candidates.push({
        dimension,
        key,
        label: LABEL_DISPLAY_MAP[key] ?? key.replaceAll("_", " "),
        ownShare: ownPct,
        peerShare: peerPct,
        delta,
      });
    }
  }

  // Prefer the 3 largest absolute gaps, ensuring at least one positive distinctive trait if available
  const sorted = candidates.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return sorted.slice(0, 3);
}

function buildDynamicFindings(
  byJurisdiction: Map<JurisdictionKey, JurisdictionScoreOutput>,
  pairwiseDetails: PairwiseDetail[],
  mode: ScoringMode,
  includeSubnational = false,
): HeadlineFinding[] {
  const findings: HeadlineFinding[] = [];
  const modeSuffix =
    (mode === "all" ? "&mode=all" : "") + (includeSubnational ? "&states=1" : "");
  const matrixQueryParts: string[] = [];
  if (mode === "all") matrixQueryParts.push("mode=all");
  if (includeSubnational) matrixQueryParts.push("states=1");
  const matrixHref =
    matrixQueryParts.length > 0
      ? `/matrix?${matrixQueryParts.join("&")}`
      : "/matrix";

  // 1. Widest Policy–Framing Decoupling Pair (largest |POL - FRM|)
  const uniquePairs = pairwiseDetails.filter(
    (p) => p.leftSlug.localeCompare(p.rightSlug) < 0,
  );
  const widestDecoupling = [...uniquePairs].sort(
    (a, b) => Math.abs(b.decouplingGap) - Math.abs(a.decouplingGap),
  )[0];
  if (widestDecoupling) {
    const keyA = SCORING_JURISDICTION_ORDER.find(
      (k) => SLUG_BY_KEY[k] === widestDecoupling.leftSlug,
    )!;
    const keyB = SCORING_JURISDICTION_ORDER.find(
      (k) => SLUG_BY_KEY[k] === widestDecoupling.rightSlug,
    )!;
    const policyHigher = widestDecoupling.decouplingGap >= 0;
    findings.push({
      id: "decoupling-peak",
      kicker: policyHigher ? "policy > framing decoupling" : "framing > policy decoupling",
      headline: `${NAME_BY_KEY[keyA]} vs. ${NAME_BY_KEY[keyB]}: POL ${widestDecoupling.policyDistance} vs. FRM ${widestDecoupling.framingDistance}`,
      detail: policyHigher
        ? `Their binding and enforcement architectures diverge by ${Math.abs(widestDecoupling.decouplingGap)} points more than their stated risk rationales.`
        : `Their stated risk rationales diverge by ${Math.abs(widestDecoupling.decouplingGap)} points more than their operational policy controls.`,
      href: `/compare?a=${widestDecoupling.leftSlug}&b=${widestDecoupling.rightSlug}${modeSuffix}`,
      hrefLabel: `Inspect ${SHORT_BY_KEY[keyA]}/${SHORT_BY_KEY[keyB]} diff →`,
    });
  }

  // 2. Widest Overall Fault Line (highest composite distance)
  const widestOverall = [...uniquePairs].sort(
    (a, b) => b.compositeDistance - a.compositeDistance,
  )[0];
  if (widestOverall && widestOverall !== widestDecoupling) {
    const keyA = SCORING_JURISDICTION_ORDER.find(
      (k) => SLUG_BY_KEY[k] === widestOverall.leftSlug,
    )!;
    const keyB = SCORING_JURISDICTION_ORDER.find(
      (k) => SLUG_BY_KEY[k] === widestOverall.rightSlug,
    )!;
    findings.push({
      id: "widest-fault-line",
      kicker: "widest bilateral fault line",
      headline: `${NAME_BY_KEY[keyA]} / ${NAME_BY_KEY[keyB]} lead overall divergence (CMP ${widestOverall.compositeDistance})`,
      detail: `Policy distance ${widestOverall.policyDistance}, framing distance ${widestOverall.framingDistance}, and volume-invariant regime coverage L1 ${widestOverall.coverageDistance}.`,
      href: `/compare?a=${widestOverall.leftSlug}&b=${widestOverall.rightSlug}${modeSuffix}`,
      hrefLabel: `Compare ${SHORT_BY_KEY[keyA]} vs ${SHORT_BY_KEY[keyB]} →`,
    });
  }

  // 3. Strongest Statutory Coverage Leader (most controls at level 4 = binding_law)
  const bindingCounts = SCORING_JURISDICTION_ORDER.map((j) => {
    const output = byJurisdiction.get(j);
    const statutoryControls = output
      ? Object.values(output.obligationLevels).filter((lvl) => lvl === 4).length
      : 0;
    return { j, statutoryControls, covDiv: output?.coverageDivergence ?? 0 };
  }).sort((a, b) => b.statutoryControls - a.statutoryControls);

  const leader = bindingCounts[0];
  const trailer = bindingCounts[bindingCounts.length - 1];
  if (leader && trailer && leader.statutoryControls > 0) {
    findings.push({
      id: "binding-coverage",
      kicker: "regime coverage gap",
      headline: `${NAME_BY_KEY[leader.j]} imposes ${leader.statutoryControls}/${COVERAGE_CONTROL_KEYS.length} controls via binding law vs. ${trailer.statutoryControls} in ${NAME_BY_KEY[trailer.j]}`,
      detail: `Measured by strongest binding level per control (0–4), unaffected by FAQ or companion-page volume.`,
      href: matrixHref,
      hrefLabel: "Open obligation matrix →",
    });
  }

  return findings;
}

export function computeScoringEngine(
  allDocs: readonly ScoringDocumentInput[],
  mode: ScoringMode = "headline",
  options?: { includeSubnational?: boolean },
): ScoringEngineOutput {
  const includeSubnational = Boolean(options?.includeSubnational);
  const scopedCorpus = includeSubnational
    ? allDocs
    : allDocs.filter((doc) => doc.corpusRole !== "subnational_overlay");

  const totalCountsByJur = new Map<JurisdictionKey, number>(
    SCORING_JURISDICTION_ORDER.map((j) => [j, 0]),
  );
  for (const doc of scopedCorpus) {
    totalCountsByJur.set(
      doc.jurisdiction,
      (totalCountsByJur.get(doc.jurisdiction) ?? 0) + 1,
    );
  }

  // Codebook §8.2 strict filtering in headline mode (A3, A4, Phase 5A)
  const activeDocs =
    mode === "headline"
      ? scopedCorpus.filter((doc) =>
          isHeadlineEligible(doc, { includeSubnational }),
        )
      : [...scopedCorpus];

  const docsByJur = groupByJurisdiction(activeDocs);
  const core = evaluateCore(docsByJur, "standard");
  const bootstrapCIs = computeBootstrapCIs(docsByJur);
  const nullCalibration = computePermutationNull(docsByJur);
  const sensitivityGrid = computeWeightSensitivityGrid(allDocs, {
    includeSubnational,
  });

  type YearBucket = {
    totalDocuments: number;
    bindingDocuments: number;
    byJurisdiction: Record<string, number>;
    frameWeighted: Map<FrameLabel, number>;
  };
  const yearBuckets = new Map<number, YearBucket>();
  const jurYearBuckets = new Map<JurisdictionKey, Map<number, YearBucket>>(
    SCORING_JURISDICTION_ORDER.map((j) => [j, new Map<number, YearBucket>()]),
  );

  let minPublicationYear: number | null = null;
  let maxPublicationYear: number | null = null;
  let latestPublicationTimestamp = 0;
  let latestAnalyzedTimestamp = 0;

  // Timeline covers allDocs so longitudinal history reflects the real publication span,
  // while headline vs all mode controls scoring population.
  for (const doc of activeDocs) {
    const pubTs = parseTimestamp(doc.publicationDate);
    const analyzedTs = parseTimestamp(doc.machineCreatedAt);
    const pubYear = extractYear(doc.publicationDate);
    if (pubTs > latestPublicationTimestamp) latestPublicationTimestamp = pubTs;
    if (analyzedTs > latestAnalyzedTimestamp) latestAnalyzedTimestamp = analyzedTs;

    const docFrames = normalizeDocumentFrameConfidence(
      doc.frameConfidence,
      doc.dominantFrame,
      doc.frameShare,
    );

    if (pubYear !== null) {
      if (minPublicationYear === null || pubYear < minPublicationYear) {
        minPublicationYear = pubYear;
      }
      if (maxPublicationYear === null || pubYear > maxPublicationYear) {
        maxPublicationYear = pubYear;
      }
      let yb = yearBuckets.get(pubYear);
      if (!yb) {
        yb = {
          totalDocuments: 0,
          bindingDocuments: 0,
          byJurisdiction: Object.fromEntries(
            SCORING_JURISDICTION_ORDER.map((j) => [j, 0]),
          ),
          frameWeighted: new Map(),
        };
        yearBuckets.set(pubYear, yb);
      }
      yb.totalDocuments += 1;
      if (doc.bindingStrength === "binding_law") yb.bindingDocuments += 1;
      yb.byJurisdiction[doc.jurisdiction] =
        (yb.byJurisdiction[doc.jurisdiction] ?? 0) + 1;
      for (const [frame, share] of docFrames.entries()) {
        yb.frameWeighted.set(frame, (yb.frameWeighted.get(frame) ?? 0) + share);
      }

      const jurMap = jurYearBuckets.get(doc.jurisdiction)!;
      let jyb = jurMap.get(pubYear);
      if (!jyb) {
        jyb = {
          totalDocuments: 0,
          bindingDocuments: 0,
          byJurisdiction: { [doc.jurisdiction]: 0 },
          frameWeighted: new Map(),
        };
        jurMap.set(pubYear, jyb);
      }
      jyb.totalDocuments += 1;
      if (doc.bindingStrength === "binding_law") jyb.bindingDocuments += 1;
      jyb.byJurisdiction[doc.jurisdiction] =
        (jyb.byJurisdiction[doc.jurisdiction] ?? 0) + 1;
      for (const [frame, share] of docFrames.entries()) {
        jyb.frameWeighted.set(frame, (jyb.frameWeighted.get(frame) ?? 0) + share);
      }
    }
  }

  // Per-jurisdiction outputs
  const byJurisdiction = new Map<JurisdictionKey, JurisdictionScoreOutput>();
  for (const j of SCORING_JURISDICTION_ORDER) {
    const list = docsByJur.get(j) ?? [];
    const reqRawCounts = new Map<string, number>();
    const enfRawCounts = new Map<string, number>();
    const bindRawCounts = new Map<string, number>();
    let bindingLawCount = 0;
    let lowConfidenceCount = 0;
    let jurLatestPub = 0;
    let jurLatestAnalyzed = 0;

    for (const doc of list) {
      if (doc.bindingStrength === "binding_law") bindingLawCount += 1;
      if (isLowConfidenceDocument(doc)) lowConfidenceCount += 1;
      const pTs = parseTimestamp(doc.publicationDate);
      const aTs = parseTimestamp(doc.machineCreatedAt);
      if (pTs > jurLatestPub) jurLatestPub = pTs;
      if (aTs > jurLatestAnalyzed) jurLatestAnalyzed = aTs;

      for (const req of new Set(doc.safetyRequirements.map((r) => r.label).filter(Boolean))) {
        reqRawCounts.set(req, (reqRawCounts.get(req) ?? 0) + 1);
      }
      for (const enf of new Set(doc.enforcementMechanisms.map((e) => e.label).filter(Boolean))) {
        enfRawCounts.set(enf, (enfRawCounts.get(enf) ?? 0) + 1);
      }
      const bKey = doc.bindingStrength?.trim() || "unclassified";
      bindRawCounts.set(bKey, (bindRawCounts.get(bKey) ?? 0) + 1);
    }

    const rawPolicyDivergence = core.polByJur.get(j) ?? 0;
    const rawFramingDivergence = core.frmByJur.get(j) ?? 0;
    const rawCompositeExact =
      rawPolicyDivergence * COMPOSITE_WEIGHTS.policy +
      rawFramingDivergence * COMPOSITE_WEIGHTS.framing;
    const rawCompositeDivergence = round2(rawCompositeExact);
    const coverageDivergence = Math.round(core.covByJur.get(j) ?? 0);

    const frameProfile = core.frameProfiles.get(j) ?? new Map<string, number>();
    const frameMix = hamiltonRound(
      SCORING_FRAME_LABELS.map((label) => ({
        label,
        value: frameProfile.get(label) ?? 0,
      })),
    );
    const dominantFrame =
      [...SCORING_FRAME_LABELS].sort((a, b) => {
        const diff = (frameProfile.get(b) ?? 0) - (frameProfile.get(a) ?? 0);
        return diff !== 0 ? diff : a.localeCompare(b);
      })[0] ?? "innovation_enablement";

    const requirementShares = buildLabelShares(
      core.reqProfiles.get(j) ?? new Map(),
      reqRawCounts,
      17,
    );
    const enforcementShares = buildLabelShares(
      core.enfProfiles.get(j) ?? new Map(),
      enfRawCounts,
      9,
    );
    const bindingShares = buildLabelShares(
      core.bindProfiles.get(j) ?? new Map(),
      bindRawCounts,
      6,
    );

    const cis = bootstrapCIs.get(j)!;

    byJurisdiction.set(j, {
      jurisdiction: j,
      documentCount: list.length,
      totalCorpusCount: totalCountsByJur.get(j) ?? 0,
      bindingLawCount,
      lowConfidenceCount,
      latestPublicationTimestamp: jurLatestPub,
      lastAnalyzedTimestamp: jurLatestAnalyzed,
      rawPolicyDivergence,
      rawFramingDivergence,
      rawCompositeDivergence,
      policyDivergence: Math.round(rawPolicyDivergence),
      framingDivergence: Math.round(rawFramingDivergence),
      compositeDivergence: Math.round(rawCompositeExact),
      coverageDivergence,
      policyCI: cis.pol,
      framingCI: cis.frm,
      compositeCI: cis.cmp,
      coverageCI: cis.cov,
      policyBreakdown: core.breakdownByJur.get(j) ?? {
        requirements: 0,
        enforcement: 0,
        binding: 0,
      },
      dominantFrame,
      frameMix,
      topRequirementLabels: requirementShares.slice(0, 3).map((s) => s.label),
      distinctiveGaps: computeDistinctiveGaps(j, core),
      requirementShares,
      enforcementShares,
      bindingShares,
      obligationLevels: core.obligationLevels.get(j) ?? {},
    });
  }

  // Pairwise matrix + bilateral details
  const pairwiseDetails: PairwiseDetail[] = [];
  const matrix: string[][] = SCORING_JURISDICTION_ORDER.map((left) =>
    SCORING_JURISDICTION_ORDER.map((right) => {
      if (left === right) return "-";
      const dReq =
        totalVariationDistance(
          core.reqProfiles.get(left)!,
          core.reqProfiles.get(right)!,
        ) * 100;
      const dEnf =
        totalVariationDistance(
          core.enfProfiles.get(left)!,
          core.enfProfiles.get(right)!,
        ) * 100;
      const dBind =
        totalVariationDistance(
          core.bindProfiles.get(left)!,
          core.bindProfiles.get(right)!,
        ) * 100;
      const pExact =
        dReq * POLICY_COMPONENT_WEIGHTS.requirements +
        dEnf * POLICY_COMPONENT_WEIGHTS.enforcement +
        dBind * POLICY_COMPONENT_WEIGHTS.binding;
      const fExact =
        totalVariationDistance(
          core.frameProfiles.get(left)!,
          core.frameProfiles.get(right)!,
        ) * 100;
      const cExact =
        pExact * COMPOSITE_WEIGHTS.policy + fExact * COMPOSITE_WEIGHTS.framing;
      const covExact = coverageL1Distance(
        core.obligationLevels.get(left)!,
        core.obligationLevels.get(right)!,
      );
      const policyDistance = Math.round(pExact);
      const framingDistance = Math.round(fExact);
      const compositeDistance = Math.round(cExact);

      pairwiseDetails.push({
        leftSlug: SLUG_BY_KEY[left],
        rightSlug: SLUG_BY_KEY[right],
        policyDistance,
        framingDistance,
        compositeDistance,
        coverageDistance: Math.round(covExact),
        decouplingGap: policyDistance - framingDistance,
        policyBreakdown: {
          requirements: Math.round(dReq),
          enforcement: Math.round(dEnf),
          binding: Math.round(dBind),
        },
      });

      return String(compositeDistance);
    }),
  );

  const mapYearBuckets = (source: Map<number, YearBucket>): YearlyTimelinePoint[] =>
    [...source.entries()]
      .sort(([yearA], [yearB]) => yearA - yearB)
      .map(([year, yb]) => {
        const roundedFrames = hamiltonRound(
          SCORING_FRAME_LABELS.map((label) => ({
            label,
            value: yb.frameWeighted.get(label) ?? 0,
          })),
        );
        const frameShares = Object.fromEntries(
          roundedFrames.map((item) => [item.label, item.value]),
        ) as Record<FrameLabel, number>;
        const dominantFrame =
          [...SCORING_FRAME_LABELS].sort(
            (a, b) => (yb.frameWeighted.get(b) ?? 0) - (yb.frameWeighted.get(a) ?? 0),
          )[0] ?? "innovation_enablement";
        return {
          year,
          totalDocuments: yb.totalDocuments,
          bindingDocuments: yb.bindingDocuments,
          byJurisdiction: yb.byJurisdiction,
          frameShares,
          dominantFrame,
        };
      });

  const timeline = mapYearBuckets(yearBuckets);
  const timelineByJurisdiction: Record<string, YearlyTimelinePoint[]> = {};
  for (const j of SCORING_JURISDICTION_ORDER) {
    timelineByJurisdiction[j] = mapYearBuckets(jurYearBuckets.get(j)!);
  }

  const findings = buildDynamicFindings(
    byJurisdiction,
    pairwiseDetails,
    mode,
    includeSubnational,
  );

  return {
    mode,
    includedDocumentCount: activeDocs.length,
    byJurisdiction,
    matrix,
    pairwiseDetails,
    nullCalibration,
    findings,
    sensitivityGrid,
    timeline,
    timelineByJurisdiction,
    minPublicationYear,
    maxPublicationYear,
    latestPublicationTimestamp,
    latestAnalyzedTimestamp,
  };
}
