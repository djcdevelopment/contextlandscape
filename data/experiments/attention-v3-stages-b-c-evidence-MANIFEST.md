# Attention v3 Stages B–C evidence bundle

Created: 2026-08-10  
Model: `duel-capacity-v3-experimental`  
Scope: bounded Stage-B spatial and Stage-C Flare/Chaff causal probes

## Evidence chain

| Stage | Plan | Executions | Replay sentinels | Report hash | Result |
|---|---|---:|---:|---|---|
| B — spatial | `attention-v3-stage-b-bbb15898fd681c4c` | 4,608 pairs / 9,216 matches | 96/96 | `sha256:d517e38297f2419652c35e9ee23b34d3be9dc7c2b505a4439162b444e58b04ed` | PASS |
| C — Flare/Chaff | `attention-v3-stage-c-e7e63d4c273a0479` | 2,304 pairs / 4,608 matches | 48/48 | `sha256:869099e6a2539111f6d996fadbff3080b6c62b0d6dcfdeff879419015e67b9e5` | PASS |

Stage C names the Stage-B report hash as its parent. Both campaigns used treatment/control
pairs with identical seat, seed, pressure, command doctrine, opponent policy, and random-stream
identifier. Across both stages there were zero rejected probe UAP plans. Stage C additionally
recorded zero rejected legal artillery declarations, zero reload events, and zero fixed-hand
invariant failures.

## Contents

### Stage B — `attention-v3-stage-b-spatial-probe/`

- `PLAN.json` — content-addressed factors, seed block, model/component hashes, and common-stream
  namespace. File SHA-256:
  `1e58be6a6c64f18cdad0c8c484dd17eae3b932bdb9d8392a00bbba743a688917`.
- `report.json` — complete cell-level and pooled paired aggregates for all 4,608 comparisons.
  File SHA-256:
  `3dc785a05f889dca43c89abf59977aa43bc81a5766168f66e9fea2d5c6828842`.
- `ASSESSMENT.md` — compact gates, effect table, deductions, and evidence boundary.
- `mechanic-deltas.svg` — editable vector chart of direct movement, Support Scan, compression,
  and expansion effects.
- `mechanic-deltas.png` — 1120×488 rendered chart for quick viewing. File SHA-256:
  `2f3510a1739feb951fc5551aa382c367728d1f96e1676e49990ca8a9d1026065`.

### Stage C — `attention-v3-stage-c-artillery-probe/`

- `PLAN.json` — content-addressed artillery factors, fixed hand, seed block, parent Stage-B hash,
  and common-stream namespace. File SHA-256:
  `9abed9b1d97cd6fb1aa1c10c5f11ed9f7aceba373f265bdc8f77c3a7d26feecc`.
- `report.json` — complete cell-level and pooled paired aggregates for all 2,304 comparisons.
  File SHA-256:
  `ac5099220c4c5aecbab561f3cabc7321680f48a84498a10522c73cb0eae715b1`.
- `ASSESSMENT.md` — compact gates, anti-turtle effect table, deductions, and evidence boundary.
- `anti-turtle-effects.svg` — editable vector chart comparing hostile Flare, centered Chaff, and
  immediate evacuation.
- `anti-turtle-effects.png` — 1180×500 rendered chart for quick viewing. File SHA-256:
  `65b0105f5774aba8ed949f54d38abbd47ea838ef9e64b29787724664a983b9cc`.

The JSON `reportHash` values hash the canonical report payload before the `reportHash` field is
appended. The file SHA-256 values hash the final formatted files and therefore serve a different,
complementary integrity purpose.

## Reproduction

From the repository root:

```powershell
npm run probe:attention-v3-stage-b
npm run probe:attention-v3-stage-c
```

Both commands build the contracts and engine before executing. PNGs are convenience renders of
the canonical SVG charts; the probes regenerate the SVGs, reports, plans, and assessments.

## Interpretation boundary

These artifacts validate direct causal operation of spatial spawning, range adjustment, local
verification, Support Scan, Flare, and Chaff under the frozen probe contexts. They do not validate
Smoke, EMP, HE, reloads, cooldowns, counter-battery, distance-variable verification cost, a full
commander catalog, or promotion into the accepted v1/v2 model line.

