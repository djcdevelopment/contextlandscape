# Attention v3 Stage-A differential probe

Status: **PASS**  
Plan: `attention-v3-stage-a-9db391d9b0377b4d`  
Plan hash: `sha256:9db391d9b0377b4d8b8239ec0ddb11a29ea8b8a5931df99d7e39b6d5c968cc61`  
Report hash: `sha256:13e38c87a9dabb15cdcecb1b469a6588f8268afc353ce8ceccae378627f55e37`

The bounded Stage-A probe completed 9,216 planned matches plus 72 exact replay sentinels. It is conformance and directional evidence only; it does not authorize Stage B or establish a promoted balance model.

## Gates

- PASS: exactRunCount
- PASS: deterministicSentinels
- PASS: zeroPlanRejections
- PASS: allMechanicsDifferentiated

## Contrast summary

| Contrast | Runs | Treatment score | Draw rate | Mean rounds | Expected mechanic treatment/control | Gate |
|---|---:|---:|---:|---:|---:|---|
| scout-active-vs-hold | 1,536 | 0.4017 | 4.43% | 6.029 | 9,261 / 0 | PASS |
| scout-active-vs-flight | 1,536 | 0.6377 | 2.93% | 5.757 | 8,843 / 0 | PASS |
| line-step-vs-hold | 1,536 | 0.5270 | 7.49% | 6.021 | 9,248 / 0 | PASS |
| line-step-vs-move | 1,536 | 0.6042 | 5.47% | 6.021 | 9,248 / 0 | PASS |
| siege-uplink-vs-hold | 1,536 | 0.4772 | 2.47% | 5.992 | 9,204 / 0 | PASS |
| siege-uplink-vs-move | 1,536 | 0.5306 | 2.21% | 5.992 | 9,204 / 0 | PASS |

## Directional findings

- Scout Active Recon scored 0.6377 against pure flight, including 0.7822 under confidence-threshold commands. Under accept-all, where calibration is deliberately irrelevant, the same contrast was 0.5000.
- Scout Active Recon scored 0.4017 against Passive Settle overall, but 0.5189 outside the distance-weighted samples. The current outward movement policy, not calibration alone, drives much of that interaction.
- Line Step-Up was neutral against hold under accept-all (0.5000) and positive under confidence-threshold commands (0.5635), which is the expected calibration-sensitive pattern.
- Siege Uplink versus hold changed direction by command doctrine: 0.5332 under accept-all, 0.4004 under confidence-threshold, and 0.4980 under verify-lowest. The accept-all advantage comes from unused Uplink attention entering the existing round-limit tiebreak; the confidence-threshold penalty exposes the queued 0.20 calibration tradeoff.

## Boundary

Artifacts remained on source cells, capacity policies always passed, artillery was absent, and the existing attention command layer was held to three fixed regimes. The next authorized decision is whether to refine Stage-A action doctrines or freeze a separate Stage-B spatial-artifact plan.
