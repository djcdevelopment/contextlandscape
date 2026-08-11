# Attention v3 Stage-C5 three-response disjoint-soundness holdout

Status: **FROZEN FOR EXECUTION**  
Parent audit: `attention-v3-stage-c4-6831dd0d5311ef5b`  
Parent report hash: `sha256:9be23296c0eafd9def6253e2f73fecd0c86afba5b4b998151727816f468d9cd6`

## Hypothesis

Stage C4 showed that hostile aim geometry was not the primary failure: the fixed response led
each aim aggregate. It failed because its local-verification branch could choose only one hard
action per coupling, while high-soundness cells sometimes favored holding and low-soundness
cells favored Chaff.

Stage C5 therefore tests a monotone three-response rule inside each public objective-coupling
regime. At the round-one decision, let `L` be the number of public pending artifacts with
reported confidence below 0.50:

- if `L <= holdMax`, hold;
- if `L >= chaffMin`, fire proactive centered Chaff;
- otherwise peel the Scout and use Line Support Scan whenever legal.

Under `confidence-threshold`, every candidate always holds. Under `local-verify`, the selected
threshold pair for the public objective-coupling rule is used. The branch function never
receives soundness rate, pressure ID, hostile aim mode, latent truth, focal seat, or split.

## Frozen candidate family and selector

For each of `binary-front`, `global`, and `distance-weighted-front`, independently evaluate all
17 pairs where:

- `holdMax in {0,1,2,3}`;
- `chaffMin in {2,3,4,5,6}`;
- `holdMax < chaffMin`.

A rule is selector-eligible only if hold, peel, and Chaff all execute in that coupling's
training worlds. Rank eligible rules using training only:

1. highest minimum score across that coupling's three training soundness samples, pooling aim;
2. highest minimum score across the three aim modes, pooling soundness;
3. highest pooled score;
4. lowest Chaff activation rate;
5. lowest peel activation rate;
6. lexical rule ID.

Training simulates hold, Scout peel plus Support Scan, and always-Chaff once per common world.
Every candidate receives the exact outcome of the static arm matching its public decision.
After the three coupling-specific rules are selected, the combined policy is executed as an
actual controller only on the untouched holdout.

## Split and hostile aim

Training soundness grid:

- binary: 0.45, 0.60, 0.85;
- global: 0.35, 0.55, 0.75;
- distance-weighted: 0.45, 0.65, 0.90.

Untouched holdout soundness grid, disjoint from training:

- binary: 0.35, 0.70, 0.95;
- global: 0.25, 0.65, 0.85;
- distance-weighted: 0.35, 0.75, 0.95.

Both splits cross the same frozen hostile aim modes from Stage C4: `cluster-center`,
`artifact-density`, and `far-objective`. Target selection uses public focal artifacts and the
same deterministic tie-breaks. Proactive Chaff remains centered on the focal formation and
cannot react to the simultaneous hostile declaration.

## Matrix and execution count

- Balanced composition, pass-capacity, one round-one hostile Flare, fixed hands, no reload.
- Training seeds: 404000 through 404015.
- Holdout seeds: 404016 through 404031.
- Training uses local verification only: 9 pressures x 3 aim modes x 16 seeds x 2 seats =
  864 common worlds x 3 static arms = 2,592 matches.
- Offline selection evaluates 17 rules in the relevant coupling for every training world:
  14,688 candidate-world decisions, adding no matches.
- Holdout: 9 disjoint pressures x 3 aim modes x 2 doctrines x 16 seeds x 2 seats =
  1,728 common worlds x 4 actual arms = 6,912 matches.
- Total: 9,504 matches plus 297 exact replay sentinels.

## Conformance gates

1. Exact train/holdout counts, common streams, and zero replay mismatch.
2. Zero UAP plan or artillery declaration rejections; fixed hands and no reload.
3. Public features and hostile target coordinates are identical across common-world arms.
4. Each selected coupling rule and its tie-break evidence reproduce from training only.
5. Each selected rule activates hold, peel, and Chaff during training and holdout.
6. The actual combined holdout controller maps every public world to the selected branch.
7. Every adaptive holdout result has exact metric parity with its selected static branch.
8. Both non-cluster aim modes place at least 10% of targets beyond the proactive Chaff screen.

## Holdout gates

The combined response advances only if:

1. pooled score is at least the best pooled static control;
2. every coupling x aim x doctrine aggregate is within 0.075 of its best static arm;
3. every disjoint pressure x doctrine aggregate is within 0.075 of its best static arm;
4. both seats are within 0.05 of their best static arm;
5. each hostile aim aggregate is within 0.075 of its best static arm;
6. each coupling's pooled local-verification aggregate is within 0.05 of its best static arm.

Failure rejects or limits the candidate. It does not invalidate spatial spawning, Support Scan,
Flare, or Chaff.

## Outputs

- `data/experiments/attention-v3-stage-c5-three-response-holdout/PLAN.json`
- `data/experiments/attention-v3-stage-c5-three-response-holdout/report.json`
- `data/experiments/attention-v3-stage-c5-three-response-holdout/ASSESSMENT.md`
- `data/experiments/attention-v3-stage-c5-three-response-holdout/selected-thresholds.svg`
- `data/experiments/attention-v3-stage-c5-three-response-holdout/holdout-atlas.svg`
