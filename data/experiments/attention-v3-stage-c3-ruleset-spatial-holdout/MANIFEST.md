# Stage-C3 ruleset-aware spatial-holdout evidence manifest

Created: 2026-08-10  
Plan: `attention-v3-stage-c3-0b316976b0976c46`  
Plan hash: `sha256:0b316976b0976c46c51a9a4c34711a54b19f31698d2c70ae767d4aab6d1139b1`  
Report hash: `sha256:8b92063ddeabada20beb3fc07ad57ebcdba90ad3684f1ea01361c97aa3217174`  
Parent Stage-C2 report: `sha256:93d5e5c3caa2411e3e9c30570d44cbc9d88af6d866d7cd09eab9643879ac50ea`

## Dataset

Training contains 1,024 fresh common worlds and 3,072 simulated matches across three static
response arms. Exact static-outcome lookup evaluated 25 frozen distance rules on every world,
25,600 candidate-world decisions total, without adding simulations or changing streams. The
maximin selector chose `low-total-ge-4` before holdout execution.

The untouched holdout contains 512 common worlds and 2,048 actual matches across the selected
candidate and three controls. All 56 replay sentinels, 512 adaptive-to-static metric parity
checks, 14 conformance gates, and four promotion gates passed. There were zero plan or artillery
rejections and zero reloads.

## Files

| File | Description | File SHA-256 |
|---|---|---|
| `PLAN.json` | Frozen public-information boundary, candidates, selector, seeds, and gates | `240f3776e53de6df468c4ed43c39247a7c43193cf5bb95f7ce3090c09eb105ff` |
| `report.json` | Candidate frontier, holdout aggregates, cell evidence, parity, and gates | `bf0035387acdb4438145eef4822843e386d04fd92fbe86ceeac0f5dbaf5ce4c9` |
| `ASSESSMENT.md` | Training selection, untouched holdout, deductions, and boundary | `1dc78a953f5e03783bddef8f6ae3b655b49a26386d6107f5415a8d6f3256c5de` |
| `candidate-frontier.svg` | Editable top-ten frozen-candidate chart | `3361e9758444fa1722a910396f64157687239a9417f870cc1b56582253b19d90` |
| `candidate-frontier.png` | 1320 x 760 rendered candidate-frontier chart | `ed6676e5830d7f7e772ff142913de27302d6890fd69666206350b34fbdc6af16` |
| `holdout-cells.svg` | Editable pressure-by-doctrine cell-safety chart | `275e588f7dc4b7b9782ae448dc651f7d3299e4ac37920d660a4289fecfeed6d1` |
| `holdout-cells.png` | 1320 x 680 rendered holdout cell-safety chart | `2acfe038cfc9a6f8c508208c49700a8926e650bb29c80d1966d2f509b0cacb63` |

The JSON `reportHash` hashes the canonical report payload before its `reportHash` property is
appended. File hashes cover the final formatted artifacts and serve a separate integrity role.

## Main deduction

Stage C2 failed because one low-confidence threshold mixed distinct public scoring regimes.
Conditioning first on public objective coupling resolved that interaction: confidence doctrine
holds, binary/local peels the Scout and scans, global/local fires Chaff, and distance/local fires
Chaff only when at least four public pending artifacts are below 0.50 confidence. The richer
objective-geometry candidates did not win once the rule regimes were separated.

The candidate scored 0.6523 versus 0.5693 for the best pooled static control, improved both
seats, and stayed within 0.0235 of every cell's best static response. This nominates it for a
larger bounded audit, not full model promotion.

## Reproduction

```powershell
npm run probe:attention-v3-stage-c3
```

The command rebuilds contracts and engine, then regenerates the frozen JSON evidence,
assessment, and SVG charts. PNGs are convenience renders of the canonical SVGs.
