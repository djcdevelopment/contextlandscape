import { describe, expect, it } from "vitest";
import { createAttentionV2SweepPlan, createAttentionV2SweepSkeleton } from "./landscape-sweep.js";
import { runAttentionV2Smoke } from "./attention-v2-runner.js";
import { sha256Value } from "./provenance.js";

const parentV1ModelHash = sha256Value("duel-capacity-v1-model");
const skeleton = createAttentionV2SweepSkeleton(parentV1ModelHash);
const plan = createAttentionV2SweepPlan({
  parentV1ManifestHash: sha256Value("parent-manifest"),
  parentV1ReportHash: sha256Value("parent-report"),
  parentV1ModelHash,
  createdAt: "2026-08-09T00:00:00.000Z",
  seedStart: 10000,
  budgetProfile: "standard"
}, skeleton);

describe("attention-v2 execution bridge", () => {
  it("runs one paired shape-screen cell through the v2 resolver", () => {
    const edgeCatalog = skeleton.edgeCatalogs.find((catalog) => catalog.stage === "shape-screen")!;
    const sampleCatalog = skeleton.battleSampleCatalogs.find((catalog) => catalog.stage === "shape-screen")!;
    const result = runAttentionV2Smoke(plan, skeleton, {
      stage: "shape-screen",
      modelId: skeleton.modelCatalog.models[0].modelId,
      edgeId: edgeCatalog.edges[0].edgeId,
      battleSampleId: sampleCatalog.samples[0].sampleId,
      seed: plan.worldBlocks[0].seedStart
    });
    expect(result.identity.modelVersion).toBe("duel-capacity-v2");
    expect(result.engine.match.state.modelVersion).toBe("duel-capacity-v2");
    expect(result.engine.match.state.status).toBe("complete");
    expect(result.engine.traceHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  }, 30_000);

  it("keeps post-screen execution blocked until selection materializes", () => {
    expect(() => runAttentionV2Smoke(plan, skeleton, {
      stage: "survivor-refinement",
      modelId: "not-yet-selected",
      edgeId: skeleton.edgeCatalogs.find((catalog) => catalog.stage === "survivor-refinement")!.edges[0].edgeId,
      battleSampleId: skeleton.battleSampleCatalogs.find((catalog) => catalog.stage === "survivor-refinement")!.samples[0].sampleId,
      seed: plan.worldBlocks[1].seedStart
    })).toThrow(/Only materialized shape-screen/);
  });
});
