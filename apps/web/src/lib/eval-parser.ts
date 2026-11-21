/**
 * Pure parser for pipeline `evaluate-gold-set` JSON outputs (D12 / Stage 4A).
 * Zero Node fs / server-only imports so unit tests and server code share one parser.
 */

export type GoldSetCI = [number, number];

export type GoldSetEvaluationSummary = {
  benchmarkStatus: string;
  benchmarkVersion: string | null;
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
  bindingStrengthAccuracy: number | null;
  bindingStrengthCohensKappa: number | null;
  bootstrap95CI: {
    requirementMicroF1: GoldSetCI | null;
    enforcementMicroF1: GoldSetCI | null;
    dominantFrameAccuracy: GoldSetCI | null;
    bindingStrengthAccuracy: GoldSetCI | null;
    dominantFrameCohensKappa: GoldSetCI | null;
  };
};

function toNum(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toCI(value: unknown): GoldSetCI | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const lo = toNum(value[0]);
  const hi = toNum(value[1]);
  if (lo === null || hi === null) return null;
  return [lo, hi];
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
    benchmarkStatus:
      typeof obj.benchmark_status === "string" && obj.benchmark_status.trim()
        ? obj.benchmark_status.trim()
        : "starter_v0.1_internal",
    benchmarkVersion:
      typeof obj.version === "string" && obj.version.trim()
        ? obj.version.trim()
        : typeof obj.benchmark_version === "string" &&
            obj.benchmark_version.trim()
          ? obj.benchmark_version.trim()
          : null,
    evaluatedCount: Math.round(evaluatedCount),
    bootstrapIterations: Math.round(toNum(obj.bootstrap_iterations) ?? 0),
    model:
      typeof obj.model === "string" && obj.model.trim()
        ? obj.model.trim()
        : null,
    evaluatedAt:
      typeof obj.evaluated_at === "string" && obj.evaluated_at.trim()
        ? obj.evaluated_at.trim()
        : null,
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
    bindingStrengthAccuracy: toNum(obj.binding_strength_accuracy),
    bindingStrengthCohensKappa: toNum(obj.binding_strength_cohens_kappa),
    bootstrap95CI: {
      requirementMicroF1: toCI(ciRaw.requirement_micro_f1),
      enforcementMicroF1: toCI(ciRaw.enforcement_micro_f1),
      dominantFrameAccuracy: toCI(ciRaw.dominant_frame_accuracy),
      bindingStrengthAccuracy: toCI(ciRaw.binding_strength_accuracy),
      dominantFrameCohensKappa: toCI(ciRaw.dominant_frame_cohens_kappa),
    },
  };
}
