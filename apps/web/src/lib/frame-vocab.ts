import type { FrameLabel } from "./seed-data";

/**
 * Shared vocabulary + visual helpers for the eight risk framing labels and
 * sequential single-hue divergence scales.
 * Definitions align with docs/research/codebook.md and data/taxonomies/label-definitions.json.
 */

/** Accent fill hue used for histogram bars, swatches, and top borders. */
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

/**
 * WCAG 2.1 AA (>= 4.5:1 on #0f1623 and #0a0f18) text-safe foreground
 * variants for each framing label.
 */
export const frameTextHue: Record<FrameLabel, string> = {
  existential_catastrophic: "#f27aa5",
  national_security: "#f07c70",
  fundamental_rights: "#6ea8f0",
  economic_competitiveness: "#e6ae49",
  innovation_enablement: "#4cc9a8",
  social_stability: "#b88ef0",
  consumer_public_safety: "#56c2e0",
  labor_transition: "#b4c94b",
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

// Three-letter axis codes used on histograms and compact tags.
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

/**
 * Standardized, jurisdiction-neutral definitions synced verbatim with
 * data/taxonomies/label-definitions.json (Taxonomy v2.1.0) and
 * docs/research/codebook.md (A13: workforce reskilling lives exclusively under
 * labor_transition, excluded from economic_competitiveness).
 */
export const frameDefinition: Record<
  FrameLabel,
  { short: string; long: string; includeWhen: string; excludeWhen: string; example: string }
> = {
  existential_catastrophic: {
    short: "Frames AI around severe, irreversible, or civilization-scale catastrophic harms.",
    long: "Frames AI governance around severe, irreversible, or civilization-scale harms such as CBRN proliferation, mass-casualty cyberattacks, uncontrollable autonomous AI, or extreme systemic loss of human control.",
    includeWhen:
      "The text explicitly cites catastrophic misuse (CBRN, mass cyber/bio harm), autonomous self-replication, loss of human control, or extreme systemic societal-scale accidents as a reason for rules.",
    excludeWhen:
      "Do not assign for ordinary consumer bugs, routine privacy breaches, algorithmic bias, or standard operational software reliability issues.",
    example:
      "Frontier-model safeguards tied to CBRN misuse, autonomous escalation, or loss-of-control risk.",
  },
  national_security: {
    short: "Frames AI around defense readiness, intelligence, or strategic sovereignty.",
    long: "Frames AI governance around defense readiness, intelligence advantage, geopolitical/strategic rivalry, foreign-adversary threats, export or compute sovereignty, or critical national-defense resilience.",
    includeWhen:
      "The document explicitly invokes military/defense capability, intelligence, adversary competition, strategic sovereignty, or national-security critical infrastructure protection.",
    excludeWhen:
      "Do not assign for purely commercial growth, domestic productivity, or trade competitiveness without explicit security, defense, adversary, or strategic-sovereignty language.",
    example:
      "Export controls on advanced chips, defense directives, foreign-investment screening, and national-security model evaluations.",
  },
  fundamental_rights: {
    short: "Frames AI around human dignity, civil rights, privacy, and non-discrimination.",
    long: "Frames AI governance around protecting human dignity, constitutional or civil rights, personal-data privacy, non-discrimination, fairness, due process, freedom of expression, democratic values, or the rule of law.",
    includeWhen:
      "The text anchors intervention in individual rights, privacy/data-protection rights, equality/anti-discrimination, human dignity, procedural fairness, or democratic freedoms.",
    excludeWhen:
      "Do not assign when harm prevention is strictly framed around physical product safety, market defects, or financial fraud without rights, privacy, equality, or dignity language (use consumer_public_safety).",
    example:
      "Prohibitions on discriminatory hiring tools, biometric surveillance limits, and GDPR-linked individual rights.",
  },
  economic_competitiveness: {
    short: "Frames AI around macroeconomic growth, industrial leadership, and trade advantage.",
    long: "Frames AI governance around macroeconomic growth, national productivity, global market leadership, industrial strength, trade/export advantage, or preventing domestic firms from falling behind foreign peers.",
    includeWhen:
      "The text justifies policy through GDP growth, industrial competitiveness, global AI leadership, market expansion, or strategic commercial positioning.",
    excludeWhen:
      "Do not assign for worker displacement, job protection, or workforce reskilling/retraining rationales (use labor_transition), nor for generic friction-reduction/sandbox language without competitive positioning (use innovation_enablement).",
    example:
      "National AI industrial strategies tied to GDP targets, domestic compute capacity, and export leadership.",
  },
  innovation_enablement: {
    short: "Argues governance should stay agile and proportionate to accelerate AI adoption.",
    long: "Frames AI governance around accelerating beneficial AI R&D, keeping rules proportional or agile, lowering compliance friction, fostering trustworthy adoption ecosystems, regulatory sandboxes, or public/private utilization.",
    includeWhen:
      "The text argues that proportional governance, clear standards, sandboxes, or voluntary guidance are needed to unlock safe AI experimentation, deployment, and public/private adoption.",
    excludeWhen:
      "Do not assign when the dominant rationale is zero-sum international economic rivalry or market leadership (use economic_competitiveness).",
    example:
      "Regulatory sandboxes, agile soft-law guidelines, voluntary frontier commitments, and barrier-removal directives.",
  },
  social_stability: {
    short: "Frames AI around public order, social cohesion, and information-ecosystem integrity.",
    long: "Frames AI governance around public order, collective harmony, socialist core values, public-opinion ecosystem governance, disinformation/rumor containment, cultural/moral norms, or societal cohesion.",
    includeWhen:
      "The text cites public order, social harmony, ideological/value alignment, information-ecosystem stability, rumor/disinformation containment, or collective social trust.",
    excludeWhen:
      "Do not assign for individual constitutional rights claims (use fundamental_rights) or narrow defective-product / individual consumer-protection rules (use consumer_public_safety).",
    example:
      "Mandatory synthetic-media labeling, algorithmic recommendation oversight, and disinformation containment rules.",
  },
  consumer_public_safety: {
    short: "Frames AI around product safety, clinical reliability, and consumer harm prevention.",
    long: "Frames AI governance around protecting consumers, patients, children, or bystanders from physical injury, medical error, financial fraud, deceptive practices, unsafe products, or operational system harms.",
    includeWhen:
      "The text centers on preventing tangible harm to end users, patients, minors, or the public via product safety, clinical reliability, fraud/deception prevention, or operational risk mitigation.",
    excludeWhen:
      "Do not assign when the rationale is primarily constitutional/human rights or privacy rights (use fundamental_rights) or collective public order (use social_stability).",
    example:
      "Product-safety standards, medical-device reliability rules, deceptive-chatbot enforcement, and minor protections.",
  },
  labor_transition: {
    short: "Frames AI around job displacement, workforce reskilling, and labor adjustment.",
    long: "Frames AI governance around workforce disruption, job displacement, worker protections, workforce reskilling/upskilling, collective bargaining, or equitable adjustment of labor markets to automation.",
    includeWhen:
      "The text explicitly cites employment disruption, worker retraining/reskilling, labor-market adjustment, workplace rights, or equitable distribution of automation gains as a reason for policy.",
    excludeWhen:
      "Do not assign merely because employment/HR appears in a list of high-risk application domains without explicit workforce-transition or reskilling rationale.",
    example:
      "Workforce reskilling programs, retraining funds, collective-bargaining safeguards, and automation-impact assessments.",
  },
};

/* ------------------------------------------------------------------ */
/* Null-Calibrated Sequential Single-Hue Divergence Scale (B2, C6)     */
/* Slate (#94a3b8) -> Sky (#38bdf8) -> Bright Cyan (#67e8f9)           */
/* Replaces green/amber/red traffic-light palette with a neutral       */
/* sequential hue: higher divergence is NOT morally "bad".             */
/* ------------------------------------------------------------------ */

export const DEFAULT_COUNTRY_BANDS = {
  moderateMin: 22,
  highMin: 34,
} as const;

export const DEFAULT_PAIRWISE_BANDS = {
  moderateMin: 28,
  highMin: 42,
} as const;

export type ScoreBand = "within_null" | "above_null" | "strong_divergence";

export function scoreBandWithNull(
  score: number,
  nullMean?: number | null,
  nullP90?: number | null,
  kind: "country" | "pairwise" = "country",
): ScoreBand {
  const defaults =
    kind === "pairwise" ? DEFAULT_PAIRWISE_BANDS : DEFAULT_COUNTRY_BANDS;
  const moderateCutoff =
    typeof nullMean === "number" && nullMean > 0
      ? Math.max(Math.round(nullMean), 10)
      : defaults.moderateMin;
  const highCutoff =
    typeof nullP90 === "number" && nullP90 > moderateCutoff
      ? Math.round(nullP90)
      : Math.max(defaults.highMin, moderateCutoff + 10);

  if (score >= highCutoff) return "strong_divergence";
  if (score >= moderateCutoff) return "above_null";
  return "within_null";
}

export function scoreBand(score: number): ScoreBand {
  return scoreBandWithNull(score, null, null, "country");
}

export function scoreBandLabel(band: ScoreBand): string {
  if (band === "strong_divergence") return "above 90th-pct null";
  if (band === "above_null") return "above random null";
  return "within null noise";
}

/** Sequential single-hue foreground hex for dark backgrounds (all >= 6.7:1 WCAG AA). */
export function scoreHexDark(
  score: number,
  nullMean?: number | null,
  nullP90?: number | null,
  kind: "country" | "pairwise" = "country",
): string {
  const band = scoreBandWithNull(score, nullMean, nullP90, kind);
  if (band === "strong_divergence") return "#67e8f9";
  if (band === "above_null") return "#38bdf8";
  return "#94a3b8";
}

/** Subtle sequential fill color for matrix cells and bars. */
export function scoreFillDark(
  score: number,
  nullMean?: number | null,
  nullP90?: number | null,
  kind: "country" | "pairwise" = "country",
): string {
  const band = scoreBandWithNull(score, nullMean, nullP90, kind);
  if (band === "strong_divergence") return "rgba(103, 232, 249, 0.22)";
  if (band === "above_null") return "rgba(56, 189, 248, 0.14)";
  return "rgba(148, 163, 184, 0.08)";
}
