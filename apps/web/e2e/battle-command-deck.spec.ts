import { expect, test, type Page, type Route } from "@playwright/test";
import type { BattleCommandV3View } from "@landscape/contracts";
import { battleViewFixture } from "../src/battle/fixture-v4.js";

const emptyCatalog = {
  schemaVersion: 1,
  catalogHash: `sha256:${"2".repeat(64)}`,
  censusReportHash: `sha256:${"3".repeat(64)}`,
  items: [],
  total: 0,
  offset: 0,
  limit: 10,
  nextOffset: null
};

function fiveUnitView(): BattleCommandV3View {
  const view = structuredClone(battleViewFixture("kinetic"));
  const additions = [
    { sourceId: "alpha:scout-1", unitId: "alpha:scout-2", x: 3, y: 1 },
    { sourceId: "alpha:line-1", unitId: "alpha:line-2", x: 1, y: 3 }
  ];
  for (const addition of additions) {
    const source = view.projection.units.find((unit) => unit.unitId === addition.sourceId)!;
    view.projection.units.push({
      ...structuredClone(source),
      unitId: addition.unitId,
      position: { x: addition.x, y: addition.y }
    });
    const allocation = view.legal.allocations.find((item) => item.unitId === addition.sourceId)!;
    view.legal.allocations.push({ ...structuredClone(allocation), unitId: addition.unitId });
    const kinetic = view.legal.kinetic.find((item) => item.unitId === addition.sourceId)!;
    view.legal.kinetic.push({ ...structuredClone(kinetic), unitId: addition.unitId });
  }
  return view;
}

function nextRoundView(): BattleCommandV3View {
  const view = structuredClone(battleViewFixture("kinetic"));
  const alpha = view.projection.players.find((player) => player.playerId === "alpha")!;
  alpha.progress = 1;
  const recap = {
    completedRound: 1,
    detonations: [],
    resolutions: [{ artifactId: "fixture:r1:alpha:line-1:0", outcome: "sound" as const }],
    players: view.projection.players.map((player) => ({
      playerId: player.playerId,
      progress: player.progress,
      drift: player.drift,
      attention: player.attention,
      status: player.status
    })),
    terminal: false
  };
  view.revision = 1;
  view.projection.round = 2;
  view.projection.lastResolutionRecap = recap;
  view.recaps.resolution = recap;
  return view;
}

async function fulfill(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function installApi(page: Page, initial: BattleCommandV3View, actionResponse = initial) {
  const calls = { actions: 0 };
  await page.route("**/api/art/catalog**", async (route) => fulfill(route, emptyCatalog));
  await page.route("**/api/battle-command/matches**", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.url().endsWith("/actions")) {
      calls.actions += 1;
      return fulfill(route, actionResponse);
    }
    return fulfill(route, initial, request.method() === "POST" ? 201 : 200);
  });
  return calls;
}

async function enterBattle(page: Page, boardView: "perspective" | "tactical" = "tactical"): Promise<void> {
  await page.addInitScript((savedBoardView) => {
    localStorage.clear();
    localStorage.setItem("context-landscape.boardView", savedBoardView);
    localStorage.setItem("context-landscape.uiScale", "standard");
  }, boardView);
  await page.goto("/landscape/?view=battle");
  await page.getByRole("button", { name: "Enter battle command" }).click();
  await expect(page.getByLabel("Fleet command lane")).toBeVisible();
}

test("help stays on its terms and explains range and Condense with refundable staged actions", async ({ page }) => {
  const calls = await installApi(page, battleViewFixture("kinetic"));
  await enterBattle(page);
  const selected = page.getByLabel("Selected unit command");
  const battery = page.getByRole("button", { name: "Battery UAP", exact: true });
  await battery.scrollIntoViewIfNeeded();
  await battery.focus();
  const batteryTip = page.locator(`[id="${await battery.getAttribute("aria-describedby")}"]`);
  await expect(batteryTip).toBeVisible();
  await expect(batteryTip).toContainText("3×3 field +1 UAP at Register");
  expect(await battery.evaluate((element) => getComputedStyle(element).textDecorationLine)).toContain("underline");
  await page.keyboard.press("Escape");
  await expect(batteryTip).toBeHidden();

  const guidance = page.getByLabel("Current phase guidance");
  const uap = guidance.getByRole("button", { name: "UAP", exact: true, includeHidden: true });
  const uapTip = page.locator(`[id="${await uap.getAttribute("aria-describedby")}"]`);
  if (page.viewportSize()!.width > 580) {
    await guidance.getByText("NOW · KINETIC", { exact: true }).hover();
    await expect(uapTip).toBeHidden();
    await uap.hover();
    await expect(uapTip).toBeVisible();
    await expect(uapTip).toContainText("Unit Action Points");
    expect(await uap.evaluate((element) => getComputedStyle(element).textDecorationLine)).toContain("underline");
    await page.keyboard.press("Escape");
  }
  const scout = page.getByRole("button", { name: "Select Scout unit scout-1" });
  await scout.hover();
  await scout.click();
  await expect(uapTip).toBeHidden();
  await expect(scout).toContainText("3/3 UAP");

  const range = selected.getByRole("button", { name: "Range", exact: true });
  await range.hover();
  const rangeTip = page.locator(`[id="${await range.getAttribute("aria-describedby")}"]`);
  await expect(rangeTip).toBeVisible();
  await expect(rangeTip).toContainText("Range shifts preserve calibration");
  expect(await range.evaluate((element) => getComputedStyle(element).textDecorationLine)).toContain("underline");
  const spawnCells = Number(await rangeTip.locator('tr[aria-current="true"] td').first().textContent());
  await page.keyboard.press("Escape");
  await selected.getByRole("button", { name: "Increase range" }).click();
  await range.hover();
  await expect(rangeTip).toContainText("Current R2 → staged R3 · 1 UAP reserved for range");
  expect(Number(await rangeTip.locator('tr[aria-current="true"] td').first().textContent())).toBeGreaterThan(spawnCells);
  await expect(rangeTip.locator('tr[aria-current="true"]')).toContainText("0 pp");
  await rangeTip.hover();
  await expect(rangeTip).toBeVisible();
  const rangeBounds = await rangeTip.boundingBox();
  expect(rangeBounds!.x).toBeGreaterThanOrEqual(0);
  expect(rangeBounds!.y).toBeGreaterThanOrEqual(0);
  expect(rangeBounds!.x + rangeBounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(rangeBounds!.y + rangeBounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.keyboard.press("Escape");
  await selected.getByRole("button", { name: "Cancel Range up, action 1 for scout-1" }).click();
  await expect(scout).toContainText("3/3 UAP");
  const condense = selected.getByRole("button", { name: /^Condense output/ });
  await condense.hover();
  const tip = page.locator(`[id="${await condense.getAttribute("aria-describedby")}"]`);
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("1 UAP per step");
  expect(await condense.locator(".kinetic-action-label").evaluate((element) => getComputedStyle(element).textDecorationLine)).toContain("underline");
  await tip.hover();
  await expect(tip).toBeVisible();
  const bounds = await tip.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);

  await condense.click();
  await expect(selected.getByRole("status")).toContainText("2 artifacts · 60% density cap · 65% calibration");
  await condense.click();
  await expect(selected.getByRole("status")).toContainText("1 artifact · 90% density cap · 85% calibration");
  await expect(scout).toContainText("1/3 UAP");
  await page.keyboard.press("Escape");
  const cancelFirst = selected.getByRole("button", { name: "Cancel Condense output, action 1 for scout-1" });
  await cancelFirst.hover();
  await expect(page.locator(`[id="${await cancelFirst.getAttribute("aria-describedby")}"]`)).toContainText("X to cancel and restore 1 UAP");
  await cancelFirst.click();
  await expect(scout).toContainText("2/3 UAP");
  await expect(selected.getByRole("status")).toContainText("2 artifacts · 60% density cap · 65% calibration");
  await selected.getByRole("button", { name: /^Cancel Condense/ }).click();
  await expect(scout).toContainText("3/3 UAP");
  await expect(selected.getByRole("button", { name: "Move on grid", exact: true })).toBeEnabled();
  expect(calls.actions).toBe(0);
});

test("the permanent Command Deck remains usable without dock overlap or viewport overflow", async ({ page }, testInfo) => {
  await installApi(page, fiveUnitView());
  await enterBattle(page);

  const stepper = page.getByRole("navigation", { name: "Five-stage phase stepper" });
  await expect(stepper).toBeVisible();
  await expect(stepper.getByRole("listitem")).toHaveCount(5);
  await expect(stepper.locator('[aria-current="step"]')).toHaveCount(1);
  await expect(stepper.locator('[aria-current="step"]')).toContainText("Kinetic");

  const help = stepper.getByRole("button", { name: "About Kinetic phase" });
  const tooltipId = await help.getAttribute("aria-describedby");
  expect(tooltipId).toBeTruthy();
  const tooltip = page.locator(`#${tooltipId}`);
  await page.keyboard.press("Tab");
  await expect(help).toBeFocused();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Both fleets submit complete ordered UAP plans");
  const tooltipBox = await tooltip.boundingBox();
  const viewportAtTooltip = page.viewportSize()!;
  expect(tooltipBox).not.toBeNull();
  expect(tooltipBox!.x).toBeGreaterThanOrEqual(0);
  expect(tooltipBox!.x + tooltipBox!.width).toBeLessThanOrEqual(viewportAtTooltip.width + 1);
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
  await help.dispatchEvent("click");
  await expect(tooltip).toBeVisible();
  await help.dispatchEvent("click");
  await expect(tooltip).toBeHidden();
  await help.hover();
  await expect(tooltip).toBeVisible();
  await tooltip.hover();
  await expect(tooltip).toBeVisible();
  await page.getByRole("button", { name: "Tactical 2D" }).hover();
  await expect(tooltip).toBeHidden();

  const permanentLabels = [
    "Operation state",
    "Current phase guidance",
    "Battlefield legend",
    "Next phase preview",
    "Persistent context",
    "Public ordered armories",
    "Fleet command lane",
    "Context inspector",
    "Phase actions"
  ];
  for (const label of permanentLabels) await expect(page.getByLabel(label)).toBeVisible();

  const armory = page.getByLabel("Public ordered armories");
  const armoryCaption = armory.getByText("Locked · Capacity 0/3");
  await expect(armoryCaption).toBeVisible();
  expect(await armoryCaption.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  await expect(armory.getByRole("button")).toHaveCount(0);

  const fleet = page.getByLabel("Fleet command lane");
  const selectedCommand = fleet.getByLabel("Selected unit command");
  await expect(selectedCommand).toBeVisible();
  await expect(fleet.getByRole("button", { name: /Select .* unit/i })).toHaveCount(5);
  const cardWidths = await fleet.locator(".v4-unit-card").evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().width));
  expect(Math.min(...cardWidths)).toBeGreaterThanOrEqual(170);
  const fleetScroller = fleet.locator(".fleet-strip-scroll");
  const fleetScroll = await fleetScroller.evaluate((element) => ({
    clientWidth: element.clientWidth,
    overflowX: getComputedStyle(element).overflowX,
    scrollWidth: element.scrollWidth
  }));
  expect(["auto", "scroll"]).toContain(fleetScroll.overflowX);
  expect(fleetScroll.scrollWidth).toBeGreaterThan(fleetScroll.clientWidth);

  if (testInfo.project.name === "desktop") {
    const linePortrait = fleet.getByRole("button", { name: "Select Line unit line-1" });
    const lineCard = linePortrait.locator("xpath=ancestor::article");
    await linePortrait.click();
    const move = selectedCommand.getByRole("button", { name: "Move on grid", exact: true });
    const moveBox = await move.boundingBox();
    expect(moveBox?.height).toBeGreaterThanOrEqual(48);
    expect(moveBox?.width).toBeGreaterThanOrEqual(100);
    await expect(move.locator(".kinetic-action-icon")).toBeVisible();
    await expect(move.locator(".kinetic-action-beacon")).toBeVisible();
    await expect(selectedCommand.getByRole("group", { name: /Range shift/ }).locator(".kinetic-action-icon")).toHaveCount(1);
    await expect(selectedCommand.getByRole("button", { name: "Clear plan" }).locator(".kinetic-action-icon")).toHaveCount(0);
    await move.click();
    await page.getByRole("gridcell", { name: /^0,2/ }).click();
    await expect(selectedCommand.getByLabel("Planning for Kinetic")).toBeVisible();
    await fleet.getByRole("button", { name: "Select Scout unit scout-1" }).click();
    await expect(lineCard).not.toHaveAttribute("aria-current", "true");
    await expect(lineCard).toHaveClass(/has-staged-plan/);
    await expect(lineCard).toHaveAttribute("data-plan-state", "planning");
    await expect(fleet.getByRole("button", { name: "Select Scout unit scout-1" })).toHaveAttribute("aria-pressed", "true");
    await expect(selectedCommand.getByRole("button", { name: /^Condense output/ })).toBeVisible();
    await expect(page.getByRole("gridcell", { name: /LN1:1 staged move/ })).toBeVisible();
    await page.getByRole("button", { name: "Perspective" }).click();
    await expect(page.getByRole("gridcell", { name: /LN1:1 staged move/ })).toBeAttached();
    await page.getByRole("button", { name: "Tactical 2D" }).click();
  }

  const operationRail = page.getByLabel("Operation rail");
  const boardColumn = page.locator(".board-column");
  const phaseActions = page.getByLabel("Phase actions");
  const [railBox, boardBox, fleetBox, dockBox] = await Promise.all([
    operationRail.boundingBox(),
    boardColumn.boundingBox(),
    fleet.boundingBox(),
    phaseActions.boundingBox()
  ]);
  expect(railBox).not.toBeNull();
  expect(boardBox).not.toBeNull();
  expect(fleetBox).not.toBeNull();
  expect(dockBox).not.toBeNull();
  if (testInfo.project.name === "desktop") {
    expect(railBox!.width).toBeGreaterThanOrEqual(195);
    expect(railBox!.width).toBeLessThanOrEqual(230);
    expect(boardBox!.x).toBeGreaterThanOrEqual(railBox!.x + railBox!.width + 8);
  } else {
    expect(Math.abs(boardBox!.x - railBox!.x)).toBeLessThanOrEqual(2);
    expect(boardBox!.y).toBeGreaterThanOrEqual(railBox!.y + railBox!.height - 1);
  }
  expect(dockBox!.y).toBeGreaterThanOrEqual(fleetBox!.y + fleetBox!.height - 1);
  expect(await phaseActions.evaluate((element) => getComputedStyle(element).position)).not.toBe("fixed");

  const viewport = page.viewportSize()!;
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    root: document.documentElement.scrollWidth,
    viewport: window.innerWidth
  }));
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);
  expect(overflow.root).toBeLessThanOrEqual(overflow.viewport + 1);
  if (testInfo.project.name === "mobile") {
    expect(boardBox!.y).toBeLessThanOrEqual(720);
  }
  if (testInfo.project.name !== "desktop") {
    const touchControls: Array<[string, ReturnType<typeof page.getByRole>]> = [
      ["Phase help", page.getByRole("button", { name: "About Kinetic phase" })],
      ["Full rules", page.getByRole("button", { name: "Full rules" })],
      ["More", page.getByText("More", { exact: true })],
      ["New operation", page.getByRole("button", { name: "New operation" })],
      ["Move on grid", selectedCommand.getByRole("button", { name: "Move on grid" })],
      ["Clear", selectedCommand.getByRole("button", { name: "Clear" })],
      ["Resolve Kinetic", page.getByRole("button", { name: "Resolve Kinetic" })],
      ["Perspective", page.getByRole("button", { name: "Perspective" })],
      ["Tactical 2D", page.getByRole("button", { name: "Tactical 2D" })]
    ];
    if (testInfo.project.name === "tablet") touchControls.push(
      ["Fleet Hangar", page.getByRole("link", { name: "Fleet Hangar" }).first()],
      ["Decrease interface scale", page.getByRole("button", { name: "Decrease interface scale" }).first()],
      ["Increase interface scale", page.getByRole("button", { name: "Increase interface scale" }).first()]
    );
    for (const [name, control] of touchControls) {
      const box = await control.boundingBox();
      expect(box?.height, `${name} touch target`).toBeGreaterThanOrEqual(40);
    }
    if (testInfo.project.name === "mobile") {
      await page.getByText("More", { exact: true }).click();
      const menu = page.locator(".mobile-nav-utilities");
      for (const [name, control] of [
        ["Fleet Hangar", menu.getByRole("link", { name: "Fleet Hangar" })],
        ["Decrease interface scale", menu.getByRole("button", { name: "Decrease interface scale" })],
        ["Increase interface scale", menu.getByRole("button", { name: "Increase interface scale" })]
      ] as const) {
        const box = await control.boundingBox();
        expect(box?.height, `${name} touch target`).toBeGreaterThanOrEqual(40);
      }
    }
  }
});

test("Resolution is a client-only review step before the next round", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The state-transition probe runs once; viewport geometry is covered above.");
  const initial = structuredClone(battleViewFixture("command"));
  const calls = await installApi(page, initial, nextRoundView());
  await enterBattle(page, "perspective");

  const persistentContext = page.getByLabel("Persistent context");
  const fleet = page.getByLabel("Fleet command lane");
  await persistentContext.evaluate((element) => element.setAttribute("data-continuity-probe", "context"));
  await fleet.evaluate((element) => element.setAttribute("data-continuity-probe", "fleet"));

  await page.getByRole("button", { name: "End Command" }).click();
  const riskDialog = page.getByRole("dialog", { name: "End Command risk check" });
  await expect(riskDialog).toBeVisible();
  await riskDialog.getByRole("button", { name: "Confirm End" }).click();

  await expect(page.getByLabel("Phase actions")).toContainText("ROUND 1 · RESOLUTION COMPLETE");
  await expect(page.getByRole("navigation", { name: "Five-stage phase stepper" }).locator('[aria-current="step"]')).toContainText("Resolution");
  await expect(page.getByLabel("Operation state")).toContainText("1/12");
  await expect(page.getByLabel("Phase actions")).toContainText(/\+1 Progress/i);
  await expect(page.locator('[data-continuity-probe="context"]')).toHaveCount(1);
  await expect(page.locator('[data-continuity-probe="fleet"]')).toHaveCount(1);
  await expect(page.getByLabel("Player-edge perspective battlefield")).toHaveAttribute("data-read-only", "true");
  await page.getByRole("button", { name: "Tactical 2D" }).click();
  await expect(page.getByRole("grid", { name: "10 by 10 operational field" })).toHaveAttribute("aria-readonly", "true");
  expect(calls.actions).toBe(1);

  await page.getByRole("button", { name: "Continue to Round 2" }).click();
  await expect(page.getByText("ROUND 1 · RESOLUTION COMPLETE")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Five-stage phase stepper" }).locator('[aria-current="step"]')).toContainText("Kinetic");
  await expect(page.getByLabel("Operation state")).toContainText("2/8");
  await expect(page.getByRole("grid", { name: "10 by 10 operational field" })).not.toHaveAttribute("aria-readonly", "true");
  expect(calls.actions).toBe(1);
});
