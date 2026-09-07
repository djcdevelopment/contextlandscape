// The recorded v4.2 landscape studies are historical evidence. Pin their original
// identity independently of current rules; each verifier also checks its full
// recorded report digest. They do not certify the current ruleset.
const identity = Object.freeze({
  rulesetVersion: "attention-economy-v4.2",
  rulesetHash: "sha256:654edb095f10854ae029ee90d06803c71fb819571483d5f39068f3693c199b19",
  resolverVersion: "attention-v4.2-resolver-1",
  compilerVersion: "attention-v4.2-commander-compiler-1",
  commanderCatalogHash: "sha256:239d4ca4942b72e51ab53a0ae035682737d0991929f3dae35451bff262121b6a"
});

export function assertAttentionV42EvidenceIdentity(report, fail) {
  for (const [field, expected] of Object.entries(identity)) {
    if (report[field] !== expected) fail("historical v4.2 " + field + " attribution drifted");
  }
}
