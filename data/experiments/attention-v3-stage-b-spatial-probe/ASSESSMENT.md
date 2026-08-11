# Attention v3 Stage-B spatial differential probe

Status: **PASS**  
Plan: `attention-v3-stage-b-bbb15898fd681c4c`  
Plan hash: `sha256:bbb15898fd681c4cd783a3c053f1742f629ec3706809dd464f1ee6390b9524da`  
Report hash: `sha256:d517e38297f2419652c35e9ee23b34d3be9dc7c2b505a4439162b444e58b04ed`

The frozen Stage-B probe completed 4,608 common-stream pairs (9,216 matches) plus 96 exact replay sentinels. Treatment and control arms retained the same seat, seed, pressure, command doctrine, opponent policy, and random-stream identifier.

## Gates

- PASS: exactRunCount
- PASS: deterministicSentinels
- PASS: commonStreamPairs
- PASS: zeroPlanRejections
- PASS: noArtilleryLeak
- PASS: chaseMoves
- PASS: supportExecutes
- PASS: supportVerifies
- PASS: compressionContractsDistance
- PASS: expansionExpandsDistance

## Paired effects

| Contrast | Pairs | Treatment score | Control score | Score delta | Move delta | Support Scan delta | Mean distance delta | Beyond-reach auto-accept delta |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| artifact-chase-vs-hold | 1,152 | 0.4462 | 0.5152 | -0.0690 | 5.504 | 0.000 | 0.0607 | 0.157 |
| line-support-vs-hold | 1,152 | 0.5573 | 0.4818 | 0.0755 | 0.000 | 5.212 | -0.0014 | -1.655 |
| range-compress-vs-default | 1,152 | 0.4479 | 0.4861 | -0.0382 | 0.000 | 0.000 | -0.3780 | -1.431 |
| range-expand-vs-default | 1,152 | 0.4588 | 0.4970 | -0.0382 | 0.000 | 0.000 | 0.4458 | 1.616 |

## Assessment

- Artifact chase changed executed movement by 5.504 tiles per focal run and changed locally verified work by -0.475 per run.
- Line Support Scan executed 5.212 additional scans and 1.477 additional scan-mediated verifications per focal run.
- Range compression changed mean spawn distance by -0.3780 tiles; expansion changed it by 0.4458. These are keyed-coordinate effects, not sequential-RNG artifacts.
- Score, progress, drift, and unreachable-auto-accept deltas remain doctrine- and pressure-sensitive directional evidence. Stage B passes only if its direct mechanism gates pass.

## Boundary

Artillery, reloads, cooldowns, Smoke, EMP, HE, and counter-battery were absent. This report authorizes evaluation of the separately versioned Stage-C Flare/Chaff pair; it does not promote v3 into the accepted v1/v2 model line.
