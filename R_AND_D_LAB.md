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

The report includes per-cell win rate with a 95% interval, objective progress, energy spent, rejection rate, heat, dispersion, lesson separation between intended and non-intended policies, pairwise relative comparisons, non-dominated (Pareto) policies, and ranked tuning recommendations. Every run carries the engine/scenario version, seed, composition, tuning, policy, event hash, and projection hash.

For an unattended Docker worker on OMEN or AM4:

```powershell
docker compose -f infra/compose.lab.yml build worker
docker compose -f infra/compose.lab.yml run --rm `
  -e LAB_MATRIX_ID=overnight-01 `
  -e LAB_RUNS=1000 `
  -e LAB_POLICIES=32 `
  -e LAB_SHARDS=1 `
  worker
docker compose -f infra/compose.lab.yml run --rm worker node apps/lab/dist/main.js --report=data/lab/overnight-01
```

To fan one matrix out across eight Docker workers and automatically aggregate the result:

```powershell
.\scripts\lab-night.ps1 -MatrixId overnight-01 -Runs 1000 -Policies 32 -Tunings 6 -Shards 8
```

For the document-driven sleep campaign, see [OVERNIGHT_EXPERIMENT_PLAN.md](OVERNIGHT_EXPERIMENT_PLAN.md) and run:

```powershell
.\scripts\lab-sleep.ps1 -CampaignId sleep-01 -Shards 12 -MinimumFreeGiB 50
```

For scale-out, launch the same worker once per shard with the same matrix ID and `LAB_SHARDS=N`, setting `LAB_SHARD=0..N-1`. Shards are independent and resumable; only the final report needs all shard files. The lab image is private and does not expose the public match service.

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
