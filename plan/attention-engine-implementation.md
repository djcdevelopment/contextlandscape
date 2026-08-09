# Attention Engine Implementation Strategy

Status: implemented on `feature/attention-duel-matrix`; canonical campaign execution follows the source commit.

## Goal

Turn the attention-mechanics specification into a versioned, deterministic model that can run large paired matrices and preserve an auditable link from every outcome back to the exact source, model, scenario, policy set, manifest, worker image, and shard that produced it.

## Locked model

- Two-player duel on a functional 10×10 Chebyshev grid.
- Simultaneous movement with exclusive occupancy and active, scenario-defined fronts.
- Scout Recon Lock, Line Target Lock, and Siege Command Uplink use one-round delayed stationary effects.
- One globally claimed Fibonacci capacity slot per round, with alternating priority and personal-claim ability unlocks.
- Perfect Focus affects the current command phase; Overclock affects the current phase; Macro Flare affects the next two emissions.
- Drift defeats progress when both thresholds cross in one resolution. Bilateral terminals compare progress, then lower drift, then remaining attention; an exact tie is a draw.
- Hidden artifact truth/noise is keyed by scenario/seed/unit/round only. Policy IDs and match IDs never alter the latent world, and RNG keys are absent from player projections.

## Implementation slices

1. Contracts
   - Versioned schemas for model, scenarios, compositions, variants, public projections, intents, declarative policies, manifests, runs, shard markers, reports, gates, and experiment ledger entries.
2. Reducer and policies
   - Pure deterministic attention reducer, bounded controller loop, incremental trace hash, summary counters, and projection-only policy interpreter.
3. Matrix adapter
   - Paired-block sharding, streamed gzip JSONL, immutable manifests/markers/reports, exact record-set verification, paired confidence intervals, interaction estimates, and predeclared gates.
4. Provenance and history
   - Git source/tree and clean-state capture, model/scenario/policy hashes, optional image digest, manifest/shard/report hashes, strict audit, aligned comparison, and durable compact evidence archive.
5. Orchestration
   - Build one worker image, freeze every manifest before parallel work, resume only hash-valid shards, aggregate, strictly audit, then explicitly record reviewed evidence.

## Canonical matrices

| Campaign | Runs | Purpose |
| --- | ---: | --- |
| `stationary-train` | 480,000 | Screen stationary effects, compositions, policies, and ablations. |
| `capacity-train` | 144,000 | Screen pioneering/follower strategies, ability reachability, and ablations. |
| `holdout` | 50,000 | Evaluate predeclared gates on a disjoint seed range. |

Holdout gates use 95% bounds for Scout and Siege specialization, movement value, Flare-induced drift defeat under attention overload, and stationary escort drift efficiency. A point estimate alone cannot pass a gate.

## Historical lookup

The chain is:

`source revision + source tree + model/scenario/policy hashes + image digest -> manifestHash -> shardHash -> outcomeHash -> reportHash -> experiment ledger entry`

Raw shards live under ignored `data/lab`. Explicit recording copies the sealed manifest and compact report into tracked `data/experiments/<matrixId>` and appends a hash-linked ledger entry, so a retained outcome remains inspectable after raw-shard cleanup or on a fresh clone.

## Release sequence

1. Run all builds, typechecks, unit/integration tests, local CLI smoke, and a two-shard Docker smoke.
2. Commit the source implementation.
3. From the clean commit, build one pinned worker and run all three canonical matrices.
4. Strictly audit every matrix and review holdout gates.
5. Record all three compact evidence bundles with disposition `keep` only if every required gate passes; otherwise use `revise` and preserve the failed evidence.
6. Commit the evidence separately. Do not rewrite completed manifests or reports.
