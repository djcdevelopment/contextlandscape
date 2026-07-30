# What is actually implemented

The archived vision documents under `docs/archive/` describe a far larger game than this repository
contains. This file is the boundary between the two. If a feature is not listed under **Real** below,
it does not exist in code — do not build on it, and do not describe it as working.

Last verified against engine `0.3.0`.

## Real

### Rules engine (`packages/engine`)

- Seven actions: `scout`, `build_contract`, `implement`, `review`, `defend`, `full_send`,
  `consolidate`. All cost 1 commander energy except `full_send` at 2, before tuning overrides.
- Four rules profiles — `integration`, `false_bottleneck`, `context_furnace`,
  `documentation_fortress` — which branch the effects of `scout`, `implement`, `review`, `full_send`,
  and `consolidate`, and set the win threshold (7, or 6 for `false_bottleneck` and `context_furnace`).
- One resource that binds: `commanderEnergy`. Defeat on slot 8, on no affordable action remaining
  below the win threshold, or on `heat >= 8` in `context_furnace`.
- Deterministic resolution, FNV-1a event and projection hashes, exact replay, and a reconstruction
  derived from the event log. A golden-hash test pins the hashes for a fixed route.
- Fog of war reduced to one rule: `knownCells` starts as three cells and `scout` appends three more,
  which is what makes the single enemy unit visible.

### Attention economy (`packages/engine/src/command.ts`)

A second, independent reducer. It does not touch the seven-verb game above and is not yet exposed
through the server or the browser.

- Each mech emits artifacts per round according to its `throughput`. The commander's attention
  budget is deliberately smaller than full supervision, and anything left unreviewed at the end of a
  round is **accepted unseen**.
- Four verbs: `verify` (costs attention, reveals soundness, resolves nothing), `accept` and `reject`
  (free — the scarce resource is looking, not deciding), and `seize` (costs that mech's `seizeCost`,
  guarantees progress).
- Mechs differ in `throughput`, `seizeCost`, and **`calibration`** — how well their reported
  confidence predicts soundness. They do **not** differ in how often they are right, because the
  attempt-bank pilot found no accuracy gradient between real model tiers.
- Accepting unsound work accrues `drift`; enough of it loses the mission.

Verified by `npm run simulate:command`, and guarded by design tests in
`apps/simulator/src/command-policies.test.ts` that fail if the mechanic loses its decision: spending
attention must beat ignoring the fleet, reading the confidence signal must beat inspecting blindly,
and no single policy may be best in every composition.

### Research rig

- `apps/lab` — sharded, resumable synthetic matrix worker with a streaming reducer, Wilson intervals,
  Pareto frontier, pressure sensitivity, and recommendation-only candidate patches.
- `apps/server` — Fastify API with PostgreSQL or in-memory persistence, idempotent commands,
  optimistic concurrency, per-match and per-session locks, and **server-side blinding** of lab
  treatments.
- Gameplay labs GL-001…GL-005: 24 blinded variants, counterbalanced trial ordering, review gates that
  require an explanation before reconstruction, joined exports, and executable follow-up matrices.
- Boot-time preflight proving every variant is reachable and every control replays identically.
  `LAB_PREFLIGHT=auto` (default) still boots when the large source reports are absent; `strict`
  requires them; `warn` downgrades rules failures too.

## Not real

These are named in the vision documents, in schemas, or in scenario metadata, and are **not
implemented**:

| Thing | Status |
| --- | --- |
| Movement | None. `unit.x` / `unit.y` are set once and never change. |
| Damage, HP, armor, destruction | None. `unit.active` is never set to `false`. |
| Enemy AI | None. `siege-01` is a static prop; `enemyDoctrine` is prose no code reads. |
| Weapons, mounts, loadouts, tools | No schema, no data, no code. |
| Per-unit `heat` / `dispersion` | Fields exist on `UnitState`; never written after creation. |
| Initiative | Sorting code exists but every caller passes one order per slot, so it never applies. |
| Composition (`scout-heavy` etc.) | Relabels chassis only. **No mechanical effect** — this is why the `sleep-01` campaign returned a null result on chassis balance. |
| `seed` | Stored, hashed, and pinned, but the engine never branches on it. Only `apps/lab` uses it, to vary starting tuning. |
| `dispersion`, `confidenceDrift`, `commanderLoad` | Tracked and mutated, but gate no outcome. |
| Scenario metadata | `lanes`, `knownTerrain`, `hiddenTruths`, `mapWidth`/`mapHeight`, `artifactSlots`, `victoryConditions`, `failureConditions`, `falseLeads`, `availableMechs` are inert strings. The board is hard-coded 10×10 in the UI. |
| `fireControl.recommendation` | Computed and sent to the client; never rendered. |
| `single` fire mode | Legal in the schema and used by lab policies; unreachable from the UI. |
| Discord | `packages/discord-adapter` is two pure functions building embed objects. No bot, no transport, no caller. |
| Challenges / PvP | Endpoints exist, but there is no second-player turn structure or per-player projection split. |
| Progression, profiles, accounts, matchmaking, ranked, economy beyond energy | None. |

## Known limits of the evidence

- The `sleep-01` campaign ran 19,456,000 matches. It found policy and tuning boundaries, but produced
  **no valid chassis-balance signal**, because composition cannot affect resolution under the current
  one-order-per-slot rules.
- No real human has completed a blinded lab session. Every export under `data/playtests/` is a
  synthetic workflow check from participant `integration-tester`.
- Engine `0.3.0` changed emitted event data, so its hashes differ from the `0.2.0` reports under
  `data/lab/`. Those reports record their engine version and remain valid for the engine that
  produced them.
