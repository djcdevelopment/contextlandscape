import { describe, expect, it } from "vitest";
import { appHref, appMountPath, isLegacyRoute } from "./navigation.js";

describe("public mount navigation", () => {
  it("keeps SPA links under the public landscape mount", () => {
    expect(appMountPath("/landscape/")).toBe("/landscape/");
    expect(appMountPath("/landscape")).toBe("/landscape/");
    expect(appHref("view=hangar", "/landscape/")).toBe("/landscape/?view=hangar");
    expect(appHref("friendBattle=match-one", "/landscape/")).toBe("/landscape/?friendBattle=match-one");
  });

  it("keeps root-mounted development links at root", () => {
    expect(appMountPath("/")).toBe("/");
    expect(appHref("view=atlas", "/")).toBe("/?view=atlas");
  });

  it("opens old scenario invitations in Research Scenarios and friend duels in the Hangar", () => {
    for (const query of ["challenge=challenge_old-id", "view=legacy&challenge=challenge_new-id", "labs=1", "labSession=review-session"]) {
      expect(isLegacyRoute(new URLSearchParams(query)), query).toBe(true);
    }
    for (const query of ["challenge=duel_friend-id", "view=hangar", "friendBattle=match-one", "view=atlas"]) {
      expect(isLegacyRoute(new URLSearchParams(query)), query).toBe(false);
    }
  });
});
