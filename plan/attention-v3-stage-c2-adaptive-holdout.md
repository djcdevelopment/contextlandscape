# Attention v3 Stage-C2 doctrine-aware adaptive holdout

Status: **FROZEN FOR EXECUTION**  
Parent evidence: `attention-v3-stage-c1-7b26766ed292281c`  
Parent report hash: `sha256:b6af622b1c9e312be0861f4ffd3513c2f5ad64d52f9b9c16ea814c6f2224e268`

## Candidate policy

The candidate branches first on the command doctrine, which is known to its own controller:

- under `confidence-threshold`, hold and preserve Chaff;
- under `local-verify`, compute the same public risk index used in Stage C1;
- if risk is at least threshold `t`, fire centered same-phase Chaff and hold;
- otherwise preserve Chaff, peel only the Scout out of the hostile Flare, and use Line Support
  Scan whenever a legal uncovered artifact exists.

No branch reads latent soundness, hidden artifact truth, experiment pressure labels, seat, or
holdout membership.

## Threshold candidates and selector

Candidate thresholds are frozen at `t ∈ {4, 5, 6, 7, 8}`.

Training uses 32 seeds. For each threshold, measure local-verification score separately in all
four pressure samples. Select the threshold with:

1. highest minimum pressure score;
2. then highest pooled local-verification score;
3. then lowest Chaff activation rate;
4. then lowest numeric threshold.

The selector receives training aggregates only. The chosen threshold is then run once on an
untouched 16-seed holdout alongside three static controls: hold, Scout peel + Support Scan, and
always-Chaff.

## Matrix and execution count

- Four Stage-C pressure samples and both command doctrines.
- Both focal seats and the balanced composition.
- One round-one hostile Flare at the focal cluster; pass-capacity; fixed public hands; no reload.
- Training: 512 common worlds × 8 arms = 4,096 matches.
- Holdout: 256 untouched common worlds × 4 arms = 1,024 matches.
- Total: 5,120 matches plus 96 exact replay sentinels.

## Conformance gates

1. Exact train/holdout counts, common stream within every block, and zero replay mismatch.
2. Zero rejected UAP plans or legal artillery declarations; fixed hands and no reload.
3. Every adaptive threshold is behaviorally identical to hold under confidence-threshold.
4. The selected threshold and its tie-break evidence are reproducible from training aggregates.
5. The selected policy activates both local-verification branches in training and holdout.

## Holdout promotion gates

The candidate is recommended for the next bounded audit only if:

1. its pooled holdout score is at least the best static control's pooled score;
2. within each pressure × doctrine cell, it trails that cell's best static control by no more
   than 0.05 score;
3. it remains within 0.05 of the better static control in both focal seats.

Failure rejects the candidate policy, not the underlying Stage-B/C mechanics.

## Outputs

- `data/experiments/attention-v3-stage-c2-adaptive-holdout/PLAN.json`
- `data/experiments/attention-v3-stage-c2-adaptive-holdout/report.json`
- `data/experiments/attention-v3-stage-c2-adaptive-holdout/ASSESSMENT.md`
- `data/experiments/attention-v3-stage-c2-adaptive-holdout/threshold-selection.svg`
- `data/experiments/attention-v3-stage-c2-adaptive-holdout/holdout-score.svg`

