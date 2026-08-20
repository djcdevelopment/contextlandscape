import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import type { ArtCatalogEntry, ArtCatalogPage, AuthSessionView } from "@landscape/contracts";
import { HumanReleaseApp } from "./HumanReleaseApp.js";

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const account = {
  schemaVersion: 1 as const,
  accountId: "account-alpha",
  displayName: "Signal Pilot",
  avatarUrl: null,
  createdAt: "2026-08-19T00:00:00.000Z",
  lastSeenAt: "2026-08-19T00:00:00.000Z"
};

const authenticated: AuthSessionView = { schemaVersion: 1, authenticated: true, account, csrfToken: "csrf-token-with-enough-characters" };
const commander: ArtCatalogEntry = {
  schemaVersion: 1,
  assetId: "commander-signal",
  familyId: "family-signal",
  contentHash: `sha256:${"1".repeat(64)}`,
  tier: "confirmed",
  kind: "commander",
  title: "Signal Commander",
  alt: "A signal commander overlooking the field",
  subjects: ["commander"],
  aspect: "portrait",
  focalPoint: { x: 50, y: 40 },
  thumbnailSrc: "/media/art/thumb/signal.webp",
  cardSrc: "/media/art/card/signal.webp",
  battlefieldSrc: null,
  experimental: false
};
const catalog: ArtCatalogPage = {
  schemaVersion: 1,
  catalogHash: `sha256:${"2".repeat(64)}`,
  censusReportHash: "sha256:928a78fd7f9a6adae62eead18553088aa4d360d338506bac0c73d529fd10369f",
  items: [commander], total: 1, offset: 0, limit: 40, nextOffset: null
};

function unitAsset(index: number, subjects: string[] = []): ArtCatalogEntry {
  return {
    ...commander,
    assetId: `unit-${index}`,
    familyId: `family-unit-${index}`,
    kind: "unit",
    title: `Unit ${index}`,
    alt: `Unit art ${index}`,
    subjects,
    thumbnailSrc: `/media/art/thumb/unit-${index}.webp`,
    cardSrc: `/media/art/card/unit-${index}.webp`
  };
}

describe("human release Hangar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/?view=hangar");
  });
  afterEach(() => cleanup());

  it("offers Discord identity without retaining a provider session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ schemaVersion: 1, authenticated: false, account: null, csrfToken: null })));
    render(<HumanReleaseApp />);
    const link = await screen.findByRole("link", { name: "Continue with Discord" });
    expect(link).toHaveAttribute("href", expect.stringContaining("/api/auth/discord/start"));
    expect(screen.getByText(/does not retain the provider access token/i)).toBeInTheDocument();
    const result = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations).toEqual([]);
  });

  it("builds a legal weight-six fleet and assigns catalog art in a focus-managed picker", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/auth/session") return response(authenticated);
      if (path === "/api/hangar/fleets") return response([]);
      if (path === "/api/battle-command/challenges") return response([]);
      if (path.startsWith("/api/art/catalog?")) return response(catalog);
      throw new Error(`unexpected fetch ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<HumanReleaseApp />);

    expect(await screen.findByText("6 / 6")).toBeInTheDocument();
    expect(screen.getByText(/balanced draft is ready/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Palette" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Emblem" })).not.toBeInTheDocument();
    const paletteTrigger = screen.getByRole("button", { name: "Fleet palette, Signal teal" });
    expect(paletteTrigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(paletteTrigger);
    expect(paletteTrigger).toHaveAttribute("aria-expanded", "true");
    const paletteChoices = screen.getByRole("group", { name: "Fleet palette" });
    const signalTeal = within(paletteChoices).getByRole("button", { name: "Signal teal" });
    expect(signalTeal).toHaveAttribute("aria-pressed", "true");
    expect(signalTeal.querySelector(".palette-swatch")).toHaveStyle({ backgroundColor: "#67e0d1" });
    fireEvent.click(within(paletteChoices).getByRole("button", { name: "Oxide red" }));
    expect(screen.getByRole("main")).toHaveClass("palette-oxide-red");
    expect(screen.queryByRole("group", { name: "Fleet palette" })).not.toBeInTheDocument();
    const oxideTrigger = screen.getByRole("button", { name: "Fleet palette, Oxide red" });
    expect(oxideTrigger).toHaveFocus();
    fireEvent.click(oxideTrigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Fleet palette" })).not.toBeInTheDocument();
    expect(oxideTrigger).toHaveFocus();
    fireEvent.click(oxideTrigger);
    fireEvent.pointerDown(screen.getByText("FLEET WEIGHT"));
    expect(screen.queryByRole("group", { name: "Fleet palette" })).not.toBeInTheDocument();
    const emblemChoices = screen.getByRole("group", { name: "Fleet emblem" });
    fireEvent.click(within(emblemChoices).getByRole("button", { name: "Anvil" }));
    expect(within(emblemChoices).getByRole("button", { name: "Anvil" })).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector('.commander-card [data-emblem="anvil"]')).toBeInTheDocument();
    expect(screen.getByText("Anvil emblem · Oxide red")).toBeInTheDocument();
    const opener = screen.getByRole("button", { name: "Choose commander portrait" });
    opener.focus(); fireEvent.click(opener);
    let picker = await screen.findByRole("dialog", { name: "Choose commander art" });
    expect(within(picker).getByRole("button", { name: "Close" })).toHaveFocus();
    const result = await axe.run(picker, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations).toEqual([]);
    fireEvent.keyDown(picker, { key: "Tab", shiftKey: true });
    expect(within(picker).getByRole("button", { name: "Choose commander art option 1" })).toHaveFocus();
    fireEvent.keyDown(picker, { key: "Tab" });
    expect(within(picker).getByRole("button", { name: "Close" })).toHaveFocus();
    fireEvent.keyDown(picker, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Choose commander art" })).not.toBeInTheDocument());
    expect(opener).toHaveFocus();

    fireEvent.click(opener);
    picker = await screen.findByRole("dialog", { name: "Choose commander art" });
    fireEvent.click(within(picker).getByRole("button", { name: "Choose commander art option 1" }));
    expect(screen.getByRole("img", { name: commander.alt })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Remove unit" })[0]);
    expect(screen.getByText("5 / 6")).toBeInTheDocument();
    expect(screen.getByText(/must total exactly 6 weight/i)).toBeInTheDocument();
  });

  it("replaces loaded pages and offers plain-language catalog categories", async () => {
    const units = Array.from({ length: 81 }, (_, index) => unitAsset(index, index < 12 ? ["mech-scout"] : []));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/auth/session") return response(authenticated);
      if (path === "/api/hangar/fleets") return response([]);
      if (path === "/api/battle-command/challenges") return response([]);
      if (path.startsWith("/api/art/catalog?")) {
        const url = new URL(path, "http://local.test");
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const filtered = url.searchParams.get("q") === "mech-scout" ? units.slice(0, 12) : units;
        const items = filtered.slice(offset, offset + 40);
        return response({ ...catalog, items, total: filtered.length, offset, limit: 40, nextOffset: offset + items.length < filtered.length ? offset + 40 : null });
      }
      throw new Error(`unexpected fetch ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<HumanReleaseApp />);

    await screen.findByText("6 / 6");
    const opener = screen.getAllByRole("button", { name: /^Choose any unit image/ })[0];
    opener.focus(); fireEvent.click(opener);
    const picker = await screen.findByRole("dialog", { name: "Choose unit art" });
    expect(within(picker).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(picker).getByRole("region", { name: "unit art results" })).toHaveAttribute("tabindex", "0");
    const categories = within(picker).getByRole("group", { name: "unit art categories" });
    expect(within(categories).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(within(picker).getByRole("status")).toHaveTextContent("Page 1 of 3 · 1–40 of 81");
    const firstOption = within(picker).getByRole("button", { name: "Choose unit art option 1" });
    expect(firstOption).toBeInTheDocument();
    expect(within(picker).queryByText("Unit 0")).not.toBeInTheDocument();
    expect(firstOption.querySelector("img")).toHaveAttribute("src", "/media/art/card/unit-0.webp");

    fireEvent.click(within(picker).getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(within(picker).getByRole("status")).toHaveTextContent("Page 2 of 3 · 41–80 of 81"));
    expect(within(picker).getByRole("button", { name: "Choose unit art option 41" })).toBeInTheDocument();
    expect(within(picker).queryByRole("button", { name: "Choose unit art option 1" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("q=&offset=40&limit=40"))).toBe(true);

    fireEvent.click(within(categories).getByRole("button", { name: "Scout frames" }));
    await waitFor(() => expect(within(picker).getByRole("status")).toHaveTextContent("Page 1 of 1 · 1–12 of 12"));
    expect(within(categories).getByRole("button", { name: "Scout frames" })).toHaveAttribute("aria-pressed", "true");
    expect(within(categories).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("q=mech-scout&offset=0&limit=40"))).toBe(true);

    fireEvent.keyDown(picker, { key: "Escape" });
    await waitFor(() => expect(picker).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("provides explicit sign-out and account deletion without a browser confirm", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/auth/session") return response(authenticated);
      if (path === "/api/hangar/fleets") return response([]);
      if (path === "/api/battle-command/challenges") return response([]);
      if (path === "/api/account") return response({}, 204);
      throw new Error(`unexpected fetch ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<HumanReleaseApp />);
    const accountButton = await screen.findByRole("button", { name: /Signal Pilot/ });
    fireEvent.click(accountButton);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete account" }));
    const dialog = screen.getByRole("dialog", { name: "Delete your cloud hangar?" });
    expect(within(dialog).getByRole("button", { name: "Keep account" })).toHaveFocus();
    expect(confirmSpy).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/account", expect.objectContaining({ method: "DELETE" })));
    expect(await screen.findByRole("link", { name: "Continue with Discord" })).toBeInTheDocument();
  });
});
