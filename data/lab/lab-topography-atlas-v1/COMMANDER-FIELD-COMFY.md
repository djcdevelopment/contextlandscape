# Commander Field generative relief trial

The canonical Commander Field remains the exact 80 × 80 commander-by-doctrine grid. The optional relief layer is a visual aid only: it does not replace cell values, outcomes, labels, or provenance.

- Source height raster: `commander-field-height.png` (uplink attention generated, normalized across the 6,400-cell field).
- Source semantic raster: `commander-field-semantic-mask.png` (stable composition bands).
- Workflow: `config/lab-topography/commander-field-comfy-api.json`.
- Model: AM4 ComfyUI SD3.5 Large with the available triple text encoders.
- Fixed seeds: `2026081201` (height baseline), `2026081202` (higher-denoise relief trial).
- Webview asset: `/atlas/commander-field-relief-v1.png`, enabled with the **Rendered relief** toggle.

The generated raster is intentionally rendered beneath the exact data cells, so visual texture cannot be mistaken for a new measurement.
