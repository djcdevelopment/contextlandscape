# Attention-economy v4.2 exact fleet matrix

Status: complete and integrity-clean. This study isolates the five fleet pairings under equal policy-mapping weight while keeping rules and controllers frozen. It is descriptive, not causal.

## Study contract

- Fifteen cells: ten cross-fleet cells and five same-fleet controls.
- Every cell contains exactly 2,560 unique policy-pair edges and 40,960 physical matches.
- Every edge is evaluated in two independent pair-keyed worlds, both seats, and all four pressure samples.
- Total: 38,400 edges, 614,400 matches, and 1,228,800 participant appearances.
- Every one of the 3,200 compiled profiles appears exactly 384 times.
- The graph is degree 24. It has zero edge overlap with the earlier degree-32 report and 1,061 edges of overlap with the new degree-88 graph.
- Runtime: 3,443.5 seconds with 24 workers (57m 23.5s).
- Report hash: `sha256:40819c044fb989e9481fca9543ac4fb950579fc59ab78100e356a38940587b4e`.

All replay, stream, attribution, command-rejection, and world-stream-collision counters are zero.

## Cross-fleet result

Each value is the row fleet's score rate against the column fleet. Same-fleet cells are omitted because “left” and “right” are arbitrary fixed policy orientations inside one composition; their label-specific score is not a fleet balance statistic.

| Fleet | H3S | 3 Line | HLS | L4S | 2L2S | Mean vs other fleets |
|---|---:|---:|---:|---:|---:|---:|
| Heavy-Three-Scout (H3S) | — | 62.35% | 61.85% | 72.57% | 82.37% | 69.79% |
| Three Line | 37.65% | — | 48.50% | 72.82% | 87.64% | 61.65% |
| Heavy-Line-Scout (HLS) | 38.15% | 51.50% | — | 65.02% | 77.83% | 58.12% |
| Line-Four-Scout (L4S) | 27.43% | 27.18% | 34.98% | — | 63.18% | 38.19% |
| Two-Line-Two-Scout (2L2S) | 17.63% | 12.36% | 22.17% | 36.82% | — | 22.24% |

The exact matrix removes an ambiguity left by marginal fleet averages:

- Heavy-Three-Scout beats all four other fleets. Its closest cell is Heavy-Line-Scout at 61.85%.
- Heavy-Line-Scout narrowly beats Three Line, 51.50% to 48.50%. Those two occupy the middle competitive band despite Three Line's higher global marginal score.
- Line-Four-Scout beats only Two-Line-Two-Scout.
- Two-Line-Two-Scout loses every cross-fleet cell, including 36.82% against its closest opponent.

This is a tiered rather than rock-paper-scissors fleet matrix. Counter-cycles seen in the full profile graph arise from policy interactions within fleets; fleet composition by itself does not form a five-way cycle.

## Mechanism

The equally weighted matrix reproduces the same aggregate mechanism seen in the degree-88 graph:

| Fleet | Marginal score | Mean Drift | Progress | Artifacts | Batteries | Detonations |
|---|---:|---:|---:|---:|---:|---:|
| Heavy-Three-Scout | 63.19% | 2.87 | 0.463 | 7.38 | 0.400 | 1.372 |
| Three Line | 57.77% | 3.82 | 0.526 | 20.82 | 0.071 | 1.763 |
| Heavy-Line-Scout | 55.42% | 3.33 | 0.419 | 11.54 | 0.142 | 1.587 |
| Line-Four-Scout | 42.13% | 3.79 | 0.467 | 8.13 | 0.277 | 1.836 |
| Two-Line-Two-Scout | 31.50% | 4.80 | 0.362 | 12.84 | 0.123 | 2.340 |

The cross-cell details make the Drift relationship concrete. Against Heavy-Three-Scout, Two-Line-Two-Scout averages 5.27 Drift and 2.56 detonations while H3S averages 2.06 Drift and 0.99 detonations. Against Three Line, 2L2S averages 5.66 Drift and 2.76 detonations while Three Line averages 1.58 Drift and 0.70 detonations.

Progress does not rescue the lower fleets. Across all 614,400 matches, no one reaches a 12-Progress terminal. Only 30 of 1,228,800 participant-runs reach 8 Progress and one reaches 10. Drift is involved in 99.944% of terminal states; the remaining 345 matches reach the round limit.

## Stability and scope

World-to-world profile scores correlate at 0.981 Pearson and 0.980 Spearman. Mean absolute profile difference is 3.01 points, the 95th percentile is 7.55 points, and 77 of the top 100 profiles overlap. This is weaker than the degree-88 graph because each profile has only 192 appearances per world, but it is strong agreement for the fleet/module structure.

Profile scores correlate at 0.967 Pearson and 0.966 Spearman between this matrix and the degree-88 study; 73 of their top 100 profiles overlap. Composition and triage orderings are nearly identical across both samples.

Individual edge/pressure results remain noisy: the two worlds agree on direction 58.27% of the time, with a 23.35-point mean absolute edge score difference. Cross-fleet cells average thousands of edges and are much more stable than any particular pairing.

The study does not estimate human fleet balance. It describes deterministic controllers that always Emit from Line and Heavy, rarely approach the Progress objective, and use a finite policy catalog. Same-fleet cell orientation must not be read as a first-seat effect or as one copy of a fleet beating itself; both seats were already evaluated for every edge.

## Decision

The matrix supports the existing stop decision but identifies two explicit watch items:

- Heavy-Three-Scout is the clear fleet leader, not merely the beneficiary of a favorable sparse schedule.
- Two-Line-Two-Scout is the clear fleet trailer, not merely the victim of a few bad opponents.

Those gaps are worth observing in human play, but this run does not justify another immediate rules change. The much larger systemic concern is that Drift Detonation almost completely determines terminal play while Progress is absent.
