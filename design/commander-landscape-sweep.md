# Commander Landscape and Broad v2 Sweep

Decision date: 2026-08-09
Status: corrected causal shape screen complete; six rows provisionally selected for multi-sample refinement

## Intent

The next research phase should explore a broad space of original attention-command rules at high virtual effort before asking players to evaluate a prematurely narrow mechanic. Synthetic evidence cannot prove that a rule is fun or legible, but it can reject incoherent, inert, brittle, universally dominated, or composition-invariant models before scarce human attention is spent on them.

The design has two linked landscapes. They share identities and evidence, but they are not the same coordinate system.

## Implementation boundary

The sparse world contracts, coordinate helpers, viewer-scoped API, commander Canvas vertical slice,
6,400-profile catalog, connected matchup graph, battle-sample catalog, frozen folds, exact sweep
budgets, durable shape-screen shards, completion report, and explicit post-screen selection lineage are
implemented and tested.

Audit addendum: the first 9,216,000-run shape screen completed, but its runner used one balanced
composition and one fixed policy duel for every commander edge. Edge IDs changed the common-world
random streams without compiling commander modules into behavior. The evidence is valid for artifact
integrity, resolver execution, and narrow paired model sensitivity only. It may not satisfy commander,
viability, or survivor-selection gates. See the
[forensic assessment](../data/lab/attention-v2-shape-screen-analysis/ASSESSMENT.md) and
[corrected campaign plan](../plan/attention-v2-corrected-shape-screen.md).

Corrected addendum: the compiler now maps all 10 composition, 10 triage, 8 movement, and 8 capacity
modules into concrete match behavior and schema-v2 records retain profile, policy, composition,
controller, mechanic, battle-context, and seat attribution. A 32,768-run differential probe and
256,000-run audit passed before a new eight-shard screen completed 9,216,000/9,216,000 records. The
[causal assessment](../data/lab/attention-v2-corrected-shape-screen-analysis/ASSESSMENT.md) advances
design rows 22, 8, 25, 1, 29, and 15 to the linked refinement plan. This is valid train-screen evidence,
not final promotion evidence: only one battle sample and four train seeds were used, while exact seat
effects, stratum-specific terminal tails, supported dominance, fresh holdout, and v1 regression remain
open gates.

## Commander landscape

The player-facing world is a sparse strategic plane:

```text
6,400 × 6,400 strategic cells
  -> indexed in 32 × 32 chunks
  -> any strategic cell may anchor zero or more battles
  -> each battle has a 32 × 32 × 32 local volume
```

The theoretical address space contains 40,960,000 strategic cells and 1,342,177,280,000 possible local battle positions. It must never be allocated densely. Only active or observed fronts, contacts, field samples, battle summaries, and visible battle entities exist in storage or transport.

Strategic `(0,0)` is the northwest corner. Positive `x` points east and positive `y` points south.
Viewport bounds are half-open: `minX`/`minY` are included and `maxX`/`maxY` are excluded. The
current API and commander view expose deterministic, viewer-scoped fixtures for this coordinate model;
they are not yet persistent simulated world state. Sector and cell LOD labels currently describe the
client rendering scale rather than distinct server-side simulation resolutions.

The battle `z` coordinate is an operational layer/elevation from 0 through 31. It is not secretly reused as a tuning dimension. Sweep generators may vary spatial, formation, and information pressure, but those factors remain explicit metadata attached to a physical battle sample.

The commander view presents:

- theater-scale fronts, uncertainty, logistics, control pressure, and attention demand;
- sector and cell detail only when zoom makes it useful;
- a selected 32×32 battle slice with a 32-layer rail;
- viewer-scoped estimates instead of authoritative hidden enemy state;
- navigation and inspection as local UI actions, with only validated commander intents reaching the server.

## Doctrine outcome atlas

The virtual research landscape contains exactly 6,400 generated commander profiles:

| Module | Levels |
| --- | ---: |
| Three-unit Scout/Line/Siege composition multiset | 10 |
| Artifact-triage doctrine | 10 |
| Movement doctrine | 8 |
| Capacity/ability doctrine | 8 |
| Total | 6,400 |

The complete directed matchup atlas therefore has 40,960,000 cells before model variants, battle samples, or seeds. Profiles are projection-only, normalized, content-addressed, preflighted for enabled-rule exposure, and deduplicated before execution.

Observed cells use a connected sparse graph with both seat orientations. The standard screen uses degree 8 plus self-play, producing 57,600 oriented cells per model. Half of the non-self edges are broad modular coverage, one quarter are nearby in descriptor space, and one quarter are distant or adversarial. These are frozen design strata, not random draws: they carry explicit fixed-design analysis weights and must not be misread as population inclusion probabilities.

Predicted cells are visibly labeled predictions. They may select additional training samples but may not satisfy a survivor, holdout, or promotion gate.

## Broad rule-shape families

`duel-capacity-v1` remains immutable and appears only as a paired bridge. `duel-capacity-v2` explicitly represents rule shapes that v1 fixed in schemas or runtime:

1. attention budget;
2. verification cost;
3. objective target;
4. drift limit;
5. base soundness;
6. objective coupling to space;
7. chassis throughput shape;
8. seize-cost shape;
9. calibration separation;
10. movement separation;
11. stationary qualification;
12. Scout stationary payload;
13. Line stationary payload;
14. Siege stationary payload;
15. capacity topology;
16. ability unlock basis;
17. ability package;
18. unresolved-artifact disposition.

A full three-level factorial would contain 387,420,489 model rows. Stage 1 instead uses 36 frozen,
balanced mixed-level main-effect rows, the exact v1 bridge, and three structural sentinels. The
resulting 40-row catalog is materialized and content-addressed; it does not claim optimality that has
not been demonstrated. Predeclared local designs estimate interactions only after survivors are selected.

The structural alternatives must be real resolver behavior, not labels in `factorLevels`. In particular, v2 must distinguish pioneer-copy capacity from v1's shared-exclusive track, voluntary holding from a blocked move, and backlog/confidence defaults from automatic acceptance.

## Standard campaign

| Stage | Runs | Purpose |
| --- | ---: | --- |
| Shape screen | 9,216,000 | Forty rule-shape rows over the common sparse commander graph and paired worlds. |
| Survivor refinement | 11,059,200 | Six survivors with four local variants on a disjoint graph. |
| Sparse volume drill-down | 3,145,728 | Three finalists over selected physical battle samples and both seats. |
| Full-volume sentinel audit | 1,572,864 | Four locked pairs per finalist across every 32³ local coordinate. |
| Landscape holdout | 4,915,200 | v1 plus two frozen candidates on disjoint edges, battle samples, and seeds. |
| Gate confirmation | 100,000 | Fresh confirmation panels for accepted v1 mechanics and Flare value/guardrails. |
| **Total** | **30,008,992** | |

The lean sizing envelope is 5,949,088 runs and the deep envelope is 153,570,624. Their stage arithmetic
is frozen, but their exact edge/sample catalogs are not materialized as runnable plans. The fully
materialized standard plan is the default because the repository has already completed a 19-million-run
campaign, but measured runtime and artifact throughput must be confirmed with a bounded Docker smoke
before canonical execution.

The entire edge, battle-sample, paired-world, and fold skeleton is frozen before Stage 1. Train,
refinement, and holdout non-self edge catalogs are disjoint. The 256 drill samples are exact members of
the full 32³ frame; the sentinel deliberately covers that whole frame. Separation is therefore enforced
on the complete edge/sample/world assignment, not by pretending a full-frame audit can have no sample
IDs in common with holdout. Candidate count is frozen at two before the holdout is opened. A failed
holdout creates a new version and fold; it never triggers tuning against the same evidence.

Model membership is frozen one stage at a time. The initial plan materializes only the 40-row shape
screen; refinement, drill-down, sentinel, holdout, and confirmation sets remain non-executable pending
their completed upstream evidence and selection reports. Each child plan links its parent plan, root
catalog, upstream model-set membership, and selection report. The dependency chain is shape screen →
refinement → drill-down → exact finalist reuse in the sentinel → holdout → confirmation, so a later
stage cannot silently substitute candidates or execute before its parent set is complete.

The shape-screen runner is resumable and content-addressed: it writes one immutable `manifest.json`,
gzip JSONL shards, per-shard completion markers, and a compact report. A partial marker may be rebuilt
from the same deterministic prefix; a complete marker or manifest cannot be overwritten with different
content. Reports refuse partial or hash-mismatched shards.

## Viability criteria

Stage 1 advances no more than six Pareto-nondominated model families. A survivor must:

- have no schema, runtime, reference, or projection-secrecy failure;
- expose every enabled mechanic in at least 5% of eligible strata;
- keep draws below 5% and round-limit terminals below 10%;
- avoid a universally dominant commander with an adjusted lower bound above 65%;
- represent at least six of the ten compositions among its top 100 commanders;
- keep Scout, Siege, movement, and escort evidence on the accepted side of their v1r1 criteria;
- improve at least one preregistered landscape-health metric over paired v1 with multiplicity-adjusted support.

The primary landscape metrics are effective commander diversity, best-response regret, composition-policy interaction, dominance, counterplay, enabled-rule exposure, stability across battle samples, and sensitivity without brittleness.

The historical 80% Macro Flare causal-necessity gate remains recorded as failed and is still reported as a diagnostic. It is not retroactively changed. Successor Flare-like mechanics are judged as strategic swings using the separately locked paired effect, dominance, retention, mechanism, reachability, and regression guards in [`attention-duel-v1r1-decision.md`](attention-duel-v1r1-decision.md).

## Evidence and promotion

Every plan, rule row, commander catalog, stage model set, selection report, sparse edge set, battle-sample catalog, manifest, shard, report, and ledger entry is content-addressed. The chain retains the parent v1 hashes while using new v2 IDs and schemas.

Matrix completion, low-rank estimates, and active-learning scores are navigation aids, not evidence. Only observed frozen holdout cells can promote a model.

Human play begins after the virtual sweep has produced a stable, reproducible frontier with multiple viable commander archetypes. The human question is then whether those original decisions are understandable, expressive, and enjoyable—not whether the underlying model functions at all.
