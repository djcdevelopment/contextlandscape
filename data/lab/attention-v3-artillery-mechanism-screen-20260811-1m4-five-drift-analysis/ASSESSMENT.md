# Artillery mechanism screen assessment

Analysis hash: `sha256:6fe1e6be8f50db30a8be58b91b441a1934533fd97f0d8d168caebbcd0991340c`  
Manifest: `sha256:8b5427b07e236bcfe9654301f921da078dc64bb5cd0ff5a9884e4a32132d042c`  
Report: `sha256:cbac2d207082796c01f74dc0ac9ea5f98bb538aecfe6b4af2a8b7914db039c75`

## Result

The canonical 1,411,200-run screen completed all 42 mechanism variants, 8 mirrored matchups, and 10 doctrines under the five-drift rule.

The primary estimand is not unconditional loadout win rate: both players receive the same loadout, so that quantity is structurally pulled toward 50%. Instead, this assessment compares each firing doctrine against the movement-identical pass doctrine, then subtracts the same policy contrast in the no-ammo arm.

| Contrast | Matched cells | Score effect with 95% paired-cell interval |
|---|---:|---:|
| Flare-only doctrine, one-shot | 2,880 | 4.444 pp [3.812 pp, 5.075 pp] |
| Flare-only doctrine, reload | 2,880 | 5.519 pp [4.780 pp, 6.257 pp] |
| Chaff-only doctrine, one-shot | 1,920 | 0.000 pp [0.000 pp, 0.000 pp] |
| Chaff-only doctrine, reload | 1,920 | 0.000 pp [0.000 pp, 0.000 pp] |
| Combined arms, one-shot | 4,800 | 2.666 pp [2.287 pp, 3.046 pp] |
| Combined arms, reload | 4,800 | 3.311 pp [2.868 pp, 3.754 pp] |
| Combined arms, Chaff doctrines under reload | 1,920 | 1.162 pp [0.826 pp, 1.498 pp] |
| Reload increment, Flare-only | 2,880 | 1.075 pp [0.870 pp, 1.280 pp] |
| Reload increment, combined | 4,800 | 0.645 pp [0.521 pp, 0.769 pp] |

Best solo-reload doctrine: **v3-flare-far-objective**, 6.647 pp [5.378 pp, 7.915 pp].  
Weakest solo-reload doctrine: **v3-flare-density**, 3.950 pp [2.848 pp, 5.052 pp].

## Mechanical evidence

- 1,231,503 shells fired from 1,231,503 declarations.
- 641,149 reload events.
- 3,897,426 extra artifacts causally attributed to Flares.
- 543,033 added unsound accepts and 71,674 induced drift defeats.
- 44,878 UAP rejections; every one is `destination_conflict`, so the telemetry quality gate passes.
- Chaff-only arms fired zero shells: defensive Chaff requires a hostile Flare, so the solo Chaff treatment is a confirmed reachability null. Chaff efficacy is identified only in the combined-arms variants.

## Desperation Artillery / Hail Mary verdict

**Not identifiable from either of the last two large runs.** The requested HE/Artifact Exploder and EMP/Smoke actions do not exist in those campaigns. Their summary traces also lack action-time progress for both players, exact unverified-artifact count, win probability, same-round drift linkage, and next-turn progress delta. Consequently the requested cohort table contains N/A rather than fabricated estimates.

The closest supported result is the Flare/Chaff mechanism contrast above. It answers whether available artillery improves an artillery doctrine relative to its pass control; it does **not** establish that a Hail Mary action is optimal from a severe deficit.

See `DESPERATION-HYPOTHESIS-AUDIT.md` for the field-by-field audit and the randomized branch design needed to test the hypothesis cleanly.

## Evidence boundary

- The mechanism contrasts use exact no-ammo and movement-identical policy controls under common campaign factors.
- Because artillery supply is symmetric, unconditional loadout win rates are not used as an efficacy estimand.
- The Hail Mary hypothesis is not identified: its state variables, actions, and immediate outcomes were not recorded or implemented.
