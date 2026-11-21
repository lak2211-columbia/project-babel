import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  formatDocumentsAsBibtex,
  formatDocumentsAsCsv,
  formatObservatoryBibtex,
} from "../export-formatters.ts";
import {
  frameDefinition,
  scoreBandWithNull,
  scoreHexDark,
} from "../frame-vocab.ts";
import {
  findQuoteAcrossSections,
  matchQuoteInText,
} from "../quote-matcher.ts";
import {
  averageNonEmptyProfiles,
  BOOTSTRAP_RESAMPLES,
  COMPOSITE_WEIGHTS,
  computeObligationLevels,
  computeScoringEngine,
  coverageL1Distance,
  divergenceFromPeersExact,
  FRAME_MENTION_FLOOR,
  hamiltonRound,
  isHeadlineEligible,
  isLowConfidenceDocument,
  LOW_CONFIDENCE_FRAMING_THRESHOLD,
  LOW_CONFIDENCE_POLICY_THRESHOLD,
  normalizeDocumentFrameConfidence,
  PERMUTATION_DRAWS,
  POLICY_COMPONENT_WEIGHTS,
  spearmanRankCorrelation,
  type ScoringDocumentInput,
} from "../scoring.ts";
import {
  allFrameLabels,
  buildEmptyOverviewData,
  seedData,
} from "../seed-data.ts";
import {
  formatLongDate,
  formatShortDate,
  inferDatePrecision,
} from "../sources-data.ts";
import {
  CANONICAL_THRESHOLDS,
  humanizeCorpusRole,
  humanizeLifecycleStage,
  isCjkText,
  toHtmlLang,
} from "../taxonomy-vocab.ts";
import { safeExternalUrl } from "../url-safety.ts";

test("hamiltonRound always sums to 100 for any positive distribution", () => {
  const cases = [
    [
      { label: "a", value: 1 },
      { label: "b", value: 1 },
      { label: "c", value: 1 },
    ],
    [
      { label: "a", value: 0.333 },
      { label: "b", value: 0.333 },
      { label: "c", value: 0.333 },
      { label: "d", value: 0.001 },
    ],
    [
      { label: "f1", value: 2.4 },
      { label: "f2", value: 8.4 },
      { label: "f3", value: 18.6 },
      { label: "f4", value: 11.6 },
      { label: "f5", value: 17.4 },
      { label: "f6", value: 6.6 },
      { label: "f7", value: 32.6 },
      { label: "f8", value: 2.6 },
    ],
  ];

  for (const entries of cases) {
    const rounded = hamiltonRound(entries);
    const total = rounded.reduce((sum, item) => sum + item.value, 0);
    assert.equal(total, 100, `Expected sum 100, got ${total}`);
    for (const item of rounded) {
      assert.ok(Number.isInteger(item.value) && item.value >= 0);
    }
  }

  const zeros = hamiltonRound([
    { label: "a", value: 0 },
    { label: "b", value: 0 },
  ]);
  assert.deepEqual(
    zeros.map((x) => x.value),
    [0, 0],
  );
});

test("normalizeDocumentFrameConfidence zeroes sub-0.15 noise and prefers explicit frameShare (B3)", () => {
  // Sub-0.15 noise entries must be zeroed so dominant signals aren't flattened
  const noisy = normalizeDocumentFrameConfidence(
    {
      national_security: 0.85,
      existential_catastrophic: 0.05,
      labor_transition: 0.1,
      social_stability: 0.14,
      innovation_enablement: 0.35,
    },
    "national_security",
  );
  assert.equal(noisy.get("existential_catastrophic") ?? 0, 0);
  assert.equal(noisy.get("labor_transition") ?? 0, 0);
  assert.equal(noisy.get("social_stability") ?? 0, 0);
  const sumNoisy = [...noisy.values()].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sumNoisy - 1) < 1e-9);
  assert.ok((noisy.get("national_security") ?? 0) > 0.7);

  // Explicit frameShare takes precedence over frameConfidence
  const withShare = normalizeDocumentFrameConfidence(
    { national_security: 0.9, innovation_enablement: 0.9 },
    "national_security",
    { fundamental_rights: 0.75, consumer_public_safety: 0.25 },
  );
  assert.ok(Math.abs((withShare.get("fundamental_rights") ?? 0) - 0.75) < 1e-9);
  assert.ok(
    Math.abs((withShare.get("consumer_public_safety") ?? 0) - 0.25) < 1e-9,
  );
  assert.equal(withShare.get("national_security") ?? 0, 0);

  // Fallback to dominantFrame when empty
  const fallback = normalizeDocumentFrameConfidence({}, "fundamental_rights");
  assert.equal(fallback.get("fundamental_rights"), 1);
  assert.equal(fallback.size, 1);
});

test("isHeadlineEligible strictly enforces Codebook §8.2 and excludes unclassified docs (A3, A4)", () => {
  assert.equal(
    isHeadlineEligible({
      corpusRole: "primary_instrument",
      lifecycleStage: "active",
    }),
    true,
  );
  assert.equal(
    isHeadlineEligible({
      corpusRole: "primary_instrument",
      lifecycleStage: "adopted_not_yet_effective",
    }),
    true,
  );
  assert.equal(
    isHeadlineEligible({
      corpusRole: "companion_resource",
      lifecycleStage: "active",
    }),
    false,
  );
  assert.equal(
    isHeadlineEligible({
      corpusRole: "primary_instrument",
      lifecycleStage: "draft",
    }),
    false,
  );
  assert.equal(
    isHeadlineEligible({
      corpusRole: "primary_instrument",
      lifecycleStage: "superseded",
    }),
    false,
  );
  // A4: null / missing metadata MUST NOT silently default to primary_instrument / active
  assert.equal(
    isHeadlineEligible({ corpusRole: null, lifecycleStage: "active" }),
    false,
  );
  assert.equal(
    isHeadlineEligible({
      corpusRole: "primary_instrument",
      lifecycleStage: null,
    }),
    false,
  );
  assert.equal(humanizeCorpusRole(null), "Unclassified");
  assert.equal(humanizeLifecycleStage(undefined), "Unclassified");
});

test("isLowConfidenceDocument uses codebook policy (<0.70) and framing (<0.60) thresholds", () => {
  assert.equal(
    isLowConfidenceDocument({
      policyConfidence: 0.69,
      dominantFrameConfidence: 0.9,
      overallConfidence: 0.8,
    }),
    true,
  );
  assert.equal(
    isLowConfidenceDocument({
      policyConfidence: 0.9,
      dominantFrameConfidence: 0.59,
      overallConfidence: 0.8,
    }),
    true,
  );
  assert.equal(
    isLowConfidenceDocument({
      policyConfidence: 0.72,
      dominantFrameConfidence: 0.65,
      overallConfidence: 0.68,
    }),
    false,
  );
  assert.equal(LOW_CONFIDENCE_POLICY_THRESHOLD, 0.7);
  assert.equal(LOW_CONFIDENCE_FRAMING_THRESHOLD, 0.6);
  assert.equal(FRAME_MENTION_FLOOR, 0.15);
});

test("divergenceFromPeersExact safely handles empty targets and empty peers", () => {
  const profiles = new Map<
    "united_states" | "european_union" | "south_korea" | "japan" | "china",
    Map<string, number>
  >([
    ["united_states", new Map([["a", 1]])],
    ["european_union", new Map([["b", 1]])],
    ["south_korea", new Map()],
    ["japan", new Map()],
    ["china", new Map()],
  ]);

  assert.equal(divergenceFromPeersExact(profiles, "south_korea"), 0);
  assert.equal(divergenceFromPeersExact(profiles, "united_states"), 100);

  const avg = averageNonEmptyProfiles([
    new Map([["a", 1]]),
    new Map(),
    new Map([["b", 1]]),
  ]);
  const total = [...avg.values()].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  assert.equal(avg.get("a"), 0.5);
  assert.equal(avg.get("b"), 0.5);
});

test("Regime Coverage Index computes max binding level (0..4) invariant to doc count (B4)", () => {
  const singleBinding: ScoringDocumentInput[] = [
    {
      documentId: "eu-act",
      jurisdiction: "european_union",
      publicationDate: "2024-06-13",
      machineCreatedAt: null,
      bindingStrength: "binding_law",
      corpusRole: "primary_instrument",
      lifecycleStage: "active",
      safetyRequirements: [{ label: "risk_assessment" }],
      enforcementMechanisms: [{ label: "civil_penalty" }],
      dominantFrame: "fundamental_rights",
    },
  ];
  const repeatedGuidance: ScoringDocumentInput[] = [
    ...singleBinding,
    ...Array.from({ length: 10 }, (_, idx) => ({
      documentId: `eu-guide-${idx}`,
      jurisdiction: "european_union" as const,
      publicationDate: "2025-01-01",
      machineCreatedAt: null,
      bindingStrength: "regulatory_guidance",
      corpusRole: "primary_instrument",
      lifecycleStage: "active",
      safetyRequirements: [{ label: "risk_assessment" }],
      enforcementMechanisms: [{ label: "soft_enforcement" }],
      dominantFrame: "fundamental_rights",
    })),
  ];

  const lvlSingle = computeObligationLevels(singleBinding);
  const lvlRepeated = computeObligationLevels(repeatedGuidance);

  assert.equal(lvlSingle.risk_assessment, 4);
  assert.equal(lvlRepeated.risk_assessment, 4);
  assert.equal(lvlSingle.civil_penalty, 4);
  assert.equal(lvlRepeated.soft_enforcement, 2);
  assert.equal(coverageL1Distance(lvlSingle, lvlSingle), 0);
  assert.ok(coverageL1Distance(lvlSingle, {}) > 0);
});

test("computeScoringEngine enforces headline filtering, CIs, null baseline, sensitivity grid, and exact invariants", () => {
  const sampleDocs: ScoringDocumentInput[] = [
    {
      documentId: "us-1",
      jurisdiction: "united_states",
      publicationDate: "2025-07-01",
      machineCreatedAt: "2026-04-15T12:00:00Z",
      bindingStrength: "executive_action",
      corpusRole: "primary_instrument",
      lifecycleStage: "active",
      policyConfidence: 0.9,
      dominantFrameConfidence: 0.85,
      overallConfidence: 0.88,
      safetyRequirements: [
        { label: "red_teaming" },
        { label: "risk_assessment" },
      ],
      enforcementMechanisms: [{ label: "procurement_condition" }],
      dominantFrame: "national_security",
      frameConfidence: { national_security: 0.9, innovation_enablement: 0.3 },
    },
    {
      documentId: "us-2-companion",
      jurisdiction: "united_states",
      publicationDate: "2025-08-01",
      machineCreatedAt: "2026-04-15T12:00:00Z",
      bindingStrength: "voluntary_commitment",
      corpusRole: "companion_resource",
      lifecycleStage: "active",
      policyConfidence: 0.85,
      dominantFrameConfidence: 0.8,
      overallConfidence: 0.82,
      safetyRequirements: [{ label: "human_oversight" }],
      enforcementMechanisms: [],
      dominantFrame: "innovation_enablement",
      frameConfidence: { innovation_enablement: 0.85 },
    },
    {
      documentId: "eu-1",
      jurisdiction: "european_union",
      publicationDate: "2024-06-13",
      machineCreatedAt: "2026-04-15T12:00:00Z",
      bindingStrength: "binding_law",
      corpusRole: "primary_instrument",
      lifecycleStage: "active",
      policyConfidence: 0.92,
      dominantFrameConfidence: 0.88,
      overallConfidence: 0.9,
      safetyRequirements: [
        { label: "risk_assessment" },
        { label: "transparency_disclosure" },
      ],
      enforcementMechanisms: [{ label: "civil_penalty" }],
      dominantFrame: "fundamental_rights",
      frameConfidence: {
        fundamental_rights: 0.85,
        consumer_public_safety: 0.45,
      },
    },
    {
      documentId: "cn-1",
      jurisdiction: "china",
      publicationDate: "2026-04-10",
      machineCreatedAt: "2026-04-15T12:00:00Z",
      bindingStrength: "binding_law",
      corpusRole: "primary_instrument",
      lifecycleStage: "active",
      policyConfidence: 0.55,
      dominantFrameConfidence: 0.82,
      overallConfidence: 0.68,
      safetyRequirements: [{ label: "registration_licensing" }],
      enforcementMechanisms: [{ label: "licensing_requirement" }],
      dominantFrame: "social_stability",
      frameConfidence: { social_stability: 0.95, national_security: 0.35 },
    },
    {
      documentId: "jp-1",
      jurisdiction: "japan",
      publicationDate: "2025-03-01",
      machineCreatedAt: "2026-04-15T12:00:00Z",
      bindingStrength: "voluntary_commitment",
      corpusRole: "primary_instrument",
      lifecycleStage: "active",
      policyConfidence: 0.85,
      dominantFrameConfidence: 0.82,
      overallConfidence: 0.84,
      safetyRequirements: [{ label: "human_oversight" }],
      enforcementMechanisms: [{ label: "soft_enforcement" }],
      dominantFrame: "innovation_enablement",
      frameConfidence: {
        innovation_enablement: 0.88,
        economic_competitiveness: 0.42,
      },
    },
    {
      documentId: "kr-1",
      jurisdiction: "south_korea",
      publicationDate: "2026-01-22",
      machineCreatedAt: "2026-04-15T12:00:00Z",
      bindingStrength: "binding_law",
      corpusRole: "primary_instrument",
      lifecycleStage: "adopted_not_yet_effective",
      policyConfidence: 0.88,
      dominantFrameConfidence: 0.72,
      overallConfidence: 0.8,
      safetyRequirements: [
        { label: "risk_assessment" },
        { label: "transparency_disclosure" },
      ],
      enforcementMechanisms: [{ label: "regulatory_supervision" }],
      dominantFrame: "fundamental_rights",
      frameConfidence: { fundamental_rights: 0.7, innovation_enablement: 0.5 },
    },
  ];

  // Deterministic reproducibility across runs (seeded Mulberry32)
  const runA = computeScoringEngine(sampleDocs, "headline");
  const runB = computeScoringEngine(sampleDocs, "headline");
  assert.deepEqual(runA.nullCalibration, runB.nullCalibration);
  assert.deepEqual(runA.sensitivityGrid, runB.sensitivityGrid);
  assert.equal(runA.nullCalibration.permutations, PERMUTATION_DRAWS);
  assert.equal(BOOTSTRAP_RESAMPLES, 200);

  // Headline excludes us-2-companion while preserving totalCorpusCount === 2
  const usHeadline = runA.byJurisdiction.get("united_states")!;
  assert.equal(usHeadline.documentCount, 1);
  assert.equal(usHeadline.totalCorpusCount, 2);
  assert.equal(runA.includedDocumentCount, 5);

  // All mode includes us-2-companion
  const allOut = computeScoringEngine(sampleDocs, "all");
  assert.equal(allOut.byJurisdiction.get("united_states")?.documentCount, 2);
  assert.equal(allOut.includedDocumentCount, 6);

  for (const out of [runA, allOut]) {
    assert.equal(out.minPublicationYear, 2024);
    assert.equal(out.maxPublicationYear, 2026);
    assert.equal(out.timeline.length, 3);
    assert.equal(out.sensitivityGrid.length, 4);
    assert.equal(out.sensitivityGrid[0].spearmanVsHeadline, 1);
    assert.ok(out.findings.length >= 1);

    for (const [key, score] of out.byJurisdiction.entries()) {
      const expectedCmp = Math.round(
        COMPOSITE_WEIGHTS.policy * score.rawPolicyDivergence +
          COMPOSITE_WEIGHTS.framing * score.rawFramingDivergence,
      );
      assert.equal(
        score.compositeDivergence,
        expectedCmp,
        `${key}: CMP must equal round(0.6*rawPOL + 0.4*rawFRM)`,
      );

      const mixTotal = score.frameMix.reduce((sum, item) => sum + item.value, 0);
      assert.equal(mixTotal, 100, `${key}: frameMix must sum to 100`);

      assert.ok(score.policyCI.low <= score.policyCI.high);
      assert.ok(score.framingCI.low <= score.framingCI.high);
      assert.ok(score.compositeCI.low <= score.compositeCI.high);
      assert.ok(score.coverageCI.low <= score.coverageCI.high);

      assert.ok(
        Math.abs(
          POLICY_COMPONENT_WEIGHTS.requirements +
            POLICY_COMPONENT_WEIGHTS.enforcement +
            POLICY_COMPONENT_WEIGHTS.binding -
            1,
        ) < 1e-9,
      );
    }

    assert.equal(out.byJurisdiction.get("china")?.lowConfidenceCount, 1);
    assert.equal(out.byJurisdiction.get("china")?.bindingLawCount, 1);
  }

  assert.equal(spearmanRankCorrelation([10, 20, 30, 40, 50], [1, 2, 3, 4, 5]), 1);
  assert.equal(
    spearmanRankCorrelation([10, 20, 30, 40, 50], [5, 4, 3, 2, 1]),
    -1,
  );
});

test("quote-matcher handles exact, NFKC/whitespace/PDF-hyphenation, persisted offsets, approximate, and not_found (C4)", () => {
  const pdfSection =
    "Article 12: Providers shall establish risk manage-\nment   systems（including testing）before deployment.";

  // Hyphenated line break + collapsed whitespace + fullwidth CJK parens -> exact original offsets
  const normMatch = matchQuoteInText(
    pdfSection,
    "Providers shall establish risk management systems (including testing)",
  );
  assert.ok(normMatch);
  assert.equal(normMatch.status, "verbatim");
  const sliced = pdfSection.slice(normMatch.startChar, normMatch.endChar);
  assert.ok(sliced.startsWith("Providers shall establish risk manage-"));
  assert.ok(sliced.endsWith("（including testing）"));

  // Persisted v2 offsets honored ONLY when sliced text matches the quote
  const persistedMatch = matchQuoteInText(pdfSection, "Article 12:", {
    startChar: 0,
    endChar: 11,
  });
  assert.deepEqual(persistedMatch, {
    startChar: 0,
    endChar: 11,
    status: "verbatim",
  });

  // Shifted/mismatched persisted offsets MUST be rejected and re-matched to true span
  const shiftedOffsets = matchQuoteInText(
    pdfSection,
    "before deployment.",
    { startChar: 0, endChar: 10 },
  );
  assert.ok(shiftedOffsets);
  assert.equal(shiftedOffsets.status, "verbatim");
  assert.equal(
    pdfSection.slice(shiftedOffsets.startChar, shiftedOffsets.endChar),
    "before deployment.",
  );

  // Completely unrelated quote with bogus persisted offsets MUST NOT mark verbatim
  const bogusPersisted = matchQuoteInText(
    pdfSection,
    "quantum cryptography export moratorium",
    { startChar: 0, endChar: 10 },
  );
  assert.equal(bogusPersisted, null);

  // Across multiple sections: prefers verbatim match in section 2
  const multi = findQuoteAcrossSections(
    [
      { content: "Introductory preamble without the clause." },
      { content: pdfSection },
    ],
    "risk management systems (including testing)",
  );
  assert.equal(multi.sectionIndex, 1);
  assert.equal(multi.status, "verbatim");

  // Missing text returns not_found
  const missing = findQuoteAcrossSections(
    [{ content: "Completely unrelated statutory text." }],
    "quantum cryptography export moratorium",
  );
  assert.equal(missing.status, "not_found");
  assert.equal(missing.sectionIndex, -1);
});

test("precision-aware date formatters never fabricate January 1 for year-only dates (A8)", () => {
  assert.equal(inferDatePrecision("2025"), "year");
  assert.equal(inferDatePrecision("2025-04"), "month");
  assert.equal(inferDatePrecision("2025-04-10"), "day");

  const jan1Ts = Date.UTC(2025, 0, 1);
  assert.equal(formatLongDate(jan1Ts, "year"), "2025");
  assert.equal(formatShortDate(jan1Ts, "year"), "2025");
  assert.ok(!formatLongDate(jan1Ts, "year").includes("January"));

  const aprTs = Date.UTC(2025, 3, 1);
  assert.equal(formatLongDate(aprTs, "month"), "April 2025");
  assert.equal(formatShortDate(aprTs, "month"), "Apr 2025");

  const exactTs = Date.UTC(2026, 3, 10);
  assert.equal(formatLongDate(exactTs, "day"), "April 10, 2026");
  assert.equal(formatShortDate(exactTs, "day"), "Apr 10, 26");
});

test("CSV (UTF-8 BOM + canonical keys + 8 frames) and versioned BibTeX formatters (C8)", () => {
  const csv = formatDocumentsAsCsv([
    {
      id: "doc_1",
      title: '=CMD("calc"), "quoted"',
      jurisdictionKey: "united_states",
      jurisdiction: "United States",
      jurisdictionShort: "US",
      publicationDateIso: "2026-04-01",
      publicationDatePrecision: "day",
      effectiveDateIso: null,
      languageCode: "en",
      issuingBody: "NIST",
      documentTypeKey: "standards_guideline",
      bindingStrengthKey: "standards_guideline",
      corpusRoleKey: "primary_instrument",
      lifecycleStageKey: "active",
      dominantFrame: "consumer_public_safety",
      overallConfidence: 0.88,
      groundingRatio: 0.95,
      model: "claude-sonnet-4-6",
      promptHashes: "abc123",
      taxonomyVersion: "2.1.0",
      frameScores: {
        consumer_public_safety: 0.9,
        innovation_enablement: 0.4,
      },
      safetyRequirements: ["risk_assessment", "red_teaming"],
      enforcementMechanisms: ["soft_enforcement"],
      sourceUrl: "https://www.nist.gov/ai",
    },
  ]);

  // UTF-8 BOM prefix for Excel CJK compatibility
  assert.ok(csv.startsWith("\uFEFFdocument_id,jurisdiction,jurisdiction_code,title,"));
  assert.ok(csv.includes("frame_existential_catastrophic"));
  assert.ok(csv.includes("frame_labor_transition"));
  assert.ok(csv.includes("model_self_reported_confidence,grounding_ratio,model,prompt_hashes,taxonomy_version"));
  assert.ok(csv.includes("\"'=CMD(\"\"calc\"\"), \"\"quoted\"\"\""));
  assert.ok(csv.includes(",united_states,US,"));
  assert.ok(csv.includes(",standards_guideline,standards_guideline,primary_instrument,active,"));

  const bib = formatDocumentsAsBibtex(
    [
      {
        id: "eu-ai-act",
        title: "Regulation (EU) 2024/1689 & Transparency 100%",
        jurisdictionKey: "european_union",
        jurisdiction: "European Union",
        jurisdictionShort: "EU",
        publicationDateIso: "2024-06-13",
        publicationDatePrecision: "day",
        effectiveDateIso: "2024-08-01",
        languageCode: "en",
        issuingBody: "European Parliament & Council",
        documentTypeKey: "legislation",
        bindingStrengthKey: "binding_law",
        corpusRoleKey: "primary_instrument",
        lifecycleStageKey: "active",
        dominantFrame: "fundamental_rights",
        overallConfidence: 0.91,
        groundingRatio: 0.96,
        model: "claude-sonnet-4-6",
        promptHashes: null,
        taxonomyVersion: "2.1.0",
        frameScores: { fundamental_rights: 0.95 },
        safetyRequirements: ["risk_assessment"],
        enforcementMechanisms: ["civil_penalty"],
        sourceUrl: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
      },
      {
        id: "unsafe-url-doc",
        title: "Unsafe URL Test",
        jurisdictionKey: "united_states",
        jurisdiction: "United States",
        jurisdictionShort: "US",
        publicationDateIso: "2026-01-01",
        publicationDatePrecision: "day",
        effectiveDateIso: null,
        languageCode: "en",
        issuingBody: "NIST",
        documentTypeKey: "standards_guideline",
        bindingStrengthKey: "standards_guideline",
        corpusRoleKey: null,
        lifecycleStageKey: null,
        dominantFrame: "consumer_public_safety",
        overallConfidence: 0.8,
        groundingRatio: null,
        model: null,
        promptHashes: null,
        taxonomyVersion: "1.0-legacy",
        frameScores: {},
        safetyRequirements: [],
        enforcementMechanisms: [],
        sourceUrl: "javascript:alert(1)",
      },
    ],
    {
      datasetVersion: "2026-04-15",
      latestPublicationDate: "April 10, 2026",
      taxonomyVersion: "1.0-legacy",
    },
  );

  assert.ok(bib.includes("@misc{project_babel_observatory_2026"));
  assert.ok(bib.includes("version      = {2026-04-15}"));
  assert.ok(bib.includes("latest source publication April 10, 2026"));
  assert.ok(bib.includes("@techreport{eu_ai_act"));
  assert.ok(bib.includes("\\&"));
  assert.ok(bib.includes("\\%"));
  assert.ok(!bib.includes("javascript:alert"));

  const blocks = bib.split("\n\n");
  assert.equal(blocks.length, 3);
  for (const block of blocks) {
    const lines = block.split("\n");
    assert.ok(lines[0].startsWith("@") && lines[0].endsWith(","));
    assert.equal(lines[lines.length - 1], "}");
    const fieldLines = lines.slice(1, -1);
    for (let i = 0; i < fieldLines.length - 1; i += 1) {
      assert.ok(fieldLines[i].endsWith(","), `Missing comma: ${fieldLines[i]}`);
    }
    assert.ok(!fieldLines[fieldLines.length - 1].endsWith(","));
  }

  const standaloneBib = formatObservatoryBibtex({
    datasetVersion: "2026-04-15",
    latestPublicationDate: "April 10, 2026",
    documentCount: 103,
    taxonomyVersion: "1.0-legacy",
  });
  assert.ok(standaloneBib.includes("Taxonomy 1.0-legacy"));
});

test("taxonomy-vocab and frame-vocab stay synced with data/taxonomies/label-definitions.json (A13)", () => {
  const defsPath = path.resolve(
    process.cwd(),
    "..",
    "..",
    "data",
    "taxonomies",
    "label-definitions.json",
  );
  if (existsSync(defsPath)) {
    const raw = JSON.parse(readFileSync(defsPath, "utf8")) as {
      thresholds: {
        grounding_pass_threshold: number;
        low_confidence_policy: number;
        low_confidence_framing: number;
        frame_mention_floor: number;
      };
      categories: {
        risk_framings: Record<
          string,
          { definition?: string; include_when?: string; exclude_when?: string }
        >;
      };
    };
    assert.equal(
      CANONICAL_THRESHOLDS.groundingPass,
      raw.thresholds.grounding_pass_threshold,
    );
    assert.equal(
      CANONICAL_THRESHOLDS.lowConfidencePolicy,
      raw.thresholds.low_confidence_policy,
    );
    assert.equal(
      CANONICAL_THRESHOLDS.lowConfidenceFraming,
      raw.thresholds.low_confidence_framing,
    );
    assert.equal(
      CANONICAL_THRESHOLDS.frameMentionFloor,
      raw.thresholds.frame_mention_floor,
    );

    for (const frame of allFrameLabels) {
      const def = raw.categories.risk_framings[frame];
      assert.ok(def, `Missing frame ${frame} in label-definitions.json`);
      assert.equal(frameDefinition[frame].long, def.definition);
      assert.equal(frameDefinition[frame].includeWhen, def.include_when);
      assert.equal(frameDefinition[frame].excludeWhen, def.exclude_when);
    }

    // Reskilling explicitly excluded from economic_competitiveness and routed to labor_transition
    assert.match(
      frameDefinition.economic_competitiveness.excludeWhen.toLowerCase(),
      /reskilling|labor_transition/,
    );
    assert.match(
      frameDefinition.labor_transition.includeWhen.toLowerCase(),
      /reskilling|retraining/,
    );
  }

  // Sequential single-hue null-calibrated band helpers
  assert.equal(scoreBandWithNull(12, 18, 26, "country"), "within_null");
  assert.equal(scoreBandWithNull(20, 18, 26, "country"), "above_null");
  assert.equal(scoreBandWithNull(30, 18, 26, "country"), "strong_divergence");
  assert.equal(scoreHexDark(30, 18, 26, "country"), "#67e8f9");

  // CJK typography and HTML lang guards (C3)
  assert.equal(isCjkText("生成式人工智能服务管理暂行办法"), true);
  assert.equal(isCjkText("인공지능 발전과 신뢰 기반 조성 등에 관한 기본법"), true);
  assert.equal(isCjkText("Artificial Intelligence Act"), false);
  assert.equal(toHtmlLang("Chinese"), "zh");
  assert.equal(toHtmlLang("ja"), "ja");
  assert.equal(toHtmlLang("Korean"), "ko");
});

test("seedData and buildEmptyOverviewData obey exact invariants (A1)", () => {
  const empty = buildEmptyOverviewData("headline");
  assert.equal(empty.hasData, false);
  assert.equal(empty.countries.length, 0);
  assert.equal(empty.summary.publishedSources, 0);

  const totalDocs = seedData.countries.reduce(
    (sum, c) => sum + c.reviewedDocuments,
    0,
  );
  assert.equal(totalDocs, seedData.summary.publishedSources);

  for (const country of seedData.countries) {
    const mixSum = country.frameMix.reduce((sum, f) => sum + f.value, 0);
    assert.equal(mixSum, 100, `seedData ${country.slug} frameMix must sum to 100`);
    const expectedCmp = Math.round(
      0.6 * country.rawPolicyDivergence + 0.4 * country.rawFramingDivergence,
    );
    assert.equal(
      country.compositeDivergence,
      expectedCmp,
      `seedData ${country.slug} CMP invariant`,
    );
  }
});

test("safeExternalUrl allows only http(s) URLs and rejects XSS/dangerous protocols", () => {
  assert.equal(
    safeExternalUrl("https://eur-lex.europa.eu/eli/reg/2024/1689/oj"),
    "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
  );
  assert.equal(
    safeExternalUrl("http://example.gov/doc.pdf"),
    "http://example.gov/doc.pdf",
  );
  assert.equal(safeExternalUrl("javascript:alert(1)"), null);
  assert.equal(safeExternalUrl("JAVASCRIPT:alert(1)"), null);
  assert.equal(
    safeExternalUrl("data:text/html,<script>alert(1)</script>"),
    null,
  );
  assert.equal(safeExternalUrl("file:///etc/passwd"), null);
  assert.equal(safeExternalUrl("//evil.com/path"), null);
  assert.equal(safeExternalUrl(""), null);
  assert.equal(safeExternalUrl(null), null);
});
