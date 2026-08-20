import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import type { ArtCatalogEntry } from "@landscape/contracts";
import { BattleCommandApp } from "./BattleCommandApp.js";
import { battleViewFixture } from "./fixture-v4.js";

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, statusText: status === 410 ? "Gone" : "OK", json: async () => body } as Response;
}

function unitArt(chassis: "scout" | "line" | "heavy", index = 0): ArtCatalogEntry {
  return { schemaVersion: 1, assetId: `${chassis}-art-${index}`, familyId: `${chassis}-family-${index}`, contentHash: `sha256:${"1".repeat(64)}`, tier: "confirmed", kind: "unit", title: `${chassis} art ${index}`, alt: `${chassis} portrait ${index}`, subjects: [`mech-${chassis === "heavy" ? "siege" : chassis}`], aspect: "portrait", focalPoint: { x: 50, y: 45 }, thumbnailSrc: `/media/art/thumb/${chassis}-${index}.webp`, cardSrc: `/media/art/card/${chassis}-${index}.webp`, battlefieldSrc: null, experimental: false };
}

describe("Battle Command v4 accessibility and interaction", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders the five-stage workflow, ordered armories, and a roving 10×10 grid without axe violations", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(battleViewFixture("kinetic"), 201)));
    render(<BattleCommandApp />);
    fireEvent.click(screen.getByRole("button", { name: "Enter battle command" }));
    expect(await screen.findByRole("grid", { name: "10 by 10 operational field" })).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(100);
    expect(screen.getByText("Register")).toBeInTheDocument();
    expect(screen.getByText("Kinetic", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getAllByText("Flare").length).toBeGreaterThan(1);
    expect(screen.getAllByText("EMP").length).toBeGreaterThan(1);
    expect(screen.getByRole("button", { name: "Select Scout unit scout-1" }).querySelector(".unit-portrait-fallback")).toBeInTheDocument();

    const first = screen.getByRole("gridcell", { name: /^0,0/ });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("gridcell", { name: /^1,0/ })).toHaveFocus();

    const result = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations).toEqual([]);
  });

  it("submits selected weight-six fleets and builds an ordered two-step Condense plan", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const path = String(input);
      if (path.startsWith("/api/art/catalog?")) {
        const query = new URL(path, "http://local").searchParams.get("q") ?? "";
        const chassis = query === "mech-scout" ? "scout" : query === "mech-line" ? "line" : "heavy";
        const items = Array.from({ length: 10 }, (_, index) => unitArt(chassis, index));
        return response({ schemaVersion: 1, catalogHash: `sha256:${"2".repeat(64)}`, censusReportHash: `sha256:${"3".repeat(64)}`, items, total: items.length, offset: 0, limit: 10, nextOffset: null });
      }
      return response(battleViewFixture("kinetic"), 201);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<BattleCommandApp />);
    fireEvent.change(screen.getByLabelText("Your fleet"), { target: { value: "line-four-scout" } });
    fireEvent.change(screen.getByLabelText("Doctrine fleet"), { target: { value: "heavy-three-scout" } });
    fireEvent.click(screen.getByRole("button", { name: "Enter battle command" }));
    await screen.findByRole("grid", { name: "10 by 10 operational field" });
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({ playerCompositionModule: "line-four-scout", opponentCompositionModule: "heavy-three-scout" });

    const scoutPortrait = screen.getByRole("button", { name: "Select Scout unit scout-1" });
    await waitFor(() => expect(scoutPortrait.querySelector("img")).toHaveAttribute("src", "/media/art/card/scout-0.webp"));
    expect(scoutPortrait).toHaveAttribute("aria-pressed", "false");
    const scoutCard = scoutPortrait.closest("article")!;
    fireEvent.pointerDown(within(scoutCard).getByText(/Condense 0\/2/));
    expect(scoutCard).toHaveClass("selected");
    expect(scoutCard).toHaveAttribute("aria-current", "true");
    expect(scoutPortrait).toHaveAttribute("aria-pressed", "true");
    const linePortrait = screen.getByRole("button", { name: "Select Line unit line-1" });
    fireEvent.click(linePortrait);
    expect(linePortrait.closest("article")).toHaveClass("selected");
    expect(scoutCard).not.toHaveClass("selected");

    fireEvent.click(screen.getByRole("gridcell", { name: /friendly Scout/ }));
    const condense = screen.getByRole("button", { name: "Condense output" });
    fireEvent.click(condense);
    fireEvent.click(condense);
    expect(screen.getByText(/Condense 2\/2/)).toBeInTheDocument();
    expect(screen.getAllByText("condense-output")).toHaveLength(2);
    const plannedScoutCard = screen.getByText(/Condense 2\/2/).closest("article")!;
    expect(within(plannedScoutCard).getByRole("button", { name: "Move on grid" })).toBeDisabled();
  });

  it("uses a focus-managed in-app risk dialog for projected detonations", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(battleViewFixture("command", { hazard: true }), 201)));
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<BattleCommandApp />);
    fireEvent.click(screen.getByRole("button", { name: "Enter battle command" }));
    await screen.findByText("ALTERNATING COMMAND");
    fireEvent.click(screen.getByRole("button", { name: "End Command" }));
    const dialog = screen.getByRole("dialog", { name: "End Command risk check" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/projected|will detonate/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();
    expect(confirmSpy).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("turns a 410 retired snapshot into an explicit new-operation path", async () => {
    localStorage.setItem("context-landscape.battleCommandMatch", "old-operation");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: "battle_ruleset_retired" }, 410)));
    render(<BattleCommandApp />);
    expect(await screen.findByText("Previous operation retired")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start v4 operation" })).toBeEnabled();
  });
});
