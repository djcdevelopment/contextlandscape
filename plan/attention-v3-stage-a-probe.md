# Attention v3 Stage-A differential probe

Status: executed; all hard gates passed  
Resolver: `attention-v3-stage-a-resolver-1`

Final content-addressed identifiers are recorded in
`data/experiments/attention-v3-stage-a-probe/ASSESSMENT.md`.

## Objective

Verify that the Stage-A UAP actions are deterministic, executable, causally distinct in
their explicit state/counter effects, and safe to study before adding spatial artifact
placement. This is not a promotion campaign.

## Design

The probe crosses:

- six action contrasts: Scout Active Recon versus hold and flight, Line Step-Up versus hold
  and movement, and Siege Uplink versus hold and movement;
- both seat orientations;
- four pressure samples crossing objective coupling and soundness;
- three fixed attention-command contexts: accept-all, confidence-threshold, and
  verify-lowest;
- 64 common seeds.

Total: `6 × 2 × 4 × 3 × 64 = 9,216` planned matches, plus one exact deterministic replay
sentinel for each contrast × pressure × command cell (`72` extra executions).

All matches use the balanced composition, source-cell artifacts, pass-only capacity policy,
and no artillery. Random-stream IDs are shared across contrasts and seat orientations for a
given pressure, command context, and seed.

## Hard gates

- observed matches equal 9,216 exactly;
- all 72 replay sentinels reproduce both trace hash and terminal state;
- zero UAP plan rejections in the intended action catalog;
- every contrast changes its predeclared mechanic counter in the treatment direction;
- v1/v2 tests, the full workspace tests, and the full workspace typecheck remain green.

Outcome score, draws, rounds, and seat score are directional diagnostics. No outcome effect
threshold is declared for this conformance probe.

## Artifact policy

Write only a compact aggregate JSON report and Markdown assessment under
`data/experiments/attention-v3-stage-a-probe/`. Do not retain per-match records. Hash the
frozen plan definition and the final report separately.
