import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  allowLocalFallback,
  getDatabaseClient,
  handleDatabaseReadFailure,
} from "@/lib/db";
import type { FrameLabel } from "@/lib/seed-data";
import { jurisdictionMeta, type JurisdictionKey } from "@/lib/jurisdictions";

export type JurisdictionAnalysisLabelStat = {
  label: string;
  count: number;
  share: number;
};

export type JurisdictionAnalysisFrameStat = {
  label: string;
  score: number;
  share: number;
  document_mentions: number;
};

export type JurisdictionAnalysisSource = {
  document_id: string;
  title: string;
  publication_date?: string | null;
  document_type?: string | null;
  binding_strength?: string | null;
  dominant_frame?: string | null;
  contribution: string;
};

export type JurisdictionAnalysis = {
  jurisdiction: JurisdictionKey;
  analysis_method: string;
  analysis_version: string;
  generated_at: string;
  source_count: number;
  source_document_ids: string[];
  source_window_start?: string | null;
  source_window_end?: string | null;
  summary: string;
  governance_posture: string;
  framing_landscape: string;
  implementation_and_enforcement: string;
  source_coverage_note: string;
  key_sources: JurisdictionAnalysisSource[];
  top_document_types: JurisdictionAnalysisLabelStat[];
  top_binding_strengths: JurisdictionAnalysisLabelStat[];
  top_requirements: JurisdictionAnalysisLabelStat[];
  top_enforcement_mechanisms: JurisdictionAnalysisLabelStat[];
  top_frames: JurisdictionAnalysisFrameStat[];
  key_institutions: string[];
  confidence: number;
};

type DbRow = {
  analysis_payload: JurisdictionAnalysis;
};

const WORKSPACE_ROOT = path.resolve(process.cwd(), "..", "..");

export async function getJurisdictionAnalysis(
  jurisdiction: JurisdictionKey,
): Promise<JurisdictionAnalysis | null> {
  const sql = getDatabaseClient();
  if (sql) {
    try {
      const rows = (await sql`
        SELECT analysis_payload
        FROM machine_jurisdiction_analyses
        WHERE jurisdiction = ${jurisdiction}
        ORDER BY created_at DESC
        LIMIT 1
      `) as DbRow[];
      const payload = rows[0]?.analysis_payload;
      if (payload) {
        return normalizeJurisdictionAnalysis(payload, jurisdiction);
      }
    } catch (error) {
      handleDatabaseReadFailure(`jurisdiction analysis for ${jurisdiction} from Neon`, error);
      if (!allowLocalFallback()) {
        throw error;
      }
    }
  }

  return loadFallbackJurisdictionAnalysis(jurisdiction);
}

async function loadFallbackJurisdictionAnalysis(
  jurisdiction: JurisdictionKey,
): Promise<JurisdictionAnalysis | null> {
  const filePath = path.join(
    WORKSPACE_ROOT,
    "data",
    "analysis",
    "jurisdictions",
    jurisdiction,
    "jurisdiction_analysis.json",
  );
  try {
    const contents = await readFile(filePath, "utf-8");
    return normalizeJurisdictionAnalysis(
      JSON.parse(contents) as JurisdictionAnalysis,
      jurisdiction,
    );
  } catch {
    return null;
  }
}

function normalizeJurisdictionAnalysis(
  payload: JurisdictionAnalysis,
  jurisdiction: JurisdictionKey,
): JurisdictionAnalysis {
  return {
    ...payload,
    jurisdiction,
    key_sources: payload.key_sources ?? [],
    top_document_types: payload.top_document_types ?? [],
    top_binding_strengths: payload.top_binding_strengths ?? [],
    top_requirements: payload.top_requirements ?? [],
    top_enforcement_mechanisms: payload.top_enforcement_mechanisms ?? [],
    top_frames: payload.top_frames ?? [],
    key_institutions: payload.key_institutions ?? [],
    source_document_ids: payload.source_document_ids ?? [],
  };
}

export function humanizeJurisdictionAnalysisLabel(label?: string | null): string {
  if (!label) return "Unspecified";
  const labels: Record<string, string> = {
    risk_assessment: "Risk assessment",
    pre_deployment_testing: "Pre-deployment testing",
    red_teaming: "Red-teaming",
    incident_reporting: "Incident reporting",
    transparency_disclosure: "Transparency and disclosure",
    model_documentation: "Model documentation",
    third_party_audit: "Third-party audit",
    access_controls: "Access controls",
    compute_governance: "Compute governance",
    content_provenance: "Content provenance",
    human_oversight: "Human oversight",
    registration_licensing: "Registration or licensing",
    civil_penalty: "Civil penalties",
    criminal_penalty: "Criminal penalties",
    market_access_restriction: "Market-access restrictions",
    procurement_condition: "Procurement conditions",
    licensing_requirement: "Licensing requirements",
    regulatory_supervision: "Regulatory supervision",
    reporting_obligation: "Reporting obligations",
    soft_enforcement: "Soft enforcement",
    none_specified: "No explicit enforcement mechanism",
    binding_law: "Binding law",
    executive_action: "Executive action",
    regulatory_guidance: "Regulatory guidance",
    standards_guideline: "Standards guidance",
    voluntary_commitment: "Voluntary commitment",
    strategy_statement: "Strategy statement",
    legislation: "Legislation",
    executive_order: "Executive action",
    strategy_paper: "Strategy paper",
    existential_catastrophic: "Existential or catastrophic risk",
    national_security: "National security",
    economic_competitiveness: "Economic competitiveness",
    fundamental_rights: "Fundamental rights",
    social_stability: "Social stability and public order",
    innovation_enablement: "Innovation enablement",
    consumer_public_safety: "Consumer and public safety",
    labor_transition: "Labor and economic transition",
  };
  return labels[label] ?? label.replaceAll("_", " ");
}

export function jurisdictionAnalysisFrameColor(frame?: string | null): string {
  const colorMap: Partial<Record<FrameLabel, string>> = {
    national_security: "#c75146",
    fundamental_rights: "#2f6eba",
    economic_competitiveness: "#c98a2b",
    innovation_enablement: "#2f8872",
    social_stability: "#7a4ea8",
    consumer_public_safety: "#2a8aa5",
  };
  return colorMap[frame as FrameLabel] ?? "#7a8697";
}

export function jurisdictionName(jurisdiction: JurisdictionKey): string {
  return jurisdictionMeta[jurisdiction].name;
}
