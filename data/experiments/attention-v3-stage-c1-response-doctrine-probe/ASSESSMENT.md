# Attention v3 Stage-C1 response-doctrine probe

Status: **PASS**  
Plan: `attention-v3-stage-c1-7b26766ed292281c`  
Plan hash: `sha256:7b26766ed292281c3673000d3d57bee135dda27b0edacf02110c445d8dd7bd26`  
Report hash: `sha256:b6af622b1c9e312be0861f4ffd3513c2f5ad64d52f9b9c16ea814c6f2224e268`  
Parent Stage-C report: `sha256:869099e6a2539111f6d996fadbff3080b6c62b0d6dcfdeff879419015e67b9e5`

The campaign completed 768 common worlds × 7 response arms = 5,376 matches, plus 56 exact replay sentinels. Every block held the hostile Flare, seat, seed, pressure, command doctrine, opponent, and random stream fixed.

## Gates

- PASS: exactRunCount
- PASS: deterministicSentinels
- PASS: commonStreamBlocks
- PASS: zeroPlanRejections
- PASS: zeroArtilleryRejections
- PASS: fixedHandsNoReload
- PASS: causalCountersPresent
- PASS: fullEvacuationMovesAndEscapes
- PASS: scoutPeelIsSelective
- PASS: peelSupportExecutes
- PASS: compressionContractsDistance
- PASS: riskChaffIsConditional
- PASS: everyRiskChaffBlocks
- PASS: alwaysChaffBlocks

## Policy outcomes

| Policy | Score | Δ score | Progress | Δ progress | Drift | Δ drift | Flare affected | Move | Scans | Chaff rate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| hold-pass | 0.5176 | 0.0000 | 10.962 | 0.000 | 4.147 | 0.000 | 22.75 | 0.00 | 0.00 | 0.0% |
| full-evacuate | 0.3574 | -0.1602 | 7.618 | -3.344 | 3.512 | -0.635 | 0.00 | 3.00 | 0.00 | 0.0% |
| scout-peel | 0.4701 | -0.0475 | 9.464 | -1.499 | 3.852 | -0.296 | 11.77 | 1.00 | 0.00 | 0.0% |
| scout-peel-support | 0.5833 | 0.0658 | 9.650 | -1.313 | 3.172 | -0.975 | 11.86 | 1.00 | 6.11 | 0.0% |
| compress-support | 0.4303 | -0.0872 | 9.168 | -1.794 | 4.229 | 0.082 | 22.81 | 0.00 | 4.24 | 0.0% |
| always-chaff | 0.4961 | -0.0215 | 8.685 | -2.277 | 3.068 | -1.079 | 0.00 | 0.00 | 0.00 | 100.0% |
| risk-chaff | 0.4889 | -0.0286 | 9.143 | -1.819 | 3.280 | -0.867 | 4.44 | 0.00 | 0.00 | 81.0% |

## Best observed score by pressure

| Pressure | Best policy | Score | Runner-up | Margin |
|---|---|---:|---|---:|
| binary-sound-70 | scout-peel-support | 0.6198 | always-chaff | 0.1302 |
| global-sound-45 | always-chaff | 0.5495 | risk-chaff | 0.0365 |
| distance-sound-55 | scout-peel-support | 0.5625 | always-chaff | 0.0391 |
| distance-sound-80 | hold-pass | 0.6771 | scout-peel-support | 0.0208 |

## Doctrine interaction

| Doctrine | Policy | Score | Delta score | Delta progress | Delta drift |
|---|---|---:|---:|---:|---:|
| confidence-threshold | hold-pass | 0.7435 | 0.0000 | 0.000 | 0.000 |
| confidence-threshold | scout-peel-support | 0.5977 | -0.1458 | -1.685 | 0.021 |
| confidence-threshold | always-chaff | 0.5104 | -0.2331 | -2.727 | -0.654 |
| confidence-threshold | risk-chaff | 0.5430 | -0.2005 | -2.286 | -0.549 |
| local-verify | hold-pass | 0.2917 | 0.0000 | 0.000 | 0.000 |
| local-verify | scout-peel-support | 0.5690 | 0.2773 | -0.940 | -1.971 |
| local-verify | always-chaff | 0.4818 | 0.1901 | -1.828 | -1.505 |
| local-verify | risk-chaff | 0.4349 | 0.1432 | -1.352 | -1.185 |

## Best observed score by pressure and doctrine

| Pressure | Doctrine | Best policy | Score | Runner-up | Margin |
|---|---|---|---:|---|---:|
| binary-sound-70 | confidence-threshold | hold-pass | 0.6667 | scout-peel-support | 0.1406 |
| binary-sound-70 | local-verify | scout-peel-support | 0.7135 | always-chaff | 0.2344 |
| global-sound-45 | confidence-threshold | hold-pass | 0.7500 | scout-peel-support | 0.1146 |
| global-sound-45 | local-verify | always-chaff | 0.5417 | risk-chaff | 0.0625 |
| distance-sound-55 | confidence-threshold | hold-pass | 0.7552 | scout-peel-support | 0.1302 |
| distance-sound-55 | local-verify | always-chaff | 0.5208 | scout-peel-support | 0.0208 |
| distance-sound-80 | confidence-threshold | hold-pass | 0.8021 | scout-peel-support | 0.1979 |
| distance-sound-80 | local-verify | scout-peel-support | 0.7083 | compress-support | 0.1458 |

## Deductions

- Scout peel versus full evacuation changed score by 0.1126, progress by 1.845, and drift by 0.340. This isolates the value of moving only the noisy, high-throughput unit.
- Adding Support Scan to Scout peel changed score by 0.1133, progress by 0.186, drift by -0.680, and produced 1.934 additional scan-mediated verifications.
- Compression + Support shifted mean artifact distance by -0.4236, beyond-reach auto-acceptance by -4.025, score by -0.0872, and drift by 0.082 relative to hold.
- Risk-Chaff fired in 81.0% of worlds. Relative to always-Chaff it changed score by -0.0072, progress by 0.458, and drift by 0.212.
- Doctrine is the dominant interaction: hold led every confidence-threshold pressure, while local verification required either Scout peel + Support Scan or Chaff. The pooled Scout-peel result must not be treated as universal.
- Non-dominated policies over pooled score, progress, and lower drift: `hold-pass`, `scout-peel-support`, `always-chaff`. Pressure-specific rankings remain the safer decision surface than one pooled winner.

## Boundary

This is a response-doctrine experiment over the already validated Stage-B/C mechanics. It does not authorize new shell types, reloads, cooldowns, counter-battery, or v3 promotion. A follow-up should refine only policies that remain competitive across pressure, doctrine, and seat cells.
