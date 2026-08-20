# Attention-economy v4.1 descriptive landscape

Status: complete and integrity-clean. This is descriptive exploration of the new system, not a causal comparison with v4 or any earlier ruleset.

## Study contract

- Ruleset: `attention-economy-v4.1` under the retained external model ID `duel-capacity-v3-experimental`.
- Catalog: all 4,480 compiled commander profiles across seven exact weight-6 fleets.
- Sparse graph: 17,920 fixed non-self pairs at offsets 791, 1709, 1, and 3199, plus 4,480 self-play pairs.
- Evaluation: both seats for every non-self pair and all four pressure samples.
- Total: 161,280 physical matches, 71,680 exact seat reversals, and 322,560 participant appearances. Every profile appears exactly 72 times.
- Reproducibility: 175 full replay sentinels plus RNG-stream and compiled-commander attribution checks.
- Runtime: 1,031.3 seconds with 12 workers.
- Report hash: `sha256:e273fd60cd3ed85124d4bace03c817d6dc6b4c32cc681400b258f0a9617cc652`.

Replay, stream, attribution, and command-rejection mismatch counts are all zero.

## Main result

The Scout overproduction problem is not present under this compiled controller. The controller spends heavily on Condense and then holds Scouts against backlog:

- 88.51% of Scout Kinetic plans reached Condense 2, 2.39% reached Condense 1, and 9.10% stayed at Condense 0.
- Scouts emitted on 26.08% of their output decisions and explicitly held on 73.92%.
- Scouts produced 840,729 artifacts, versus 2,074,660 from Lines and 838,219 from Heavies.
- Six-Scout fleets produced only 7.00 artifacts per appearance and carried 1.94 unverified artifacts per round, the lowest values of all seven fleets.

That restraint did not make Scouts weak. Six Scouts placed second at a 68.51% observed score rate, only 8.23 percentage points behind two Heavies. The six-Scout fleet also activated 0.692 Batteries per appearance, by far the highest fleet rate.

## Fleet landscape

These are marginal rates on the fixed sparse graph, not isolated fleet treatment effects or an exhaustive round robin.

| Fleet | Score | Mean Drift | Artifacts | Unverified backlog / round | Batteries | Detonations |
|---|---:|---:|---:|---:|---:|---:|
| two-heavy | 76.74% | 1.11 | 10.80 | 3.49 | 0.174 | 0.403 |
| six-scout | 68.51% | 2.62 | 7.00 | 1.94 | 0.692 | 1.237 |
| heavy-three-scout | 53.00% | 3.21 | 8.17 | 3.17 | 0.462 | 1.528 |
| three-line | 47.46% | 4.36 | 21.43 | 11.53 | 0.075 | 2.023 |
| heavy-line-scout | 43.48% | 3.94 | 12.48 | 6.26 | 0.161 | 1.873 |
| line-four-scout | 34.64% | 4.01 | 8.51 | 4.37 | 0.293 | 1.933 |
| two-line-two-scout | 26.16% | 5.02 | 13.07 | 7.98 | 0.122 | 2.446 |

Fleet weight removed the illegal three-Heavy formation, but it did not flatten the landscape. The two one-dimensional extremes occupy the top two positions, while the intended Heavy-Line-Scout reference fleet scores 43.48%. The full fleet span remains 50.58 percentage points.

## Chassis mechanism picture

Condense changed which chassis creates the backlog, but it did not erase the Scout Context-Limit risk.

| Source | Emit share of decisions | Artifacts / Emit | Battery activations / artifact | Detonations / artifact | Share of observed backlog |
|---|---:|---:|---:|---:|---:|
| Scout | 26.08% | 1.254 | 7.34% | 30.36% | 19.71% |
| Line | 100% | 2.021 | 0.61% | 10.87% | 58.28% |
| Heavy | 100% | 1.026 | 2.01% | 5.56% | 22.01% |

Scout artifacts are still individually fragile because Context Limit 1 produces a much higher detonation rate. Output restraint keeps the total under control. At the same time, Condense 2 structurally reaches Battery density/calibration, and Scouts generated 61,679 of the 91,205 Batteries in the run. This combination—many units, aggressive Condense, backlog-aware Hold, and high Battery yield—is the clearest explanation for the strong six-Scout result.

Line output is now the dominant backlog source. It accounts for 58.28% of observed unverified backlog and 2.07 million artifacts. The compiled policy never holds Line or Heavy output, so this is partly a controller-policy result rather than a pure chassis property. The weakest fleets contain both multiple Lines and Scouts, while three Lines generate the largest raw backlog but have a longer Context Limit.

## Broad match shape

The game remains primarily a Drift race:

- 121,101 matches (75.09%) ended in a one-sided Drift terminal.
- 34,047 (21.11%) ended with both players terminal in the same atomic Resolution.
- 6,132 (3.80%) reached the round limit.
- No match ended with an `objective` terminal.
- Mean duration was 3.655 rounds; a participant averaged 0.499 Progress and 3.468 Drift.

The controller produced 11.637 artifacts, 1.635 detonations, and 0.283 Batteries per participant appearance. The top fleets are therefore winning mostly by surviving the opponent's Drift, not by reaching 12 Progress.

## Non-causal context against the prior descriptive run

The raw system-level levels moved in the intended direction: artifacts per appearance went from 19.431 to 11.637, detonations from 2.667 to 1.635, and mean Drift from 5.534 to 3.468. Mean duration rose from 3.355 to 3.655 rounds, and Batteries rose from 0.0956 to 0.2828 per appearance.

Those differences must not be read as causal estimates. Rules, fleets, compiler catalog, controllers, and sampled graph all changed together. They only describe how the two completed landscapes differ.

## Strategic and policy cautions

- At the 55% threshold, 15,755 of 17,920 non-self edges are directional. The largest strongly connected component contains only 8 profiles (0.179%), so the sampled graph remains strongly hierarchical.
- Alpha's overall score rate is 48.51%. The mean focal Alpha-seat effect across reversals is -4.21 percentage points, while the mean absolute reversal effect is 31.71 points. Local seat sensitivity remains large.
- Marginal triage scores range from 57.39% for `risk-adaptive` to 44.36% for `verify-lowest`. Capacity separates into roughly 56–57% pioneer/adaptive policies and 42–44% follower/never policies. Movement is comparatively compressed.
- No active Range Shift executed. This remains a controller coverage gap, not evidence that the mechanic is harmless or irrelevant.

## Balance read

The requested Scout change worked as an output throttle: six Scouts no longer flood the board, and Scout-heavy fleets now use high-quality, low-volume output. The current landscape instead raises two follow-up concerns:

1. Condense 2 plus Scout count may make six Scouts too efficient at manufacturing Batteries while safely holding surplus output.
2. Line units, not Scouts, now dominate persistent backlog because the controller always emits from them.

Fleet weight alone is not producing a balanced-fleet optimum. Two Heavies remain the safest and strongest fleet, but six Scouts are also very strong; mixed Line fleets carry most of the observed failure load. A next tuning experiment should isolate Scout Battery conversion and chassis-neutral output restraint rather than broadly reducing Scout volume again.
