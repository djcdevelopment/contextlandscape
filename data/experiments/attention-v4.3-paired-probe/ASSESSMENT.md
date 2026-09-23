# Attention-economy v4.3: action-paid range

Range shifts previously spent one UAP per step and reduced Line/Heavy calibration to 20%. They now spend the action without that additional calibration penalty. A Line can choose Move + Range, Move + Step-Up, Range + Step-Up, or two range steps within its normal two-UAP budget. Any ordering of Move + Step-Up + Range works with three UAP. Step-Up still raises Line calibration to 85%; Smoke, Scout Condense, Heavy Uplink and ordinary Kinetic traffic retain their own effects.

This is the 2026-09-06 range-cost amendment to base source `c714a1903da52c181820bc0f4004411c4d78055c`. Ruleset `attention-economy-v4.3` and resolver `attention-v4.3-resolver-1` distinguish it from saved v4.2 operations. Earlier operations follow the existing retired-operation path.

## Direct behavior checks

[Engine regressions](../../../packages/engine/src/attention-v4.test.ts) cover ±1 range on every chassis, action spending, emitted calibration, range bounds, Line action pairs, all six orderings of its three actions with battery UAP, budget rejection, and independence from Smoke/Condense/Uplink.

[Server regressions](../../../apps/server/src/battle-command-core.test.ts) submit Move + Range through the command bridge and verify 60% source calibration and 48% effective calibration at 80% density in its public artifact projection. They also reject v4.2 snapshots instead of silently changing their rules.

The [board example](../../../design/board-design/index.html) now shows Move + Range at 48% effective calibration and Range + Step-Up at 68%, with their two-action costs explicit.

## Canonical activation report

The existing paired protocol completed with replay:

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

[report.json](report.json) was pinned by the v4.3 runtime activation constant and verified by `npm run verify:attention-v4-conformance` when that amendment was completed. It remains historical evidence after the subsequent v4.4 Smoke clarification; the current activation verifier follows the current ruleset's report.

- Rules hash: `sha256:7a3450785ad82444afeaca8d26e89c7d710fb4358e05a4d1c8dfb01b99ca11fc`
- Report hash: `sha256:869a04ac641ef118266a0cc3e43cfcdbe879a8c67790b4f87f21b398cecff25f`
- Commander catalog: `sha256:4c1a8a76f0c5ef31674e80a9f76bc67f0a357da649d300f4347e3ad41bec7c74`

The compiler mapping and paired protocol are unchanged, so their v4.2 identifiers remain. The report's ruleset, resolver and catalog fields identify the v4.3 execution. New runner defaults write under the current rules version; the v4.2 study files and their recorded hashes are preserved.

## Interpretation

Validation passed: repository build and typecheck; 144 relevant contract, engine, server, web and simulator tests; three desktop/tablet/phone browser journeys; and the board package's 22 examples and 12 SVG checks. The simulator smoke initially exceeded its 120-second limit during the concurrent canonical run, then passed on its own in 64 seconds. The existing v4.2 historical report verifiers also pass against their pinned evidence.

The automated commander policies do not issue range-shift actions. This canonical run checks the existing activation requirements; the direct engine and command-bridge regressions establish the changed action behavior. The report is not a balance estimate for player use of range or evidence that the revised board is understood by humans.
