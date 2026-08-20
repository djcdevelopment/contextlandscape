# Attention-economy v4.2 degree-88 landscape

Status: complete and integrity-clean. This is descriptive evidence about the frozen deterministic controller population. It is not a causal estimate of any individual rule and it is not a substitute for human playtesting.

## Study contract

- Ruleset: `attention-economy-v4.2` under the retained external model ID `duel-capacity-v3-experimental`.
- Population: all 3,200 compiled commander profiles across the five legal weight-six fleets.
- Topology: a hash-ordered degree-88 regular graph with 140,800 unique non-self pairs, plus all 3,200 self-play controls.
- Evaluation: two pair-keyed independent seed worlds, both seat orientations, and four pressure samples.
- Total: 2,278,400 physical matches and 4,556,800 participant appearances. Every profile appears exactly 1,424 times.
- Independence from ordinal/scheduling: a world seed is keyed by the two compiled profile hashes, pressure, frozen ruleset hash, and world lane. Worker count and edge order cannot change it.
- New coverage: only 1,366 non-self edges overlap the earlier degree-32 graph, or 0.97% of this graph.
- Runtime: 11,938.9 seconds with 24 workers (3h 18m 58.9s).
- Report hash: `sha256:d13279ccd195b28244e08e89d25a655a7921b7190800c1c23fdef8dd90189563`.

Replay, RNG-stream, compiled-commander attribution, command-rejection, and cross-world stream-collision counts are all zero. The design closes exactly, including 1,126,400 seat reversals and 1,125 replay sentinels.

## Main result

The larger and mostly new opponent graph strengthens the earlier fleet ordering instead of reversing it.

| Fleet | Score | Change from degree 32 | Mean Drift | Progress | Artifacts | Batteries | Detonations |
|---|---:|---:|---:|---:|---:|---:|---:|
| Heavy-Three-Scout | 65.38% | +3.70 pp | 2.80 | 0.461 | 7.31 | 0.400 | 1.335 |
| Three Line | 58.93% | +3.02 pp | 3.60 | 0.508 | 20.24 | 0.069 | 1.660 |
| Heavy-Line-Scout | 56.80% | +2.35 pp | 3.24 | 0.407 | 11.34 | 0.138 | 1.542 |
| Line-Four-Scout | 40.78% | -3.40 pp | 3.84 | 0.474 | 8.20 | 0.281 | 1.857 |
| Two-Line-Two-Scout | 28.10% | -5.67 pp | 4.94 | 0.365 | 12.99 | 0.123 | 2.406 |

The rank order is identical to the degree-32 result, but the fleet span grows from 27.91 to 37.28 percentage points. That widening is descriptive of the new graph; it is not a balance change because rules and controllers were frozen.

Across all 3,200 profiles, scores in the degree-32 and degree-88 reports correlate at 0.963 Pearson and 0.960 Spearman. Their mean absolute profile-score difference is 5.46 points; 12 of the top 25 and 71 of the top 100 profiles overlap. Broad structure is stable, while exact leaderboard placement still depends on opponent coverage.

## Two-world stability

The independent worlds agree much more strongly on aggregate profile strength than on individual outcomes.

| Measure | Result |
|---|---:|
| Profile-score Pearson correlation | 0.9955 |
| Profile-score Spearman correlation | 0.9951 |
| Mean absolute profile-score difference | 1.53 pp |
| 95th percentile absolute profile difference | 3.86 pp |
| Top-25 overlap | 19 / 25 |
| Top-100 overlap | 85 / 100 |
| Edge/pressure directional agreement | 59.09% |
| Exact edge/pressure score agreement | 57.68% |
| Mean absolute edge/pressure score difference | 22.87 pp |

The useful inference is hierarchical: fleet, module, and broad profile structure are robust in this controller population, but a particular pair under a particular pressure remains stochastic. The match count does not turn one observed edge into a deterministic law.

## The game topology is still a Drift race

The much larger sample makes the systemic caution harder to dismiss:

- 1,720,343 matches (75.51%) ended in a one-sided Drift terminal.
- 556,603 (24.43%) ended with both players terminal in the same atomic Resolution; all were `drift:drift`.
- 1,453 (0.064%) reached the round limit.
- One match, 0.000044%, ended through the 12-Progress objective.
- Drift was involved in 99.936% of terminal states.
- Mean duration was 3.007 rounds; a participant averaged 0.443 Progress and 3.682 Drift.
- Only 108 of 4,556,800 participant-runs reached 8 Progress, two reached 10, and one reached 12.

This is the central design result. The current controller landscape is not expressing two competing victory routes. It is overwhelmingly expressing artifact-risk survival.

The fleet hierarchy follows that route. Heavy-Three-Scout has the lowest artifact load and Drift, the highest Battery rate, and the fewest detonations among the leading fleets. Two-Line-Two-Scout has the highest Drift and detonation load. Three Line creates the most artifacts and the most Progress, but its mean Progress remains only 0.508 and almost never matters as a terminal route.

## Scout Condense is doing its intended job

Scout quantity is controlled rather than flooding the board:

- 85.94% of Scout plans reached Condense 2.
- Scouts emitted on 30.60% of their Emit/Hold decisions.
- A Scout emission created 1.256 artifacts on average, versus 2.017 for Line and 1.010 for Heavy.
- Scout artifacts converted to Batteries at 5.51% in the observed controller flow.
- Lines supplied 72.32% of observed pending backlog.

The original “Scouts generate too many artifacts” failure is no longer the dominant system mechanism. Condensed Scouts instead contribute low volume and high Battery conversion. The remaining output-management problem is primarily Line backlog under controllers that never Hold Line or Heavy output.

## Policy topology

Composition and triage dominate the marginal controller landscape:

- Composition spans 37.28 points, from Heavy-Three-Scout at 65.38% to Two-Line-Two-Scout at 28.10%.
- Triage spans 31.63 points, from Risk-Adaptive at 68.31% to Siege-Seize at 36.68%.
- Capacity spans 8.63 points.
- Movement spans 7.07 points; Hold and Flare-Evade are effectively tied at the top, while Escort trails.

These are marginal associations across interacting compiled dimensions, not isolated module effects. The canonical paired probe remains the evidence that every module can become eligible, execute, and change behavior.

At a 55% edge threshold, 131,208 of 140,800 non-self edges are directional and 9,592 are neutral. Despite that strong local hierarchy, the largest strongly connected component contains 3,132 of 3,200 profiles (97.88%). Counter-cycles remain broad even while competitive strength is concentrated. The effective strategy count at temperature 0.03 is 170.5, or 5.33% of the catalog.

## Decision

The evidence supports keeping v4.2 frozen as the current playtest baseline, but it narrows what “balanced enough” means:

- Fleet restrictions removed the clearly unwanted Two-Heavy and Six-Scout endpoints.
- The five-fleet ordering is reproducible across graph densities and independent seed worlds.
- Heavy-Line-Scout remains viable, but Heavy-Three-Scout has a real defensive advantage in these controllers.
- Two-Line-Two-Scout remains a clear low tier.
- The nominal Progress route is functionally absent; future tuning should treat that as a system-level issue rather than shaving small fleet percentages.

No additional balance change is justified by this descriptive run alone. The next useful intervention would isolate Progress/Drift pacing or add human playtest telemetry, not chase exact profile ranks.
