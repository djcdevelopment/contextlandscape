# Gameplay lab implementation retrospective

Date: 2026-07-29

## Outcome

The prototype advanced from a deterministic vertical slice to a closed research loop:

```text
large synthetic search
  -> explicit edge and falsifier
  -> blinded playable variants
  -> human explanation and reconstruction
  -> bounded synthetic follow-up
  -> manual content decision
```

The implementation delivered five gameplay-lab packs with 24 total variants, persistent anonymous sessions, review gates, exports, executable follow-up manifests, and portable Docker paths. Automated verification is strong: 17 tests pass, every variant is reachable, four scenario controls replay exactly, all three API smoke suites pass locally, and a generated GL-001 follow-up completed 64,000 runs across four shards.

That is a successful research-infrastructure milestone. It is not yet a balance result. The smoke sessions were synthetic workflow checks, and no human has completed a blinded lab disposition.

## What worked

### Separate evidence layers

The most important design decision held up: simulation, gameplay truth, observations, and player interpretation remain separate.

- Match events are the deterministic source of truth.
- Synthetic matrices compare policies and bounded tuning under repeatable pressure.
- Gameplay labs ask whether a player can see, understand, and enjoy the tradeoff.
- Reconstructions are derived from events and revealed only after the player commits an explanation.
- Candidate tuning stays recommendation-only until a human disposition and holdout follow-up exist.

This prevented millions of cheap simulations from being mistaken for millions of player opinions.

### Determinism made research composable

Scenario/version pins, seeds, event hashes, and projection hashes made it possible to connect an overnight result to a playable trial and then back to a bounded follow-up. The startup preflight catches missing source reports, stale scenario versions, unwinnable variants, and changed controls before a participant sees a lab.

### The portable worker model scaled cleanly

Independent shards, compressed JSONL artifacts, resumable aggregation, and one Docker worker image were enough to run 19,456,000 matches unattended. The same worker can execute a human-generated follow-up manifest locally, on OMEN, on AM4, or later on GCP without changing the evidence format.

### Blinding is now enforced by the server

Anonymous labels are not merely presentation. Hidden variant mapping, raw tuning, synthetic recommendations, and doctrine identities remain server-owned until the review gate is complete. This is a more durable boundary than relying on the browser to hide fields.

## What surprised us

### Scale exposed a reducer design flaw

The first 3,072,000-run tuning report exceeded Node's default heap because aggregation retained every record. The raw shards survived, so the reducer was rewritten to stream compressed records into bounded maps. Reporting then completed in 17.85 seconds and the campaign resumed without recomputing finished work.

Lesson: resumable raw artifacts and streaming reducers are baseline requirements, not later optimizations, for brute-force research.

### Composition labels were not mechanics

The overnight matrix found no distinct composition curves. Chassis initiative matters only when multiple orders resolve in a slot, while current policies issue one order per slot. More runs cannot recover a signal the rules never exercise.

Lesson: before spending compute on a factor, trace the exact engine branch by which it can affect an outcome. Composition balance remains untested until loadouts, initiative, or multi-order resolution create real mechanical differences.

### Reachability witnesses can be correct but unconvincing

The GL-001 solver found a winning route that built the contract twice. It is a valid witness, but not the human-readable doctrine we expected. This showed why reachability is only a safety check: it proves that a variant can terminate successfully, not that its route is intuitive or desirable.

### The first implementation leaked blind data

Early payloads exposed raw `rulesTuning`, and doctrine metadata exposed policy/category identifiers. Both were removed in favor of anonymous trials and opaque tuning IDs.

Lesson: conduct an adversarial payload audit, not just a visual UI review, for every blinded study.

### An emitted artifact was initially descriptive, not executable

The first follow-up manifest described the intended comparison but could not be consumed directly by the matrix worker. The manifest schema and CLI were completed together, and the generated GL-001 file then ran 64,000 matches successfully.

Lesson: a handoff artifact is not done until the next system consumes it without translation.

### Container mechanics mattered to iteration speed

The initial Docker context was roughly 622 MB and a recursive runtime ownership change took about 47.5 seconds. A narrow `.dockerignore`, report-only research inputs, and `COPY --chown` reduced the context below 1 MB and removed the ownership bottleneck.

Docker Desktop's Vite watcher also missed host edits until the web container restarted. This is now an operator expectation when UI changes appear stale.

### Public ingress is part of the feature

The application and runtime image can support gameplay labs, but AM4's explicit Caddy allowlist currently rejects the new APIs with `401`. A healthy application container is insufficient evidence of a healthy public feature.

Lesson: route-family probes belong in release acceptance, and application plus ingress should be promoted as one change.

### The first hands-on attempt found a session trap

The first real attempt entered GL-001 successfully, bookmarked a decision, and then appeared stuck. The data was intact, but the interface failed in three related ways: “bookmark” looked like a progression action, the catalog disabled every pack while a session was active, and refresh deliberately resumed the same session without offering an exit.

The UI now labels bookmarking as non-advancing, explains the victory/defeat and review progression gate, and provides a confirmed **Leave lab** action in both the trial banner and catalog. The partial session remains on the server while automatic browser resumption is cleared.

Lesson: persistence without visible lifecycle controls feels like a lock. Every resumable research workflow needs explicit advance, pause/exit, and destructive-action semantics.

## Decisions that held up

- Keep `GameplayLabDefinition` separate from public `ScenarioDefinition`.
- Keep hidden treatment mapping and lab state on the server.
- Pin every lab to source reports and scenario versions.
- Require a pre-reconstruction explanation before revealing causal analysis.
- Use exact replay equality for controls.
- Treat auto-balance as recommendation generation, never automatic promotion.
- Require an executable, bounded follow-up matrix for `keep` or `revise`.
- Preserve raw shards and make aggregation restartable.

## What remains unproven

1. No real human session has established that any edge is legible, fair, or enjoyable.
2. An N-of-1 session can falsify a mechanic or reveal confusion, but cannot estimate population preference.
3. Composition and chassis balance have no valid experimental signal in the current one-order-per-slot rules.
4. The gameplay-lab build is not yet public; AM4 still serves the baseline release and rejects the new API families.
5. The runtime image build reported one high-severity npm audit finding that still needs dependency triage.
6. The mechanics have not yet met the product documents' gates for asynchronous PvP, social play, or durable player progression.

## Changes for the next research cycle

### Immediate

1. Promote the verified gameplay-lab runtime image and update the AM4 Caddy allowlist in one release window.
2. Run all three public smoke suites and confirm route probes return `200` for the catalog and `404` for an unknown session.
3. Complete GL-001 as the first real blinded human session. Judge decision visibility and explanation quality, not just victory.
4. Complete GL-002 next to test whether heat/cooldown creates an understandable sustained-fire tradeoff.
5. For each `keep` or `revise`, run the emitted follow-up manifest and record whether the control/treatment direction survives holdout seeds.

### Next mechanic experiment

Add a small, explicit mechanic that lets composition affect resolution—multiple orders per slot, loadout-specific actions, or meaningful initiative interactions. Write the causal engine test first, then run a bounded matrix before another large composition campaign.

### Reliability and developer experience

- Add gameplay-lab preflight and smoke coverage to CI.
- Add AM4 route-family probes to the promotion acceptance script.
- Add a payload-level blinding regression test that rejects forbidden fields.
- Triage and resolve the reported high-severity npm dependency.
- Document or automate the Docker Desktop web restart when file watching stalls.

## Recommended operating cadence

For each future content edge:

1. State the hypothesis, falsifier, and engine branch that can produce the signal.
2. Run a bounded train/holdout matrix.
3. Promote only a clear edge into anonymous playable variants.
4. Verify reachability and exact control replay.
5. Collect the player's decision and explanation before reconstruction.
6. Choose `keep`, `revise`, or `reject`.
7. Run the generated follow-up only for `keep` or `revise`.
8. Version content manually and retain the joined evidence.

The durable principle is simple: use machines to search the space, humans to judge meaning, and deterministic artifacts to connect the two.
