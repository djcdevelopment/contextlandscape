# Attention-Economy v4 descriptive landscape

Status: complete and integrity-clean. This is descriptive exploration, not a causal comparison with any prior ruleset.

## Study contract

- Ruleset: `attention-economy-v4` under external model ID `duel-capacity-v3-experimental`.
- Catalog: all 6,400 compiled commander profiles.
- Sparse graph: 25,600 fixed non-self pairs at offsets 791, 1709, 1, and 3199, plus 6,400 self-play pairs.
- Evaluation: both seats for every non-self pair, all four pressure samples, and one match per self-play pressure cell.
- Total: 230,400 physical matches and 460,800 participant appearances. Every profile appears exactly 72 times.
- Reproducibility: 102,400 exact seat reversals, 250 full replay sentinels, shared root/domain streams, and compiler attribution checks.
- Runtime: 1,395.6 seconds with 12 workers.
- Report hash: `sha256:30b2d4e95f549b1791300d713c0d3f0e5a58ec9e8af4d78cb01cd8da6486ae98`.

All replay, stream, attribution, and command-rejection mismatch counts are zero.

## What the landscape looks like

### 1. It is a short detonation race

No sampled match recorded a one-sided `objective` terminal. Of the 230,400 matches, 130,891 (56.81%) ended with a one-sided Drift terminal, 99,372 (43.13%) ended with both players terminal in the same atomic resolution, and only 137 (0.059%) reached the round limit.

The mean match lasted 3.355 rounds. Round 3 alone held 60.73% of endings, and 89.51% of matches were over by round 4. A participant averaged only 0.473 Progress but 5.534 Drift, so the broad terminal shape is overwhelmingly hazard/Drift-heavy even though the aggregate report does not subdivide simultaneous terminals by each player's trigger.

The policy emitted 19.431 artifacts per participant appearance and suffered 2.667 Drift Detonations. By comparison it used only 0.674 Verifies, 1.132 Accepts, 1.555 Rejects, and 0.573 Seizes per appearance. In this policy population, output production is substantially outrunning triage capacity.

### 2. Chassis composition dominates the observed ordering

The ten composition-module averages span 54.45 score percentage points. The corresponding spans are 9.80 points for triage, 7.52 for movement, and 3.16 for capacity. These are marginal associations on the fixed graph, not isolated module effects.

| Composition module | Score | Mean Drift | Detonations / appearance |
|---|---:|---:|---:|
| siege-siege-siege (three Heavy) | 82.29% | 1.57 | 0.65 |
| line-siege-siege | 70.95% | 2.53 | 1.12 |
| line-line-siege | 67.49% | 3.68 | 1.69 |
| line-line-line | 60.00% | 3.60 | 1.65 |
| scout-siege-siege | 53.02% | 4.19 | 2.02 |
| scout-line-siege | 37.36% | 5.64 | 2.75 |
| scout-scout-siege | 31.27% | 7.77 | 3.83 |
| scout-scout-scout | 27.85% | 11.54 | 5.70 |

The direction is consistent with Context Limit exposure in this controller: Scout-heavy fleets emit more artifacts and carry far more detonation load, while Heavy-heavy fleets emit fewer artifacts and survive. This is the clearest follow-up target.

### 3. Secondary module associations are present but much smaller

- Triage ranges from `seize-cheapest` at 55.86% and `risk-adaptive` at 53.42% to `verify-lowest` at 46.06%.
- Movement ranges from `flare-evade` at 52.78% to `scout-mobile` at 45.26%.
- Capacity is comparatively compressed: `pioneer-focus` is 51.85%, while `never` is 48.69%.
- Interactions matter. Within three-Heavy fleets, `adaptive` capacity averages 85.40%, compared with 79.38% for `never`; the marginal capacity table hides much of that conditional separation.

The highest observed profile was ordinal 6399 (`siege-siege-siege`, `pressure-adaptive`, `flare-evade`, `adaptive`) at 66-6, or 91.67%. The lowest was ordinal 320 (`scout-scout-scout`, `recon-reject`, `hold`, `never`) at 1-63-8, or 6.94%. Each profile has only 72 observations on a sparse deterministic graph, so these are follow-up candidates rather than stable rank estimates.

### 4. The new mechanics are active, with one policy blind spot

Across all participant appearances the run observed:

- 44,072 Battery activations (0.0956 per appearance).
- 59,787 Support Scan reservations and 56,874 attachments, a 95.13% attachment rate.
- 91,624 shells fired and 4,006 blocked, a 4.37% block rate.
- Every shell family: 13,009 Flare, 22,498 Smoke, 22,890 EMP, 20,886 HE, and 12,341 Chaff shots.
- 424,417 Heavy Uplinks, 143,991 Perfect Focus uses, and 166,400 Overclocks.

No range-shift action was executed. Starting ranges still vary with chassis composition, and the conformance probe separately exercises starting-range differentials, but this landscape contains no evidence about active range shifting. That is a controller-policy coverage gap worth fixing before using a future landscape to judge that mechanic.

### 5. Average seat balance is small; local seat sensitivity is not

Alpha's overall score rate is 49.424%. Across exact non-self reversals, placing the focal profile in Alpha changes its score by -1.390 percentage points on average, but the mean absolute reversal change is 29.55 points. Self-play Alpha score is 50.381%.

So the aggregate seat bias is small, while many individual matchup/pressure cells remain highly seat-sensitive. Reporting only the global seat average would conceal that instability.

### 6. The sampled counterplay graph is mostly hierarchical

At a 55% dominance threshold, 21,688 of 25,600 sampled non-self edges (84.72%) are directional and 3,912 are neutral. The largest strongly connected component contains only 11 profiles (0.172% of the catalog). Score quantiles run from 20.83% at p05 to 83.33% at p95; the median is 47.92%.

On this sparse graph, the result looks more like a steep hierarchy than a broad rock-paper-scissors field. This conclusion is topology-dependent: unobserved pairings could add counter-cycles, and each edge contains only eight deterministic outcomes.

## Pressure strata

The four pressure samples have very similar aggregate duration and Drift. Mean rounds range only from 3.351 to 3.366, and mean Drift from 5.520 to 5.559. Mean Progress is non-monotonic (0.481, 0.455, 0.480, 0.476), while draw rates stay between 2.92% and 3.09%.

This does not show that pressure is inert. Aggregate outcomes can cancel heterogeneous policy changes, and this report does not retain per-pressure mechanic counters. It only says the broad terminal shape is stable across these four samples.

## Interpretation limits

- This is one deterministic sparse graph, not an exhaustive 20.48-million-pair round robin.
- Opponents, seats, seeds, and pressure strata are fixed; there are no independent repetitions or uncertainty intervals.
- Results characterize the compiled AI policy population as much as the rules. They are not direct estimates of human play.
- Marginal module averages include interactions and structured opponent assignment. They are descriptive associations, not treatment effects.
- The run deliberately makes no cross-version comparison and no causal claim about the v4 changes.

The next useful experiment is narrow rather than larger: instrument the artifact backlog by chassis and round, then contrast output restraint or triage budget policies within Scout-heavy compositions. That would test whether the observed hierarchy is chiefly a policy failure to manage Context Limits or a deeper rules-level pressure.
