# Attention-economy v4.4: Smoke affects mechs

Smoke now affects only mechs. It resets caught calibration to 20% and Condense to zero, cancels current Support Scan reservations touching caught participants, and clears queued Uplinks. Those effects still cover either player's mechs through this and the next Command window.

Batteries keep working inside Smoke: their Verify/Seize discounts and next-Register UAP remain available. An eligible artifact can become a battery inside Smoke using its stored generation calibration. Smoke does not change existing artifact metrics. Smoke previews report affected mechs and no affected batteries or artifacts.

This is the user-directed 2026-09-06 clarification following the action-only range amendment. Ruleset `attention-economy-v4.4` and resolver `attention-v4.4-resolver-1` distinguish it from saved operations with battery suppression. The existing retirement path rejects earlier identities instead of silently changing their rules. State/view schema 3 and the external model ID stay unchanged; the retained `battery.suppressed` field has no current gameplay cause.

## Direct behavior checks

[Engine regressions](../../../packages/engine/src/attention-v4-conformance.test.ts) cover both fleets' mech effects, scan/Uplink cancellation, unchanged artifacts, an empty affected-battery preview, uninterrupted discounts and UAP through Smoke expiry, and battery activation inside Smoke. The prior [range regressions](../../../packages/engine/src/attention-v4.test.ts) continue to cover action costs and independent specialization effects.

[Server regressions](../../../apps/server/src/battle-command-core.test.ts) check the current identity and retirement of v4.2 and v4.3 snapshots. The [board examples](../../../design/board-design/index.html) retain the Line's 68% to 16% future effective-calibration change while showing B1 active, A1 Verify at zero, and continued next-Register support.

## Canonical activation report

The existing paired protocol completed with replay for this identity:

`27 module contrasts × 2 seats × 4 pressure samples × 64 seeds × 2 arms = 27,648 matches`

| Check | Result |
| --- | --- |
| Pairs | 13,824 |
| Changed pairs | 13,810 |
| Replay mismatches | 0 |
| Random-stream mismatches | 0 |
| Commander-attribution mismatches | 0 |
| Every module eligible, executed and changed a pair | Passed |
| Starting-range and shell-choice differentials | Passed |

[report.json](report.json) is pinned by the runtime activation constant and verified by `npm run verify:attention-v4-conformance`.

- Rules hash: `sha256:aa4042f5eb5364dcc1a512d68ef7a13e8a0d9792612612c8b0bcf779302e19b8`
- Report hash: `sha256:8ecb2fcc6c7a3292943e64582a30d98cbfdb1dea4a1de79b922401cf48d62b43`
- Commander catalog: `sha256:96d5fdfb3ecf4c13a9554a51c3fb70f2178c476b0fa39e5763b55fbeb3fca526`

The v4.2 and v4.3 reports remain historical evidence. The v4.2 compiler and paired-protocol identifiers remain applicable because those algorithms have not changed. The report's ruleset, resolver and catalog fields identify this v4.4 execution.

## Interpretation

Validation passed: repository build and typecheck; 5 current contract tests, 109 engine tests, 13 command-core/API tests, 8 browser-component tests and 8 simulator tests; three desktop/tablet/phone browser journeys; and the board package's 22 examples and 12 SVG checks. The compiler coverage check and existing v4.2 historical report verifiers also pass.

Automated commanders already target Smoke at enemy mechs. This probe checks replay, attribution and module execution under the revised rules; the direct regressions specifically establish battery immunity. Neither is evidence of human comprehension or a complete balance study of the amendments. The redesigned board remains an illustrated specification.
