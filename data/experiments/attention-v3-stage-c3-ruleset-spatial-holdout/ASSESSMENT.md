# Attention v3 Stage-C3 ruleset-aware spatial holdout

Conformance: **PASS**  
Holdout promotion: **PASS**  
Selected policy: `ruleset-spatial-low-total-ge-4`  
Plan: `attention-v3-stage-c3-0b316976b0976c46`  
Plan hash: `sha256:0b316976b0976c46c51a9a4c34711a54b19f31698d2c70ae767d4aab6d1139b1`  
Report hash: `sha256:8b92063ddeabada20beb3fc07ad57ebcdba90ad3684f1ea01361c97aa3217174`  
Parent Stage-C2 report: `sha256:93d5e5c3caa2411e3e9c30570d44cbc9d88af6d866d7cd09eab9643879ac50ea`

Training executed 1,024 worlds / 3,072 matches. It evaluated 25,600 frozen candidate-world decisions by exact common-world static lookup, selected `low-total-ge-4`, and only then executed 512 untouched worlds / 2,048 actual holdout matches.

## Conformance gates

- PASS: exactTrainCount
- PASS: exactCandidateEvaluationCount
- PASS: exactHoldoutCount
- PASS: deterministicSentinels
- PASS: commonStreamBlocks
- PASS: zeroPlanRejections
- PASS: zeroArtilleryRejections
- PASS: fixedHandsNoReload
- PASS: publicFeatureParity
- PASS: selectorReproduces
- PASS: policyMappingExact
- PASS: actualBranchMetricParity
- PASS: selectedBothDistanceBranchesTrain
- PASS: selectedBothDistanceBranchesHoldout

## Holdout promotion gates

- PASS: pooledAtLeastBestStatic
- PASS: pressureDoctrineWithinTolerance
- PASS: bothSeatsWithinTolerance
- PASS: distanceLocalWithinTolerance

## Training candidate frontier (top 10)

| Rank | Distance rule | Minimum pressure | Pooled local | Minimum distance | Distance Chaff |
|---:|---|---:|---:|---:|---:|
| 1 | low-total-ge-4 | 0.5625 | 0.6367 | 0.5625 | 18.0% |
| 2 | low-objective-ge-2 | 0.5547 | 0.6182 | 0.5547 | 68.0% |
| 3 | low-total-ge-3 | 0.5508 | 0.6348 | 0.5508 | 44.1% |
| 4 | low-objective-ge-4 | 0.5469 | 0.6367 | 0.5469 | 11.7% |
| 5 | low-objective-ge-3 | 0.5430 | 0.6348 | 0.5430 | 34.0% |
| 6 | objective-deficit-ge-0p4 | 0.5430 | 0.6260 | 0.5430 | 42.6% |
| 7 | low-total-ge-2 | 0.5391 | 0.6064 | 0.5391 | 76.6% |
| 8 | low-scout-ge-2 | 0.5352 | 0.6211 | 0.5352 | 42.2% |
| 9 | objective-deficit-ge-0p2 | 0.5273 | 0.6016 | 0.5273 | 73.0% |
| 10 | low-objective-ge-6 | 0.5234 | 0.6387 | 0.5234 | 0.0% |

## Untouched holdout

| Policy | Score | Progress | Drift | Chaff rate | Support Scans |
|---|---:|---:|---:|---:|---:|
| hold-pass | 0.4941 | 10.787 | 4.080 | 0.0% | 0.000 |
| scout-peel-support | 0.5693 | 9.553 | 3.230 | 0.0% | 6.102 |
| always-chaff | 0.4639 | 8.568 | 3.119 | 100.0% | 0.000 |
| ruleset-spatial-low-total-ge-4 | 0.6523 | 10.395 | 3.080 | 17.6% | 2.002 |

## Holdout pressure x doctrine gaps

| Pressure | Doctrine | Adaptive score | Best static | Gap |
|---|---|---:|---:|---:|
| binary-sound-70 | confidence-threshold | 0.5391 | 0.5391 | 0.0000 |
| binary-sound-70 | local-verify | 0.7188 | 0.7188 | 0.0000 |
| global-sound-45 | confidence-threshold | 0.6719 | 0.6719 | 0.0000 |
| global-sound-45 | local-verify | 0.4531 | 0.4531 | 0.0000 |
| distance-sound-55 | confidence-threshold | 0.7344 | 0.7344 | 0.0000 |
| distance-sound-55 | local-verify | 0.5547 | 0.5703 | -0.0156 |
| distance-sound-80 | confidence-threshold | 0.7578 | 0.7578 | 0.0000 |
| distance-sound-80 | local-verify | 0.7891 | 0.8125 | -0.0234 |

## Local-verification branch behavior

| Pressure | Public objective coupling | Chaff | Scout peel + Support |
|---|---|---:|---:|
| binary-sound-70 | binary-front | 0.0% | 100.0% |
| global-sound-45 | global | 100.0% | 0.0% |
| distance-sound-55 | distance-weighted-front | 32.8% | 67.2% |
| distance-sound-80 | distance-weighted-front | 7.8% | 92.2% |

## Assessment

- The frozen selector chose `low-total-ge-4` with minimum training pressure score 0.5625, pooled local-verification score 0.6367, and minimum distance score 0.5625.
- On holdout, the adaptive score was 0.6523 versus 0.5693 for the best pooled static control (`scout-peel-support`), a delta of 0.0830.
- The worst pressure x doctrine gap was -0.0234; the worst seat gap was 0.0703.
- The richer objective-geometry features did not win the frozen selector. Once public objective coupling separated the scoring regimes, low-confidence count at least 4 was sufficient for the remaining distance-weighted decision.
- Versus the best pooled static response, the candidate retained 0.842 more progress and finished with 0.150 less drift on average.
- Public objective coupling is a scenario rule, not an experiment pressure label. The adaptive branch function never receives soundness rate, latent truth, focal seat, or split membership.
- Passing these gates nominates this response policy for a larger bounded audit. It does not yet promote the model or authorize additional artillery mechanics.

## Boundary

This result can nominate one ruleset-aware response for a larger bounded audit. It does not authorize model promotion, new shells, reloads, cooldowns, or counter-battery.
