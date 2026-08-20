import { expect, test, type Page, type Route } from "@playwright/test";
import type { BattleExperience, FleetView, FriendBattleCommandView, FriendChallengeView, ReadyFleetSnapshot } from "@landscape/contracts";
import { battleViewFixture } from "../src/battle/fixture-v4.js";

const timestamp = "2026-08-19T00:00:00.000Z";
const alphaAccount = { schemaVersion: 1 as const, accountId: "account-alpha", displayName: "Alpha Pilot", avatarUrl: null, createdAt: timestamp, lastSeenAt: timestamp };
const bravoAccount = { schemaVersion: 1 as const, accountId: "account-bravo", displayName: "Bravo Pilot", avatarUrl: null, createdAt: timestamp, lastSeenAt: timestamp };

function fleet(fleetId: string, ownerAccountId: string, name: string, compositionModule: "heavy-line-scout" | "two-line-two-scout"): FleetView {
  const chassis = compositionModule === "heavy-line-scout" ? ["heavy", "line", "scout"] as const : ["line", "line", "scout", "scout"] as const;
  return {
    schemaVersion: 1, fleetId, ownerAccountId, name, status: "ready", weight: 6, compositionModule,
    units: chassis.map((unit, index) => ({ slotId: `${fleetId}-${index}`, chassis: unit, artAssetId: null })),
    identity: { commanderAssetId: null, battlefieldAssetId: null, paletteId: ownerAccountId === "account-alpha" ? "signal-teal" : "warning-amber", emblemId: ownerAccountId === "account-alpha" ? "aperture" : "chevron" },
    createdAt: timestamp, updatedAt: timestamp
  };
}

const alphaFleet = fleet("fleet-alpha", alphaAccount.accountId, "Alpha Anchor", "heavy-line-scout");
const bravoFleet = fleet("fleet-bravo", bravoAccount.accountId, "Bravo Screen", "two-line-two-scout");
const snapshot = (value: FleetView): ReadyFleetSnapshot => ({ ...value, status: "ready", weight: 6, compositionModule: value.compositionModule!, snapshotHash: `sha256:${(value.ownerAccountId === alphaAccount.accountId ? "a" : "b").repeat(64)}` } as ReadyFleetSnapshot);
const alphaSnapshot = { ...snapshot(alphaFleet), snapshotHash: `sha256:${"a".repeat(64)}` };
const bravoSnapshot = { ...snapshot(bravoFleet), snapshotHash: `sha256:${"b".repeat(64)}` };

function challenge(status: "open" | "accepted", seat: "alpha" | "bravo"): FriendChallengeView {
  return {
    schemaVersion: 1, challengeId: "challenge-one", creator: alphaAccount, opponent: status === "accepted" ? bravoAccount : null,
    status, createdAt: timestamp, expiresAt: "2026-08-20T00:00:00.000Z", matchId: status === "accepted" ? "match-one" : null,
    joinPath: "/?challenge=challenge-one",
    ownFleet: status === "accepted" ? (seat === "alpha" ? alphaSnapshot : bravoSnapshot) : null,
    opponentFleet: status === "accepted" ? (seat === "alpha" ? bravoSnapshot : alphaSnapshot) : null
  };
}

function swapSeats(value: unknown): unknown {
  if (value === "alpha") return "bravo";
  if (value === "bravo") return "alpha";
  if (Array.isArray(value)) return value.map(swapSeats);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, swapSeats(nested)]));
  return value;
}

async function fulfill(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("two isolated players lock hidden fleets and resolve a simultaneous phase from perspective view", async ({ page: alphaPage, browser }) => {
  let accepted = false;
  let created = false;
  let phase: "kinetic" | "artillery" = "kinetic";
  let revision = 0;
  const submitted = { alpha: false, bravo: false };
  const actionBodies: unknown[] = [];

  const battlePayload = (seat: "alpha" | "bravo"): FriendBattleCommandView => {
    const battle = battleViewFixture(phase);
    battle.revision = revision;
    battle.projection.matchId = "match-one";
    const experience: BattleExperience = {
      schemaVersion: 1, mode: "friend", status: "active", concededBy: null, winnerSeat: null, viewerSeat: seat,
      waitingFor: phase === "kinetic" && submitted[seat] && !submitted[seat === "alpha" ? "bravo" : "alpha"] ? "opponent" : null,
      submitted: submitted[seat], fleets: { alpha: alphaSnapshot, bravo: bravoSnapshot }, accountSeats: { alpha: alphaAccount.accountId, bravo: bravoAccount.accountId }
    };
    return { battle: (seat === "alpha" ? battle : swapSeats(battle)) as typeof battle, experience };
  };

  const installApi = async (page: Page, seat: "alpha" | "bravo") => {
    await page.addInitScript(() => localStorage.clear());
    await page.route("**/api/**", async (route) => {
      const request = route.request(); const url = new URL(request.url()); const method = request.method();
      if (url.pathname === "/api/auth/session") return fulfill(route, { schemaVersion: 1, authenticated: true, account: seat === "alpha" ? alphaAccount : bravoAccount, csrfToken: `csrf-${seat}-token-with-enough-characters` });
      if (url.pathname === "/api/hangar/fleets") return fulfill(route, [seat === "alpha" ? alphaFleet : bravoFleet]);
      if (url.pathname === "/api/battle-command/challenges" && method === "GET") return fulfill(route, seat === "alpha" && created ? [challenge(accepted ? "accepted" : "open", seat)] : accepted ? [challenge("accepted", seat)] : []);
      if (url.pathname === "/api/battle-command/challenges" && method === "POST") { created = true; return fulfill(route, challenge("open", seat), 201); }
      if (url.pathname === "/api/battle-command/challenges/challenge-one" && method === "GET") return fulfill(route, challenge(accepted ? "accepted" : "open", seat));
      if (url.pathname.endsWith("/challenges/challenge-one/accept") && method === "POST") { accepted = true; return fulfill(route, challenge("accepted", seat)); }
      if (url.pathname.endsWith("/matches/match-one/stream")) return fulfill(route, {}, 204);
      if (url.pathname === "/api/battle-command/friend-matches/match-one" && method === "GET") return fulfill(route, battlePayload(seat));
      if (url.pathname.endsWith("/friend-matches/match-one/actions") && method === "POST") {
        actionBodies.push(request.postDataJSON()); submitted[seat] = true;
        const other = seat === "alpha" ? "bravo" : "alpha";
        if (submitted[other]) { phase = "artillery"; revision = 1; submitted.alpha = false; submitted.bravo = false; }
        return fulfill(route, battlePayload(seat));
      }
      return fulfill(route, { error: `unhandled:${method}:${url.pathname}` }, 404);
    });
  };

  const viewport = alphaPage.viewportSize() ?? undefined;
  const bravoContext = await browser.newContext({ viewport });
  const bravoPage = await bravoContext.newPage();
  await installApi(alphaPage, "alpha"); await installApi(bravoPage, "bravo");

  try {
    await alphaPage.goto("/landscape/?view=hangar");
    await alphaPage.getByRole("button", { name: /Alpha Anchor/ }).click();
    await alphaPage.getByRole("button", { name: "Challenge friend" }).click();
    await expect(alphaPage.getByText("PRIVATE INVITATION")).toBeVisible();

    await bravoPage.goto("/landscape/?challenge=challenge-one");
    await expect(bravoPage.getByText(/composition and art remain hidden/i)).toBeVisible();
    await expect(bravoPage.getByText("Alpha Anchor")).toHaveCount(0);
    await bravoPage.getByRole("button", { name: /Bravo Screen/ }).click();
    await bravoPage.getByRole("button", { name: "Lock fleet and accept" }).click();
    await expect(bravoPage.getByText("FLEETS LOCKED · IDENTITIES REVEALED")).toBeVisible();
    await expect(bravoPage.getByRole("article").filter({ hasText: "Opponent" }).getByText("Alpha Anchor")).toBeVisible();
    await expect(bravoPage.getByRole("article").filter({ hasText: "Your fleet" }).getByText("Bravo Screen")).toBeVisible();

    await Promise.all([
      alphaPage.goto("/landscape/?friendBattle=match-one"),
      bravoPage.getByRole("link", { name: "Enter battlefield" }).click()
    ]);
    await expect(alphaPage).toHaveURL(/\/landscape\/\?friendBattle=match-one$/);
    await expect(bravoPage).toHaveURL(/\/landscape\/\?friendBattle=match-one$/);
    await expect(alphaPage.getByRole("region", { name: "Player-edge perspective battlefield" })).toBeVisible();
    await expect(bravoPage.getByRole("region", { name: "Player-edge perspective battlefield" })).toBeVisible();
    await expect(alphaPage.getByRole("button", { name: "Perspective" })).toHaveAttribute("aria-pressed", "true");

    await alphaPage.getByRole("button", { name: "Resolve Kinetic" }).click();
    await expect(alphaPage.getByText("Orders locked — waiting for your opponent")).toBeVisible();
    await bravoPage.getByRole("button", { name: "Resolve Kinetic" }).click();
    await expect(bravoPage.getByText("SIMULTANEOUS ARTILLERY")).toBeVisible();
    await alphaPage.reload();
    await expect(alphaPage.getByText("SIMULTANEOUS ARTILLERY")).toBeVisible();
    expect(actionBodies).toHaveLength(2);
    expect(actionBodies).toEqual(expect.arrayContaining([expect.objectContaining({ revision: 0, submission: expect.objectContaining({ phase: "kinetic" }) })]));
  } finally {
    await bravoContext.close();
  }
});
