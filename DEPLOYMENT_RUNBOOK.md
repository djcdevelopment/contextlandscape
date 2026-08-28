# Context Landscape deployment runbook

`<public-host>`, `<runtime-tailnet-address>`, `<runtime-port>`, `<ingress-ssh-host>`, and
`<release-id>` are placeholders. Resolve them only in the terminal, the ignored deployment evidence
ledger, or the untracked `.env.omen`. Never paste real hosts, addresses, credentials, cookies, database
contents, or participant data into a tracked file.

This runbook defines the release contract. It intentionally makes no claim about which release is live
or healthy; prove that from `/version` and the acceptance gates during every promotion. Use
[HUMAN_RELEASE_DEPLOYMENT_WORKBOOK.md](HUMAN_RELEASE_DEPLOYMENT_WORKBOOK.md) as the role-labelled live
checklist and evidence form.

## Runtime topology

```text
https://<public-host>
        |
        | Tailscale Funnel -> ingress-host Caddy allowlist
        | /landscape/, /mech/ compatibility, API, atlas, and media routes
        v
runtime host <runtime-tailnet-address>:<runtime-port>
        |
        | context-landscape:<release-id>
        v
PostgreSQL + playtest exports + compiled art on persistent bind mounts
```

The development stack remains separate: UI `127.0.0.1:5173`, API `127.0.0.1:9080`, and PostgreSQL
`127.0.0.1:5442` by default. Do not infer public readiness from the development stack or a healthy
container.

## Release prerequisites

- Use a clean, merged `main` commit and the next unused `p0-rd-YYYYMMDD-rN` release ID. The image
  revision label must equal that commit SHA.
- Keep `.env.omen` local and untracked. Preserve its existing data root, bind address, port, and
  PostgreSQL password. Set `CONTEXT_LANDSCAPE_IMAGE`, `CONTEXT_LANDSCAPE_RELEASE`,
  `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `DISCORD_REDIRECT_URI` there.
- If the pre-release file has only legacy `MECH_COMMANDER_IMAGE` / `MECH_COMMANDER_RELEASE` pins, map
  their values into the new Context Landscape keys before changing the selected image. Retain the
  original file as evidence, then make a second rollback-ready backup after all required keys exist and
  while the prior image/release is still pinned.
- Register the exact public callback `https://<public-host>/api/auth/discord/callback` in the Discord
  application. Request only `identify`; no bot or privileged intent is required. Provider access tokens
  are used only for identity lookup and are not persisted.
- Retain a verified prior image, an `.env.omen` backup, an offline PostgreSQL data-directory snapshot,
  a verified logical dump, the prior art catalog, and an ingress Caddyfile backup before cutover.
- Treat a dirty or mislabeled image, a secret in the Docker context, a high/critical production
  dependency advisory, placeholder OAuth configuration,
  a missing rollback artifact, or a failed verification command as a release blocker.

## Build and catalog

Build from the clean merged commit; do not use the dirty-worktree override for a release:

```powershell
$ReleaseId = '<release-id>'
$ImageTag = "context-landscape:$ReleaseId"
.\scripts\build.ps1 -Target Verify
.\scripts\build.ps1 -Target Image -ReleaseId $ReleaseId -ImageTag $ImageTag
```

Compile into a staging directory and verify every derivative:

```powershell
$ArtStaging = Join-Path 'infra/data/public/art' ".staging-$ReleaseId"
python scripts/build_art_catalog.py --census output/image-census-v1 --output $ArtStaging --allow-ssh-am4 --clean
python scripts/verify_art_catalog.py --catalog-root $ArtStaging
```

The release verifier defaults are part of the acceptance contract:

| Property | Expected |
| --- | ---: |
| Census report hash | `sha256:928a78fd7f9a6adae62eead18553088aa4d360d338506bac0c73d529fd10369f` |
| Catalog hash | `sha256:1abbb788c4e55a1d2eac95a8ddbcb28834f52a1fc30d22ead64a2baad6d2c0ae` |
| Total / skipped | 3,501 / 0 |
| Unit / event | 1,048 / 1,868 |
| Battlefield / commander | 294 / 291 |

Every referenced derivative must exist, be non-empty, and decode successfully. Stop the application
before renaming the active `release` directory to a timestamped backup and the verified staging
directory to `release`; verify again after activation. The server's small generated fallback catalog is
for local resilience only and is never release-acceptable. Preserve `infra/data/public/art` across
deployment and rollback.

## Back up and start

Before changing `.env.omen`, copy it into the ignored evidence directory. Validate Compose without
printing the rendered secret-bearing configuration:

```powershell
docker compose -p context-landscape-public --env-file .env.omen -f infra/compose.release.yml config --quiet
```

Stop the application and PostgreSQL before taking the offline data-directory snapshot. Start
PostgreSQL by itself, create a custom-format `pg_dump`, verify that `pg_restore --list` can read it,
and record its SHA-256. Do not start the new application until both database backups and the prior image
are recorded.

A healthy readiness probe is not an integrity check. Before planned host maintenance or promotion,
request an explicit PostgreSQL `CHECKPOINT`, inspect the database log, and require the complete logical
dump to succeed. A WAL-flush error, missing TOAST chunk, failed checkpoint, abnormal shutdown, or failed
dump is a hard stop: preserve the stopped data directory before repair, salvage only with an auditable
logical export, restore into a fresh cluster, compare every application-table count, produce a second
verified dump, and require an exit-zero shutdown checkpoint before power loss.

Start the pinned image without a build or pull:

```powershell
docker compose -p context-landscape-public --env-file .env.omen -f infra/compose.release.yml up -d postgres
docker compose -p context-landscape-public --env-file .env.omen -f infra/compose.release.yml up -d --no-build --pull never
```

The application startup must use `NODE_ENV=production` and `LAB_PREFLIGHT=strict`. It applies additive
migration `20260819_human_release_v1`; verify its ledger row and these five tables before ingress:

```text
player_accounts
player_sessions
player_fleets
battle_friend_challenges
battle_pending_submissions
```

## Direct-runtime acceptance

Run this gate against the private runtime address before editing public ingress:

```powershell
$DirectBaseUrl = 'http://<runtime-tailnet-address>:<runtime-port>'
Invoke-RestMethod "$DirectBaseUrl/health/ready"
Invoke-RestMethod "$DirectBaseUrl/version"
.\scripts\human-release-smoke.ps1 -BaseUrl $DirectBaseUrl -ExpectedReleaseId $ReleaseId -ExpectedCatalogHash 'sha256:1abbb788c4e55a1d2eac95a8ddbcb28834f52a1fc30d22ead64a2baad6d2c0ae' -ExpectedCatalogItems 3501 -AppEntryPath '/'
```

Require all of the following before public cutover:

- `/health/ready` reports `status=ok` and `persistence=postgres`; `/version` reports the selected release
  ID.
- Strict gameplay-lab preflight passes, the migration and five tables exist, and logs contain no startup
  or persistence error.
- `/api/art/catalog` reports the exact catalog hash, census hash, and 3,501 items; a referenced
  `/media/art/*` derivative returns decodable media rather than the fallback.
- `/api/auth/discord/start` redirects to Discord authorization using the registered callback and only
  the `identify` scope.
- Production OAuth/session cookies include `Secure`, `HttpOnly`, and `SameSite=Lax`.
- Application request logs retain the callback path but render every query as `?[redacted]`; a unique
  fake callback `code`/`state` sentinel must not appear in the bounded container logs.
- Unauthenticated `/api/account`, `/api/hangar/fleets`, and `/api/battle-command/challenges` requests
  return Context Landscape JSON `401` responses, not the gallery authentication page.

## Ingress cutover

Back up the live Caddyfile on the ingress host before editing it. Preserve the gallery routes and make
`/mech` plus `/mech/*` query-preserving redirects to the canonical `/landscape/` entry. The Context
Landscape allowlist and the gallery matcher's corresponding
`not path` exclusions must cover:

```caddyfile
/landscape /landscape/* /mech /mech/* /assets/* /atlas/*
/api/matches /api/matches/* /api/scenarios /api/challenges /api/challenges/*
/api/research/* /api/gameplay-labs /api/gameplay-labs/*
/api/gameplay-lab-sessions /api/gameplay-lab-sessions/*
/api/auth/* /api/account /api/art/* /api/hangar/* /api/battle-command/*
/media/art/* /health/* /version
```

`/landscape` must redirect to `/landscape/`, and client-side navigation must stay under that canonical
path. `/atlas/*` carries evidence assets and must reach Context Landscape rather than gallery auth.
Use an exact `path /mech /mech/*` matcher before the mutually exclusive proxy handlers; do not use
`/mech*`. A permanent redirect with no `?` in its destination preserves the incoming query. Before the
ingress gate passes, prove without following redirects that `/landscape` returns `308` to `/landscape/`
and `/mech/?view=hangar` returns `308` to `/landscape/?view=hangar`.

Validate before reloading:

```powershell
$IngressSsh = '<ingress-ssh-host>'
ssh $IngressSsh 'sudo caddy validate --config /etc/caddy/Caddyfile'
ssh $IngressSsh 'sudo systemctl reload caddy'
ssh $IngressSsh 'sudo tailscale serve status'
```

Do not combine validation and reload in a way that obscures which operation failed. Confirm the Discord
callback reaches Context Landscape before asking a user to sign in. Send one fake callback sentinel
through public ingress and prove it is absent from both application and ingress logs. If Caddy access
logging is enabled, configure it to omit or redact query strings before continuing.

## Public acceptance and persistence

Run all automated suites against the public origin:

```powershell
$PublicBaseUrl = 'https://<public-host>'
.\scripts\smoke.ps1 -BaseUrl $PublicBaseUrl
.\scripts\research-smoke.ps1 -BaseUrl $PublicBaseUrl
.\scripts\gameplay-lab-smoke.ps1 -BaseUrl $PublicBaseUrl
.\scripts\human-release-smoke.ps1 -BaseUrl $PublicBaseUrl -ExpectedReleaseId $ReleaseId -ExpectedCatalogHash 'sha256:1abbb788c4e55a1d2eac95a8ddbcb28834f52a1fc30d22ead64a2baad6d2c0ae' -ExpectedCatalogItems 3501
```

The legacy suites must still prove PostgreSQL persistence, deterministic victory and event history,
four scenarios, reconstruction, legacy challenge acceptance, five gameplay labs, and their pass markers.
The human-release suite must prove the selected release and full catalog rather than a fallback.

Restart the app without restarting PostgreSQL, rerun readiness and the human-release smoke, then reload
the IDs created by the smoke suites:

```powershell
docker compose -p context-landscape-public --env-file .env.omen -f infra/compose.release.yml restart app
Invoke-RestMethod "$PublicBaseUrl/health/ready"
```

The browser entry points are:

```text
https://<public-host>/landscape/
https://<public-host>/landscape/?view=hangar
```

Complete the workbook's single-account Discord, Hangar, challenge, visual, and refresh checks before
calling the release a live canary. Two-account friend-battle acceptance is a separate explicit pending
gate until a second Discord account is available.

## Rollback

For an application rollback, restore the recorded prior image and release values from the
rollback-ready environment backup while retaining the required Discord keys. Do not restore the whole
legacy-format pre-edit file, because current Compose interpolation would reject it. Validate without
printing the resolved configuration, and start with neither build nor pull:

```powershell
docker compose -p context-landscape-public --env-file .env.omen -f infra/compose.release.yml config --quiet
docker compose -p context-landscape-public --env-file .env.omen -f infra/compose.release.yml up -d --no-build --pull never
```

For ingress rollback, restore the exact timestamped Caddy backup, validate it, and only then reload.
Retain PostgreSQL, playtests, the new and prior art catalogs, and all deployment evidence.

The human-release migration is additive and should remain in place during an ordinary application
rollback. Restore a database backup only when corruption is demonstrated and the operator explicitly
accepts loss of post-backup user data. Record the trigger, restored image/release, Caddy backup, health
results, smoke results, and any remaining follow-up in the ignored evidence ledger.
