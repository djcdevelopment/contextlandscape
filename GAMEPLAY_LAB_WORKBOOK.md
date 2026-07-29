# Gameplay lab operator workbook

The gameplay-lab loop is ready for structured N-of-1 review. It turns a synthetic edge into anonymous playable trials, locks in the player's explanation before reconstruction, reveals treatments only after comparison, and emits a bounded control-versus-selected follow-up matrix.

## Verified baseline

As of 2026-07-29:

- 17 engine, lab, and server tests pass;
- preflight passes for five packs and all 24 variants;
- GL-001 through GL-004 reproduce their baseline scenario control hashes exactly;
- all variants have at least one machine-verified winning path;
- the local development/PostgreSQL and runtime/in-memory container paths pass the gameplay-lab smoke;
- an emitted GL-001 follow-up manifest completed 64,000 runs across four shards.

These checks prove determinism, reachability, persistence, blinding gates, exports, and follow-up execution. They are workflow evidence, not a human balance result. No real player disposition has been recorded yet.

## Start and verify the lab surface

From `C:\work\contextlandscape`:

```powershell
docker compose -p mech-commander-dev -f infra/compose.dev.yml up --build -d
.\scripts\smoke.ps1
.\scripts\research-smoke.ps1
.\scripts\gameplay-lab-smoke.ps1
npm run gameplay-lab:preflight
```

Open <http://localhost:5173> and select **Gameplay labs**. The catalog should contain GL-001 through GL-005. A catalog card may show the lab brief and trial count, but must not show its hypothesis, source finding, treatment names, or synthetic recommendation.

Refresh during any trial. The same anonymous trial, match, event log, and review stage should resume.

The gameplay-lab build is currently local to OMEN. Before testing through the public AM4 URL, complete the image and ingress promotion in [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md); the existing public baseline does not yet route the lab APIs.

## Human review checklist

Use this checklist for a real session:

1. Start one pack without reading its definition in source.
2. Confirm trials are identified only as A, B, C, and so on.
3. Play naturally; use **Bookmark note (does not advance)** only at a meaningful fork. A bookmark records evidence but does not complete the trial.
4. At terminal status, select **Complete trial**.
5. Answer the pre-reconstruction questions from memory.
6. Confirm reconstruction appears only after those answers are saved.
7. Record whether reconstruction changed the explanation.
8. Finish every anonymous trial.
9. Compare clarity, fairness, and interest before revealing treatments.
10. Choose an explicit disposition and explain it.
11. Open both the Markdown workbook and JSON bundle from the reveal screen.

A trial advances only after the battlefield reaches `victory` or `defeat`, **Complete trial** is selected, and both review stages are submitted. If you want to stop or switch packs, use **Leave lab** in the trial banner or active-session catalog notice. Leaving clears automatic browser resumption and returns to the catalog; the partial record remains on the server.

For GL-005, the optional doctrine card should be usable as guidance rather than a forced script. Its pre-reconstruction review must also capture:

- whether the doctrine was followed without override;
- one classification: illegal, incoherent, under-resourced, misleading, brittle, plausible, or dominant;
- why the player followed or overrode it.

## Expected export

A completed session writes:

```text
data/playtests/<lab-id>/<lab-session-id>/
  session.json
  review.md
  follow-up-matrix.json       # keep/revise only
  matches/
    <match-id>-events.json
    <match-id>-reconstruction.json
```

The JSON bundle joins the lab definition and synthetic prior, hidden mapping, final match states, event logs, replay hashes, observations, reviews, and derived Policy Zoo labels. `follow-up-matrix.json` compares control with the selected treatment. Policy Zoo dispositions also embed human-accepted doctrine seeds; the synthetic worker expands those through observed transitions instead of unconstrained random generation.

## Run the bounded follow-up

Local Node:

```powershell
npm run build
npm run lab -- --manifest=data/playtests/GL-001/<lab-session-id>/follow-up-matrix.json --all-shards=true
```

Docker on OMEN or AM4:

```powershell
docker compose -f infra/compose.lab.yml build worker
docker compose -f infra/compose.lab.yml run --rm worker `
  node apps/lab/dist/main.js `
  --manifest=data/playtests/GL-001/<lab-session-id>/follow-up-matrix.json `
  --all-shards=true
```

The worker writes the compressed shards, manifest, `report.json`, and `candidate-patches.json` under `data/lab/<matrix-id>/`. It does not promote a scenario automatically.

## Interpreting one-person evidence

Treat a single session as structured evidence, not a population estimate. Compare decisions and explanations, not merely wins. Repeat a pack later rather than immediately memorizing its edge. A surprising coherent route, an ignored tuning, or a misleading reconstruction is a useful falsification and should be recorded as such.

The first implementation cycle and its operational lessons are summarized in [GAMEPLAY_LAB_RETROSPECTIVE.md](GAMEPLAY_LAB_RETROSPECTIVE.md).
