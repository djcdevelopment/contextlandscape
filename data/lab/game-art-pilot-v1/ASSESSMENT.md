# Context Landscape game-art pilot v1

## Outcome

The pilot completed all 120 planned renders: 10 evidence-backed subjects × 3 art directions × 3 Q8 seeds, plus one same-seed bf16 comparison for every subject/direction cell. All 120 images, thumbnails, and provenance sidecars passed manifest verification. All 120 also received aesthetic, prompt-CLIP, embedding, and VLM-judge records on OMEN.

This is a successful look-development experiment, not yet a production-asset approval. The three directions are visually distinct and several outputs are strong concept plates, but a stratified human review found semantic and no-text failures that the automated judge did not catch.

## What was run

| Dimension | Coverage |
| --- | ---: |
| Subjects | 10 |
| Subject classes | mech, ability, artillery, battlefield, commander |
| Art directions | 3 |
| Q8 outputs | 90 |
| Full-bf16 outputs | 30 |
| Matched Q8/bf16 pairs | 30 |
| Fully scored and VLM-judged | 120 |

The source registry is [`config/game-art/registry-v1.json`](../../../config/game-art/registry-v1.json). Subjects cite the gameplay or laboratory evidence that motivated them, including the scenario catalog, attention mechanics, corrected commander screen, and Desperation Artillery assessment. The deterministic manifest hash is `sha256:e816d0ac87d41df04958794b01b5941b30fa93fe01b103145dae99231e204859`.

## Main findings

### 1. Art direction matters much more than precision lane

Command-table painterly led aesthetic score at 6.481. Signal-graphic retrofuture led prompt CLIP at 0.293 and VLM merch appeal at 61.9. Tactical-industrial landed between them on aesthetics while producing the clearest hard-surface silhouettes.

These directions are not interchangeable:

- command-table painterly is the strongest environment, campaign-plate, and narrative-portrait starting point;
- signal-graphic retrofuture is the clearest card/poster language and aligned most strongly with its prompt tokens;
- tactical-industrial is the best chassis/reference-sheet language, though it often looks like isolated product concept art.

See [art-direction scorecard](01-art-direction-scorecard.svg).

### 2. Full bf16 did not yield a credible quality improvement

Across 30 subject/direction/seed-matched pairs, bf16 minus Q8 was:

| Metric | Mean delta | 95% paired CI | bf16 higher |
| --- | ---: | ---: | ---: |
| Aesthetic | +0.015 | −0.027 to +0.058 | 56.7% |
| Prompt CLIP | −0.003 | −0.010 to +0.004 | 50.0% |
| Render time | −6.3 s | −13.1 to +0.5 s | 6.7% |

Both quality intervals cross zero and the effects are tiny. There is no evidence here that bf16 is the better default look-development lane. Q8 should remain the broad exploration lane; bf16 should be reserved for selected finals or subjects where human review identifies a specific improvement.

Warm bf16 renders were about 22 seconds while alternating Q8 renders were about 33 seconds, but this is not a controlled model-speed benchmark: the bf16 model remained split and resident across both B70s, Q8 alternated two independent endpoints, and cold-load outliers affect both summaries.

See [quality-lane comparison](03-quality-lane-comparison.svg).

### 3. Asset family predicts usefulness

Battlefields scored highest aesthetically (6.534), followed by commanders (6.385). Mechs led the VLM's originality (77.5) and merch-appeal (72.4) subscores. Desperation HE artillery was the weakest family on VLM originality (51.7) and merch appeal (35.8).

The score pattern matches the human review only in broad strokes. Environments are immediately attractive, and mech silhouettes are usable references. Artillery and abilities need clearer action grammar before they are reliable cards or gameplay communication.

See [asset-family scorecard](02-asset-family-scorecard.svg).

### 4. Automated perception is useful for ranking, not acceptance

The VLM returned `bazaar` for all 120 images and marked `generic_ai_stock_feel` on all 120. It marked zero garbled-text defects, even though the human review found obvious pseudo-labels, signatures, and glyph strings. Its verdict is therefore collapsed for this campaign, and its defect flags cannot enforce the no-text invariant.

Aesthetic and prompt-CLIP scores still help order a gallery, but production acceptance needs a game-specific human or machine rubric.

## Human semantic review

A 12-image stratified spot-check covered all three directions, both quality lanes, and all five subject classes. It found:

- strong, readable style separation across the three directions;
- solid mech materials and silhouettes, but repeated failure to preserve the scout's three-legged anatomy;
- pseudo-text and invented insignia even with explicit no-text/no-logo prompt clauses;
- attractive battlefields that reduce Context Furnace and Documentation Fortress to generic industrial/fortress scenery instead of preserving their lane and information-architecture meanings;
- commander portraits that read as generic military leaders without reliably encoding their evidence-backed mech composition and doctrine;
- Desperation HE images that often communicate explosion or ordnance but lose the 10×10 board, own-artifact targeting, forced resolution, and drift-risk story;
- ability images whose visual effect is attractive but not consistently legible as a particular game mechanic.

The highest aesthetic image was a strong Documentation Fortress environment, but its visual success should not be confused with full semantic fidelity.

## Operational findings

AM4's two independent Q8 endpoints worked and produced balanced provenance totals (42 images from `:8188`, 48 from `:8189`). The first parallel thermal governor correctly entered cooldown at 90 °C, but lock reacquisition let one endpoint retain work and its hottest VRAM sensor reached 96 °C. The run was stopped at a resumable checkpoint, model allocations were unloaded, and the remaining Q8 work used strict endpoint alternation. That held the cards mostly in the 70s–mid-80s °C and completed without a watchdog trip.

The combined bf16 lane used B70 #1 for the full UNet and B70 #2 for encoders/VAE. A 10-second inter-image cooldown held the observed primary VRAM at or below about 90 °C. Both lanes passed their output verifier with no missing or mismatched artifacts.

The rendered image, thumbnail, and sidecar set occupies 18,671,285 bytes (about 17.8 MiB), or roughly 152 KiB per result. A reproducibility archive on AM4 contains 367 entries and is about 19 MiB:

```text
/home/derek/bench/context-landscape-pilot/context-landscape-lookdev-20260813-v1.tar.zst
sha256:3d9ee3491393b68f3c51f4b695c1299f94b57ee8d35d959bb44dc0e3b25cc23b
```

## Recommendation for v2

Keep all three directions as task-specific tools rather than choosing a single winner yet. Run the next, smaller semantic-fidelity screen with Q8 first:

1. Add explicit binary acceptance fields for anatomy, required spatial objects, mechanic legibility, and any rendered glyph/text.
2. Use silhouette or layout conditioning for three-legged scouts, 10×10 artillery boards, battlefield lanes, and commander formations.
3. Reframe commander prompts as doctrine scenes with visible accompanying mechs, not conventional desk portraits.
4. Treat generated lettering as a hard reject or remove it in a deliberate cleanup stage.
5. Promote only human-approved Q8 compositions to bf16, inpainting, or game-ready asset-family work.
6. Calibrate the VLM judge on accepted/rejected examples from this run before relying on its verdict or defect flags.

## Access and reproducibility

- Filtered gallery: <https://am4.tail8e749c.ts.net/gallery/?project=context-landscape&campaign=context-landscape-lookdev-20260813-v1>
- Structured request form: <https://am4.tail8e749c.ts.net/gallery/request.html>
- Discord request command: `/mechgen`
- Compact machine-readable results: [assessment.json](assessment.json)
- Deterministic builder: [`scripts/build-game-art-pilot.mjs`](../../../scripts/build-game-art-pilot.mjs)
- Output verifier: [`scripts/verify-game-art-results.py`](../../../scripts/verify-game-art-results.py)

The gallery is access-controlled with the existing AM4 credentials. AM4's Valheim server, world viewer, managed ComfyUI endpoint, bot intake, and OMEN perception schedule were restored after the campaign.
