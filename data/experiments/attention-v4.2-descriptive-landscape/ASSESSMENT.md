# Attention-economy v4.2 descriptive landscape

Status: complete and integrity-clean. This is a descriptive exploration of the five-fleet ruleset, not a causal estimate against v4.1 or any earlier ruleset.

## Study contract

- Ruleset: `attention-economy-v4.2` under the retained external model ID `duel-capacity-v3-experimental`.
- Catalog: all 3,200 compiled commander profiles across the five exact weight-6 fleets satisfying at most one Heavy and at most four Scouts.
- Sparse graph: 12,800 fixed non-self pairs at offsets 791, 1709, 1, and 2559, plus 3,200 self-play pairs.
- Evaluation: both seats for every non-self pair and all four pressure samples.
- Total: 115,200 physical matches, 51,200 exact seat reversals, and 230,400 participant appearances. Every profile appears exactly 72 times.
- Reproducibility: 125 full replay sentinels plus RNG-stream and compiled-commander attribution checks.
- Runtime: 746.0 seconds with 24 workers.
- Report hash: `sha256:48c68d58671e926ae14a14ef20cd32046166de97f545c1661d4ef9de6d2ec585`.

Replay, stream, attribution, and command-rejection mismatch counts are all zero.

## Fleet landscape

These are marginal rates on the fixed sparse graph, not isolated fleet treatment effects or an exhaustive round robin.

| Fleet | Score | Mean Drift | Artifacts | Unverified backlog / round | Batteries | Detonations |
|---|---:|---:|---:|---:|---:|---:|
| heavy-three-scout | 62.98% | 2.91 | 7.70 | 3.11 | 0.426 | 1.385 |
| three-line | 56.60% | 3.91 | 20.66 | 11.31 | 0.070 | 1.813 |
| heavy-line-scout | 53.66% | 3.54 | 11.89 | 6.13 | 0.153 | 1.688 |
| line-four-scout | 45.02% | 3.74 | 8.22 | 4.32 | 0.282 | 1.808 |
| two-line-two-scout | 31.74% | 4.86 | 12.90 | 7.93 | 0.122 | 2.366 |

Removing two Heavy and six Scout narrows the observed fleet span from 50.58 points in the v4.1 sparse graph to 31.24 points here. It does not create a balanced-fleet optimum: Heavy-Line-Scout is third, Heavy-Three-Scout leads it by 9.31 points, and Two-Line-Two-Scout trails it by 21.93 points.

## Output and hazard picture

The Scout output throttle remains active:

- 85.92% of Scout Kinetic plans reached Condense 2, 4.38% reached Condense 1, and 9.70% stayed at Condense 0.
- Scouts emitted on 29.08% of their output decisions and explicitly held on 70.92%.
- Scouts produced 510,012 artifacts, compared with 2,000,792 from Lines and 316,951 from Heavies.
- Scout artifacts activated Batteries at 5.59% per artifact but detonated at 37.19% per artifact because their Context Limit remains 1.
- Lines account for 72.35% of observed unverified backlog. The compiled policy never holds Line or Heavy output, so this is partly a controller-policy result.

Heavy-Three-Scout combines the smallest fleet artifact load, the lowest mean Drift, the highest Battery rate, and the longest mean survival among the five fleets. Its edge looks defensive: it is surviving the Drift race with controlled Scout output and Battery production, not racing to the 12-Progress objective.

## Match shape and topology

- 80,999 matches (70.31%) ended in a one-sided Drift terminal.
- 33,846 (29.38%) ended with both players terminal in the same atomic Resolution.
- 355 (0.31%) reached the round limit; none ended through the Progress objective.
- Mean duration was 3.118 rounds. A participant averaged 0.461 Progress, 3.792 Drift, 12.273 emitted artifacts, 1.812 detonations, and 0.211 Batteries.
- At the 55% dominance threshold, 10,886 of 12,800 non-self edges are directional. The largest strongly connected component contains 229 profiles (7.16%).
- Alpha's overall score rate is 47.93%. The mean focal Alpha-seat effect across reversals is -5.40 points, while the mean absolute reversal effect is 39.50 points.

The expanded degree-32 topology run is the stronger follow-up for judging whether the apparent fleet hierarchy and small counterplay component are stable to broader opponent coverage.

## Balance read

The fleet caps remove the two known extreme compositions from both construction and simulation, and they materially compress the sampled spread. The remaining landscape still has a pronounced chassis interaction:

1. Heavy-Three-Scout is the current leader, with controlled artifact volume, high Battery conversion, and low Drift exposure.
2. Multi-Line fleets create most of the persistent backlog; Two-Line-Two-Scout is the clearest failure case.
3. Progress victory is effectively absent under these controllers, so observed score is mostly a measure of avoiding Drift collapse.

Those are descriptive targets for the expanded run, not conclusions about causal effects of the cap itself.
