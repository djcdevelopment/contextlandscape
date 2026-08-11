# Archived attention-v2 corrected campaign

This portable evidence bundle contains the complete causal chain for the corrected commander-landscape screen:

- the 32,768-run compiler/behavior probe at `data/lab/attention-v2-probe-285268036f1a53890bb33e1d`;
- the 256,000-run mechanic and replay audit at `data/lab/attention-v2-audit-7a29d6caab84785026db10fe`;
- the immutable 9,216,000-run enriched matrix at `data/lab/attention-v2-landscape-standard-957a7ac539e236a0f1387946`;
- the compact assessment, charts, and next-campaign plan at `data/lab/attention-v2-corrected-shape-screen-analysis`.

Evidence identifiers:

- Plan: `attention-v2-landscape-standard-957a7ac539e236a0f1387946`
- Plan hash: `sha256:c10c3bec48175b897947618a818105f7c5a4dda41d586510afe2872cac25c542`
- Completion report: `sha256:9ae18a15408a2ec6272a18efba74d1b64d03b570e605b6d81a3cd10a83702769`
- Analysis: `sha256:9e92787ff92b804fb7facc67b46ad9a9b877a5e8ef569ec3070bc9a52322cb9b`
- Probe report: `sha256:89babb1eb4cd5614ca76662e6971b5591f74028608828dcb46fe60d5dd7096df`
- Audit report: `sha256:37776820c602f99469e1396ea30c6942be4a541a0885da040e65006e81fd40bd`
- Corrected screen runs: 9216000
- Provisional next-stage rows: 22, 8, 25, 1, 29, 15
- Next-stage selection eligible: yes
- Final survivor promotion eligible: no

The raw shards and preflight streams are already gzip JSONL, so the outer ZIP primarily provides portability, provenance, and one restore target rather than dramatic additional compression.

Restore from the repository root:

```powershell
tar -xf data/archives/attention-v2-landscape-standard-957a7ac539e236a0f1387946-corrected-evidence.zip
```

After restoration, compare every file against `archive-manifest.json`. The six candidates are inputs to the planned causal-refinement campaign; they are not promoted survivors until multi-sample, holdout, and v1 regression gates pass.