# Archived attention-v2 shape screen

This archive contains the immutable raw matrix at `data/lab/attention-v2-landscape-standard-6d06365b0ff689e8ec24f773` and its compact forensic analysis at `data/lab/attention-v2-shape-screen-analysis`.

- Plan: `attention-v2-landscape-standard-6d06365b0ff689e8ec24f773`
- Completion report: `sha256:a1abf203542a7cd942bc545933100d464e2aec1874ae171071b2b3cc8e8258b1`
- Analysis: `sha256:e5963f1257972b145ee5d70994384f02bfc4f9f7f7e297ba3cc829931cb46d05`
- Runs: 9216000
- Selection eligible: no

The raw shards are already gzip JSONL. The outer ZIP is a portable container and may not materially reduce their size.

Restore from the repository root:

```powershell
tar -xf data/archives/attention-v2-landscape-standard-6d06365b0ff689e8ec24f773-integrity-only.zip
```

After restoration, rerun `scripts/archive-lab-result.ps1` without deleting sources or compare every restored file with `archive-manifest.json`. Do not use this dataset for commander or survivor selection; see `ASSESSMENT.md`.