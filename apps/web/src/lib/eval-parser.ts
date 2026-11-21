/**
 * Pure parser for pipeline `evaluate-gold-set` JSON outputs (D12 / Stage 4A / Phase 5A).
 * Supports both starter `gold_set_v1` (n=5) and stratified multilingual `gold_set_v2`
 * (n=25 with `by_jurisdiction`, Krippendorff's alpha, and per-label P/R/F1).
 * Zero Node fs / server-only imports so unit tests and server code share one parser.
 */

export type GoldSetCI = [number, number];

export type GoldSetJurisdictionRow = {
  jurisdiction: string;
  evaluatedCount: number;
  requirementMicroF1: number | null;
  requirementMacroF1: number | null;
  enforcementMicroF1: number | null;
  enforcementMacroF1: number | null;
  dominantFrameAccuracy: number | null;
  bindingStrengthAccuracy: number | null;
};

export type GoldSetPerLabelRow = {
  label: string;
  tp: number;
  fp: number;
  fn: number;
  support: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
};

export type GoldSetEvaluationSummary = {
  benchmarkId: string | null;
  benchmarkStatus: string;
  benchmarkVersion: string | null;
  annotatorNote: string | null;
  evaluatedCount: number;
  bootstrapIterations: number;
  model: string | null;
  evaluatedAt: string | null;
  requirementMicroPrecision: number | null;
  requirementMicroRecall: number | null;
  requirementMicroF1: number | null;
  requirementMacroF1: number | null;
  enforcementMicroPrecision: number | null;
  enforcementMicroRecall: number | null;
  enforcementMicroF1: number | null;
  enforcementMacroF1: number | null;
  dominantFrameAccuracy: number | null;
  dominantFrameCohensKappa: number | null;
  dominantFrameKrippendorffsAlpha: number | null;
  bindingStrengthAccuracy: number | null;
  bindingStrengthCohensKappa: number | null;
  bindingStrengthKrippendorffsAlpha: number | null;
  bootstrap95CI: {
    requirementMicroF1: GoldSetCI | null;
    enforcementMicroF1: GoldSetCI | null;
    dominantFrameAccuracy: GoldSetCI | null;
    bindingStrengthAccuracy: GoldSetCI | null;
    dominantFrameCohensKappa: GoldSetCI | null;
  };
  byJurisdiction: GoldSetJurisdictionRow[];
  perLabelRequirements: GoldSetPerLabelRow[];
  perLabelEnforcement: GoldSetPerLabelRow[];
};

function toNum(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toStr(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toCI(value: unknown): GoldSetCI | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const lo = toNum(value[0]);
  const hi = toNum(value[1]);
  if (lo === null || hi === null) return null;
  return [lo, hi];
}

function parsePerLabelMap(raw: unknown): GoldSetPerLabelRow[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const entries = Object.entries(raw as Record<string, unknown>);
  const out: GoldSetPerLabelRow[] = [];
  for (const [label, value] of entries) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const item = value as Record<string, unknown>;
    const tp = Math.round(toNum(item.tp) ?? 0);
    const fp = Math.round(toNum(item.fp) ?? 0);
    const fn = Math.round(toNum(item.fn) ?? 0);
    const support = Math.round(toNum(item.support) ?? tp + fn);
    out.push({
      label,
      tp,
      fp,
      fn,
      support,
      precision: toNum(item.precision),
      recall: toNum(item.recall),
      f1: toNum(item.f1),
    });
  }
  return out.sort(
    (a, b) => b.support - a.support || a.label.localeCompare(b.label),
  );
}

const JURISDICTION_SORT = [
  "united_states",
  "european_union",
  "south_korea",
  "japan",
  "china",
];

function parseByJurisdiction(raw: unknown): GoldSetJurisdictionRow[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const entries = Object.entries(raw as Record<string, unknown>);
  const out: GoldSetJurisdictionRow[] = [];
  for (const [jurisdiction, value] of entries) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const item = value as Record<string, unknown>;
    const evaluatedCount = Math.round(
      toNum(item.evaluated_count) ?? toNum(item.document_count) ?? 0,
    );
    if (evaluatedCount <= 0) continue;
    out.push({
      jurisdiction,
      evaluatedCount,
      requirementMicroF1: toNum(item.requirement_micro_f1),
      requirementMacroF1: toNum(item.requirement_macro_f1),
      enforcementMicroF1: toNum(item.enforcement_micro_f1),
      enforcementMacroF1: toNum(item.enforcement_macro_f1),
      dominantFrameAccuracy: toNum(item.dominant_frame_accuracy),
      bindingStrengthAccuracy: toNum(item.binding_strength_accuracy),
    });
  }
  return out.sort((a, b) => {
    const ia = JURISDICTION_SORT.indexOf(a.jurisdiction);
    const ib = JURISDICTION_SORT.indexOf(b.jurisdiction);
    const ra = ia >= 0 ? ia : 99;
    const rb = ib >= 0 ? ib : 99;
    return ra - rb || a.jurisdiction.localeCompare(b.jurisdiction);
  });
}

export function parseGoldSetEvaluation(
  raw: unknown,
): GoldSetEvaluationSummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const evaluatedCount = toNum(obj.evaluated_count);
  if (evaluatedCount === null || evaluatedCount <= 0) return null;

  const ciRaw =
    obj.bootstrap_95_ci && typeof obj.bootstrap_95_ci === "object"
      ? (obj.bootstrap_95_ci as Record<string, unknown>)
      : {};

  return {
    benchmarkId: toStr(obj.benchmark_id),
    benchmarkStatus: toStr(obj.benchmark_status) ?? "starter_v0.1_internal",
    benchmarkVersion: toStr(obj.version) ?? toStr(obj.benchmark_version),
    annotatorNote: toStr(obj.annotator_note),
    evaluatedCount: Math.round(evaluatedCount),
    bootstrapIterations: Math.round(toNum(obj.bootstrap_iterations) ?? 0),
    model: toStr(obj.model),
    evaluatedAt: toStr(obj.evaluated_at),
    requirementMicroPrecision: toNum(obj.requirement_micro_precision),
    requirementMicroRecall: toNum(obj.requirement_micro_recall),
    requirementMicroF1: toNum(obj.requirement_micro_f1),
    requirementMacroF1: toNum(obj.requirement_macro_f1),
    enforcementMicroPrecision: toNum(obj.enforcement_micro_precision),
    enforcementMicroRecall: toNum(obj.enforcement_micro_recall),
    enforcementMicroF1: toNum(obj.enforcement_micro_f1),
    enforcementMacroF1: toNum(obj.enforcement_macro_f1),
    dominantFrameAccuracy: toNum(obj.dominant_frame_accuracy),
    dominantFrameCohensKappa: toNum(obj.dominant_frame_cohens_kappa),
    dominantFrameKrippendorffsAlpha: toNum(
      obj.dominant_frame_krippendorffs_alpha,
    ),
    bindingStrengthAccuracy: toNum(obj.binding_strength_accuracy),
    bindingStrengthCohensKappa: toNum(obj.binding_strength_cohens_kappa),
    bindingStrengthKrippendorffsAlpha: toNum(
      obj.binding_strength_krippendorffs_alpha,
    ),
    bootstrap95CI: {
      requirementMicroF1: toCI(ciRaw.requirement_micro_f1),
      enforcementMicroF1: toCI(ciRaw.enforcement_micro_f1),
      dominantFrameAccuracy: toCI(ciRaw.dominant_frame_accuracy),
      bindingStrengthAccuracy: toCI(ciRaw.binding_strength_accuracy),
      dominantFrameCohensKappa: toCI(ciRaw.dominant_frame_cohens_kappa),
    },
    byJurisdiction: parseByJurisdiction(obj.by_jurisdiction),
    perLabelRequirements: parsePerLabelMap(obj.per_label_requirements),
    perLabelEnforcement: parsePerLabelMap(obj.per_label_enforcement),
  };
}
