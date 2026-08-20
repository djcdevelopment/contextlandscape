# What is actually implemented

The archived vision documents under `docs/archive/` describe a far larger game than this repository
contains. This file is the boundary between the two. If a feature is not listed under **Real** below,
it does not exist in code — do not build on it, and do not describe it as working.

Last verified against legacy engine `0.3.0` and Battle Command ruleset
`attention-economy-v4.2`. This file describes repository behavior, not the health or acceptance state of
any live deployment.

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

### Battle Command v4.2 (`packages/engine/src/attention-v4.ts`)

- A separate deterministic two-player reducer is exposed through the Fastify API and the default
  browser battlefield. Automatic Register and Resolution surround simultaneous Kinetic, Artillery,
  and Capacity submissions plus alternating Command intents.
- Fleets spend exactly six weight (Scout 1, Line 2, Heavy 3), contain three to five units, at most one
  Heavy, and at most four Scouts. The shared contracts admit five composition modules and reject the
  retired extreme fleets in the UI, API, compiler, and restored state.
- Spatial movement, output allocation, persistent artifacts, Context Limits, Batteries, artillery,
  attention triage, Progress, Drift, and deterministic legal-action projections are implemented.
  Incompatible pre-v4.2 operations return `410 battle_ruleset_retired` instead of being reinterpreted.
- Solo operations use a compiled deterministic doctrine. Authenticated friend operations use
  viewer-relative projections, buffer each simultaneous submission, alternate Command by seat, persist
  revisions, and notify the other browser through a revision event stream.
- The browser uses a phase-led Command Deck: a five-stage stepper, permanent operation rail, persistent
  context and armory regions, portrait-linked board/fleet selection, an in-flow action dock, and four
  user-controlled interface scales. Kinetic orders remain visible on every planned unit card and board
  token after focus changes; available actions use icon/beacon affordances and staged actions retain a
  dashed locked treatment.
- Resolution is an explicit client presentation assembled from the completed-round view and atomic
  server recap. It is read-only and keyboard-focused on Continue; because Register and Resolution are
  atomic in the v4.2 contract, reconnecting after that transition may skip the presentation and show the
  next authoritative Kinetic view directly.
- Desktop short-wide sizing is based on actual viewport height rather than board width. The production
  layout is regression-tested without document overflow at a 2048×900 CSS viewport in both Perspective
  and Tactical modes; tablet and mobile layouts use contained scroll regions and in-flow controls.
- The v4.2 ruleset is frozen as the human-playtest baseline, not declared balanced. Deterministic
  controller evidence is still dominated by Drift terminals while the Progress route is effectively
  absent.

### Human release (`apps/server/src/human-release.ts` and `apps/web/src/human`)

- Discord OAuth2 authorization-code flow with PKCE requests only `identify`, uses the provider token
  for the identity lookup, and does not retain that token. Opaque application sessions are hashed at
  rest; production cookies are `Secure`, `HttpOnly`, and `SameSite=Lax`; mutations require a CSRF token.
- PostgreSQL-backed accounts, sessions, cloud fleets, private challenges, pending simultaneous
  submissions, and Battle Command matches are durable. The same stores have an in-memory mode for
  tests and portable runtime checks. Account, fleet, sign-out, and account-deletion flows exist.
- The Hangar saves drafts and validates ready weight-six fleets. Players can assign unit, commander,
  and battlefield art from the paged base catalog, plus a palette and emblem. Runtime media is served
  from a read-only compiled catalog; a small generated fallback exists for local resilience only.
- A ready fleet can create a 24-hour private friend link. Fleet snapshots and art stay hidden until a
  distinct account locks a legal fleet and accepts; accepted operations retain immutable snapshots and
  can be resumed or conceded. There is no turn clock.
- Automated tests cover the application surface, but implementation does not itself prove that Discord,
  media, persistence, or two-account play is accepted on a particular deployment.

### Attempt-bank command pilot (`packages/engine/src/command.ts`)

This earlier independent reducer does not touch the seven-verb game or Battle Command v4.2 and remains
simulator-only.

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
`apps/simulator/src/command-policies.test.ts`. Two properties hold at 2000 seeded runs per cell:

- **Attention beats ignoring the fleet**, in every composition. `accept-all` places last everywhere,
  by +0.411 / +0.498 / +0.623 win rate. There is a decision here.
- **Reading the confidence signal beats inspecting blindly**, which beats inspecting the wrong
  things — `verify-lowest` > `verify-arbitrary` > `verify-highest`, monotonic in all three
  compositions, on identical attention. The commander's read is a skill, not a lookup.

**Known gap: composition is not yet a strategic choice.** `verify-lowest-confidence` wins all three
(0.852 / 0.967 / 1.000), so the fleet you field does not change how you should play. This is not
asserted as a test: its margin over `seize-cheapest` in scout-heavy is 0.022, about 1.4 standard
errors even at n=1000, so the winner flips with sample size and a test would fail at random.

An earlier measurement appeared to show composition mattering, with `seize-cheapest` taking
`balanced`. That was an artifact of a weak uniform — FNV-1a over 2^32 barely moves its high bits for
labels differing only in a trailing index, so every artifact a mech produced in a round shared one
fate (97.8% identical soundness against 37% expected). Fixed with an avalanche finalizer and
regression-tested; the apparent result did not survive it.

### Research rig

- `apps/lab` — sharded, resumable synthetic matrix worker with a streaming reducer, Wilson intervals,
  Pareto frontier, pressure sensitivity, recommendation-only candidate patches, and v2 provenance
  that content-addresses the source revision, model, scenario/policy sets, manifest, shards, and report.
  Canonical runs require clean identified source; legacy v1 evidence remains readable but is explicitly
  reported as historically unverifiable.
- `packages/contracts/src/landscape.ts`, `packages/engine/src/landscape.ts`, and
  `apps/server/src/landscape-routes.ts` — bounded sparse coordinates and viewer-scoped projections for
  a 6,400×6,400 theater, 32×32 chunks, and 32×32×32 battle volumes. The opt-in
  `?view=commander` Canvas UI supports theater LOD, selection, fronts, uncertainty, and battle layers
  without allocating the world densely.
- `packages/contracts/src/attention-v2.ts`, `apps/lab/src/landscape-sweep.ts`,
  `apps/lab/src/attention-v2-commanders.ts`, and the v2 runner/preflight tools — versioned 6,400-profile
  doctrine catalog, concrete composition/controller compiler, connected sparse matchup graph, balanced
  battle-sample catalog, frozen folds, exact lean/standard/deep budgets, enriched schema-v2 evidence,
  deterministic probe/audit modes, and resumable gzip-JSONL shards. The corrected 9,216,000-run shape
  screen is complete and supports provisional next-stage selection; later model sets still require a new,
  parent-linked plan and may not bypass the multi-sample, holdout, and v1 regression gates.
- `packages/engine/src/attention.ts` — versioned deterministic two-player attention reducer with a
  10×10 spatial layer, simultaneous movement, stationary Scout/Line/Siege trade-offs, shared capacity
  claims, Perfect Focus, Overclock, Macro Flare, blinded projections, and policy-independent random
  streams. `apps/simulator/src/attention-policies.ts` provides serializable projection-only policies;
  `apps/lab/src/attention-lab.ts` executes the paired stationary/capacity/holdout matrices and links
  their outcomes to immutable build provenance.
  The canonical v1r1 evidence accepts Scout specialization, Siege specialization, movement value, and
  stationary Line escort as the research baseline. Macro Flare remains experimental after failing its
  predeclared causal drift-defeat gate; see [the v1r1 research decision](../design/attention-duel-v1r1-decision.md).
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
| Movement in the legacy scenarios | `unit.x` / `unit.y` are set once and never change. Battle Command v4.2 has its own spatial Kinetic movement. |
| Damage, HP, armor, destruction | None. `unit.active` is never set to `false`. |
| Enemy AI in the legacy scenarios | `siege-01` is a static prop and `enemyDoctrine` is prose. Battle Command solo play has a deterministic compiled doctrine. |
| Customizable weapons, mounts, loadouts, tools | There is no player equipment system. Battle Command's artillery shell cards and fleet chassis are fixed rules content, not loadouts. |
| Per-unit `heat` / `dispersion` | Fields exist on `UnitState`; never written after creation. |
| Initiative in the legacy scenarios | Sorting code exists but every caller passes one order per slot, so it never applies. |
| Legacy composition (`scout-heavy` etc.) | Relabels chassis only. **No mechanical effect** — this is why the `sleep-01` campaign returned a null result on chassis balance. Battle Command uses a different, mechanically active fleet contract. |
| Legacy scenario `seed` | Stored, hashed, and pinned, but the legacy engine never branches on it. The lab and Battle Command reducers use deterministic seeds. |
| `dispersion`, `confidenceDrift`, `commanderLoad` | Tracked and mutated, but gate no outcome. |
| Legacy scenario metadata | `lanes`, `knownTerrain`, `hiddenTruths`, `mapWidth`/`mapHeight`, `artifactSlots`, `victoryConditions`, `failureConditions`, `falseLeads`, and `availableMechs` are inert strings. The legacy board is hard-coded 10×10 in the UI. |
| Legacy `fireControl.recommendation` | Computed and sent to the client; never rendered. |
| Legacy `single` fire mode | Legal in the schema and used by lab policies; unreachable from the UI. |
| Discord bot or embedded transport | The adapter formats challenge messages, but there is no bot login, gateway transport, slash command, or privileged intent. Discord is identity-only. |
| Public matchmaking, ranked play, progression, and broader economy | Persistent accounts and private cloud hangars exist; these larger product systems do not. |
| Downstream v2 refinement and holdout evidence | The corrected causal shape screen is complete, but its six provisional rows have not yet passed the planned multi-sample refinement, fresh-seed holdout, or v1 regression panel. No v2 rule model is promoted. |

## Known limits of the evidence

- The `sleep-01` campaign ran 19,456,000 matches. It found policy and tuning boundaries, but produced
  **no valid chassis-balance signal**, because composition cannot affect resolution under the current
  one-order-per-slot rules.
- No real human has completed a blinded lab session. Every export under `data/playtests/` is a
  synthetic workflow check from participant `integration-tester`.
- Engine `0.3.0` changed emitted event data, so its hashes differ from the `0.2.0` reports under
  `data/lab/`. Those reports record their engine version and remain valid for the engine that
  produced them.
- The frozen v4.2 controller studies overwhelmingly terminate through Drift; they do not establish
  human fleet balance or a viable Progress victory route.
- Live human-release acceptance is recorded only through
  [the deployment workbook](../HUMAN_RELEASE_DEPLOYMENT_WORKBOOK.md). A green test suite is not a claim
  that OAuth, ingress, the full art catalog, or two-account play has passed in production.
