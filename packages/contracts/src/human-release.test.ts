import { describe, expect, it } from "vitest";
import { AuthSessionViewSchema, FleetDraftInputSchema, ReadyFleetSnapshotSchema, compositionModuleForFleet, fleetDraftWeight } from "./human-release.js";

describe("human release contracts", () => {
  it("maps every legal weight-six composition without creating a new rules path", () => {
    expect(compositionModuleForFleet(["scout", "scout", "scout", "scout", "line"])).toBe("line-four-scout");
    expect(compositionModuleForFleet(["line", "line", "line"])).toBe("three-line");
    expect(compositionModuleForFleet(["heavy", "line", "scout"])).toBe("heavy-line-scout");
    expect(compositionModuleForFleet(["heavy", "heavy"])).toBeNull();
  });

  it("keeps incomplete work as a draft input and rejects an inconsistent ready snapshot", () => {
    const draft = FleetDraftInputSchema.parse({ name: "Draft", units: [{ slotId: "one", chassis: "scout", artAssetId: null }], identity: { commanderAssetId: null, battlefieldAssetId: null, paletteId: "signal-teal", emblemId: "aperture" } });
    expect(fleetDraftWeight(draft)).toBe(1);
    expect(() => ReadyFleetSnapshotSchema.parse({ schemaVersion: 1, fleetId: "f", ownerAccountId: "a", name: "Bad", status: "ready", weight: 6, compositionModule: "three-line", units: [{ slotId: "one", chassis: "scout", artAssetId: null }], identity: draft.identity, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), snapshotHash: `sha256:${"0".repeat(64)}` })).toThrow();
  });

  it("keeps authentication discriminated and fleet slots unambiguous", () => {
    expect(AuthSessionViewSchema.safeParse({ schemaVersion: 1, authenticated: false, account: null, csrfToken: "leaked-token" }).success).toBe(false);
    expect(FleetDraftInputSchema.safeParse({
      name: "Duplicate", units: [{ slotId: "same", chassis: "line", artAssetId: null }, { slotId: "same", chassis: "line", artAssetId: null }],
      identity: { commanderAssetId: null, battlefieldAssetId: null, paletteId: "signal-teal", emblemId: "aperture" }
    }).success).toBe(false);
  });
});
