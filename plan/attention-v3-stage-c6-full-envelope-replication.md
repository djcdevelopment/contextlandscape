# Attention v3 Stage-C6 full-envelope three-response replication

Status: **FROZEN FOR EXECUTION**  
Parent report: `sha256:f1c12e3a12930dea0f32a40946305146ac1267d04bb860a9bcef361cdf477081`

## Decision target

Determine whether the Stage-C5 single-snapshot three-response family is feasible when selection
sees the complete soundness envelope rather than extrapolating beyond its training range.

For each public objective-coupling rule, independently select among the same 17 frozen rules:
`hold` when public low-confidence count `L <= holdMax`, `Chaff` when `L >= chaffMin`, otherwise
Scout peel plus Line Support Scan. `holdMax in {0,1,2,3}`, `chaffMin in {2,3,4,5,6}`, and
`holdMax < chaffMin`. All three branches must execute in training.

Selection order remains: maximum minimum pressure score, maximum minimum aim score, pooled
score, minimum Chaff rate, minimum peel rate, lexical rule ID. Training uses exact common-world
static-arm lookup. The selected combined controller then runs as an actual policy on fresh
replication seeds.

## Frozen matrix

- Soundness levels for every coupling: `{0.25,0.35,0.45,0.55,0.65,0.75,0.85,0.95}`.
- Couplings: `binary-front`, `global`, `distance-weighted-front`.
- Aim modes: `cluster-center`, `artifact-density`, `far-objective`.
- Doctrine: `local-verify` only; confidence-threshold hold parity is already established.
- Both seats, balanced composition, pass-capacity, round-one hostile Flare, fixed hands, no reload.
- Training seeds: 505000 through 505007.
- Replication seeds: 505008 through 505015.
- Training: 1,152 worlds x 3 static arms = 3,456 matches and 19,584 offline decisions.
- Replication: 1,152 worlds x 4 actual arms = 4,608 matches.
- Total: 8,064 matches plus 504 exact replay sentinels.

## Gates

Conformance requires exact counts and streams, zero replay mismatch/rejections/reloads, feature
and target parity, reproducible selectors, all three branches in both splits, exact adaptive
branch mapping, exact adaptive-to-static metric parity, and off-center aim reachability.

Feasibility passes only if the replicated adaptive score is at least the best pooled static,
every coupling x aim aggregate and every soundness pressure is within 0.075 of its best static,
both seats are within 0.05, every aim is within 0.075, and every coupling aggregate is within
0.05. Failure ends single-round low-count threshold tuning and points to sequential public
calibration or an explicitly public environment prior.

## Outputs

`data/experiments/attention-v3-stage-c6-full-envelope-replication/` containing `PLAN.json`,
`report.json`, `ASSESSMENT.md`, and SVG charts. Analysis and rendering may follow after execution.
