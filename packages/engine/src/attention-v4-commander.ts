import { createHash } from "node:crypto";
import {
  ATTENTION_V2_CAPACITY_MODULES,
  ATTENTION_V2_MOVEMENT_MODULES,
  ATTENTION_V2_TRIAGE_MODULES,
  ATTENTION_V4_COMMANDER_COMPILER_VERSION,
  ATTENTION_V4_COMPOSITION_MODULES,
  ATTENTION_V4_RESOLVER_VERSION,
  AttentionV4CommanderCatalogSchema,
  AttentionV4CommanderProfileSchema,
  AttentionV4CommanderProgramSchema,
  type AttentionV4Fleet,
  type AttentionV4CommanderCatalog,
  type AttentionV4CommanderProfile,
  type AttentionV4CommanderProgram,
  type AttentionV4Shell
} from "@landscape/contracts";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonical(nested)]));
  }
  return value;
}

export function attentionV4ContentHash(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
}

function impossible(value: never, label: string): never {
  throw new Error(`Unknown or inert ${label} module: ${String(value)}`);
}

type CompositionModule = typeof ATTENTION_V4_COMPOSITION_MODULES[number];
type TriageModule = typeof ATTENTION_V2_TRIAGE_MODULES[number];
type MovementModule = typeof ATTENTION_V2_MOVEMENT_MODULES[number];
type CapacityModule = typeof ATTENTION_V2_CAPACITY_MODULES[number];

function compositionBehavior(module: CompositionModule): { units: AttentionV4Fleet; behavior: string } {
  switch (module) {
    case "line-four-scout": return { units: ["scout", "scout", "scout", "scout", "line"], behavior: "line-four-scout-weight-6-reactor-14" };
    case "two-line-two-scout": return { units: ["scout", "scout", "line", "line"], behavior: "two-line-two-scout-weight-6-reactor-10" };
    case "three-line": return { units: ["line", "line", "line"], behavior: "three-line-weight-6-reactor-6" };
    case "heavy-three-scout": return { units: ["scout", "scout", "scout", "heavy"], behavior: "heavy-three-scout-weight-6-reactor-10" };
    case "heavy-line-scout": return { units: ["scout", "line", "heavy"], behavior: "balanced-weight-6-reactor-6" };
    default: return impossible(module, "composition");
  }
}

function triageBehavior(module: TriageModule): string {
  switch (module) {
    case "accept-all": return "commit-high-confidence-without-inspection";
    case "verify-lowest": return "verify-lowest-then-reject-unsound";
    case "seize-cheapest": return "seize-lowest-net-cost";
    case "confidence-reject": return "reject-below-050-verify-remainder";
    case "confidence-verify": return "verify-below-070-hold-remainder";
    case "recon-reject": return "reject-low-scout-output-first";
    case "line-assist": return "prioritize-support-scanned-artifacts";
    case "siege-seize": return "seize-heavy-output-first";
    case "risk-adaptive": return "triage-by-hazard-confidence-and-soundness";
    case "pressure-adaptive": return "triage-by-backlog-traffic-and-age";
    default: return impossible(module, "triage");
  }
}

function movementBehavior(module: MovementModule): string {
  switch (module) {
    case "hold": return "hold-position-scouts-condense-by-hazard";
    case "own-front": return "step-toward-own-objective-front";
    case "enemy-front": return "step-toward-hostile-objective-front";
    case "chassis-native": return "scout-move-condense-line-step-heavy-uplink";
    case "scout-mobile": return "scout-advance-then-condense-others-own-front";
    case "escort": return "scout-escort-line-anchor-heavy-hold";
    case "siege-anchor": return "heavy-uplink-others-own-front";
    case "flare-evade": return "exit-active-flare-then-condense";
    default: return impossible(module, "movement");
  }
}

function capacityBehavior(module: CapacityModule): { behavior: string; shells: [AttentionV4Shell, AttentionV4Shell, AttentionV4Shell, AttentionV4Shell, AttentionV4Shell] } {
  switch (module) {
    case "never": return { behavior: "never-claim-preserve-attention", shells: ["chaff", "he", "emp", "smoke", "flare"] };
    case "pioneer-focus": return { behavior: "claim-rank-one-early-focus", shells: ["flare", "he", "emp", "smoke", "chaff"] };
    case "follower-focus": return { behavior: "claim-after-rank-one-focus", shells: ["he", "chaff", "emp", "smoke", "flare"] };
    case "pioneer-overclock": return { behavior: "claim-through-rank-two-overclock", shells: ["emp", "he", "smoke", "chaff", "flare"] };
    case "follower-overclock": return { behavior: "follow-rank-two-overclock", shells: ["smoke", "he", "emp", "chaff", "flare"] };
    case "pioneer-flare": return { behavior: "claim-through-rank-three-artillery", shells: ["flare", "smoke", "emp", "he", "chaff"] };
    case "follower-flare": return { behavior: "follow-rank-three-counter-battery", shells: ["chaff", "emp", "he", "smoke", "flare"] };
    case "adaptive": return { behavior: "claim-if-affordable-select-spatial-shell", shells: ["he", "emp", "smoke", "flare", "chaff"] };
    default: return impossible(module, "capacity");
  }
}

function profileOrdinal(
  compositionModule: CompositionModule,
  triageModule: TriageModule,
  movementModule: MovementModule,
  capacityModule: CapacityModule
): number {
  const composition = ATTENTION_V4_COMPOSITION_MODULES.indexOf(compositionModule);
  const triage = ATTENTION_V2_TRIAGE_MODULES.indexOf(triageModule);
  const movement = ATTENTION_V2_MOVEMENT_MODULES.indexOf(movementModule);
  const capacity = ATTENTION_V2_CAPACITY_MODULES.indexOf(capacityModule);
  return ((composition * ATTENTION_V2_TRIAGE_MODULES.length + triage) * ATTENTION_V2_MOVEMENT_MODULES.length + movement) * ATTENTION_V2_CAPACITY_MODULES.length + capacity;
}

export function createAttentionV4CommanderProfile(input: {
  compositionModule: CompositionModule;
  triageModule: TriageModule;
  movementModule: MovementModule;
  capacityModule: CapacityModule;
}): AttentionV4CommanderProfile {
  const normalized = {
    schemaVersion: 3 as const,
    ordinal: profileOrdinal(input.compositionModule, input.triageModule, input.movementModule, input.capacityModule),
    ...input,
    resolverRequirement: ATTENTION_V4_RESOLVER_VERSION
  };
  const profileHash = attentionV4ContentHash(normalized);
  return AttentionV4CommanderProfileSchema.parse({
    ...normalized,
    commanderId: `attention-v4-commander-${profileHash.slice(7, 31)}`,
    profileHash
  });
}

export function compileAttentionV4Commander(profileInput: AttentionV4CommanderProfile): AttentionV4CommanderProgram {
  const profile = AttentionV4CommanderProfileSchema.parse(profileInput);
  const composition = compositionBehavior(profile.compositionModule);
  const triage = triageBehavior(profile.triageModule);
  const movement = movementBehavior(profile.movementModule);
  const capacity = capacityBehavior(profile.capacityModule);
  if (!composition.behavior || !triage || !movement || !capacity.behavior) throw new Error("attention-v4 compiler produced an inert module mapping");
  const draft = {
    schemaVersion: 3 as const,
    compilerVersion: ATTENTION_V4_COMMANDER_COMPILER_VERSION,
    resolverVersion: ATTENTION_V4_RESOLVER_VERSION,
    profileHash: profile.profileHash,
    composition: composition.units,
    triageModule: profile.triageModule,
    movementModule: profile.movementModule,
    capacityModule: profile.capacityModule,
    compositionBehavior: composition.behavior,
    triageBehavior: triage,
    movementBehavior: movement,
    capacityBehavior: capacity.behavior,
    shellPriority: capacity.shells
  };
  return AttentionV4CommanderProgramSchema.parse({ ...draft, programHash: attentionV4ContentHash(draft) });
}

export function createAttentionV4CommanderCatalog(): AttentionV4CommanderCatalog {
  const profiles: AttentionV4CommanderProfile[] = [];
  const compiledHashes: string[] = [];
  for (const compositionModule of ATTENTION_V4_COMPOSITION_MODULES) {
    for (const triageModule of ATTENTION_V2_TRIAGE_MODULES) {
      for (const movementModule of ATTENTION_V2_MOVEMENT_MODULES) {
        for (const capacityModule of ATTENTION_V2_CAPACITY_MODULES) {
          const profile = createAttentionV4CommanderProfile({ compositionModule, triageModule, movementModule, capacityModule });
          profiles.push(profile);
          compiledHashes.push(compileAttentionV4Commander(profile).programHash);
        }
      }
    }
  }
  const prehash = {
    schemaVersion: 3 as const,
    compilerVersion: ATTENTION_V4_COMMANDER_COMPILER_VERSION,
    resolverVersion: ATTENTION_V4_RESOLVER_VERSION,
    profiles,
    compiledHashes
  };
  const catalogHash = attentionV4ContentHash(prehash);
  return AttentionV4CommanderCatalogSchema.parse({
    ...prehash,
    catalogId: `attention-v4-commanders-${catalogHash.slice(7, 31)}`,
    catalogHash
  });
}

export const attentionV4ManualCommander = compileAttentionV4Commander(createAttentionV4CommanderProfile({
  compositionModule: "heavy-line-scout",
  triageModule: "confidence-verify",
  movementModule: "chassis-native",
  capacityModule: "pioneer-focus"
}));

export const attentionV4AiCommander = compileAttentionV4Commander(createAttentionV4CommanderProfile({
  compositionModule: "heavy-line-scout",
  triageModule: "risk-adaptive",
  movementModule: "chassis-native",
  capacityModule: "adaptive"
}));
