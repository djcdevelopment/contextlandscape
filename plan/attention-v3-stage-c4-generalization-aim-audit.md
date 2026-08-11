# Attention v3 Stage-C4 generalization and hostile-aim audit

Status: **FROZEN FOR EXECUTION**  
Fixed parent policy: `ruleset-spatial-low-total-ge-4`  
Parent report hash: `sha256:8b92063ddeabada20beb3fc07ad57ebcdba90ad3684f1ea01361c97aa3217174`

## Audit purpose

Stage C3 selected and passed one ruleset-aware response on an untouched holdout. Stage C4 does
not retrain, retune, or select. It audits that exact response across novel soundness values and
hostile Flare aim geometry while keeping the Stage-B/C mechanics fixed.

## Fixed focal response

- Under `confidence-threshold`, hold and preserve Chaff.
- Under `local-verify` with public `global` objective coupling, fire Chaff.
- Under `local-verify` with public `binary-front` coupling, peel the Scout and use Line Support
  Scan whenever legal.
- Under `local-verify` with public `distance-weighted-front` coupling, fire Chaff when at least
  four public pending artifacts have reported confidence below 0.50; otherwise peel the Scout
  and use Support Scan.
- Proactive Chaff is centered on the focal formation cluster. The response cannot see the
  hostile same-phase declaration before choosing.

The branch function receives command doctrine, public objective coupling, and public projected
artifact fields only. It does not receive soundness rate, pressure ID, hostile aim mode, latent
truth, focal seat, or audit cell.

## Fresh generalization surface

Nine pressure samples are all new relative to the Stage-C3 train/holdout matrix:

- `binary-front` at soundness 0.45, 0.60, and 0.85;
- `global` at soundness 0.35, 0.55, and 0.75;
- `distance-weighted-front` at soundness 0.45, 0.65, and 0.90.

Every sample crosses both command doctrines, both focal seats, and three deterministic hostile
aim modes:

1. `cluster-center`: the original focal formation center;
2. `artifact-density`: the public focal-artifact coordinate whose 3x3 zone contains the most
   pending focal artifacts, then the most objective-eligible artifacts, then the greatest
   reported-confidence sum, with coordinate tie-breaks;
3. `far-objective`: the public pending objective-eligible focal artifact farthest from the
   formation center, then lowest reported confidence, with coordinate tie-breaks.

Aim is computed independently inside every policy run. Exact target-coordinate parity across
common-world arms is mandatory. The two adaptive aim modes must actually produce off-center
targets beyond the proactive Chaff screen.

## Matrix and count

- Fresh seeds: 303000 through 303015 (16 seeds).
- Balanced composition, pass-capacity, one round-one hostile Flare, fixed hands, no reload.
- 9 pressures x 3 aim modes x 2 doctrines x 16 seeds x 2 seats = 1,728 common worlds.
- Four actual arms per world: hold, Scout peel plus Support Scan, always-Chaff, and the fixed
  Stage-C3 response.
- 6,912 matches plus 216 exact replay sentinels.

## Conformance gates

1. Exact world/run counts, common streams, and zero replay mismatch.
2. Zero UAP plan or artillery declaration rejections; fixed hands and no reload.
3. Public response features and hostile target coordinates are identical across all four arms.
4. The fixed adaptive branch mapping is exact in every world.
5. Every adaptive result has exact metric parity with the static branch it selected.
6. Both adaptive response branches execute under distance-weighted/local play.
7. `artifact-density` and `far-objective` each place at least 10% of hostile targets more than
   one Chebyshev cell from the proactive Chaff center.

## Audit gates

The fixed response clears this larger bounded audit only if:

1. pooled score is at least the best pooled static control;
2. every objective-coupling x aim x doctrine aggregate is within 0.075 of its best static arm;
3. every pressure x doctrine aggregate is within 0.075 of its best static arm;
4. both seats are within 0.05 of their best static arm;
5. every cluster-center objective-coupling x doctrine regression cell is within 0.05;
6. each off-center aim mode, pooled across pressures and doctrines, is within 0.075.

Failure limits or rejects the response policy. It does not invalidate the underlying spatial
spawn, Support Scan, Flare, or Chaff implementations.

## Outputs

- `data/experiments/attention-v3-stage-c4-generalization-aim-audit/PLAN.json`
- `data/experiments/attention-v3-stage-c4-generalization-aim-audit/report.json`
- `data/experiments/attention-v3-stage-c4-generalization-aim-audit/ASSESSMENT.md`
- `data/experiments/attention-v3-stage-c4-generalization-aim-audit/aim-robustness.svg`
- `data/experiments/attention-v3-stage-c4-generalization-aim-audit/generalization-score.svg`
