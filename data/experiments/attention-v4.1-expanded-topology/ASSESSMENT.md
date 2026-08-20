# Attention-economy v4.1 expanded topology

Status: complete and integrity-clean. This is a descriptive study of the current compiled controllers, not a causal comparison or a full round robin.

## Study contract

- Ruleset: `attention-economy-v4.1` under external model ID `duel-capacity-v3-experimental`.
- Catalog: all 4,480 compiled commander profiles.
- Graph: 16 deterministic cyclic offsets, producing 71,680 unique non-self edges and degree 32 for every profile, plus 4,480 self-play edges.
- Evaluation: both seats and all four pressure samples for every non-self edge.
- Total: 591,360 physical matches, 286,720 exact seat reversals, and 1,182,720 participant appearances. Every profile appears exactly 264 times.
- Reproducibility: 595 full replay sentinels; replay, RNG-stream, compiled-commander attribution, and command-rejection mismatches are all zero.
- Runtime: 4,042.3 seconds with 24 deterministic workers.
- Report hash: `sha256:df54f80972d321c584db3a23ea7537208bbef4c0a895665ae219b5d1196ec1a2`.

This graph samples 71,680 of 10,032,960 possible unordered non-self pairs. It is 4× denser by edge count and 3.67× larger by physical matches than the prior landscape, but it is still not an exhaustive round robin.

## Topology: cyclic core inside strong fleet tiers

The sparse baseline made the game look almost purely hierarchical: its largest strongly connected dominance component contained only 8 of 4,480 profiles. That conclusion was not stable to graph density.

In the expanded graph, 62,139 of 71,680 edges (86.69%) are directional at the 55% threshold, while 9,541 (13.31%) are neutral. The largest strongly connected component contains 4,401 profiles, or 98.24% of the catalog. Once profiles see 32 opponents instead of 8, indirect win-direction cycles connect almost the entire policy space.

This does not mean the catalog is flat. It means the game has a giant cyclic counterplay core overlaid by a steep global strength gradient:

- Nearby edges are materially softer: 76.72% directional, versus 92.82% for broad uniform edges and 92.34% for adversarial edges.
- Commander score quantiles remain wide: 23.30% at p05, 36.17% at p25, 48.67% median, 64.39% at p75, and 78.79% at p95.
- The entropy-derived effective commander count at temperature `.03` is 289.7, or 6.47% of the 4,480-profile catalog. The baseline value was a similar 297.4.

The broad ordering is stable but the exact leaderboard is not. Expanded-versus-baseline profile score correlation is `.923` (Pearson) and `.924` (Spearman), yet the mean absolute profile-score movement is 6.11 percentage points, the p95 movement is 15.21 points, and none of the old top 25 remain in the expanded top 25. Fleet and module conclusions are much safer than claims about a single best compiled profile.

## Fleet tiers

The fleet ordering is unchanged from the smaller graph, although the extremes shrink toward the middle.

| Fleet | Expanded score | Baseline score | Mean Drift | Artifacts | Backlog / round | Batteries | Detonations |
|---|---:|---:|---:|---:|---:|---:|---:|
| two-heavy | 74.30% | 76.74% | 1.16 | 11.37 | 3.60 | 0.181 | 0.430 |
| six-scout | 62.39% | 68.51% | 2.90 | 7.17 | 2.00 | 0.688 | 1.374 |
| heavy-three-scout | 53.75% | 53.00% | 3.22 | 7.94 | 3.19 | 0.442 | 1.537 |
| three-line | 46.55% | 47.46% | 4.59 | 21.96 | 11.73 | 0.077 | 2.142 |
| heavy-line-scout | 44.31% | 43.48% | 3.83 | 12.25 | 6.21 | 0.158 | 1.828 |
| line-four-scout | 38.65% | 34.64% | 3.88 | 8.29 | 4.40 | 0.281 | 1.877 |
| two-line-two-scout | 30.05% | 26.16% | 4.89 | 12.95 | 7.99 | 0.123 | 2.385 |

Composition spans 44.25 percentage points, much more than triage (19.38), capacity (8.81), or movement (4.33). All 640 two-Heavy profiles score above 50%; only 27 of 640 two-Line/two-Scout profiles do. The intended Heavy/Line/Scout reference fleet ranks fifth.

Two Heavy remains structurally safe rather than merely lucky in the smaller sample. Six Scout remains the clear second tier, but its score falls 6.12 points with broader opponent exposure. Its strength still comes from high-quality Battery production and output restraint: 0.688 Batteries per appearance with only 7.17 artifacts.

## Policy topology

- Triage is the largest non-composition lever. `risk-adaptive` scores 59.75%, `seize-cheapest` 58.30%, and `verify-lowest` 40.37%. Policies that actively remove or exploit risk outperform passive low-value verification.
- Capacity still separates early actors from followers, but less sharply than in the baseline. `adaptive` scores 54.30%; `never` scores 45.49%.
- Movement is nearly inert at the marginal level. Seven modules sit between 49.98% and 51.35%; only `escort` separates downward at 47.02%. No Range Shift executed, so this remains partly a controller-coverage limitation.
- Fine-grained interactions matter. Some top two-Heavy profiles use otherwise weak aggregate capacity modules, while some Heavy/Scout profiles appear among the bottom profiles. Marginal module rates should not be treated as universally additive.

## Mechanic and chassis shape

Scout behavior is almost unchanged from the smaller run:

- Condense 2: 88.53% of Scout plans; Condense 1: 2.40%; Condense 0: 9.07%.
- Scout Emit share: 26.86%.
- Scout Battery conversion: 7.16% per artifact.
- Scout detonation rate: 30.93% per artifact.

Line units remain the dominant backlog source. They generate 57.62% of observed pending backlog and 7.59 million artifacts, versus 3.13 million each for Scouts and Heavies. Line Battery conversion is only 0.60%, while their compiled controller always emits.

System-level mechanic rates are highly stable against the baseline: 11.70 artifacts, 1.65 detonations, and 0.279 Batteries per participant appearance. The larger opponent graph changes rankings more than it changes the game’s aggregate mechanical load.

## Match topology

The game remains a survival/Drift race:

- 434,830 matches (73.53%) end in one-sided Drift.
- 133,838 (22.63%) end with both players terminal in the same atomic Resolution.
- 22,692 (3.84%) reach the round limit.
- No match ends through the 12-Progress objective.
- Mean duration is 3.659 rounds; participants average 0.492 Progress and 3.499 Drift.

Pressure changes duration more than outcome balance. Pressure 0 averages 3.55 rounds and pressure 2 averages 3.75, while Alpha score stays between 49.22% and 50.28% across all four samples.

Seat effects remain locally large but have little global direction. The mean focal Alpha-seat effect is −0.80 percentage points, versus −4.21 in the smaller graph, while the mean absolute reversal effect increases from 31.71 to 34.14 points. Which seat helps depends strongly on the matchup even though the aggregate bias nearly cancels.

## Balance read

The topology is neither a flat ecosystem nor a simple ladder. Most policies belong to one enormous counterplay cycle, but fleet construction places them on sharply different altitude bands. A two-Heavy commander can be part of a cyclic strategic graph and still enjoy a large marginal survival advantage.

The next balance work should target the structural bands rather than the exact profile leaderboard:

1. Reduce two-Heavy safety or introduce a reliable cost/counterpressure for stationary Heavy play.
2. Test Scout Battery conversion separately; Scout artifact volume itself remains controlled.
3. Give Line output a restraint or quality/volume decision, because always-emitting Lines dominate backlog and mixed-fleet failure.
4. Investigate the missing objective pathway. With zero Progress victories, most balance changes currently tune a Drift-survival game rather than two competing routes to victory.

Any next rules adjustment should use a paired causal probe for the isolated knob. Another undifferentiated descriptive sweep would map the new landscape but would not identify why it changed.
