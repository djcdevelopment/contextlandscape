import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import type { ArtCatalogEntry, BattleCommandV3View } from "@landscape/contracts";
import { BattleCommandApp } from "./BattleCommandApp.js";
import { battleViewFixture } from "./fixture-v4.js";

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, statusText: status === 410 ? "Gone" : "OK", json: async () => body } as Response;
}

function unitArt(chassis: "scout" | "line" | "heavy", index = 0): ArtCatalogEntry {
  return { schemaVersion: 1, assetId: `${chassis}-art-${index}`, familyId: `${chassis}-family-${index}`, contentHash: `sha256:${"1".repeat(64)}`, tier: "confirmed", kind: "unit", title: `${chassis} art ${index}`, alt: `${chassis} portrait ${index}`, subjects: [`mech-${chassis === "heavy" ? "siege" : chassis}`], aspect: "portrait", focalPoint: { x: 50, y: 45 }, thumbnailSrc: `/media/art/thumb/${chassis}-${index}.webp`, cardSrc: `/media/art/card/${chassis}-${index}.webp`, battlefieldSrc: null, experimental: false };
}

function fiveUnitView(): BattleCommandV3View {
  const view = structuredClone(battleViewFixture("command"));
  const additions = [
    { sourceId: "alpha:scout-1", unitId: "alpha:scout-2", x: 3, y: 1 },
    { sourceId: "alpha:line-1", unitId: "alpha:line-2", x: 1, y: 3 }
  ];
  for (const addition of additions) {
    const source = view.projection.units.find((unit) => unit.unitId === addition.sourceId)!;
    view.projection.units.push({ ...structuredClone(source), unitId: addition.unitId, position: { x: addition.x, y: addition.y } });
    const allocation = view.legal.allocations.find((item) => item.unitId === addition.sourceId)!;
    view.legal.allocations.push({ ...structuredClone(allocation), unitId: addition.unitId });
  }
  return view;
}

function nextRoundView(): BattleCommandV3View {
  const view = structuredClone(battleViewFixture("kinetic"));
  view.projection.players.find((player) => player.playerId === "alpha")!.progress += 1;
  const resolution = {
    completedRound: 1,
    detonations: [],
    resolutions: [{ artifactId: "fixture:r1:alpha:line-1:0", outcome: "sound" as const }],
    players: view.projection.players.map((player) => ({ playerId: player.playerId, progress: player.progress, drift: player.drift, attention: player.attention, status: player.status })),
    terminal: false
  };
  view.revision = 1;
  view.projection.round = 2;
  view.projection.lastResolutionRecap = resolution;
  view.recaps.resolution = resolution;
  view.projection.players.find((player) => player.playerId === "alpha")!.attention = 7;
  const registeredScout = view.projection.units.find((unit) => unit.unitId === "alpha:scout-1")!;
  registeredScout.uap = { ...registeredScout.uap, effective: 0, frozen: true, freezeSources: ["drift-detonation"] };
  return view;
}

describe("Battle Command v4 accessibility and interaction", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("persists an accessible three-step interface scale", () => {
    render(<BattleCommandApp />);
    const shell = document.querySelector("main.briefing-shell")!;
    const scale = screen.getByRole("group", { name: "Interface scale" });
    expect(shell).toHaveAttribute("data-ui-scale", "standard");
    expect(within(scale).getByRole("status", { name: "Interface scale 100 percent" })).toHaveTextContent("100%");

    fireEvent.click(within(scale).getByRole("button", { name: "Increase interface scale" }));
    expect(shell).toHaveAttribute("data-ui-scale", "large");
    expect(localStorage.getItem("context-landscape.uiScale")).toBe("large");
    expect(within(scale).getByRole("button", { name: "Increase interface scale" })).toBeEnabled();

    fireEvent.click(within(scale).getByRole("button", { name: "Increase interface scale" }));
    expect(shell).toHaveAttribute("data-ui-scale", "xlarge");
    expect(localStorage.getItem("context-landscape.uiScale")).toBe("xlarge");
    expect(within(scale).getByRole("button", { name: "Increase interface scale" })).toBeDisabled();

    fireEvent.click(within(scale).getByRole("button", { name: "Decrease interface scale" }));
    expect(shell).toHaveAttribute("data-ui-scale", "large");
    expect(localStorage.getItem("context-landscape.uiScale")).toBe("large");
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

    const result = await axe.run(document.body);
    expect(result.violations).toEqual([]);
  });

  it("keeps the Command Deck regions mounted and exposes keyboard phase help", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(battleViewFixture("kinetic"), 201)));
    render(<BattleCommandApp />);
    fireEvent.click(screen.getByRole("button", { name: "Enter battle command" }));

    const stepper = await screen.findByRole("navigation", { name: "Five-stage phase stepper" });
    expect(within(stepper).getAllByRole("listitem")).toHaveLength(5);
    expect(stepper.querySelector('[aria-current="step"]')).toHaveTextContent("Kinetic");

    const phaseHelp = within(stepper).getByRole("button", { name: "About Kinetic phase" });
    fireEvent.focus(phaseHelp);
    const tooltip = document.getElementById(phaseHelp.getAttribute("aria-describedby")!)!;
    expect(tooltip).toHaveTextContent(/Both fleets submit complete ordered UAP plans/i);
    expect(phaseHelp).toHaveAttribute("aria-describedby", tooltip.id);

    for (const label of ["Operation state", "Current phase guidance", "Next phase preview", "Persistent context", "Public ordered armories", "Fleet command lane", "Context inspector", "Phase actions"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    const armory = screen.getByLabelText("Public ordered armories");
    expect(within(armory).getByText("ACTIVE IN ARTILLERY")).toBeInTheDocument();
    expect(within(armory).getAllByRole("button").every((button) => button.hasAttribute("disabled"))).toBe(true);
    expect(within(screen.getByLabelText("Fleet command lane")).getAllByRole("button", { name: /Select .* unit/i })).toHaveLength(3);
  });

  it("supports a five-unit fleet lane and an expandable context inspector", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(fiveUnitView(), 201)));
    render(<BattleCommandApp />);
    fireEvent.click(screen.getByRole("button", { name: "Enter battle command" }));

    const fleet = await screen.findByLabelText("Fleet command lane");
    expect(within(fleet).getAllByRole("button", { name: /Select .* unit/i })).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: /friendly artifact fixture:r1:alpha:line-1:0/i }));
    const inspector = screen.getByLabelText("Context inspector");
    const collapse = within(inspector).getByRole("button", { name: "Collapse context inspector" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Context inspector details")).toBeInTheDocument();
    fireEvent.click(collapse);
    const expand = within(inspector).getByRole("button", { name: "Expand context inspector" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Context inspector details")).not.toBeInTheDocument();
    fireEvent.click(expand);
    const details = screen.getByLabelText("Context inspector details");
    expect(within(details).getByText("Source calibration")).toBeInTheDocument();
    expect(within(details).getByText("Effective D×C")).toBeInTheDocument();
  });

  it("holds the next round behind a client-only Resolution recap", async () => {
    const command = battleViewFixture("command");
    const nextRound = nextRoundView();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.startsWith("/api/art/catalog?")) return response({ schemaVersion: 1, catalogHash: `sha256:${"2".repeat(64)}`, censusReportHash: `sha256:${"3".repeat(64)}`, items: [], total: 0, offset: 0, limit: 10, nextOffset: null });
      if (path.endsWith("/actions")) return response(nextRound);
      return response(command, 201);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<BattleCommandApp />);
    fireEvent.click(screen.getByRole("button", { name: "Enter battle command" }));
    await screen.findByLabelText("Fleet command lane");

    const persistentContext = screen.getByLabelText("Persistent context");
    const fleet = screen.getByLabelText("Fleet command lane");
    fireEvent.click(screen.getByRole("button", { name: "End Command" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "End Command risk check" })).getByRole("button", { name: "Confirm End" }));

    const recap = await screen.findByLabelText("Phase actions");
    expect(recap).toHaveTextContent("ROUND 1 · RESOLUTION COMPLETE");
    expect(recap).toHaveTextContent(/\+1 Progress/i);
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue to Round 2" })).toHaveFocus());
    expect(screen.getByLabelText("Persistent context")).toBe(persistentContext);
    expect(screen.getByLabelText("Fleet command lane")).toBe(fleet);
    expect(screen.getByRole("navigation", { name: "Five-stage phase stepper" }).querySelector('[aria-current="step"]')).toHaveTextContent("Resolution");
    expect(screen.getByLabelText("Operation state")).toHaveTextContent("1/8");
    expect(within(screen.getByLabelText("Operation state")).getByText("Attention").parentElement).toHaveTextContent("3");
    expect(within(persistentContext).queryByRole("button", { name: /fixture:r1:alpha:line-1:0/i })).not.toBeInTheDocument();
    expect(screen.queryByText("0 FROZEN", { exact: true })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue to Round 2" }));
    expect(screen.queryByText("ROUND 1 · RESOLUTION COMPLETE")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Five-stage phase stepper" }).querySelector('[aria-current="step"]')).toHaveTextContent("Kinetic");
    expect(screen.getByLabelText("Operation state")).toHaveTextContent("2/8");
    expect(within(screen.getByLabelText("Operation state")).getByText("Attention").parentElement).toHaveTextContent("7");
    expect(screen.getByText("0 FROZEN", { exact: true })).toBeInTheDocument();
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
    expect(screen.getByLabelText("Phase actions")).toHaveTextContent("0 ordered actions");
    fireEvent.click(linePortrait);
    fireEvent.click(screen.getByRole("gridcell", { name: /^0,2/ }));
    fireEvent.click(scoutPortrait);
    const condense = screen.getByRole("button", { name: "Condense output" });
    fireEvent.click(condense);
    fireEvent.click(condense);
    expect(screen.getByText(/Condense 2\/2/)).toBeInTheDocument();
    expect(within(scoutCard).getAllByText("Condense output")).toHaveLength(3);
    const plannedScoutCard = screen.getByText(/Condense 2\/2/).closest("article")!;
    expect(within(plannedScoutCard).getByLabelText("Staged for Kinetic")).toBeInTheDocument();
    expect(within(plannedScoutCard).queryByText("Action open")).not.toBeInTheDocument();
    expect(within(plannedScoutCard).getByRole("button", { name: /Condense output\s*, staged 2 times/ })).toHaveClass("is-staged");
    expect(linePortrait.closest("article")).toHaveClass("has-staged-plan");
    expect(linePortrait.closest("article")).not.toHaveClass("selected");
    expect(screen.getByRole("gridcell", { name: /LN1:1 staged move/ })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", { name: /friendly Line, staged for Kinetic/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Phase actions")).toHaveTextContent("2 of 3 unit plans complete");
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
