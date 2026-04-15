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

export type CountrySnapshot = {
  slug: string;
  name: string;
  shortName: string;
  flagUrl: string;
  reviewedDocuments: number;
  documentsInQueue: number;
  lastUpdated: string;
  policyDivergence: number;
  framingDivergence: number;
  compositeDivergence: number;
  dominantFrame: FrameLabel;
  requirements: string[];
  rationale: string;
  frameMix: {
    label: FrameLabel;
    value: number;
  }[];
};

export type QueueDocument = {
  title: string;
  jurisdiction: string;
  documentType: string;
  reviewState: "approved" | "review" | "draft";
  dominantFrame: FrameLabel;
  updatedAt: string;
};

export type OverviewData = {
  datasetLabel: string;
  snapshotDate: string;
  summary: {
    publishedSources: number;
    reviewedOutputs: number;
    reviewQueue: number;
    compositeDivergence: number;
    hiddenFaultLine: string;
  };
  countries: CountrySnapshot[];
  matrix: string[][];
  queue: QueueDocument[];
};

export const seedData: OverviewData = {
  datasetLabel: "Seed dataset for interface development",
  snapshotDate: "April 14, 2026",
  summary: {
    publishedSources: 182,
    reviewedOutputs: 182,
    reviewQueue: 0,
    compositeDivergence: 58,
    hiddenFaultLine: "United States / European Union",
  },
  countries: [
    {
      slug: "united-states",
      name: "United States",
      shortName: "US",
      flagUrl: "/flags/us.png",
      reviewedDocuments: 38,
      documentsInQueue: 0,
      lastUpdated: "April 10, 2026",
      policyDivergence: 58,
      framingDivergence: 73,
      compositeDivergence: 64,
      dominantFrame: "national_security",
      requirements: ["Red-teaming", "Procurement controls", "Reporting triggers"],
      rationale:
        "Security posture is strong, but the policy toolkit still leans on executive action and procurement leverage.",
      frameMix: [
        { label: "national_security", value: 46 },
        { label: "economic_competitiveness", value: 24 },
        { label: "innovation_enablement", value: 14 },
      ],
    },
    {
      slug: "european-union",
      name: "European Union",
      shortName: "EU",
      flagUrl: "/flags/eu.png",
      reviewedDocuments: 44,
      documentsInQueue: 0,
      lastUpdated: "April 12, 2026",
      policyDivergence: 66,
      framingDivergence: 38,
      compositeDivergence: 52,
      dominantFrame: "fundamental_rights",
      requirements: ["Risk assessment", "Conformity checks", "Transparency duties"],
      rationale:
        "The policy stack is comparatively mature and rights-forward, which narrows framing drift inside the bloc.",
      frameMix: [
        { label: "fundamental_rights", value: 42 },
        { label: "consumer_public_safety", value: 20 },
        { label: "innovation_enablement", value: 18 },
      ],
    },
    {
      slug: "south-korea",
      name: "South Korea",
      shortName: "KR",
      flagUrl: "/flags/kr.png",
      reviewedDocuments: 31,
      documentsInQueue: 0,
      lastUpdated: "April 9, 2026",
      policyDivergence: 29,
      framingDivergence: 54,
      compositeDivergence: 41,
      dominantFrame: "economic_competitiveness",
      requirements: ["Standards alignment", "Pilot safeguards", "Sector guidance"],
      rationale:
        "Industrial policy and export positioning are prominent, with lighter binding obligations than the EU or China.",
      frameMix: [
        { label: "economic_competitiveness", value: 40 },
        { label: "innovation_enablement", value: 26 },
        { label: "national_security", value: 12 },
      ],
    },
    {
      slug: "japan",
      name: "Japan",
      shortName: "JP",
      flagUrl: "/flags/jp.png",
      reviewedDocuments: 27,
      documentsInQueue: 0,
      lastUpdated: "April 8, 2026",
      policyDivergence: 24,
      framingDivergence: 48,
      compositeDivergence: 36,
      dominantFrame: "innovation_enablement",
      requirements: ["Voluntary guidance", "Documentation norms", "Human oversight"],
      rationale:
        "Soft-law coordination remains central, with risk framed as something to manage without slowing deployment.",
      frameMix: [
        { label: "innovation_enablement", value: 43 },
        { label: "economic_competitiveness", value: 22 },
        { label: "social_stability", value: 11 },
      ],
    },
    {
      slug: "china",
      name: "China",
      shortName: "CN",
      flagUrl: "/flags/cn.png",
      reviewedDocuments: 29,
      documentsInQueue: 0,
      lastUpdated: "April 11, 2026",
      policyDivergence: 63,
      framingDivergence: 78,
      compositeDivergence: 71,
      dominantFrame: "social_stability",
      requirements: ["Registration", "Security review", "Provider accountability"],
      rationale:
        "Governance logic is tightly bound to public-order control and system-level supervision.",
      frameMix: [
        { label: "social_stability", value: 48 },
        { label: "national_security", value: 23 },
        { label: "economic_competitiveness", value: 12 },
      ],
    },
  ] as CountrySnapshot[],
  matrix: [
    ["-", "48", "63", "58", "76"],
    ["48", "-", "55", "51", "69"],
    ["63", "55", "-", "34", "60"],
    ["58", "51", "34", "-", "57"],
    ["76", "69", "60", "57", "-"],
  ],
  queue: [
    {
      title: "Executive branch safety reporting memorandum",
      jurisdiction: "United States",
      documentType: "Executive action",
      reviewState: "approved",
      dominantFrame: "national_security",
      updatedAt: "April 13, 2026",
    },
    {
      title: "General-purpose model implementation note",
      jurisdiction: "European Union",
      documentType: "Regulatory guidance",
      reviewState: "approved",
      dominantFrame: "fundamental_rights",
      updatedAt: "April 12, 2026",
    },
    {
      title: "Industrial AI strategy revision",
      jurisdiction: "South Korea",
      documentType: "Strategy paper",
      reviewState: "draft",
      dominantFrame: "economic_competitiveness",
      updatedAt: "April 11, 2026",
    },
    {
      title: "Foundation model disclosure guidance",
      jurisdiction: "Japan",
      documentType: "Standards guideline",
      reviewState: "approved",
      dominantFrame: "innovation_enablement",
      updatedAt: "April 11, 2026",
    },
    {
      title: "Generative service security notice",
      jurisdiction: "China",
      documentType: "Regulatory guidance",
      reviewState: "approved",
      dominantFrame: "social_stability",
      updatedAt: "April 10, 2026",
    },
  ] as QueueDocument[],
};

export const frameLabels: Record<FrameLabel, string> = {
  existential_catastrophic: "Existential or catastrophic risk",
  national_security: "National security",
  fundamental_rights: "Fundamental rights",
  economic_competitiveness: "Economic competitiveness",
  innovation_enablement: "Innovation enablement",
  social_stability: "Social stability",
  consumer_public_safety: "Consumer and public safety",
  labor_transition: "Labor and economic transition",
};

export const matrixLabels = ["US", "EU", "KR", "JP", "CN"];
