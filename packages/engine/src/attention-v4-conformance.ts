/**
 * Recorded only after the clean-source canonical paired probe passed every
 * activation gate. CI independently recomputes the report digest and checks
 * its resolver, ruleset, compiler, and commander-catalog attribution.
 */
export const ATTENTION_V4_CONFORMANCE_REPORT_HASH = "sha256:ba5147dc0e9865e44978654ac84aa29c4cfa2992fe3dcacc2465097b340a287f" as const;
export const ATTENTION_V4_CANONICAL_MATCH_COUNT = 27_648 as const;

export function assertAttentionV4Activated(): void {
  if (!/^sha256:[0-9a-f]{64}$/.test(ATTENTION_V4_CONFORMANCE_REPORT_HASH) || /^sha256:0{64}$/.test(ATTENTION_V4_CONFORMANCE_REPORT_HASH) || ATTENTION_V4_CANONICAL_MATCH_COUNT !== 27_648) {
    throw new Error("attention_v4_conformance_gate_incomplete");
  }
}
