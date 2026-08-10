import {
  AttentionCompositionSchema,
  AttentionPolicyProgramSchema,
  type AttentionChassis,
  type AttentionComposition,
  type AttentionPolicyProgram,
  type AttentionV2BattleSampleRef,
  type AttentionV2CommanderProfile
} from "@landscape/contracts";
import { defaultAttentionScenario, type AttentionRuntimeContext } from "@landscape/engine";
import { sha256Value, type Sha256Digest } from "./provenance.js";

export const ATTENTION_V2_COMMANDER_COMPILER_VERSION = "attention-v2-commander-compiler-1" as const;
export const ATTENTION_V2_BATTLE_CONTEXT_VERSION = "attention-v2-battle-context-1" as const;

export type CompiledAttentionV2Commander = Readonly<{
  compilerVersion: typeof ATTENTION_V2_COMMANDER_COMPILER_VERSION;
  profile: AttentionV2CommanderProfile;
  composition: AttentionComposition;
  program: AttentionPolicyProgram;
  policyHash: Sha256Digest;
}>;

type CommandRules = AttentionPolicyProgram["commandRules"];
type MovementRules = AttentionPolicyProgram["movementRules"];

const rejectRevealedUnsound: CommandRules[number] = {
  when: [{ kind: "revealed-unsound" }],
  action: { kind: "reject" },
  target: { kind: "revealed-unsound" }
};
const verifyLowest: CommandRules[number] = {
  when: [{ kind: "always" }],
  action: { kind: "verify" },
  target: { kind: "lowest-confidence" }
};

function compositionFor(profile: AttentionV2CommanderProfile): AttentionComposition {
  const chassis = profile.compositionModule.split("-") as AttentionChassis[];
  const counts = new Map<AttentionChassis, number>();
  return AttentionCompositionSchema.parse({
    schemaVersion: 1,
    compositionId: `attention-v2-composition-${profile.compositionModule}`,
    units: chassis.map((name) => {
      const ordinal = (counts.get(name) ?? 0) + 1;
      counts.set(name, ordinal);
      return { unitKey: `${name}-${ordinal}`, chassis: name };
    })
  });
}

function triageRules(profile: AttentionV2CommanderProfile): CommandRules {
  switch (profile.triageModule) {
    case "accept-all": return [];
    case "verify-lowest": return [rejectRevealedUnsound, verifyLowest];
    case "seize-cheapest": return [
      { when: [{ kind: "always" }], action: { kind: "seize" }, target: { kind: "cheapest-seize" } }
    ];
    case "confidence-reject": return [
      { when: [{ kind: "confidence-below", value: 0.5 }], action: { kind: "reject" }, target: { kind: "lowest-confidence" } },
      verifyLowest
    ];
    case "confidence-verify": return [
      rejectRevealedUnsound,
      { when: [{ kind: "confidence-below", value: 0.7 }], action: { kind: "verify" }, target: { kind: "lowest-confidence" } }
    ];
    case "recon-reject": return [
      { when: [{ kind: "confidence-below", value: 0.55 }], action: { kind: "reject" }, target: { kind: "chassis-lowest-confidence", chassis: "scout" } },
      verifyLowest
    ];
    case "line-assist": return [
      { when: [{ kind: "target-lock-available" }], action: { kind: "target-lock" }, target: { kind: "lowest-confidence" } },
      rejectRevealedUnsound,
      verifyLowest
    ];
    case "siege-seize": return [
      { when: [{ kind: "always" }], action: { kind: "seize" }, target: { kind: "chassis-lowest-confidence", chassis: "siege" } },
      verifyLowest
    ];
    case "risk-adaptive": return [
      rejectRevealedUnsound,
      { when: [{ kind: "confidence-below", value: 0.4 }], action: { kind: "reject" }, target: { kind: "lowest-confidence" } },
      { when: [{ kind: "confidence-above", value: 0.75 }], action: { kind: "seize" }, target: { kind: "cheapest-seize" } },
      verifyLowest
    ];
    case "pressure-adaptive": return [
      rejectRevealedUnsound,
      { when: [{ kind: "unresolved-at-least", value: 3 }], action: { kind: "seize" }, target: { kind: "cheapest-seize" } },
      verifyLowest
    ];
  }
}

function movement(profile: AttentionV2CommanderProfile): Pick<AttentionPolicyProgram, "movementRules" | "movementFallback"> {
  let movementRules: MovementRules = [];
  let movementFallback: AttentionPolicyProgram["movementFallback"] = "hold";
  switch (profile.movementModule) {
    case "hold": break;
    case "own-front": movementFallback = "approach-own-front"; break;
    case "enemy-front": movementFallback = "approach-enemy-front"; break;
    case "chassis-native":
      movementRules = [
        { chassis: "scout", strategy: "approach-enemy-front" },
        { chassis: "line", strategy: "approach-own-front" },
        { chassis: "siege", strategy: "hold" }
      ];
      break;
    case "scout-mobile":
      movementRules = [{ chassis: "scout", strategy: "approach-enemy-front" }];
      movementFallback = "approach-own-front";
      break;
    case "escort":
      movementRules = [
        { chassis: "scout", strategy: "escort", targetChassis: "line" },
        { chassis: "line", strategy: "hold-in-own-front" },
        { chassis: "siege", strategy: "hold" }
      ];
      movementFallback = "approach-own-front";
      break;
    case "siege-anchor":
      movementRules = [{ chassis: "siege", strategy: "hold" }];
      movementFallback = "approach-own-front";
      break;
    case "flare-evade": movementFallback = "evade-flare"; break;
  }
  return { movementRules, movementFallback };
}

function capacity(profile: AttentionV2CommanderProfile): Pick<AttentionPolicyProgram, "capacityStrategy" | "commandRules"> {
  const triage = triageRules(profile);
  switch (profile.capacityModule) {
    case "never": return { capacityStrategy: "never", commandRules: triage };
    case "pioneer-focus": return {
      capacityStrategy: "pioneer",
      commandRules: [{ when: [{ kind: "ability-ready", ability: "perfect-focus" }], action: { kind: "perfect-focus" }, target: { kind: "lowest-confidence" } }, ...triage]
    };
    case "follower-focus": return {
      capacityStrategy: "follower",
      commandRules: [{ when: [{ kind: "ability-ready", ability: "perfect-focus" }], action: { kind: "perfect-focus" }, target: { kind: "lowest-confidence" } }, ...triage]
    };
    case "pioneer-overclock": return {
      capacityStrategy: "pioneer",
      commandRules: [{ when: [{ kind: "ability-ready", ability: "overclock" }], action: { kind: "overclock" } }, ...triage]
    };
    case "follower-overclock": return {
      capacityStrategy: "follower",
      commandRules: [{ when: [{ kind: "ability-ready", ability: "overclock" }], action: { kind: "overclock" } }, ...triage]
    };
    case "pioneer-flare": return {
      capacityStrategy: "pioneer",
      commandRules: [{ when: [{ kind: "ability-ready", ability: "macro-flare" }], action: { kind: "macro-flare" }, target: { kind: "enemy-densest" } }, ...triage]
    };
    case "follower-flare": return {
      capacityStrategy: "follower",
      commandRules: [{ when: [{ kind: "ability-ready", ability: "macro-flare" }], action: { kind: "macro-flare" }, target: { kind: "enemy-densest" } }, ...triage]
    };
    case "adaptive": return {
      capacityStrategy: "pioneer",
      commandRules: [
        { when: [{ kind: "ability-ready", ability: "macro-flare" }, { kind: "unresolved-at-least", value: 3 }], action: { kind: "macro-flare" }, target: { kind: "enemy-densest" } },
        { when: [{ kind: "ability-ready", ability: "overclock" }, { kind: "unresolved-at-least", value: 2 }], action: { kind: "overclock" } },
        { when: [{ kind: "ability-ready", ability: "perfect-focus" }], action: { kind: "perfect-focus" }, target: { kind: "lowest-confidence" } },
        ...triage
      ]
    };
  }
}

export function compileAttentionV2Commander(profile: AttentionV2CommanderProfile): CompiledAttentionV2Commander {
  const movementDefinition = movement(profile);
  const capacityDefinition = capacity(profile);
  const program = AttentionPolicyProgramSchema.parse({
    schemaVersion: 1,
    policyId: `attention-v2-policy-${profile.profileHash.slice(7, 31)}`,
    label: `${profile.triageModule} / ${profile.movementModule} / ${profile.capacityModule}`,
    ...movementDefinition,
    ...capacityDefinition,
    maxCommandActions: 64
  });
  const policyHash = sha256Value({
    schemaVersion: 1,
    compilerVersion: ATTENTION_V2_COMMANDER_COMPILER_VERSION,
    profileHash: profile.profileHash,
    program
  });
  return Object.freeze({
    compilerVersion: ATTENTION_V2_COMMANDER_COMPILER_VERSION,
    profile,
    composition: compositionFor(profile),
    program,
    policyHash
  });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Bind the explicit physical sample to engine inputs. The three axes remain metadata in the sample,
 * while this deterministic projection makes each axis causally observable: spatial pressure changes
 * front radius, formation geometry shifts spawn depth, and information pressure adjusts soundness.
 */
export function applyAttentionV2BattleSample(
  context: AttentionRuntimeContext,
  sample: AttentionV2BattleSampleRef
): AttentionRuntimeContext {
  const spatialBand = Math.floor(sample.generator.spatialPressure / 11);
  const formationBand = Math.floor(sample.generator.formationGeometry / 11);
  const informationOffset = (15.5 - sample.generator.informationPressure) / 155;
  const scenario = {
    ...structuredClone(defaultAttentionScenario),
    scenarioId: `${defaultAttentionScenario.scenarioId}:${sample.sampleId}`,
    frontSchedule: defaultAttentionScenario.frontSchedule.map((front) => ({
      ...front,
      radius: clamp(front.radius + spatialBand - 1, 1, 3)
    })),
    spawns: defaultAttentionScenario.spawns.map((spawn) => ({
      ...spawn,
      position: {
        x: clamp(spawn.position.x + (spawn.playerSlot === 1 ? formationBand - 1 : 1 - formationBand), 0, defaultAttentionScenario.board.width - 1),
        y: spawn.position.y
      }
    }))
  };
  const model = {
    ...context.model,
    rules: {
      ...context.model.rules,
      soundnessRate: clamp(context.model.rules.soundnessRate + informationOffset, 0.5, 0.9)
    }
  };
  return { scenario, model } as AttentionRuntimeContext;
}

export function battleContextHash(context: AttentionRuntimeContext, sample: AttentionV2BattleSampleRef): Sha256Digest {
  return sha256Value({ schemaVersion: 1, version: ATTENTION_V2_BATTLE_CONTEXT_VERSION, sampleHash: sample.sampleHash, context });
}
