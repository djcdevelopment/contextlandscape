import { appHref } from "../navigation.js";
import { InterfaceScale, useInterfaceScale } from "./InterfaceScale.js";

export function AppNavigation() {
  const [scale, setScale] = useInterfaceScale();
  return <nav className="app-navigation" aria-label="Context Landscape views">
    <a href={appHref()}>Battle Command</a>
    <details className="app-views"><summary>Views</summary><div>
      <a href={appHref("view=hangar")}>Fleet Hangar</a>
      <a href={appHref("view=atlas")}>Evidence Atlas</a>
      <a href={appHref("view=commander")}>Commander Projection</a>
      <a href={appHref("view=legacy")}>Research Scenarios</a>
    </div></details>
    <InterfaceScale value={scale} onChange={setScale} />
  </nav>;
}
