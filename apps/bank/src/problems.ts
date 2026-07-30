import { ProblemSchema, type Problem } from "./schemas.js";

// Hand-authored seed set: two per kind. These serve three jobs at once — grading fixtures for the
// offline tests, few-shot exemplars for generating the rest of the bank, and a sanity check that
// each answer shape is actually gradeable.
//
// Every one is designed so the naive reading and the correct reading differ. A problem both a 3B
// model and a frontier model answer identically carries no gameplay signal and would be thrown out
// by the admission gate anyway.
const seeds: Problem[] = [
  {
    problemId: "prb-detection-0001",
    kind: "detection",
    ability: "radar",
    difficulty: 2,
    task: "A request fans out through four services. Which service is actually holding the latency?",
    context: [
      "gateway  p99 820ms  (calls auth, then catalog)",
      "auth     p99  40ms  (leaf)",
      "catalog  p99 780ms  (calls pricing)",
      "pricing  p99 745ms  (leaf)"
    ],
    answerShape: "id",
    options: ["gateway", "auth", "catalog", "pricing"],
    groundTruth: "pricing",
    literalAnswer: "gateway",
    rationale:
      "gateway and catalog have the largest p99 values, but both are mostly blocked waiting on a downstream call. pricing is the leaf where the time is actually spent.",
    authoredBy: "human",
    bankVersion: 1
  },
  {
    problemId: "prb-detection-0002",
    kind: "detection",
    ability: "radar",
    difficulty: 3,
    task: "Which log line is the first cause rather than a downstream symptom?",
    context: [
      "l1  12:04:11  connection pool exhausted",
      "l2  12:04:09  upstream connection reset by peer",
      "l3  12:04:02  TLS handshake failed: certificate expired",
      "l4  12:04:15  health check failing"
    ],
    answerShape: "id",
    options: ["l1", "l2", "l3", "l4"],
    groundTruth: "l3",
    literalAnswer: "l1",
    rationale:
      "The lines are not printed in time order. l3 is earliest at 12:04:02, and an expired certificate explains the resets, the pool exhaustion, and the failing health check that follow it.",
    authoredBy: "human",
    bankVersion: 1
  },
  {
    problemId: "prb-diagnosis-0001",
    kind: "diagnosis",
    ability: "repair",
    difficulty: 2,
    task: "The connection pool is exhausted twenty minutes after a deploy. What is the cause?",
    context: [
      "pool max connections: 50 before deploy, 50 after deploy",
      "request rate: flat across the deploy window",
      "the deploy added a per-row lookup inside an existing result loop",
      "no schema migration ran"
    ],
    answerShape: "id",
    options: ["traffic-spike", "pool-size-reduced", "queries-per-request-increased", "database-restart"],
    groundTruth: "queries-per-request-increased",
    rationale:
      "Pool size and traffic are both unchanged, so demand per request must have risen. A per-row lookup inside a result loop is an N+1: each request now borrows far more connections than before.",
    authoredBy: "human",
    bankVersion: 1
  },
  {
    problemId: "prb-diagnosis-0002",
    kind: "diagnosis",
    ability: "repair",
    difficulty: 3,
    task: "One instance of three returns intermittent 500s. What is the cause?",
    context: [
      "all three instances run the same image digest and the same config",
      "load balancer distribution is even across the three",
      "failing responses log: JWT rejected, token not yet valid",
      "instance-c system clock is 4 minutes ahead of the other two"
    ],
    answerShape: "id",
    options: ["bad-image", "clock-skew", "load-imbalance", "expired-secret"],
    groundTruth: "clock-skew",
    rationale:
      "\"Not yet valid\" means the verifier believes the token's start time is in the future. A clock running 4 minutes fast rejects freshly issued tokens. Identical images and even load rule out the alternatives.",
    authoredBy: "human",
    bankVersion: 1
  },
  {
    problemId: "prb-verification-0001",
    kind: "verification",
    ability: "weapon",
    difficulty: 2,
    task: "Claim: the cache change caused the p99 improvement. Is the claim supported by the evidence alone?",
    context: [
      "p99 before change: 412ms",
      "p99 after change:  248ms",
      "request rate before change: 1,240 rps",
      "request rate after change:    500 rps"
    ],
    answerShape: "boolean",
    groundTruth: false,
    literalAnswer: true,
    rationale:
      "Load fell by roughly 60% across the same boundary, which alone would reduce p99. The evidence cannot separate the cache change from the traffic drop, so it does not support the causal claim.",
    authoredBy: "human",
    bankVersion: 1
  },
  {
    problemId: "prb-verification-0002",
    kind: "verification",
    ability: "weapon",
    difficulty: 3,
    task: "Claim: the rollback restored correctness. Is the claim supported by the evidence alone?",
    context: [
      "error rate: 0.02% before deploy, 4.1% after deploy, 0.02% after rollback",
      "request rate: unchanged across all three windows",
      "the failing assertion referenced a symbol introduced by the new build",
      "an unrelated nightly cron job failed once during the window"
    ],
    answerShape: "boolean",
    groundTruth: true,
    rationale:
      "The error rate tracks the deploy and the rollback while load stays constant, and the failure is tied to a code path that only exists in the new build. The cron failure is unrelated and does not weaken the inference.",
    authoredBy: "human",
    bankVersion: 1
  },
  {
    problemId: "prb-contract-0001",
    kind: "contract",
    ability: "build",
    difficulty: 2,
    task: "Which field does the consumer require that the producer never sends?",
    context: [
      "producer emits: { orderId, totalCents, currency, placedAt }",
      "consumer reads: { orderId, totalCents, currency, createdAt }"
    ],
    answerShape: "id",
    options: ["orderId", "totalCents", "currency", "createdAt"],
    groundTruth: "createdAt",
    rationale:
      "The producer's timestamp is named placedAt. The consumer reads createdAt, which is never sent, so it is always undefined regardless of the value the producer intended to convey.",
    authoredBy: "human",
    bankVersion: 1
  },
  {
    problemId: "prb-contract-0002",
    kind: "contract",
    ability: "build",
    difficulty: 3,
    task: "Which fields diverge between producer and consumer? List every one.",
    context: [
      "producer emits: id: string, amount: number (whole dollars), status: \"OPEN\" | \"CLOSED\"",
      "consumer reads: id: string, amount: integer (cents), status: \"open\" | \"closed\", region: string"
    ],
    answerShape: "ids",
    options: ["id", "amount", "status", "region"],
    groundTruth: ["amount", "region", "status"],
    rationale:
      "amount diverges by unit (dollars versus cents), status diverges by case, and region is required but never sent. Only id matches on both name and type.",
    authoredBy: "human",
    bankVersion: 1
  },
  {
    problemId: "prb-ordering-0001",
    kind: "ordering",
    ability: "deploy",
    difficulty: 2,
    task: "Put the release steps in the only safe order.",
    context: [
      "the migration is additive and must precede the code that reads the new column",
      "the flag must not be enabled before that code is deployed",
      "a backup must be taken before any schema change"
    ],
    answerShape: "permutation",
    options: ["run-migration", "deploy-code", "enable-feature-flag", "take-backup"],
    groundTruth: ["take-backup", "run-migration", "deploy-code", "enable-feature-flag"],
    rationale:
      "The three constraints chain into exactly one ordering: backup precedes the schema change, the migration precedes the code that depends on it, and the flag comes last.",
    authoredBy: "human",
    bankVersion: 1
  },
  {
    problemId: "prb-ordering-0002",
    kind: "ordering",
    ability: "deploy",
    difficulty: 3,
    task: "Put the canary rollout steps in the only safe order.",
    context: [
      "the canary cannot be verified before it is deployed",
      "traffic must not shift until verification has passed",
      "the old version cannot be drained until traffic has shifted",
      "the old version must not be retired while it still holds connections"
    ],
    answerShape: "permutation",
    options: ["retire-old", "shift-traffic", "deploy-canary", "drain-old", "verify-canary"],
    groundTruth: ["deploy-canary", "verify-canary", "shift-traffic", "drain-old", "retire-old"],
    literalAnswer: ["retire-old", "shift-traffic", "deploy-canary", "drain-old", "verify-canary"],
    rationale:
      "Each constraint pins one adjacent pair, and together they force a single chain. The options are deliberately listed out of order so the presented sequence is not the answer.",
    authoredBy: "human",
    bankVersion: 1
  },
  {
    problemId: "prb-constraint-0001",
    kind: "constraint",
    ability: "scan",
    difficulty: 3,
    task: "Which stage is the binding constraint on sustained throughput?",
    context: [
      "ingest  5,000/s",
      "parse   1,200/s  (single-threaded by design; cannot be parallelized)",
      "enrich    900/s  (horizontally scalable, currently under-provisioned)",
      "write   3,000/s"
    ],
    answerShape: "id",
    options: ["ingest", "parse", "enrich", "write"],
    groundTruth: "parse",
    literalAnswer: "enrich",
    rationale:
      "enrich is momentarily the slowest, but it can be scaled out, so it is a provisioning gap rather than a constraint. parse cannot be parallelized, so sustained throughput cannot exceed 1,200/s no matter what else is fixed.",
    authoredBy: "human",
    bankVersion: 1
  },
  {
    problemId: "prb-constraint-0002",
    kind: "constraint",
    ability: "scan",
    difficulty: 4,
    task: "After the change below, which stage is the binding constraint now?",
    context: [
      "parse was single-threaded at 1,200/s and has been replaced with a parallel implementation at 6,000/s",
      "enrich was under-provisioned at 900/s and is now fully provisioned at 4,000/s",
      "ingest 5,000/s and write 3,000/s are unchanged",
      "write is a single transactional endpoint and cannot be sharded"
    ],
    answerShape: "id",
    options: ["ingest", "parse", "enrich", "write"],
    groundTruth: "write",
    rationale:
      "Relieving the old bottleneck moved it. write is now the slowest stage at 3,000/s and, unlike the others, cannot be scaled, so it binds.",
    authoredBy: "human",
    bankVersion: 1
  }
];

/** Parsed at module load so an authoring mistake fails fast rather than at generation time. */
export const seedProblems: Problem[] = seeds.map((problem) => ProblemSchema.parse(problem));

export const seedProblemById = new Map(seedProblems.map((problem) => [problem.problemId, problem]));
