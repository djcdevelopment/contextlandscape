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
    fireEvent.click(screen.getByRole("button", { name: "Choose commander portrait" }));
    const picker = await screen.findByRole("dialog", { name: "Choose commander art" });
    expect(within(picker).getByRole("button", { name: "Close" })).toHaveFocus();
    fireEvent.click(within(picker).getByRole("button", { name: /Signal Commander/ }));
    expect(screen.getByRole("img", { name: commander.alt })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Remove unit" })[0]);
    expect(screen.getByText("5 / 6")).toBeInTheDocument();
    expect(screen.getByText(/must total exactly 6 weight/i)).toBeInTheDocument();
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
