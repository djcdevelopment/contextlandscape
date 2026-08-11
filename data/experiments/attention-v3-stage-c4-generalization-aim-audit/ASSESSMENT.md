# Attention v3 Stage-C4 generalization and hostile-aim audit

Conformance: **PASS**  
Larger bounded audit: **FAIL**  
Fixed policy: `ruleset-spatial-low-total-ge-4`  
Plan: `attention-v3-stage-c4-6831dd0d5311ef5b`  
Plan hash: `sha256:6831dd0d5311ef5bb27a0080c074f742065ddd33c277e0e39cd84593a574f8b8`  
Report hash: `sha256:9be23296c0eafd9def6253e2f73fecd0c86afba5b4b998151727816f468d9cd6`  
Parent Stage-C3 report: `sha256:8b92063ddeabada20beb3fc07ad57ebcdba90ad3684f1ea01361c97aa3217174`

The audit executed 1,728 fresh common worlds / 6,912 actual matches across nine novel pressure samples, three hostile aim modes, two doctrines, and both seats. The Stage-C3 response was fixed before execution and no selection occurred.

## Conformance gates

- PASS: exactCounts
- PASS: deterministicSentinels
- PASS: commonStreamBlocks
- PASS: zeroPlanRejections
- PASS: zeroArtilleryRejections
- PASS: fixedHandsNoReload
- PASS: publicFeatureParity
- PASS: hostileTargetParity
- PASS: policyMappingExact
- PASS: actualBranchMetricParity
- PASS: bothDistanceBranchesExecute
- PASS: artifactDensityReachesOffCenter
- PASS: farObjectiveReachesOffCenter

## Audit gates

- PASS: pooledAtLeastBestStatic
- FAIL: couplingAimDoctrineWithinTolerance
- FAIL: pressureDoctrineWithinTolerance
- PASS: bothSeatsWithinTolerance
- PASS: clusterRegressionWithinTolerance
- PASS: offCenterAimWithinTolerance

## Overall policy comparison

| Policy | Score | Progress | Drift | Chaff fired | Hostile shells blocked | Support Scans |
|---|---:|---:|---:|---:|---:|---:|
| hold-pass | 0.5263 | 11.627 | 3.634 | 0.0% | 0.0% | 0.000 |
| scout-peel-support | 0.5278 | 10.863 | 3.098 | 0.0% | 0.0% | 5.786 |
| always-chaff | 0.5058 | 10.630 | 3.134 | 100.0% | 63.6% | 0.000 |
| ruleset-spatial-low-total-ge-4 | 0.5732 | 11.288 | 3.060 | 20.5% | 11.2% | 1.581 |

## Hostile aim robustness

| Aim | Adaptive score | Best static | Gap | Mean target offset | Beyond Chaff center |
|---|---:|---:|---:|---:|---:|
| cluster-center | 0.6259 | 0.5668 | 0.0590 | 0.000 | 0.0% |
| artifact-density | 0.5451 | 0.5095 | 0.0356 | 1.352 | 41.7% |
| far-objective | 0.5486 | 0.5182 | 0.0304 | 1.939 | 67.5% |

## Coupling x aim x doctrine

| Coupling | Aim | Doctrine | Adaptive | Best static | Gap |
|---|---|---|---:|---:|---:|
| binary-front | cluster-center | confidence-threshold | 0.6302 | 0.6302 | 0.0000 |
| binary-front | cluster-center | local-verify | 0.4792 | 0.5208 | -0.0417 |
| binary-front | artifact-density | confidence-threshold | 0.5573 | 0.5573 | 0.0000 |
| binary-front | artifact-density | local-verify | 0.5260 | 0.5260 | 0.0000 |
| binary-front | far-objective | confidence-threshold | 0.5000 | 0.5000 | 0.0000 |
| binary-front | far-objective | local-verify | 0.5833 | 0.5833 | 0.0000 |
| global | cluster-center | confidence-threshold | 0.7917 | 0.7917 | 0.0000 |
| global | cluster-center | local-verify | 0.4531 | 0.4844 | -0.0313 |
| global | artifact-density | confidence-threshold | 0.6823 | 0.6823 | 0.0000 |
| global | artifact-density | local-verify | 0.4271 | 0.5625 | -0.1354 |
| global | far-objective | confidence-threshold | 0.5677 | 0.5677 | 0.0000 |
| global | far-objective | local-verify | 0.5000 | 0.5833 | -0.0833 |
| distance-weighted-front | cluster-center | confidence-threshold | 0.7813 | 0.7813 | 0.0000 |
| distance-weighted-front | cluster-center | local-verify | 0.6198 | 0.6302 | -0.0104 |
| distance-weighted-front | artifact-density | confidence-threshold | 0.5938 | 0.5938 | 0.0000 |
| distance-weighted-front | artifact-density | local-verify | 0.4844 | 0.5156 | -0.0313 |
| distance-weighted-front | far-objective | confidence-threshold | 0.6042 | 0.6042 | 0.0000 |
| distance-weighted-front | far-objective | local-verify | 0.5365 | 0.5573 | -0.0208 |

## Novel pressure x doctrine

| Pressure | Doctrine | Adaptive | Best static | Gap |
|---|---|---:|---:|---:|
| binary-sound-45 | confidence-threshold | 0.4792 | 0.4792 | 0.0000 |
| binary-sound-45 | local-verify | 0.4271 | 0.4635 | -0.0365 |
| binary-sound-60 | confidence-threshold | 0.5990 | 0.5990 | 0.0000 |
| binary-sound-60 | local-verify | 0.5729 | 0.5729 | 0.0000 |
| binary-sound-85 | confidence-threshold | 0.6094 | 0.6094 | 0.0000 |
| binary-sound-85 | local-verify | 0.5885 | 0.6406 | -0.0521 |
| global-sound-35 | confidence-threshold | 0.6458 | 0.6458 | 0.0000 |
| global-sound-35 | local-verify | 0.4271 | 0.4271 | 0.0000 |
| global-sound-55 | confidence-threshold | 0.6458 | 0.6458 | 0.0000 |
| global-sound-55 | local-verify | 0.4740 | 0.6042 | -0.1302 |
| global-sound-75 | confidence-threshold | 0.7500 | 0.7500 | 0.0000 |
| global-sound-75 | local-verify | 0.4792 | 0.6719 | -0.1927 |
| distance-sound-45 | confidence-threshold | 0.5885 | 0.5885 | 0.0000 |
| distance-sound-45 | local-verify | 0.4427 | 0.4688 | -0.0260 |
| distance-sound-65 | confidence-threshold | 0.6927 | 0.6927 | 0.0000 |
| distance-sound-65 | local-verify | 0.5625 | 0.6458 | -0.0833 |
| distance-sound-90 | confidence-threshold | 0.6979 | 0.6979 | 0.0000 |
| distance-sound-90 | local-verify | 0.6354 | 0.7240 | -0.0885 |

## Assessment

- The fixed response scored 0.5732 versus 0.5278 for the best pooled static control (`scout-peel-support`), a delta of 0.0454.
- The worst coupling x aim x doctrine gap was -0.1354; the worst novel pressure x doctrine gap was -0.1927.
- Artifact-density targeting landed beyond the proactive Chaff screen in 41.7% of worlds; far-objective targeting did so in 67.5%.
- Every aim aggregate beat its best static control, so off-center targeting was not the primary audit failure. The hard global-to-Chaff branch failed as soundness rose, and high-soundness local-verification cells sometimes favored holding.
- The next bounded candidate should choose among hold, Scout peel plus Support Scan, and Chaff from public low-confidence count within each public objective-coupling regime.
- The adaptive branch function did not receive soundness rate, pressure ID, aim mode, latent truth, focal seat, or audit cell.
- Audit status applies to this fixed response under the frozen matrix only.

## Boundary

This failed audit does not support retaining the response as a general artillery doctrine. Its Stage-C3 centered-Flare result remains valid inside that frozen boundary. The result does not invalidate the underlying mechanics or authorize full model promotion, new shells, reloads, cooldowns, or counter-battery.
