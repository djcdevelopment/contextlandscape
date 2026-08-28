# Next-work plan

This is the ordered resume plan after the 2026-08-20 motherboard maintenance. The operational state and
exact restart commands are in [HANDOFF.md](HANDOFF.md).

Current resume point: step 1 completed on 2026-08-27 and
[PR #8](https://github.com/djcdevelopment/contextlandscape/pull/8) merged. The real two-account
multiplayer acceptance gate is intentionally parked while the product returns to UI clarity and its
first useful human playtest. The live `r7` canary is unchanged; the UI work below is source-only until a
separate promotion decision.

## 1. Restore and prove the canary — COMPLETED 2026-08-27

- Start Docker Desktop and Tailscale; bring up the existing `context-landscape-public` Compose project
  without rebuilding or pulling.
- Confirm the active database mount is the fresh restored `infra/data/public/postgres` directory; keep
  `postgres-corrupt-wal-20260820` untouched as forensic rollback evidence.
- Prove direct PostgreSQL readiness and public `/version` = `p0-rd-20260820-r7`.
- Rerun the public human-release smoke and inspect new application logs for migration, catalog, OAuth,
  or request errors.
- Hard-refresh the Command Deck at the operator's actual desktop viewport and confirm there is no page
  scrollbar in Perspective or Tactical mode.

Exit criterion: direct and public health are green, `r7` is served, the 3,501-item catalog is exact, and
the public browser reproduces the no-overflow geometry. Also inspect PostgreSQL logs after the first
checkpoint; any WAL flush, missing TOAST chunk, or abnormal recovery message is a stop condition.

Runtime recovery met the exit criterion, and PR #8 now covers the post-merge planning-control,
overflow, and handoff commits. PR #7 remains the earlier checkpoint.

## 2. Complete the fresh-eyes UI pass — COMPLETED ON SOURCE BRANCH

- Repair the narrow mobile Hangar portrait and keep fleet controls below the complete unit lineup.
- Replace repeated full unit controls with a compact persistent roster and one focused command surface.
- Collapse inactive armories and the empty inspector so the battlefield, not dormant controls, leads.
- Preserve the 2048×900 no-scroll contract while raising both battlefield views to at least 340px.
- Compact mobile navigation and the operation rail so the battlefield begins by 720px at 390×844.

Exit criterion: focused unit planning remains behaviorally equivalent, desktop and mobile geometry gates
pass, and before/after captures are reviewed. Do not deploy as part of this step.

## 3. Run the first useful human playtest

- Observe whether players understand plan persistence, action beacons, portrait-linked selection,
  Context artifacts, and the difference between Progress and Drift.
- Capture confusion and decision rationale before explaining rules.
- Prefer a small number of observed rounds over another large deterministic sweep; the current synthetic
  imbalance is already measured with ample precision.

Exit criterion: a short evidence note identifies the highest-impact comprehension or mechanics problem
and states whether it is UI, rules, or onboarding.

## 4. Choose the next rules intervention

- If players understand the system but Progress remains irrelevant, preregister a targeted Progress/Drift
  intervention rather than tuning fleets broadly.
- If the system is not legible, fix onboarding/feedback first and preserve v4.2 mechanics as the control.
- Keep every experiment deterministic, versioned, bounded, and recommendation-only until a human review
  explicitly promotes it.

Exit criterion: one versioned experiment plan with a falsifiable hypothesis, control, treatment, seed
policy, budget, and stop condition.

## Deferred engineering debt

- Real two-account Discord acceptance and restart persistence remain the only missing human-release
  gate. When resumed, use isolated profiles, verify pre-acceptance fleet secrecy, restart after the first
  Kinetic submission, and record the challenge/match IDs in ignored deployment evidence. Until it
  passes, keep the deployed release classified as a live canary.
- Make challenge acceptance transactional so a crash cannot orphan a match.
- Add abuse rate limits to intentionally public legacy/practice endpoints.
- Decide whether Resolution needs resumable server state; do not add it merely to preserve an animation.
- Public matchmaking, ranked play, progression, and economy remain out of scope until the private friend
  loop produces useful human evidence.
