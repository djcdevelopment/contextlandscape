# Mech Commander

The first prototype of the AI-orchestration autobattler described in the two design documents in this repository.

The prototype is intentionally a portable Linux-container application: a deterministic TypeScript rules engine, a PostgreSQL-backed match API, and a React browser board. OMEN is the development target; AM4 and GCP consume promoted images.

## Current prototype

The verified local build now includes:

- four versioned single-player scenarios with deterministic replay and reconstruction;
- a sharded synthetic balance lab with train/holdout reports and recommendation-only candidate patches;
- five blinded gameplay-lab packs containing 24 playable variants;
- persistent lab sessions, pre/post-reconstruction review gates, joined exports, and executable follow-up matrices;
- PostgreSQL and in-memory runtime modes packaged in portable Linux images.

The gameplay-lab implementation is verified on OMEN, but has not yet been promoted to the public AM4 route. The current public release remains the baseline `p0-rd-20260729-r5`; its gameplay-lab API paths return the gallery authentication response until the application image and AM4 Caddy allowlist are promoted together.

## OMEN development

```powershell
docker compose -f infra/compose.dev.yml up --build
```

Open <http://localhost:5173>. The API is available at <http://localhost:9080>.

Run the complete local acceptance seam:

```powershell
npm run build
npm run typecheck
npm test
npm run gameplay-lab:preflight
.\scripts\smoke.ps1
.\scripts\research-smoke.ps1
.\scripts\gameplay-lab-smoke.ps1
```

## Public playtest deployment

The current verified public runtime is available at <https://am4.tail8e749c.ts.net/mech/> through AM4's Tailscale Funnel. It runs on OMEN's Tailscale address with release image `p0-rd-20260729-r5`; the local development stack remains on ports `5173` and `9080`.

See [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) for the gameplay-lab promotion gate, release health checks, restart persistence, ingress validation, and rollback.

For a verified production image:

```powershell
$releaseId = "p0-gameplay-labs-20260729-r1"
.\scripts\build.ps1 -Target Verify
.\scripts\build.ps1 -Target Image -ReleaseId $releaseId -ImageTag "mech-commander:$releaseId"
```

The release Compose file intentionally has no `build:` section. A remote host receives an already-verified image and starts it with `--no-build`.

To promote an image over the existing SSH/Tailscale path, after confirming the remote
environment already contains `MECH_POSTGRES_PASSWORD` and any ingress settings:

```powershell
.\scripts\promote.ps1 `
  -Image "mech-commander:$releaseId" `
  -ReleaseId $releaseId `
  -SshTarget am4 `
  -DryRun
```

Remove `-DryRun` only after the local image and release ID are correct. The promotion
transfers an OCI archive, checks the loaded image identity, backs up the remote pin and
Compose file, starts without rebuilding, and leaves a rollback backup on the remote host.

## Documentation map

- [PLAYTEST_WORKBOOK.md](PLAYTEST_WORKBOOK.md): first-time baseline scenario and UI verification.
- [R_AND_D_LAB.md](R_AND_D_LAB.md): simulator, matrix worker, evidence model, and research gates.
- [OVERNIGHT_EXPERIMENT_PLAN.md](OVERNIGHT_EXPERIMENT_PLAN.md): the completed 19.456-million-run campaign.
- [GAMEPLAY_LAB_PLAN.md](GAMEPLAY_LAB_PLAN.md): reusable synthetic-to-human research architecture.
- [GAMEPLAY_LAB_WORKBOOK.md](GAMEPLAY_LAB_WORKBOOK.md): hands-on blinded lab procedure and follow-up commands.
- [GAMEPLAY_LAB_RETROSPECTIVE.md](GAMEPLAY_LAB_RETROSPECTIVE.md): outcomes, surprises, remaining risks, and next-cycle changes.
- [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md): immutable-image promotion, public ingress, acceptance, and rollback.
