import { describe, expect, it } from "vitest";
import {
  AttentionV4CommandIntentSchema,
  AttentionV4DensityPctSchema,
  AttentionV4FleetSchema,
  AttentionV4LegalSchema,
  AttentionV4UnitStateSchema,
  ATTENTION_V4_COMPOSITION_MODULES,
  attentionV4FleetWeight,
  BattleCommandV2CreateRequestSchema,
  BattleCommandV2SubmissionSchema
} from "./attention-v4.js";

describe("attention-v4.2 schema-v3 contracts", () => {
  it("accepts the five capped weight-six fleets and rejects one-dimensional extremes", () => {
    const fleets = [
      ["line", "scout", "scout", "scout", "scout"],
      ["line", "line", "scout", "scout"],
      ["line", "line", "line"],
      ["heavy", "scout", "scout", "scout"],
      ["heavy", "line", "scout"]
    ] as const;
    expect(ATTENTION_V4_COMPOSITION_MODULES).toHaveLength(5);
    for (const fleet of fleets) {
      expect(attentionV4FleetWeight(fleet)).toBe(6);
      expect(AttentionV4FleetSchema.safeParse(fleet).success).toBe(true);
    }
    expect(AttentionV4FleetSchema.safeParse(["heavy", "heavy", "heavy"]).success).toBe(false);
    expect(AttentionV4FleetSchema.safeParse(["heavy", "heavy"]).success).toBe(false);
    expect(AttentionV4FleetSchema.safeParse(["scout", "scout", "scout", "scout", "scout", "scout"]).success).toBe(false);
    expect(BattleCommandV2CreateRequestSchema.safeParse({ playerCompositionModule: "line-four-scout", opponentCompositionModule: "heavy-three-scout" }).success).toBe(true);
    expect(BattleCommandV2CreateRequestSchema.safeParse({ playerCompositionModule: "six-scout" }).success).toBe(false);
    expect(BattleCommandV2CreateRequestSchema.safeParse({ opponentCompositionModule: "two-heavy" }).success).toBe(false);
    expect(BattleCommandV2CreateRequestSchema.safeParse({ playerCompositionModule: "three-heavy" }).success).toBe(false);
  });

  it("permits a frozen unit with zero effective UAP", () => {
    expect(() => AttentionV4UnitStateSchema.parse({
      unitId: "alpha:scout-1",
      ownerPlayerId: "alpha",
      chassis: "scout",
      position: { x: 1, y: 1 },
      activeRange: 2,
      reactorRating: 3,
      calibration: 0.2,
      condenseSteps: 0,
      rangeChanged: false,
      forcedDisplaced: false,
      outputDecision: "pending",
      uplinkQueued: false,
      uap: { base: 3, batteryBonus: 1, effective: 0, spent: 0, frozen: true, freezeSources: ["emp"], nextFreezeSources: [] },
      lastPlan: []
    })).not.toThrow();
  });

  it("requires integer five-point densities from 20 through 100", () => {
    expect(AttentionV4DensityPctSchema.safeParse(20).success).toBe(true);
    expect(AttentionV4DensityPctSchema.safeParse(85).success).toBe(true);
    expect(AttentionV4DensityPctSchema.safeParse(22).success).toBe(false);
    expect(AttentionV4CommandIntentSchema.safeParse({ kind: "emit", playerId: "alpha", unitId: "u", volume: 1.5, densityPct: 80 }).success).toBe(false);
  });

  it("requires complete kinetic submissions and an exact Fire-or-Pass artillery shape", () => {
    const plans = ["scout", "line", "heavy"].map((name) => ({ unitId: `alpha:${name}-1`, actions: [] }));
    expect(BattleCommandV2SubmissionSchema.safeParse({ phase: "kinetic", plans }).success).toBe(true);
    expect(BattleCommandV2SubmissionSchema.safeParse({ phase: "kinetic", plans: plans.slice(0, 2) }).success).toBe(true);
    expect(BattleCommandV2SubmissionSchema.safeParse({ phase: "kinetic", plans: plans.slice(0, 1) }).success).toBe(false);
    expect(BattleCommandV2SubmissionSchema.safeParse({ phase: "artillery", cardId: "card-1" }).success).toBe(false);
    expect(BattleCommandV2SubmissionSchema.safeParse({ phase: "artillery", cardId: "card-1", center: { x: 4, y: 4 } }).success).toBe(true);
    expect(BattleCommandV2SubmissionSchema.safeParse({ phase: "artillery", cardId: null }).success).toBe(true);
    expect(BattleCommandV2SubmissionSchema.safeParse({ phase: "artillery", cardId: null, center: { x: 4, y: 4 } }).success).toBe(false);
  });

  it("keeps ordered shell legality, exact costs, and zero-UAP projections explicit", () => {
    const parsed = AttentionV4LegalSchema.parse({
      phase: "kinetic",
      activeCommanderId: null,
      kinetic: [{ unitId: "alpha:scout-1", baseUap: 3, batteryBonus: 1, effectiveUap: 0, frozen: true, maxSupportScans: 0, condenseSteps: 0, maxCondenseSteps: 2, range: { current: 2, minimum: 1, maximum: 5 } }],
      shellCards: [{ cardId: "one", shell: "emp", legal: false, reason: "cooldown-2", usesRetaliation: false }],
      artilleryPreviews: [],
      capacity: { available: false, rank: 1, cost: 1, award: 1, affordable: false },
      allocations: [{ unitId: "alpha:scout-1", reactorRating: 3, prefillVolume: 3, prefillDensityPct: 20, condenseSteps: 0, maximumVolume: 3, maximumDensityPct: 20, maximumVolumeByDensity: { "20": 3 }, decision: "pending" }],
      artifacts: [{ artifactId: "a", verify: { legal: true, reason: null, cost: { base: 1, batteryDiscount: 1, overclockDiscount: 0, total: 0, batteryArtifactId: "battery" } }, seize: { legal: true, reason: null, cost: { base: 1, batteryDiscount: 1, overclockDiscount: 1, total: 0, batteryArtifactId: "battery" } }, batteryEligibleOnVerify: true }],
      abilities: { perfectFocus: { ready: false, reason: "capacity-rank-required", usesRemaining: 3, nextReadyRound: 1 }, overclock: { ready: false, reason: "capacity-rank-required", usesRemaining: 1 } },
      canEndCommand: false,
      endCommandReason: "3 output decision(s) required",
      projectedHazards: []
    });
    expect(parsed.kinetic[0].effectiveUap).toBe(0);
    expect(parsed.shellCards.map((card) => card.shell)).toEqual(["emp"]);
    expect(parsed.artifacts[0].verify.cost.total).toBe(0);
  });
});
