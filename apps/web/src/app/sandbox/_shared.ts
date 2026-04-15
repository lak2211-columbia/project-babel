import type { FrameLabel } from "@/lib/seed-data";

export const VARIATIONS = [
  {
    slug: "v1-terminal",
    label: "V1 · Terminal",
    tagline: "Density-first. Everything above the fold. Power users.",
  },
  {
    slug: "v2-atlas",
    label: "V2 · Atlas",
    tagline: "Spatial. Lead with the comparative geography.",
  },
  {
    slug: "v3-matrix",
    label: "V3 · Matrix",
    tagline: "Heatmap as hero. Editorial. Cross-country structure.",
  },
  {
    slug: "v4-stream",
    label: "V4 · Stream",
    tagline: "Feed-driven. 'What changed.' Analyst daily check-in.",
  },
  {
    slug: "v5-workbench",
    label: "V5 · Workbench",
    tagline: "IDE three-pane. Reviewer-first. High throughput.",
  },
] as const;

export type VariationSlug = (typeof VARIATIONS)[number]["slug"];

export const frameHue: Record<FrameLabel, string> = {
  existential_catastrophic: "#d64b7d",
  national_security: "#c75146",
  fundamental_rights: "#2f6eba",
  economic_competitiveness: "#c98a2b",
  innovation_enablement: "#2f8872",
  social_stability: "#7a4ea8",
  consumer_public_safety: "#2a8aa5",
  labor_transition: "#7f8f2a",
};

export const frameShort: Record<FrameLabel, string> = {
  existential_catastrophic: "Catastroph.",
  national_security: "Security",
  fundamental_rights: "Rights",
  economic_competitiveness: "Competit.",
  innovation_enablement: "Innov.",
  social_stability: "Stability",
  consumer_public_safety: "Safety",
  labor_transition: "Labor",
};

// Three-letter abbreviations for tight axis labels (histograms, matrices).
export const frameAbbr: Record<FrameLabel, string> = {
  existential_catastrophic: "XRS",
  national_security: "SEC",
  fundamental_rights: "RGT",
  economic_competitiveness: "ECO",
  innovation_enablement: "INV",
  social_stability: "SOC",
  consumer_public_safety: "SAF",
  labor_transition: "LAB",
};

// Standardized, jurisdiction-neutral definitions for each risk framing label.
// These are the working vocabulary all five jurisdictions are coded against,
// derived from the observatory codebook (docs/research/codebook.md).
export const frameDefinition: Record<
  FrameLabel,
  { short: string; long: string; example: string }
> = {
  existential_catastrophic: {
    short: "Talks about AI as a source of extreme or systemic catastrophe.",
    long: "Used when a document explains its rules through loss-of-control scenarios, severe systemic accidents, catastrophic misuse, or civilizational-scale harm.",
    example: "Frontier-model controls tied to CBRN misuse, autonomous escalation, or loss-of-control concerns.",
  },
  national_security: {
    short: "Talks about AI as a defense or intelligence issue.",
    long: "Used when a document explains its rules through defense, intelligence, critical infrastructure, or keeping capability away from foreign rivals.",
    example: "Export controls on advanced chips, military-use directives, foreign-investment screening.",
  },
  fundamental_rights: {
    short: "Talks about AI as a risk to people's rights.",
    long: "Used when a document explains its rules through protection of individual rights — non-discrimination, privacy, dignity, due process, or the right to a remedy.",
    example: "Bans on discriminatory hiring tools, biometric surveillance limits, GDPR-linked obligations.",
  },
  economic_competitiveness: {
    short: "Talks about AI as a matter of jobs, trade, and industry.",
    long: "Used when a document explains its rules through economic position — productivity, trade, industrial policy, workforce capacity, or firm-level advantage.",
    example: "National AI strategies tied to GDP targets, industrial-promotion acts, workforce reskilling plans.",
  },
  innovation_enablement: {
    short: "Argues rules should stay light so deployment isn't slowed.",
    long: "Used when a document argues that safeguards should be proportional, voluntary, or deferred so that research, experimentation, and deployment can proceed.",
    example: "Regulatory sandboxes, soft-law codes of conduct, voluntary commitments from frontier labs.",
  },
  social_stability: {
    short: "Talks about AI as a threat to public order and trust.",
    long: "Used when a document explains its rules through public order, information environment, trust in institutions, or social cohesion — disinformation, manipulation, rumor.",
    example: "Synthetic-media labeling rules, recommendation-system oversight, election-period restrictions.",
  },
  consumer_public_safety: {
    short: "Talks about AI as a product-safety issue.",
    long: "Used when a document explains its rules through consumer or bystander protection — defects, deceptive design, physical or economic harm, duties of care.",
    example: "Recall and labeling regimes, medical-device rules, deceptive-design prohibitions.",
  },
  labor_transition: {
    short: "Talks about AI as a workforce and adjustment issue.",
    long: "Used when a document explains its rules through job displacement, worker retraining, labor-market disruption, or the distributional effects of automation.",
    example: "Workforce transition plans, retraining funds, job-quality protections, or automation-impact assessments.",
  },
};

export function scoreBand(score: number) {
  if (score >= 65) return "high";
  if (score >= 45) return "mid";
  return "low";
}

export function scoreHexLight(score: number) {
  const band = scoreBand(score);
  if (band === "high") return "#d95b4d";
  if (band === "mid") return "#d7a623";
  return "#1f9d73";
}

export function scoreHexDark(score: number) {
  const band = scoreBand(score);
  if (band === "high") return "#ff6b6b";
  if (band === "mid") return "#f5a623";
  return "#29d391";
}

export function monoNum(n: number, width = 2) {
  return String(n).padStart(width, "0");
}
