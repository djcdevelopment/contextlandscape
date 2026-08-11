# Stage-C2 adaptive-holdout evidence manifest

Created: 2026-08-10  
Plan: `attention-v3-stage-c2-2ec219830f0af361`  
Plan hash: `sha256:2ec219830f0af36105db90566756d73d3f80028d3c2d7db3f33b857d13c7f302`  
Report hash: `sha256:93d5e5c3caa2411e3e9c30570d44cbc9d88af6d866d7cd09eab9643879ac50ea`  
Parent Stage-C1 report: `sha256:b6af622b1c9e312be0861f4ffd3513c2f5ad64d52f9b9c16ea814c6f2224e268`

## Dataset

Training contains 512 common worlds and 4,096 matches across five adaptive thresholds and
three static controls. The frozen maximin selector chose public-risk threshold 6. Only then
did the runner execute 256 untouched common worlds and 1,024 holdout matches across the
selected candidate and three controls. All 96 exact replay sentinels and every conformance
gate passed, with zero plan or artillery rejections and zero reloads.

The promotion result is intentionally preserved as **FAIL**. The adaptive candidate led the
pooled holdout and both seats, but missed its predeclared pressure-by-doctrine tolerance in
two cells. This is valid negative selection evidence, not a failed experiment.

## Files

| File | Description | File SHA-256 |
|---|---|---|
| `PLAN.json` | Frozen factors, candidate family, selector, seeds, and gates | `d7e347990dd051504cd719e979471d6b3e4381ce0da3144e66ec346381ed553c` |
| `report.json` | Complete training selector, holdout aggregates, cell results, and gates | `33816304f39c0198416cb4d659219d6e6c6679f3a75fe15d926ef1d932e5dbd6` |
| `ASSESSMENT.md` | Selection table, holdout evidence, branch diagnosis, and boundary | `ee009d3f8706f9607a50de44c1414888e4923a2b3ca306e52d0db033688e91f0` |
| `threshold-selection.svg` | Editable frozen-selector chart | `fcb568ba15370c5608b275f4edbe5d1dfd8a14bf906fab49bf2dcd42ec81b3f0` |
| `threshold-selection.png` | 1160 x 560 rendered selector chart | `7f2b00b5c3b209369159e39cc2088035934fa5b4d32057e26c59ed4cc24b34d7` |
| `holdout-score.svg` | Editable untouched-holdout comparison | `f5ef978d258cd3791170aee1c5822bb4a0cee8c54522aa3b6aeef97ade8e4823` |
| `holdout-score.png` | 1240 x 500 rendered holdout comparison | `adee5599e700b998e39a61aea30edc07f43cdc3e471da0a5a299ecf30850a361` |

The JSON `reportHash` hashes the canonical report payload before its `reportHash` property is
appended. File hashes cover the final formatted artifacts and serve a separate integrity role.

## Main deduction

A doctrine-first adaptive response is promising, but its round-one scalar risk collapses to
`3 + low-confidence count`: drift is always 0 and overload is always 3 at that decision point.
That threshold chose Chaff too often in binary 0.70/local and distance-weighted 0.80/local
worlds, where Scout peel plus Support Scan was stronger. The next bounded candidate must test
public spatial confidence geometry and evaluate on fresh seeds; pressure labels remain
forbidden policy inputs.

## Reproduction

```powershell
npm run probe:attention-v3-stage-c2
```

The command rebuilds contracts and engine, then regenerates the frozen JSON evidence,
assessment, and SVG charts. PNGs are convenience renders of the canonical SVGs.
