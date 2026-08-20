import { expect, test, type Route } from "@playwright/test";
import type { ArtCatalogEntry } from "@landscape/contracts";

const timestamp = "2026-08-20T00:00:00.000Z";
const account = { schemaVersion: 1 as const, accountId: "account-gallery", displayName: "Gallery Pilot", avatarUrl: null, createdAt: timestamp, lastSeenAt: timestamp };
const catalogHash = `sha256:${"2".repeat(64)}`;
const censusReportHash = "sha256:928a78fd7f9a6adae62eead18553088aa4d360d338506bac0c73d529fd10369f";

function unitAsset(index: number): ArtCatalogEntry {
  return {
    schemaVersion: 1,
    assetId: `unit-${index}`,
    familyId: `family-unit-${index}`,
    contentHash: `sha256:${"1".repeat(64)}`,
    tier: "confirmed",
    kind: "unit",
    title: `Unit ${index}`,
    alt: `Unit art ${index}`,
    subjects: index < 15 ? ["mech-scout"] : [],
    aspect: "portrait",
    focalPoint: { x: 50, y: 45 },
    thumbnailSrc: `/media/art/thumb/unit-${index}.webp`,
    cardSrc: `/media/art/card/unit-${index}.webp`,
    battlefieldSrc: null,
    experimental: false
  };
}

async function fulfill(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("art picker keeps stable scrollable cards and pages through plain-language categories", async ({ page }) => {
  const units = Array.from({ length: 85 }, (_, index) => unitAsset(index));
  const catalogRequests: Array<{ offset: number; query: string }> = [];
  await page.addInitScript(() => localStorage.clear());
  await page.route("**/media/art/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#456"/></svg>' });
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/session") return fulfill(route, { schemaVersion: 1, authenticated: true, account, csrfToken: "csrf-gallery-token-with-enough-characters" });
    if (url.pathname === "/api/hangar/fleets") return fulfill(route, []);
    if (url.pathname === "/api/battle-command/challenges") return fulfill(route, []);
    if (url.pathname === "/api/art/catalog") {
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const query = url.searchParams.get("q") ?? "";
      catalogRequests.push({ offset, query });
      const filtered = query === "mech-scout" ? units.slice(0, 15) : units;
      const limit = Number(url.searchParams.get("limit") ?? 40);
      const items = filtered.slice(offset, offset + limit);
      return fulfill(route, {
        schemaVersion: 1,
        catalogHash,
        censusReportHash,
        items,
        total: filtered.length,
        offset,
        limit,
        nextOffset: offset + items.length < filtered.length ? offset + limit : null
      });
    }
    return fulfill(route, { error: `unhandled:${url.pathname}` }, 404);
  });

  await page.goto("/landscape/?view=hangar");
  const paletteTrigger = page.getByRole("button", { name: "Fleet palette, Signal teal" });
  await expect(paletteTrigger).toHaveAttribute("aria-expanded", "false");
  await paletteTrigger.click();
  const palette = page.getByRole("group", { name: "Fleet palette" });
  await expect(palette.getByRole("button", { name: "Signal teal" })).toHaveAttribute("aria-pressed", "true");
  await palette.getByRole("button", { name: "Oxide red" }).click();
  await expect(page.getByRole("main")).toHaveClass(/palette-oxide-red/);
  await expect(palette).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Fleet palette, Oxide red" })).toBeFocused();
  const emblems = page.getByRole("group", { name: "Fleet emblem" });
  await emblems.getByRole("button", { name: "Anvil" }).click();
  await expect(emblems.getByRole("button", { name: "Anvil" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('.commander-card [data-emblem="anvil"]')).toBeVisible();
  const opener = page.getByRole("button", { name: "Choose any unit image" }).first();
  await opener.click();
  const picker = page.getByRole("dialog", { name: "Choose unit art" });
  const results = picker.getByRole("region", { name: "unit art results" });
  const cards = results.locator(":scope > button");

  await expect(picker.getByRole("button", { name: "Close" })).toBeFocused();
  await expect(picker.getByRole("textbox")).toHaveCount(0);
  await expect(picker.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  await expect(picker.getByRole("status")).toContainText("Page 1 of 3");
  await expect(cards).toHaveCount(40);
  await expect(picker.getByRole("button", { name: "Previous page" })).toBeDisabled();
  await expect(picker.getByRole("button", { name: "Next page" })).toBeEnabled();
  const initialWindowScroll = await page.evaluate(() => window.scrollY);
  await expect.poll(() => results.evaluate((element) => getComputedStyle(element).overflowY)).toMatch(/auto|scroll/);
  const firstPageGeometry = await results.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(firstPageGeometry.scrollHeight).toBeGreaterThan(firstPageGeometry.clientHeight);
  const firstCardHeight = await cards.first().evaluate((button) => button.getBoundingClientRect().height);
  await expect(cards.first()).toHaveText("");
  await expect(cards.first().locator("img")).toHaveAttribute("src", "/media/art/card/unit-0.webp");
  await expect.poll(() => cards.first().locator("img").evaluate((image) => getComputedStyle(image).objectFit)).toBe("contain");
  const firstImageVisibleHeight = await cards.first().evaluate((button) => {
    const image = button.querySelector("img")!;
    const cardBox = button.getBoundingClientRect();
    const imageBox = image.getBoundingClientRect();
    return Math.min(cardBox.bottom, imageBox.bottom) - Math.max(cardBox.top, imageBox.top);
  });
  expect(firstCardHeight).toBeGreaterThanOrEqual(205);
  expect(firstImageVisibleHeight).toBeGreaterThanOrEqual(140);

  await results.focus();
  await page.keyboard.press("PageDown");
  await expect.poll(() => results.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await results.evaluate((element) => new Promise<void>((resolve) => {
    let settled = 0;
    let onScroll = () => {};
    const finish = () => { element.removeEventListener("scroll", onScroll); resolve(); };
    onScroll = () => {
      window.clearTimeout(settled);
      settled = window.setTimeout(finish, 200);
    };
    element.addEventListener("scroll", onScroll);
    settled = window.setTimeout(finish, 200);
  }));
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  expect(await page.evaluate(() => window.scrollY)).toBe(initialWindowScroll);

  await picker.getByRole("button", { name: "Next page" }).click();
  await expect(picker.getByRole("status")).toContainText("Page 2 of 3");
  await expect(cards).toHaveCount(40);
  await expect(picker.getByRole("button", { name: "Choose unit art option 41" })).toBeVisible();
  await expect(picker.getByRole("button", { name: "Choose unit art option 1" })).toHaveCount(0);
  await expect.poll(() => results.evaluate((element) => element.scrollTop)).toBe(0);
  const secondCardHeight = await cards.first().evaluate((button) => button.getBoundingClientRect().height);
  expect(Math.abs(secondCardHeight - firstCardHeight)).toBeLessThanOrEqual(1);
  expect(catalogRequests).toContainEqual({ offset: 40, query: "" });

  await picker.getByRole("button", { name: "Close" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(picker.getByRole("button", { name: "Next page" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(picker.getByRole("button", { name: "Close" })).toBeFocused();

  await picker.getByRole("button", { name: "Next page" }).click();
  await expect(picker.getByRole("status")).toContainText("Page 3 of 3");
  await expect(cards).toHaveCount(5);
  await expect(picker.getByRole("button", { name: "Next page" })).toBeDisabled();
  await expect(picker.getByRole("button", { name: "Previous page" })).toBeEnabled();
  await picker.getByRole("button", { name: "Previous page" }).click();
  await expect(picker.getByRole("status")).toContainText("Page 2 of 3");

  await picker.getByRole("button", { name: "Scout frames" }).click();
  await expect(picker.getByRole("status")).toContainText("Page 1 of 1 · 1–15 of 15");
  await expect(picker.getByRole("button", { name: "Scout frames" })).toHaveAttribute("aria-pressed", "true");
  await expect(picker.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
  await expect(cards).toHaveCount(15);
  expect(catalogRequests).toContainEqual({ offset: 0, query: "mech-scout" });
  await expect.poll(() => results.evaluate((element) => element.scrollTop)).toBe(0);

  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});
