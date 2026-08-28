# Handoff: Battle Command — "Command Deck" layout redesign (option 1c)

## Overview
A layout/information-hierarchy redesign of the **Battle Command** screen in Context Landscape (`apps/web/src/battle/`). It fixes four problems with the current UI: the turn-stage list consumed a full left column; global game state was spread across a wide top status strip; fleet cards were cluttered with passive data and per-card form controls; and phase-specific panels popped in and out of existence as the turn cycled, which was jarring and hard to learn.

The chosen direction ("Command Deck") reads like a board game table:
1. **Turn stages** become a compact stepper in the top bar, center. Full stage descriptions move to a hover/info-icon tooltip.
2. **Game state** (round, phase, progress, drift, attention, batteries) becomes a stacked left rail, with the current-stage help text ("NOW") and the map legend below it.
3. **Fleet** becomes a horizontal strip of three compact cards directly under the board, with Emit/Hold inline; passive UAP breakdown (BASE / BATTERY) moves to hover.
4. **Every region is permanent across all five phases.** Only region *contents* change. Wrong-phase controls render dimmed with a caption (e.g. armory: "ACTIVE IN ARTILLERY"), and a faint dashed "NEXT · <phase>" ghost panel previews the upcoming phase.

## About the Design Files
The files in this bundle are **design references created in HTML** — static mocks showing intended look and behavior, not production code. The task is to **recreate this design inside the existing codebase** (`apps/web`, React + the existing `battle-command.css`), reusing its established components, CSS custom properties, and patterns. Do not ship the bundled HTML.

## Fidelity
**High-fidelity.** All colors, type roles, and copy are lifted verbatim from the product's existing `battle-command.css` and `BattleCommandApp.tsx`. Recreate pixel-perfectly, but express values through the existing `--battle-*` custom properties and `--battle-type-*` scale (and the `data-ui-scale` mechanism) rather than hard-coding.

## Source mapping (existing code → new layout)
All in `apps/web/src/battle/BattleCommandApp.tsx` unless noted:
- `Workflow` (left column stepper + help + legend) → split: stepper → new top-bar `PhaseStepper`; stage detail → tooltip on the current stage's ⓘ; "NOW" help + legend → left rail.
- `StatusStrip` (6-cell top strip) → left rail `OperationState` panel.
- `UnitRoster` / `.v4-unit-card` (right column) → horizontal `FleetStrip` under the board; the Volume/Density/Emit `output-allocation` block collapses to one inline row per card.
- `ArtifactTray`, board toolbar, `PerspectiveBoard` / `Board` → unchanged behavior, board column now spans nearly full width.
- `Armories` → stays mounted in every phase, `opacity: .45` + caption when not in Artillery.
- `ArtifactPanel` (context inspector) → compact card at the right end of the fleet strip.
- `PhaseDock` → in-flow dock at the bottom of the board column (no longer `position: fixed`); gains the shared order summary during Command.

## Screens / Views (bundled mocks)
Mock frames are 1500px wide representing a ~1920px viewport at 100% UI scale.

### Frame 1c — Command phase (chosen layout)
- **Top bar** (52px, `#071017`, bottom border `#243746`): brand kicker + title left (min-width 230px); phase stepper centered; nav links + "New operation" (primary) right.
  - Stepper: one chip per stage in order Register→Resolution. Completed: `✓ <name>`, border `#1d756f`, bg `rgba(102,228,212,.06)`, text `#6f8f94`. Current: `<n> · <name> ⓘ`, border `#efc96c`, bg `rgba(239,201,108,.12)`, text `#f3e3b4`, 800 weight. Upcoming: `<n> <name>`, border `#243746`, text `#506975`. Chips: padding 6px 12px (current 6px 14px), font 10.5–11px Inter, 2px gap.
  - ⓘ tooltip (hover/focus): 280px panel, border `#496676`, bg `#0a1720`, shadow `0 14px 36px rgba(0,0,0,.72)`; stage title 11px 700, body 11px/1.5 `#91a6b0`, plus the phase recap block (left border 2px `#66e4d4`, bg `#071119`). Content = existing `stageCopy` map.
- **Main grid**: `grid-template-columns: 210px minmax(0,1fr)`, gap 12px, padding 12px 16px 14px.
- **Left rail** (stacked, all panels border `#243746`, bg `rgba(8,17,24,.95)`):
  1. OPERATION STATE: kicker 9px mono `#66e4d4`; round `1/8` 24px mono (`/8` 15px `#5a7280`) + phase name 12px `#efc96c`; PROGRESS row `0/12` with 3px cyan meter; DRIFT row `0/4` in `#ff786f` with red meter; ATTENTION and BATTERIES as a 2-col cell pair, values 16px mono.
  2. NOW panel (bg `#0b1720`): kicker `NOW · <PHASE>` 9px mono `#efc96c`; stage detail 11px/1.55 `#8599a4`; recap block (LAST RESOLUTION / REGISTER RECAP) with 2px `#66e4d4` left border; "Full rules" ghost button.
  3. Legend: 2×2 grid of friendly/hostile/artifact/range swatches, 9px uppercase `#718794`.
  4. **Ghost panel**: `NEXT · <phase>` — dashed border `#3c5967`, bg `rgba(10,20,28,.5)`, whole panel `opacity: .5`. One line of the next stage's `stageCopy` detail.
- **Board column**:
  - Persistent context tray (bg `#081119`, min-height 40px): kicker `PERSISTENT CONTEXT · <n>` gold; artifact chips `SC 26%` etc. — mono 11px, friendly: border `#2a404d` bg `#0d1921` text/underline `#66e4d4` (underline = `box-shadow: inset 0 -2px`), hostile: border `#493139` bg `#160d11` accent `#ff786f`, verified: gold variant + ✓. Chips must be `flex:none; white-space:nowrap`. Empty state keeps the tray visible with explanatory text. `LATENT SOUNDNESS 70%` right-aligned.
  - Board: existing PerspectiveBoard, height ~400px at this scale, camera controls top-right, hint line bottom-left.
  - **Fleet strip** under board: `grid-template-columns: 1fr 1fr 1fr 300px`, gap 10px. Each unit card: 52px portrait (unit art, 1px border `#304955`), name 12.5px 700, `<CAL>% CAL` gold mono right, meta line 10px `#708792` ("R3 · reactor 2 · 2 UAP · Mobile"), then one inline row: allocation pill `2 × 60%` (editable volume/density), primary **Emit**, ghost **Hold**. Selected card: border + portrait border `#efc96c`, bg `#101c23`. UAP breakdown (BASE n / BATTERY +n / total) appears in a hover tooltip, not in the card. 4th column = CONTEXT INSPECTOR card (empty state: "Select an artifact").
  - **Dock** (in-flow, border `#3c5967`, bg `rgba(10,20,28,.96)`): phase kicker cyan, headline 13px ("Your intent · 2 Attention"), rule text 10.5px; actions right ("Overclock · −1 Seize" ghost, "End Command" primary). All buttons `white-space: nowrap`.

### Frame 2a — Kinetic phase (same regions)
- Stepper: Kinetic current, later stages upcoming. Left rail phase reads "Kinetic"; NOW shows kinetic copy + REGISTER RECAP; ghost = `NEXT · ARTILLERY`.
- Context tray stays mounted: `PERSISTENT CONTEXT · 0` + "No pending artifacts yet — output decisions occur during Command."
- Fleet cards swap the allocation row for the **ordered plan**: numbered chips (`1 move 3,4`, `2 condense`; gold index), dashed "choose…" placeholder for unspent UAP, dashed `0 Explicit Hold` when empty; action buttons per chassis (Move/Condense/Clear; Move/Step-Up/Scan W1; Move/Uplink). Active tool gets gold border/text on `#292316`.
- Board shows dashed gold numbered destination markers for the selected unit's plan.
- Dock: `SIMULTANEOUS KINETIC` / "3 ordered actions · 2 of 3 unit plans complete" / "Resolve Kinetic" primary.

### Frame 2b — Resolution phase (same regions)
- All stages ✓ except Resolution current. Board `opacity: .85`, read-only. Progress ticks up (`1/12 ▲` cyan). Verified artifact chip and board token flip gold with ✓.
- Fleet cards read-only: decision state (`EMITTED` cyan / `HELD` gold) replaces controls; meta line summarizes what happened.
- Dock (gold border): `RESOLUTION · APPLIED ATOMICALLY`, recap "+1 Progress (line-1 accepted) · 0 Drift Detonations · Round 2 begins at Register", event line ("output / emitted — bravo:heavy-1 · output / held — alpha:heavy-1"), "Continue to Round 2" primary. Ghost = `NEXT · REGISTER · ROUND 2`.

## Interactions & Behavior
- Stepper ⓘ tooltip on hover and `:focus-visible` (keyboard accessible; content from `stageCopy`).
- Fleet-card UAP-breakdown tooltip on hover/focus of the card header.
- Phase transitions: regions never unmount. Contents cross-fade (~120ms ease, matching existing transition durations); wrong-phase controls get `opacity: .45` + disabled + caption; ghost panels update to the next stage.
- Selection: clicking a fleet card or its board token selects it (gold treatment both places, as today). Board cell clicks append moves during Kinetic (existing `handleCell` logic).
- Emit/Hold submit the existing `AttentionV4CommandIntent`s; End Command keeps the existing risk-check modal.
- All existing keyboard/ARIA behavior from `BattleCommandApp.tsx` (roving grid focus, `aria-pressed`, `role="status"`) carries over.

## State Management
No new server state. Reuses `BattleCommandV3View` projection, `plans`, `allocations`, `selection`, `uiScale`. New client-only state: which stepper tooltip is open (hover/focus), and selected fleet card (already exists as `selection`).

## Design Tokens (from `battle-command.css`)
- Colors: bg `#050a0f`, panel `#0b141d`/`rgba(8,17,24,.95)`, raised `#101d28`, line `#243746`, muted `#8093a3`, copy `#dbe8ee`, cyan `#66e4d4`, cyan-deep `#1d756f`, red `#ff786f`, gold `#efc96c`, blue `#7eb9e9`. Top bar `#071017`; tray bg `#081119`; dock bg `rgba(10,20,28,.96)` border `#3c5967`.
- Primary button: bg `#66e4d4`, border `#3dbeb1`, text `#071615`; ghost button: bg `#101b24`, border `#243746`, text `#dbe8ee`; 3px radius.
- Type: Inter (UI) + ui-monospace (kickers, metrics, IDs). Use the existing `--battle-type-*` scale; mock sizes above are the 100%-scale rendering. Kickers: 700, letter-spacing .11–.16em, uppercase.
- Spacing: 12px panel padding, 12px grid gap, 1px hairline dividers `rgba(36,55,70,.7)`.
- No border radius on panels (radius only on buttons, 3px).

## Assets
- `art/scout.webp`, `art/line.webp`, `art/heavy.webp` — unit portrait thumbnails from the game's art catalog (`data/art/release/thumb/`). In production these come from `/api/art/catalog` exactly as today (`unitArtFor`); the bundled files are stand-ins for the mock only.

## Files
- `Battle Command Redesign.dc.html` + `support.js` — open in a browser. Newest section (turn 2) at top: frames **2a** (Kinetic) and **2b** (Resolution); below it turn 1 with **1c** (Command phase, the chosen layout) plus two rejected alternatives (1a, 1b) for context. Two toggles ("showHover", "showGhost") control the pinned tooltip demos and ghost panels.
- The demo tooltips are rendered pinned-open and tagged "ON HOVER" — in production they only appear on hover/focus.
