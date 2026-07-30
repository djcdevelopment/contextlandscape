# Overnight synthetic experiment plan

## Dry-run evidence

- Full Docker/shard/report/gate path: passed.
- Representative matrix: 153,600 runs in 9.49 seconds after deterministic seed pressure was added.
- Stress matrix: 1,536,000 runs in 40.88 seconds with 41.01 MiB of artifacts.
- Measured throughput: about 37,600 runs per second with eight shards.
- Seed pressure now varies starting commander energy, heat, dispersion, and confidence drift and is recorded on every run.

The dry run also found that current composition labels do not yet change outcome curves. Chassis initiative only matters when multiple orders resolve in one slot, while lab policies currently issue one order per slot. Overnight results may describe policy, tuning, and pressure robustness, but must not be presented as chassis-balance evidence.

## Campaign

The unattended campaign runs seven gated matrices totaling 19,456,000 matches:

| Experiment | Question | Runs |
| --- | --- | ---: |
| Doctrine landscape | Are there multiple viable policies, or is each scenario solved by one script? | 1,024,000 |
| Tuning train | Which bounded economy/heat changes improve lesson separation without creating dominance? | 3,072,000 |
| Tuning holdout | Do the same recommendations survive a disjoint seed range? | 3,072,000 |
| Two Baked Slices deep dive | Why is its intended doctrine less robust than the other lessons? | 3,072,000 |
| False Bottleneck deep dive | Does measurement remain valuable under energy and confidence pressure? | 3,072,000 |
| Context Furnace deep dive | Where is the boundary between full-send and consolidation? | 3,072,000 |
| Documentation Fortress deep dive | When does artifact construction become hoarding? | 3,072,000 |

Each experiment emits compressed raw shards, a report, candidate patches, pairwise comparisons, Pareto policies, lesson separation, and pressure sensitivity. Every matrix must pass the lab gate before the next one starts. The campaign stops if free space falls below 50 GiB or any worker/report/gate fails.

## Launch

```powershell
docker compose -p context-landscape-lab -f infra/compose.lab.yml build worker
.\scripts\lab-sleep.ps1 -CampaignId sleep-01 -Shards 12 -DryRun
.\scripts\lab-sleep.ps1 -CampaignId sleep-01 -Shards 12 -MinimumFreeGiB 50
```

Expected runtime is well under the available 3–5 hour window—roughly 15–30 minutes at measured throughput. Extending runtime by duplicating already-covered seeds would add volume without evidence.

## `sleep-01` outcome

The 2026-07-29 campaign completed all seven matrices and all gates:

- 19,456,000 total deterministic runs;
- reports and candidate patches for every matrix;
- 93.07 GiB free after completion, above the 50 GiB stop threshold;
- no campaign process or lab worker left running.

The first tuning report exceeded Node's default heap because the reducer retained all 3,072,000 records. The raw shards were preserved. Reporting was changed to stream compressed records into bounded aggregate maps, and the launcher now reuses matching completed shards and reports. The preserved tuning dataset then reduced in 17.85 seconds, passed its gate, and the Docker campaign resumed without recomputing completed work.

Train and holdout reproduced the same complete tuning rankings. False Bottleneck and Context Furnace had unique leaders; Two Baked Slices and Documentation Fortress each had a three-way tie. The larger policy search reversed False Bottleneck by a narrow score margin and resolved both ties in favor of `full-send-cheap`, so none of those results is a promotion-ready patch. Context Furnace consistently preferred `heat-minus-one`.

Artifacts start at [data/lab/sleep-01-summary.json](data/lab/sleep-01-summary.json). Composition outcomes remain non-distinct for the reason identified in the dry run, so this campaign is policy/tuning evidence and not chassis-balance evidence.

## Downstream use

The campaign's strongest edges were converted into GL-001 through GL-005, documented in [GAMEPLAY_LAB_PLAN.md](GAMEPLAY_LAB_PLAN.md). Those packs add the missing fidelity step: a player must make and explain decisions before seeing the treatment or synthetic recommendation. A completed human disposition emits a control-versus-selected manifest that can be run by the same matrix worker.

The campaign and implementation lessons are captured in [GAMEPLAY_LAB_RETROSPECTIVE.md](GAMEPLAY_LAB_RETROSPECTIVE.md).

## Morning decisions

1. Keep or reject each tuning recommendation based on train/holdout agreement.
2. Flag scenarios with lesson separation below 0.20 in any pressure band.
3. Flag policies that dominate all Pareto contexts.
4. Identify pressure boundaries where the intended doctrine changes from reliable to fragile.
5. Use the Two Baked Slices deep dive as the first balance/content revision candidate.
6. Add mechanically distinct chassis/loadout effects before running a true composition-balance campaign.
