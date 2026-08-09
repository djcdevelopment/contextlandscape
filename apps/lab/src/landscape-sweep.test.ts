import {
  ATTENTION_V2_COMMANDER_PROFILE_COUNT,
  ATTENTION_V2_RULE_FACTOR_NAMES,
  AttentionV2CommanderCatalogSchema,
  AttentionV2FactorCatalogSchema,
  AttentionV2ModelCatalogSchema,
  AttentionV2RunPlannerIdentitySchema,
  AttentionV2StageModelCatalogSchema,
  AttentionV2SweepBudgetSchema,
  AttentionV2SweepPlanSchema,
  type AttentionV2RuleShape,
  type AttentionV2SweepStage
} from "@landscape/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ATTENTION_V2_FACTOR_CATALOG_HASH,
  ATTENTION_V2_SPARSE_BATTLE_SAMPLE_COUNT,
  LANDSCAPE_SWEEP_EXECUTION_STATUS,
  LANDSCAPE_SWEEP_PLANNER_VERSION,
  LANDSCAPE_SWEEP_REQUIRED_RESOLVER,
  attentionV2StandardRunFormulas,
  analyzeAttentionV2MainEffectDesign,
  compileAttentionV2RunPlanner,
  createAttentionV2PairBlockId,
  createAttentionV2RunPlannerIdentity,
  createAttentionV2SweepPlan,
  createAttentionV2SweepSkeleton,
  materializeAttentionV2StageModel,
  summarizeAttentionV2Sweep,
  verifyAttentionV2SweepSkeleton,
  verifyAttentionV2SweepPlan,
  type CreateLandscapeSweepPlanOptions,
  type LandscapeSweepSkeleton
} from "./landscape-sweep.js";
import { sha256Value, type Sha256Digest } from "./provenance.js";

const parentV1ModelHash = sha256Value("duel-capacity-v1-model");
let skeleton: LandscapeSweepSkeleton;

beforeAll(() => {
  skeleton = createAttentionV2SweepSkeleton(parentV1ModelHash);
}, 60_000);

function hashWithout<T extends Record<string, unknown>, K extends keyof T>(value: T, key: K): Sha256Digest {
  const draft = { ...value };
  delete draft[key];
  return sha256Value(draft);
}

function options(): CreateLandscapeSweepPlanOptions {
  return {
    parentV1ManifestHash: sha256Value("parent-v1-manifest"),
    parentV1ReportHash: sha256Value("parent-v1-report"),
    parentV1ModelHash,
    createdAt: "2026-08-09T00:00:00.000Z",
    budgetProfile: "standard",
    seedStart: 10_000
  };
}

describe("attention-v2 commander landscape planner", () => {
  it("materializes the 18-factor catalog and 40 hash-bound, balanced model rows", () => {
    expect(AttentionV2FactorCatalogSchema.parse(skeleton.factorCatalog)).toEqual(skeleton.factorCatalog);
    expect(skeleton.factorCatalog.catalogHash).toBe(hashWithout(skeleton.factorCatalog, "catalogHash"));
    expect(skeleton.factorCatalog.catalogHash).toBe(ATTENTION_V2_FACTOR_CATALOG_HASH);

    const models = AttentionV2ModelCatalogSchema.parse(skeleton.modelCatalog);
    expect(models.models).toHaveLength(40);
    expect(models.models.map((model) => model.designRow)).toEqual(Array.from({ length: 40 }, (_, row) => row));
    expect(models.models.filter((model) => model.role === "design")).toHaveLength(36);
    for (const role of ["v1-bridge", "core-sentinel", "all-on-sentinel", "fast-follower-sentinel"] as const) {
      expect(models.models.filter((model) => model.role === role)).toHaveLength(1);
    }
    expect(new Set(models.models.map((model) => model.ruleShapeHash)).size).toBe(40);
    expect(models.models.every((model) => model.ruleShapeHash === sha256Value(model.ruleShape))).toBe(true);
    expect(models.designDiagnostics.mainEffectRank).toBe(37);
    expect(models.designDiagnostics.maxAbsoluteAlias).toBeLessThanOrEqual(0.75);
    expect(analyzeAttentionV2MainEffectDesign(models.models.map((model) => model.ruleShape))).toEqual({
      mainEffectColumns: 37,
      mainEffectRank: 37,
      maxAbsoluteAlias: models.designDiagnostics.maxAbsoluteAlias
    });
    expect(models.catalogHash).toBe(hashWithout(models, "catalogHash"));

    const design = models.models.filter((model) => model.role === "design");
    for (const factor of ATTENTION_V2_RULE_FACTOR_NAMES) {
      const counts = new Map<string, number>();
      for (const model of design) {
        const level = String(model.ruleShape[factor as keyof AttentionV2RuleShape]);
        counts.set(level, (counts.get(level) ?? 0) + 1);
      }
      expect([...counts.values()].sort((left, right) => left - right)).toEqual([12, 12, 12]);
    }
  });

  it("materializes all 6,400 normalized commander module products", () => {
    const catalog = AttentionV2CommanderCatalogSchema.parse(skeleton.commanderCatalog);
    expect(catalog.profiles).toHaveLength(ATTENTION_V2_COMMANDER_PROFILE_COUNT);
    expect(new Set(catalog.profiles.map((profile) => profile.commanderId)).size).toBe(6_400);
    expect(new Set(catalog.profiles.map((profile) => profile.profileHash)).size).toBe(6_400);
    expect(catalog.profiles.map((profile) => profile.ordinal)).toEqual(Array.from({ length: 6_400 }, (_, ordinal) => ordinal));
    expect(catalog.catalogHash).toBe(hashWithout(catalog, "catalogHash"));
  });

  it("binds six fixed-design edge catalogs with disjoint non-self pairs", () => {
    const counts = Object.fromEntries(skeleton.edgeCatalogs.map((catalog) => [catalog.stage, {
      base: catalog.baseEdges.length,
      oriented: catalog.edges.length,
      degree: catalog.degree,
      self: catalog.edges.filter((edge) => edge.stratum === "self-play").length
    }]));
    expect(counts).toEqual({
      "shape-screen": { base: 25_600, oriented: 57_600, degree: 8, self: 6_400 },
      "survivor-refinement": { base: 25_600, oriented: 57_600, degree: 8, self: 6_400 },
      "sparse-volume-drill-down": { base: 256, oriented: 512, degree: 0, self: 0 },
      "full-volume-sentinel-audit": { base: 4, oriented: 8, degree: 0, self: 0 },
      "landscape-holdout": { base: 12_800, oriented: 25_600, degree: 4, self: 0 },
      "gate-confirmation": { base: 10, oriented: 20, degree: 0, self: 0 }
    });
    const pairHashes = skeleton.edgeCatalogs.flatMap((catalog) => catalog.baseEdges.map((edge) => edge.pairHash));
    expect(new Set(pairHashes).size).toBe(pairHashes.length);
    expect(skeleton.edgeCatalogs.flatMap((catalog) => catalog.edges).every((edge) =>
      edge.samplingWeight.kind === "fixed-design" && edge.samplingWeight.analysisWeight === 1
    )).toBe(true);
    for (const catalog of skeleton.edgeCatalogs) expect(catalog.catalogHash).toBe(hashWithout(catalog, "catalogHash"));
  });

  it("uses a real 256-member subset of the complete 32-cubed battle frame", () => {
    expect(skeleton.battleSamples).toHaveLength(32 ** 3);
    expect(new Set(skeleton.battleSamples.map((sample) => sample.sampleId)).size).toBe(32 ** 3);
    expect(new Set(skeleton.battleSamples.map((sample) => `${sample.coordinate.x},${sample.coordinate.y},${sample.coordinate.z}`)).size).toBe(32 ** 3);
    expect(skeleton.sparseBattleSamples).toHaveLength(ATTENTION_V2_SPARSE_BATTLE_SAMPLE_COUNT);

    const frame = new Map(skeleton.battleSamples.map((sample) => [sample.sampleId, sample.sampleHash]));
    expect(new Set(skeleton.sparseBattleSamples.map((entry) => entry.sample.sampleId)).size).toBe(256);
    expect(skeleton.sparseBattleSamples.every((entry) => frame.get(entry.sample.sampleId) === entry.sample.sampleHash)).toBe(true);
    expect(new Set(skeleton.sparseBattleSamples.map((entry) => [
      entry.sample.generator.spatialPressure,
      entry.sample.generator.formationGeometry,
      entry.sample.generator.informationPressure
    ].join(","))).size).toBe(256);
    expect(Object.fromEntries(skeleton.battleSampleCatalogs.map((catalog) => [catalog.stage, catalog.samples.length]))).toEqual({
      "shape-screen": 1,
      "survivor-refinement": 1,
      "sparse-volume-drill-down": 256,
      "full-volume-sentinel-audit": 32_768,
      "landscape-holdout": 8,
      "gate-confirmation": 1
    });
  });

  it("hashes actual edge/sample membership into four frozen fold assignments", () => {
    expect(skeleton.folds.map((fold) => fold.fold)).toEqual(["train", "refine", "drill", "holdout"]);
    expect(skeleton.folds.find((fold) => fold.fold === "holdout")?.selectable).toBe(false);
    expect(skeleton.folds.filter((fold) => fold.fold !== "holdout").every((fold) => fold.selectable)).toBe(true);
    expect(new Set(skeleton.folds.flatMap((fold) => fold.stages)).size).toBe(6);
    for (const fold of skeleton.folds) expect(fold.assignmentHash).toBe(hashWithout(fold, "assignmentHash"));
    expect(skeleton.foldAssignmentHash).toBe(sha256Value(skeleton.folds));
    expect(() => verifyAttentionV2SweepSkeleton(skeleton)).not.toThrow();
  });

  it("proves each frozen budget from its multiplicative stage operands", () => {
    expect(Object.fromEntries(skeleton.budgets.map((budget) => [budget.profile, budget.plannedRuns]))).toEqual({
      lean: 5_949_088,
      standard: 30_008_992,
      deep: 153_570_624
    });
    for (const budget of skeleton.budgets) {
      expect(AttentionV2SweepBudgetSchema.parse(budget)).toEqual(budget);
      for (const stage of budget.stages) {
        const factors = stage.factors;
        expect(stage.plannedRuns).toBe(factors.modelRows * factors.matchupCells * factors.battleSamplesPerMatchup * factors.seedsPerCell);
      }
    }
    expect(attentionV2StandardRunFormulas).toEqual({
      "shape-screen": "40 * 57,600 * 1 * 4",
      "survivor-refinement": "24 * 57,600 * 1 * 8",
      "sparse-volume-drill-down": "3 * 512 * 256 * 8",
      "full-volume-sentinel-audit": "3 * 8 * 32,768 * 2",
      "landscape-holdout": "3 * 25,600 * 8 * 8",
      "gate-confirmation": "1 * 20 * 1 * 5,000"
    });
  });

  it("builds one standard plan with common-world blocks instead of one seed per run", () => {
    const plan = createAttentionV2SweepPlan(options(), skeleton);
    expect(AttentionV2SweepPlanSchema.parse(plan)).toEqual(plan);
    expect(plan.planHash).toBe(hashWithout(plan, "planHash"));
    expect(plan.executionStatus).toBe(LANDSCAPE_SWEEP_EXECUTION_STATUS);
    expect(plan.requiredResolver).toBe(LANDSCAPE_SWEEP_REQUIRED_RESOLVER);
    expect(plan.plannerVersion).toBe(LANDSCAPE_SWEEP_PLANNER_VERSION);
    expect(plan.budget.plannedRuns).toBe(30_008_992);
    expect(plan.worldBlocks.map((block) => block.seedsPerCell)).toEqual([4, 8, 8, 2, 8, 5_000]);
    expect(plan.worldBlocks.map((block) => block.seedStart)).toEqual([10_000, 10_004, 10_012, 10_020, 10_022, 10_030]);
    expect(plan.worldBlocks.every((block) => block.pairedAcross.join("|") === "model-row|seat-orientation")).toBe(true);
    for (const block of plan.worldBlocks) expect(block.blockHash).toBe(hashWithout(block, "blockHash"));
    const pair = skeleton.edgeCatalogs[0].baseEdges[0];
    const sample = skeleton.battleSampleCatalogs[0].samples[0];
    const pairBlockId = createAttentionV2PairBlockId(pair.pairHash, sample.sampleId, plan.worldBlocks[0].seedStart);
    expect(pairBlockId).toBe(createAttentionV2PairBlockId(pair.pairHash, sample.sampleId, plan.worldBlocks[0].seedStart));
    expect(pairBlockId).not.toBe(createAttentionV2PairBlockId(pair.pairHash, sample.sampleId, plan.worldBlocks[0].seedStart + 1));
    expect(plan.planner.modelCatalogHash).toBe(skeleton.modelCatalog.catalogHash);
    expect(plan.stageModelSets.map((modelSet) => [modelSet.stage, modelSet.modelCount, modelSet.materializationStatus])).toEqual([
      ["shape-screen", 40, "materialized"],
      ["survivor-refinement", 24, "pending-selection"],
      ["sparse-volume-drill-down", 3, "pending-selection"],
      ["full-volume-sentinel-audit", 3, "pending-selection"],
      ["landscape-holdout", 3, "pending-selection"],
      ["gate-confirmation", 1, "pending-selection"]
    ]);
    expect(plan.parentPlanHash).toBeNull();
    expect(plan.stageModelSets.map((modelSet) => modelSet.dependencies[0] ?? null)).toEqual([
      null,
      { upstreamStage: "shape-screen", relation: "derived-from" },
      { upstreamStage: "survivor-refinement", relation: "selected-from" },
      { upstreamStage: "sparse-volume-drill-down", relation: "exact-reuse" },
      { upstreamStage: "full-volume-sentinel-audit", relation: "selected-from" },
      { upstreamStage: "landscape-holdout", relation: "confirmation-of" }
    ]);
    expect(plan.stageModelSets.every((modelSet) => modelSet.rootModelCatalogHash === skeleton.modelCatalog.catalogHash)).toBe(true);
    expect(plan.stageModelSets[0].materializationStatus).toBe("materialized");
    if (plan.stageModelSets[0].materializationStatus === "materialized") {
      expect(plan.stageModelSets[0].catalogHash).toBe(skeleton.modelCatalog.catalogHash);
      expect(plan.stageModelSets[0].modelSetHash).not.toBe(plan.stageModelSets[0].catalogHash);
    }
    const prematureSentinel = {
      ...plan,
      stageModelSets: plan.stageModelSets.map((modelSet) => modelSet.stage !== "full-volume-sentinel-audit" ? modelSet : {
        schemaVersion: 1 as const,
        modelVersion: modelSet.modelVersion,
        stage: modelSet.stage,
        modelCount: modelSet.modelCount,
        selectionProtocolHash: modelSet.selectionProtocolHash,
        rootModelCatalogHash: modelSet.rootModelCatalogHash,
        materializationStatus: "materialized" as const,
        modelSetId: "premature-sentinel",
        modelSetHash: sha256Value("premature-sentinel-models"),
        catalogHash: sha256Value("premature-sentinel-catalog"),
        selectionReportHash: sha256Value("premature-sentinel-selection"),
        dependencies: [{
          upstreamStage: "sparse-volume-drill-down" as const,
          relation: "exact-reuse" as const,
          upstreamModelSetHash: sha256Value("unmaterialized-upstream"),
          upstreamSelectionReportHash: sha256Value("premature-sentinel-selection")
        }]
      })
    };
    expect(AttentionV2SweepPlanSchema.safeParse(prematureSentinel).success).toBe(false);
    expect(() => verifyAttentionV2SweepPlan(plan, skeleton)).not.toThrow();

    const shapeEdges = skeleton.edgeCatalogs.find((catalog) => catalog.stage === "shape-screen")!;
    const firstPairHash = shapeEdges.baseEdges[0].pairHash;
    const seats = shapeEdges.edges.filter((edge) => edge.pairHash === firstPairHash);
    const shapeSample = skeleton.battleSampleCatalogs.find((catalog) => catalog.stage === "shape-screen")!.samples[0];
    const runPlanner = compileAttentionV2RunPlanner(plan, skeleton);
    expect(runPlanner.preflightVerifications).toBe(1);
    expect(runPlanner.indexedModels).toBe(40);
    expect(runPlanner.indexedEdges).toBe(skeleton.edgeCatalogs.reduce((sum, catalog) => sum + catalog.edges.length, 0));
    expect(runPlanner.indexedBattleSamples).toBe(skeleton.battleSampleCatalogs.reduce((sum, catalog) => sum + catalog.samples.length, 0));
    const firstRun = createAttentionV2RunPlannerIdentity(runPlanner, {
      stage: "shape-screen",
      modelId: skeleton.modelCatalog.models[0].modelId,
      edgeId: seats[0].edgeId,
      battleSampleId: shapeSample.sampleId,
      seed: plan.worldBlocks[0].seedStart
    });
    const pairedRun = createAttentionV2RunPlannerIdentity(runPlanner, {
      stage: "shape-screen",
      modelId: skeleton.modelCatalog.models[1].modelId,
      edgeId: seats[1].edgeId,
      battleSampleId: shapeSample.sampleId,
      seed: plan.worldBlocks[0].seedStart
    });
    expect(AttentionV2RunPlannerIdentitySchema.parse(firstRun)).toEqual(firstRun);
    expect(firstRun.pairBlockId).toBe(pairedRun.pairBlockId);
    expect(firstRun.randomStreamId).toBe(firstRun.pairBlockId);
    expect(() => createAttentionV2RunPlannerIdentity(runPlanner, {
      stage: "survivor-refinement",
      modelId: "not-yet-selected",
      edgeId: skeleton.edgeCatalogs.find((catalog) => catalog.stage === "survivor-refinement")!.edges[0].edgeId,
      battleSampleId: skeleton.battleSampleCatalogs.find((catalog) => catalog.stage === "survivor-refinement")!.samples[0].sampleId,
      seed: plan.worldBlocks[1].seedStart
    })).toThrow(/not materialized/);
    for (let index = 0; index < 1_000; index += 1) {
      createAttentionV2RunPlannerIdentity(runPlanner, {
        stage: "shape-screen",
        modelId: skeleton.modelCatalog.models[index % 40].modelId,
        edgeId: seats[index % 2].edgeId,
        battleSampleId: shapeSample.sampleId,
        seed: plan.worldBlocks[0].seedStart + (index % 4)
      });
    }
    expect(runPlanner.preflightVerifications).toBe(1);
    const originalPlannerModelHash = plan.planner.modelCatalogHash;
    const originalPairHash = seats[0].pairHash;
    try {
      plan.planner.modelCatalogHash = sha256Value("mutated-plan-after-preflight");
      seats[0].pairHash = sha256Value("mutated-edge-after-preflight");
      expect(createAttentionV2RunPlannerIdentity(runPlanner, {
        stage: "shape-screen",
        modelId: skeleton.modelCatalog.models[0].modelId,
        edgeId: seats[0].edgeId,
        battleSampleId: shapeSample.sampleId,
        seed: plan.worldBlocks[0].seedStart
      })).toEqual(firstRun);
    } finally {
      plan.planner.modelCatalogHash = originalPlannerModelHash;
      seats[0].pairHash = originalPairHash;
    }
    expect(() => createAttentionV2SweepPlan({ ...options(), budgetProfile: "lean" }, skeleton)).toThrow(/sizing envelopes/);
  }, 30_000);

  it("rejects a one-field catalog tamper before producing a plan", () => {
    const tampered: LandscapeSweepSkeleton = {
      ...skeleton,
      edgeCatalogs: [{ ...skeleton.edgeCatalogs[0], catalogHash: sha256Value("tampered") }, ...skeleton.edgeCatalogs.slice(1)]
    };
    expect(() => createAttentionV2SweepPlan(options(), tampered)).toThrow(/edge catalog shape-screen hash mismatch/);

    const standard = skeleton.budgets.find((budget) => budget.profile === "standard")!;
    const bad = {
      ...standard,
      stages: standard.stages.map((stage) => stage.stage === "shape-screen"
        ? { ...stage, factors: { ...stage.factors, seedsPerCell: stage.factors.seedsPerCell + 1 } }
        : stage)
    };
    expect(AttentionV2SweepBudgetSchema.safeParse(bad).success).toBe(false);
  });

  it("summarizes envelopes without claiming they have runnable catalogs", () => {
    expect(summarizeAttentionV2Sweep("standard")).toMatchObject({
      executionStatus: "requires-v2-campaign-runner",
      materialization: "materialized-standard",
      modelRows: 40,
      commanders: 6_400,
      baseEdges: 25_600,
      orientedMatchups: 57_600,
      battleSamples: 32_768,
      sparseBattleSamples: 256,
      plannedRuns: 30_008_992
    });
    expect(summarizeAttentionV2Sweep("lean").materialization).toBe("sizing-envelope");
    expect(summarizeAttentionV2Sweep("deep").materialization).toBe("sizing-envelope");
  });

  it("materializes a post-screen catalog only from explicit selected parents and evidence", () => {
    const plan = createAttentionV2SweepPlan(options(), skeleton);
    const shapeSet = plan.stageModelSets.find((set) => set.stage === "shape-screen")!;
    const shapeMembers = skeleton.modelCatalog.models.map((model) => {
      const ruleShapeHash = sha256Value(model.ruleShape);
      const modelHash = sha256Value({ schemaVersion: 1, modelVersion: model.modelVersion, modelId: model.modelId, ruleShapeHash });
      const draft = {
        schemaVersion: 1 as const,
        modelVersion: model.modelVersion,
        modelId: model.modelId,
        modelHash,
        ruleShape: model.ruleShape,
        ruleShapeHash,
        sourceKind: "catalog-row" as const,
        parentModelId: null,
        parentModelSetHash: null,
        derivationHash: null
      };
      return { ...draft, memberHash: sha256Value(draft) };
    });
    const shapeModelSetHash = sha256Value({ schemaVersion: 1, stage: "shape-screen", members: shapeMembers.map((member) => ({ modelId: member.modelId, modelHash: member.modelHash })) });
    const shapeCatalogDraft = {
      schemaVersion: 1,
      plannerVersion: LANDSCAPE_SWEEP_PLANNER_VERSION,
      modelVersion: skeleton.modelCatalog.modelVersion,
      planHash: plan.planHash,
      stage: "shape-screen",
      rootModelCatalogHash: skeleton.modelCatalog.catalogHash,
      modelSetId: skeleton.modelCatalog.catalogId,
      modelSetHash: shapeModelSetHash,
      selectionProtocolHash: shapeSet.selectionProtocolHash as Sha256Digest,
      selectionReportHash: null,
      dependencies: [],
      modelCount: 40,
      members: shapeMembers,
      frozen: true
    };
    const shapeCatalog = AttentionV2StageModelCatalogSchema.parse({ ...shapeCatalogDraft, catalogHash: sha256Value(shapeCatalogDraft) });
    const selected = skeleton.modelCatalog.models.slice(0, 6).map((model) => ({ modelId: model.modelId, modelHash: shapeMembers.find((member) => member.modelId === model.modelId)!.modelHash }));
    const survivor = materializeAttentionV2StageModel(plan, {
      stage: "survivor-refinement",
      fold: plan.folds.find((fold) => fold.stages.includes("survivor-refinement"))!.fold,
      selectionProtocolHash: plan.stageModelSets.find((set) => set.stage === "survivor-refinement")!.selectionProtocolHash as Sha256Digest,
      completedEvidenceReportHashes: [sha256Value("shape-screen-report")],
      selectedSourceModels: selected,
      upstream: { catalog: shapeCatalog },
      members: selected.flatMap((parent) => {
        const source = skeleton.modelCatalog.models.find((model) => model.modelId === parent.modelId)!;
        return Array.from({ length: 4 }, (_, variant) => ({
          modelId: `${parent.modelId}-local-${variant}`,
          ruleShape: source.ruleShape,
          sourceKind: "local-variant" as const,
          parentModelId: parent.modelId,
          parentModelSetHash: shapeCatalog.modelSetHash as Sha256Digest,
          derivationHash: sha256Value({ parentModelId: parent.modelId, variant })
        }));
      })
    });
    expect(survivor.catalog.stage).toBe("survivor-refinement");
    expect(survivor.catalog.members).toHaveLength(24);
    expect(survivor.selectionReport.selectedSourceModels).toEqual(selected);
    expect(() => verifyAttentionV2SweepPlan(plan, skeleton, { materializedStages: [survivor] })).toThrow(/plan still marks it pending/);
  }, 30_000);
});
