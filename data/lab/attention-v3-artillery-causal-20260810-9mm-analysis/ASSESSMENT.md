# Artillery-first five-drift campaign assessment

Analysis hash: `sha256:f8e8992a16d7d5bc5d039a4f599edd1939bd3514799b7403b3d7d20b5eea003c`  
Manifest: `sha256:ce51977c9efdd8491bc855fbcaca6a63727cac3a87c2b140d09eac343505b1d0`  
Report: `sha256:c54b9fed1e59f24ae090ab8487977d673e339c831717c499771170af21ad8059`

## Result

The complete 9,216,000-run campaign records what artillery was considered, why it fired or passed, where it was aimed, and whether the engine fired, blocked, or established it.

- Considered 15,122,096 artillery phases; declared 2,734,611 shells and fired 2,734,611.
- Established 1,640,709 Flares; Chaff blocked 202,491 hostile shells.
- Matched Stage C minus Stage B score effect: -0.185 percentage points (cell distribution p10 -12.81, median 0.00, p90 12.03).
- Drift 4 was survived for 2,242,952 completed rounds; 4,759,418 player outcomes crossed the five-drift defeat boundary.

## Evidence boundary

- Stage C versus Stage B contrasts are supported by matched factors and common world streams.
- Policy rankings remain conditional on the preregistered scenarios, compositions, doctrines, and five-drift ruleset.
- Four-drift historical campaigns are descriptive comparators, not members of this causal contrast.

## Why artillery fired or passed

- doctrine-pass: 7,652,968
- shell-unavailable: 2,406,631
- exposure-below-trigger: 1,315,051
- hostile-flare-unavailable: 1,012,835
- hostile-flare-available: 614,400

The five most-used target bases were:

- none: 12,387,485
- own-formation-screen: 614,400
- enemy-formation-cluster: 614,400
- enemy-artifact-density: 614,400
- far-enemy-objective: 614,400

## Stage C policy landscape

1. v3-flare-far-objective: 54.73%
2. v3-flare-cluster: 54.02%
3. v3-flare-density: 52.78%
4. v3-chaff-screen: 51.20%
5. v3-line-support-pass: 51.18%

## Where artillery helps or hurts

By scenario:

- escort-corridor: 0.085 pp (2,400 matched cells)
- shifting-front: -0.147 pp (2,400 matched cells)
- flare-pocket: -0.316 pp (2,400 matched cells)
- static-front: -0.362 pp (2,400 matched cells)

By Player-1 doctrine:

- v3-flare-far-objective: 3.299 pp
- v3-flare-cluster: 2.587 pp
- v3-flare-density: 1.348 pp
- v3-control-accept-pass: -0.113 pp
- v3-chaff-screen: -0.235 pp
- v3-adaptive-artillery: -1.223 pp
- v3-scout-recon-pass: -1.315 pp
- v3-siege-uplink-range-pass: -1.964 pp
- v3-line-support-pass: -2.060 pp
- v3-baseline-move-verify-pass: -2.173 pp

## UAP quality-gate qualification

The automatic gate found 39,934 rejected plans out of 135,737,598 accepted-or-rejected resolutions (0.0294%). All were localized to the `flare-pocket` spatial matchup; seat 1 and seat 2 each contributed 19,967, and scout-homogeneous and siege-homogeneous compositions were equally represented.

This does **not** invalidate artifact integrity or the preregistered artillery contrast. It does mean that UAP-sensitive interpretation is qualified: the aggregate artifact does not retain rejection reason codes, so the evidence supports localization and symmetry but cannot distinguish malformed plans from legitimate simultaneous occupancy conflicts.
