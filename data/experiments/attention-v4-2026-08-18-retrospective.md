# Attention Economy v4: 24-hour experiment retrospective

Date: 2026-08-18 (America/Los_Angeles)

Decision: freeze `attention-economy-v4.2` as the working ruleset. It is balanced enough for the current stage of development. The remaining issues are real, but none requires another immediate global rebalance before human play and more targeted experiments.

Evidence window: the canonical reports written between 02:01 and 17:36 PDT on 2026-08-18. Across eight conformance and landscape reports, this work executed 1,610,752 physical matches.

## Executive summary

The day began with a complete Attention Economy rewrite and ended with a smaller, more credible fleet field.

The first v4 landscape confirmed the core concern: output was outrunning triage, Scout-heavy fleets were creating and detonating too many artifacts, and Heavy concentration was overwhelmingly safe. Three Heavy scored 82.29%, while three Scout scored 27.85%. Matches averaged 19.43 emitted artifacts and 2.67 detonations per participant, and almost every terminal was a Drift event.

The first balance response, v4.1, made fleet construction spend exactly six weight and changed Scout development into an explicit quality/quantity trade. A Scout could spend up to two UAP on Condense, moving from `3@20 / .20 calibration`, to `2@60 / .65`, to `1@90 / .85`. The compiled controllers responded by condensing heavily and holding excess Scout output. In the expanded v4.1 graph, artifact load fell to 11.70 and detonations to 1.65 per participant. Scout volume was no longer the primary system-wide problem.

Fleet weight exposed a different problem. The two one-dimensional endpoints permitted by weight - Two Heavy and Six Scout - became the top two fleets at 74.30% and 62.39%. Two Heavy was structurally safe; Six Scout converted condensed output into Batteries very efficiently. The intended Heavy-Line-Scout reference fleet sat at 44.31%.

The second response, v4.2, retained exact weight six but capped fleets at one Heavy and four Scouts. That removed Two Heavy and Six Scout from contracts, compilation, the server, and the UI. The current legal field contains five fleets and 3,200 compiled commander profiles.

The final 422,400-match topology is not flat, but it is credible enough to stop tuning:

- Heavy-Three-Scout leads at 61.68%, followed by Three Line at 55.91% and Heavy-Line-Scout at 54.45%.
- Line-Four-Scout scores 44.18%; Two-Line-Two-Scout is the remaining weak fleet at 33.77%.
- The legal fleet span is 27.91 percentage points, compared with 44.25 points across the seven v4.1 fleets and 54.45 points across the original v4 three-unit compositions.
- The broad strategy graph is highly cyclic: 3,120 of 3,200 profiles, or 97.5%, occupy one strongly connected dominance component.
- Strong individual Heavy-Line-Scout profiles reach the global leaderboard. Fleet averages describe altitude bands, not automatic matchup outcomes.
- The Scout quantity problem is controlled. Scouts hold 69.79% of output decisions; Lines now account for 72.56% of observed pending backlog.
- The game is still almost entirely a Drift-survival contest. No final-run match reached the 12-Progress objective.

This is a stopping point, not a claim of solved balance. Heavy-Three-Scout defensive efficiency, Two-Line-Two-Scout fragility, Line output restraint, and the absent Progress pathway remain the main design questions.

## What changed

### 1. The Attention Economy v4 rewrite

The initial implementation replaced the old Battle Command behavior with a standalone deterministic reducer while retaining the external model ID `duel-capacity-v3-experimental`. The ruleset, resolver, compiler, state schema, and content hashes now carry the actual behavior identity.

The rewrite delivered:

- Automatic Register and Resolution around simultaneous Kinetic and Artillery stages and an alternating one-intent Command stage.
- Explicit Emit or Hold decisions for every unit, with integer density/volume allocation and effective calibration computed from density times current calibration.
- Persistent artifacts, Context Limits, local traffic, over-tax, Verify rescue, Batteries, and atomic Drift Detonation resolution.
- Spatial Flare, Smoke, EMP, HE, and Chaff cards with public hands, cooldowns, reloads, retaliation bypass, friendly fire, and deterministic target previews.
- Battery-granted UAP, Battery command discounts, Support Scan reservations, Heavy Uplink, Perfect Focus, and Overclock.
- Authoritative projections and legal-action contracts for effective UAP, output limits, exact costs, shell legality, active commander, and projected hazards.
- Content-addressed commander compilation, run-record telemetry, replay/RNG/attribution checks, and canonical report gates.
- A five-stage web workflow with board overlays, unit allocation controls, public armories, accessible risk dialogs, mobile/tablet layouts, roving grid focus, live-region updates, and reduced-motion support.
- Deliberate retirement of old Battle Command operations: incompatible snapshots return HTTP 410 `battle_ruleset_retired` and the UI offers a new operation.

The first compiler contained 6,400 profiles. The initial canonical paired probe covered every module contrast and showed that the implementation was live and behaviorally differentiable. That probe was an implementation gate, not a balance estimate.

### 2. v4.1: fleet weight and Scout Condense

The initial landscape motivated two linked changes.

First, fleet construction moved from fixed three-unit compositions to exact weight six:

| Chassis | Weight |
|---|---:|
| Scout | 1 |
| Line | 2 |
| Heavy | 3 |

That produced seven legal compositions: Six Scout, Line-Four-Scout, Two-Line-Two-Scout, Three Line, Heavy-Three-Scout, Heavy-Line-Scout, and Two Heavy. It removed Three Heavy and other over-weight concentrations while preserving deliberately one-dimensional options.

Second, the Scout's development action became Condense Output. Each UAP traded maximum volume for quality:

| Condense steps | Maximum output | Density cap | Calibration |
|---:|---:|---:|---:|
| 0 | 3 | 20% | .20 |
| 1 | 2 | 60% | .65 |
| 2 | 1 | 90% | .85 |

This made the intended choice explicit: a Scout can move and produce lower-quality volume, or spend actions to create fewer, higher-quality artifacts. Smoke, range changes, and forced displacement reset the settled state.

The controllers were also made backlog-aware. Scout-heavy and threatened fleets generally Condense twice and Hold rather than adding unmanaged artifacts. New telemetry attributed output, Batteries, aging, traffic, and detonations by source chassis so the result could be diagnosed rather than inferred from scores alone.

The v4.1 compiler contained 4,480 profiles across the seven weight-six fleets. Its canonical paired probe again passed full module eligibility, execution, differentiation, replay, stream, and attribution gates.

### 3. v4.2: remove the two endpoints

The v4.1 expanded landscape showed that exact weight alone did not prevent extreme specialization from defining the field. Two Heavy and Six Scout occupied the top two fleet tiers for different reasons.

v4.2 added two construction caps:

- At most one Heavy.
- At most four Scouts.

Both caps are enforced by the shared state/request schema, not only by the UI. Crafted API requests, compiler profiles, restored snapshots, and ordinary selectors all pass through the same restriction. The five remaining legal fleets are:

- Heavy-Three-Scout.
- Heavy-Line-Scout.
- Three Line.
- Line-Four-Scout.
- Two-Line-Two-Scout.

The ruleset is now `attention-economy-v4.2`, the resolver is `attention-v4.2-resolver-1`, and the commander compiler is `attention-v4.2-commander-compiler-1`. The retained external model ID remains `duel-capacity-v3-experimental`. The legal catalog contains 3,200 profiles.

No other balance knob changed in v4.2. Its purpose was to remove two fleet constructions judged undesirable, then remap the legal topology.

## Experiment ledger

All times are PDT on 2026-08-18. Match counts are physical resolver executions.

| Time | Ruleset | Experiment | Profiles | Matches | Primary result |
|---|---|---|---:|---:|---|
| 02:01 | v4 | Canonical paired module probe | 6,400 catalog | 32,768 | 32/32 contrasts covered; 16,352/16,384 pairs changed; zero replay/stream/attribution mismatches |
| 03:11 | v4 | Four-offset descriptive landscape | 6,400 | 230,400 | Heavy concentration dominated; Scout output and detonation load were excessive |
| 05:38 | v4.1 | Canonical paired module probe | 4,480 catalog | 29,696 | All 33 modules eligible, executed, and differentiated; zero mismatches |
| 05:57 | v4.1 | Four-offset descriptive landscape | 4,480 | 161,280 | Condense throttled Scout volume; Two Heavy and Six Scout emerged as the top endpoints |
| 08:13 | v4.1 | Degree-32 expanded topology | 4,480 | 591,360 | Endpoint ordering held; 98.24% of profiles joined one counterplay component |
| 16:41 | v4.2 | Canonical paired module probe | 3,200 catalog | 27,648 | All 31 remaining modules covered and differentiated; removed fleets absent; zero mismatches |
| 16:54 | v4.2 | Four-offset descriptive landscape | 3,200 | 115,200 | Five-fleet order established; all profiles observed exactly 72 times |
| 17:36 | v4.2 | Degree-32 expanded topology | 3,200 | 422,400 | Current balance map; all profiles observed exactly 264 times; 97.5% giant counterplay component |

The canonical probes answer "did every compiled module reach and alter resolver behavior under paired common worlds?" The landscape studies answer "what does this deterministic controller population look like on a fixed matchup graph?" They are different evidence classes.

## What the experiments showed

### Initial v4: output outran triage

The first landscape was a short detonation race. A participant averaged 19.43 emitted artifacts but only 0.67 Verifies, 1.13 Accepts, 1.56 Rejects, and 0.57 Seizes. It suffered 2.67 detonations and 5.53 Drift in a match lasting 3.36 rounds.

Composition dwarfed the other policy dimensions. The original three-unit fleet scores ranged from Three Heavy at 82.29% to Three Scout at 27.85%. Three Scout created 25.14 artifacts and suffered 5.70 detonations per appearance; Three Heavy created 13.89 and suffered 0.65. The original suspicion that Scout count and short Context Limits could flood the board was supported by the mechanism traces, while Heavy concentration enjoyed very low hazard exposure.

No match reached a one-sided Progress objective. Only 137 of 230,400 matches reached the round limit; all others ended through one-sided or simultaneous terminal Resolution. The game being measured was primarily artifact-risk survival.

The sparse dominance graph looked almost acyclic, with only 11 of 6,400 profiles in the largest strongly connected component. The later expanded runs showed that this was a sampling-topology artifact, not a stable description of strategic counterplay.

### v4.1: the Scout throttle worked

The Scout change produced the intended policy behavior:

- In the v4.1 expanded run, 88.53% of Scout plans reached Condense 2.
- Scouts emitted on 26.86% of output decisions and Held on the rest.
- Six Scout produced only 7.17 artifacts per appearance, the lowest fleet output in the seven-fleet field.
- Six Scout activated 0.688 Batteries per appearance, by far the highest fleet rate.

System-level output fell from 19.43 artifacts per participant in the original v4 landscape to 11.70 in the v4.1 expanded landscape. Detonations fell from 2.67 to 1.65, mean Drift from 5.53 to 3.50, and Batteries rose from 0.096 to 0.279. These are large, directionally coherent changes, but they are not causal estimates: rules, fleet catalog, controller behavior, and opponent graph all changed.

The important design conclusion is narrower. Scout quantity was no longer the dominant backlog source. Lines created 57.62% of observed pending backlog in the expanded run, partly because the compiled controller always emits from Line and Heavy units. Scout artifacts remained individually fragile under Context Limit 1, but Condense and Hold controlled their total exposure.

### v4.1: fleet weight still permitted two undesirable extremes

The degree-32 v4.1 study confirmed the seven-fleet ordering:

| Fleet | Score | Mean Drift | Artifacts | Batteries | Detonations |
|---|---:|---:|---:|---:|---:|
| Two Heavy | 74.30% | 1.16 | 11.37 | 0.181 | 0.430 |
| Six Scout | 62.39% | 2.90 | 7.17 | 0.688 | 1.374 |
| Heavy-Three-Scout | 53.75% | 3.22 | 7.94 | 0.442 | 1.537 |
| Three Line | 46.55% | 4.59 | 21.96 | 0.077 | 2.142 |
| Heavy-Line-Scout | 44.31% | 3.83 | 12.25 | 0.158 | 1.828 |
| Line-Four-Scout | 38.65% | 3.88 | 8.29 | 0.281 | 1.877 |
| Two-Line-Two-Scout | 30.05% | 4.89 | 12.95 | 0.123 | 2.385 |

Two Heavy was the safety endpoint: low Drift, few detonations, and all 640 profiles above 50%. Six Scout was the condensed-Battery endpoint: very low volume and exceptional Battery conversion. The nominal balanced fleet was viable in individual matchups but fifth on marginal score.

This supported a construction-rule decision rather than another chassis-wide nerf. Reducing Heavy or Scout statistics globally would have changed the mixed fleets as well. Removing the two formations addressed the concentration problem directly.

### v4.2: current five-fleet landscape

The final expanded results are:

| Fleet | Score | Mean Drift | Artifacts | Backlog / round | Batteries | Detonations |
|---|---:|---:|---:|---:|---:|---:|
| Heavy-Three-Scout | 61.68% | 2.94 | 7.55 | 3.14 | 0.417 | 1.407 |
| Three Line | 55.91% | 4.08 | 21.18 | 11.50 | 0.073 | 1.898 |
| Heavy-Line-Scout | 54.45% | 3.45 | 11.71 | 6.06 | 0.148 | 1.645 |
| Line-Four-Scout | 44.18% | 3.76 | 8.15 | 4.37 | 0.278 | 1.819 |
| Two-Line-Two-Scout | 33.77% | 4.79 | 12.83 | 7.95 | 0.123 | 2.334 |

These are marginal scores on the fixed graph. The v4.1 and v4.2 rates should not be subtracted as if v4.2 buffed every surviving fleet. Removing the two best cohorts changed who everyone faced and renormalized the five-fleet field.

The ordering is nevertheless robust within v4.2. The four-offset baseline and degree-32 expansion produce the same fleet order, and expanded fleet rates differ from baseline by no more than 2.04 points. Across all 3,200 profiles, baseline and expanded scores correlate at 0.902 Pearson and 0.892 Spearman. Exact top-ten membership is noisy, but the broad policy structure is stable.

Heavy-Three-Scout's lead appears defensive. It combines the smallest fleet artifact load, the lowest mean Drift, the highest Battery rate, and controlled backlog. It is not winning by reaching 12 Progress. Three Line survives its very large backlog through Context Limit 2 and produces the most Progress. Two-Line-Two-Scout combines Line volume with short-lived Scout artifacts and carries the largest detonation load.

### Counterplay is broad even though fleet tiers remain

The final graph contains 43,439 directional and 7,761 neutral non-self edges at a 55% dominance threshold. Its largest strongly connected component contains 3,120 profiles, or 97.5% of the catalog.

This matters for the balance decision. A 61.68% fleet average does not describe an unbeatable closed tier. Most policies participate in indirect win cycles, and Heavy-Line-Scout profiles appear among the very best individual commanders. The score distribution remains wide - 24.62% at the fifth percentile, 50.76% at the median, and 76.70% at the 95th percentile - while the effective strategy count at temperature 0.03 is 159.3, about 5% of the catalog. The ecosystem has a concentrated competitive region inside a broadly connected counterplay graph.

The sparse graph's tiny strongly connected component was therefore misleading. Expanding each profile from 8 to 32 sampled opponents changed the topology conclusion without changing the broad fleet order. Future balance maps should use the expanded design whenever graph structure, rather than only fleet averages, is under discussion.

### Terminal and seat topology remain the largest systemic cautions

The final 422,400 matches ended as follows:

- 294,309 (69.68%) through a one-sided Drift terminal.
- 127,244 (30.12%) with both players terminal in the same atomic Resolution.
- 847 (0.20%) at the round limit.
- Zero through the 12-Progress objective.

Mean duration is 3.08 rounds. A participant averages 0.452 Progress and 3.805 Drift. Balance is currently about surviving context failure, not choosing between two credible victory routes.

Aggregate seat direction is small: Alpha scores 49.36%, and mean focal Alpha-seat effect is -1.50 percentage points. Local seat sensitivity remains large, however. The mean absolute exact-reversal effect is 39.16 points. Seats frequently matter in particular matchup/pressure cells even though the effects cancel globally.

## Why v4.2 is balanced enough for now

"Balanced enough" here means that the system no longer has a clearly unacceptable legal construction that invalidates the rest of the field. It does not mean every roster or compiled policy is at 50%.

The stop decision is supported by five observations:

1. The most obvious concentration failures are gone. Three Heavy was removed by exact fleet weight; Two Heavy and Six Scout were removed by explicit caps.
2. The intended mixed Heavy-Line-Scout fleet is viable at 54.45%, and its strongest policies compete at the top of the individual leaderboard.
3. The leading fleet is strong rather than absolute. Heavy-Three-Scout scores 61.68%, not the 74.30% of Two Heavy or the 82.29% of the original Three Heavy.
4. Most of the policy catalog is connected by counter-cycles. Fleet construction shifts expected strength, but it does not determine every matchup.
5. The v4.2 ordering survives a fourfold increase in non-self edge coverage, so we are not stopping on a single sparse-graph anomaly.

Further global tuning now has a higher risk of chasing the deterministic controllers than improving the game. Human use of artillery, optional Line/Heavy Holds, active Range Shift, spatial Battery play, and long-horizon objective pursuit may differ substantially from these policies.

## What is not resolved

The frozen baseline should preserve the following open questions rather than treating them as closed:

- Heavy-Three-Scout defensive efficiency. Its Battery rate and low Drift make it the strongest marginal fleet.
- Two-Line-Two-Scout fragility. It is the only remaining fleet substantially below the middle band and has the highest detonation load.
- Line backlog. Lines create 72.56% of observed pending backlog in v4.2, and the current controller never elects to Hold Line or Heavy output.
- Progress irrelevance. Zero objective terminals means the nominal second victory pathway does not influence this controller landscape.
- Scout Battery conversion. Scout volume is controlled, but condensed Scouts still produce Batteries much more efficiently than Lines.
- Local seat sensitivity. Exact reversal effects remain large even when aggregate seat bias is small.
- Range coverage. No active Range Shift executed in the landscape controllers. Conformance covers legality and differentiation, but the balance reports do not measure strategic Range Shift use.
- Controller external validity. These experiments describe compiled deterministic agents, not expert human play.

These are candidates for later isolated paired interventions or playtest instrumentation. They are not reasons to discard the current ruleset.

## Evidence and causal limits

No cross-version balance number in this document is a causal estimate.

- v4, v4.1, and v4.2 changed legal fleets, compiler catalogs, controllers, or matchup graphs.
- The landscape schedules are deterministic sparse graphs, not random independent samples and not full round robins.
- Score rates have no conventional sampling confidence intervals.
- Module averages include interactions with the other compiled dimensions.
- The same rules can look more or less hierarchical when graph density changes, as the strongly connected component results demonstrated.
- Canonical paired probes establish reachability, execution, common-world replay, attribution, and behavioral differentiation. They do not estimate human-facing balance.

The appropriate claim is descriptive: the current five-fleet deterministic ecosystem is materially less extreme, mechanically coherent, highly counter-cyclic, and stable enough across two graph densities to use as the next playtest baseline.

## Validation status

The final v4.2 activation and handoff passed:

- 3,200/3,200 commander profiles compiled through exhaustive module switches.
- 27,648 canonical paired-probe matches; 13,810/13,824 pairs changed.
- Every one of the 31 remaining modules became eligible, executed, and changed at least one pair.
- Starting-range and shell-choice differentials were observed.
- Zero replay, RNG-stream, commander-attribution, or command-rejection mismatches in the canonical reports.
- 115,200-match baseline and 422,400-match expanded reports passed their content-hash and fixed-design gates.
- All workspace typechecks and production builds passed.
- 256 automated contract, engine, simulator, lab, bank, server, and React tests passed.
- The deterministic browser journey passed on desktop, tablet, and mobile, covering Battery creation, free Verify, detonation, EMP paralysis, counterfire, reload, and terminal state.

The historical 9.216-million-match campaign was not rerun, and no unspecified verification phases were introduced.

## Canonical artifacts

| Ruleset | Artifact | Matches | Report hash |
|---|---|---:|---|
| v4 | [Paired probe](attention-v4-paired-probe/report.json) | 32,768 | `sha256:3a0b2e4060aaaefbb8052ebd58a67ecf71ad8c891c1b67ca7450c813bbdfa3f8` |
| v4 | [Descriptive landscape](attention-v4-descriptive-landscape/report.json) | 230,400 | `sha256:30b2d4e95f549b1791300d713c0d3f0e5a58ec9e8af4d78cb01cd8da6486ae98` |
| v4.1 | [Paired probe](attention-v4.1-paired-probe/report.json) | 29,696 | `sha256:648a93aade324cbc323f668c37a56881f8d21cc222b7eeadfe843015dbfb5d18` |
| v4.1 | [Descriptive landscape](attention-v4.1-descriptive-landscape/report.json) | 161,280 | `sha256:e273fd60cd3ed85124d4bace03c817d6dc6b4c32cc681400b258f0a9617cc652` |
| v4.1 | [Expanded topology](attention-v4.1-expanded-topology/report.json) | 591,360 | `sha256:df54f80972d321c584db3a23ea7537208bbef4c0a895665ae219b5d1196ec1a2` |
| v4.2 | [Paired probe](attention-v4.2-paired-probe/report.json) | 27,648 | `sha256:ba5147dc0e9865e44978654ac84aa29c4cfa2992fe3dcacc2465097b340a287f` |
| v4.2 | [Descriptive landscape](attention-v4.2-descriptive-landscape/report.json) | 115,200 | `sha256:48c68d58671e926ae14a14ef20cd32046166de97f545c1661d4ef9de6d2ec585` |
| v4.2 | [Expanded topology](attention-v4.2-expanded-topology/report.json) | 422,400 | `sha256:dc4e7de402399d4395df203cfc435347185010d9aa1f5d599629af8c284662b6` |

Detailed interpretation remains adjacent to each report in its `ASSESSMENT.md`. This retrospective is the cross-run decision record; the JSON reports remain the canonical evidence.

## 2026-08-19 deep-study addendum

The follow-on study spent the available CPU budget on two complementary, two-world designs without changing rules or controllers:

| Experiment | Edges | Matches | Per-profile appearances | Runtime | Report hash |
|---|---:|---:|---:|---:|---|
| [Degree-88 regular topology](attention-v4.2-regular-topology/report.json) | 144,000 including self-play | 2,278,400 | 1,424 | 3h 18m 58.9s | `sha256:d13279ccd195b28244e08e89d25a655a7921b7190800c1c23fdef8dd90189563` |
| [Exact fleet matrix](attention-v4.2-fleet-matrix/report.json) | 38,400 | 614,400 | 384 | 57m 23.5s | `sha256:40819c044fb989e9481fca9543ac4fb950579fc59ab78100e356a38940587b4e` |

The 2,892,800 physical matches took 4h 16m 22.4s. Pair-keyed world seeds are independent of edge ordinal and worker scheduling. Both reports have zero replay, stream, attribution, command-rejection, and world-collision mismatches.

The added data strengthens three conclusions:

1. The fleet and policy hierarchy is stable. Degree-32 and degree-88 profile scores correlate at 0.963 Pearson/0.960 Spearman. Independent worlds inside the degree-88 graph correlate at 0.995/0.995. The matrix and degree-88 profile scores correlate at 0.967/0.966.
2. Fleet matchups are tiered. Heavy-Three-Scout wins all four cross-fleet cells; Heavy-Line-Scout narrowly beats Three Line; Line-Four-Scout beats only Two-Line-Two-Scout; Two-Line-Two-Scout loses all four.
3. The central unresolved issue is no longer sample size. In the degree-88 run, Drift participates in 99.936% of terminal states, mean duration is 3.007 rounds, and only one of 4,556,800 participant-runs reaches 12 Progress.

The larger sample therefore supports keeping v4.2 as the current playtest baseline while making the caveat sharper: the deterministic ecosystem is structurally reproducible, but its expressed game is overwhelmingly a Drift-survival contest. See the adjacent [degree-88 assessment](attention-v4.2-regular-topology/ASSESSMENT.md) and [fleet-matrix assessment](attention-v4.2-fleet-matrix/ASSESSMENT.md) for the full interpretation.
