# Desperation Artillery hypothesis audit

## Verdict

The hypothesis is **not mathematically testable from the last two campaign records**. This is a data-and-treatment identifiability failure, not evidence that the hypothesis is false.

| Requested cohort | Evaluable N | Win rate (95% CI) | Average final drift (95% CI) |
|---|---:|---:|---:|
| A — Passive control in desperation state | N/A | N/A | N/A |
| B — Hail Mary HE on own artifacts | 0 | N/A | N/A |
| C — EMP/Smoke against leader | 0 | N/A | N/A |

## Availability audit

| Required element | Status | Evidence |
|---|---|---|
| Progress gap at action time (self <= 6, opponent >= 10) | missing | Only terminal progress is retained; artillery decision traces do not snapshot either player's progress. |
| Estimated win probability below 15% | missing | No turn-level win-probability estimate is recorded. |
| At least three own unverified artifacts | partial-proxy-only | Sampled traces retain ownLowConfidenceCount, not own unverified-artifact count, and only for seeds divisible by 64. |
| Passive verification/do-nothing cohort | partially-present | Pass and verification totals exist, but cannot be joined to the requested desperation state at a specific turn. |
| HE / Artifact Exploder on own coordinates | absent-mechanic | Both campaigns implement only Flare and Chaff shells; Flare targets enemy areas and does not instantly resolve own artifacts. |
| EMP / Smoke against leader units | absent-mechanic | Neither EMP nor Smoke exists in the campaign contracts or action telemetry. |
| Immediate same-round drift explosion | missing | Final drift and aggregate flare-induced drift defeats exist, but action-linked same-round drift is not retained. |
| Next-turn progress-gain variance | missing | Per-turn progress deltas are not retained. |
| Terminal win and final drift | present | Available per run, but not conditionable on the missing action-time state and requested actions. |

## Why an observational filter would still be unsafe

Even if the state fields had been logged, comparing commanders who voluntarily chose a Hail Mary against commanders who passed would be selection-biased: action choice depends on board severity, doctrine, shell availability, and latent world state. A valid causal test should randomize among legal actions at the same eligible decision point and reuse the same latent random stream for each branch.

## Required next campaign

1. Implement the requested HE/Artifact Exploder and EMP/Smoke actions with stable action identifiers.
2. At every eligible decision, record pre-action self/opponent progress, drift, unverified artifact count, unit locks/uplinks, legal actions, and calibrated win-probability estimate.
3. Randomize eligible desperation opportunities between passive, HE, and disruptive salvo policies within the same latent world stream; deterministic self-selection would confound the cohorts.
4. Record immediate resolution, same-round drift defeat, next-turn progress delta, and terminal outcome keyed to the action opportunity.
5. Pre-register a primary win-rate contrast, Wilson or paired bootstrap interval, multiplicity handling, and minimum detectable effect before launch.
