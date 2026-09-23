# Board design: the balancing act

The design direction is a shared tabletop where mechs produce work, artifacts demand decisions, and batteries visibly support other pieces. Selecting an action explains its cost, reach, percentage change, timing and uncertainty.

**[Open the visual gallery](index.html)** to compare four decisions at desktop, wide desktop and phone sizes. Open this local HTML file in a browser; it needs no server. The scene and viewport selectors work. Drawn game controls are illustrations.

| Artifact | What it provides |
| --- | --- |
| [Ontology and impact map](ontology-and-impact.md) | Entities, every current player action, automatic transitions, workflow associations, source symbols and change-impact paths |
| [Reference patterns](reference-patterns.md) | Classic design foundations; Risk 2210 and all four Frontline modules; two fan expansions; Spirit Island; Into the Breach; accessible visual grammar |
| [Board brief](board-brief.md) | Information hierarchy, exact action grammar, uncertainty conventions, teaching copy, implementation gaps and a five-task playtest |
| [Validation record](validation.md) | What was checked, reproduction commands, mechanical boundaries and pending human evidence |
| [Example results](example-results.json) | Recorded source fingerprints and 22 engine-backed checks |

## The four decisions

| Scene | 1440×1000 | 2048×900 | 390×844 |
| --- | --- | --- | --- |
| S01 — Extra reach versus preparation | [Desktop](wireframes/s01-planning-1440x1000.svg) | [Wide](wireframes/s01-planning-2048x900.svg) | [Phone](wireframes/s01-planning-390x844.svg) |
| S02 — Urgent work versus reusable support | [Desktop](wireframes/s02-triage-1440x1000.svg) | [Wide](wireframes/s02-triage-2048x900.svg) | [Phone](wireframes/s02-triage-390x844.svg) |
| S03 — Interference and affected recipients | [Desktop](wireframes/s03-interference-1440x1000.svg) | [Wide](wireframes/s03-interference-2048x900.svg) | [Phone](wireframes/s03-interference-390x844.svg) |
| S04 — Sequence, outcome and future options | [Desktop](wireframes/s04-resolution-1440x1000.svg) | [Wide](wireframes/s04-resolution-2048x900.svg) | [Phone](wireframes/s04-resolution-390x844.svg) |

Desktop callout **1** identifies spatial relationships, **2** the selected consequence, and **3** the expanded comparison on wide screens. The smaller desktop includes condensed alternatives; phone drawings show collapsed details. Own pieces have the suffix 1, rival pieces 2. A1 and B1 are stable illustrative artifact identities; B1's battery status is a property of that work.

The package describes `attention-economy-v4.4`: base source `c714a1903da52c181820bc0f4004411c4d78055c` plus the user-directed range-cost and mech-only Smoke amendments of 2026-09-06. Range changes cost actions without a calibration penalty. Smoke disrupts mechs while batteries retain their discounts and action support. The redesigned board is still an illustration; the rule amendments also apply to new operations in the game.

## Maintain the package

From the repository root, with repository dependencies installed:

```powershell
npm run build --workspace=@landscape/contracts
node design/board-design/render-wireframes.mjs
node --import tsx design/board-design/check-examples.mjs
node design/board-design/check-package.mjs --browser
```

The browser check uses the repository's existing Playwright dependency and an installed Chromium. Omit `--browser` to run only local links, generated-file freshness and source fingerprint checks. After reviewing a new rules/source cut, update its references and run the examples with `--write` to replace the recorded evidence.

The next implementation slice in the brief is S02: shared piece selection, complete stack access, battery beneficiaries and Verify/commit consequences. Exact staged Kinetic and artillery previews require additional authoritative, viewer-safe effect data before they can be shipped.
