# Context Landscape R&D lab

This is the research surface for validating the game thesis before Discord, realtime play, or profiles become product commitments.

## Implemented research loop

The repository now supports the full evidence loop, while keeping content promotion manual:

```text
seeded simulation
  -> sharded synthetic matrix
  -> train/holdout finding
  -> versioned blinded gameplay lab
  -> human explanation before reconstruction
  -> keep / revise / reject
  -> bounded follow-up matrix
  -> explicit scenario-version decision
```

The completed `sleep-01` campaign generated 19,456,000 deterministic runs. Those results seeded five gameplay packs: GL-001 through GL-005, with 24 total variants. Startup preflight verifies source report availability, scenario versions, variant reachability, and exact control replay hashes before the lab catalog is exposed.

Synthetic evidence establishes relative behavior under known policies and pressures. Human lab evidence establishes whether a mechanic is visible, legible, and interesting. Neither is treated as the other, and no report automatically changes production tuning.

## Scenario pack

The current registry contains four versioned scenarios:

- `two-baked-slices`: integration contracts and rollback.
- `false-bottleneck`: measure before optimizing the visible subsystem.
- `context-furnace`: heat management, consolidation, and clean replacement.
- `documentation-fortress`: artifact return versus infrastructure hoarding.

Each scenario carries an expected lesson, false leads, enemy doctrine, and rules profile. Completed matches keep the scenario ID and version in their state.

## Batch simulation

Run the headless simulator from the repository root:

```powershell
npm run simulate -- --count=100
npm run simulate -- --scenario=false-bottleneck --count=1000
```

The JSON report compares named doctrines by win rate, average objective progress, and commander energy spent. It is a directional balance instrument, not proof of player enjoyment.

## Synthetic balance lab

The `@landscape/lab` worker expands the simulator into a reproducible matrix across scenarios, generated policies, force compositions, and seeds. It writes a manifest plus compressed JSONL shard files under `data/lab/<matrix-id>/`; raw synthetic runs never enter the match PostgreSQL database.

Run a small local matrix and aggregate it:

```powershell
npm run lab -- --matrix=local-check --runs=25 --policies=12 --shards=1 --shard=0
npm run lab -- --report=data/lab/local-check
npm run lab -- --matrix=tuning-check --runs=100 --policies=32 --tunings=6
npm run lab -- --report=data/lab/tuning-check
.\scripts\lab-gate.ps1 -ReportPath data/lab/tuning-check/report.json -MinimumRuns 100
```

The report includes per-cell win rate with a 95% interval, objective progress, energy spent, rejection rate, heat, dispersion, lesson separation between intended and non-intended policies, pairwise relative comparisons, non-dominated (Pareto) policies, and ranked tuning recommendations. Every new run also links to a sealed v2 manifest through its manifest hash and provenance ID.

### Build and experiment provenance

New matrices are content-addressed from source to report. A sealed manifest records the Git revision and tree, clean/dirty state, engine and model versions, canonical hashes of the selected scenarios and policies, runtime identity, and optional worker image digest. Each shard completion marker records its compressed-file hash and manifest hash. Reports and candidate patches repeat the provenance and link back to the same manifest.

Use a canonical run for evidence that may be retained or compared historically. It refuses a dirty or unidentified checkout:

```powershell
npm run lab -- --matrix=canonical-check --runs=25 --policies=12 --shards=1 --all-shards=true --canonical=true
npm run lab -- --audit=data/lab/canonical-check --strict=true
```

Exploratory dirty-worktree runs are allowed without `--canonical=true`, but are labeled noncanonical and cannot be silently promoted into the historical ledger. Legacy v1 matrices remain readable and report as `legacy-unverifiable`; current code never guesses a Git revision for them.

Compare two completed matrices by both build shape and aligned outcome cells:

```powershell
npm run lab -- --left=data/lab/train-01 --right=data/lab/holdout-01
```

After reviewing a canonical result, explicitly add its compact record to the tracked ledger. Raw shards remain ignored:

```powershell
npm run lab -- --record=data/lab/train-01 --stage=train --hypothesis="Stationary traits break composition invariance"
```

The ledger lives at `data/experiments/ledger.json`. Recording also copies the sealed manifest, compact report, and candidate recommendations into `data/experiments/<matrix-id>/`, so historical comparisons survive raw-shard retention and fresh clones. Record campaign matrices after the full campaign completes so these tracked evidence changes do not dirty the checkout between canonical train and holdout runs.

### Attention economy experiment suite

`duel-capacity-v1` is a separate, versioned two-player model for the attention-command mechanics in `design/attention-mechanics-spec.md`. It keeps hidden truth in the reducer, gives policies only public projections, and keys artifact truth/noise by scenario and seed rather than policy or match ID. This makes policy comparisons paired counterfactuals: both arms see the same latent world.

The committed campaign catalog contains:

- `stationary-train`: 480,000 runs over stationary effects, compositions, scenarios, and ablations.
- `capacity-train`: 144,000 runs over shared capacity strategies and ability ablations.
- `holdout`: 50,000 runs on a disjoint seed range with predeclared 95% acceptance gates.

Preview them without creating a manifest:

```powershell
npm run lab -- --attention-campaign=stationary-train --dry-run=true
npm run lab -- --attention-campaign=capacity-train --dry-run=true
npm run lab -- --attention-campaign=holdout --dry-run=true
```

Run the canonical suite with one source revision and one Docker image digest:

```powershell
.\scripts\lab-attention.ps1 -Canonical -Shards 12 -MinimumFreeGiB 20
```

The launcher freezes all three manifests before starting any shard, resumes only hash-valid completed shards, then writes and strictly audits each report. A failed holdout gate is evidence to revise the mechanic or policy; it is never rewritten or silently relabeled as a pass.

The canonical v1r1 campaign completed 674,000 runs. Scout specialization, Siege specialization, movement value, and stationary Line escort passed; Macro Flare's predeclared 80% causal drift-defeat gate failed at 22.34%. The reviewed decision preserves that failure, accepts the four passing mechanics as regression constraints, and pre-registers a fresh paired effect-size experiment in [`design/attention-duel-v1r1-decision.md`](design/attention-duel-v1r1-decision.md).

### Broad commander-landscape sweep

The next phase separates the physical commander theater from the doctrine outcome atlas. The theater
is a sparse 6,400×6,400 strategic plane whose active cells may expose 32×32×32 battle volumes. The
atlas contains exactly 6,400 normalized commander profiles and samples their 40,960,000 possible
directed matchups through a frozen, connected degree-eight graph with both seats and self-play.

The contract-native planner freezes commander, model-row, fold-specific edge, battle-sample, and
paired-world hashes and validates exact multiplicative run arithmetic. The lean 5,949,088 and deep
153,570,624 profiles are sizing envelopes; the fully materialized standard design contains 30,008,992
runs. Only the 40-row shape screen is initially materialized; every later model set requires a new,
parent-linked plan backed by completed selection evidence.

The first durable shape screen completed all 9,216,000 planned runs with eight verified gzip shards.
Its post-run audit found that commander edge IDs affected random streams but the runner still supplied
one balanced composition and one fixed policy duel. It is therefore retained as resolver, throughput,
integrity, and narrow paired rule-model evidence—not commander or survivor-selection evidence. The
compact [forensic assessment](data/lab/attention-v2-shape-screen-analysis/ASSESSMENT.md), charts, and
[corrected campaign plan](plan/attention-v2-corrected-shape-screen.md) remain readable after the raw
shards were moved into a fully extraction-tested archive. The corrected commander compiler and enriched
records passed a 32,768-run module-discrimination suite and a 256,000-run cross-profile audit before the
new standard screen was launched. The audit reached every required mechanic, replayed 64 fixed cells
exactly, and remained below its preregistered draw and round-limit thresholds.

The corrected screen then completed all 9,216,000 enriched records over 40 rule models, 6,400 causal
commander programs, 57,600 oriented edges, and four common seeds. The
[corrected assessment](data/lab/attention-v2-corrected-shape-screen-analysis/ASSESSMENT.md) found 555.17
softmax-effective commanders, 7.20 effective compositions, 2.09% draws, complete required-mechanic
reachability, and strong rule×doctrine interactions. It also found evidence that pooled summaries hide
important structure: exact reversals averaged 0.1563 absolute seat effect, self-play reached 10.57%
draws and 16.42% round-limit terminals, and every model had at least one sparse 8/8 commander maximum.
Rows 22, 8, 25, 1, 29, and 15 therefore advance only to the hash-bound
[causal-refinement plan](data/lab/attention-v2-corrected-shape-screen-analysis/NEXT_CAMPAIGN.md). The set
includes an explicit counterplay-collapse boundary comparator; none of the six is a promoted survivor.
The 5.407 GiB corrected evidence ZIP contains the probe, audit, raw matrix, compact analysis, charts, and
next plan; all 42 restored files passed SHA-256 verification before the online matrix was removed.

For an unattended Docker worker on OMEN or AM4, use the orchestration script below. It builds the worker once, captures its image digest and host Git identity, freezes one manifest, then gives that exact manifest to every shard.

To fan one matrix out across eight Docker workers and automatically aggregate the result:

```powershell
.\scripts\lab-night.ps1 -MatrixId overnight-01 -Runs 1000 -Policies 32 -Tunings 6 -Shards 8 -Canonical
```

For the document-driven sleep campaign, see [OVERNIGHT_EXPERIMENT_PLAN.md](OVERNIGHT_EXPERIMENT_PLAN.md) and run:

```powershell
.\scripts\lab-sleep.ps1 -CampaignId sleep-01 -Shards 12 -MinimumFreeGiB 50
```

For scale-out, materialize one manifest before launching workers and pass that file to every shard. Never let parallel workers independently construct a manifest: timestamps and build identity are part of its hash. Shards are independent and resumable; v2 aggregation requires exactly the declared shard set and verifies every marker, file hash, record count, matrix ID, engine version, and provenance link. The lab image is private and does not expose the public match service.

Keep raw artifacts bounded with a dry-run-first retention command:

```powershell
.\scripts\lab-retain.ps1 -Root data/lab -KeepDays 14
.\scripts\lab-retain.ps1 -Root data/lab -KeepDays 14 -Apply
```

Auto-balance is intentionally recommendation-only at this stage. Candidate parameter patches must be evaluated against holdout seeds and the research gates below before a scenario version is promoted.

The `mechanics-lab` GitHub workflow runs typechecks, tests, a small matrix on pull requests and pushes, and a larger matrix nightly. It validates report and recommendation output before content changes can be considered for promotion.

## Replay and reconstruction

The engine exports `runReplay`, which reruns seeded order batches and emits a `ReplayManifest` containing scenario/version, event count, event hash, and projection hash. `buildReconstruction` derives a post-battle report from events:

- action and rejection counts;
- commander energy spent;
- objective movement;
- artifacts built;
- event-type frequencies;
- a high-ground sequence;
- one deterministic counterfactual claim.

The web board exposes the scenario selector, transaction log, and reconstruction panel. The API surfaces are:

```text
GET  /api/scenarios
GET  /api/matches/:id/reconstruction
POST /api/research/observations
GET  /api/gameplay-labs
POST /api/gameplay-labs/:labId/sessions
GET  /api/gameplay-lab-sessions/:sessionId
POST /api/gameplay-lab-sessions/:sessionId/bookmarks
POST /api/gameplay-lab-sessions/:sessionId/trials/:trialId/complete
POST /api/gameplay-lab-sessions/:sessionId/reviews
GET  /api/gameplay-lab-sessions/:sessionId/reconstruction
GET  /api/gameplay-lab-sessions/:sessionId/export
```

## Playtest instrumentation

The browser creates a local playtest session ID and records `match.created`, `match.resumed`, `cell.selected`, `command.issued`, and `reconstruction.loaded`. Observations are deliberately small and event-shaped so they can be aggregated without treating telemetry as match truth.

The reusable plan for turning synthetic findings into blinded, single-player review packs is in [GAMEPLAY_LAB_PLAN.md](GAMEPLAY_LAB_PLAN.md). The implemented operator flow and verification checklist are in [GAMEPLAY_LAB_WORKBOOK.md](GAMEPLAY_LAB_WORKBOOK.md).

Lab definitions keep their hidden tuning, treatment mapping, synthetic recommendation, and doctrine identifiers on the server. Browser payloads use anonymous trial labels and a blinded `tuningId`. The treatment reveal is available only after all trials and required reviews are complete.

Run its reachability and full API workflow checks with:

```powershell
npm run gameplay-lab:preflight
.\scripts\gameplay-lab-smoke.ps1
```

After a human marks a lab `keep` or `revise`, run the emitted bounded matrix locally:

```powershell
npm run lab -- --manifest=data/playtests/<lab-id>/<lab-session-id>/follow-up-matrix.json --all-shards=true
```

Or run the same manifest in the portable lab container:

```powershell
docker compose -f infra/compose.lab.yml run --rm worker `
  node apps/lab/dist/main.js `
  --manifest=data/playtests/<lab-id>/<lab-session-id>/follow-up-matrix.json `
  --all-shards=true
```

Use the observation stream to answer:

1. Did a first-time player choose a sensible first action?
2. Could they explain the result from the reconstruction?
3. Did they change doctrine on replay?
4. Did they recognize artifact return, heat, and dispersion as distinct tradeoffs?

The implementation retrospective, including the limits discovered during the overnight run and gameplay-lab build, is in [GAMEPLAY_LAB_RETROSPECTIVE.md](GAMEPLAY_LAB_RETROSPECTIVE.md).

## Research gates

Do not advance to async PvP until the solo research loop demonstrates:

- exact replay equality for seeded runs;
- at least two viable doctrines across the scenario pack;
- no single chassis dominating every scenario;
- most uncoached players can explain one win or loss;
- replay behavior shows intentional doctrine changes rather than random clicking.
