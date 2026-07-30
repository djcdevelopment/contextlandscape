import {
  applyCommandAction,
  createCommandState,
  endCommandRound,
  projectCommand,
  type Chassis,
  type CommandRules,
  type CommandState
} from "@landscape/engine";

/**
 * A commander policy sees only the projection — soundness stays hidden until verified — and issues
 * one action at a time so it can react to what a verification reveals.
 *
 * Policies return the new state rather than mutating: `applyCommandAction` clones, so copying
 * fields back by hand would silently drop any field added later.
 */
export type Policy = { name: string; play: (state: CommandState) => CommandState };

type Visible = ReturnType<typeof projectCommand>["pending"][number];

function pending(state: CommandState): Visible[] {
  return projectCommand(state).pending.filter((artifact) => artifact.resolution === "pending");
}

/**
 * The null hypothesis: spend no attention, let everything auto-accept.
 *
 * If no considered policy beats this, there is no decision in the design and no game. That is the
 * question this harness exists to answer before anything gets built on top.
 */
const acceptAll: Policy = { name: "accept-all", play: (state) => state };

/** Verify in a given order, rejecting whatever proves unsound, until attention runs out. */
function verifyBy(name: string, rank: (artifact: Visible) => number): Policy {
  return {
    name,
    play: (state) => {
      let current = state;
      for (;;) {
        const options = pending(current)
          .filter((artifact) => !artifact.revealed)
          .sort((left, right) => rank(left) - rank(right));
        if (!options.length || current.attention < current.rules.verifyCost) break;
        const targetId = options[0].artifactId;
        current = applyCommandAction(current, { verb: "verify", artifactId: targetId }).state;
        const seen = pending(current).find((artifact) => artifact.artifactId === targetId);
        if (seen?.sound === false) {
          current = applyCommandAction(current, { verb: "reject", artifactId: targetId }).state;
        }
      }
      return current;
    }
  };
}

/** Do the work yourself instead of reviewing it: guaranteed progress, but the most expensive verb. */
const seizeCheapest: Policy = {
  name: "seize-cheapest",
  play: (state) => {
    let current = state;
    for (;;) {
      const costOf = (artifact: Visible) =>
        current.fleet.find((mech) => mech.mechId === artifact.mechId)?.seizeCost ?? Number.POSITIVE_INFINITY;
      const options = pending(current).sort((left, right) => costOf(left) - costOf(right));
      if (!options.length || costOf(options[0]) > current.attention) break;
      current = applyCommandAction(current, { verb: "seize", artifactId: options[0].artifactId }).state;
    }
    return current;
  }
};

export const policies: Policy[] = [
  acceptAll,
  // The intended line: spend attention where the mech is least sure.
  verifyBy("verify-lowest-confidence", (artifact) => artifact.reportedConfidence),
  // Control: same attention, spent on the artifacts least likely to be wrong.
  verifyBy("verify-highest-confidence", (artifact) => -artifact.reportedConfidence),
  // Control: separates "inspecting helps" from "reading the confidence signal helps".
  verifyBy("verify-arbitrary", () => 0),
  seizeCheapest
];

export type PolicyResult = {
  policy: string;
  composition: string;
  runs: number;
  wins: number;
  winRate: number;
  averageProgress: number;
  averageDrift: number;
};

export function runPolicy(
  policy: Policy,
  composition: Chassis[],
  seed: number,
  rules: Partial<CommandRules> = {}
): CommandState {
  let state = createCommandState(`cmd-${policy.name}-${seed}`, seed, composition, rules);
  while (state.status === "active") {
    state = endCommandRound(policy.play(state)).state;
  }
  return state;
}

export function comparePolicies(
  compositions: Record<string, Chassis[]>,
  runs: number,
  rules: Partial<CommandRules> = {}
): PolicyResult[] {
  const results: PolicyResult[] = [];
  for (const [label, composition] of Object.entries(compositions)) {
    for (const policy of policies) {
      let wins = 0;
      let progress = 0;
      let drift = 0;
      for (let run = 0; run < runs; run += 1) {
        const final = runPolicy(policy, composition, 41000 + run * 7919, rules);
        if (final.status === "victory") wins += 1;
        progress += final.progress;
        drift += final.drift;
      }
      results.push({
        policy: policy.name,
        composition: label,
        runs,
        wins,
        winRate: Number((wins / runs).toFixed(3)),
        averageProgress: Number((progress / runs).toFixed(2)),
        averageDrift: Number((drift / runs).toFixed(2))
      });
    }
  }
  return results;
}

export const compositions: Record<string, Chassis[]> = {
  "scout-heavy": ["scout", "scout", "line"],
  balanced: ["scout", "line", "siege"],
  "siege-heavy": ["line", "siege", "siege"]
};
