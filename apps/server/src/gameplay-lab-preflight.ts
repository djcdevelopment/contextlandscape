import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Action, GameplayLabDefinition, MatchState, Order } from "@landscape/contracts";
import { createMatchState, runReplay, resolveSlot } from "@landscape/engine";
import { gameplayLabs, scenarioById } from "@landscape/scenarios";

export type GameplayLabVariantPreflight = {
  variantId: string;
  winnable: boolean;
  minimumSlots: number | null;
  minimumEnergySpent: number | null;
  winningPathCount: number;
  winningFirstActions: Action[];
  exampleActions: Action[];
  exampleProjectionHash: string | null;
  doctrineOutcome?: {
    policyId: string;
    syntheticCategory: string;
    status: MatchState["status"];
    objectiveProgress: number;
    commanderEnergy: number;
    heat: number;
    rejectedOrders: number;
  };
};

export type GameplayLabPreflight = {
  generatedAt: string;
  labs: Array<{
    labId: string;
    version: number;
    scenarioId: string;
    scenarioVersion: number;
    sourceFilesPresent: boolean;
    controlReplayMatchesScenario: boolean | null;
    variants: GameplayLabVariantPreflight[];
    reachabilityChanges: Array<{ leftVariantId: string; rightVariantId: string; winnabilityChanged: boolean; slotDelta: number | null }>;
  }>;
};

const playableOrders: Array<{ action: Action; order: Order }> = [
  { action: "scout", order: { unitId: "scout-01", action: "scout", fireMode: "semi" } },
  { action: "build_contract", order: { unitId: "line-01", action: "build_contract", fireMode: "semi" } },
  { action: "implement", order: { unitId: "line-01", action: "implement", fireMode: "semi" } },
  { action: "review", order: { unitId: "line-01", action: "review", fireMode: "semi" } },
  { action: "full_send", order: { unitId: "line-01", action: "full_send", fireMode: "full" } },
  { action: "consolidate", order: { unitId: "line-01", action: "consolidate", fireMode: "semi" } }
];

type PortableCampaignSummaryEntry = {
  matrixId?: unknown;
  reportPath?: unknown;
};

export function gameplayLabSourceFilesPresent(
  repoRoot: string,
  source: GameplayLabDefinition["source"]
): boolean {
  const missingPaths = source.reportPaths.filter((path) => !existsSync(join(repoRoot, path)));
  if (missingPaths.length === 0) return true;

  const summaryPath = join(repoRoot, "data/lab/sleep-01-summary.json");
  if (!existsSync(summaryPath)) return false;
  try {
    const parsed = JSON.parse(readFileSync(summaryPath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return false;
    const portableReports = new Map(
      (parsed as PortableCampaignSummaryEntry[])
        .filter((entry): entry is { matrixId: string; reportPath: string } =>
          typeof entry.matrixId === "string" && typeof entry.reportPath === "string")
        .map((entry) => [entry.reportPath, entry.matrixId])
    );
    return missingPaths.every((path) => {
      const matrixId = portableReports.get(path);
      return matrixId !== undefined && source.matrixIds.includes(matrixId);
    });
  } catch {
    return false;
  }
}

type SearchNode = {
  state: MatchState;
  exampleActions: Action[];
  pathCount: number;
  firstActions: Set<Action>;
};

function stateKey(state: MatchState): string {
  return JSON.stringify({
    status: state.status,
    slot: state.slot,
    objectiveProgress: state.objectiveProgress,
    commanderEnergy: state.commanderEnergy,
    commanderLoad: state.commanderLoad,
    heat: state.heat,
    dispersion: state.dispersion,
    confidenceDrift: state.confidenceDrift,
    contractExposed: state.contractExposed,
    contractBuilt: state.contractBuilt,
    rollbackVerified: state.rollbackVerified,
    artifacts: [...state.artifacts].sort(),
    lessonFlags: [...state.lessonFlags].sort()
  });
}

function reachability(definition: GameplayLabDefinition, variantId: string): GameplayLabVariantPreflight {
  const variant = definition.variants.find((candidate) => candidate.variantId === variantId);
  const scenario = scenarioById.get(definition.scenarioId);
  if (!variant || !scenario) throw new Error(`gameplay_lab_preflight_missing:${definition.labId}:${variantId}`);
  const initial = createMatchState(
    `preflight-${definition.labId}-${variant.variantId}`,
    "player",
    scenario.seed + variant.seedOffset,
    scenario.scenarioId,
    "balanced",
    variant.rulesTuning
  );
  let frontier = new Map<string, SearchNode>([[stateKey(initial), {
    state: initial,
    exampleActions: [],
    pathCount: 1,
    firstActions: new Set<Action>()
  }]]);
  let minimumSlots: number | null = null;
  let minimumEnergySpent: number | null = null;
  let winningPathCount = 0;
  const winningFirstActions = new Set<Action>();
  let exampleActions: Action[] = [];

  for (let depth = 0; depth < 8 && frontier.size; depth += 1) {
    const nextFrontier = new Map<string, SearchNode>();
    for (const node of frontier.values()) {
      for (const playable of playableOrders) {
        const result = resolveSlot(node.state, [playable.order]);
        const path = [...node.exampleActions, playable.action];
        const firstActions = new Set(node.firstActions);
        firstActions.add(path[0]);
        if (result.state.status === "victory") {
          if (minimumSlots === null) {
            minimumSlots = result.state.slot;
            exampleActions = path;
          }
          minimumEnergySpent = Math.min(minimumEnergySpent ?? Number.POSITIVE_INFINITY, initial.commanderEnergy - result.state.commanderEnergy);
          winningPathCount = Math.min(1_000_000, winningPathCount + node.pathCount);
          for (const action of firstActions) winningFirstActions.add(action);
          continue;
        }
        if (result.state.status !== "active") continue;
        const key = stateKey(result.state);
        const existing = nextFrontier.get(key);
        if (existing) {
          existing.pathCount = Math.min(1_000_000, existing.pathCount + node.pathCount);
          for (const action of firstActions) existing.firstActions.add(action);
        } else {
          nextFrontier.set(key, {
            state: result.state,
            exampleActions: path,
            pathCount: node.pathCount,
            firstActions
          });
        }
      }
    }
    frontier = nextFrontier;
    if (minimumSlots !== null) break;
  }

  const exampleManifest = exampleActions.length
    ? runReplay(initial, exampleActions.map((action) => ({
        orders: [playableOrders.find((candidate) => candidate.action === action)!.order]
      }))).manifest
    : undefined;
  const doctrineOutcome = variant.doctrineCard
    ? (() => {
        const result = runReplay(initial, variant.doctrineCard.steps.map((step) => ({ orders: [step] })));
        return {
          policyId: variant.doctrineCard.policyId,
          syntheticCategory: variant.doctrineCard.category,
          status: result.state.status,
          objectiveProgress: result.state.objectiveProgress,
          commanderEnergy: result.state.commanderEnergy,
          heat: result.state.heat,
          rejectedOrders: result.events.filter((event) => event.eventType === "order.rejected").length
        };
      })()
    : undefined;
  return {
    variantId,
    winnable: minimumSlots !== null,
    minimumSlots,
    minimumEnergySpent: Number.isFinite(minimumEnergySpent) ? minimumEnergySpent : null,
    winningPathCount,
    winningFirstActions: [...winningFirstActions].sort(),
    exampleActions,
    exampleProjectionHash: exampleManifest?.projectionHash ?? null,
    doctrineOutcome
  };
}

export function preflightGameplayLabs(repoRoot: string, now = new Date().toISOString()): GameplayLabPreflight {
  return {
    generatedAt: now,
    labs: gameplayLabs.map((definition) => {
      const scenario = scenarioById.get(definition.scenarioId);
      if (!scenario || scenario.version !== definition.scenarioVersion) throw new Error(`gameplay_lab_scenario_mismatch:${definition.labId}`);
      const variants = definition.variants.map((variant) => reachability(definition, variant.variantId));
      const controlDefinition = definition.variants.find((variant) => variant.variantId.endsWith("-control"));
      const controlPreflight = variants.find((variant) => variant.variantId === controlDefinition?.variantId);
      const controlReplayMatchesScenario = controlDefinition && controlPreflight?.exampleActions.length
        ? (() => {
            const matchId = `preflight-control-${definition.labId}`;
            const seed = scenario.seed + controlDefinition.seedOffset;
            const tuned = createMatchState(matchId, "player", seed, scenario.scenarioId, "balanced", controlDefinition.rulesTuning);
            const baseline = createMatchState(matchId, "player", seed, scenario.scenarioId, "balanced");
            const batches = controlPreflight.exampleActions.map((action) => ({
              orders: [playableOrders.find((candidate) => candidate.action === action)!.order]
            }));
            const tunedReplay = runReplay(tuned, batches).manifest;
            const baselineReplay = runReplay(baseline, batches).manifest;
            return tunedReplay.eventHash === baselineReplay.eventHash && tunedReplay.projectionHash === baselineReplay.projectionHash;
          })()
        : null;
      const reachabilityChanges = variants.slice(1).map((variant) => ({
        leftVariantId: variants[0].variantId,
        rightVariantId: variant.variantId,
        winnabilityChanged: variants[0].winnable !== variant.winnable,
        slotDelta: variants[0].minimumSlots === null || variant.minimumSlots === null
          ? null
          : variant.minimumSlots - variants[0].minimumSlots
      }));
      return {
        labId: definition.labId,
        version: definition.version,
        scenarioId: definition.scenarioId,
        scenarioVersion: definition.scenarioVersion,
        sourceFilesPresent: gameplayLabSourceFilesPresent(repoRoot, definition.source),
        controlReplayMatchesScenario,
        variants,
        reachabilityChanges
      };
    })
  };
}
