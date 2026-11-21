/**
 * Canonical Taxonomy v2.1.0 vocabulary, thresholds, binding levels, and
 * human-readable labels aligned with data/taxonomies/label-definitions.json
 * and docs/research/codebook.md.
 * Kept pure (no React, no server-only) so server components, client islands,
 * and unit tests share one canonical definition layer.
 */

export const TAXONOMY_SCHEMA_VERSION = "2.1.0";

/** Canonical quality & scoring thresholds (synced with label-definitions.json). */
export const CANONICAL_THRESHOLDS = {
  groundingPass: 0.9,
  lowConfidencePolicy: 0.7,
  lowConfidenceFraming: 0.6,
  frameMentionFloor: 0.15,
} as const;

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  legislation: "Legislation",
  executive_order: "Executive action",
  regulatory_guidance: "Regulatory guidance",
  strategy_paper: "Strategy paper",
  standards_guideline: "Standards guideline",
  voluntary_commitment: "Voluntary commitment",
};

export const BINDING_STRENGTH_LABELS: Record<string, string> = {
  binding_law: "Binding law",
  executive_action: "Executive action",
  regulatory_guidance: "Regulatory guidance",
  standards_guideline: "Standards guideline",
  voluntary_commitment: "Voluntary commitment",
  strategy_statement: "Strategy statement",
};

export const BINDING_STRENGTH_ORDER = [
  "binding_law",
  "executive_action",
  "regulatory_guidance",
  "standards_guideline",
  "voluntary_commitment",
  "strategy_statement",
] as const;

/** Sensitivity-only binding weights (used in Binding-Weighted sensitivity mode). */
export const BINDING_STRENGTH_WEIGHTS: Record<string, number> = {
  binding_law: 4.0,
  executive_action: 3.0,
  regulatory_guidance: 2.0,
  standards_guideline: 1.5,
  voluntary_commitment: 1.0,
  strategy_statement: 1.0,
};

/**
 * Ordinal regime coverage scale (0–4) for the Regime Coverage Index (B4) and
 * Obligation Matrix (/matrix):
 *   0 = not imposed
 *   1 = voluntary commitment / strategy statement
 *   2 = standards guideline / regulatory guidance
 *   3 = executive action
 *   4 = binding law
 */
export const BINDING_LEVEL_NUMERIC: Record<string, number> = {
  none: 0,
  strategy_statement: 1,
  voluntary_commitment: 1,
  standards_guideline: 2,
  regulatory_guidance: 2,
  executive_action: 3,
  binding_law: 4,
};

export const BINDING_LEVEL_LABELS: Record<number, string> = {
  0: "Not imposed",
  1: "Voluntary / strategy",
  2: "Guidance / standard",
  3: "Executive directive",
  4: "Binding statute",
};

/** Sequential single-hue dark-theme foreground colors for binding levels (WCAG AA >= 4.5:1). */
export const BINDING_STRENGTH_COLORS: Record<string, string> = {
  binding_law: "#67e8f9",
  executive_action: "#38bdf8",
  regulatory_guidance: "#7dd3fc",
  standards_guideline: "#93c5fd",
  voluntary_commitment: "#94a3b8",
  strategy_statement: "#8da2be",
};

export const OBLIGATION_STRENGTH_LABELS: Record<string, string> = {
  mandatory: "Mandatory",
  conditional: "Conditional",
  recommended: "Recommended",
  aspirational: "Aspirational",
};

export const OBLIGATION_STRENGTH_COLORS: Record<string, string> = {
  mandatory: "#67e8f9",
  conditional: "#38bdf8",
  recommended: "#93c5fd",
  aspirational: "#94a3b8",
};

export const CORPUS_ROLE_ORDER = [
  "primary_instrument",
  "subnational_overlay",
  "companion_resource",
  "draft_consultation",
  "historical_baseline",
] as const;

export const CORPUS_ROLE_LABELS: Record<string, string> = {
  primary_instrument: "Primary instrument",
  subnational_overlay: "Subnational overlay",
  companion_resource: "Companion resource",
  draft_consultation: "Draft / consultation",
  historical_baseline: "Historical baseline",
};

export const CORPUS_ROLE_MULTIPLIERS: Record<string, number> = {
  primary_instrument: 1.0,
  subnational_overlay: 0.75,
  draft_consultation: 0.4,
  companion_resource: 0.35,
  historical_baseline: 0.25,
};

export const LIFECYCLE_STAGE_ORDER = [
  "active",
  "adopted_not_yet_effective",
  "draft",
  "superseded",
] as const;

export const LIFECYCLE_STAGE_LABELS: Record<string, string> = {
  active: "Active",
  adopted_not_yet_effective: "Adopted (pending)",
  draft: "Draft",
  superseded: "Superseded",
};

export const LIFECYCLE_STAGE_MULTIPLIERS: Record<string, number> = {
  active: 1.0,
  adopted_not_yet_effective: 0.9,
  draft: 0.4,
  superseded: 0.25,
};

export const SOURCE_TIER_LABELS: Record<string, string> = {
  statutory_rule: "Statutory rule",
  executive_action: "Executive action",
  regulatory_guidance: "Regulatory guidance",
  technical_standard: "Technical standard",
  policy_strategy: "Policy strategy",
  implementation_resource: "Implementation resource",
  voluntary_framework: "Voluntary framework",
};

export const POLICY_REQUIREMENT_ORDER = [
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
] as const;

export const POLICY_REQUIREMENT_LABELS: Record<string, string> = {
  // v1.0 requirements (12)
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
  // v2.0.0+ additive requirements (5)
  agentic_autonomy_controls: "Agentic autonomy controls",
  training_data_governance: "Training data governance",
  frontier_safety_evaluation: "Frontier safety evaluation",
  open_weight_obligations: "Open-weight obligations",
  domestic_representative: "Domestic representative",
};

export const ENFORCEMENT_MECHANISM_ORDER = [
  "civil_penalty",
  "criminal_penalty",
  "market_access_restriction",
  "procurement_condition",
  "licensing_requirement",
  "regulatory_supervision",
  "reporting_obligation",
  "soft_enforcement",
  "none_specified",
] as const;

export const ENFORCEMENT_MECHANISM_LABELS: Record<string, string> = {
  civil_penalty: "Civil penalties",
  criminal_penalty: "Criminal penalties",
  market_access_restriction: "Market-access restrictions",
  procurement_condition: "Procurement conditions",
  licensing_requirement: "Licensing requirements",
  regulatory_supervision: "Regulatory supervision",
  reporting_obligation: "Reporting obligations",
  soft_enforcement: "Soft enforcement",
  none_specified: "No explicit enforcement",
};

export const DOMAIN_LABELS: Record<string, string> = {
  general_purpose_models: "General-purpose models",
  critical_infrastructure: "Critical infrastructure",
  biometrics: "Biometrics",
  public_sector_use: "Public sector use",
  employment: "Employment",
  education: "Education",
  healthcare: "Healthcare",
  finance: "Finance",
  law_enforcement: "Law enforcement",
  defense: "Defense",
  frontier_gpai: "Frontier / GPAI",
  privacy_data_protection: "Privacy & data protection",
  civil_rights_nondiscrimination: "Civil rights & non-discrimination",
  consumer_protection: "Consumer protection",
  public_sector_governance: "Public sector governance",
  public_sector_procurement: "Public sector procurement",
  healthcare_medical_devices: "Healthcare & medical devices",
  standards_assurance: "Standards & assurance",
  platform_content_governance: "Platform & content governance",
  copyright_ip: "Copyright & IP",
  national_security: "National security",
  industrial_innovation: "Industrial innovation",
  agentic_ai: "Agentic AI",
  embodied_physical_ai: "Embodied / physical AI",
  companion_ai: "Companion AI",
  sovereign_compute: "Sovereign compute",
};

export const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  fr: "French",
  de: "German",
  es: "Spanish",
  unknown: "Unknown",
};

export function toHtmlLang(language?: string | null): string {
  const normalized = (language ?? "").trim().toLowerCase();
  if (normalized === "zh" || normalized === "chinese") return "zh";
  if (normalized === "ja" || normalized === "japanese") return "ja";
  if (normalized === "ko" || normalized === "korean") return "ko";
  if (normalized === "fr" || normalized === "french") return "fr";
  if (normalized === "de" || normalized === "german") return "de";
  return "en";
}

export function isCjkText(text?: string | null): boolean {
  if (!text) return false;
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(text);
}

export function titleCaseSnake(label: string): string {
  return label
    .split("_")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function humanizeRequirement(label?: string | null): string {
  if (!label) return "Unspecified";
  return POLICY_REQUIREMENT_LABELS[label] ?? titleCaseSnake(label);
}

export function humanizeEnforcement(label?: string | null): string {
  if (!label) return "Unspecified";
  return ENFORCEMENT_MECHANISM_LABELS[label] ?? titleCaseSnake(label);
}

export function humanizeBindingStrength(label?: string | null): string {
  if (!label) return "Unclassified";
  return BINDING_STRENGTH_LABELS[label] ?? titleCaseSnake(label);
}

export function humanizeObligationStrength(label?: string | null): string {
  if (!label) return "Unspecified";
  return OBLIGATION_STRENGTH_LABELS[label] ?? titleCaseSnake(label);
}

export function humanizeDocumentType(label?: string | null): string {
  if (!label) return "Unclassified document";
  return DOCUMENT_TYPE_LABELS[label] ?? titleCaseSnake(label);
}

export function humanizeDomain(label?: string | null): string {
  if (!label) return "Unspecified";
  return DOMAIN_LABELS[label] ?? titleCaseSnake(label);
}

/** A4: Never default missing corpus_role to "Primary instrument". */
export function humanizeCorpusRole(label?: string | null): string {
  if (!label) return "Unclassified";
  return CORPUS_ROLE_LABELS[label] ?? titleCaseSnake(label);
}

/** A4: Never default missing lifecycle_stage to "Active". */
export function humanizeLifecycleStage(label?: string | null): string {
  if (!label) return "Unclassified";
  return LIFECYCLE_STAGE_LABELS[label] ?? titleCaseSnake(label);
}

export function humanizeLanguage(language?: string | null): string {
  if (!language) return "Unknown";
  return LANGUAGE_LABELS[language.toLowerCase()] ?? language;
}

export function humanizeTaxonomyLabel(label?: string | null): string {
  if (!label) return "Unspecified";
  return (
    POLICY_REQUIREMENT_LABELS[label] ??
    ENFORCEMENT_MECHANISM_LABELS[label] ??
    BINDING_STRENGTH_LABELS[label] ??
    OBLIGATION_STRENGTH_LABELS[label] ??
    DOCUMENT_TYPE_LABELS[label] ??
    DOMAIN_LABELS[label] ??
    CORPUS_ROLE_LABELS[label] ??
    LIFECYCLE_STAGE_LABELS[label] ??
    SOURCE_TIER_LABELS[label] ??
    titleCaseSnake(label)
  );
}

export function bindingLevelOf(label?: string | null): number {
  if (!label) return 0;
  return BINDING_LEVEL_NUMERIC[label] ?? 0;
}

const MODEL_DISPLAY_LABELS: Record<string, string> = {
  "gemini-4-neon": "Gemini 4 Neon",
  "gemini-3-pro": "Gemini 3 Pro",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "claude-opus-5-5": "Claude Opus 5.5",
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "claude-opus-4-6": "Claude Opus 4.6",
  "claude-sonnet-4-5": "Claude Sonnet 4.5",
};

/**
 * Formats a canonical provider model slug (e.g. "gemini-4-neon",
 * "claude-opus-5-5", "claude-sonnet-4-6") into a clean human-readable label.
 */
export function formatModelDisplayName(model?: string | null): string {
  const trimmed = (model ?? "").trim();
  if (!trimmed) return "automated LLM extraction";
  const lower = trimmed.toLowerCase();
  if (lower in MODEL_DISPLAY_LABELS) {
    return MODEL_DISPLAY_LABELS[lower];
  }

  // Collapse trailing numeric minor versions like "claude-haiku-4-5" -> "Claude Haiku 4.5"
  const rawTokens = trimmed.split(/[-_]+/).filter(Boolean);
  const formatted: string[] = [];
  for (let i = 0; i < rawTokens.length; i += 1) {
    const tok = rawTokens[i];
    const next = rawTokens[i + 1];
    if (
      /^\d+$/.test(tok) &&
      next &&
      /^\d+$/.test(next) &&
      i + 2 === rawTokens.length
    ) {
      formatted.push(`${tok}.${next}`);
      i += 1;
    } else if (/^\d+(\.\d+)?$/.test(tok)) {
      formatted.push(tok);
    } else {
      formatted.push(tok[0].toUpperCase() + tok.slice(1).toLowerCase());
    }
  }
  return formatted.join(" ");
}

/**
 * Formats an array of model IDs into a deduplicated human-readable list,
 * falling back cleanly to "automated LLM extraction" when empty.
 */
export function formatModelList(models?: readonly string[] | null): string {
  if (!models || models.length === 0) return "automated LLM extraction";
  const unique: string[] = [];
  for (const raw of models) {
    const cleaned = (raw ?? "").trim();
    if (!cleaned) continue;
    const display = formatModelDisplayName(cleaned);
    if (!unique.includes(display)) unique.push(display);
  }
  if (unique.length === 0) return "automated LLM extraction";
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")}, and ${unique[unique.length - 1]}`;
}

export type ProvenanceBannerKind = "v2_verified" | "legacy_warning" | "none";

export function getProvenanceBannerKind(prov: {
  legacyCount: number;
  v2Count: number;
}): ProvenanceBannerKind {
  if (prov.legacyCount > 0) return "legacy_warning";
  if (prov.v2Count > 0) return "v2_verified";
  return "none";
}

/**
 * Extracts numeric grounding_ratio from v2.1 nested
 * `analysis_metadata.grounding_summary.grounding_ratio` or flat
 * `analysis_metadata.grounding_ratio` (Stage 4C fix).
 */
export function extractGroundingRatio(
  meta?: {
    grounding_ratio?: number | string | null;
    grounding_summary?: {
      grounding_ratio?: number | string | null;
    } | null;
  } | null,
): number | null {
  const raw =
    meta?.grounding_summary?.grounding_ratio ?? meta?.grounding_ratio ?? null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Parses `?states=1` / `?states=true` opt-in U.S. State Law overlay flag (Phase 5A). */
export function parseIncludeSubnational(value?: string | null): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

/** Formats subnational unit badge cleanly (e.g. "California" -> "California · State Law"). */
export function formatSubnationalBadge(unit?: string | null): string | null {
  const trimmed = (unit ?? "").trim();
  if (!trimmed) return null;
  if (/state law/i.test(trimmed)) return trimmed;
  return `${trimmed} · State Law`;
}

const PROSE_FRAME_LABELS: Record<string, string> = {
  existential_catastrophic: "Existential & Catastrophic Risk",
  national_security: "National Security",
  fundamental_rights: "Fundamental Rights",
  economic_competitiveness: "Economic Competitiveness",
  innovation_enablement: "Innovation Enablement",
  social_stability: "Social Stability & Public Order",
  consumer_public_safety: "Consumer & Public Safety",
  labor_transition: "Labor & Workforce Transition",
};

const PROSE_TAXONOMY_KEYS: Record<string, string> = {
  ...PROSE_FRAME_LABELS,
  ...POLICY_REQUIREMENT_LABELS,
  ...ENFORCEMENT_MECHANISM_LABELS,
  ...BINDING_STRENGTH_LABELS,
};

const PROSE_TAXONOMY_REGEX = new RegExp(
  `\\b(${Object.keys(PROSE_TAXONOMY_KEYS)
    .sort((a, b) => b.length - a.length)
    .join("|")})\\b`,
  "g",
);

/**
 * Replaces raw snake_case taxonomy identifiers (e.g. `innovation_enablement`,
 * `fundamental_rights`, `consumer_public_safety`) appearing inside rationale or
 * summary prose with clean human-readable labels (Phase 5A QA polish).
 */
export function humanizeProseTaxonomyKeys(text?: string | null): string {
  if (!text) return "";
  return text.replace(PROSE_TAXONOMY_REGEX, (match) => {
    return PROSE_TAXONOMY_KEYS[match] ?? match;
  });
}
