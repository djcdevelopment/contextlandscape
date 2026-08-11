# Attention v3 Stage-C6 full-envelope three-response replication

Conformance: **PASS**  
Replication feasibility: **FAIL**  
Selected policy: `three-response-c731b21f22de`  
Plan: `attention-v3-stage-c6-9974d7647277eb9c`  
Plan hash: `sha256:9974d7647277eb9c303e7c9a416d3da6556d13e56c14796d688320b150d5b6e9`  
Report hash: `sha256:7ed9423b524cacb5567851d7a8376ad0fc0c1da652c0e60c800cdb925af0830c`  
Parent Stage-C5 report: `sha256:f1c12e3a12930dea0f32a40946305146ac1267d04bb860a9bcef361cdf477081`

Training executed 1,152 worlds / 3,456 matches and 19,584 exact candidate-world lookups across the complete soundness envelope. The selected combined policy then ran on 1,152 fresh-seed replication worlds / 4,608 actual matches over the same envelope.

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

## Replication gates

- FAIL: pooledAtLeastBestStatic
- FAIL: couplingAimDoctrineWithinTolerance
- FAIL: pressureDoctrineWithinTolerance
- PASS: bothSeatsWithinTolerance
- PASS: everyAimWithinTolerance
- FAIL: couplingLocalWithinTolerance

## Selected training rules

| Coupling | Rule | Minimum pressure | Minimum aim | Pooled | Hold | Peel | Chaff |
|---|---|---:|---:|---:|---:|---:|---:|
| binary-front | hold-le-0-chaff-ge-2 | 0.4583 | 0.5273 | 0.5352 | 3.9% | 13.3% | 82.8% |
| global | hold-le-0-chaff-ge-4 | 0.4583 | 0.5898 | 0.6393 | 4.4% | 70.1% | 25.5% |
| distance-weighted-front | hold-le-0-chaff-ge-2 | 0.4063 | 0.4766 | 0.5286 | 4.9% | 13.8% | 81.3% |

## Fresh-seed replication

| Policy | Score | Progress | Drift | Hold | Peel | Chaff |
|---|---:|---:|---:|---:|---:|---:|
| hold-pass | 0.4063 | 10.753 | 5.096 | 100.0% | 0.0% | 0.0% |
| scout-peel-support | 0.5447 | 10.639 | 3.924 | 0.0% | 100.0% | 0.0% |
| always-chaff | 0.4727 | 10.212 | 4.385 | 0.0% | 0.0% | 100.0% |
| three-response-c731b21f22de | 0.5109 | 10.463 | 4.181 | 4.2% | 32.6% | 63.2% |

## Local-verification branch mix

| Coupling | Hold | Peel + Support | Chaff |
|---|---:|---:|---:|
| binary-front | 4.7% | 13.8% | 81.5% |
| global | 3.9% | 67.4% | 28.6% |
| distance-weighted-front | 3.9% | 16.7% | 79.4% |

## Hostile aim robustness

| Aim | Adaptive | Best static | Gap | Beyond Chaff center |
|---|---:|---:|---:|---:|
| cluster-center | 0.5612 | 0.5612 | 0.0000 | 0.0% |
| artifact-density | 0.4674 | 0.5313 | -0.0638 | 40.9% |
| far-objective | 0.5039 | 0.5417 | -0.0378 | 66.9% |

## Full-envelope pressure x doctrine

| Pressure | Doctrine | Adaptive | Best static | Gap |
|---|---|---:|---:|---:|
| binary-sound-25 | local-verify | 0.4896 | 0.4896 | 0.0000 |
| binary-sound-35 | local-verify | 0.4688 | 0.5313 | -0.0625 |
| binary-sound-45 | local-verify | 0.4271 | 0.4375 | -0.0104 |
| binary-sound-55 | local-verify | 0.5104 | 0.6146 | -0.1042 |
| binary-sound-65 | local-verify | 0.4896 | 0.5729 | -0.0833 |
| binary-sound-75 | local-verify | 0.4375 | 0.5313 | -0.0938 |
| binary-sound-85 | local-verify | 0.6354 | 0.7083 | -0.0729 |
| binary-sound-95 | local-verify | 0.4479 | 0.5417 | -0.0937 |
| global-sound-25 | local-verify | 0.3125 | 0.4271 | -0.1146 |
| global-sound-35 | local-verify | 0.4063 | 0.5208 | -0.1146 |
| global-sound-45 | local-verify | 0.3542 | 0.3333 | 0.0208 |
| global-sound-55 | local-verify | 0.5417 | 0.5625 | -0.0208 |
| global-sound-65 | local-verify | 0.6563 | 0.7083 | -0.0521 |
| global-sound-75 | local-verify | 0.6667 | 0.7500 | -0.0833 |
| global-sound-85 | local-verify | 0.7292 | 0.7708 | -0.0417 |
| global-sound-95 | local-verify | 0.7917 | 0.7917 | 0.0000 |
| distance-sound-25 | local-verify | 0.3750 | 0.4167 | -0.0417 |
| distance-sound-35 | local-verify | 0.4375 | 0.4375 | 0.0000 |
| distance-sound-45 | local-verify | 0.5104 | 0.5625 | -0.0521 |
| distance-sound-55 | local-verify | 0.3333 | 0.5625 | -0.2292 |
| distance-sound-65 | local-verify | 0.4063 | 0.5938 | -0.1875 |
| distance-sound-75 | local-verify | 0.6563 | 0.6458 | 0.0104 |
| distance-sound-85 | local-verify | 0.6146 | 0.7292 | -0.1146 |
| distance-sound-95 | local-verify | 0.5625 | 0.6667 | -0.1042 |

## Coupling x aim x doctrine

| Coupling | Aim | Doctrine | Adaptive | Best static | Gap |
|---|---|---|---:|---:|---:|
| binary-front | cluster-center | local-verify | 0.5547 | 0.5273 | 0.0273 |
| binary-front | artifact-density | local-verify | 0.3945 | 0.4883 | -0.0938 |
| binary-front | far-objective | local-verify | 0.5156 | 0.5078 | 0.0078 |
| global | cluster-center | local-verify | 0.5977 | 0.6016 | -0.0039 |
| global | artifact-density | local-verify | 0.5430 | 0.5820 | -0.0391 |
| global | far-objective | local-verify | 0.5313 | 0.5664 | -0.0352 |
| distance-weighted-front | cluster-center | local-verify | 0.5313 | 0.5703 | -0.0391 |
| distance-weighted-front | artifact-density | local-verify | 0.4648 | 0.5234 | -0.0586 |
| distance-weighted-front | far-objective | local-verify | 0.4648 | 0.5508 | -0.0859 |

## Assessment

- The combined response scored 0.5109 versus 0.5447 for the best pooled static control (`scout-peel-support`), a delta of -0.0339.
- The worst coupling x aim x doctrine gap was -0.0938; the worst full-envelope pressure x doctrine gap was -0.2292.
- Every coupling exercised hold, peel, and Chaff on both training and fresh-seed replication worlds.
- The frozen feasibility gates did not all pass; detailed interpretation is intentionally deferred until the evidence-review pass.
- The adaptive branch function did not receive soundness rate, pressure ID, aim mode, latent truth, focal seat, or split.
- Promotion status applies only to this combined response under the frozen matrix.

## Boundary

This run decides only full-envelope feasibility for the frozen single-round, public low-count threshold family. It does not authorize full model promotion, new shells, reloads, cooldowns, or counter-battery.
