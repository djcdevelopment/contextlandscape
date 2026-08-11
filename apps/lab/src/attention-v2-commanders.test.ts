import { describe, expect, it } from "vitest";
import { resolveAttentionV2Context } from "@landscape/engine";
import { createAttentionV2SweepPlan, createAttentionV2SweepSkeleton } from "./landscape-sweep.js";
import { applyAttentionV2BattleSample, battleContextHash, compileAttentionV2Commander } from "./attention-v2-commanders.js";
import { runAttentionV2Smoke } from "./attention-v2-runner.js";
import { sha256Value } from "./provenance.js";

const parentV1ModelHash = sha256Value("corrected-commander-test-parent");
const skeleton = createAttentionV2SweepSkeleton(parentV1ModelHash);
const plan = createAttentionV2SweepPlan({
  parentV1ManifestHash: sha256Value("corrected-parent-manifest"),
  parentV1ReportHash: sha256Value("corrected-parent-report"),
  parentV1ModelHash,
  createdAt: "2026-08-10T06:00:00.000Z",
  seedStart: 10_000,
  budgetProfile: "standard"
}, skeleton);

function profile(overrides: Partial<(typeof skeleton.commanderCatalog.profiles)[number]>) {
  const match = skeleton.commanderCatalog.profiles.find((candidate) =>
    Object.entries(overrides).every(([key, value]) => candidate[key as keyof typeof candidate] === value)
  );
  if (!match) throw new Error(`No commander profile for ${JSON.stringify(overrides)}`);
  return match;
}

function programBehaviorSignature(program: ReturnType<typeof compileAttentionV2Commander>["program"]): string {
  return JSON.stringify({
    movementRules: program.movementRules,
    movementFallback: program.movementFallback,
    capacityStrategy: program.capacityStrategy,
    commandRules: program.commandRules
  });
}

describe("corrected attention-v2 commander compilation", () => {
  it("compiles all 6,400 profiles into valid three-unit compositions and policies", () => {
    const compiled = skeleton.commanderCatalog.profiles.map(compileAttentionV2Commander);
    expect(compiled).toHaveLength(6_400);
    expect(compiled.every((entry) => entry.composition.units.length === 3)).toBe(true);
    expect(new Set(compiled.map((entry) => entry.policyHash)).size).toBe(6_400);
  });

  it("gives every module level a distinct concrete compiler output", () => {
    const anchor = {
      compositionModule: "scout-line-siege" as const,
      triageModule: "verify-lowest" as const,
      movementModule: "own-front" as const,
      capacityModule: "never" as const
    };
    const compositions = [...new Set(skeleton.commanderCatalog.profiles.map((candidate) => candidate.compositionModule))]
      .map((compositionModule) => compileAttentionV2Commander(profile({ ...anchor, compositionModule })).composition.compositionId);
    const triage = [...new Set(skeleton.commanderCatalog.profiles.map((candidate) => candidate.triageModule))]
      .map((triageModule) => programBehaviorSignature(compileAttentionV2Commander(profile({ ...anchor, triageModule })).program));
    const movement = [...new Set(skeleton.commanderCatalog.profiles.map((candidate) => candidate.movementModule))]
      .map((movementModule) => programBehaviorSignature(compileAttentionV2Commander(profile({ ...anchor, movementModule })).program));
    const capacity = [...new Set(skeleton.commanderCatalog.profiles.map((candidate) => candidate.capacityModule))]
      .map((capacityModule) => programBehaviorSignature(compileAttentionV2Commander(profile({ ...anchor, capacityModule })).program));
    expect(new Set(compositions).size).toBe(10);
    expect(new Set(triage).size).toBe(10);
    expect(new Set(movement).size).toBe(8);
    expect(new Set(capacity).size).toBe(8);
  });

  it("binds every battle-pressure axis to hashed engine inputs", () => {
    const base = resolveAttentionV2Context(skeleton.modelCatalog.models[0]);
    const samples = [skeleton.battleSamples[0], skeleton.battleSamples[31], skeleton.battleSamples[31 * 32], skeleton.battleSamples.at(-1)!];
    const contexts = samples.map((sample) => applyAttentionV2BattleSample(base, sample));
    expect(new Set(contexts.map((context, index) => battleContextHash(context, samples[index]))).size).toBe(4);
    expect(new Set(contexts.map((context) => context.scenario.frontSchedule[0].radius)).size).toBeGreaterThan(1);
    expect(new Set(contexts.map((context) => context.scenario.spawns[0].position.x)).size).toBeGreaterThan(1);
    expect(new Set(contexts.map((context) => context.model.rules.soundnessRate)).size).toBeGreaterThan(1);
  });

  it("retains oriented commander attribution and common worlds across exact seat reversals", () => {
    const edges = skeleton.edgeCatalogs.find((catalog) => catalog.stage === "shape-screen")!.edges;
    const forward = edges.find((edge) => edge.stratum !== "self-play" && edge.seatOrientation === 1)!;
    const reverse = edges.find((edge) => edge.pairHash === forward.pairHash && edge.seatOrientation === 2)!;
    const modelId = skeleton.modelCatalog.models[0].modelId;
    const battleSampleId = skeleton.battleSampleCatalogs.find((catalog) => catalog.stage === "shape-screen")!.samples[0].sampleId;
    const common = { stage: "shape-screen" as const, modelId, battleSampleId, seed: plan.worldBlocks[0].seedStart };
    const left = runAttentionV2Smoke(plan, skeleton, { ...common, edgeId: forward.edgeId });
    const replay = runAttentionV2Smoke(plan, skeleton, { ...common, edgeId: forward.edgeId });
    const right = runAttentionV2Smoke(plan, skeleton, { ...common, edgeId: reverse.edgeId });
    expect(left.record.schemaVersion).toBe(2);
    expect(left.record.edge.playerOneCommanderId).toBe(forward.leftCommanderId);
    expect(right.record.edge.playerOneCommanderId).toBe(forward.rightCommanderId);
    expect(right.record.identity.randomStreamId).toBe(left.record.identity.randomStreamId);
    expect(replay.record.traceHash).toBe(left.record.traceHash);
    expect(replay.record.outcomeHash).toBe(left.record.outcomeHash);
  }, 30_000);
});
