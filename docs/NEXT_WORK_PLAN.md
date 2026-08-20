# Next-work plan

This is the ordered resume plan after the 2026-08-20 motherboard maintenance. The operational state and
exact restart commands are in [HANDOFF.md](HANDOFF.md).

## 1. Restore and prove the canary

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

Once runtime recovery is proven, open a fresh PR from `agent/battle-command-deck` to `main`. PR #7 is
already merged and predates the post-merge planning-control and overflow commits; no current Actions run
covers the branch head.

## 2. Complete the only missing human-release gate

- Use two distinct Discord accounts in isolated browser profiles.
- Save a legal weight-six fleet in each account.
- Create and accept a private challenge, confirming the creator's fleet remains hidden before acceptance.
- Submit Kinetic from the first seat, restart only the app container, and prove the locked plan, sessions,
  fleets, challenge, and pending submission survive.
- Submit from the second seat and confirm both projections advance to the same Artillery phase.

Exit criterion: record challenge/match IDs and mark real two-account acceptance and restart persistence
PASS in ignored deployment evidence. Until then, keep the release classified as a live canary.

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

- Make challenge acceptance transactional so a crash cannot orphan a match.
- Add abuse rate limits to intentionally public legacy/practice endpoints.
- Decide whether Resolution needs resumable server state; do not add it merely to preserve an animation.
- Public matchmaking, ranked play, progression, and economy remain out of scope until the private friend
  loop produces useful human evidence.
