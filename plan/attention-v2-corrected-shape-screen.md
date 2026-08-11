# Attention v2 Corrected Shape-Screen Plan

Decision date: 2026-08-09  
Status: complete; valid train-screen evidence; six rows advance provisionally to causal refinement
Supersedes the selection use of plan `attention-v2-landscape-standard-6d06365b0ff689e8ec24f773`; that run remains immutable integrity-only evidence.

## Decision

Do not select commander or model survivors from the completed 9,216,000-run screen. Repair the causal path from each commander profile into composition and controller behavior, enrich the run record enough to evaluate the preregistered gates, prove behavioral discrimination in a small paired audit, and only then repeat the standard shape screen.

The completed run still informs the redesign:

- all eight shards and all 9,216,000 records passed integrity checks;
- common edge/seed worlds support narrow comparisons among rule models;
- the sole fixed policy duel was severely asymmetric: the v1 bridge gave Player 1 a 96.4562% win rate;
- objective coupling produced the largest descriptive factor-level range in that duel (`0.421357` Player-1 score points), followed by seize-cost shape (`0.228608`) and base soundness (`0.222989`);
- model row 16 produced the largest paired shift from the bridge (`-0.631684` Player-1 score points), but this is a sensitivity flag, not a quality score;
- the core sentinel matched the v1 bridge on winner, terminal reason, and round count in every paired world despite changing stationary qualification and unresolved disposition. The next audit must distinguish unreachable behavior from insufficient observation.

The frozen forensic assessment is [`data/lab/attention-v2-shape-screen-analysis/ASSESSMENT.md`](../data/lab/attention-v2-shape-screen-analysis/ASSESSMENT.md).

## Questions the corrected campaign must answer

1. Do commander composition, triage, movement, and capacity modules cause distinct, reachable decisions?
2. Which rule models support several viable commander archetypes instead of one policy monopoly?
3. Which model changes create counterplay rather than randomness, universal dominance, or simultaneous-terminal churn?
4. Which structural rules are inert, unreachable, or behaviorally equivalent under realistic probes?
5. Do the accepted v1 Scout, Siege, movement, and escort behaviors remain on the accepted side of their regression criteria?
6. Are promising effects stable across seats, battle samples, and fresh seeds?

## Phase 0 — repair the causal contract

Implement one content-addressed commander compiler:

```text
AttentionV2CommanderProfile
  -> exact 3-unit composition
  -> triage command rules
  -> movement rules and fallback
  -> capacity strategy and ability preference
  -> validated AttentionPolicyProgram + controller
```

Every one of the 10 composition, 10 triage, 8 movement, and 8 capacity modules must have explicit resolver behavior. Unknown or unmapped modules are hard errors. The runner must resolve each oriented edge to its left and right commander profiles, apply `seatOrientation`, and pass the resulting compositions and controllers to the engine.

Randomness remains a property of the normalized commander pair, battle sample, and seed—not the model or seat. This preserves common-world comparisons across model rows and exact seat reversals. The oriented edge remains part of the observation identity so the two seats never collapse into one record.

## Phase 1 — enrich the evidence record

Version the run-record schema before rerunning. Each record must retain:

- left/right commander IDs, hashes, and all four module IDs;
- Player 1/Player 2 commander mapping after seat orientation;
- compiled policy IDs and policy hashes;
- composition IDs and chassis counts;
- model and rule-shape hashes;
- normalized pair block, oriented edge, battle sample, seed, and random stream;
- winner, terminal reason, rounds, per-player progress, drift, and status;
- command counts by kind, movement/hold counts, capacity claims and abilities used;
- enabled/eligible/executed counts for every rule mechanic;
- rejection and fallback counts, unresolved backlog, and confidence-default decisions;
- trace, final-state, and compact-outcome hashes.

Aggregation must fail if any declared profile, module, model, edge, sample, or seed is absent or duplicated.

## Phase 2 — deterministic differential probes

Before a matrix, run fixtures that hold the world constant and change one module at a time.

- Nine composition contrasts against a frozen composition anchor.
- Nine triage contrasts against a frozen triage anchor.
- Seven movement contrasts against a frozen movement anchor.
- Seven capacity contrasts against a frozen capacity anchor.
- Both seats, four structural model contexts, four battle-pressure samples, and 32 common seeds.

This is 32 contrasts × 2 seats × 4 models × 4 samples × 32 seeds = **32,768 probe matches**.

Acceptance gates:

- every module compiles and reaches at least one eligible probe;
- every non-anchor module changes an emitted intent or an explicitly measured mechanic counter in at least one eligible probe;
- identical profiles replay byte-equivalent compact outcomes and trace hashes;
- seat reversal swaps commander attribution without changing the common random stream;
- changing the model does not change the pair/world random stream;
- the core-sentinel/v1 equivalence is explained as either a verified reachable no-effect or a newly visible behavioral difference;
- no profile field exists only in provenance.

Any failure stops the campaign.

## Phase 3 — bounded cross-profile audit

Run a **256,000-match** audit before the full screen:

```text
40 model rows × 400 oriented audit edges × 4 battle samples × 4 seeds
```

The 400 edges must include self-play, exact seat reversals, one-module neighbors, distant/adversarial profiles, and fixed sentinel commanders. Produce the complete analysis report and charts from this audit, not merely shard-completion metadata.

Audit gates:

- 100% record/provenance coverage and exact replay on a fixed sample;
- all enabled mechanics have nonzero eligibility and execution counts;
- no unexplained policy or composition collapse;
- self-play seat effects are reported separately from strategic effects;
- module contrasts retain the direction observed by the deterministic probes;
- round-limit terminals remain below 10% and draws below 5%, or the deviation is explicitly reviewed before proceeding;
- storage and runtime stay within the measured envelope.

## Phase 4 — corrected standard shape screen

After the audit passes, freeze a new root plan and run the existing standard screen geometry:

```text
40 model rows × 57,600 oriented commander edges × 1 battle sample × 4 seeds
= 9,216,000 matches
```

Use at least eight resumable shards, one immutable manifest, and a clean source revision. Generate analysis automatically after shard verification. Never reuse the previous plan ID, fold, or report hash.

The analysis must estimate:

- effective commander diversity and diversity by composition;
- best-response regret and counterplay graph connectivity;
- maximum commander dominance with multiplicity-adjusted intervals;
- composition × policy and module × rule-model interactions;
- seat effects from exact reversals;
- enabled-rule reachability and execution;
- stability across seeds and the battle sample;
- v1 regression criteria and paired differences versus the v1 bridge;
- Pareto membership without using predicted cells as gate evidence.

## Survivor decision

Advance no more than six model families. A model remains ineligible unless all original viability criteria are computable and pass. In addition:

- no candidate may rely on the fixed-duel score from the integrity-only run;
- at least two behaviorally distinct commander archetypes must contribute to its frontier position;
- a candidate whose apparent gain is mostly seat advantage, simultaneous-terminal churn, or one composition is rejected or revised;
- structural diversity is a tie-breaker only after viability, regression, and evidence-quality gates pass;
- every selected model links to the corrected report and an explicit selection report.

## Artifact and capacity policy

The corrected enriched screen used 5.347 GiB for gzip shards. At the measured density, the full 30,008,992-run standard campaign projects to 17.410 GiB; provision **21.763 GiB per campaign** with a 25% margin. Provision approximately 217.63 GiB for 10 campaigns, 544.06 GiB for 25, and 1,088.13 GiB for 50. These observed projections supersede the identity-only run's lower-density estimates.

Raw shards are retained only through a verified portable archive containing the manifest, completion report, analysis, charts, and checksums. Compact assessments remain directly readable in the repository. Before raw local shards are removed, perform a full test extraction and checksum every restored file.

## Execution order

1. Implement and test the commander compiler.
2. Version the enriched record and report contracts.
3. Pass the 32,768-match differential probe suite.
4. Run and review the 256,000-match audit.
5. Freeze and execute the corrected 9,216,000-match screen.
6. Aggregate, visualize, and audit all selection gates.
7. Present the eligible Pareto set and a recommendation for the human survivor decision.

## Preflight decision record

Both preregistered preflights passed on 2026-08-09 (America/Los_Angeles):

- Differential probe `attention-v2-probe-285268036f1a53890bb33e1d`: 32,768/32,768 runs, all 32 non-anchor modules eligible and behaviorally distinct, 32/32 exact replays, zero attribution or common-stream mismatches. Report hash `sha256:89babb1eb4cd5614ca76662e6971b5591f74028608828dcb46fe60d5dd7096df`.
- Cross-profile audit `attention-v2-audit-7a29d6caab84785026db10fe`: 256,000/256,000 runs, all required mechanics reached, 64/64 exact replays, zero attribution or common-stream mismatches, 2.98125% draws, and 5.56289% round-limit terminals. Report hash `sha256:37776820c602f99469e1396ea30c6942be4a541a0885da040e65006e81fd40bd`.
- Exact-plan calibration: 8,192 enriched records compressed to 4,985,910 bytes (608.63 bytes/run), projecting 5.22 GiB for the 9,216,000-run screen and 6.53 GiB with the 25% margin. The launch volume had 14.46 GiB free.

The frozen corrected screen is `attention-v2-landscape-standard-957a7ac539e236a0f1387946`, plan hash `sha256:c10c3bec48175b897947618a818105f7c5a4dda41d586510afe2872cac25c542`, using seeds 30,000–30,003 and eight resumable shards. It completed 9,216,000/9,216,000 records with completion report `sha256:9ae18a15408a2ec6272a18efba74d1b64d03b570e605b6d81a3cd10a83702769`.

## Final screen decision

The [corrected assessment](../data/lab/attention-v2-corrected-shape-screen-analysis/ASSESSMENT.md), analysis hash `sha256:9e92787ff92b804fb7facc67b46ad9a9b877a5e8ef569ec3070bc9a52322cb9b`, passed exact coverage, attribution, compiler-identity, policy-identity, and mechanic-reachability checks. All 6,400 profiles appeared under all 40 models; all 57,600 oriented edges and 25,600 exact reversal pairs were present.

Measured outcomes include 2.0916% draws, 9.7023% round-limit terminals, 555.17 softmax-effective commanders, and 7.20 effective compositions. The strongest average module signals favored `scout-line-line`, `risk-adaptive`, `own-front`, and `adaptive`; `siege-siege-siege`, `accept-all`, `flare-evade`, and `never` occupied the opposite ends. These are frozen-screen averages, not context-free rankings: the largest rule×module interaction ranges were 0.212 for objective coupling×movement, 0.191 for base soundness×movement, 0.185 for base soundness×triage, and 0.184 for throughput×composition.

Rows **22, 8, 25, 1, 29, and 15** advance to the generated [causal-refinement campaign](../data/lab/attention-v2-corrected-shape-screen-analysis/NEXT_CAMPAIGN.md). Row 15 is retained as a counterplay-collapse boundary comparator, not as an assumed survivor. The set remains ineligible for final promotion because the screen used one battle sample and four train seeds; exact seat effects were large, pooled gates hid self-play/nearby terminal tails, sparse 8/8 maxima could not support universal-dominance claims, and the accepted v1 regressions plus fresh Macro Flare effect-size test remain pending.

The complete probe, audit, raw matrix, compact assessment, next plan, and twelve chart files are preserved in `data/archives/attention-v2-landscape-standard-957a7ac539e236a0f1387946-corrected-evidence.zip` (5.407 GiB, `sha256:8bcdf08fd3f5aa2130c36332fdf046749b33867612259801a16f15b5ebee900b`). All 42 restored files, including the archive manifest, passed a full extraction and SHA-256 verification before the online matrix directory was removed. The tracked sidecar records manifest hash `sha256:53573544da34d81039b8e1b7ee69fa7e65d95d471c35b60a50cea5bbb5b7216b` and the restore state.
