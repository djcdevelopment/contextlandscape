# Design package validation

Reviewed 2026-09-06 against base source `c714a1903da52c181820bc0f4004411c4d78055c` plus the range-cost and mech-only Smoke amendments through v4.4. The [example report](example-results.json) records the rules hash and source-file SHA-256 fingerprints.

## Mechanical examples

All 22 examples in [check-examples.mjs](check-examples.mjs) pass against the source reducer and schemas. These are deterministic in-memory examples, including deliberately composed boundary states. They do not establish that a complete naturally played match reaches every illustrated state.

| Checks | What the examples establish |
| --- | --- |
| EX01–EX04 | Range preserves calibration while spending UAP; Step-Up alternatives, all Condense modes, reactor allocation, birth metrics and signal changes without changing the shared hidden truth draw |
| EX05–EX07 | Verify rescues an eligible hazard; Focus alone does not; battery eligibility uses source calibration rather than effective D×C |
| EX08–EX10 | No self-discount or stacking, cost floors, cross-owner artifact support, same-owner future UAP and EMP overriding that bonus |
| EX11–EX14 | Smoke mech effects and expiry with uninterrupted battery support, unchanged old artifact metrics, exact age/traffic thresholds, both owners' traffic and newborn immunity |
| EX15–EX17 | Capacity cost/award timing and the contradictory-event gap; newly placed Chaff; HE deduplication, verified immunity and delayed terminal evaluation |
| EX18–EX20 | Verify-before-Accept recap, loss of next-Register support, Drift precedence and stored objective eligibility |
| EX21–EX22 | Viewer projection omits private truth/streams; changing hidden soundness alone does not change the legal projection; current discriminated action kinds and transition IDs are represented |

These checks substantiate the brief's numerical examples. They do not constitute an exhaustive balance study, a proof of every possible engine history, or an automated test of the future UI.

The [v4.3 range amendment](../../data/experiments/attention-v4.3-paired-probe/ASSESSMENT.md) has direct engine/command-bridge regression coverage and a passing historical 27,648-match activation report. The subsequent [v4.4 Smoke amendment](../../data/experiments/attention-v4.4-paired-probe/ASSESSMENT.md) records its own behavior checks and activation evidence. That evidence is separate from the static design examples and pending human comprehension work.

## Package and visual checks

The package checker verifies relative document links and Markdown heading targets, the expected 12 generated SVGs, descriptive SVG titles, gallery freshness and the five recorded source fingerprints. Its browser mode parses every SVG in Chromium and measures text bounds and pairwise text overlap, then exercises all scene/viewport combinations and the image display toggle.

The subsequent runtime UI checks cover help on hover/focus, the UAP explanation's side-navigation trigger, Range reach and reserved-point updates, Condense preview changes, individual and dependent cancellation, point refunds, and submission locks. Desktop geometry now covers all four interface scales at 2048×900 and 1920×1080, both board views, and zero/one/two staged Condense steps. These UI checks supplement the static figures without changing the v4.4 rules or activation report.

The three figure sizes are 1440×1000, 2048×900 and 390×844. Browser inspection checks that the gallery remains within each viewport in its fitted state. Native-size images scroll inside their frame.

The contracts build, all 22 numerical examples, package checks and `git diff --check` passed. The package checks cover five documents, their local links, 12 figures and five source fingerprints. Browser checks parse all 12 SVG documents for text overflow or overlap and exercise all 12 gallery selections at the three viewport sizes.

Representative drawings were also inspected visually for legibility, selection consistency, piece silhouettes, field relationships and the immediate-versus-delayed distinction. Geometry checks do not measure comprehension or establish assistive-technology conformance.

## Reproduce

```powershell
npm run build --workspace=@landscape/contracts
node design/board-design/render-wireframes.mjs
node --import tsx design/board-design/check-examples.mjs
node design/board-design/check-package.mjs --browser
git diff --check
```

The generator is independent of the runtime game. The numerical checks use the repository's `tsx` and built contracts; browser checks use its Playwright installation. Nothing in this procedure creates a persistent match or submits a game action. The generated files are checked in so a reviewer can open the [gallery](index.html) without running the scripts.

## Research boundaries

The [reference study](reference-patterns.md) links each observation to original rules, designer material, publisher resources or creator-attributed fan rules. All six pages of the scanned Frontline document were inspected locally. Its Tech season report was supplemented by the explicitly identified community card reproduction. Spirit Island's publisher-linked power anatomy was inspected on page 16.

The package contains original figures. Source PDFs, screenshots of external games and downloaded artwork are not included. Coverage includes the four named official Frontline modules and two targeted fan extensions; “2042” and an exhaustive survey of every unofficial expansion remain outside the agreed study.

## Pending evidence and implementation

- The five-friend comprehension protocol in the [brief](board-brief.md#playtest-protocol) has not been conducted. Its acceptance targets remain goals for that walkthrough.
- Static drawings do not test input, live match revision changes, friend waiting states, crowded cell navigation, zoom or persisted preferences.
- Exact staged-plan and quantitative artillery previews need additional authoritative projection work, identified as G01. The API shape is unchanged; Smoke previews now list only mechs as affected.
- Battery ownership asymmetry, renderer reach/target parity, contradictory Capacity events and the Drift-heavy balance baseline remain documented findings. Smoke no longer causes the former battery-suppression rendering mismatch.
- Recognizing a gaming skill in this analogy is an observation to record. It does not establish professional competence or a quantified transfer of skill.
