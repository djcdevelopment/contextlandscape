# Attention v3 Stage-B spatial differential probe

Status: **FROZEN FOR EXECUTION**  
Model: `duel-capacity-v3-experimental` with UAP + spatial spawning, artillery disabled

## Question

Does explicit spatial spawning make movement, active range, local verification, and Line
Support Scan causally observable under identical world streams, without changing Stage-A or
legacy resolver behavior?

## Frozen design

- Four paired contrasts: artifact chase vs hold, Support Scan vs hold, range compression vs
  default, and range expansion vs default.
- Four pressure samples spanning binary, global, and distance-weighted objective coupling at
  0.55, 0.70, and 0.80 latent soundness.
- Three command doctrines: accept all, confidence threshold, and local verify.
- Forty-eight seeds and both focal seats.
- Every cell runs a treatment arm and a control arm with the same random-stream identifier.
- Balanced composition, pass-capacity policy, no artillery, no reload, and no commander Macro
  Flare deployment.

This yields 4,608 paired comparisons / 9,216 match executions, plus deterministic replay
sentinels.

## Gates

1. Exact planned execution count and zero replay-sentinel mismatches.
2. Zero rejected UAP plans in the deliberately collision-free probe policies.
3. Artifact chase increases executed movement.
4. Support policy executes Support Scans and produces Support-Scan verification events.
5. Range compression lowers mean keyed artifact distance.
6. Range expansion raises mean keyed artifact distance.
7. Every run exposes spatial counters and no artillery counters.

Outcome, progress, drift, unreachable auto-acceptance, seat, pressure, and command-doctrine
effects are directional evidence only. No pooled win rate can override a failed mechanic gate.

## Outputs

- `data/experiments/attention-v3-stage-b-spatial-probe/PLAN.json`
- `data/experiments/attention-v3-stage-b-spatial-probe/report.json`
- `data/experiments/attention-v3-stage-b-spatial-probe/ASSESSMENT.md`
- `data/experiments/attention-v3-stage-b-spatial-probe/mechanic-deltas.svg`

