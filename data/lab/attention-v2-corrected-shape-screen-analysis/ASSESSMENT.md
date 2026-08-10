# Attention v2 corrected shape-screen assessment

Analysis hash: `sha256:9e92787ff92b804fb7facc67b46ad9a9b877a5e8ef569ec3070bc9a52322cb9b`  
Completion report: `sha256:9ae18a15408a2ec6272a18efba74d1b64d03b570e605b6d81a3cd10a83702769`

## Decision

The corrected 9,216,000-run screen is complete, attributed, and causally valid. All 6,400 commander profiles changed actual compositions/controllers, every required mechanic executed, and exact seat reversals support strategy-versus-seat separation.

This is **valid train-screen evidence**, not final promotion evidence. One frozen battle sample and four train seeds cannot establish battle-volume stability or replace the original v1 Scout, Siege, movement, and escort regression sentinels. The six rows below advance only to causal refinement.

## Provisional next-stage candidates

| Rank | Row | Refinement role | Model | Effective commanders | P95 dominance | Draw rate |
|---:|---:|---|---|---:|---:|---:|
| 1 | 22 | diversity-cycle-anchor | `attention-v2-model-22-a349f2bf2755a55a` | 454.0 | 75.0% | 1.88% |
| 2 | 8 | counterplay-frontier | `attention-v2-model-08-197a490fef6fecbb` | 187.8 | 75.0% | 4.17% |
| 3 | 25 | counterplay-frontier | `attention-v2-model-25-b2c6c9d0ad5b34b5` | 173.1 | 75.0% | 2.04% |
| 4 | 1 | round-limit-contrast | `attention-v2-model-01-91a25449fe7e0b0b` | 303.8 | 75.0% | 1.41% |
| 5 | 29 | lower-seat-effect-contrast | `attention-v2-model-29-a691e3a93590aabc` | 238.3 | 87.5% | 1.70% |
| 6 | 15 | counterplay-collapse-boundary | `attention-v2-model-15-f217786d8c3b5e80` | 297.3 | 87.5% | 1.22% |

The maximum of 6,400 sparse eight-opponent dominance rates is 100% for every model and is therefore non-discriminating. Selection uses the 95th percentile plus the fraction of commanders observed at 8/8; a supported >90% universal-dominance test is deferred to the replicated next stage.

## Key findings

- Artifact integrity: 9,216,000/9,216,000 records, 57,600 oriented edges, 25,600 exact reversal pairs, zero identity or attribution mismatches.
- Commander diversity: 555.2 softmax-effective commanders and 7.20 effective compositions at temperature 0.03.
- Counterplay: 18,647 >55% dominance arcs; the largest strongly connected component contains 29 commanders (0.5%).
- Seat effect: mean absolute exact-reversal effect 0.1563; self-play Player-1 score 0.5465.
- Mechanics: all 13 required counters are nonzero; no reachability failures.
- Storage: 5.347 GiB compressed. A full 30,008,992-run standard campaign projects to 17.410 GiB, or 21.763 GiB with margin.

## Evidence boundary

Do not call these six models promoted survivors. They require multi-sample stability, fresh-seed holdout, the four accepted v1 regression gates, and the fresh causal Macro Flare follow-up. The next plan is in `NEXT_CAMPAIGN.md`.
