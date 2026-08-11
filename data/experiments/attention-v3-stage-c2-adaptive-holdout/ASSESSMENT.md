# Attention v3 Stage-C2 adaptive holdout

Conformance: **PASS**  
Holdout promotion: **FAIL**  
Selected policy: `adaptive-risk-6`  
Plan: `attention-v3-stage-c2-2ec219830f0af361`  
Plan hash: `sha256:2ec219830f0af36105db90566756d73d3f80028d3c2d7db3f33b857d13c7f302`  
Report hash: `sha256:93d5e5c3caa2411e3e9c30570d44cbc9d88af6d866d7cd09eab9643879ac50ea`  
Parent Stage-C1 report: `sha256:b6af622b1c9e312be0861f4ffd3513c2f5ad64d52f9b9c16ea814c6f2224e268`

Training executed 512 worlds / 4,096 matches across all five thresholds and three static controls. The frozen selector chose threshold 6 before the untouched 256-world / 1,024-match holdout was executed.

## Conformance gates

- PASS: exactTrainCount
- PASS: exactHoldoutCount
- PASS: deterministicSentinels
- PASS: commonStreamBlocks
- PASS: zeroPlanRejections
- PASS: zeroArtilleryRejections
- PASS: fixedHandsNoReload
- PASS: confidenceDoctrineHolds
- PASS: selectedBothBranchesTrain
- PASS: selectedBothBranchesHoldout

## Holdout promotion gates

- PASS: pooledAtLeastBestStatic
- FAIL: pressureDoctrineWithinTolerance
- PASS: bothSeatsWithinTolerance

## Training threshold selection

| Rank | Threshold | Minimum pressure score | Pooled local-verify score | Chaff rate | Peel rate |
|---:|---:|---:|---:|---:|---:|
| 1 | 6 | 0.5469 | 0.5566 | 57.4% | 42.6% |
| 2 | 7 | 0.5313 | 0.6035 | 24.6% | 75.4% |
| 3 | 8 | 0.4844 | 0.6113 | 6.6% | 93.4% |
| 4 | 5 | 0.4609 | 0.5234 | 84.0% | 16.0% |
| 5 | 4 | 0.4453 | 0.5039 | 97.7% | 2.3% |

## Untouched holdout

| Policy | Score | Progress | Drift | Chaff rate | Movement | Support Scans |
|---|---:|---:|---:|---:|---:|---:|
| hold-pass | 0.5332 | 10.879 | 4.023 | 0.0% | 0.000 | 0.000 |
| scout-peel-support | 0.5996 | 9.488 | 3.242 | 0.0% | 1.000 | 6.027 |
| always-chaff | 0.5039 | 8.316 | 3.113 | 100.0% | 0.000 | 0.000 |
| adaptive-risk-6 | 0.6563 | 10.195 | 3.258 | 27.0% | 0.230 | 1.313 |

## Holdout pressure × doctrine gaps

| Pressure | Doctrine | Adaptive score | Best static | Gap |
|---|---|---:|---:|---:|
| binary-sound-70 | confidence-threshold | 0.7500 | 0.7500 | 0.0000 |
| binary-sound-70 | local-verify | 0.6250 | 0.7344 | -0.1094 |
| global-sound-45 | confidence-threshold | 0.7500 | 0.7500 | 0.0000 |
| global-sound-45 | local-verify | 0.5000 | 0.5313 | -0.0313 |
| distance-sound-55 | confidence-threshold | 0.7344 | 0.7344 | 0.0000 |
| distance-sound-55 | local-verify | 0.4531 | 0.4375 | 0.0156 |
| distance-sound-80 | confidence-threshold | 0.7813 | 0.7813 | 0.0000 |
| distance-sound-80 | local-verify | 0.6563 | 0.8125 | -0.1563 |

## Local-verification branch behavior

| Pressure | Mean public risk | Chaff branch | Peel branch | Best static response | Adaptive gap |
|---|---:|---:|---:|---|---:|
| binary-sound-70 | 5.438 | 46.9% | 53.1% | scout-peel-support | -0.1094 |
| global-sound-45 | 6.250 | 65.6% | 34.4% | always-chaff | -0.0313 |
| distance-sound-55 | 6.063 | 65.6% | 34.4% | scout-peel-support | 0.0156 |
| distance-sound-80 | 5.156 | 37.5% | 62.5% | scout-peel-support | -0.1563 |

## Assessment

- Threshold 6 was selected by the predeclared maximin rule with minimum training pressure score 0.5469, pooled local-verification score 0.5566, and 57.4% Chaff activation.
- On holdout, the adaptive score was 0.6563 versus 0.5996 for the best pooled static control (`scout-peel-support`), a delta of 0.0566.
- The worst pressure × doctrine gap to that cell's best static control was -0.1563; the worst seat gap was 0.0469.
- Binary 0.70 and distance-weighted 0.80 both favored Scout peel + Support Scan, yet threshold 6 still selected Chaff in substantial fractions of those worlds. At the round-one response point, public drift and overload are invariants (0 and 3), so this risk rule reduces exactly to a low-confidence-count threshold.
- The next candidate should keep the doctrine-first branch and test public spatial confidence geometry, such as low-confidence exposure inside the threatened zone. It must use fresh seeds and another frozen train/holdout boundary; pressure labels remain forbidden inputs.
- Promotion status applies only to this policy candidate. A failure does not invalidate spatial spawning, Support Scan, Flare, or Chaff.

## Boundary

This holdout may nominate one doctrine-aware response for a larger bounded audit. It does not authorize model promotion, new shells, reloads, cooldowns, or counter-battery.
