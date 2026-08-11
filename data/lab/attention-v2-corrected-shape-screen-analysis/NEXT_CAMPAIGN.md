# Attention v2 causal-refinement campaign

Status: planned; parent screen complete  
Parent plan: `attention-v2-landscape-standard-957a7ac539e236a0f1387946`  
Parent report: `sha256:9ae18a15408a2ec6272a18efba74d1b64d03b570e605b6d81a3cd10a83702769`  
Parent analysis: `sha256:9e92787ff92b804fb7facc67b46ad9a9b877a5e8ef569ec3070bc9a52322cb9b`

## Objective

Separate model effects that survived the corrected train screen from one-sample, seat, and sparse-opponent artifacts before materializing the expensive standard refinement stages. This is a bounded causal audit, not a promotion run.

## Candidate rows

- Row 22: `attention-v2-model-22-a349f2bf2755a55a` — diversity-cycle-anchor
- Row 8: `attention-v2-model-08-197a490fef6fecbb` — counterplay-frontier
- Row 25: `attention-v2-model-25-b2c6c9d0ad5b34b5` — counterplay-frontier
- Row 1: `attention-v2-model-01-91a25449fe7e0b0b` — round-limit-contrast
- Row 29: `attention-v2-model-29-a691e3a93590aabc` — lower-seat-effect-contrast
- Row 15: `attention-v2-model-15-f217786d8c3b5e80` — counterplay-collapse-boundary

## Isolation targets

- **Seat sensitivity:** the parent screen's pooled Player-1 score was 0.5277, but exact reversals had 0.1563 mean absolute seat effect and self-play scored 0.5465 for Player 1. Estimate signed and absolute effects per sample instead of trusting cancellation in a pooled mean.
- **Stratum tails:** self-play reached 10.57% draws and 16.42% round limits; nearby edges reached 15.38% round limits. Preserve fixed stratum quotas and gate them separately.
- **Rule × doctrine interactions:** the largest observed ranges were objectiveCoupling × movementModule 0.212, baseSoundness × movementModule 0.191, baseSoundness × triageModule 0.185, throughputShape × compositionModule 0.184. Choose the four pressure samples to stress those axes rather than resampling arbitrary worlds.
- **Sparse dominance:** every model produced at least one 8/8 commander maximum, so the parent maximum was non-identifying. The replicated panel must estimate supported intervals and distinguish a true universal strategy from eight lucky edges.
- **Capacity causality:** Macro Flare executed 232,852 times but induced only 2,328 drift defeats. Keep the fresh paired Macro Flare effect-size test separate from reachability.

## Design

1. **Module-direction replication:** 6 models × 32 one-module contrasts × 2 seats × 4 orthogonal battle-pressure samples × 64 fresh seeds = **98,304 matches**. Require each selected model to reproduce the sign of its screen-level module contrasts with bootstrap intervals and exact common streams.
2. **Counterplay replication:** 6 models × 400 oriented edges (self-play, exact reversals, best/worst empirical responses, one-module neighbors, and fixed sentinels) × 8 battle samples × 8 fresh seeds = **153,600 matches**.
3. **Regression panel:** rerun the original v1 Scout specialization, Siege specialization, movement-value, and stationary-Line escort cells plus the revised causal Macro Flare follow-up on fresh seeds. Preserve the original thresholds without retuning.

Total before any larger refinement: **251,904 landscape matches plus the fixed regression panel**.

## Gates

- exact attribution, replay, and common-stream checks remain hard failures;
- the commander- and composition-breadth floors from the parent screen must replicate across samples;
- every candidate must retain at least 2% softmax-effective commander diversity and three composition modules among its top 20;
- draw and round-limit gates must be reported both overall and by fixed edge stratum; pooled success cannot mask a failing self-play or nearby tail;
- no candidate may exceed 5% draws or 10% round-limit terminals overall; fewer than 10% of commanders may appear universal in the sparse eight-opponent screen;
- the 95% interval for systemic signed seat effect must overlap the ±5-point equivalence band, while absolute reversal sensitivity remains a reported diagnostic;
- in the replicated panel, no commander may have a multiplicity-adjusted lower confidence bound above 90% dominance;
- module-effect signs must replicate across seats and at least three of four pressure axes;
- counterplay must retain a nontrivial cyclic SCC rather than collapse to a universal ladder;
- all four accepted v1 regression criteria must pass; Macro Flare uses the locked fresh causal criterion, not the historically failed 80% claim;
- only passing rows may be materialized into survivor-refinement or holdout catalogs.

## Artifact policy

Write enriched gzip JSONL, a compact report, charts, exact checksums, and a verified archive. Keep the parent screen immutable and link every downstream manifest to the report and analysis hashes above.
