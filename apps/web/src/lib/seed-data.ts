export type FrameLabel =
  | "existential_catastrophic"
  | "national_security"
  | "fundamental_rights"
  | "economic_competitiveness"
  | "innovation_enablement"
  | "social_stability"
  | "consumer_public_safety"
  | "labor_transition";

export const allFrameLabels: FrameLabel[] = [
  "existential_catastrophic",
  "national_security",
  "fundamental_rights",
  "economic_competitiveness",
  "innovation_enablement",
  "social_stability",
  "consumer_public_safety",
  "labor_transition",
];

/**
 * Canonical scoring modes (A3):
 * - "headline": Codebook §8.2 — strictly filtered to active / adopted primary instruments
 * - "all": full corpus equally weighted (includes companion resources, drafts, historical baselines)
 */
export type ScoringMode = "headline" | "all";

export type ConfidenceInterval = {
  low: number;
  high: number;
};

export type PolicyBreakdown = {
  requirements: number;
  enforcement: number;
  binding: number;
};

export type LabelShare = {
  label: string;
  share: number; // 0..100 integer share
  count: number;
};

export type DistinctiveGap = {
  dimension: "requirement" | "enforcement" | "binding" | "frame";
  key: string;
  label: string;
  ownShare: number;
  peerShare: number;
  delta: number; // ownShare - peerShare (percentage points)
};

export type NullCalibration = {
  permutations: number;
  countryPolicyMean: number;
  countryPolicyP90: number;
  countryFramingMean: number;
  countryFramingP90: number;
  countryCompositeMean: number;
  countryCompositeP90: number;
  pairwisePolicyMean: number;
  pairwisePolicyP90: number;
  pairwiseFramingMean: number;
  pairwiseFramingP90: number;
  pairwiseCompositeMean: number;
  pairwiseCompositeP90: number;
};

export type HeadlineFinding = {
  id: string;
  kicker: string;
  headline: string;
  detail: string;
  href: string;
  hrefLabel: string;
};

export type ProvenanceSummary = {
  totalAnalyzed: number;
  headlineIncluded: number;
  legacyCount: number;
  v2Count: number;
  taxonomyVersions: string[];
  models: string[];
  meanGroundingRatio: number | null;
  groundingSampleCount: number;
};

export type SensitivityModeRow = {
  modeId: "headline" | "binding_weighted" | "coverage_l1" | "all";
  label: string;
  description: string;
  scoresByJurisdiction: Record<string, number>;
  spearmanVsHeadline: number;
};

export type CountrySnapshot = {
  slug: string;
  name: string;
  shortName: string;
  flagUrl: string;
  /** Number of documents included in this scoring mode. */
  reviewedDocuments: number;
  /** Total analyzed documents in the full corpus for this jurisdiction. */
  totalCorpusDocuments: number;
  bindingLawCount: number;
  lowConfidenceCount: number;
  latestPublicationDate: string;
  lastAnalyzedDate: string;
  lastUpdated: string;
  policyDivergence: number;
  framingDivergence: number;
  compositeDivergence: number;
  coverageDivergence: number;
  rawPolicyDivergence: number;
  rawFramingDivergence: number;
  rawCompositeDivergence: number;
  policyCI: ConfidenceInterval;
  framingCI: ConfidenceInterval;
  compositeCI: ConfidenceInterval;
  coverageCI: ConfidenceInterval;
  policyBreakdown: PolicyBreakdown;
  dominantFrame: FrameLabel;
  requirements: string[];
  distinctiveGaps: DistinctiveGap[];
  requirementShares: LabelShare[];
  enforcementShares: LabelShare[];
  bindingShares: LabelShare[];
  /** Strongest binding level (0..4) per requirement & enforcement control key. */
  obligationLevels: Record<string, number>;
  rationale: string;
  frameMix: {
    label: FrameLabel;
    value: number;
  }[];
};

export type PairwiseDetail = {
  leftSlug: string;
  rightSlug: string;
  policyDistance: number;
  framingDistance: number;
  compositeDistance: number;
  coverageDistance: number;
  decouplingGap: number; // policyDistance - framingDistance
  policyBreakdown: PolicyBreakdown;
};

export type YearlyTimelinePoint = {
  year: number;
  totalDocuments: number;
  bindingDocuments: number;
  byJurisdiction: Record<string, number>;
  frameShares: Record<FrameLabel, number>;
  dominantFrame: FrameLabel;
};

export type QueueDocument = {
  id: string;
  title: string;
  jurisdiction: string;
  jurisdictionSlug: string;
  documentType: string;
  bindingStrength: string;
  dominantFrame: FrameLabel;
  publicationDate: string;
  updatedAt: string;
};

export type OverviewData = {
  hasData: boolean;
  datasetLabel: string;
  scoringMode: ScoringMode;
  /** Honest taxonomy version reflected by actual artifacts ("1.0-legacy", "2.1.0", or "mixed"). */
  taxonomyVersion: string;
  /** Dataset analysis snapshot version (distinct from latest source publication date). */
  datasetVersion: string;
  snapshotDate: string;
  lastAnalyzedDate: string;
  corpusWindow: {
    startYear: number | null;
    endYear: number | null;
    label: string;
  };
  provenanceSummary: ProvenanceSummary;
  nullCalibration: NullCalibration;
  findings: HeadlineFinding[];
  sensitivityGrid: SensitivityModeRow[];
  summary: {
    publishedSources: number;
    reviewedOutputs: number;
    headlineDocuments: number;
    bindingInstruments: number;
    lowConfidenceOutputs: number;
    compositeDivergence: number;
    hiddenFaultLine: string;
  };
  countries: CountrySnapshot[];
  matrix: string[][];
  pairwiseDetails: PairwiseDetail[];
  timeline: YearlyTimelinePoint[];
  timelineByJurisdiction?: Record<string, YearlyTimelinePoint[]>;
  queue: QueueDocument[];
};

export const frameLabels: Record<FrameLabel, string> = {
  existential_catastrophic: "Existential & catastrophic risk",
  national_security: "National security",
  fundamental_rights: "Fundamental rights",
  economic_competitiveness: "Economic competitiveness",
  innovation_enablement: "Innovation enablement",
  social_stability: "Social stability & public order",
  consumer_public_safety: "Consumer & public safety",
  labor_transition: "Labor & workforce transition",
};

export const matrixLabels = ["US", "EU", "KR", "JP", "CN"];

/** Explicit empty production snapshot returned when Vercel has no loaded DB data (A1). */
export function buildEmptyOverviewData(
  mode: ScoringMode,
  datasetLabel = "No observatory data loaded",
): OverviewData {
  return {
    hasData: false,
    datasetLabel,
    scoringMode: mode,
    taxonomyVersion: "unloaded",
    datasetVersion: "unloaded",
    snapshotDate: "No data loaded",
    lastAnalyzedDate: "No data loaded",
    corpusWindow: { startYear: null, endYear: null, label: "No data" },
    provenanceSummary: {
      totalAnalyzed: 0,
      headlineIncluded: 0,
      legacyCount: 0,
      v2Count: 0,
      taxonomyVersions: [],
      models: [],
      meanGroundingRatio: null,
      groundingSampleCount: 0,
    },
    nullCalibration: {
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
    },
    findings: [],
    sensitivityGrid: [],
    summary: {
      publishedSources: 0,
      reviewedOutputs: 0,
      headlineDocuments: 0,
      bindingInstruments: 0,
      lowConfidenceOutputs: 0,
      compositeDivergence: 0,
      hiddenFaultLine: "No data loaded",
    },
    countries: [],
    matrix: [],
    pairwiseDetails: [],
    timeline: [],
    timelineByJurisdiction: {},
    queue: [],
  };
}

/**
 * Deterministic, mathematically consistent fallback dataset used ONLY in local
 * development when neither Postgres nor local `data/` has documents.
 * NEVER served on Vercel deployments (A1).
 */
export const seedData: OverviewData = {
  hasData: true,
  datasetLabel: "Local seed dataset (development only)",
  scoringMode: "headline",
  taxonomyVersion: "2.1.0",
  datasetVersion: "2026-04-15 (dev seed)",
  snapshotDate: "April 10, 2026",
  lastAnalyzedDate: "April 15, 2026",
  corpusWindow: {
    startYear: 2017,
    endYear: 2026,
    label: "2017 – 2026",
  },
  provenanceSummary: {
    totalAnalyzed: 62,
    headlineIncluded: 62,
    legacyCount: 0,
    v2Count: 62,
    taxonomyVersions: ["2.1.0"],
    models: ["claude-sonnet-4-6"],
    meanGroundingRatio: 0.94,
    groundingSampleCount: 62,
  },
  nullCalibration: {
    permutations: 200,
    countryPolicyMean: 18,
    countryPolicyP90: 25,
    countryFramingMean: 14,
    countryFramingP90: 21,
    countryCompositeMean: 16,
    countryCompositeP90: 22,
    pairwisePolicyMean: 24,
    pairwisePolicyP90: 34,
    pairwiseFramingMean: 19,
    pairwiseFramingP90: 28,
    pairwiseCompositeMean: 22,
    pairwiseCompositeP90: 31,
  },
  findings: [],
  sensitivityGrid: [],
  summary: {
    publishedSources: 62,
    reviewedOutputs: 62,
    headlineDocuments: 62,
    bindingInstruments: 18,
    lowConfidenceOutputs: 4,
    compositeDivergence: 24,
    hiddenFaultLine: "US / CN",
  },
  countries: [
    {
      slug: "united-states",
      name: "United States",
      shortName: "US",
      flagUrl: "/flags/us.png",
      reviewedDocuments: 12,
      totalCorpusDocuments: 12,
      bindingLawCount: 1,
      lowConfidenceCount: 1,
      latestPublicationDate: "August 18, 2025",
      lastAnalyzedDate: "April 15, 2026",
      lastUpdated: "August 18, 2025",
      policyDivergence: 33,
      framingDivergence: 19,
      compositeDivergence: 27,
      coverageDivergence: 28,
      rawPolicyDivergence: 33,
      rawFramingDivergence: 19,
      rawCompositeDivergence: 27.4,
      policyCI: { low: 24, high: 42 },
      framingCI: { low: 12, high: 27 },
      compositeCI: { low: 20, high: 35 },
      coverageCI: { low: 20, high: 36 },
      policyBreakdown: { requirements: 19, enforcement: 32, binding: 59 },
      dominantFrame: "consumer_public_safety",
      requirements: ["Risk assessment", "Transparency & disclosure", "Human oversight"],
      distinctiveGaps: [
        {
          dimension: "binding",
          key: "executive_action",
          label: "Executive action",
          ownShare: 33,
          peerShare: 4,
          delta: 29,
        },
      ],
      requirementShares: [
        { label: "risk_assessment", share: 22, count: 9 },
        { label: "transparency_disclosure", share: 19, count: 8 },
        { label: "human_oversight", share: 15, count: 6 },
      ],
      enforcementShares: [
        { label: "soft_enforcement", share: 48, count: 7 },
        { label: "procurement_condition", share: 22, count: 3 },
        { label: "regulatory_supervision", share: 18, count: 2 },
      ],
      bindingShares: [
        { label: "standards_guideline", share: 38, count: 4 },
        { label: "regulatory_guidance", share: 32, count: 4 },
        { label: "executive_action", share: 30, count: 4 },
      ],
      obligationLevels: { risk_assessment: 3, transparency_disclosure: 3 },
      rationale:
        "Consumer & public safety is the leading framing signal across 12 active primary instruments.",
      frameMix: [
        { label: "existential_catastrophic", value: 2 },
        { label: "national_security", value: 9 },
        { label: "fundamental_rights", value: 17 },
        { label: "economic_competitiveness", value: 12 },
        { label: "innovation_enablement", value: 18 },
        { label: "social_stability", value: 6 },
        { label: "consumer_public_safety", value: 33 },
        { label: "labor_transition", value: 3 },
      ],
    },
    {
      slug: "european-union",
      name: "European Union",
      shortName: "EU",
      flagUrl: "/flags/eu.png",
      reviewedDocuments: 11,
      totalCorpusDocuments: 11,
      bindingLawCount: 5,
      lowConfidenceCount: 1,
      latestPublicationDate: "March 20, 2026",
      lastAnalyzedDate: "April 15, 2026",
      lastUpdated: "March 20, 2026",
      policyDivergence: 19,
      framingDivergence: 27,
      compositeDivergence: 22,
      coverageDivergence: 24,
      rawPolicyDivergence: 19,
      rawFramingDivergence: 27,
      rawCompositeDivergence: 22.2,
      policyCI: { low: 13, high: 27 },
      framingCI: { low: 19, high: 35 },
      compositeCI: { low: 16, high: 29 },
      coverageCI: { low: 16, high: 32 },
      policyBreakdown: { requirements: 16, enforcement: 26, binding: 17 },
      dominantFrame: "fundamental_rights",
      requirements: ["Transparency & disclosure", "Model documentation", "Risk assessment"],
      distinctiveGaps: [
        {
          dimension: "frame",
          key: "fundamental_rights",
          label: "Fundamental rights",
          ownShare: 38,
          peerShare: 19,
          delta: 19,
        },
      ],
      requirementShares: [
        { label: "transparency_disclosure", share: 21, count: 9 },
        { label: "model_documentation", share: 18, count: 8 },
        { label: "risk_assessment", share: 17, count: 8 },
      ],
      enforcementShares: [
        { label: "regulatory_supervision", share: 36, count: 7 },
        { label: "civil_penalty", share: 28, count: 5 },
        { label: "market_access_restriction", share: 18, count: 3 },
      ],
      bindingShares: [
        { label: "binding_law", share: 45, count: 5 },
        { label: "regulatory_guidance", share: 36, count: 4 },
        { label: "voluntary_commitment", share: 19, count: 2 },
      ],
      obligationLevels: { risk_assessment: 4, transparency_disclosure: 4 },
      rationale:
        "Fundamental rights is the leading framing signal across 11 active primary instruments.",
      frameMix: [
        { label: "existential_catastrophic", value: 3 },
        { label: "national_security", value: 3 },
        { label: "fundamental_rights", value: 38 },
        { label: "economic_competitiveness", value: 5 },
        { label: "innovation_enablement", value: 16 },
        { label: "social_stability", value: 5 },
        { label: "consumer_public_safety", value: 28 },
        { label: "labor_transition", value: 2 },
      ],
    },
    {
      slug: "south-korea",
      name: "South Korea",
      shortName: "KR",
      flagUrl: "/flags/kr.png",
      reviewedDocuments: 11,
      totalCorpusDocuments: 11,
      bindingLawCount: 4,
      lowConfidenceCount: 0,
      latestPublicationDate: "February 27, 2026",
      lastAnalyzedDate: "April 15, 2026",
      lastUpdated: "February 27, 2026",
      policyDivergence: 20,
      framingDivergence: 14,
      compositeDivergence: 18,
      coverageDivergence: 19,
      rawPolicyDivergence: 20,
      rawFramingDivergence: 14,
      rawCompositeDivergence: 17.6,
      policyCI: { low: 13, high: 28 },
      framingCI: { low: 8, high: 22 },
      compositeCI: { low: 12, high: 24 },
      coverageCI: { low: 12, high: 27 },
      policyBreakdown: { requirements: 12, enforcement: 23, binding: 29 },
      dominantFrame: "fundamental_rights",
      requirements: ["Transparency & disclosure", "Risk assessment", "Human oversight"],
      distinctiveGaps: [
        {
          dimension: "frame",
          key: "fundamental_rights",
          label: "Fundamental rights",
          ownShare: 30,
          peerShare: 21,
          delta: 9,
        },
      ],
      requirementShares: [
        { label: "transparency_disclosure", share: 20, count: 9 },
        { label: "risk_assessment", share: 19, count: 8 },
        { label: "human_oversight", share: 16, count: 7 },
      ],
      enforcementShares: [
        { label: "regulatory_supervision", share: 34, count: 6 },
        { label: "soft_enforcement", share: 30, count: 5 },
        { label: "civil_penalty", share: 20, count: 3 },
      ],
      bindingShares: [
        { label: "binding_law", share: 36, count: 4 },
        { label: "regulatory_guidance", share: 45, count: 5 },
        { label: "strategy_statement", share: 19, count: 2 },
      ],
      obligationLevels: { risk_assessment: 4, transparency_disclosure: 4 },
      rationale:
        "Fundamental rights is the leading framing signal across 11 active primary instruments.",
      frameMix: [
        { label: "existential_catastrophic", value: 2 },
        { label: "national_security", value: 5 },
        { label: "fundamental_rights", value: 30 },
        { label: "economic_competitiveness", value: 9 },
        { label: "innovation_enablement", value: 16 },
        { label: "social_stability", value: 8 },
        { label: "consumer_public_safety", value: 27 },
        { label: "labor_transition", value: 3 },
      ],
    },
    {
      slug: "japan",
      name: "Japan",
      shortName: "JP",
      flagUrl: "/flags/jp.png",
      reviewedDocuments: 15,
      totalCorpusDocuments: 15,
      bindingLawCount: 2,
      lowConfidenceCount: 1,
      latestPublicationDate: "March 25, 2026",
      lastAnalyzedDate: "April 15, 2026",
      lastUpdated: "March 25, 2026",
      policyDivergence: 21,
      framingDivergence: 30,
      compositeDivergence: 25,
      coverageDivergence: 22,
      rawPolicyDivergence: 21,
      rawFramingDivergence: 30,
      rawCompositeDivergence: 24.6,
      policyCI: { low: 14, high: 28 },
      framingCI: { low: 21, high: 38 },
      compositeCI: { low: 18, high: 31 },
      coverageCI: { low: 15, high: 29 },
      policyBreakdown: { requirements: 15, enforcement: 28, binding: 25 },
      dominantFrame: "innovation_enablement",
      requirements: ["Transparency & disclosure", "Risk assessment", "Human oversight"],
      distinctiveGaps: [
        {
          dimension: "frame",
          key: "innovation_enablement",
          label: "Innovation enablement",
          ownShare: 30,
          peerShare: 15,
          delta: 15,
        },
      ],
      requirementShares: [
        { label: "transparency_disclosure", share: 19, count: 11 },
        { label: "risk_assessment", share: 18, count: 10 },
        { label: "human_oversight", share: 16, count: 9 },
      ],
      enforcementShares: [
        { label: "soft_enforcement", share: 56, count: 9 },
        { label: "none_specified", share: 24, count: 4 },
        { label: "regulatory_supervision", share: 20, count: 3 },
      ],
      bindingShares: [
        { label: "regulatory_guidance", share: 47, count: 7 },
        { label: "voluntary_commitment", share: 33, count: 5 },
        { label: "strategy_statement", share: 20, count: 3 },
      ],
      obligationLevels: { risk_assessment: 2, transparency_disclosure: 2 },
      rationale:
        "Innovation enablement is the leading framing signal across 15 active primary instruments.",
      frameMix: [
        { label: "existential_catastrophic", value: 1 },
        { label: "national_security", value: 4 },
        { label: "fundamental_rights", value: 17 },
        { label: "economic_competitiveness", value: 16 },
        { label: "innovation_enablement", value: 30 },
        { label: "social_stability", value: 8 },
        { label: "consumer_public_safety", value: 19 },
        { label: "labor_transition", value: 5 },
      ],
    },
    {
      slug: "china",
      name: "China",
      shortName: "CN",
      flagUrl: "/flags/cn.png",
      reviewedDocuments: 13,
      totalCorpusDocuments: 13,
      bindingLawCount: 6,
      lowConfidenceCount: 1,
      latestPublicationDate: "April 10, 2026",
      lastAnalyzedDate: "April 15, 2026",
      lastUpdated: "April 10, 2026",
      policyDivergence: 23,
      framingDivergence: 36,
      compositeDivergence: 28,
      coverageDivergence: 31,
      rawPolicyDivergence: 23,
      rawFramingDivergence: 36,
      rawCompositeDivergence: 28.2,
      policyCI: { low: 16, high: 31 },
      framingCI: { low: 27, high: 45 },
      compositeCI: { low: 21, high: 35 },
      coverageCI: { low: 22, high: 40 },
      policyBreakdown: { requirements: 17, enforcement: 23, binding: 34 },
      dominantFrame: "social_stability",
      requirements: ["Transparency & disclosure", "Risk assessment", "Registration or licensing"],
      distinctiveGaps: [
        {
          dimension: "frame",
          key: "social_stability",
          label: "Social stability & public order",
          ownShare: 29,
          peerShare: 7,
          delta: 22,
        },
      ],
      requirementShares: [
        { label: "transparency_disclosure", share: 19, count: 10 },
        { label: "risk_assessment", share: 17, count: 9 },
        { label: "registration_licensing", share: 16, count: 8 },
      ],
      enforcementShares: [
        { label: "regulatory_supervision", share: 38, count: 8 },
        { label: "licensing_requirement", share: 24, count: 5 },
        { label: "civil_penalty", share: 22, count: 5 },
      ],
      bindingShares: [
        { label: "binding_law", share: 46, count: 6 },
        { label: "regulatory_guidance", share: 38, count: 5 },
        { label: "standards_guideline", share: 16, count: 2 },
      ],
      obligationLevels: {
        risk_assessment: 4,
        transparency_disclosure: 4,
        registration_licensing: 4,
      },
      rationale:
        "Social stability & public order is the leading framing signal across 13 active primary instruments.",
      frameMix: [
        { label: "existential_catastrophic", value: 3 },
        { label: "national_security", value: 10 },
        { label: "fundamental_rights", value: 12 },
        { label: "economic_competitiveness", value: 7 },
        { label: "innovation_enablement", value: 12 },
        { label: "social_stability", value: 29 },
        { label: "consumer_public_safety", value: 24 },
        { label: "labor_transition", value: 3 },
      ],
    },
  ],
  matrix: [
    ["-", "31", "31", "26", "38"],
    ["31", "-", "16", "30", "28"],
    ["31", "16", "-", "26", "22"],
    ["26", "30", "26", "-", "36"],
    ["38", "28", "22", "36", "-"],
  ],
  pairwiseDetails: [],
  timeline: [],
  timelineByJurisdiction: {},
  queue: [],
};
