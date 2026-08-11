# Attention v3 Stage-C3 ruleset-aware spatial holdout

Status: **FROZEN FOR EXECUTION**  
Parent evidence: `attention-v3-stage-c2-2ec219830f0af361`  
Parent report hash: `sha256:93d5e5c3caa2411e3e9c30570d44cbc9d88af6d866d7cd09eab9643879ac50ea`

## Why this campaign exists

Stage C2 proved that its round-one public-risk index was only `3 + low-confidence count`:
drift was always zero and overload was always three at the artillery decision. Threshold 6 led
the pooled holdout but failed the frozen cell-safety gate. A second scalar threshold over the
same information would not isolate the failure.

Objective coupling is a public scenario rule. Artifact positions, source units,
`objectiveEligible`, and reported confidence are public projection fields. Latent soundness,
artifact truth, experiment pressure IDs, soundness-rate parameters, focal seat, and split
membership remain forbidden policy inputs.

## Candidate policy contract

The policy branches first on command doctrine:

- `confidence-threshold`: hold and preserve Chaff;
- `local-verify` plus public `global` objective coupling: fire centered same-phase Chaff;
- `local-verify` plus public `binary-front` coupling: preserve Chaff, peel the Scout, and use
  Line Support Scan whenever legal;
- `local-verify` plus public `distance-weighted-front` coupling: apply the selected public
  spatial-confidence rule, firing Chaff when it is true and using Scout peel plus Support Scan
  when it is false.

The distance-weighted candidate family is frozen as:

- low-confidence total count at least `n`, `n in {1,2,3,4,5,6}`;
- low-confidence objective-eligible count at least `n`, `n in {1,2,3,4,5,6}`;
- low-confidence Scout-source count at least `n`, `n in {1,2,3}`;
- objective-eligible confidence deficit at least `q`, `q in {0.2,0.4,0.6,0.8,1.0}`;
- Scout-source confidence deficit at least `q`, `q in {0.2,0.4,0.6,0.8,1.0}`.

Low confidence means reported confidence below 0.50. Confidence deficit is
`sum(max(0, 0.50 - reportedConfidence))` over the named public artifact subset. There are 25
candidate rules. No candidate reads the experiment pressure ID.

## Selection without candidate simulation inflation

Training executes three static arms on every common world: hold, Scout peel plus Support Scan,
and always-Chaff. Each candidate's decision is evaluated from the public round-one projection,
then receives the outcome of the corresponding common-world static arm. This counterfactual
lookup is exact because every candidate action is one of those three complete policies.

Rank candidates using training only:

1. highest minimum local-verification score across the four pressure samples;
2. highest pooled local-verification score;
3. highest minimum distance-weighted pressure score;
4. lowest distance-weighted Chaff activation rate;
5. lexical candidate ID.

After selection, execute the selected candidate as a real controller on the untouched holdout
alongside all three static arms. Its final metrics must exactly equal the static branch chosen
from the same common world.

## Matrix and execution count

- Four Stage-C pressure samples and both command doctrines.
- Both focal seats and the balanced composition.
- One round-one hostile Flare at the focal cluster; pass-capacity; fixed public hands; no reload.
- Training seeds: 202000 through 202063 (64 seeds).
- Holdout seeds: 202064 through 202095 (32 untouched seeds).
- Training: 1,024 common worlds x 3 simulated arms = 3,072 matches.
- Offline selection: 25,600 candidate-world decisions, adding no simulated matches.
- Holdout: 512 untouched common worlds x 4 simulated arms = 2,048 matches.
- Total: 5,120 matches plus 56 exact replay sentinels.

## Conformance gates

1. Exact train/holdout counts, common stream within every block, and zero replay mismatch.
2. Zero rejected UAP plans or legal artillery declarations; fixed hands and no reload.
3. Public features are identical across all static arms before their response.
4. The selected candidate and all tie-break evidence reproduce from training aggregates only.
5. Confidence-threshold behavior is exactly hold; global/local is exactly Chaff;
   binary-front/local is exactly Scout peel plus Support Scan.
6. The selected distance rule activates both Chaff and peel branches in training and holdout.
7. Every actual adaptive holdout result has exact metric parity with its selected static branch.

## Holdout promotion gates

The candidate advances only to a larger bounded audit if:

1. pooled holdout score is at least the best pooled static control;
2. every pressure x doctrine cell is within 0.05 score of that cell's best static control;
3. both focal seats are within 0.05 score of their better static control;
4. both distance-weighted local-verification samples are within 0.05 of their best static
   controls.

Failure rejects the candidate policy, not spatial spawning, Support Scan, Flare, or Chaff.

## Outputs

- `data/experiments/attention-v3-stage-c3-ruleset-spatial-holdout/PLAN.json`
- `data/experiments/attention-v3-stage-c3-ruleset-spatial-holdout/report.json`
- `data/experiments/attention-v3-stage-c3-ruleset-spatial-holdout/ASSESSMENT.md`
- `data/experiments/attention-v3-stage-c3-ruleset-spatial-holdout/candidate-frontier.svg`
- `data/experiments/attention-v3-stage-c3-ruleset-spatial-holdout/holdout-cells.svg`
