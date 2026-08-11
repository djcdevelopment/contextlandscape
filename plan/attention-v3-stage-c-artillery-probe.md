# Attention v3 Stage-C Flare/Chaff anti-turtle probe

Status: **FROZEN FOR EXECUTION**  
Parent evidence: `attention-v3-stage-b-bbb15898fd681c4c`  
Model: `duel-capacity-v3-experimental` with spatial spawning + fixed Flare/Chaff hand

## Question

Does the minimal artillery pair create real pressure against stationary clusters, and can the
defender answer that pressure through either correctly placed Chaff or immediate spatial
relocation?

## Frozen design

- Three paired contrasts:
  1. hostile Flare against a stationary cluster vs artillery pass;
  2. centered same-phase Chaff vs pass against the same hostile Flare;
  3. immediate one-tile evacuation vs hold against the same hostile Flare.
- Four pressure samples spanning 0.45–0.80 soundness and binary/global/distance-weighted
  objective coupling.
- Two command doctrines: confidence threshold and local verification.
- Forty-eight seeds, both focal seats, and identical random-stream IDs for every treatment /
  control pair.
- Balanced composition, pass-capacity policy, one public Flare plus one public Chaff per player,
  no cooldown, no reload, and no Macro Flare.

This yields 2,304 paired comparisons / 4,608 match executions, plus deterministic replay
sentinels.

## Gates

1. Exact run count, exact replay, zero rejected UAP plans, and zero rejected legal artillery
   declarations.
2. Hostile Flare establishes a zone and affects non-zero output from a holding cluster.
3. Same-phase centered Chaff blocks the hostile Flare and contracts affected output.
4. Evacuation executes movement and contracts affected output relative to holding.
5. No reload event occurs and no hand count exceeds its fixed initial one-plus-one inventory.
6. All Stage-C runs retain spatial and artillery causal counters.

Score, progress, drift, and early-termination changes are directional evidence. A fired shell is
not validated unless it changes a direct impact counter.

## Outputs

- `data/experiments/attention-v3-stage-c-artillery-probe/PLAN.json`
- `data/experiments/attention-v3-stage-c-artillery-probe/report.json`
- `data/experiments/attention-v3-stage-c-artillery-probe/ASSESSMENT.md`
- `data/experiments/attention-v3-stage-c-artillery-probe/anti-turtle-effects.svg`

