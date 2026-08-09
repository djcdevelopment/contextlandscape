import {
  attentionCompositions,
  createAttentionMatch,
  resolveAttentionV2Context,
  runAttentionMatch,
  type AttentionRunResult
} from "@landscape/engine";
import { attentionPolicyById, createAttentionController } from "@landscape/simulator/attention-policies";
import {
  compileAttentionV2RunPlanner,
  type AttentionV2RunIdentityInput,
  type LandscapeSweepSkeleton
} from "./landscape-sweep.js";
import type { AttentionV2SweepPlan } from "@landscape/contracts";

export type AttentionV2SmokeInput = AttentionV2RunIdentityInput & {
  policyOneId?: string;
  policyTwoId?: string;
};

export type AttentionV2SmokeResult = {
  identity: ReturnType<ReturnType<typeof compileAttentionV2RunPlanner>["createIdentity"]>;
  modelId: string;
  policyOneId: string;
  policyTwoId: string;
  engine: AttentionRunResult;
};

function policy(id: string) {
  const program = attentionPolicyById.get(id);
  if (!program) throw new Error(`Unknown attention policy ${id}`);
  return program;
}

export function runAttentionV2Smoke(
  plan: AttentionV2SweepPlan,
  skeleton: LandscapeSweepSkeleton,
  input: AttentionV2SmokeInput
): AttentionV2SmokeResult {
  if (input.stage !== "shape-screen") throw new Error("Only materialized shape-screen models can execute in the v2 smoke runner");
  const planner = compileAttentionV2RunPlanner(plan, skeleton);
  const identity = planner.createIdentity(input);
  const model = skeleton.modelCatalog.models.find((candidate) => candidate.modelId === input.modelId);
  if (!model) throw new Error(`Unknown shape-screen model ${input.modelId}`);
  const context = resolveAttentionV2Context(model);
  const policyOneId = input.policyOneId ?? "front-mobile-verify";
  const policyTwoId = input.policyTwoId ?? "verify-lowest-confidence";
  const policyOne = policy(policyOneId);
  const policyTwo = policy(policyTwoId);
  const composition = attentionCompositions.balanced;
  const match = createAttentionMatch({
    matchId: `${plan.planId}:${identity.edgeId}:${identity.battleSampleId}:${identity.seed}`,
    seed: identity.seed,
    randomStreamId: identity.randomStreamId,
    context,
    players: [
      { playerId: "alpha", composition },
      { playerId: "bravo", composition }
    ]
  });
  const engine = runAttentionMatch(match, {
    alpha: createAttentionController(policyOne, { model: context.model, scenario: context.scenario, playerId: "alpha" }),
    bravo: createAttentionController(policyTwo, { model: context.model, scenario: context.scenario, playerId: "bravo" })
  }, { traceMode: "hash" });
  return { identity, modelId: model.modelId, policyOneId, policyTwoId, engine };
}
