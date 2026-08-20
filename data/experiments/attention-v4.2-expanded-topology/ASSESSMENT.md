# Attention-economy v4.2 expanded topology

Status: complete and integrity-clean. This is descriptive exploration of the five-fleet v4.2 landscape. It is not a causal estimate against v4.1 or an isolated estimate of the fleet-cap effect.

## Study contract

- Ruleset: `attention-economy-v4.2` under the retained external model ID `duel-capacity-v3-experimental`.
- Catalog: all 3,200 compiled commander profiles across the five exact weight-6 fleets satisfying at most one Heavy and at most four Scouts.
- Degree-32 graph: 51,200 fixed non-self pairs at 16 offsets, plus 3,200 self-play pairs.
- Evaluation: both seats for every non-self pair and all four pressure samples.
- Total: 422,400 physical matches, 204,800 exact seat reversals, and 844,800 participant appearances. Every profile appears exactly 264 times.
- Reproducibility: 425 full replay sentinels plus RNG-stream and compiled-commander attribution checks.
- Runtime: 2,447.3 seconds with 24 workers.
- Report hash: `sha256:dc4e7de402399d4395df203cfc435347185010d9aa1f5d599629af8c284662b6`.

Replay, stream, attribution, and command-rejection mismatch counts are all zero.

## Main result

Removing Two Heavy and Six Scout prevents those extremes from entering the catalog and narrows the remaining observed fleet landscape, but it does not make the balanced Heavy-Line-Scout fleet the marginal leader.

| Fleet | Score | Mean Drift | Artifacts | Unverified backlog / round | Batteries | Detonations |
|---|---:|---:|---:|---:|---:|---:|
| heavy-three-scout | 61.68% | 2.94 | 7.55 | 3.14 | 0.417 | 1.407 |
| three-line | 55.91% | 4.08 | 21.18 | 11.50 | 0.073 | 1.898 |
| heavy-line-scout | 54.45% | 3.45 | 11.71 | 6.06 | 0.148 | 1.645 |
| line-four-scout | 44.18% | 3.76 | 8.15 | 4.37 | 0.278 | 1.819 |
| two-line-two-scout | 33.77% | 4.79 | 12.83 | 7.95 | 0.123 | 2.334 |

The fleet span is 27.91 percentage points, down from 31.24 points in the v4.2 four-offset baseline and 44.25 points across all seven fleets in the historical v4.1 expanded graph. Heavy-Three-Scout leads Heavy-Line-Scout by 7.23 points. Two-Line-Two-Scout trails it by 20.68 points.

The five-fleet ordering is identical in the baseline and expanded samples. Expanded fleet rates move by at most 2.04 points from baseline. At the individual-profile level, baseline and expanded scores have Pearson correlation 0.902 and Spearman rank correlation 0.892. The exact top ten are unstable, with one profile shared, but 55 of the top 100 are shared. The baseline is directionally useful; the expanded graph is the better ranking evidence.

## Counterplay topology

The marginal hierarchy does not imply a nearly acyclic strategy graph.

- At the 55% threshold, 43,439 of 51,200 non-self edges are directional and 7,761 are neutral.
- The largest strongly connected component contains 3,120 of 3,200 profiles, or 97.5%.
- The four-offset baseline connected only 229 profiles, or 7.16%, in its largest component.
- The expanded score distribution remains wide: the 5th, 50th, and 95th percentiles are 24.62%, 50.76%, and 76.70%.
- Effective strategy count at temperature 0.03 is 159.3, about 5.0% of the catalog, so broad graph-level counterplay coexists with a concentrated high-performance region.

The graph therefore looks less like five isolated power tiers than the fleet averages suggest. Most profiles participate in cycles once opponent coverage is broad enough, and strong Heavy-Line-Scout profiles appear among the overall leaders despite that fleet's third-place marginal mean.

## Mechanism picture

Scout condensation continues to throttle quantity while promoting Battery-grade output:

- 86.07% of Scout plans reached Condense 2, 4.44% reached Condense 1, and 9.49% stayed at Condense 0.
- Scouts emitted on 30.21% of their output decisions and explicitly held on 69.79%.
- Scouts generated 1.889 million artifacts, Lines 7.355 million, and Heavies 1.134 million.
- Scout artifacts activated Batteries at 5.53% per artifact and detonated at 37.63% per artifact. Line artifacts activated Batteries at 0.60% and detonated at 10.08%; Heavy artifacts activated Batteries at 2.38% and detonated at 7.58%.
- Lines account for 72.56% of observed unverified backlog. The compiled policy never holds Line or Heavy output, so this remains partly a controller-policy result.

Heavy-Three-Scout combines the lowest artifact load, lowest mean Drift, highest Battery activation rate, and controlled backlog. That defensive package is the clearest explanation for its fleet-level lead. Three Line produces the most Progress and the largest backlog; its longer Context Limit lets it place second despite higher Drift. Two-Line-Two-Scout combines substantial Line volume with short-lived Scout artifacts and has the highest detonation rate.

## Policy and match shape

- Triage is a large axis: `risk-adaptive` scores 62.75% and `seize-cheapest` 60.06%, while `verify-lowest` and `siege-seize` score 40.57% and 40.24%.
- Capacity separates into a 54.44%-55.00% pioneer/adaptive group and a 45.06%-45.54% follower/never group.
- Movement is compressed except for `escort`: the other policies score 49.76%-51.33%, while `escort` scores 46.35%.
- Alpha's aggregate score is 49.36%. Mean focal Alpha-seat effect is -1.50 points, but mean absolute reversal effect remains 39.16 points; individual matchup seat sensitivity is still large.
- 294,309 matches (69.68%) ended in a one-sided Drift terminal, 127,244 (30.12%) ended with both players terminal in the same atomic Resolution, and 847 (0.20%) reached the round limit.
- No match ended through the 12-Progress objective. Mean duration is 3.082 rounds; a participant averages 0.452 Progress and 3.805 Drift.
- No active Range Shift executed. This remains a controller coverage gap, not evidence that range is strategically inert.

## Balance read

The cap does what was requested: Two Heavy and Six Scout no longer exist as legal fleets, and the surviving fleet spread is materially smaller than the old seven-fleet landscape. The new landscape is not flat:

1. Heavy-Three-Scout remains the strongest marginal fleet, apparently through low Drift exposure and efficient Battery production.
2. Heavy-Line-Scout is viable at 54.45%, and its best policies reach the global top tier, but its average is not the optimum.
3. Two-Line-Two-Scout is the clearest remaining structural weakness; Line backlog plus Scout Context-Limit exposure produces the highest detonation load.
4. The game is still overwhelmingly a Drift-survival contest. The Progress objective is not shaping terminal outcomes under these controllers.

If another tuning pass is desired, the evidence points more specifically at Heavy-Three-Scout's defensive efficiency and multi-Line output restraint than at Scout artifact volume in general. Any such change should be tested as a new paired intervention; this run describes topology rather than causality.
