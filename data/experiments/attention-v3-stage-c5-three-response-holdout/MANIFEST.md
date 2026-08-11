# Stage-C5 three-response disjoint-soundness evidence manifest

Created: 2026-08-10  
Plan: `attention-v3-stage-c5-e04e889e2e70a8b4`  
Plan hash: `sha256:e04e889e2e70a8b4cf36403118bd24fe1a6a480f85ab197e35212cff5a40a9e9`  
Report hash: `sha256:f1c12e3a12930dea0f32a40946305146ac1267d04bb860a9bcef361cdf477081`  
Parent Stage-C4 report: `sha256:9be23296c0eafd9def6253e2f73fecd0c86afba5b4b998151727816f468d9cd6`

## Dataset

Training contains 864 common worlds and 2,592 simulated static-arm matches across the Stage-C4
soundness grid and all three hostile aim modes. Exact common-world lookup evaluated 14,688
candidate decisions and selected one three-response threshold rule per public objective
coupling. Only then did the combined controller execute 1,728 untouched worlds and 6,912 actual
matches on a disjoint soundness grid.

All 297 replay sentinels, 1,728 adaptive-to-static metric parity checks, and 17 conformance
gates passed. There were zero plan or artillery rejections and zero reloads. The holdout result
is intentionally preserved as **FAIL** because the pressure-specific no-masking gate failed at
unseen soundness extremes.

## Files

| File | Description | File SHA-256 |
|---|---|---|
| `PLAN.json` | Frozen rule family, selectors, disjoint grids, aim modes, and gates | `f2a2185f1dfa808047f0a1b50a7f9124179e9e440195c6b097bc4fb0ee64503a` |
| `report.json` | Complete selector, holdout, branch, aim, pressure, parity, and gate evidence | `7bca4656314ea20f0bc7b16d480bc5d04f604d525eafba80f9938d45cbc163d1` |
| `ASSESSMENT.md` | Thresholds, holdout tables, deductions, and evidence boundary | `32862109e49933b8bcd41a7e05f7509bac6eaa3003768cc1be8922ede9944c91` |
| `selected-thresholds.svg` | Editable public low-count action map | `b2a8e12759085e141f948bce9751ed7e0ac916f6b82cfb380e0cf52cc8dc1788` |
| `selected-thresholds.png` | 1320 x 520 rendered action map | `cb74cff571299935d0f89c245c5867b92e3762dd8b59ab9fc0191550eb5f634a` |
| `holdout-atlas.svg` | Editable disjoint pressure-by-doctrine atlas | `536e49f0803c3b1242d1fad69d9898429c4e775593d99bd0316e40b063ac642c` |
| `holdout-atlas.png` | 1460 x 1260 rendered pressure atlas | `fa36d33bbbc6b10f2461afb97b874a3885cc1f9d286fa699797bc6fbe85242bc` |

The JSON `reportHash` hashes the canonical report payload before its `reportHash` property is
appended. File hashes cover the final formatted artifacts and serve a separate integrity role.

## Main deduction

The three-response topology substantially improved robustness: score 0.6050 versus 0.5573 for
the best pooled static control, gains in both seats and every aim aggregate, and no failure in
any coupling-by-aim-by-doctrine or pooled coupling/local cell. Every coupling exercised hold,
Scout peel plus Support Scan, and Chaff on both splits.

The one failed gate isolates extrapolation from a small public snapshot. Every selected
`holdMax` was zero, so holding occurred only when all six public artifacts were at least 0.50
confidence. That was too rare at binary and distance soundness 0.95 (both -0.0938), while the
global 0.25 cell needed more Chaff (-0.0833). A full-envelope train/replication test is required
to decide whether one round-one count can cover both extremes or sequential public calibration
is necessary.

## Reproduction

```powershell
npm run probe:attention-v3-stage-c5
```

The command rebuilds contracts and engine, then regenerates the frozen JSON evidence,
assessment, and SVG charts. PNGs are convenience renders of the canonical SVGs.
