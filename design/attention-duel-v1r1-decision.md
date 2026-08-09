# Attention Duel v1r1 Research Decision

Decision date: 2026-08-09
Status: baseline accepted with Macro Flare revision required

## Decision

`duel-capacity-v1` is the frozen research baseline for the next attention-economy experiments. The canonical v1r1 campaign accepts the following mechanics as demonstrated behaviors:

- Scout Recon Lock creates a composition-specific policy advantage.
- Siege Command Uplink plus seize creates a distinct composition-specific policy advantage.
- Movement toward an active front has measurable value.
- A stationary Line escort materially reduces drift for mobile Scouts.

The shared capacity and Scale-Scope implementation remains available for research, but Macro Flare is not accepted as a reliable drift-defeat counter. The predeclared 80% causal gate failed and remains failed. Nothing in the completed manifests or reports may be retuned, regenerated in place, or relabeled to change that result.

This is acceptance of a simulation baseline, not a population-level balance claim or a product-promotion decision.

## Canonical evidence

The campaign ran 674,000 deterministic matches from source revision `005090cc4c3fe2d323cc6a6b77e1a7fd22d389e6` in worker image `sha256:b37456564291e0173327f2b83cd76727c1f50fd3d5c679862e8f024743f1a3f8`. All raw matrices passed strict provenance and artifact audits before the reviewed evidence was recorded.

| Matrix | Runs | Manifest hash | Report hash |
| --- | ---: | --- | --- |
| [`attention-duel-v1r1-stationary-train`](../data/experiments/attention-duel-v1r1-stationary-train/report.json) | 480,000 | `sha256:ac58c51e59711cb2ebd2c737223b11b5d50634de8ec09ac46f81d404e66ba8ac` | `sha256:91175e17ae169b0cd5b70a7bca7272828ce8ab397095e1e486eaf310b1c1c4d4` |
| [`attention-duel-v1r1-capacity-train`](../data/experiments/attention-duel-v1r1-capacity-train/report.json) | 144,000 | `sha256:d13aadefb54d339a447686289488fe9db42355f4804c0f29e36e0616a4f0704c` | `sha256:b0fcfe35ca27b78e1fa8ffc49859a58a28fe8cb2daf30514338de3633d2a8e15` |
| [`attention-duel-v1r1-holdout`](../data/experiments/attention-duel-v1r1-holdout/report.json) | 50,000 | `sha256:c3b17aa4c05f59195cd32dab637ea0e6d5c9108e5e2976f154c7683c5215e7b8` | `sha256:523763ea89a1af1aa2e96337fb37cfe4d6a2867e49f9f4f9a82509aa0270c09b` |

The tracked [experiment ledger](../data/experiments/ledger.json) records all three matrices with disposition `revise`. The compact manifest/report bundles remain hash-verifiable and comparable when raw shards are unavailable.

## Holdout result

| Gate | Estimate | 95% interval | n | Predeclared criterion | Decision |
| --- | ---: | --- | ---: | --- | --- |
| Scout specialization | 0.2842 | [0.2717, 0.2967] | 5,000 | lower bound >= 0.15 | Pass |
| Siege specialization | 0.4174 | [0.4045, 0.4303] | 5,000 | lower bound >= 0.15 | Pass |
| Movement value | 0.3722 | [0.3592, 0.3852] | 5,000 | lower bound >= 0.10 | Pass |
| Stationary Line escort | 1.4013 drift per 12 progress | [1.3687, 1.4347] | 5,000 | upper bound < 1.5 and control lower bound > 3.0 | Pass |
| Macro Flare causal drift defeat | 0.2234 | [0.2085, 0.2391] | 2,851 | lower bound >= 0.80 | Fail |

The escort control accumulated 5.1512 drift per 12 progress with a 95% interval of [5.0708, 5.2350]. Macro Flare nevertheless raised player-one score from 0.5298 for the paired no-Flare control to 0.7116. Reoriented as candidate minus control, the paired effect is `+0.1818` with a 95% interval of `[0.1711, 0.1925]` over 5,000 common-random-world pairs. That is evidence of strategic value, but not evidence for the rejected claim that Flare is an almost certain, independently decisive drift counter.

## Locked interpretation

1. Preserve the original 80% gate as a failed historical hypothesis.
2. Do not tune Macro Flare against the v1r1 holdout or use those seeds to select a successor.
3. Treat the four passing mechanics as regression constraints. Changing their semantics requires a new model version and fresh evidence.
4. Treat shared capacity and Macro Flare tuning as experimental until a separately predeclared holdout passes.
5. Keep synthetic recommendations review-only; no matrix promotes a model automatically.

## Pre-registration for the next Flare experiment

The next experiment tests whether Macro Flare is a meaningful strategic swing without requiring it to decide nearly every eligible match. The existing capacity training nominates deployment range 5 as the first candidate: in its comparable 250-seed cell, range 4 to 5 moved owner score from 0.648 to 0.696 and victim drift from 4.224 to 4.700. This is candidate selection evidence, not holdout validation.

- Use paired Flare/no-Flare policies in identical latent worlds and evaluate both player slots.
- Include three anchors: current range-4 Flare, the training-nominated range-5 Flare, and the paired no-Flare control.
- Screen deployment range, duration, output multiplier, unlock timing, and opportunity cost only on a new training range beginning at seed `10,000,000`.
- Freeze one candidate before evaluation on a disjoint holdout range beginning at seed `11,000,000`.
- Use at least 5,000 common-random-world seeds per holdout arm.
- Primary gate: for each player slot, the lower 95% bound for candidate-minus-control player score must be at least `+0.10`.
- Dominance guard: for each player slot, the upper 95% bound for that paired effect must not exceed `+0.30`.
- Retention guard: the lower 95% bound for candidate-minus-current player score must be at least `-0.02`.
- Mechanism guard: the lower 95% bound for candidate-minus-control opponent drift must be greater than zero.
- Reachability guard: the holdout must contain at least 2,500 eligible paired Flare opportunities across the declared cells.
- Regression guard: Scout specialization, Siege specialization, movement value, and stationary escort must retain their original v1r1 acceptance criteria on fresh sentinel cells.
- Continue reporting strict causal drift-defeat rate as a diagnostic, not as the promotion gate.
- Record `keep` only if the primary gate and every guard pass; otherwise record `revise` or `reject` without rewriting the evidence.

The observed v1r1 effect motivated these thresholds but does not count as their validation. Only the fresh, frozen holdout can do that.
