import { describe, expect, it } from "vitest";
import { appHref, appMountPath } from "./navigation.js";

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
});
