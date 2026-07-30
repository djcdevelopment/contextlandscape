# Attempt-bank pilot retrospective

Date: 2026-07-30

## Outcome

This cycle renamed the project, repaired four defects in the research instrument, built an offline
attempt bank, and used it to test two proposed mechanics for the Commander direction.

**Both mechanics were falsified.** Total cost was roughly 780 model calls, of which 288 were metered
trial credits and the rest sunk-cost local capacity. The full campaign those mechanics would have
justified was 7,800 attempts.

```text
probe the transport
  -> build the grader offline, with tests
  -> pilot on hand-authored problems
  -> gate fails
  -> stop
```

That is the loop working. The previous cycle learned the same lesson at 19,456,000 matches.

## What worked

### Piloting before campaigning

The pilot deliberately ran on twelve hand-authored problems rather than a generated set of forty.
The reasoning was that problems written specifically to separate model tiers are the friendliest
possible case: if they cannot clear the gate, generating more cannot rescue it. They did not clear
it, and the generation stage was never built.

### Separating infrastructure failure from model failure

`backend_error` and `empty_output` are excluded from every reliability statistic. This was written
before any data existed, because the very first transport probe returned `ok:true` with an empty
string — a thinking model had spent its whole `max_tokens` budget before emitting visible text.

It paid for itself within one run. `am4-oxen` served exactly 75 calls and then hard-failed the
remaining 105, beginning 35 ms after its last success. Scored the obvious way — a failed call as a
wrong answer — the scout tier would have read 0.28 against 1.00 and 1.00 for the cloud tiers: a clean
monotonic curve, a passing gate, and a chassis mechanic "confirmed" by a dropped GPU slot.

### Retaining raw text on every record

Grading is a pure function of stored `rawText`, so every re-interpretation this cycle needed —
splitting format compliance from reasoning accuracy, then scoring literal-trap capture — was applied
to existing data for free. No re-generation was required to answer a question the original schema had
not anticipated.

### Pinning behaviour that nothing else notices

The engine now pins literal `eventHash` and `projectionHash` values for a fixed route. The existing
determinism tests only compared two runs of the same build to each other, so they would have stayed
green through a serialization change that silently invalidated every stored replay manifest.

## What surprised us

### Model tier does not matter at this problem size

Three tiers spanning roughly two orders of magnitude in cost — a quantized local Qwen3-30B-A3B,
Gemini Flash, and Gemini Pro — all scored **1.00** at the `standard` briefing. `0/12` problems
discriminated between them.

This is a useful result in its own right: on short, well-specified triage problems, routing to the
cheapest available model costs nothing. It is also fatal to a chassis mechanic built on accuracy. A
reliability gradient, if one exists, has to come from long-context capacity, error compounding across
multi-step chains, or restraint under ambiguity — not from single-shot correctness.

### A stricter briefing made results worse, and specifically so

Under the `good` briefing, accuracy fell to 0.927 on problems carrying a literal attractor while
staying at 1.000 on those without one. Every error in 288 metered attempts was the same problem
(`prb-constraint-0001`), the same wrong answer (`enrich` instead of `parse`), under the same briefing.

That problem is a false bottleneck: `enrich` is numerically lowest but horizontally scalable, while
`parse` binds because it cannot be parallelized. The `good` briefing instructs *"Decide from the
observed evidence alone. Do not speculate beyond it."* The rigor instruction suppressed exactly the
inference the problem required.

### …but it did not replicate

A follow-up run — five trap problems, `standard` versus `good`, fifteen attempts each on
Qwen3-30B-A3B — produced **zero** trap captures, including 0/15 on the precise problem and briefing
where the cloud tiers failed. The effect is model-specific at best and still rests on four
observations from one family on one problem. It is recorded, not built upon.

### Health checks that report green on backends that cannot serve

Two of three local rungs passed their health check while being unable to answer:

- `omen-ollama` reported version `0.32.1` from `/api/version` while **every** `/api/generate`
  returned HTTP 500 — including a 1.9 GB model with 73 GB of RAM free.
- `am4-moe` reported `awake (tcp :8082 up)` while every generate returned HTTP 503. A companion run
  burned 150 calls into it and produced no usable data.

A liveness probe is not a readiness probe. This is the same lesson the deployment runbook already
records for public ingress — *a healthy container does not by itself prove a reachable feature* —
arriving one layer down.

### The two local rungs are mutually exclusive

AM4 hosts dual 30b models across its two B70s. Waking `am4-oxen` takes the planner slot and precludes
`gpt-oss-120b` loading. A job that pins both silently gets one.

## Decisions that held up

- Model calls are inputs, not logic: attempts are generated offline and recorded, so replay stays
  deterministic and match-time cost is zero.
- Grade only what is deterministically detectable. `refused`, `truncated`, and `off_task` were
  dropped during the build rather than guessed at by a fuzzy classifier.
- An empty denominator is `null`, not zero. Reporting 0% accuracy for a cell that produced nothing
  extractable would have manufactured a reasoning improvement that was never observed.
- A gate cannot pass on an incomplete curve. When a tier does not run, the monotonicity check reports
  `complete: false` and fails, rather than treating the absent tier as accuracy zero.
- Problems must discriminate to be admitted, and rejected ones are written to `rejected.json` with a
  reason rather than silently dropped.

## What remains unproven

1. No reliability gradient has been found between model tiers at any problem size we have tested.
2. The briefing-bias effect is unreplicated and may be specific to one model family.
3. The scout tier has only 25 graded attempts in the main pilot; the rest were lost to the AM4 drop.
4. The attention economy — the commander-capacity tradeoff that motivated all of this — has not been
   tested at all. Nothing here bears on it either way.

## Changes for the next cycle

### Immediate

1. Stop deriving gameplay from model reliability differences. At this problem scale they do not
   exist, and two independent attempts to find them have failed.
2. Build the attention-economy slice instead: a fixed set of pending outputs, an attention budget
   smaller than full supervision costs, and accept / verify / seize / re-brief. It needs no model
   calls, no bank, and no reliability gradient, and it tests the one hypothesis still standing.
3. Add a readiness probe to the door check — a one-token generate per local backend, matching what
   `--probe-cloud` already does for Gemini.
4. Record that the AM4 rungs contend, so a job cannot pin both.

### If the bank is revisited

Chassis tiers should differ in cost, latency, and context capacity rather than in whether they are
right. That is both what the data supports and a truer model of orchestration: the expensive model
earns its price when a problem is large or ambiguous, not when it is merely hard.

## The durable principle

The previous retrospective ended on *use machines to search the space, humans to judge meaning, and
deterministic artifacts to connect the two.* This cycle adds a narrower one:

**Decide what does not count as evidence before you collect any.** The rules that mattered most here
— infrastructure failure is not model failure, an empty denominator is not a zero, an absent tier is
not a low score — were all written before the first record existed, and each one caught a false
positive that would otherwise have read as a discovery.
