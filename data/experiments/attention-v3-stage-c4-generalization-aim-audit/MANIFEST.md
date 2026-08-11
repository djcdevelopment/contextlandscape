# Stage-C4 generalization and hostile-aim evidence manifest

Created: 2026-08-10  
Plan: `attention-v3-stage-c4-6831dd0d5311ef5b`  
Plan hash: `sha256:6831dd0d5311ef5bb27a0080c074f742065ddd33c277e0e39cd84593a574f8b8`  
Report hash: `sha256:9be23296c0eafd9def6253e2f73fecd0c86afba5b4b998151727816f468d9cd6`  
Parent Stage-C3 report: `sha256:8b92063ddeabada20beb3fc07ad57ebcdba90ad3684f1ea01361c97aa3217174`

## Dataset

This no-reselection audit contains 1,728 fresh common worlds and 6,912 actual matches across
nine unseen soundness samples, all three public objective-coupling rules, three hostile Flare
aim modes, both command doctrines, and both seats. The Stage-C3 policy was fixed before the
first audit match.

All 216 replay sentinels, 1,728 adaptive-to-static metric parity checks, and 13 conformance
gates passed. There were zero plan or artillery rejections and zero reloads. The larger audit
result is intentionally preserved as **FAIL** because two predeclared no-masking gates failed.

## Files

| File | Description | File SHA-256 |
|---|---|---|
| `PLAN.json` | Frozen fixed policy, novel pressure surface, aim algorithms, and gates | `30d26b12e6d85cba262d0517ad1a71543c159ec88df194698afaf0765d1ff3de` |
| `report.json` | Complete policy, pressure, aim, doctrine, seat, parity, and gate evidence | `d559768e6f9d1f6f53bf9a5188197f4adc7aafa8470fdf6d34736027ec4f74dd` |
| `ASSESSMENT.md` | Audit tables, deductions, failure localization, and boundary | `ad1d4735ab0e5b445bfa9e22358f2c06313356fb22c0cb1e28b74b3119817af2` |
| `generalization-score.svg` | Editable novel-surface pooled policy chart | `d245da669cc3077d4eb2a239014f67cede0142a3cc4a8e706b2a02fb6e0ec590` |
| `generalization-score.png` | 1320 x 520 rendered pooled policy chart | `c4c3aae48116406159755925e78508fdac25657e889dfbf5bdf922eee19160e7` |
| `aim-robustness.svg` | Editable coupling-by-aim-by-doctrine atlas | `eb02c245eb5d71aa3cbcaffb42e9f2078f48297dbd8185d783a7a574d1d76b40` |
| `aim-robustness.png` | 1460 x 1260 rendered hostile-aim atlas | `59fe0eb55d6852b7e42f08b9710c706234d6e46ba1870833a9963ca5e4f5dd50` |

The JSON `reportHash` hashes the canonical report payload before its `reportHash` property is
appended. File hashes cover the final formatted artifacts and serve a separate integrity role.

## Main deduction

The fixed response led every static control when pooled and under each hostile aim mode. Dense
and far-objective targeting landed outside the proactive Chaff screen in 41.7% and 67.5% of
worlds, yet their pooled adaptive advantages remained +0.0356 and +0.0304. Spatial aim was not
the primary audit failure.

The hard global-to-Chaff branch failed as soundness rose: gaps were -0.1302 at global 0.55/local
and -0.1927 at global 0.75/local. High-soundness binary and distance cells also showed that
holding can outperform both interventions. The next candidate must choose among hold, Scout
peel plus Support Scan, and Chaff using public low-confidence count within each public coupling
regime. No general-policy promotion follows from this audit.

## Reproduction

```powershell
npm run probe:attention-v3-stage-c4
```

The command rebuilds contracts and engine, then regenerates the frozen JSON evidence,
assessment, and SVG charts. PNGs are convenience renders of the canonical SVGs.
