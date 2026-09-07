# Context Landscape handoff

Updated 2026-09-06 for the UI review and reboot checkpoint. Public deployment details below were last recorded during the 2026-08-27 recovery.

## 2026-09-06 reboot checkpoint

The current source work is collected in [PR #9](https://github.com/djcdevelopment/contextlandscape/pull/9) on `agent/ui-fresh-eyes-pass`. It includes the v4.4 range/Smoke amendments, the [board design package](../design/board-design/README.md), and the [full UI review](UI_UX_REVIEW.md).

Latest playtest follow-ups: Output rules have separate mech entries; Move opens Tactical 2D with outside coordinate axes; fleet cards have no duplicate action footer; artillery shows Capacity activation progress and counterfire consequences. Command distinguishes mech output decisions from pending artifacts, explains allocation/calibration, shows an emitted-output receipt from actual artifacts, and provides an Inspect output action. Heavy Uplink's calibration tradeoff is explicit.

Local verification for this checkpoint: the full production build, web typecheck, all 291 workspace tests, and 38 browser journeys passed (10 intentional viewport-specific skips). Additional engine and desktop/mobile browser probes checked artillery activation, counterfire guidance, and the Heavy's actual emitted-output receipt.

The merge audit also required compatible `fast-uri` patches (3.1.7 and 4.1.4). The production dependency audit reports zero vulnerabilities, and all 31 server tests pass with those patches.

After reboot, start Docker Desktop and run from the repository root:

```powershell
docker compose -p context-landscape-dev -f infra/compose.dev.yml up -d
```

Local UI: `http://localhost:5173/landscape/`. API readiness: `http://localhost:9080/ready`. This work has not promoted a new public canary image. The next useful step is a human playtest of Command and artifact decisions.

## Resume point

- Source branch: `agent/ui-fresh-eyes-pass`
- Deployed application source: `cc7d516` (`Eliminate short-wide page overflow`)
- Current public release: `p0-rd-20260820-r7`
- Immutable image: `context-landscape:p0-rd-20260820-r7`
- Image ID: `sha256:43f4c670913863c0aacbc993f31a386f87376ec1901cfc31cc24d3bddcbc5887`
- Prior rollback images: `p0-rd-20260820-r6` and `p0-rd-20260820-r5`
- Canonical browser path: `https://am4.tail8e749c.ts.net/landscape/`
- Runtime Compose project: `context-landscape-public`
- Runtime configuration: ignored `.env.omen`; never copy its values into Git or chat
- Current runtime state: running and healthy after post-swap recovery; operational classification is
  **LIVE CANARY** until the real two-account acceptance gate passes

The wrap-up documentation commit comes after `cc7d516` and does not change deployable application code.
Do not expect the `r7` image revision label to equal the later docs-only branch head.

GitHub PR [#7](https://github.com/djcdevelopment/contextlandscape/pull/7) merged the earlier Command
Deck checkpoint at `1a6a9c0`. The subsequent planning-control commit `1cb825b`, deployed overflow fix
`cc7d516`, preserved design bundle, and this handoff are covered by
[PR #8](https://github.com/djcdevelopment/contextlandscape/pull/8), which merged after its
`verify-and-simulate` checks passed. Do not assume PR #7 contains the deployed source.

The current source branch is a fresh-eyes UI pass and has not been deployed. It repairs the mobile
Hangar layout, replaces repeated per-card controls with a compact roster plus one focused unit command
surface, collapses dormant armory/inspector space, enlarges the 2048×900 battlefield to 340px, and moves
the 390×844 mobile battlefield into the first viewport. The operator intentionally parked further
multiplayer acceptance work while this UI and human-playtest work proceeds; `r7` remains the runtime.

## What landed

- The Battle Command screen now follows the checked-in Command Deck handoff: a compact five-stage
  header, operation rail, permanent context/armory/fleet/inspector regions, portrait-linked unit
  selection, and an in-flow phase dock.
- Unit portraits are shown on the battlefield and fleet cards. Selecting either representation focuses
  the same unit.
- Kinetic plans persist visually after focus changes. Every planned move is shown on Perspective and
  Tactical boards with a unit-qualified step label; staged non-move orders retain dashed treatment on
  the unit token and fleet card.
- Kinetic actions use 48px icon controls, availability beacons, depressed staged states, a segmented
  range control, and a text-only Clear plan action.
- The art picker uses plain-language category filters, bounded pages, stable 220px cards, an independent
  scrollbar, and previous/next controls. Hangar palette selection uses visible swatches.
- Four interface scales remain available. The short-wide desktop mode removes accidental inherited
  header margins and fits the entire command deck at a 2048×900 CSS viewport.
- A 5,361-word podcast-length release narrative is in [PRESS_RELEASE.md](../PRESS_RELEASE.md).
- The source design bundle is preserved under
  [design/design_handoff_battle_command_1c](../design/design_handoff_battle_command_1c/README.md) as
  reference material; production does not load its HTML, JavaScript, or stand-in art.

## Verification recorded before maintenance

- Clean immutable Docker build from `cc7d516`: build and typecheck passed for every workspace.
- Docker verification suite: 279 Vitest tests passed
  (contracts 8, engine 103, simulator 34, lab 57, bank 35, server 28, web 14).
- Browser suite: 15 Playwright journeys passed; 6 viewport-specific cases were intentionally skipped.
- Public human-release smoke passed for `r7`: PostgreSQL readiness, exact release ID, strict gameplay-lab
  preflight, anonymous/protected-route behavior, Discord OAuth/PKCE/cookie flags, all 3,501 catalog
  entries, WebP media, and `/landscape/` HTML.
- Frozen catalog hash:
  `sha256:1abbb788c4e55a1d2eac95a8ddbcb28834f52a1fc30d22ead64a2baad6d2c0ae`.
- A real public Chromium probe at 2048×900 measured `scrollHeight === innerHeight === 900` and
  `scrollWidth === innerWidth === 2048` in both Perspective and Tactical modes.
- The `r7` app container was healthy and its post-promotion log scan contained no level-40/50 errors.

The final public recheck later in the maintenance window timed out while the direct runtime remained
healthy. Treat public availability as unproven after hardware work and run the restart gates below.

## Database repair at shutdown

The maintenance shutdown exposed PostgreSQL WAL/page inconsistency that readiness probes had not
reported. A forced logical dump identified exactly two unreadable TOAST values:

- standalone revision-0 smoke match `battle_d269fb0b-bade-4a8e-8ea8-fbee39ecea04`, with no events,
  requests, pending submission, or challenge reference;
- synthetic `gameplay-lab-smoke-*` session
  `lab_session_fa47115d-c8ff-4045-94fc-496be6cbed7b`, with no human participant data.

Both unusable synthetic rows were removed after preserving the damaged cluster. The remaining database
was exported, restored into a fresh PostgreSQL 16 cluster, and checked as follows:

- all 15 application-table counts matched before and after restore;
- a full post-restore `pg_dump` and `pg_restore --list` passed;
- an explicit checkpoint completed;
- PostgreSQL then exited zero with a completed shutdown checkpoint.

Ignored recovery evidence is under `output/maintenance/20260820-motherboard-swap/`:

- raw damaged snapshot: `postgres-corrupt-pre-repair/` (1,346 files, 50,095,131 bytes), manifest
  SHA-256 `AB1428BC3B01C91E208B279044C1936AD2E46AE54E64A892095216E9E3AE88F4`;
- salvaged logical dump: `mech-repaired.dump`;
- verified post-restore dump: `mech-post-restore-verified.dump`, SHA-256
  `65DCFD09A1F465741CB70798DCCCB7A0B4ED6320E4EE48469CB54EC6AAECB2E6`;
- clean offline snapshot: `postgres-clean-post-restore/` (1,342 files, 49,260,300 bytes), manifest
  SHA-256 `C16AD5B99938E598491CA4AEAA495E03F216A95454670768C52B49F91F49C7F4`;
- pre/post table-count evidence: `pre-restore-counts.txt`.

The original damaged directory is also retained beside the active data directory as
`infra/data/public/postgres-corrupt-wal-20260820`. The active `infra/data/public/postgres` directory is
the fresh restored cluster. Do not swap these directories unless the verified dump and clean cluster
both fail and a deliberate forensic recovery is being performed.

## Post-swap restart

Recovery completed on 2026-08-27:

- the immutable `r7` image ID and repaired PostgreSQL mount matched this handoff;
- PostgreSQL and the app became healthy, while the one-shot `playtest-data` service exited zero;
- local and public `/version` returned `p0-rd-20260820-r7` with strict verified lab preflight;
- the first forced PostgreSQL checkpoint completed, with no WAL, TOAST, flush, abnormal-recovery, or
  application level-40/50 log matches;
- the public human-release smoke passed the exact 3,501-item catalog and frozen-hash gates; and
- a fresh public Chromium session passed the 2048×900 no-page-overflow gate in both Perspective and
  Tactical modes.

The commands below remain the canonical restart and diagnostic recipe.

From `C:\work\contextlandscape`:

```powershell
git status -sb
git log -3 --oneline
docker info
docker compose -p context-landscape-public --env-file .env.omen -f infra/compose.release.yml config --quiet
docker compose -p context-landscape-public --env-file .env.omen -f infra/compose.release.yml up -d --no-build --pull never
docker compose -p context-landscape-public --env-file .env.omen -f infra/compose.release.yml ps
Invoke-RestMethod http://127.0.0.1:19081/health/ready
Invoke-RestMethod https://am4.tail8e749c.ts.net/version
```

Expected results are a healthy PostgreSQL service, a healthy app, the one-shot `playtest-data` service
exited zero, persistence `postgres`, and public release `p0-rd-20260820-r7`. If the local runtime is
healthy but public ingress is unavailable, check Tailscale on OMEN and AM4 before touching Compose or
the database.

Then rerun the public release gate:

```powershell
.\scripts\human-release-smoke.ps1 `
  -BaseUrl 'https://am4.tail8e749c.ts.net' `
  -ExpectedReleaseId 'p0-rd-20260820-r7' `
  -ExpectedCatalogHash 'sha256:1abbb788c4e55a1d2eac95a8ddbcb28834f52a1fc30d22ead64a2baad6d2c0ae' `
  -ExpectedCatalogItems 3501 `
  -AppEntryPath '/landscape/?view=hangar'
```

Do not rebuild or migrate merely because the host hardware changed. The application migration is
additive and already applied; PostgreSQL, playtests, and compiled art live under the existing ignored
runtime data root. If `r7` cannot start, restore the image/release pair for `r6` in `.env.omen` and use
the rollback procedure in [DEPLOYMENT_RUNBOOK.md](../DEPLOYMENT_RUNBOOK.md).

## Acceptance status

- Automated source, container, catalog, OAuth-contract, ingress, and viewport gates: passed again after
  the maintenance boundary.
- Single-account visual use: exercised during the R&D loop, but not recorded as a formal workbook gate.
- Real two-account Discord friend acceptance and restart persistence: **PENDING AND PARKED**. Mocked
  two-browser E2E coverage is green but does not replace this gate.
- Current operational classification: **LIVE CANARY**, not fully accepted.

## Known boundaries

- Recorded v4.2 studies are a historical baseline: Drift determines nearly every deterministic terminal
  while Progress is effectively absent. Current source uses v4.4: action-paid range shifts preserve
  calibration, and Smoke affects mechs while batteries keep working. These amendments do not establish
  balance or change the deployed canary.
- Resolution is a client-only review surface because the server applies Resolution and Register
  atomically. A reload immediately after transition can skip that interstitial without losing state.
- Challenge acceptance writes the match and challenge in separate operations; a process crash between
  them can orphan an unreachable match, though it cannot corrupt an accepted challenge.
- Public legacy/practice APIs do not yet have abuse rate limits.
- There is no public matchmaking, ranked play, progression, or broad economy.

Continue from [NEXT_WORK_PLAN.md](NEXT_WORK_PLAN.md), not from the superseded mock HTML.
