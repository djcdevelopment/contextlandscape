import { expect, test, type Route } from "@playwright/test";
import {
  BattleCommandV3ViewSchema,
  type AttentionV4EventEnvelope,
  type BattleCommandV3View
} from "@landscape/contracts";
import { battleViewFixture } from "../src/battle/fixture-v4.js";

function event(sequence: number, eventType: string, actorId: string | null, data: Record<string, unknown> = {}): AttentionV4EventEnvelope {
  return {
    schemaVersion: 1,
    eventId: `journey:${sequence}`,
    matchId: "fixture-battle",
    sequence,
    turn: 3,
    slot: 3,
    occurredAt: new Date(sequence * 1_000).toISOString(),
    eventType,
    actorId,
    causationId: null,
    correlationId: "journey",
    data
  };
}

function stagedViews(): BattleCommandV3View[] {
  const kinetic = structuredClone(battleViewFixture("kinetic"));
  const artillery = structuredClone(battleViewFixture("artillery"));
  artillery.revision = 1;
  artillery.projection.capacityTrack.artilleryUnlocked = true;
  artillery.events = [event(1, "attention.v4.register", null, { reloadedCardIds: ["reload-a", "reload-b", "reload-c"] })];

  const capacity = structuredClone(battleViewFixture("capacity"));
  capacity.revision = 2;
  capacity.events = [
    event(2, "attention.v4.artillery.shell.fired", "alpha", { shell: "emp", victimUnitIds: ["alpha:scout-1", "bravo:scout-1"] }),
    event(3, "attention.v4.artillery.counterfire.ready", "bravo")
  ];

  const command = structuredClone(battleViewFixture("command", { hazard: true }));
  command.revision = 3;
  const candidate = command.projection.artifacts[0];
  candidate.artifactId = "journey:r2:alpha:line-1:battery-candidate";
  candidate.position = { x: 2, y: 3 };
  candidate.densityPct = 80;
  candidate.sourceCalibration = 0.85;
  candidate.effectiveCalibration = 0.68;
  candidate.age = 1;
  candidate.localTraffic = 1;
  candidate.overTaxReasons = [];
  const existingBattery = {
    ...structuredClone(candidate),
    artifactId: "journey:r1:alpha:line-1:existing-battery",
    position: { x: 2, y: 2 },
    verified: true,
    revealedSound: true,
    age: 0,
    localTraffic: 0,
    battery: { active: true, activatedRound: 1, suppressed: false }
  };
  const doomed = {
    ...structuredClone(candidate),
    artifactId: "journey:r1:alpha:scout-1:doomed-context",
    sourceUnitId: "alpha:scout-1",
    sourceChassis: "scout" as const,
    position: { x: 1, y: 1 },
    densityPct: 20,
    sourceCalibration: 0.2,
    effectiveCalibration: 0.04,
    age: 2,
    contextLimit: 1,
    localTraffic: 4,
    overTaxReasons: ["context-limit" as const, "local-traffic" as const]
  };
  command.projection.artifacts = [existingBattery, candidate, doomed];
  command.legal.artifacts = [
    {
      artifactId: candidate.artifactId,
      verify: { legal: true, reason: null, cost: { base: 1, batteryDiscount: 1, overclockDiscount: 0, total: 0, batteryArtifactId: existingBattery.artifactId } },
      seize: { legal: true, reason: null, cost: { base: 2, batteryDiscount: 1, overclockDiscount: 0, total: 1, batteryArtifactId: existingBattery.artifactId } },
      batteryEligibleOnVerify: true
    },
    {
      artifactId: doomed.artifactId,
      verify: { legal: true, reason: null, cost: { base: 1, batteryDiscount: 1, overclockDiscount: 0, total: 0, batteryArtifactId: existingBattery.artifactId } },
      seize: { legal: true, reason: null, cost: { base: 1, batteryDiscount: 1, overclockDiscount: 0, total: 0, batteryArtifactId: existingBattery.artifactId } },
      batteryEligibleOnVerify: false
    }
  ];
  command.legal.projectedHazards = [{ artifactId: doomed.artifactId, ownerPlayerId: "alpha", reasons: ["context-limit", "local-traffic"], drift: 2, frozenUnitIds: ["alpha:scout-1"] }];
  command.events = [event(4, "attention.v4.battery.activated", "alpha", { artifactId: existingBattery.artifactId })];

  const verified = structuredClone(command);
  verified.revision = 4;
  const verifiedCandidate = verified.projection.artifacts.find((artifact) => artifact.artifactId === candidate.artifactId)!;
  verifiedCandidate.verified = true;
  verifiedCandidate.revealedSound = true;
  verifiedCandidate.battery = { active: true, activatedRound: 2, suppressed: false };
  verified.legal.artifacts = verified.legal.artifacts.filter((item) => item.artifactId !== candidate.artifactId);
  verified.events = [event(5, "attention.v4.artifact.verified", "alpha", { artifactId: candidate.artifactId, cost: { total: 0 } }), event(6, "attention.v4.battery.activated", "alpha", { artifactId: candidate.artifactId })];

  const terminal = structuredClone(battleViewFixture("terminal", { terminal: true }));
  terminal.revision = 5;
  terminal.projection.units.find((unit) => unit.unitId === "alpha:scout-1")!.uap = {
    base: 3,
    batteryBonus: 0,
    effective: 0,
    spent: 0,
    frozen: true,
    freezeSources: ["emp"],
    nextFreezeSources: []
  };
  terminal.projection.lastRegisterRecap = {
    ...terminal.projection.lastRegisterRecap,
    round: 3,
    reloads: [{ playerId: "alpha", cardIds: ["reload-a", "reload-b", "reload-c"] }, { playerId: "bravo", cardIds: [] }],
    uap: terminal.projection.units.map((unit) => ({ unitId: unit.unitId, base: unit.uap.base, batteryBonus: unit.uap.batteryBonus, effective: unit.uap.effective, frozen: unit.uap.frozen }))
  };
  terminal.recaps.register = terminal.projection.lastRegisterRecap;
  terminal.projection.lastResolutionRecap = {
    completedRound: 3,
    detonations: [{ artifactId: doomed.artifactId, ownerPlayerId: "alpha", reasons: ["context-limit", "local-traffic"], drift: 2, frozenUnitIds: ["alpha:scout-1"] }],
    resolutions: [{ artifactId: "terminal-sound", outcome: "sound" }],
    players: terminal.projection.players.map((player) => ({ playerId: player.playerId, progress: player.progress, drift: player.drift, attention: player.attention, status: player.status })),
    terminal: true
  };
  terminal.recaps.resolution = terminal.projection.lastResolutionRecap;
  terminal.events = [
    event(7, "attention.v4.artifact.detonated", "alpha", { artifactId: doomed.artifactId, drift: 2, frozenUnitIds: ["alpha:scout-1"] }),
    event(8, "attention.v4.register.armory.reloaded", "alpha", { cardIds: ["reload-a", "reload-b", "reload-c"] }),
    event(9, "attention.v4.artillery.counterfire.consumed", "bravo")
  ];
  return [kinetic, artillery, capacity, command, verified, terminal].map((view) => BattleCommandV3ViewSchema.parse(view));
}

async function fulfill(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("deterministic Battery, EMP, counterfire, reload, detonation, and terminal journey", async ({ page }) => {
  const [kinetic, artillery, capacity, command, verified, terminal] = stagedViews();
  let action = 0;
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("context-landscape.boardView", "tactical");
  });
  await page.route("**/api/battle-command/matches**", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && !request.url().endsWith("/actions")) return fulfill(route, kinetic, 201);
    if (request.method() === "POST" && request.url().endsWith("/actions")) {
      const responses = [artillery, capacity, command, verified, terminal];
      return fulfill(route, responses[action++]);
    }
    return fulfill(route, kinetic);
  });

  await page.goto("/landscape/?view=battle");
  await page.getByRole("button", { name: "Enter battle command" }).click();
  await expect(page.getByRole("grid", { name: "10 by 10 operational field" })).toBeVisible();
  await page.getByRole("button", { name: "Resolve Kinetic" }).click();

  await expect(page.getByText("COUNTERFIRE READY")).toBeVisible();
  await page.getByRole("button", { name: /EMP/ }).first().click();
  await page.getByRole("gridcell", { name: /^4,4/ }).click();
  await page.getByRole("button", { name: "Fire card" }).click();
  await page.getByRole("button", { name: "Pass" }).last().click();

  await page.getByRole("button", { name: /battery-candidate/ }).click();
  await expect(page.getByRole("button", { name: /^Verify/ })).toContainText("0");
  await page.getByRole("button", { name: /^Verify/ }).click();
  await expect(page.getByText("ACTIVE BATTERY").last()).toBeVisible();

  await page.getByRole("button", { name: "End Command" }).click();
  await expect(page.getByRole("dialog", { name: "End Command risk check" })).toContainText("doomed-context");
  await page.getByRole("button", { name: "Confirm End" }).click();

  await expect(page.getByText("Victory secured")).toBeVisible();
  await expect(page.getByText("1 detonated")).toBeVisible();
  await expect(page.getByText("0 FROZEN")).toBeVisible();
  await expect(page.getByText(/register \/ armory \/ reloaded/i)).toBeVisible();
  await expect(page.getByText(/artillery \/ counterfire \/ consumed/i)).toBeVisible();
  await page.getByRole("link", { name: "Evidence atlas" }).click();
  await expect(page).toHaveURL(/\/landscape\/\?view=atlas$/);
  await expect(page.getByRole("heading", { name: "All-labs topography" })).toBeVisible();
});
