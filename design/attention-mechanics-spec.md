# Systems Design & Simulation Specification
## Project: Attention-Economy Command Engine Enhancements

This specification details the structural, mathematical, and algorithmic requirements for extending the **attention-economy command engine** of *Orchestrating Attention*. It introduces a unified spatial layer, specialized chassis-specific "stationary trade-offs," and a shared, Fibonacci-scaled macro capacity economy.

The primary target of this specification is a **builder agent** tasked with implementing these mechanics in the simulation engine (`packages/engine/src/command.ts`) and testing them in the validation suite (`apps/simulator/src/command-policies.test.ts`).

---

## 1. Architectural Context & Design Rationale

### 1.1 Baseline System Architecture
The core engine models cognitive orchestration under a strict bottleneck:
*   **Default Turn Budget**: 3 attention per round [8].
*   **The Scoring Matrix**: Matches are won at 12 progress, and lost immediately if accumulated "drift" reaches 4 [8].
*   **Action Resolution**: Unresolved artifacts auto-accept at round end, creating the central tension: *"What do I leave unseen?"* [10, 11].
*   **Soundness Baseline**: All artifacts share an underlying 70% probability of being sound (producing progress), and 30% of being unsound (producing drift) [8, 9].

### 1.2 Target Weaknesses
The current attention mechanic successfully introduces decision tension, but suffers from two critical vulnerabilities:
1.  **Composition Invariance**: The "verify-lowest-confidence" strategy is globally dominant [12]. Fleet composition alters difficulty and volume, but never shifts the optimal playstyle [12].
2.  **Lack of Spatial Integration**: The original engine's tactical map is purely metaphorical, and units have no spatial coordinate behavior [7].
3.  **Under-Utilized Verbs**: The `reject` action is rarely leveraged strategically, and the `seize` verb cannot compete effectively with cheap verification [13].

---

## 2. Core Mechanics Specification

### 2.1 Spatial Layer and Free Movement
To convert the metaphorical layout into a tactile tactical arena, we introduce a **Coordinate Grid** (e.g., a standard $10 \times 10$ board). Each chassis receives a baseline of **Free Movement** that does not consume the limited 3-attention budget:

| Chassis Type | Baseline Artifacts / Round | Seize Attention Cost | Default Calibration | **Free Movement Range / Turn** |
| :--- | :---: | :---: | :---: | :---: |
| **Scout** | 3 | 1 | 0.2 | **3 Tiles** |
| **Line** | 2 | 2 | 0.6 | **2 Tiles** |
| **Heavy (Siege)** | 1 | 3 | 0.9 | **1 Tile** |

*   **Rule**: Movement can be performed diagonally and orthogonally. It does not cost attention or energy.
*   **Tactical Purpose**: Spatial coordinates dictate unit interactions, line-of-sight for target locks, and area-of-effect targets.

---

### 2.2 Stationary vs. Mobility Mechanics ("Stationary Trade-offs")
To force composition-specific playstyles, we introduce high-value rewards and corresponding penalties when a unit chooses **not to move** during a round.

```
                  ┌──────────────────────────────────────────┐
                  │          UNIT CHANNELS POSITION          │
                  └────────────────────┬─────────────────────┘
                                       │
                ┌──────────────────────┼──────────────────────┐
                ▼                      ▼                      ▼
         [ SCOUT CLASS ]         [ LINE CLASS ]        [ HEAVY CLASS ]
          Recon Lock             Target Lock           Command Uplink
                │                      │                      │
                ▼                      ▼                      ▼
         Boost Calibration      Generate Tokens       +1 attention/turn
          (0.2 ──► 0.8+)         (100% Soundness)     (Calibration -> "Shotgun")
```

#### 2.2.1 Scout: "Recon Lock" (Calibration Calibration)
*   **Activation Condition**: The Scout unit expends 0 of its 3 movement points in a round.
*   **Mechanical Effect**: For the next round, the Scout's confidence calibration is upgraded from its noisy baseline of **0.2 to 0.85** [8].
*   **Design Rationale**: By standing still, the Scout acts as a high-precision sensor. With a 0.85 calibration, the commander can safely use the free `reject` verb on low-confidence artifacts and allow high-confidence artifacts to auto-accept at round end, completely bypassing manual verification costs [9, 13].

#### 2.2.2 Line: "Target Lock" (Defensive Coordination)
*   **Activation Condition**: The Line unit expends 0 of its 2 movement points in a round.
*   **Mechanical Effect**: The Line unit generates **1 Target Lock token**. If the unit remains stationary for **3 consecutive turns**, it is awarded a windfall of **2 Target Lock tokens**.
*   **Consumption**: A Target Lock token can be expended (free action) to "assist" another unit’s output (e.g., a noisy Scout artifact).
*   **Result**: The targeted unverified artifact's soundness is instantly forced to **100% sound**, completely eliminating the 30% drift hazard and guaranteeing progress on turn resolution without requiring a manual verification check.

#### 2.2.3 Heavy: "Command Uplink" (Attention Scaling)
*   **Activation Condition**: The Heavy unit expends 0 of its 1 movement point in a round.
*   **Mechanical Effect**: The commander's attention budget for the subsequent turn increases by **+1** (e.g., from 3 to 4) [8].
*   **The Trade-off Penalty ("Shotgun Calibration")**: Because the Heavy is locked down and not moving toward active, fluid fronts, its default high precision (0.9 calibration) is degraded into **"shotgun noise" (drops to 0.2 calibration)** [8].
*   **Strategic Sync**: While the Heavy's own output becomes noisy and unreliable, the extra attention point permits the commander to run a larger macro economy or directly use the `seize` verb (cost 3 attention) to guarantee progression, bypassing the shotgun noise entirely [8, 9].

---

## 3. Scale-Capacity Upgrades (The Shared Macro-Economy)

### 3.1 The Shared Fibonacci Track
To model the modern competitive dynamics of "fast following," capacity scaling is moved to a shared, globally visible upgrade track. Players (or AI agents) bid or invest attention to unlock capacity.

The capacity milestones scale according to a modified Fibonacci sequence to represent the compounding cost of research offset by the ease of following:

```
Track Position:    [1]    [2]    [3]    [4]     [5]
Attention Cost:     1      2      3      5       8
Capacity Award:    +1     +1     +3     +5      +8
```

*   **Fast-Follower Rule**: When Player A purchases an upgrade slot, the remaining slots shift in cost. If Player B delays investment but lets Player A pioneer the early steps (paying the R&D latency), Player B can secure subsequent massive capacity jumps (e.g., +3, +5 attention limits) at a reduced proportional cost relative to the progress achieved.

---

### 3.2 Scale-Scope Tactical Abilities
Unlocking ranks on the capacity track grants access to powerful, limited-use "Scale-Scope" maneuvers that break core attention laws:

#### Milestone 1: "Perfect Focus" (Utility)
*   **Cooldown**: Once every 3 turns.
*   **Mechanical Effect**: Select one unverified artifact. Instantly guarantee **100% accuracy** (soundness) on its resolution. This bypasses the need for verification or seize attention costs [8, 9].

#### Milestone 2: "Overclock" (Macro Burst)
*   **Cooldown**: One-time token use per match.
*   **Mechanical Effect**: Reduces the attention cost of the `seize` action for all chassis by **-1 attention** for 1 turn (Scout: 0 attention, Line: 1 attention, Heavy: 2 attention) [8].
*   **Strategic Sync**: Allows a Siege/Heavy-heavy fleet to execute a massive, multi-unit progress push in a single round without risking drift.

#### Milestone 3: "Macro Flare" (Spatial AoE)
*   **Cooldown**: One-time token use per match.
*   **Mechanical Effect**: Deploys a $3 \times 3$ grid zone for **2 rounds**. All units (allied and enemy) located within this zone double their artifact output per round (Scout: 6, Line: 4, Heavy: 2) [8].
*   **The Drift Trap (Offensive Utility)**: Since unverified work is automatically accepted at round end and unsound work generates drift, forcing a 3x3 Macro Flare on an enemy fleet floods their attention budget [10, 11]. If they lack the attention to verify or reject this sudden influx, they are pushed past the 4-drift defeat threshold [8].

---

## 4. Phase Execution Model
Every game round must process state transformations in the following precise sequence:

```
┌────────────────────────────────────────────────────────┐
│                      START OF TURN                     │
│  Reset Attention Budget (Apply Uplinks & Capacity)    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                     MOVEMENT PHASE                     │
│  Units move (0 to Max Range). Check Stationary Status  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                 COMMANDER ATTENTION PHASE              │
│  Spend Attention: verify, accept, reject, seize        │
│  Deploy Target Locks, Perfect Focus, or Macro Flares   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                   ROUND-END RESOLUTION                 │
│  Auto-accept unresolved artifacts                      │
│  Apply output multipliers (Macro Flares)               │
│  Process Soundness (Target Locks force 100%)           │
│  Calculate Progress & Drift. Check Victory/Defeat      │
└────────────────────────────────────────────────────────┘
```

---

## 5. Simulation Objectives & Validation Benchmarks

When implementing these changes in `apps/simulator/src/command-policies.test.ts`, the simulation suite must validate the following behavioral outcomes to prove design success:

### Test Case 1: Breaking the "Verify-Lowest-Confidence" Monopoly
*   **Hypothesis**: Under the new rules, a Scout-heavy fleet utilizing "Recon Lock" and a Heavy-heavy fleet utilizing "Command Uplink + Seize" will achieve higher win rates using distinct, composition-optimized policies than they will using the default "verify-lowest-confidence" policy.
*   **Validation Metric**: Policy simulation win rate of specialized policies must exceed "verify-lowest-confidence" by $\ge 15\%$ on homogeneous fleets.

### Test Case 2: The Drift-Flooding Strategy
*   **Hypothesis**: Deploying the Macro Flare on a high-volume enemy fleet (e.g., Scouts) without sufficient attention depth will successfully induce immediate defeat via drift saturation ($>4$ drift) [8].
*   **Validation Metric**: Simulation demonstrates at least an 80% success rate in inducing enemy drift defeat when the opponent's attention-to-artifact ratio drops below $0.25$.

### Test Case 3: The Stationary Escort Loop
*   **Hypothesis**: A mixed fleet containing 1 Line and 2 Scouts will achieve optimal progress-to-drift ratios when the Line remains stationary (generating Target Locks) to shelter the mobile Scouts' high-drift output.
*   **Validation Metric**: Average drift accumulated per 12 progress points must drop below $1.5$ (compared to the baseline $>3.0$ in non-stationary play).

---
*Document prepared for Agentic Builder Handoff. All mathematical bounds are tuned to maintain grounding on the resource constraints of packages/engine/src/command.ts.*
