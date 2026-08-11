# Attention v3 Stage-C1 response-doctrine probe

Status: **FROZEN FOR EXECUTION**  
Parent evidence: `attention-v3-stage-c-e7e63d4c273a0479`  
Parent report hash: `sha256:869099e6a2539111f6d996fadbff3080b6c62b0d6dcfdeff879419015e67b9e5`

## Question

Can a spatially coordinated response preserve more progress than full-fleet evacuation while
reducing the drift pressure of an unopposed hostile Flare? When should the one-shot Chaff be
spent rather than allowing the output surge?

## Common-world block

Every world fixes pressure, command doctrine, seed, focal seat, opponent, hostile Flare target,
and random-stream identifier. Seven response arms run against that same world:

1. `hold-pass` — hold position and preserve Chaff;
2. `full-evacuate` — move all three units outside the Flare zone immediately;
3. `scout-peel` — move only the low-calibration, high-throughput Scout outside;
4. `scout-peel-support` — Scout peel plus opportunistic Line Support Scan;
5. `compress-support` — compress every unit's next-emission range by one and use the Line's
   remaining UAP for Support Scan when a legal target exists;
6. `always-chaff` — block the hostile Flare with centered same-phase Chaff;
7. `risk-chaff` — fire centered Chaff only when the public risk index is at least five.

The public Chaff risk index is frozen as:

```text
current drift
+ max(0, own pending artifacts - current attention)
+ own pending artifacts with reported confidence < 0.50
```

No policy reads latent soundness or hidden artifact truth.

## Matrix

- Four Stage-C pressure samples: binary 0.70, global 0.45, distance-weighted 0.55, and
  distance-weighted 0.80 soundness.
- Two command doctrines: confidence threshold and local verification.
- Forty-eight seeds and both focal seats.
- Balanced composition, pass-capacity policy, one hostile round-one Flare, public fixed hands,
  and no reload.

The matrix contains 768 common worlds × 7 response arms = 5,376 matches, plus 56 deterministic
replay sentinels.

## Gates

1. Exact world/run counts, identical stream IDs within every block, and zero replay mismatch.
2. Zero rejected UAP plans and zero rejected legal artillery declarations.
3. Full evacuation moves three units and contracts Flare-affected output relative to hold.
4. Scout peel moves one unit and contracts some, but not all, Flare-affected output.
5. Scout peel + Support executes Support Scans and scan-mediated verification beyond Scout peel.
6. Compression executes three range shifts and lowers mean keyed artifact distance relative to
   hold.
7. Risk-Chaff activates in a strict subset of worlds, and every activation blocks the shell.
8. Fixed hand and no-reload invariants remain intact.

Score, progress, drift, and Pareto ranking are measured outcomes, not pass gates. The campaign
must retain pressure × doctrine × seat cells so pooled performance cannot hide a brittle policy.

## Outputs

- `data/experiments/attention-v3-stage-c1-response-doctrine-probe/PLAN.json`
- `data/experiments/attention-v3-stage-c1-response-doctrine-probe/report.json`
- `data/experiments/attention-v3-stage-c1-response-doctrine-probe/ASSESSMENT.md`
- `data/experiments/attention-v3-stage-c1-response-doctrine-probe/policy-tradeoffs.svg`
- `data/experiments/attention-v3-stage-c1-response-doctrine-probe/mechanic-load.svg`

