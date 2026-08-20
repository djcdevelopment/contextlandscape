# Human-release deployment workbook

Use this workbook with the next unused `p0-rd-YYYYMMDD-rN` release ID. It separates work Codex can
perform from the few steps that require a person with Discord or browser access. The authoritative
operational detail is in
[DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md).

The latest recorded execution was `p0-rd-20260820-r7` from application commit `cc7d516`; its evidence
summary and post-maintenance restart path are in [docs/HANDOFF.md](docs/HANDOFF.md). That historical
execution does not pre-check this reusable template, and real two-account acceptance remains pending.

Do not fill secrets, real hosts, private addresses, cookies, database contents, or participant data into
this tracked template. Copy the **Release evidence record** into
`output/deployments/<release-id>-<timestamp>/evidence.md` and fill it there; `output/` must remain
ignored.

## How to use the checklist

- `[AGENT]` is work Codex can perform when the required machine or connection is available.
- `[YOU]` requires your account, secret entry, visual judgment, or explicit data-loss approval.
- `[GATE]` is a stop point. Do not continue until every item immediately above it has objective evidence.
- Leave unavailable two-account checks explicitly `PENDING`; never convert them to a pass based on unit
  or browser tests.
- If a command fails, stop at that gate, preserve its output in the ignored evidence directory, and use
  the rollback section if live state changed.

## Release constants

```text
Candidate release ID: p0-rd-YYYYMMDD-rN (first unused ID for the release date)
Expected census hash: sha256:928a78fd7f9a6adae62eead18553088aa4d360d338506bac0c73d529fd10369f
Expected catalog hash: sha256:1abbb788c4e55a1d2eac95a8ddbcb28834f52a1fc30d22ead64a2baad6d2c0ae
Expected catalog: 3,501 total; 0 skipped
Expected kinds: 1,048 unit; 1,868 event; 294 battlefield; 291 commander
Migration: 20260819_human_release_v1
Compose project: context-landscape-public
```

Set values only in the local shell; keep real endpoints out of this file:

```powershell
$ReleaseId = 'p0-rd-YYYYMMDD-rN' # replace with the first unused ID for the release date
$ImageTag = "context-landscape:$ReleaseId"
$ExpectedCatalogHash = 'sha256:1abbb788c4e55a1d2eac95a8ddbcb28834f52a1fc30d22ead64a2baad6d2c0ae'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$EvidenceRoot = Join-Path 'output/deployments' "$ReleaseId-$Stamp"
$PublicBaseUrl = 'https://<public-host>'
$DirectBaseUrl = 'http://<runtime-tailnet-address>:<runtime-port>'
$IngressSsh = '<ingress-ssh-host>'
```

## Release evidence record

Copy this block to the ignored evidence ledger and fill it as gates pass:

```text
Window start / end:
Operator:
Release ID:
Source branch:
Pull request and final CI run:
Merged main SHA:
Image tag / image ID:
Image version label / revision label:
Prior release ID / image tag / image ID:
Rollback image archive path and SHA-256:
Docker-context secret inspection result:

Census hash:
Catalog hash:
Catalog total / skipped:
Catalog unit / event / battlefield / commander counts:
Prior catalog backup path:

.env.omen backup path:
Offline PostgreSQL snapshot path and SHA-256 manifest:
Logical pg_dump path and SHA-256:
pg_restore list verification:
Caddy backup path:

Direct health / version result:
Migration and table verification:
Direct human-release smoke result:
Public smoke match ID:
Public research-smoke match ID:
Public gameplay-lab session IDs:
Public human-release smoke result:
Restart-persistence result:
Log review result:

Single-account acceptance: PASS / FAIL / NOT RUN
Two-account friend acceptance: PASS / FAIL / PENDING
Release classification: NO-GO / ROLLED BACK / LIVE CANARY / FULLY ACCEPTED
Open follow-ups:
```

## 1. Freeze, verify, and merge the source

- [ ] **[AGENT]** Confirm the candidate release ID is absent from Git tags, local image tags, and the
  ignored deployment ledger. If it exists anywhere, choose the first unused higher `rN` and use that
  value consistently.
- [ ] **[AGENT]** Review the working tree. Explicitly stage only intended source, tests, configuration,
  this workbook, and the 21 canonical Attention v4 evidence files. Exclude `.env.omen`, `output/`, raw
  lab data, compiled art, runtime databases, browser artifacts, and logs.
- [ ] **[AGENT]** Run the repository secret scanner, `git diff --check`, and a staged-diff review. Record
  the scanner and staged file list without copying secret values into evidence.
- [ ] **[AGENT]** Run the complete verification panel; every command must exit zero and must not rewrite
  tracked snapshots:

  ```powershell
  npm ci
  npm audit --omit=dev --audit-level=high
  npm run build
  npm run typecheck
  npm test
  python -m pytest scripts/test_image_census.py scripts/test_build_art_catalog.py scripts/test_verify_art_catalog.py
  npm run test:e2e --workspace=@landscape/web
  npm run probe:attention-v4:smoke
  npm run landscape:attention-v4:smoke
  npm run study:attention-v4:deep:smoke
  npm run verify:attention-v4-compiler
  npm run verify:attention-v4-conformance
  npm run verify:attention-v4-landscape
  npm run verify:attention-v4-topology
  npm run verify:attention-v4-regular-topology
  npm run verify:attention-v4-fleet-matrix
  $env:LAB_PREFLIGHT = 'strict'
  npm run gameplay-lab:preflight
  Remove-Item Env:LAB_PREFLIGHT
  ```

- [ ] **[AGENT]** Commit as `Complete Attention v4.2 human release`, push the release branch, update
  draft PR #3 with the actual verification evidence, and wait for required CI to pass.
- [ ] **[AGENT]** Mark PR #3 ready and merge with a merge commit. Update local `main` non-destructively
  and record the merged SHA.
- [ ] **[AGENT]** Confirm the final `main` worktree is clean before any runtime image build.
- [ ] **[GATE] SOURCE READY:** clean merged SHA, green local panel, green CI, reviewed staged contents,
  no secrets, and no raw/generated runtime data in Git.

## 2. Create the Discord application and enter secrets

- [ ] **[AGENT]** Create `$EvidenceRoot`, confirm `git check-ignore` covers it, and copy the current
  `.env.omen` there before it is edited. This is the pre-release environment rollback copy; never upload
  it.
- [ ] **[AGENT]** If the file still uses legacy `MECH_COMMANDER_IMAGE` / `MECH_COMMANDER_RELEASE`, copy
  those values into `CONTEXT_LANDSCAPE_IMAGE` / `CONTEXT_LANDSCAPE_RELEASE` without changing the live
  pin. Record the actual prior image ID/tag and `/version` release separately; the original legacy env
  file is evidence, not a directly restorable file for the new Compose contract.
- [ ] **[YOU]** In the Discord developer portal, create a dedicated application named exactly
  **Context Landscape**.
- [ ] **[YOU]** Register exactly one production redirect for this deployment:
  `https://<public-host>/api/auth/discord/callback`, with `<public-host>` replaced in the portal only.
- [ ] **[YOU]** Do not add a bot or privileged intents. The application uses OAuth2 authorization code
  with PKCE and requests only `identify`.
- [ ] **[YOU]** Put the following values directly into the local, ignored `.env.omen`:

  ```text
  DISCORD_CLIENT_ID=<application-id>
  DISCORD_CLIENT_SECRET=<application-secret>
  DISCORD_REDIRECT_URI=https://<public-host>/api/auth/discord/callback
  ```

- [ ] **[YOU]** Do not paste the client secret into chat, a terminal transcript, this workbook, a GitHub
  issue, or the evidence ledger. If it is exposed, rotate it in Discord before continuing.
- [ ] **[AGENT]** Verify `.env.omen` is ignored and that all three keys are present, non-empty,
  non-placeholder, and internally consistent without printing their values.
- [ ] **[GATE] OAUTH READY:** exact callback registered, identity-only application configured, local
  values validated without disclosure.

## 3. Build the rollback-safe image and art catalog

- [ ] **[AGENT]** Start Docker Desktop hidden if needed and wait until `docker info` succeeds.
- [ ] **[AGENT]** Inspect the exact project verify image, if it exists, for `.env.omen` without displaying
  file contents. If contaminated, record its image ID and remove only that image; do not prune broadly.
- [ ] **[AGENT]** Inspect the currently pinned release image. Record its ID and labels, then export it to
  the ignored evidence directory if it cannot be guaranteed from an immutable registry.
- [ ] **[AGENT]** Run `scripts/build.ps1 -Target Verify`, then build `$ImageTag` from the clean merged SHA.
  Confirm its OCI version label is `$ReleaseId`, its revision label is the merged SHA, and
  `/workspace/.env.omen` is absent.
- [ ] **[AGENT]** Compile the art catalog into `infra/data/public/art/.staging-$ReleaseId`; never compile
  directly over the active `release` directory.
- [ ] **[AGENT]** Run `python scripts/verify_art_catalog.py --catalog-root <staging-directory>` and record
  its hashes and all kind counts. Every referenced derivative must be present, non-empty, and decodable.
- [ ] **[GATE] ARTIFACTS READY:** clean and correctly labelled image, no secret in image/context, exact
  staging-catalog hashes and counts, prior image recoverable, and the active catalog left untouched.

## 4. Back up local runtime state

- [ ] **[AGENT]** Resolve the configured data root to an absolute path and verify it is the intended
  project-specific runtime directory before any stop, copy, or move.
- [ ] **[AGENT]** Confirm the pre-edit `.env.omen` rollback copy exists, then copy the OAuth-complete
  `.env.omen`, while it still has the mapped prior image/release pins, to a separately named
  rollback-ready secret backup. Never upload either file.
- [ ] **[AGENT]** Stop only the `context-landscape-public` app and PostgreSQL services. Confirm the data
  directory is no longer being written.
- [ ] **[AGENT]** With the app stopped, rename the existing active catalog to a timestamped prior
  directory, rename the verified staging directory to `release`, and re-run the catalog verifier against
  the activated directory.
- [ ] **[AGENT]** Copy the complete PostgreSQL data directory to a timestamped offline snapshot. Record a
  file manifest and SHA-256 hashes.
- [ ] **[AGENT]** Start PostgreSQL alone. Create a custom-format logical `pg_dump`, prove
  `pg_restore --list` can read it, copy it to `$EvidenceRoot`, and record its SHA-256.
- [ ] **[AGENT]** Back up the active ingress Caddyfile to an exact timestamped path before editing it and
  record that path.
- [ ] **[GATE] ROLLBACK READY:** prior image, prior environment, offline database snapshot, verified
  logical dump, prior catalog, and Caddy backup all exist and are recorded.

## 5. Start and prove the private runtime

- [ ] **[AGENT]** Preserve `.env.omen` data, bind, port, and PostgreSQL values; replace only the intended
  image/release pins and add the validated Discord values. Back it up again after editing.
- [ ] **[AGENT]** Run Compose `config --quiet`. Do not print rendered Compose configuration because it
  contains secrets.
- [ ] **[AGENT]** Start with `--no-build --pull never`. Confirm the app is using `NODE_ENV=production`,
  `LAB_PREFLIGHT=strict`, the selected image ID, and PostgreSQL persistence.
- [ ] **[AGENT]** Verify migration `20260819_human_release_v1` in `schema_migrations` and all five tables:
  `player_accounts`, `player_sessions`, `player_fleets`, `battle_friend_challenges`, and
  `battle_pending_submissions`.
- [ ] **[AGENT]** Against `$DirectBaseUrl`, verify readiness, selected release ID, strict preflight,
  catalog/census hashes, 3,501 catalog items, media retrieval, Discord authorization redirect, secure
  cookie flags, and JSON `401` responses from protected application routes.
- [ ] **[AGENT]** Run:

  ```powershell
  .\scripts\human-release-smoke.ps1 -BaseUrl $DirectBaseUrl -ExpectedReleaseId $ReleaseId -ExpectedCatalogHash $ExpectedCatalogHash -ExpectedCatalogItems 3501 -AppEntryPath '/'
  ```

- [ ] **[AGENT]** Inspect app and PostgreSQL logs for migration, startup, persistence, catalog, and OAuth
  configuration errors. Store the bounded log excerpt in evidence with secrets redacted.
- [ ] **[AGENT]** Request the callback once with a unique fake `code`/`state` sentinel, then inspect app
  logs and prove the sentinel is absent while the path is logged only as
  `/api/auth/discord/callback?[redacted]`.
- [ ] **[GATE] PRIVATE RUNTIME READY:** every direct check passes. If any fails, do not change ingress.

## 6. Cut over ingress and run public automation

- [ ] **[AGENT]** Redirect `/mech` and `/mech/*` to the equivalent canonical `/landscape/` entry while
  preserving the query string; add `/landscape` redirect plus `/landscape/*`. Ensure SPA navigation
  remains under `/landscape/`.
- [ ] **[AGENT]** Add the following to both the Context Landscape allowlist and the gallery matcher's
  `not path` exclusions:

  ```text
  /landscape /landscape/* /mech /mech/* /assets/* /atlas/*
  /api/matches /api/matches/* /api/scenarios /api/challenges /api/challenges/*
  /api/research/* /api/gameplay-labs /api/gameplay-labs/*
  /api/gameplay-lab-sessions /api/gameplay-lab-sessions/*
  /api/auth/* /api/account /api/art/* /api/hangar/* /api/battle-command/*
  /media/art/* /health/* /version
  ```

- [ ] **[AGENT]** Validate the candidate Caddyfile. Reload only after validation succeeds; then record
  Tailscale serve status and the active config backup path.
- [ ] **[AGENT]** Without following redirects, prove `/landscape` returns `308` with Location
  `/landscape/`, and `/mech/?view=hangar` returns `308` with Location
  `/landscape/?view=hangar`. The matcher must be exactly `/mech` plus `/mech/*`, never the broader
  `/mech*`.
- [ ] **[AGENT]** Confirm the Discord callback, protected JSON routes, `/atlas/*`, and one catalog media
  derivative reach Context Landscape rather than gallery authentication.
- [ ] **[AGENT]** Run all four public suites and record their IDs/pass markers:

  ```powershell
  .\scripts\smoke.ps1 -BaseUrl $PublicBaseUrl
  .\scripts\research-smoke.ps1 -BaseUrl $PublicBaseUrl
  .\scripts\gameplay-lab-smoke.ps1 -BaseUrl $PublicBaseUrl
  .\scripts\human-release-smoke.ps1 -BaseUrl $PublicBaseUrl -ExpectedReleaseId $ReleaseId -ExpectedCatalogHash $ExpectedCatalogHash -ExpectedCatalogItems 3501
  ```

- [ ] **[AGENT]** Restart only the app. Recheck readiness/version, rerun the human-release smoke, and
  reload known match, gameplay-lab, and catalog resources to prove persistence.
- [ ] **[AGENT]** Inspect bounded app, PostgreSQL, and ingress logs. Treat uncaught errors, database
  fallback, catalog fallback/mismatch, OAuth misconfiguration, proxy loops, or gallery-auth responses as
  failures. Repeat the fake callback sentinel through public ingress and prove neither app nor ingress
  logs contain its query value; if Caddy access logging is enabled, configure query redaction before
  continuing.
- [ ] **[GATE] PUBLIC AUTOMATION READY:** correct release, all four suites green, full catalog/media,
  secure cookies, application JSON routing, and restart persistence are recorded.

## 7. Your one-account live-canary check

- [ ] **[YOU]** Open `https://<public-host>/landscape/?view=hangar` in a normal browser and choose
  **Continue with Discord**. Confirm Discord asks only for identity and returns to the public Hangar.
- [ ] **[YOU]** Confirm your Discord display name/avatar appears and that no error banner is present.
- [ ] **[YOU]** Create a Heavy + Line + Scout fleet. This is exactly weight six and exercises all three
  chassis. Give it a non-sensitive test name.
- [ ] **[YOU]** Assign different catalog art to all three units, choose a commander portrait and a
  battlefield image, and choose a palette and emblem. Confirm thumbnails load without broken images.
- [ ] **[YOU]** Save the fleet. Refresh the page and confirm the same name, composition, identity, and art
  return from the cloud Hangar.
- [ ] **[YOU]** Enter a solo Battle Command operation. Visually inspect Hangar, tactical board,
  perspective presentation, commander/battlefield art, and at least one media asset at desktop and a
  narrow/mobile width. Confirm controls remain usable and navigation stays under `/landscape/`.
- [ ] **[YOU]** Return to the Hangar, create a private challenge, copy its link, and open it while still
  signed into the same Discord account. Confirm it remains your waiting invitation and cannot be
  accepted by its creator.
- [ ] **[YOU]** Refresh the Hangar again and confirm the fleet and open challenge persist.
- [ ] **[YOU]** Tell Codex only `PASS` or the failing step and visible error. Do not send the challenge
  link, cookies, account identifiers, host, or Discord secret.
- [ ] **[GATE] LIVE CANARY:** public automation and every one-account check pass. Record release status as
  `LIVE CANARY`; record two-account friend acceptance as `PENDING`, not passed.

## 8. Later two-account friend acceptance

This is not required for the one-account canary, but it is required before marking the release's friend
workflow fully accepted. Incognito windows using the same Discord account do not satisfy this gate.

- [ ] **[YOU]** Arrange two distinct Discord accounts in separate browser profiles, one creator and one
  friend. Each account creates and refreshes a legal ready fleet.
- [ ] **[YOU]** The creator creates a fresh challenge and sends the private link out of band.
- [ ] **[YOU]** Before acceptance, verify the friend's view does not reveal the creator's locked fleet
  composition, unit art, commander art, or battlefield art.
- [ ] **[YOU]** The friend locks their own fleet and accepts. Verify both browsers reveal the two immutable
  fleet snapshots and show the same match ID.
- [ ] **[YOU]** Enter the operation in both browsers. Submit the first simultaneous Kinetic plan from only
  one seat; verify that seat shows **Orders locked — waiting for your opponent** and that refresh does not
  reveal or discard either player's hidden submission.
- [ ] **[YOU]** Submit the other seat's plan. Verify both browsers advance to the same revision/next phase.
  Advance through a Capacity submission and one alternating Command handoff as well.
- [ ] **[AGENT]** Restart only the app while the friend operation is active.
- [ ] **[YOU]** Refresh both seats. Confirm identity, fleet snapshots, match revision, phase, and legal
  actions persist, then make one more valid submission from each applicable seat.
- [ ] **[YOU]** Report only pass/fail and the match ID if it is safe to retain in the ignored local
  evidence. Do not paste private challenge URLs or session data into chat.
- [ ] **[GATE] FRIEND WORKFLOW ACCEPTED:** hidden-before-accept, reveal-after-accept, simultaneous waiting,
  phase advance, alternating seat behavior, and restart persistence all pass. Change release status from
  `LIVE CANARY` to `FULLY ACCEPTED`.

## 9. No-go conditions

- [ ] **[GATE]** Stop or roll back for any dirty/mislabeled image, secret in build context, high/critical
  production dependency advisory, failed test or
  CI gate, placeholder Discord value, wrong callback/scope, missing rollback artifact, strict-preflight
  failure, migration failure, memory persistence, release mismatch, insecure cookie, catalog
  mismatch/fallback, missing media, Caddy validation failure, gallery-auth route capture, restart data
  loss, or failed one-account acceptance.
- [ ] **[GATE]** A two-account failure blocks `FULLY ACCEPTED` but does not retroactively invalidate a
  healthy one-account `LIVE CANARY` unless it exposes data, corrupts state, bypasses authorization, or
  breaks the deployed service. Security, privacy, or corruption failures require immediate rollback.

## 10. Rollback checklist

- [ ] **[AGENT]** Record the trigger and stop further acceptance traffic. Preserve logs and identifiers
  before changing state.
- [ ] **[AGENT]** Restore the exact Caddy backup, validate it, then reload. Confirm the prior route surface
  reaches the expected application.
- [ ] **[AGENT]** Restore the recorded prior `CONTEXT_LANDSCAPE_IMAGE` and
  `CONTEXT_LANDSCAPE_RELEASE` values from the rollback-ready environment backup. Keep the required
  Discord keys; do not replace `.env.omen` wholesale with the original legacy-format backup. Run
  Compose `config --quiet`, then `up -d --no-build --pull never`.
- [ ] **[AGENT]** If art caused the failure, atomically reactivate the retained prior catalog. Do not
  delete either catalog while diagnosing.
- [ ] **[AGENT]** Verify prior `/version`, PostgreSQL readiness, public routing, and the smoke suites that
  apply to the prior release. Confirm pre-existing matches and playtests remain readable.
- [ ] **[AGENT]** Leave additive migration `20260819_human_release_v1` in place during an ordinary
  application rollback. Do not remove PostgreSQL, playtests, or art directories.
- [ ] **[YOU]** Approve database restoration only if corruption is demonstrated and you accept losing all
  data written after the selected backup. An application defect alone is not permission to restore the
  database.
- [ ] **[AGENT]** Record restored image/release, Caddy backup, catalog selection, health/smoke results,
  data retained or lost, and follow-up work in the ignored evidence ledger.
- [ ] **[GATE] ROLLBACK COMPLETE:** prior release and ingress are proven healthy, persistent data is
  accounted for, and the failed release is classified `ROLLED BACK` rather than accepted.
