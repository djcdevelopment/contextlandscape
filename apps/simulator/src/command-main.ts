import { comparePolicies, compositions } from "./command-policies.js";

const runsArg = process.argv.find((value) => value.startsWith("--runs="));
const runs = Math.max(1, Number(runsArg?.split("=")[1] ?? 200));

const results = comparePolicies(compositions, runs);

const width = Math.max(...results.map((entry) => entry.policy.length));
for (const label of Object.keys(compositions)) {
  console.log(`\n${label}  (${compositions[label].join(", ")})`);
  const rows = results.filter((entry) => entry.composition === label).sort((a, b) => b.winRate - a.winRate);
  for (const row of rows) {
    console.log(
      `  ${row.policy.padEnd(width)}  win=${row.winRate.toFixed(3)}  progress=${row.averageProgress.toFixed(2)}  drift=${row.averageDrift.toFixed(2)}`
    );
  }
  const baseline = rows.find((entry) => entry.policy === "accept-all")!;
  const best = rows[0];
  const edge = Number((best.winRate - baseline.winRate).toFixed(3));
  // The design only has a decision in it if paying attention beats ignoring everything.
  console.log(`  -> best over accept-all: ${best.policy} by ${edge >= 0 ? "+" : ""}${edge}`);
}

console.log(`\n${JSON.stringify({ runs, results }, null, 2)}`);
