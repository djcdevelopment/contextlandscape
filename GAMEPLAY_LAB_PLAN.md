# Synthetic-to-gameplay lab plan

## Implementation status

Implemented on 2026-07-29:

- versioned contracts, five-pack registry, and anonymous counterbalanced/randomized sessions;
- persistent memory/PostgreSQL session state and refresh-safe match resumption;
- preflight reachability for all 24 variants, including source/version checks, minimum slots/energy, winning-path evidence, doctrine outcomes, and replay hashes;
- separate browser lab catalog, trial progress, bookmarks, optional doctrine cards, pre/post reconstruction review gates, final comparison, and treatment reveal;
- joined JSON/Markdown exports with observations, deterministic match artifacts, explicit disposition, and Policy Zoo human labels;
- executable control-versus-selected follow-up manifests and grammar-constrained policy generation from accepted doctrine labels;
- Docker persistence paths plus automated unit, preflight, API, and operator smoke coverage.

Operational instructions and the hands-on acceptance checklist are in [GAMEPLAY_LAB_WORKBOOK.md](GAMEPLAY_LAB_WORKBOOK.md). Scenario promotion remains intentionally manual and requires an actual human lab disposition plus its bounded follow-up result.

All planned implementation slices are complete:

| Slice | Delivered evidence |
| --- | --- |
| A — Definitions and persistence | Five versioned packs, 24 variants, memory/PostgreSQL sessions, refresh-safe resumption |
| B — Session API | Catalog, create/resume, bookmark, trial completion, review, reconstruction, and export routes |
| C — Workbook UI | Separate catalog, anonymous trial flow, selection JSON, transaction log, gated reveal |
| D — Preflight | Source/version checks, reachability witnesses, minimum energy/slots, exact control hashes |
| E — Joined export | Session JSON, review Markdown, match events/reconstructions, follow-up manifest |
| F — Policy Zoo | Eleven doctrine trials, player classifications, accepted-policy grammar for follow-up generation |

The outcome and lessons from implementing these slices are in [GAMEPLAY_LAB_RETROSPECTIVE.md](GAMEPLAY_LAB_RETROSPECTIVE.md).

## Decision

Use synthetic simulation as a hypothesis generator, then promote selected edges into short, blinded, single-player gameplay labs. The human lab is not a smaller balance matrix. Its purpose is to answer questions the matrix cannot:

- Is the tradeoff visible before the result?
- Does the losing line feel tempting, coherent, and fair?
- Does the player understand why the outcome changed?
- Are there multiple plausible plans, or only one hidden script?
- Does a parameter change strengthen the intended lesson or merely inflate the score?

This becomes the standard content loop:

```text
synthetic matrix
  -> finding and falsifier
  -> matched playable variants
  -> automated reachability preflight
  -> blinded solo session
  -> reconstruction and structured review
  -> keep / revise / reject
  -> version scenario
  -> rerun a smaller synthetic matrix
```

The first lab packs can use the existing engine. `createMatchState` already accepts starting energy, starting heat, starting dispersion, starting confidence drift, full-send heat, and action-cost overrides. The public match endpoint currently discards those controls; lab sessions should pass them server-side without exposing treatment labels to the player.

## Reusable lab contract

Add a versioned `GameplayLabDefinition` alongside, but separate from, `ScenarioDefinition`.

```ts
type GameplayLabDefinition = {
  labId: string;
  version: number;
  title: string;
  source: {
    campaignId: string;
    matrixIds: string[];
    reportPaths: string[];
    finding: string;
  };
  scenarioId: string;
  hypothesis: string;
  falsifier: string;
  variants: Array<{
    variantId: string;
    labelForReview: string;
    rulesTuning: RulesTuningInput;
    seedOffset: number;
  }>;
  trialOrder: "randomized" | "counterbalanced";
  preBrief: string;
  reviewQuestions: string[];
  acceptance: {
    mechanicRelevant: string;
    lessonLegible: string;
    agencyPresent: string;
    syntheticDirectionConfirmed: string;
  };
};
```

Keep the following distinctions explicit:

- `ScenarioDefinition` is shipped game content.
- `GameplayLabDefinition` is an experiment over one scenario version.
- `GameplayLabSession` is one participant's randomized run through that lab.
- Match events remain gameplay truth.
- Playtest observations capture interaction and interpretation, not match state.
- A tuning is never written back to a scenario automatically.

Every lab definition must cite its source matrix, describe what observation would disprove the hypothesis, and state which mechanic the player should actually notice.

## Player review experience

Lab mode should be a thin wrapper around the existing board, transaction console, and reconstruction panel.

### Before a session

The player sees:

- the lab title;
- approximate duration;
- the scenario's mission objective;
- the number of anonymous trials;
- no expected lesson, tuning name, or synthetic recommendation.

The player does not see whether a trial is control, treatment, or boundary. Trials use neutral labels such as A, B, and C and are randomized or counterbalanced.

### During a trial

Keep the board unchanged. Add only:

- `Trial 2 of 3`;
- a small `Bookmark this decision` control with an optional one-line note;
- automatic capture of time to first command, command sequence, selected units/cells, rejection events, terminal status, and reconstruction access;
- restart protection so an accidental refresh resumes the same trial.

Avoid mandatory think-aloud narration during play. It changes behavior. Capture interpretation immediately after the match instead.

### Before showing reconstruction

Ask five short questions:

1. What did you believe was the binding constraint?
2. Which decision most affected the outcome?
3. What would you change on a replay?
4. Did the result feel earned? `1–5`
5. How confident are you in your explanation? `1–5`

Only then reveal reconstruction. After reconstruction, ask:

1. Did the explanation change?
2. What information was missing or misleading during play?

At the end of the full pack, reveal the variants and ask which version created the clearest, fairest, and most interesting decision.

## Observation and export plan

Reuse `POST /api/research/observations` and add these event types:

- `lab.session.started`
- `lab.trial.started`
- `lab.decision.bookmarked`
- `lab.trial.completed`
- `lab.pre_reconstruction.submitted`
- `lab.reconstruction.revealed`
- `lab.post_reconstruction.submitted`
- `lab.session.completed`

Add the lab identifiers to observation data:

```json
{
  "labId": "GL-001",
  "labVersion": 1,
  "labSessionId": "lab_session_...",
  "trialId": "trial_...",
  "variantToken": "opaque-server-token"
}
```

The export joins:

- lab definition and source finding;
- hidden variant mapping;
- match state and deterministic event log;
- replay manifest;
- interaction observations;
- pre- and post-reconstruction answers;
- a derived timeline;
- the synthetic prior and the human disposition.

Emit both JSON and a compact Markdown workbook under:

```text
data/playtests/<lab-id>/<lab-session-id>/
  session.json
  review.md
  matches/
    <match-id>-events.json
    <match-id>-reconstruction.json
```

## First gameplay lab packs

### GL-001 — The one-energy cliff

Source finding: the named Two Baked Slices lesson policy changes from 0% to 100% wins between starting energy 5 and 6.

Question: Is this a real scenario cliff, or a brittle scripted-policy failure that a human avoids by omitting the review step or finding another route?

| Trial | Starting energy | Full-send cost | Purpose |
| --- | ---: | ---: | --- |
| Control | 6 | 2 | Current intended route is exactly affordable. |
| Starved | 5 | 2 | Test whether a human finds a coherent route that the named lesson policy misses. |
| Compensated | 5 | 1 | Make the full scripted route affordable through the tied `full-send-cheap` candidate. |

Primary observations:

- Can the player forecast the full route's energy cost before committing?
- Does the player omit review or find another believable line at energy 5?
- Does the compensated version feel easier, or simply less arbitrary?
- Can the player explain the loss before seeing reconstruction?

Disposition:

- Improve the policy generator if the player wins Starved through a coherent route that synthetic search classified as failure.
- Reject the current edge if reachability proves Starved unwinnable and that fact is not legible.
- Redesign the scenario if only one exact order sequence can win.
- Keep a cost treatment only if it creates a choice rather than restoring a hidden script.

Priority: **first**. This is the clearest synthetic edge and the simplest lab-runner proof.

### GL-002 — Cooldown or sustained-fire leakage

Source finding: `heat-minus-one` is the stable Context Furnace recommendation, but it raises the named naive sustained-fire policy from 0% to 68.8% across the deep matrix.

Question: Does reduced heat create more interesting tempo choices, or make consolidation irrelevant?

| Trial | Starting heat | Heat per full send | Purpose |
| --- | ---: | ---: | --- |
| Control | 0 | 2 | Current burst/cool/burst lesson. |
| Low-heat treatment | 0 | 1 | Test the recommended tuning and naive-doctrine leakage. |
| Pressured treatment | 2 | 1 | Test whether an explicit starting burden restores the cooling decision. |

Primary observations:

- Does the player choose consolidation without being instructed?
- Is heat read as a constraint or merely as a score?
- Can repeated full send win, and does that feel like mastery or an exploit?
- Is starting heat visible enough to change the opening plan?

Hard guardrail: a candidate fails if sustained full send becomes the obvious, low-risk route even when it improves the aggregate diversity score.

Priority: **second**. It validates the proposed lesson-integrity guardrail.

Known engine preflight:

- GL-001 Starved is winnable with `scout -> build contract -> implement -> full send` in four slots, ending at progress 7 and energy 0. The named synthetic lesson policy loses because it inserts review before full send.
- GL-002 Low-heat treatment wins with two consecutive full sends, ending at progress 6 and heat 2. Control needs a third-step consolidation after two bursts to return to heat 1 and win.

These facts stay hidden during a blinded session. They are designer-side expectations used to test whether the player discovers and understands the underlying choice.

### GL-003 — Is full-send pricing even relevant?

Source finding: False Bottleneck selects `full-send-cheap` in the 32-policy matrices, while the 128-policy deep matrix narrowly selects `full-send-expensive` by `0.023` composite-score points.

Question: Does full-send price affect the human measurement-versus-optimization decision at all?

| Trial | Full-send cost | Purpose |
| --- | ---: | --- |
| Control | 2 | Current scenario. |
| Cheap | 1 | Train/holdout recommendation. |
| Expensive | 3 | Deep recommendation. |

Primary observations:

- Does the player use or seriously consider full send?
- Does price change whether the player scouts/measures first?
- Is the changed parameter connected to the scenario's stated lesson?
- If behavior does not change, is the recommendation merely exploiting generated-policy noise?

Disposition: reject both tuning recommendations if a blind player never encounters full-send pricing as a meaningful choice.

Priority: **fourth**. Run after the lab layer proves it can detect mechanic irrelevance.

### GL-004 — Artifact economy, hoarding, and spare budget

Source finding: Documentation Fortress has a three-way train/holdout tie among `energy-plus-one`, `full-send-cheap`, and `implement-cheap`; deep search resolves the tie toward `full-send-cheap`.

Question: Which economy change, if any, makes the artifact-versus-progress tradeoff more legible without rewarding hoarding?

| Trial | Change | Purpose |
| --- | --- | --- |
| Control | none | Current artifact economy. |
| Spare budget | starting energy +1 | Test whether extra budget encourages experimentation or hoarding. |
| Cheap implementation | implement cost 0 | Test artifact return against nearly free direct progress. |
| Cheap full send | full-send cost 1 | Negative-control the deep recommendation's thematic relevance. |

Primary observations:

- Does the player build an artifact for expected future return?
- Can the player distinguish useful infrastructure from accumulation?
- Does extra energy increase agency or merely extend the session?
- Does the deep recommendation affect the intended lesson at all?

Priority: **fifth**. Four trials make this a longer pack.

### GL-005 — The policy zoo

Source finding: 446 of 512 deduplicated policies are dead, while only 20 occupy the 20–80% win band.

Question: Are dead policies invalid random strings, coherent but mistaken doctrines, or viable plans that the engine fails to express?

Build a guided-replay lab from sampled synthetic policies:

- three dead policies;
- three viable policies;
- three dominant policies;
- the hand-authored lesson and naive policies.

For each sampled policy:

1. Show its next proposed command as a neutral `doctrine card`.
2. Let the player follow it or override it.
3. Ask why an override was needed.
4. Classify the policy as illegal, incoherent, under-resourced, misleading, brittle, plausible, or dominant.

This produces training labels for the next policy generator. The immediate output is a grammar of plausible action sequences, not a balance patch.

Priority: **third**. It directly improves the quality of the next synthetic campaign.

## Build sequence

### Slice A — Lab contracts and registry

- Add `GameplayLabDefinitionSchema`, `GameplayLabSessionSchema`, and review-answer schemas.
- Add a lab registry containing GL-001 and GL-002 only.
- Validate source report paths and scenario versions at startup.
- Keep lab content out of the public scenario selector by default.

Exit gate: both definitions parse and their control variants reproduce the current scenario replay hashes.

### Slice B — Server-side blinded trials

- `GET /api/gameplay-labs`
- `POST /api/gameplay-labs/:labId/sessions`
- `POST /api/gameplay-lab-sessions/:sessionId/trials/:trialId/complete`
- `POST /api/gameplay-lab-sessions/:sessionId/reviews`
- `GET /api/gameplay-lab-sessions/:sessionId/export`

The server chooses the trial order, stores the hidden mapping, and calls `createMatchState` with the variant tuning. The browser receives an opaque trial token until the session is reviewed.

Exit gate: refresh/resume preserves the assigned variant and does not reveal its tuning.

### Slice C — Minimal lab workbook UI

- Add a `Gameplay labs` entry separate from normal scenario play.
- Add session/trial progress.
- Add the decision bookmark.
- Gate reconstruction behind the pre-reconstruction questions.
- Add the final comparison/reveal screen.

Exit gate: one GL-001 session can be completed without using developer tools or manually editing JSON.

### Slice D — Reachability preflight

Before exposing a lab:

- enumerate grammar-valid bounded action sequences;
- confirm whether each variant is winnable;
- record minimum energy and minimum slots for a win;
- identify exact-order scripts and binary cliffs;
- fail the lab build if a control unexpectedly changes.

The preflight must determine whether edge variants are winnable and record any exact-order scripts internally, while keeping that result blind during the trial.

Exit gate: every variant has a machine-generated reachability note attached to its definition.

### Slice E — Export and comparison

- Join gameplay events, observations, reviews, and synthetic source metrics.
- Generate `review.md` with trial timelines and before/after explanations.
- Add a disposition: `keep`, `revise`, `reject`, `needs-mechanic`, or `needs-instrumentation`.
- Generate a follow-up matrix manifest when a treatment is marked `keep` or `revise`.

Exit gate: one command can export a session and prepare a bounded synthetic rerun.

### Slice F — Expand the pack

- Add GL-005 Policy Zoo.
- Use its labels to replace unconstrained random policy generation.
- Add GL-003 and GL-004.
- Only then add new scenario themes or chassis experiments.

## Review gates

Evaluate each pack on six axes:

| Gate | Pass condition |
| --- | --- |
| Mechanic relevance | The changed parameter appears in at least one genuine player decision. |
| Legibility | The player explains the important constraint before reconstruction. |
| Agency | At least two routes feel plausible at the key decision point. |
| Lesson integrity | The named naive doctrine does not become the obvious low-risk winner. |
| Synthetic fidelity | Human behavior changes in the predicted direction, even if exact win rates do not match. |
| Replay fidelity | Match events, projection, observations, and review export agree. |

Because the first participant is one person, do not treat repeated trials as population statistics. Use structured N-of-1 evidence:

- blind the variants;
- randomize or counterbalance order;
- repeat the pack on a later session rather than immediately memorizing it;
- compare explanations and behavior, not only wins;
- record surprises and contradictions as first-class results.

## Promotion rule

A synthetic tuning can become a scenario candidate only when:

1. train and holdout agree;
2. the changed mechanic is relevant in the human lab;
3. the player can explain the tradeoff without seeing the expected lesson;
4. at least two plausible doctrines remain;
5. the named naive doctrine stays below its guardrail;
6. deterministic replay and the human review export pass;
7. a bounded follow-up matrix confirms the revised scenario version.

Until then, the result is a research finding, not game content.

## Recommended first review cycle

1. Build Slices A–C around GL-001 and GL-002.
2. Run one smoke session for each pack to validate the workflow, not the balance.
3. Fix reachability and review friction.
4. Run one blinded GL-001 session and one blinded GL-002 session.
5. Export both workbooks and make explicit dispositions.
6. Build Slice D and GL-005 from the observed dead-policy failure modes.
7. Improve the policy generator and pressure mechanics.
8. Run a smaller synthetic campaign, then craft the next gameplay labs from its new edges.

This is the recurring pattern: use cheap simulation to find edges, use human play to determine whether those edges are meaningful, and feed the classification back into both content and the simulator.
