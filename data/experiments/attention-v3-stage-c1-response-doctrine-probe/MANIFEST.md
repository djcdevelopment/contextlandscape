# Stage-C1 response-doctrine evidence manifest

Created: 2026-08-10  
Plan: `attention-v3-stage-c1-7b26766ed292281c`  
Plan hash: `sha256:7b26766ed292281c3673000d3d57bee135dda27b0edacf02110c445d8dd7bd26`  
Report hash: `sha256:b6af622b1c9e312be0861f4ffd3513c2f5ad64d52f9b9c16ea814c6f2224e268`  
Parent Stage-C report: `sha256:869099e6a2539111f6d996fadbff3080b6c62b0d6dcfdeff879419015e67b9e5`

## Dataset

The dataset contains 768 frozen hostile-Flare worlds. Each world was executed through seven
response arms using the same pressure, command doctrine, seed, focal seat, opponent, target,
and random-stream identifier: 5,376 matches total plus 56 exact replay sentinels.

All planned executions completed. There were zero UAP plan rejections, zero artillery declaration
rejections, zero reload events, zero fixed-hand failures, and no deterministic replay mismatch.

## Files

| File | Description | File SHA-256 |
|---|---|---|
| `PLAN.json` | Frozen factors, worlds, policies, risk formula, and component hashes | `bcf89043b936a8e61d93b5af1059b92e115b3d75fc2271f1044fdf6c7067e065` |
| `report.json` | Complete policy, pressure, doctrine, seat, and cell aggregates | `730f244cdbf287919287c71225322f223f17635a1ee31d75947691701597b54a` |
| `ASSESSMENT.md` | Gates, outcome tables, doctrine interaction, deductions, and boundary | `8d1f08a5ce00dde0b41db668993fb50fdb43a3f159eb1f45fb1489908729ef42` |
| `policy-tradeoffs.svg` | Editable progress-retained versus drift-avoided plot | `edfefe736a46efc2cfa1a85d32330d9a4096d6a946d4e489c45ef97acce7f929` |
| `policy-tradeoffs.png` | 1180×680 rendered tradeoff plot | `fde296b9fe6c89795c489a338a81fbff1a2ebfc91bbc1ae8439a29b858c75119` |
| `mechanic-load.svg` | Editable Flare exposure and intervention-load chart | `c181260246fd37fb7c41d0086b97bd3247ba937f445f6cb3daaa42d1070737dc` |
| `mechanic-load.png` | 1200×644 rendered intervention chart | `a5a9cced721d4e6769f1011f576e0cfe9916adaf06932814808ad33ee71d0bd7` |

The JSON `reportHash` hashes the canonical report payload before its `reportHash` property is
appended. File hashes cover the final formatted files and serve a separate integrity purpose.

## Main deduction

No static response wins across doctrines. Holding led every confidence-threshold pressure. Under
local verification, Scout peel + Support Scan led the binary 0.70 and distance-weighted 0.80
samples, while always-Chaff led global 0.45 and narrowly led distance-weighted 0.55. The next
candidate should therefore branch first on command doctrine and then use public risk to choose
between Scout peel + Support Scan and Chaff.

## Reproduction

```powershell
npm run probe:attention-v3-stage-c1
```

The command rebuilds contracts and engine, then regenerates the frozen plan, report, assessment,
and SVG charts. PNGs are convenience renders of the canonical SVGs.

