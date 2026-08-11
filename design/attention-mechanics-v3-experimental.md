# Attention-Economy Command Engine v3.1
## Spatial Action Economy and Artillery — Experimental Specification

Status: **EXPERIMENTAL; STAGES A–C PASSED BOUNDED GATES; NOT PROMOTED**  
Model version: `duel-capacity-v3-experimental`  
Date: 2026-08-10

Canonical rule update: new Attention manifests use a five-drift defeat limit. Drift 4 is
nonterminal; drift 5 or greater is defeat. Previously sealed four-drift evidence remains
immutable and must be labeled as a distinct ruleset in comparisons.

## 1. Decision and evidence boundary

The v3 direction is approved for bounded causal experiments, not for integration into the
accepted v1/v2 model line and not for a full shape screen.

Stage A passed its 9,216-match bounded differential probe and 72 exact replay sentinels.
Stage B then passed 4,608 common-stream pairs / 9,216 matches and 96 replay sentinels. Stage C
passed 2,304 common-stream pairs / 4,608 matches and 48 replay sentinels. The compact results
are recorded in:

- `data/experiments/attention-v3-stage-a-probe/ASSESSMENT.md`
- `data/experiments/attention-v3-stage-b-spatial-probe/ASSESSMENT.md`
- `data/experiments/attention-v3-stage-c-artillery-probe/ASSESSMENT.md`

These results validate the bounded mechanics and their direct causal counters. They do not
promote v3 or widen the evidence boundary to the remaining shell catalog, reloads, cooldowns,
or counter-battery.

The corrected v2 campaign remains immutable evidence for `duel-capacity-v2`. Its
9,216,000 matches did not execute Unit Action Points (UAP), ranged artifact placement,
local verification, artillery, armory reloads, or counter-battery fire. Those results may
select baseline models and pressure samples, but they cannot validate v3 mechanics.

The historical 96.4562% Player-1 result describes a causally decoupled fixed-policy runner.
It is not an estimate of intrinsic seat advantage. The corrected screen is the relevant
baseline: pooled Player-1 score 0.5277, self-play Player-1 score 0.5465, and mean absolute
exact-reversal effect 0.1563.

Authoritative parent evidence:

- `data/lab/attention-v2-corrected-shape-screen-analysis/ASSESSMENT.md`
- `data/lab/attention-v2-corrected-shape-screen-analysis/NEXT_CAMPAIGN.md`
- analysis hash `sha256:9e92787ff92b804fb7facc67b46ad9a9b877a5e8ef569ec3070bc9a52322cb9b`
- completion hash `sha256:9ae18a15408a2ec6272a18efba74d1b64d03b570e605b6d81a3cd10a83702769`

## 2. Versioning and compatibility contract

1. v1 and v2 definitions, intent behavior, replay behavior, and archived records remain
   valid and unchanged.
2. UAP behavior is enabled only when `modelVersion` is
   `duel-capacity-v3-experimental` and the model contains a valid `uap` definition.
3. A v3 model rejects legacy per-unit `move` intents. A v1/v2 model rejects v3
   `unit-actions` intents. The resolver never silently translates between them.
4. Internal chassis identifiers remain `scout`, `line`, and `siege`. Light, Medium, and
   Heavy are presentation labels only.
5. Every v3 state transition remains deterministic from the model, scenario, prior state,
   complete simultaneous intent batch, seed, and random-stream identifier.

## 3. Delivery stages

### Stage A — UAP action economy

Stage A replaces free ranged movement and automatic Scout/Siege stationary benefits with
explicit per-unit UAP plans. Artifacts retain their current source-cell placement. Capacity,
attention commands, Perfect Focus, Overclock, and Macro Flare remain compatibility controls.

Stage A intentionally excludes active-range adjustment and Support Scan because neither can
have a causal meaning until artifacts become spatially separated in Stage B.

### Stage B — spatial artifacts and local verification

Stage B adds persistent active range, an explicit public emission phase, keyed spatial
spawning, local verification, and Line Support Scan. It is implemented only when the v3 model
contains a valid `spatial` definition.

### Stage C — first artillery counterplay pair

Stage C replaces Macro Flare with Flare Shell and adds Chaff. Artillery declarations resolve
as a simultaneous public batch after emission and before movement. The initial armory contains
one known copy of each enabled shell and does not reload.

### Stage D — remaining shell effects

Smoke, EMP, and HE are introduced one at a time with mechanic-specific differential probes.

### Stage E — armory and counter-battery

Only after shell effects pass causal gates may the experiment add public seeded reloads,
cooldowns, and bounded counter-battery privileges.

### Stage F — bounded cross-profile audit

A passing bounded audit may authorize a larger v3 campaign. No earlier stage may reuse the
completed v2 match counts as v3 evidence.

## 4. Stage A mechanical contract

### 4.1 UAP budgets

| Chassis | UAP per round | Baseline calibration | Existing throughput |
|---|---:|---:|---:|
| Scout | 3 | 0.20 | 3 |
| Line | 2 | 0.60 | 2 |
| Siege | 1 | 0.90 | 1 |

UAP is local to a unit. It cannot be transferred, banked, or purchased with commander
attention. Every Stage A action costs exactly 1 UAP. Unspent UAP expires at the round
boundary.

### 4.2 Ordered unit plans

Each player submits at most one `unit-actions` intent for each owned unit. Its `actions`
array is ordered and atomic. Legal Stage A actions are:

- `move`: move exactly one Chebyshev tile to the supplied in-bounds destination;
- `turbo-charge`: Scout-only component of Active Recon;
- `step-up`: Scout Active Recon component or Line direct calibration;
- `command-uplink`: Siege-only explicit Uplink activation.

The resolver validates the complete plan before applying any action. An over-budget,
malformed, wrong-chassis, out-of-bounds, non-adjacent, duplicate, or collision-blocked plan
is rejected atomically. It moves no unit, spends no UAP, grants no configuration benefit,
and does not count as a deliberate hold.

Omitting a unit plan or submitting an empty action array is a deliberate hold. Multiple
plans for one unit are invalid rather than last-write-wins.

### 4.3 Simultaneous movement and occupancy

Only final cells use exclusive occupancy during Stage A. Paths may cross and closed swaps or
cycles are legal. If two or more moving units request the same final cell, every conflicting
move plan is rejected. No player priority or unit-id tie-break is used. A move into the final
cell of a stationary or rejected unit is rejected; this blocking rule is evaluated to a
fixed point.

`movementSpent` records executed move steps, including a legal path that returns to its
origin. Configuration actions do not increment movement distance.

### 4.4 Scout state machine

The Scout has two mutually exclusive calibration paths.

**Active Recon** is exactly this three-action plan:

1. `move` exactly one tile;
2. `turbo-charge`;
3. `step-up`.

A valid Active Recon plan spends all 3 UAP and queues 0.85 calibration for the next emission.
Turbo-Charge or Step-Up in any other Scout sequence rejects the entire plan.

**Passive Settle** requires a deliberate zero-action hold. Consecutive valid holds queue the
following calibration for the next emission:

| Consecutive holds | Queued calibration |
|---:|---:|
| 1 | 0.40 |
| 2 | 0.65 |
| 3 or more | 0.85 |

Any executed action or rejected plan resets the Passive Settle streak. Forced displacement,
when introduced, will also reset it.

### 4.5 Line state machine

Line may combine up to 2 move and/or Step-Up actions in any order. It may Step-Up at most
once per round. A valid Step-Up queues 0.85 calibration for the next emission.

During the Stage A compatibility bridge, a deliberate zero-action Line hold continues to
generate the existing Target Lock benefit. Spending UAP prevents that stationary benefit.
Stage B replaces this bridge with the explicit Support Scan contract.

### 4.6 Siege state machine

Siege chooses among one move step, one `command-uplink`, or a deliberate hold.

A valid Command Uplink:

- spends the Siege unit's only UAP;
- queues +1 commander attention for the next round, subject to the model's existing stack
  limit;
- queues 0.20 calibration for that unit's next emission.

Holding no longer activates an Uplink automatically. A Siege that moves or holds returns to
its baseline calibration at the next emission unless another rule explicitly changes it.

## 5. Stage A phase order

v1/v2 retain their existing phase order. A v3 Stage A round resolves as follows:

1. **Emission** — emit artifacts at each source unit's current cell using calibration and
   Flare state established at the previous round boundary.
2. **Unit plan resolution** — validate the complete batch, resolve final-cell conflicts
   simultaneously, apply valid movement/configuration, and queue next-round effects.
3. **Capacity** — resolve capacity claims using the existing simultaneous capacity contract.
4. **Commander attention** — resolve verification, acceptance, rejection, seizure, Target
   Lock, and compatibility capacity abilities.
5. **Round resolution** — resolve or dispose of artifacts, update progress and drift, apply
   queued calibration/Uplink effects, reset UAP spent, and check terminal conditions.

Emission precedes UAP actions so the next-emission language is literal. In Stage B/C, emission
is its own transition: keyed coordinates enter the public projection before either controller
submits a unit plan. Stage C inserts one simultaneous artillery batch between emission and
movement, allowing Chaff to intercept the current declaration and movement to answer a Flare
before its first affected emission.

## 6. Locked Stage B spatial decisions

These decisions define the implemented Stage-B boundary:

1. For active range `r`, an artifact coordinate is sampled uniformly from in-bounds cells
   whose Chebyshev distance from the source is between 1 and `r`, inclusive.
2. The coordinate draw key contains the normalized matchup identity, battle sample, seed,
   round, source unit, and artifact index. Sequential RNG consumption is forbidden.
3. Normal verification requires a friendly unit to finish within one tile of the artifact.
4. Line Support Scan costs 1 UAP and makes one artifact within the Line's active range
   locally verifiable for that round.
5. The existing attention verification cost remains fixed in the first spatial experiment.
   Distance-variable attention cost is a separate later factor.
6. Range adjustment costs 1 UAP, changes range by exactly one within model bounds, applies
   to the next emission, and resets Scout Passive Settle.

## 7. Locked artillery decisions

Implemented Stage C:

- Artillery declarations are batched and resolve without player priority.
- Flare Shell replaces, rather than stacks with, Macro Flare in artillery-enabled models.
- Flare is a 3x3, ×2 output zone lasting exactly two emission phases.
- Same-phase Chaff resolves before hostile non-Chaff shells. It blocks a shell when the
  shell's target center is inside the Chaff zone.
- Chaff is a 3x3 screen lasting the declaration phase in which it is fired and the next
  artillery phase.
- Each player starts with one public Flare and one public Chaff. Fired shells are depleted;
  Stage C has no reload or cooldown.
- Perfect Focus and Overclock remain available. Macro Flare commands reject explicitly in an
  artillery-enabled model.

Locked for later artillery stages:

- EMP duration is measured in UAP action phases. Smoke and Chaff durations identify their
  exact affected phases.
- HE resolves each artifact's existing latent `sound` value. It never performs a new fixed
  70% roll.
- Counter-battery is a one-use privilege expiring after the next artillery phase. It does
  not rewrite the natural cooldown, and a retaliatory shot does not create another
  counter-battery privilege.
- A later public seeded deck must specify replacement, duplicate, depletion, and draw-key
  rules.

## 8. Causal instrumentation

Every Stage A run exposes, per player:

- UAP available and spent;
- accepted and rejected unit-plan counts;
- executed move steps;
- Turbo-Charge and Step-Up executions;
- Passive Settle activations by level;
- explicit Command Uplink executions and attention generated;
- rejection reason counts in the event trace.

Stage B additionally exposes artifact count and total spawn distance, range shifts, Support
Scans, local and scan-mediated verifications, out-of-range verification rejections, and
beyond-reach auto-accepts. Stage C additionally exposes each shell fired, successful Flare
establishment, shells blocked by Chaff, and both the firing and blocking player attribution.

An enabled action is not considered validated merely because it executed. Differential
probes must show an intent, state, explicit mechanic counter, or outcome change under common
random streams.

## 9. Validation gates

### Stage A conformance

- 100% schema-valid hidden state and projections;
- deterministic replay and trace hashes from identical inputs;
- atomic rejection for over-budget and illegal action sequences;
- input-order invariance for simultaneous plans;
- no priority winner for duplicate destinations;
- exact 0.40/0.65/0.85 Scout Passive Settle progression;
- exact Scout Active Recon, Line Step-Up, and explicit Siege Uplink timing;
- unchanged v1/v2 unit and integration tests.

### Stage A differential probe

Run common-stream contrasts across all three chassis, deliberate hold versus mobility, the
accepted Scout combo, Line Step-Up, Siege Uplink, both seats, and battle-pressure samples
selected to stress objective-coupling × movement. Report results by self-play, nearby,
adversarial, and uniform strata; pooled success cannot hide a failing stratum.

### Stage B result

- Plan: `attention-v3-stage-b-bbb15898fd681c4c`
- Plan hash: `sha256:bbb15898fd681c4cd783a3c053f1742f629ec3706809dd464f1ee6390b9524da`
- Report hash: `sha256:d517e38297f2419652c35e9ee23b34d3be9dc7c2b505a4439162b444e58b04ed`
- 4,608/4,608 common-stream pairs, 9,216/9,216 matches, 96/96 replay sentinels,
  zero plan rejections, and every direct spatial gate passed.

### Stage C result

- Plan: `attention-v3-stage-c-e7e63d4c273a0479`
- Plan hash: `sha256:e7e63d4c273a0479f1200dfbb9421e6add6b5b6a3521a9e86e5bccf4b25d38e6`
- Report hash: `sha256:869099e6a2539111f6d996fadbff3080b6c62b0d6dcfdeff879419015e67b9e5`
- Parent Stage-B report hash: `sha256:d517e38297f2419652c35e9ee23b34d3be9dc7c2b505a4439162b444e58b04ed`
- 2,304/2,304 common-stream pairs, 4,608/4,608 matches, 48/48 replay sentinels,
  zero plan or artillery rejections, zero reloads, and every direct Flare/Chaff gate passed.

### Stage C1 response-doctrine result

- Plan: `attention-v3-stage-c1-7b26766ed292281c`
- Plan hash: `sha256:7b26766ed292281c3673000d3d57bee135dda27b0edacf02110c445d8dd7bd26`
- Report hash: `sha256:b6af622b1c9e312be0861f4ffd3513c2f5ad64d52f9b9c16ea814c6f2224e268`
- Parent Stage-C report hash: `sha256:869099e6a2539111f6d996fadbff3080b6c62b0d6dcfdeff879419015e67b9e5`
- 768/768 common worlds, 5,376/5,376 matches, 56/56 replay sentinels, zero plan
  or artillery rejections, zero reloads, and every response-policy mechanism gate passed.
- Doctrine is a first-order interaction: hold led all confidence-threshold cells, while local
  verification favored Scout peel + Support Scan at moderate/high soundness and Chaff at the
  lower-soundness pressure samples. No single static response is promoted.

### Stage C2 adaptive holdout result

- Plan: `attention-v3-stage-c2-2ec219830f0af361`
- Plan hash: `sha256:2ec219830f0af36105db90566756d73d3f80028d3c2d7db3f33b857d13c7f302`
- Report hash: `sha256:93d5e5c3caa2411e3e9c30570d44cbc9d88af6d866d7cd09eab9643879ac50ea`
- Parent Stage-C1 report hash: `sha256:b6af622b1c9e312be0861f4ffd3513c2f5ad64d52f9b9c16ea814c6f2224e268`
- 512/512 training worlds and 4,096/4,096 training matches selected public-risk threshold 6;
  256/256 untouched holdout worlds and 1,024/1,024 holdout matches then ran once, with 96/96
  exact replay sentinels and every conformance gate passing.
- The adaptive policy beat the best pooled static holdout response by 0.0566 and improved both
  seats, but failed its frozen cell-safety gate in binary 0.70/local verification (-0.1094) and
  distance-weighted 0.80/local verification (-0.1563). At the round-one response point the
  scalar reduces to `3 + low-confidence count`, because drift and overload are invariant.
  This threshold is rejected as a promotion policy; the failure does not invalidate spatial
  spawning, Support Scan, Flare, or Chaff.

### Stage C3 ruleset-aware spatial holdout result

- Plan: `attention-v3-stage-c3-0b316976b0976c46`
- Plan hash: `sha256:0b316976b0976c46c51a9a4c34711a54b19f31698d2c70ae767d4aab6d1139b1`
- Report hash: `sha256:8b92063ddeabada20beb3fc07ad57ebcdba90ad3684f1ea01361c97aa3217174`
- Parent Stage-C2 report hash: `sha256:93d5e5c3caa2411e3e9c30570d44cbc9d88af6d866d7cd09eab9643879ac50ea`
- 1,024/1,024 fresh training worlds and 3,072/3,072 simulated training matches evaluated
  25,600 frozen candidate-world decisions by exact common-world static lookup. The selector
  chose low-confidence total count at least 4 for distance-weighted/local play.
- 512/512 untouched holdout worlds and 2,048/2,048 actual holdout matches passed all 14
  conformance gates, all four promotion gates, 56/56 exact replay sentinels, and 512/512
  adaptive-to-static branch parity checks.
- The ruleset-aware policy scored 0.6523 versus 0.5693 for the best pooled static control,
  improved both seats, and remained within 0.0235 of every pressure-by-doctrine cell's best
  static response. This nominates the policy for a larger bounded audit; it does not promote
  the model or authorize additional artillery mechanics.

### Stage C4 generalization and hostile-aim audit result

- Plan: `attention-v3-stage-c4-6831dd0d5311ef5b`
- Plan hash: `sha256:6831dd0d5311ef5bb27a0080c074f742065ddd33c277e0e39cd84593a574f8b8`
- Report hash: `sha256:9be23296c0eafd9def6253e2f73fecd0c86afba5b4b998151727816f468d9cd6`
- Parent Stage-C3 report hash: `sha256:8b92063ddeabada20beb3fc07ad57ebcdba90ad3684f1ea01361c97aa3217174`
- The fixed Stage-C3 response ran without reselection on 1,728/1,728 fresh worlds and
  6,912/6,912 matches across nine unseen soundness samples and three hostile aim modes. All
  13 conformance gates, 216/216 replay sentinels, and 1,728/1,728 branch-parity checks passed.
- The response beat every static policy when pooled and won under each hostile aim mode, even
  though artifact-density and far-objective targeting landed beyond its proactive Chaff screen
  in 41.7% and 67.5% of worlds. Spatial aim was not the primary failure.
- The audit nevertheless failed two no-masking gates. The hard global-to-Chaff rule trailed by
  0.1302 at global 0.55/local and 0.1927 at global 0.75/local; high-soundness local cells also
  exposed holding as a missing response. The Stage-C3 policy is not retained as a general
  artillery doctrine outside its original frozen boundary.

### Stage C5 three-response disjoint-soundness holdout result

- Plan: `attention-v3-stage-c5-e04e889e2e70a8b4`
- Plan hash: `sha256:e04e889e2e70a8b4cf36403118bd24fe1a6a480f85ab197e35212cff5a40a9e9`
- Report hash: `sha256:f1c12e3a12930dea0f32a40946305146ac1267d04bb860a9bcef361cdf477081`
- Parent Stage-C4 report hash: `sha256:9be23296c0eafd9def6253e2f73fecd0c86afba5b4b998151727816f468d9cd6`
- 864/864 training worlds and 2,592/2,592 simulated training matches evaluated 14,688
  candidate-world decisions. The selected per-coupling rules then ran on 1,728/1,728 untouched
  worlds and 6,912/6,912 actual matches at disjoint soundness levels.
- All 17 conformance gates, 297/297 replay sentinels, and 1,728/1,728 adaptive branch-parity
  checks passed. The three-response policy scored 0.6050 versus 0.5573 for the best pooled static
  control and passed both seats, every aim, every coupling-by-aim-by-doctrine cell, and every
  pooled coupling/local gate.
- The pressure-specific holdout gate failed at the unseen extremes: -0.0938 at binary 0.95/local,
  -0.0833 at global 0.25/local, and -0.0938 at distance 0.95/local. All selected hold thresholds
  were zero, so holding remained rare. The topology is promising, but these thresholds are not
  promoted; full-envelope single-snapshot feasibility remains unresolved.

### Promotion boundary

Stages A–C have passed their separate frozen bounded gates. This authorizes continued bounded
v3 experiments but not a full shape screen or promotion. Smoke, EMP, HE, reloads, cooldowns,
counter-battery, commander-catalog expansion, and any distance-variable verification cost each
require a separate frozen plan, direct causal counters, common-stream checks, and bounded gate.
