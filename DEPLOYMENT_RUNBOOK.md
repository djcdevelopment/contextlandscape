# Context Landscape deployment runbook

`<public-host>` and `<omen-tailnet-ip>` are placeholders. Both are private-network addresses and are
deliberately not published in this repository; substitute the real values from `.env.omen`, which is
untracked. Do not paste the resolved addresses back into any tracked file.

## Current public baseline

As of 2026-07-29, the public endpoint is healthy on release `p0-rd-20260729-r5`, but that release predates the gameplay-lab promotion. The current AM4 Caddy allowlist routes the baseline game/research APIs and returns `401` from the gallery authentication handler for both gameplay-lab route families.

```text
https://<public-host>
        |
        | Tailscale Funnel -> AM4 Caddy
        | current: /landscape/, /assets/, /api/matches*, /api/scenarios,
        |          /api/challenges*, /api/research/*, /health/*, /version
        v
OMEN <omen-tailnet-ip>:9081
        |
        | context-landscape:p0-rd-20260729-r5
        v
PostgreSQL persistent bind mount: infra/data/public/postgres
```

The development stack remains separate on OMEN: UI `127.0.0.1:5173`, API `127.0.0.1:9080`. The public runtime uses the verified immutable image on `<omen-tailnet-ip>:9081`.

## Release and deploy

Keep the deployment secret file local and untracked. It is `.env.omen`, covered by `.gitignore`, and contains the PostgreSQL password, image pin, OMEN Tailscale bind address, and public port.

Build a verified image and pin its release ID:

```powershell
.\scripts\build.ps1 -Target Verify
.\scripts\build.ps1 -Target Image -ReleaseId p0-rd-20260729-r5 -ImageTag context-landscape:p0-rd-20260729-r5
```

Start or update the OMEN runtime without rebuilding:

```powershell
docker compose -p context-landscape-public --env-file .env.omen -f infra/compose.release.yml up -d --no-build
```

## Health and public acceptance checks

```powershell
Invoke-RestMethod https://<public-host>/health/ready
Invoke-RestMethod https://<public-host>/version
.\scripts\smoke.ps1 -BaseUrl https://<public-host>
.\scripts\research-smoke.ps1 -BaseUrl https://<public-host>
.\scripts\gameplay-lab-smoke.ps1 -BaseUrl https://<public-host>
```

After a gameplay-lab promotion, the checks must report the newly selected release ID, PostgreSQL persistence, victory, event sequence `10`, persisted event history `10`, four registered scenarios, a reconstruction report, an accepted challenge, five gameplay labs, and all three smoke-pass markers.

The browser entry point is:

```text
https://<public-host>/landscape/
```

The transaction log is backed by the persisted match event history and should survive a browser refresh or app restart.

## Restart persistence check

```powershell
docker compose -p context-landscape-public --env-file .env.omen -f infra/compose.release.yml restart app
Invoke-RestMethod https://<public-host>/health/ready
```

Reload a known match through `/api/matches/<match_id>` and confirm its `status`, `eventSequence`, and `events` remain intact.

## AM4 ingress checks

AM4 owns the Tailscale Funnel and Caddy listener. Before or after an ingress edit:

```powershell
ssh am4 "sudo caddy validate --config /etc/caddy/Caddyfile"
ssh am4 "sudo tailscale serve status"
```

The Caddy configuration keeps the existing gallery routes and proxies only the Context Landscape paths to OMEN. Each edit creates a backup at `/etc/caddy/Caddyfile.pre-mech-<timestamp>`.

Gameplay labs add two explicit public API route families. The `@mech_api` allowlist must contain:

```caddyfile
/api/gameplay-labs /api/gameplay-labs/* /api/gameplay-lab-sessions /api/gameplay-lab-sessions/*
```

Add the same paths to the gallery matcher's `not path` defense-in-depth list. Validate, reload, and then confirm both return from Context Landscape rather than the gallery authentication handler:

```powershell
curl.exe -sS -o NUL -w "%{http_code}`n" https://<public-host>/api/gameplay-labs
curl.exe -sS -o NUL -w "%{http_code}`n" https://<public-host>/api/gameplay-lab-sessions/not-real
```

The expected statuses after promotion are `200` and `404`.

The release Compose stack persists both PostgreSQL and gameplay-lab exports. Do not remove either path during promotion or rollback:

```text
infra/data/public/postgres
infra/data/public/playtests
```

## Rollback

For an application rollback, change `CONTEXT_LANDSCAPE_IMAGE` and `CONTEXT_LANDSCAPE_RELEASE` in `.env.omen` to the prior verified image, then run:

```powershell
docker compose -p context-landscape-public --env-file .env.omen -f infra/compose.release.yml up -d --no-build
```

For an ingress rollback, restore the appropriate AM4 backup and reload only after validation:

```powershell
ssh am4 "sudo cp /etc/caddy/Caddyfile.pre-mech-<timestamp> /etc/caddy/Caddyfile"
ssh am4 "sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy"
```

Do not remove `infra/data/public/postgres` or `infra/data/public/playtests` during rollback; they contain the public match history and gameplay-lab evidence.
