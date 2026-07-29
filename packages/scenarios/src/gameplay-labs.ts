import {
  GameplayLabDefinitionSchema,
  type GameplayLabDefinition,
  type GameplayLabDoctrineCard,
  type GameplayLabVariant
} from "@mech/contracts";

const commonQuestions = [
  "What did you believe was the binding constraint?",
  "Which decision most affected the outcome?",
  "What would you change on a replay?",
  "Did the result feel earned?",
  "What information was missing or misleading?"
];

function definition(input: GameplayLabDefinition): GameplayLabDefinition {
  return GameplayLabDefinitionSchema.parse(input);
}

function tunedVariant(
  variantId: string,
  labelForReview: string,
  designerNotes: string,
  rulesTuning: GameplayLabVariant["rulesTuning"] = {},
  seedOffset = 0
): GameplayLabVariant {
  return { variantId, labelForReview, designerNotes, rulesTuning: { tuningId: variantId, ...rulesTuning }, seedOffset };
}

function controlVariant(variantId: string, labelForReview: string, designerNotes: string): GameplayLabVariant {
  return { variantId, labelForReview, designerNotes, rulesTuning: {}, seedOffset: 0 };
}

function doctrine(
  policyId: string,
  category: GameplayLabDoctrineCard["category"],
  steps: GameplayLabDoctrineCard["steps"]
): GameplayLabDoctrineCard {
  return {
    policyId,
    category,
    prompt: "Treat this as a commander's proposed doctrine. Follow it while it remains coherent; override any step that stops making sense.",
    steps
  };
}

export const gameplayLabs: GameplayLabDefinition[] = [
  definition({
    labId: "GL-001",
    version: 1,
    title: "The One-Energy Cliff",
    estimatedMinutes: 30,
    source: {
      campaignId: "sleep-01",
      matrixIds: ["sleep-01-deep-two-baked-slices", "sleep-01-tuning-train", "sleep-01-tuning-holdout"],
      reportPaths: [
        "data/lab/sleep-01-deep-two-baked-slices/report.json",
        "data/lab/sleep-01-tuning-train/report.json",
        "data/lab/sleep-01-tuning-holdout/report.json"
      ],
      finding: "The named lesson policy moves from zero to one hundred percent wins between starting commander energy five and six."
    },
    scenarioId: "two-baked-slices",
    scenarioVersion: 1,
    hypothesis: "A human will find a coherent five-energy route, showing that the synthetic cliff is policy brittleness rather than mission affordability.",
    falsifier: "The five-energy treatment is either unreachable or feels like an illegible trap even when a winning route exists.",
    variants: [
      controlVariant("gl-001-control", "Control · six energy", "Current scenario economy."),
      tunedVariant("gl-001-starved", "Boundary · five energy", "Tests whether the player omits review or discovers another route.", { startingCommanderEnergy: 5 }),
      tunedVariant("gl-001-compensated", "Treatment · five energy, cheap full send", "Restores the complete scripted route at five energy.", {
        startingCommanderEnergy: 5,
        actionCostOverrides: { full_send: 1 }
      })
    ],
    trialOrder: "counterbalanced",
    preBrief: "Complete a verified cross-boundary transaction. Budget every command; anonymous trials may alter the economy.",
    reviewQuestions: commonQuestions,
    acceptance: {
      mechanicRelevant: "The player forecasts or explicitly reacts to commander-energy affordability.",
      lessonLegible: "The player can explain why scouting, the contract, and the final commitment did or did not fit the budget.",
      agencyPresent: "At least two routes feel plausible, or the player discovers the shorter five-energy route without coaching.",
      syntheticDirectionConfirmed: "The six-energy route is easier than the five-energy route without making the five-energy mission an arbitrary hidden failure."
    }
  }),
  definition({
    labId: "GL-002",
    version: 1,
    title: "Cooldown or Sustained Fire",
    estimatedMinutes: 30,
    source: {
      campaignId: "sleep-01",
      matrixIds: ["sleep-01-tuning-train", "sleep-01-tuning-holdout", "sleep-01-deep-context-furnace"],
      reportPaths: [
        "data/lab/sleep-01-tuning-train/report.json",
        "data/lab/sleep-01-tuning-holdout/report.json",
        "data/lab/sleep-01-deep-context-furnace/report.json"
      ],
      finding: "Heat minus one ranks first, but it raises the named sustained-fire policy from zero to 68.8 percent wins across seed pressure."
    },
    scenarioId: "context-furnace",
    scenarioVersion: 1,
    hypothesis: "Reducing full-send heat removes the need to consolidate and weakens the scenario's intended tempo lesson.",
    falsifier: "The player still chooses consolidation for a visible, meaningful reason under reduced heat.",
    variants: [
      controlVariant("gl-002-control", "Control · two heat per burst", "Current burst, cool, burst economy."),
      tunedVariant("gl-002-low-heat", "Treatment · one heat per burst", "Tests naive sustained-fire leakage.", { startingHeat: 0, fullSendHeat: 1 }),
      tunedVariant("gl-002-pressured", "Boundary · starts hot, one heat per burst", "Tests whether an explicit burden restores cooldown decisions.", {
        startingHeat: 2,
        fullSendHeat: 1
      })
    ],
    trialOrder: "counterbalanced",
    preBrief: "Finish the nearly-complete objective without collapsing the active context. Watch heat and decide when momentum is worth preserving.",
    reviewQuestions: commonQuestions,
    acceptance: {
      mechanicRelevant: "Heat changes at least one real decision about full send or consolidation.",
      lessonLegible: "The player identifies cooling or reset as a causal tool before reconstruction.",
      agencyPresent: "Bursting and consolidating are both credible at the key tempo decision.",
      syntheticDirectionConfirmed: "Reduced heat makes sustained fire easier, but any candidate treatment that makes it obviously dominant fails lesson integrity."
    }
  }),
  definition({
    labId: "GL-003",
    version: 1,
    title: "The Price of Full Send",
    estimatedMinutes: 30,
    source: {
      campaignId: "sleep-01",
      matrixIds: ["sleep-01-tuning-train", "sleep-01-tuning-holdout", "sleep-01-deep-false-bottleneck"],
      reportPaths: [
        "data/lab/sleep-01-tuning-train/report.json",
        "data/lab/sleep-01-tuning-holdout/report.json",
        "data/lab/sleep-01-deep-false-bottleneck/report.json"
      ],
      finding: "The 32-policy matrices prefer cheap full send while the deep matrix narrowly prefers expensive full send by 0.023 score."
    },
    scenarioId: "false-bottleneck",
    scenarioVersion: 1,
    hypothesis: "Full-send price is not relevant to the human measurement-versus-optimization choice and the synthetic recommendation is generated-policy noise.",
    falsifier: "Blind price changes reliably alter whether the player measures first or commits to the visible bottleneck.",
    variants: [
      controlVariant("gl-003-control", "Control · full send costs two", "Current action price."),
      tunedVariant("gl-003-cheap", "Treatment · full send costs one", "Train and holdout recommendation.", { actionCostOverrides: { full_send: 1 } }),
      tunedVariant("gl-003-expensive", "Treatment · full send costs three", "Deep recommendation.", { actionCostOverrides: { full_send: 3 } })
    ],
    trialOrder: "counterbalanced",
    preBrief: "Identify the real throughput ceiling before spending force on the subsystem that merely looks busiest.",
    reviewQuestions: commonQuestions,
    acceptance: {
      mechanicRelevant: "The player uses or seriously considers full send in relation to measurement.",
      lessonLegible: "The player explains measurement versus premature optimization without the expected lesson being shown.",
      agencyPresent: "Price changes create a credible commitment choice rather than an ignored number.",
      syntheticDirectionConfirmed: "The human opening changes in the predicted direction; otherwise both price recommendations are rejected as irrelevant."
    }
  }),
  definition({
    labId: "GL-004",
    version: 1,
    title: "Artifact Economy",
    estimatedMinutes: 40,
    source: {
      campaignId: "sleep-01",
      matrixIds: ["sleep-01-tuning-train", "sleep-01-tuning-holdout", "sleep-01-deep-documentation-fortress"],
      reportPaths: [
        "data/lab/sleep-01-tuning-train/report.json",
        "data/lab/sleep-01-tuning-holdout/report.json",
        "data/lab/sleep-01-deep-documentation-fortress/report.json"
      ],
      finding: "Train and holdout tie energy plus one, cheap full send, and cheap implementation; deep search resolves toward cheap full send."
    },
    scenarioId: "documentation-fortress",
    scenarioVersion: 1,
    hypothesis: "Economy changes affect session length more than the intended artifact-return decision.",
    falsifier: "One treatment makes useful infrastructure clearly legible while preserving a credible direct-progress alternative.",
    variants: [
      controlVariant("gl-004-control", "Control · current economy", "Current artifact economy."),
      tunedVariant("gl-004-spare-budget", "Treatment · one extra energy", "Tests experimentation versus hoarding.", { startingCommanderEnergy: 8 }),
      tunedVariant("gl-004-cheap-implementation", "Treatment · free implementation", "Tests artifact return against nearly free direct progress.", {
        actionCostOverrides: { implement: 0 }
      }),
      tunedVariant("gl-004-cheap-full-send", "Negative control · cheap full send", "Tests whether the deep recommendation is thematically relevant.", {
        actionCostOverrides: { full_send: 1 }
      })
    ],
    trialOrder: "counterbalanced",
    preBrief: "Build only the structures whose future return justifies their command cost. More artifacts are not automatically better.",
    reviewQuestions: commonQuestions,
    acceptance: {
      mechanicRelevant: "The economy treatment changes whether or when an artifact is built.",
      lessonLegible: "The player distinguishes useful infrastructure from accumulation.",
      agencyPresent: "Building and direct progress remain credible alternatives.",
      syntheticDirectionConfirmed: "A treatment changes the intended artifact decision; otherwise its synthetic score is classified as off-theme."
    }
  }),
  definition({
    labId: "GL-005",
    version: 1,
    title: "The Policy Zoo",
    estimatedMinutes: 55,
    source: {
      campaignId: "sleep-01",
      matrixIds: ["sleep-01-deep-context-furnace"],
      reportPaths: ["data/lab/sleep-01-deep-context-furnace/report.json"],
      finding: "Only 20 of 512 deduplicated policies are viable while 446 win less than five percent of runs."
    },
    scenarioId: "context-furnace",
    scenarioVersion: 1,
    hypothesis: "Most dead policies are incoherent random strings, while human overrides can identify a reusable grammar for plausible doctrine.",
    falsifier: "Dead policies are understandable plans whose failure exposes missing engine expression rather than invalid generation.",
    variants: [
      {
        ...tunedVariant("gl-005-dead-008", "Generated policy 008", "Synthetic category: dead."),
        doctrineCard: doctrine("generated-008", "dead", [
          { unitId: "line-02", action: "review", fireMode: "full" },
          { unitId: "scout-01", action: "build_contract", fireMode: "single" },
          { unitId: "scout-01", action: "scout", fireMode: "full" }
        ])
      },
      {
        ...tunedVariant("gl-005-dead-012", "Generated policy 012", "Synthetic category: dead."),
        doctrineCard: doctrine("generated-012", "dead", [
          { unitId: "line-02", action: "scout", fireMode: "full" },
          { unitId: "line-01", action: "consolidate", fireMode: "single" },
          { unitId: "line-01", action: "review", fireMode: "full" }
        ])
      },
      {
        ...tunedVariant("gl-005-dead-029", "Generated policy 029", "Synthetic category: dead."),
        doctrineCard: doctrine("generated-029", "dead", [
          { unitId: "line-01", action: "review", fireMode: "semi" },
          { unitId: "scout-01", action: "consolidate", fireMode: "semi" },
          { unitId: "line-01", action: "consolidate", fireMode: "semi" }
        ])
      },
      {
        ...tunedVariant("gl-005-viable-028", "Generated policy 028", "Synthetic category: viable."),
        doctrineCard: doctrine("generated-028", "viable", [
          { unitId: "line-01", action: "full_send", fireMode: "single" },
          { unitId: "scout-01", action: "scout", fireMode: "single" },
          { unitId: "line-02", action: "review", fireMode: "semi" },
          { unitId: "line-01", action: "review", fireMode: "single" },
          { unitId: "line-01", action: "review", fireMode: "single" }
        ])
      },
      {
        ...tunedVariant("gl-005-viable-077", "Generated policy 077", "Synthetic category: viable."),
        doctrineCard: doctrine("generated-077", "viable", [
          { unitId: "line-01", action: "build_contract", fireMode: "single" },
          { unitId: "line-02", action: "full_send", fireMode: "single" },
          { unitId: "scout-01", action: "build_contract", fireMode: "single" },
          { unitId: "scout-01", action: "scout", fireMode: "semi" },
          { unitId: "line-02", action: "build_contract", fireMode: "semi" },
          { unitId: "line-01", action: "scout", fireMode: "single" }
        ])
      },
      {
        ...tunedVariant("gl-005-viable-108", "Generated policy 108", "Synthetic category: viable."),
        doctrineCard: doctrine("generated-108", "viable", [
          { unitId: "scout-01", action: "build_contract", fireMode: "single" },
          { unitId: "line-01", action: "scout", fireMode: "semi" },
          { unitId: "scout-01", action: "defend", fireMode: "single" },
          { unitId: "line-02", action: "build_contract", fireMode: "single" },
          { unitId: "line-01", action: "full_send", fireMode: "semi" },
          { unitId: "line-02", action: "full_send", fireMode: "semi" }
        ])
      },
      {
        ...tunedVariant("gl-005-dominant-007", "Generated policy 007", "Synthetic category: dominant."),
        doctrineCard: doctrine("generated-007", "dominant", [
          { unitId: "scout-01", action: "scout", fireMode: "single" },
          { unitId: "line-02", action: "review", fireMode: "semi" },
          { unitId: "scout-01", action: "build_contract", fireMode: "single" },
          { unitId: "line-02", action: "implement", fireMode: "semi" },
          { unitId: "scout-01", action: "build_contract", fireMode: "semi" },
          { unitId: "line-01", action: "defend", fireMode: "single" }
        ])
      },
      {
        ...tunedVariant("gl-005-dominant-065", "Generated policy 065", "Synthetic category: dominant."),
        doctrineCard: doctrine("generated-065", "dominant", [
          { unitId: "line-02", action: "build_contract", fireMode: "full" },
          { unitId: "scout-01", action: "implement", fireMode: "full" },
          { unitId: "scout-01", action: "consolidate", fireMode: "full" },
          { unitId: "scout-01", action: "full_send", fireMode: "full" },
          { unitId: "line-01", action: "implement", fireMode: "single" }
        ])
      },
      {
        ...tunedVariant("gl-005-dominant-078", "Generated policy 078", "Synthetic category: dominant."),
        doctrineCard: doctrine("generated-078", "dominant", [
          { unitId: "line-02", action: "scout", fireMode: "full" },
          { unitId: "line-01", action: "build_contract", fireMode: "single" },
          { unitId: "scout-01", action: "build_contract", fireMode: "semi" },
          { unitId: "line-01", action: "implement", fireMode: "semi" }
        ])
      },
      {
        ...tunedVariant("gl-005-lesson", "Hand-authored lesson policy", "Synthetic category: lesson."),
        doctrineCard: doctrine("lesson-burst-cool-burst", "lesson", [
          { unitId: "line-01", action: "full_send", fireMode: "full" },
          { unitId: "line-01", action: "consolidate", fireMode: "semi" },
          { unitId: "line-01", action: "full_send", fireMode: "semi" }
        ])
      },
      {
        ...tunedVariant("gl-005-naive", "Hand-authored naive policy", "Synthetic category: naive."),
        doctrineCard: doctrine("naive-sustained-fire", "naive", [
          { unitId: "line-01", action: "full_send", fireMode: "full" },
          { unitId: "line-01", action: "full_send", fireMode: "full" },
          { unitId: "line-01", action: "full_send", fireMode: "full" }
        ])
      }
    ],
    trialOrder: "randomized",
    preBrief: "Evaluate proposed doctrines. Follow each card while it remains coherent; override it when your judgment says the sequence has stopped making sense.",
    reviewQuestions: [...commonQuestions, "Why did you override or continue following the proposed doctrine?"],
    acceptance: {
      mechanicRelevant: "Overrides identify concrete invalid, incoherent, brittle, or strategically meaningful policy steps.",
      lessonLegible: "The player can explain why sampled policies fail or succeed.",
      agencyPresent: "The doctrine card informs play without forcing compliance.",
      syntheticDirectionConfirmed: "Dead, viable, and dominant labels align with human classifications often enough to derive a grammar-aware generator."
    }
  })
];

export const gameplayLabById = new Map(gameplayLabs.map((lab) => [lab.labId, lab]));
