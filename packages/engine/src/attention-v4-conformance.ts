/**
 * Recorded only after the clean-source canonical paired probe passed every
 * activation gate. CI independently recomputes the report digest and checks
 * its resolver, ruleset, compiler, and commander-catalog attribution.
 */
export const ATTENTION_V4_CONFORMANCE_REPORT_HASH = "sha256:8ecb2fcc6c7a3292943e64582a30d98cbfdb1dea4a1de79b922401cf48d62b43" as const;
export const ATTENTION_V4_CANONICAL_MATCH_COUNT = 27_648 as const;

export function assertAttentionV4Activated(): void {
  if (!/^sha256:[0-9a-f]{64}$/.test(ATTENTION_V4_CONFORMANCE_REPORT_HASH) || /^sha256:0{64}$/.test(ATTENTION_V4_CONFORMANCE_REPORT_HASH) || ATTENTION_V4_CANONICAL_MATCH_COUNT !== 27_648) {
    throw new Error("attention_v4_conformance_gate_incomplete");
  }
}
