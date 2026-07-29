# Mech Commander first-time verification workbook

This is the manual verification path for someone who has not seen the interface before. It tests the current OMEN vertical slice, not the future Discord/PvP product.

## 1. Start and preflight

From the repository root in PowerShell:

```powershell
docker compose -p mech-commander-dev -f infra/compose.dev.yml up -d
docker compose -p mech-commander-dev -f infra/compose.dev.yml ps
Invoke-RestMethod http://127.0.0.1:9080/health/ready
```

Expected:

- `app` is `Up` and mapped as `127.0.0.1:9080->8080/tcp`.
- `web` is `Up` and mapped as `127.0.0.1:5173->5173/tcp`.
- `postgres` is `Up (healthy)`.
- The health response is `{ status: "ok", persistence: "postgres" }`.

If the stack is not running, use the full rebuild once:

```powershell
docker compose -p mech-commander-dev -f infra/compose.dev.yml up --build -d
```

## 2. Automated seam check

Run this before or after the manual test:

```powershell
.\scripts\smoke.ps1
```

It verifies health, release identity, match creation, deterministic order resolution, duplicate-command idempotency, the intended victory path, PostgreSQL persistence, and event sequencing.

The broader research and blinded gameplay-lab seams have separate smoke scripts:

```powershell
.\scripts\research-smoke.ps1
.\scripts\gameplay-lab-smoke.ps1
```

Expected final line:

```text
SMOKE PASS: match_<id>
```

## 3. Open the game as a new player

Open:

```text
http://localhost:5173
```

Before clicking anything, record what is visible:

- Title: `The Two Baked Slices`.
- Mission progress: `0/7`.
- Commander energy: `6`.
- Heat: `0`.
- Dispersion: `0`.
- Slot: `0`.
- A 10×10 grid.
- Three friendly units: one Scout and two Line units.
- No visible enemy unit.
- `Selection` shows a compact JSON object for the selected Scout, its position, state, heat, and dispersion.
- `Command actions` is explicitly labeled `Orders for Scout mech scout-01`.
- `Transaction log` appears below the grid and says `awaiting first command_`.

Pass criterion: the screen explains the first sensible action without requiring a separate rules document.

## 4. Guided intended doctrine

This is the low-energy composition the scenario is supposed to reward. After each step, pause and write down what changed.

| Step | UI action | Expected result |
|---|---|---|
| 1 | Select the friendly Scout at approximately `(1,1)`. Confirm `Selection` JSON names `scout-01` and `command_target: true`, then use `Command actions > Scout`. | Slot `1`; energy `5`; boundary becomes `exposed`; hidden contact appears; transaction log records `terrain.revealed` for `scout-01`. |
| 2 | Select the Line unit at approximately `(2,4)`. Confirm the `Orders for ...` target changes, then use `Build Contract`. | Slot `2`; energy `4`; `contract-depot` appears; mission progress becomes `2/7`; log records `artifact.contract_built`. |
| 3 | Keep the same Line unit selected and use `Implement`. | Slot `3`; energy `3`; mission progress becomes `4/7`; heat rises modestly; log records `implementation.resolved`. |
| 4 | Select the second Line unit at approximately `(3,4)`, then use `Review`. | Slot `4`; energy `2`; mission progress becomes `5/7`; confidence drift is reduced; log records `verification.completed`. |
| 5 | Select the first Line unit again, then use `Full Send`. | Slot `5`; energy `0`; mission reaches the victory threshold; status becomes `victory`; rollback is verified; log records `weapon.burst.resolved`. |

Selection clarity checks:

- Select an empty tile. `Selection` JSON should have `kind: "terrain"`, show its coordinate, and set `command_target: false`; command buttons should be disabled.
- Select a revealed enemy contact. `Selection` JSON should have `kind: "enemy_contact"` and keep command buttons disabled.
- Select a friendly unit. `Selection` JSON and the `Orders for ...` label should name the same unit before issuing an order.

Pass criteria:

- The player can complete the route without manually editing state.
- Energy visibly constrains choices.
- Scouting and the Contract Depot matter before full-send.
- The heavier unit is not required to win.
- The transaction log preserves the ordered action history through victory.

## 5. Failure-path test

Click `New match`, then immediately select a Line unit and click `full send` before scouting or building the contract.

Expected:

- Mission progress barely moves or does not move.
- Dispersion and confidence drift increase.
- The transaction log records the resulting action and any rejected order reason.
- Repeating heavy fire eventually produces a defeat or an obviously degraded state.

Record whether the failure feels caused by a visible decision or merely by an arbitrary rule.

## 6. Persistence and restart test

The API smoke script performs this more directly, but the runtime persistence check can be run manually:

```powershell
docker compose -p mech-commander-dev -f infra/compose.dev.yml restart app
Invoke-RestMethod http://127.0.0.1:9080/health/ready
```

Refresh the browser and create a new match. The API should still report `persistence: postgres`, and the app should accept new orders after the restart.

## 7. Evidence to capture

For the first playtest, capture:

- Screenshot before the first order.
- Screenshot after scouting.
- Screenshot at victory.
- The `match_<id>` from the browser/API.
- Whether the transaction log made the action sequence understandable without coaching.
- Whether heat and dispersion felt meaningfully different.
- Whether you wanted to try a different composition immediately.

Use this short report format:

```text
Match ID:
Did the transaction log make the action sequence understandable? yes/no
Did scouting feel worth the energy? yes/no
Did the Contract Depot change the decision? yes/no
Could you explain the loss/win afterward? yes/no
Most confusing UI element:
Most compelling decision:
Suggested rule or copy change:
```

## 8. Current scope boundary

This workbook intentionally verifies only the baseline `two-baked-slices` vertical slice and first-time UI comprehension. It does not verify the other registered scenarios, blinded gameplay labs, Discord, AM4/GCP deployment, realtime timing, or ranked play.

Use [GAMEPLAY_LAB_WORKBOOK.md](GAMEPLAY_LAB_WORKBOOK.md) for GL-001 through GL-005 and [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) for public deployment acceptance.
