# Mech Commander deployment runbook

## Current public baseline

As of 2026-07-29, the public endpoint is healthy on release `p0-rd-20260729-r5`, but that release predates the gameplay-lab promotion. The current AM4 Caddy allowlist routes the baseline game/research APIs and returns `401` from the gallery authentication handler for both gameplay-lab route families.

```text
https://am4.tail8e749c.ts.net
        |
        | Tailscale Funnel -> AM4 Caddy
        | current: /mech/, /assets/, /api/matches*, /api/scenarios,
        |          /api/challenges*, /api/research/*, /health/*, /version
        v
OMEN 100.124.12.37:9081
        |
        | mech-commander:p0-rd-20260729-r5
        v
PostgreSQL persistent bind mount: infra/data/public/postgres
```

The development stack remains separate on OMEN: UI `127.0.0.1:5173`, API `127.0.0.1:9080`. The public runtime uses the verified immutable image on `100.124.12.37:9081`.

## Release and deploy

Keep the deployment secret file local and untracked. It is `.env.omen`, covered by `.gitignore`, and contains the PostgreSQL password, image pin, OMEN Tailscale bind address, and public port.

Build a verified image and pin its release ID:

```powershell
.\scripts\build.ps1 -Target Verify
.\scripts\build.ps1 -Target Image -ReleaseId p0-rd-20260729-r5 -ImageTag mech-commander:p0-rd-20260729-r5
```

Start or update the OMEN runtime without rebuilding:

```powershell
docker compose -p mech-commander-public --env-file .env.omen -f infra/compose.release.yml up -d --no-build
```

## Health and public acceptance checks

```powershell
Invoke-RestMethod https://am4.tail8e749c.ts.net/health/ready
Invoke-RestMethod https://am4.tail8e749c.ts.net/version
.\scripts\smoke.ps1 -BaseUrl https://am4.tail8e749c.ts.net
.\scripts\research-smoke.ps1 -BaseUrl https://am4.tail8e749c.ts.net
.\scripts\gameplay-lab-smoke.ps1 -BaseUrl https://am4.tail8e749c.ts.net
```

After a gameplay-lab promotion, the checks must report the newly selected release ID, PostgreSQL persistence, victory, event sequence `10`, persisted event history `10`, four registered scenarios, a reconstruction report, an accepted challenge, five gameplay labs, and all three smoke-pass markers.

The browser entry point is:

```text
https://am4.tail8e749c.ts.net/mech/
```

The transaction log is backed by the persisted match event history and should survive a browser refresh or app restart.

## Restart persistence check

```powershell
docker compose -p mech-commander-public --env-file .env.omen -f infra/compose.release.yml restart app
Invoke-RestMethod https://am4.tail8e749c.ts.net/health/ready
```

Reload a known match through `/api/matches/<match_id>` and confirm its `status`, `eventSequence`, and `events` remain intact.

## AM4 ingress checks

AM4 owns the Tailscale Funnel and Caddy listener. Before or after an ingress edit:

```powershell
ssh am4 "sudo caddy validate --config /etc/caddy/Caddyfile"
ssh am4 "sudo tailscale serve status"
```

The Caddy configuration keeps the existing gallery routes and proxies only the Mech Commander paths to OMEN. Each edit creates a backup at `/etc/caddy/Caddyfile.pre-mech-<timestamp>`.

Gameplay labs add two explicit public API route families. The `@mech_api` allowlist must contain:

```caddyfile
/api/gameplay-labs /api/gameplay-labs/* /api/gameplay-lab-sessions /api/gameplay-lab-sessions/*
```

Add the same paths to the gallery matcher's `not path` defense-in-depth list. Validate, reload, and then confirm both return from Mech Commander rather than the gallery authentication handler:

```powershell
curl.exe -sS -o NUL -w "%{http_code}`n" https://am4.tail8e749c.ts.net/api/gameplay-labs
curl.exe -sS -o NUL -w "%{http_code}`n" https://am4.tail8e749c.ts.net/api/gameplay-lab-sessions/not-real
```

The expected statuses after promotion are `200` and `404`.

The release Compose stack persists both PostgreSQL and gameplay-lab exports. Do not remove either path during promotion or rollback:

```text
infra/data/public/postgres
infra/data/public/playtests
```

## Rollback

For an application rollback, change `MECH_COMMANDER_IMAGE` and `MECH_COMMANDER_RELEASE` in `.env.omen` to the prior verified image, then run:

```powershell
docker compose -p mech-commander-public --env-file .env.omen -f infra/compose.release.yml up -d --no-build
```

For an ingress rollback, restore the appropriate AM4 backup and reload only after validation:

```powershell
ssh am4 "sudo cp /etc/caddy/Caddyfile.pre-mech-<timestamp> /etc/caddy/Caddyfile"
ssh am4 "sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy"
```

Do not remove `infra/data/public/postgres` or `infra/data/public/playtests` during rollback; they contain the public match history and gameplay-lab evidence.
