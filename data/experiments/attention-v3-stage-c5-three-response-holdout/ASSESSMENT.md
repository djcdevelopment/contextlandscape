# Attention v3 Stage-C5 three-response disjoint-soundness holdout

Conformance: **PASS**  
Holdout promotion: **FAIL**  
Selected policy: `three-response-dec8e3e2c57e`  
Plan: `attention-v3-stage-c5-e04e889e2e70a8b4`  
Plan hash: `sha256:e04e889e2e70a8b4cf36403118bd24fe1a6a480f85ab197e35212cff5a40a9e9`  
Report hash: `sha256:f1c12e3a12930dea0f32a40946305146ac1267d04bb860a9bcef361cdf477081`  
Parent Stage-C4 report: `sha256:9be23296c0eafd9def6253e2f73fecd0c86afba5b4b998151727816f468d9cd6`

Training executed 864 worlds / 2,592 matches and 14,688 exact candidate-world lookups. The combined policy was then instantiated once for 1,728 untouched worlds / 6,912 actual matches on a disjoint soundness grid.

## Conformance gates

- PASS: exactTrainCounts
- PASS: exactCandidateEvaluationCount
- PASS: exactHoldoutCounts
- PASS: deterministicSentinels
- PASS: commonStreamBlocks
- PASS: zeroPlanRejections
- PASS: zeroArtilleryRejections
- PASS: fixedHandsNoReload
- PASS: publicFeatureParity
- PASS: hostileTargetParity
- PASS: selectorsReproduce
- PASS: selectedAllBranchesTrain
- PASS: selectedAllBranchesHoldout
- PASS: policyMappingExact
- PASS: actualBranchMetricParity
- PASS: artifactDensityReachesOffCenter
- PASS: farObjectiveReachesOffCenter

## Holdout gates

- PASS: pooledAtLeastBestStatic
- PASS: couplingAimDoctrineWithinTolerance
- FAIL: pressureDoctrineWithinTolerance
- PASS: bothSeatsWithinTolerance
- PASS: everyAimWithinTolerance
- PASS: couplingLocalWithinTolerance

## Selected training rules

| Coupling | Rule | Minimum pressure | Minimum aim | Pooled | Hold | Peel | Chaff |
|---|---|---:|---:|---:|---:|---:|---:|
| binary-front | hold-le-0-chaff-ge-3 | 0.4844 | 0.4635 | 0.5069 | 4.2% | 42.0% | 53.8% |
| global | hold-le-0-chaff-ge-4 | 0.4323 | 0.5104 | 0.5365 | 2.8% | 65.6% | 31.6% |
| distance-weighted-front | hold-le-0-chaff-ge-6 | 0.4271 | 0.5833 | 0.5955 | 5.6% | 93.4% | 1.0% |

## Untouched holdout

| Policy | Score | Progress | Drift | Hold | Peel | Chaff |
|---|---:|---:|---:|---:|---:|---:|
| hold-pass | 0.5573 | 12.183 | 3.265 | 100.0% | 0.0% | 0.0% |
| scout-peel-support | 0.5347 | 11.447 | 2.768 | 0.0% | 100.0% | 0.0% |
| always-chaff | 0.5171 | 11.192 | 2.805 | 0.0% | 0.0% | 100.0% |
| three-response-dec8e3e2c57e | 0.6050 | 11.987 | 2.664 | 52.9% | 33.1% | 14.0% |

## Local-verification branch mix

| Coupling | Hold | Peel + Support | Chaff |
|---|---:|---:|---:|
| binary-front | 6.6% | 42.0% | 51.4% |
| global | 3.8% | 64.6% | 31.6% |
| distance-weighted-front | 6.9% | 92.0% | 1.0% |

## Hostile aim robustness

| Aim | Adaptive | Best static | Gap | Beyond Chaff center |
|---|---:|---:|---:|---:|
| cluster-center | 0.6806 | 0.6215 | 0.0590 | 0.0% |
| artifact-density | 0.5790 | 0.5286 | 0.0503 | 39.9% |
| far-objective | 0.5556 | 0.5260 | 0.0295 | 67.5% |

## Disjoint pressure x doctrine

| Pressure | Doctrine | Adaptive | Best static | Gap |
|---|---|---:|---:|---:|
| binary-sound-35 | confidence-threshold | 0.4635 | 0.4844 | -0.0208 |
| binary-sound-35 | local-verify | 0.5260 | 0.5365 | -0.0104 |
| binary-sound-70 | confidence-threshold | 0.5729 | 0.5729 | 0.0000 |
| binary-sound-70 | local-verify | 0.5885 | 0.6354 | -0.0469 |
| binary-sound-95 | confidence-threshold | 0.5990 | 0.5990 | 0.0000 |
| binary-sound-95 | local-verify | 0.5938 | 0.6875 | -0.0938 |
| global-sound-25 | confidence-threshold | 0.4896 | 0.4896 | 0.0000 |
| global-sound-25 | local-verify | 0.3802 | 0.4635 | -0.0833 |
| global-sound-65 | confidence-threshold | 0.7865 | 0.7865 | 0.0000 |
| global-sound-65 | local-verify | 0.5521 | 0.6250 | -0.0729 |
| global-sound-85 | confidence-threshold | 0.7969 | 0.7969 | 0.0000 |
| global-sound-85 | local-verify | 0.7604 | 0.8229 | -0.0625 |
| distance-sound-35 | confidence-threshold | 0.6146 | 0.6146 | 0.0000 |
| distance-sound-35 | local-verify | 0.2917 | 0.3333 | -0.0417 |
| distance-sound-75 | confidence-threshold | 0.7292 | 0.7292 | 0.0000 |
| distance-sound-75 | local-verify | 0.6615 | 0.6615 | 0.0000 |
| distance-sound-95 | confidence-threshold | 0.7135 | 0.7135 | 0.0000 |
| distance-sound-95 | local-verify | 0.7708 | 0.8646 | -0.0938 |

## Coupling x aim x doctrine

| Coupling | Aim | Doctrine | Adaptive | Best static | Gap |
|---|---|---|---:|---:|---:|
| binary-front | cluster-center | confidence-threshold | 0.6563 | 0.6563 | 0.0000 |
| binary-front | cluster-center | local-verify | 0.5208 | 0.5365 | -0.0156 |
| binary-front | artifact-density | confidence-threshold | 0.5208 | 0.5208 | 0.0000 |
| binary-front | artifact-density | local-verify | 0.6042 | 0.5625 | 0.0417 |
| binary-front | far-objective | confidence-threshold | 0.4583 | 0.4583 | 0.0000 |
| binary-front | far-objective | local-verify | 0.5833 | 0.5521 | 0.0313 |
| global | cluster-center | confidence-threshold | 0.8333 | 0.8333 | 0.0000 |
| global | cluster-center | local-verify | 0.5781 | 0.6146 | -0.0365 |
| global | artifact-density | confidence-threshold | 0.6875 | 0.6875 | 0.0000 |
| global | artifact-density | local-verify | 0.5833 | 0.5833 | 0.0000 |
| global | far-objective | confidence-threshold | 0.5521 | 0.5521 | 0.0000 |
| global | far-objective | local-verify | 0.5313 | 0.5625 | -0.0313 |
| distance-weighted-front | cluster-center | confidence-threshold | 0.8646 | 0.8646 | 0.0000 |
| distance-weighted-front | cluster-center | local-verify | 0.6302 | 0.6302 | 0.0000 |
| distance-weighted-front | artifact-density | confidence-threshold | 0.5885 | 0.5885 | 0.0000 |
| distance-weighted-front | artifact-density | local-verify | 0.4896 | 0.4896 | 0.0000 |
| distance-weighted-front | far-objective | confidence-threshold | 0.6042 | 0.6042 | 0.0000 |
| distance-weighted-front | far-objective | local-verify | 0.6042 | 0.5938 | 0.0104 |

## Assessment

- The combined response scored 0.6050 versus 0.5573 for the best pooled static control (`hold-pass`), a delta of 0.0477.
- The worst coupling x aim x doctrine gap was -0.0365; the worst disjoint pressure x doctrine gap was -0.0938.
- Every coupling exercised hold, peel, and Chaff on both training and untouched holdout worlds.
- The combined policy passed every pooled coupling/aim test. Its only failed gate was extreme-soundness extrapolation: it held too rarely at binary and distance 0.95 and fired Chaff too rarely at global 0.25.
- The selected hold threshold was zero in every coupling, so the six-artifact snapshot produced hold only when no artifact was below 0.50 confidence. A full-envelope replication is required to determine whether this rule family can cover both extremes or whether sequential public calibration is necessary.
- The adaptive branch function did not receive soundness rate, pressure ID, aim mode, latent truth, focal seat, or split.
- Promotion status applies only to this combined response under the frozen matrix.

## Boundary

This failed holdout does not nominate the selected thresholds for final replication. It supports the three-response action topology inside pooled coupling/aim strata, while leaving full-envelope single-snapshot feasibility unresolved. It does not authorize full model promotion, new shells, reloads, cooldowns, or counter-battery.
