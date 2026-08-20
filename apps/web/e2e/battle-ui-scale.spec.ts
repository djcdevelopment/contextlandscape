import { expect, test, type Route } from "@playwright/test";
import { battleViewFixture } from "../src/battle/fixture-v4.js";

async function fulfill(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("wide displays default to readable large type and preserve a chosen scale", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The 4K readability probe runs once in Chromium.");
  await page.setViewportSize({ width: 3802, height: 2048 });
  await page.route("**/api/battle-command/matches**", async (route) => fulfill(route, battleViewFixture("kinetic"), route.request().method() === "POST" ? 201 : 200));
  await page.route("**/api/art/catalog**", async (route) => fulfill(route, { schemaVersion: 1, catalogHash: `sha256:${"1".repeat(64)}`, censusReportHash: `sha256:${"2".repeat(64)}`, items: [], total: 0, offset: 0, limit: 10, nextOffset: null }));

  await page.goto("/landscape/?view=battle");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const scale = page.getByRole("group", { name: "Interface scale" });
  await expect(page.locator("main.briefing-shell")).toHaveAttribute("data-ui-scale", "large");
  await expect(scale.getByRole("status", { name: "Interface scale 115 percent" })).toHaveText("115%");
  await expect(scale.getByRole("button", { name: "Increase interface scale" })).toBeEnabled();
  await page.getByRole("button", { name: "Enter battle command" }).click();

  const shell = page.locator("main.battle-shell");
  await expect(shell).toHaveAttribute("data-ui-scale", "large");
  const layoutWidth = await page.locator(".battle-layout").evaluate((element) => element.getBoundingClientRect().width);
  expect(layoutWidth).toBeGreaterThanOrEqual(2500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  const requiredText = [
    ".battle-nav a",
    ".operation-state div > span",
    ".phase-stepper li strong",
    ".phase-guidance > p",
    ".operation-legend span",
    ".context-tools .base-rate",
    ".fleet-card-summary b",
    ".fleet-card-summary > span",
    ".unit-actions button",
    ".phase-dock > div:first-child > small"
  ];
  for (const selector of requiredText) {
    const fontSize = await page.locator(selector).first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize, selector).toBeGreaterThanOrEqual(12);
  }

  await scale.getByRole("button", { name: "Decrease interface scale" }).click();
  await expect(shell).toHaveAttribute("data-ui-scale", "standard");
  await expect(scale.getByRole("status", { name: "Interface scale 100 percent" })).toHaveText("100%");
  expect(await page.evaluate(() => localStorage.getItem("context-landscape.uiScale"))).toBe("standard");
  await page.reload();
  await expect(page.locator("main.battle-shell")).toHaveAttribute("data-ui-scale", "standard");
});

test("a maximized 4K desktop at Windows scaling fits the standard Command Deck without page scrolling", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The wide desktop resize probe runs once in Chromium.");
  await page.setViewportSize({ width: 2048, height: 900 });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("context-landscape.boardView", "perspective");
    localStorage.setItem("context-landscape.uiScale", "standard");
  });
  await page.route("**/api/battle-command/matches**", async (route) => fulfill(route, battleViewFixture("kinetic"), route.request().method() === "POST" ? 201 : 200));
  await page.route("**/api/art/catalog**", async (route) => fulfill(route, { schemaVersion: 1, catalogHash: `sha256:${"1".repeat(64)}`, censusReportHash: `sha256:${"2".repeat(64)}`, items: [], total: 0, offset: 0, limit: 10, nextOffset: null }));

  await page.goto("/landscape/?view=battle");
  await page.getByRole("button", { name: "Enter battle command" }).click();
  await expect(page.getByLabel("Fleet command lane")).toBeVisible();

  const geometry = await page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth
  }));
  expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight + 1);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);

  const boardHeight = await page.locator(".command-deck-board .perspective-canvas-shell").evaluate((element) => element.getBoundingClientRect().height);
  expect(boardHeight).toBeGreaterThanOrEqual(240);

  await page.getByRole("button", { name: "Tactical 2D" }).click();
  await expect(page.getByRole("grid", { name: "10 by 10 operational field" })).toBeVisible();
  const tacticalGeometry = await page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight
  }));
  expect(tacticalGeometry.scrollHeight).toBeLessThanOrEqual(tacticalGeometry.clientHeight + 1);
});
