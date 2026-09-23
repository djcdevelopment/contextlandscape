import { expect, test, type Page } from "@playwright/test";
import { battleViewFixture } from "../src/battle/fixture-v4.js";

const timestamp = "2026-09-06T12:00:00.000Z";
const account = { schemaVersion: 1, accountId: "review-pilot", displayName: "Review Pilot", avatarUrl: null, createdAt: timestamp, lastSeenAt: timestamp };
const fleet = {
  schemaVersion: 1, fleetId: "review-fleet", ownerAccountId: account.accountId, name: "Review Fleet", status: "ready", weight: 6, compositionModule: "heavy-line-scout",
  units: ["scout", "line", "heavy"].map((chassis) => ({ slotId: chassis, chassis, artAssetId: null })),
  identity: { commanderAssetId: null, battlefieldAssetId: null, paletteId: "signal-teal", emblemId: "aperture" }, createdAt: timestamp, updatedAt: timestamp
};
const invitation = { schemaVersion: 1, challengeId: "duel_review", creator: account, opponent: null, status: "open", createdAt: timestamp, expiresAt: "2026-10-06T12:00:00.000Z", matchId: null, joinPath: "/landscape/?challenge=duel_review", ownFleet: null, opponentFleet: null };

async function hangarApi(page: Page, options: { failAuth?: boolean; failArt?: boolean; incoming?: boolean; failSave?: boolean } = {}) {
  let authReads = 0; let artReads = 0; let saved = structuredClone(fleet);
  const writes: { path: string; body: unknown; method: string }[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method !== "GET") writes.push({ path, body: request.postDataJSON(), method });
    if (path === "/api/auth/session") {
      authReads++;
      if (options.failAuth && authReads === 1) return route.fulfill({ status: 503, json: { error: "unavailable" } });
      return route.fulfill({ json: { schemaVersion: 1, authenticated: true, account, csrfToken: "review-csrf-token" } });
    }
    if (path === "/api/hangar/fleets") return route.fulfill({ json: [saved, { ...fleet, fleetId: "second-fleet", name: "Second Fleet" }] });
    if (path === "/api/hangar/fleets/review-fleet" && method === "PATCH") {
      if (options.failSave) return route.fulfill({ status: 503, json: { error: "unavailable" } });
      saved = { ...saved, ...request.postDataJSON() }; return route.fulfill({ json: saved });
    }
    if (path.startsWith("/api/art/catalog")) {
      artReads++;
      if (options.failArt && artReads === 1) return route.fulfill({ status: 503, json: { error: "unavailable" } });
      return route.fulfill({ json: { schemaVersion: 1, items: [], total: 0, offset: 0, limit: 40, nextOffset: null } });
    }
    if (path === "/api/battle-command/challenges" && method === "GET") return route.fulfill({ json: [invitation] });
    if (path.startsWith("/api/battle-command/challenges")) return route.fulfill({ json: options.incoming ? { ...invitation, creator: { ...account, accountId: "other-pilot" } } : invitation });
    return route.fulfill({ status: 404, json: { error: "unexpected_test_request" } });
  });
  return { writes, authReads: () => authReads, artReads: () => artReads };
}

test("dirty fleets must be saved before either invitation action, and leaving protects the draft", async ({ page }) => {
  const api = await hangarApi(page, { incoming: true });
  await page.goto("/landscape/?challenge=duel_review");
  await page.getByRole("button", { name: /^Review Fleet/ }).click();
  await page.getByLabel("Fleet name").fill("Revised Fleet");
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Challenge friend" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Lock fleet and accept" })).toBeDisabled();
  for (const trigger of [page.getByRole("button", { name: "New", exact: true }), page.getByRole("button", { name: /^Second Fleet/ }), page.getByRole("link", { name: "Battle Command", exact: true })]) {
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Discard unsaved fleet changes?" });
    await expect(dialog.getByRole("button", { name: "Keep editing" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByLabel("Fleet name")).toHaveValue("Revised Fleet");
  }
  expect(api.writes).toHaveLength(0);
  await page.getByRole("button", { name: "Save fleet", exact: true }).click();
  await expect(page.getByText("Saved fleet", { exact: true })).toBeVisible();
  expect(api.writes[0]).toMatchObject({ method: "PATCH", body: { name: "Revised Fleet" } });
  await expect(page.getByRole("button", { name: "Lock fleet and accept" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Challenge friend" })).toBeEnabled();
});

test("reopened invitations retain Copy link with success feedback and a manual fallback", async ({ page }) => {
  const api = await hangarApi(page);
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("denied"); } }, configurable: true }));
  await page.goto("/landscape/?challenge=duel_review");
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.locator(".copy-feedback")).toContainText(/select|copy/i);
  await expect(page.locator(".share-card code")).toContainText("/landscape/?challenge=duel_review");
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => undefined }, configurable: true }));
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.locator(".copy-feedback")).toContainText("copied");
  expect(api.writes).toHaveLength(0);
});

test("read failures recover without losing drafts or replaying mutations", async ({ page }) => {
  const api = await hangarApi(page, { failAuth: true, failArt: true, failSave: true });
  await page.goto("/landscape/?view=hangar");
  await expect(page.getByRole("alert")).toContainText("could not be loaded");
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByRole("button", { name: /^Review Fleet/ }).click();
  expect(api.authReads()).toBe(2);
  await page.getByLabel("Fleet name").fill("Still my draft");
  await page.getByRole("button", { name: /^Choose any unit image/ }).first().click();
  const picker = page.getByRole("dialog", { name: "Choose unit art" });
  await expect(picker.getByRole("alert")).toBeVisible();
  await picker.getByRole("button", { name: "Try again" }).click();
  await expect(picker.getByRole("alert")).toHaveCount(0);
  expect(api.artReads()).toBe(2);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save fleet", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Could not confirm");
  expect(api.writes).toHaveLength(1);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("Fleet name")).toHaveValue("Still my draft");
  expect(api.writes).toHaveLength(1);
});

test("delete dialogs trap focus, support Escape, and restore the trigger", async ({ page }) => {
  await hangarApi(page); await page.goto("/landscape/?view=hangar");
  await page.getByRole("button", { name: /^Review Fleet/ }).click();
  const trigger = page.getByRole("button", { name: "Delete fleet", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Delete Review Fleet?" });
  await expect(dialog.getByRole("button", { name: "Keep fleet" })).toBeFocused();
  expect(await page.locator("#root").evaluate((root) => root.inert)).toBe(true);
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press(index % 2 ? "Shift+Tab" : "Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  expect(await page.locator("#root").evaluate((root) => root.inert)).toBe(false);
});

test("expanded artifact workspace keeps desktop phase actions visible at every interface scale", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Runs the viewport matrix once.");
  await page.route("**/api/battle-command/matches**", (route) => route.fulfill({ json: battleViewFixture("command", { hazard: true }) }));
  await page.route("**/api/art/catalog**", (route) => route.fulfill({ json: { items: [] } }));
  for (const viewport of [{ width: 2048, height: 986 }, { width: 1440, height: 1000 }, { width: 1366, height: 768 }, { width: 390, height: 844 }, { width: 720, height: 500 }]) {
    await page.setViewportSize(viewport);
    for (const scale of ["compact", "standard", "large", "xlarge"]) {
      await page.goto("/landscape/");
      await page.evaluate((value) => { localStorage.clear(); localStorage.setItem("context-landscape.uiScale", value); }, scale);
      await page.reload(); await page.getByRole("button", { name: "Enter battle command" }).click();
      await page.locator(".artifact-piece").first().click();
      await expect(page.getByLabel("Context inspector details", { exact: true })).toBeVisible();
      const geometry = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, dock: document.querySelector(".phase-dock")!.getBoundingClientRect().bottom }));
      expect(geometry.width, `${viewport.width} / ${scale} horizontal overflow`).toBeLessThanOrEqual(viewport.width + 1);
      if (viewport.width > 1180) {
        expect(geometry.height, `${viewport.width} / ${scale} page overflow`).toBeLessThanOrEqual(viewport.height + 1);
        expect(geometry.dock).toBeLessThanOrEqual(viewport.height + 1);
      }
      await page.getByRole("button", { name: "End Command", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "End Command risk check" })).toContainText("line-1 · artifact 1");
      await page.keyboard.press("Escape");
    }
  }
});

test("shared navigation and interface scale remain available outside Battle Command", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { schemaVersion: 1, authenticated: false } }));
  await page.goto("/landscape/?view=hangar");
  const navigation = page.getByRole("navigation", { name: "Context Landscape views" });
  await expect(navigation).toBeVisible();
  await page.getByRole("button", { name: "Increase interface scale" }).click();
  const scale = await page.locator("html").getAttribute("data-ui-scale");
  await navigation.getByText("Views", { exact: true }).click();
  await navigation.getByRole("link", { name: "Evidence Atlas" }).click();
  await expect(page.locator(".atlas-shell")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-ui-scale", scale!);
  await expect(page.getByRole("navigation", { name: "Context Landscape views" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
});

test("accepted fleet identities stack within the mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await hangarApi(page);
  await page.route("**/api/battle-command/challenges/duel_review", (route) => route.fulfill({ json: {
    ...invitation, status: "accepted", opponent: { ...account, accountId: "other-pilot", displayName: "Far Signal" }, matchId: "review-match",
    ownFleet: { ...fleet, snapshotHash: `sha256:${"a".repeat(64)}` },
    opponentFleet: { ...fleet, fleetId: "other-fleet", name: "Far Signal", snapshotHash: `sha256:${"b".repeat(64)}` }
  } }));
  await page.goto("/landscape/?challenge=duel_review");
  await expect(page.getByRole("link", { name: "Enter battlefield" })).toBeVisible();
  const cards = page.locator(".challenge-fleet-reveal article");
  const first = await cards.nth(0).boundingBox(); const second = await cards.nth(1).boundingBox();
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
