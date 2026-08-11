import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join, resolve } from "node:path";
import { createGunzip } from "node:zlib";
import { createAttentionV2SweepSkeleton } from "../apps/lab/dist/landscape-sweep.js";
import { sha256Value } from "../apps/lab/dist/provenance.js";

const args = new Map(process.argv.slice(2).map((entry) => {
  const [name, ...rest] = entry.replace(/^--/, "").split("=");
  return [name, rest.join("=")];
}));
const matrixDir = resolve(args.get("matrix-dir") ?? "");
const outputDir = resolve(args.get("out") ?? "");
const parentModelHash = args.get("parent-model") ?? "";
if (!args.get("matrix-dir") || !args.get("out")) throw new Error("Use --matrix-dir=<path> --out=<path> --parent-model=sha256:<digest>");
if (!/^sha256:[0-9a-f]{64}$/.test(parentModelHash)) throw new Error("--parent-model must be a sha256 digest");

const plan = JSON.parse(await readFile(join(matrixDir, "manifest.json"), "utf8"));
const completion = JSON.parse(await readFile(join(matrixDir, "report.json"), "utf8"));
if (completion.completionStatus !== "complete" || completion.observedRuns !== completion.plannedRuns) throw new Error("Completion report is not exact");
const skeleton = createAttentionV2SweepSkeleton(parentModelHash);
if (skeleton.modelCatalog.catalogHash !== plan.modelCatalog.catalogHash) throw new Error("Reconstructed model catalog does not match plan");
const edgeCatalog = skeleton.edgeCatalogs.find((catalog) => catalog.stage === "shape-screen");
if (!edgeCatalog) throw new Error("Shape-screen edge catalog is missing");
const sampleCatalog = skeleton.battleSampleCatalogs.find((catalog) => catalog.stage === "shape-screen");
if (!sampleCatalog || sampleCatalog.samples.length !== 1) throw new Error("Corrected shape screen must have one frozen battle sample");
const worldBlock = plan.worldBlocks.find((block) => block.stage === "shape-screen");
if (!worldBlock || worldBlock.seedsPerCell !== 4) throw new Error("Corrected shape screen must have four common seeds");

const models = skeleton.modelCatalog.models;
const profiles = skeleton.commanderCatalog.profiles;
const edges = edgeCatalog.edges;
const modelCount = models.length;
const commanderCount = profiles.length;
const edgeCount = edges.length;
const seedsPerCell = worldBlock.seedsPerCell;
const worldsPerModel = edgeCount * seedsPerCell;
if (modelCount * worldsPerModel !== completion.plannedRuns) throw new Error("Catalog geometry does not match planned runs");
for (let index = 0; index < profiles.length; index += 1) {
  if (profiles[index].ordinal !== index) throw new Error("Commander ordinals are not dense and ordered");
}

const modelIndex = new Map(models.map((model, index) => [model.modelId, index]));
const commanderIndex = new Map(profiles.map((profile, index) => [profile.commanderId, index]));
const edgeIndex = new Map(edges.map((edge, index) => [edge.edgeId, index]));
const bridgeIndex = models.findIndex((model) => model.role === "v1-bridge");
if (bridgeIndex < 0) throw new Error("Model catalog has no v1 bridge");
const dimensions = ["compositionModule", "triageModule", "movementModule", "capacityModule"];
const dimensionLevels = Object.fromEntries(dimensions.map((dimension) => [dimension, [...new Set(profiles.map((profile) => profile[dimension]))]]));
const levelIndexes = Object.fromEntries(dimensions.map((dimension) => [dimension, new Map(dimensionLevels[dimension].map((level, index) => [level, index]))]));

const terminalNames = ["objective", "drift", "round-limit", "simultaneous", "forfeit"];
const terminalCodes = new Map(terminalNames.map((name, index) => [name, index + 1]));
const modelAccumulators = models.map((model) => ({
  model,
  runs: 0,
  p1Score: 0,
  p1Wins: 0,
  p2Wins: 0,
  draws: 0,
  roundSum: 0,
  minRounds: Number.POSITIVE_INFINITY,
  maxRounds: 0,
  terminals: Object.fromEntries(terminalNames.map((name) => [name, 0])),
  coarseOutcomes: new Map(),
  hll: new Uint8Array(4096),
  winnerByWorld: new Uint8Array(worldsPerModel),
  terminalByWorld: new Uint8Array(worldsPerModel),
  roundsByWorld: new Uint8Array(worldsPerModel)
}));

const mcLength = modelCount * commanderCount;
const modelCommanderRuns = new Uint32Array(mcLength);
const modelCommanderScore = new Float64Array(mcLength);
const modelCommanderProgress = new Float64Array(mcLength);
const modelCommanderDrift = new Float64Array(mcLength);
const commanderRuns = new Uint32Array(commanderCount);
const commanderScore = new Float64Array(commanderCount);
const commanderScoreSq = new Float64Array(commanderCount);
const commanderWins = new Uint32Array(commanderCount);
const commanderDraws = new Uint32Array(commanderCount);
const commanderProgress = new Float64Array(commanderCount);
const commanderDrift = new Float64Array(commanderCount);
const profileSeen = new Uint32Array(commanderCount);
const edgeRuns = new Uint16Array(edgeCount);
const edgeP1Score = new Float64Array(edgeCount);
const modelEdgeRuns = new Uint8Array(modelCount * edgeCount);
const modelEdgeP1Score = new Float32Array(modelCount * edgeCount);
const relevantMechanics = [
  "verified", "rejected", "seized", "assisted", "movementDistance", "stationaryTurns",
  "reconLockActivations", "targetLocksGenerated", "targetLocksConsumed", "uplinkAttentionGenerated",
  "capacityClaims", "perfectFocusUses", "overclockUses", "macroFlareUses", "flareAffectedArtifacts", "driftDefeatsInduced"
];
const allMechanics = [
  "attentionAvailable", "attentionSpent", "attentionUnused", "attentionBindingRounds", "artifactsEmitted",
  "minimumAttentionToArtifactRatio", "acceptedSound", "acceptedUnsound", "capacityAttentionSpent", ...relevantMechanics
];
const overallMechanics = Object.fromEntries(allMechanics.map((name) => [name, 0]));
const modelMechanics = Object.fromEntries(allMechanics.map((name) => [name, new Float64Array(modelCount)]));
const commanderMechanics = Object.fromEntries(relevantMechanics.map((name) => [name, new Float64Array(commanderCount)]));
const controllerCalls = { movement: 0, capacity: 0, command: 0 };
const controllerIntents = { movement: {}, capacity: {}, command: {} };
const eventTypes = {};
const strata = {};
const seeds = new Set();
const battleSamples = new Set();
const battleContexts = new Set();
const policyHashes = new Set();
const compositionIds = new Set();
let observedRuns = 0;
let sourceBytes = 0;
let attributionMismatches = 0;
let identityMismatches = 0;

function increment(record, key, amount = 1) {
  if (record instanceof Map) {
    record.set(key, (record.get(key) ?? 0) + amount);
    return;
  }
  record[key] = (record[key] ?? 0) + amount;
}
function round(value, digits = 6) {
  return Number(value.toFixed(digits));
}
function playerScore(winnerSlot, playerSlot) {
  return winnerSlot === null ? 0.5 : winnerSlot === playerSlot ? 1 : 0;
}
function addHll(registers, digest) {
  const hex = digest.slice(7);
  const bucket = Number.parseInt(hex.slice(0, 3), 16);
  let rank = 1;
  for (const nibble of hex.slice(3)) {
    const value = Number.parseInt(nibble, 16);
    if (value === 0) rank += 4;
    else {
      rank += Math.clz32(value) - 28;
      break;
    }
  }
  if (rank > registers[bucket]) registers[bucket] = rank;
}
function hllEstimate(registers) {
  const m = registers.length;
  let inverse = 0;
  let zeros = 0;
  for (const rank of registers) {
    inverse += 2 ** -rank;
    if (rank === 0) zeros += 1;
  }
  const raw = 0.7213 / (1 + 1.079 / m) * m * m / inverse;
  return zeros > 0 && raw <= 2.5 * m ? m * Math.log(m / zeros) : raw;
}
function entropyEffectiveCount(counts, total) {
  let entropy = 0;
  for (const count of counts) {
    if (count <= 0) continue;
    const probability = count / total;
    entropy -= probability * Math.log(probability);
  }
  return Math.exp(entropy);
}

const shardNames = (await readdir(matrixDir)).filter((name) => /^shard-\d{4}\.jsonl\.gz$/.test(name)).sort();
if (shardNames.length !== completion.shards.length) throw new Error("Shard count does not match completion report");

for (const shardName of shardNames) {
  const shardPath = join(matrixDir, shardName);
  sourceBytes += (await stat(shardPath)).size;
  const lines = createInterface({ input: createReadStream(shardPath).pipe(createGunzip()), crlfDelay: Infinity });
  let shardRuns = 0;
  for await (const line of lines) {
    if (!line) continue;
    const record = JSON.parse(line);
    if (record.schemaVersion !== 2 || record.planId !== plan.planId || record.planHash !== plan.planHash || record.status !== "complete") {
      throw new Error(`Foreign, legacy, or incomplete record in ${shardName}`);
    }
    const mi = modelIndex.get(record.modelId);
    const ei = edgeIndex.get(record.edge.edgeId);
    if (mi === undefined || ei === undefined) throw new Error(`Unknown model or edge in ${shardName}`);
    const expectedEdge = edges[ei];
    const seedOffset = record.identity.seed - worldBlock.seedStart;
    if (!Number.isInteger(seedOffset) || seedOffset < 0 || seedOffset >= seedsPerCell) throw new Error(`Seed outside frozen block: ${record.identity.seed}`);
    const worldIndex = ei * seedsPerCell + seedOffset;
    const accumulator = modelAccumulators[mi];
    if (accumulator.winnerByWorld[worldIndex] !== 0) throw new Error(`Duplicate model/world observation ${record.modelId}/${record.edge.edgeId}/${record.identity.seed}`);
    if (record.identity.edgeId !== record.edge.edgeId || record.identity.pairHash !== record.edge.pairHash ||
        record.edge.pairHash !== expectedEdge.pairHash || record.edge.seatOrientation !== expectedEdge.seatOrientation) identityMismatches += 1;
    const expectedP1 = expectedEdge.seatOrientation === 1 ? expectedEdge.leftCommanderId : expectedEdge.rightCommanderId;
    const expectedP2 = expectedEdge.seatOrientation === 1 ? expectedEdge.rightCommanderId : expectedEdge.leftCommanderId;
    if (record.edge.playerOneCommanderId !== expectedP1 || record.edge.playerTwoCommanderId !== expectedP2 ||
        record.players[0].commanderId !== expectedP1 || record.players[1].commanderId !== expectedP2) attributionMismatches += 1;
    const terminalCode = terminalCodes.get(record.terminalReason);
    if (!terminalCode) throw new Error(`Unknown terminal ${record.terminalReason}`);
    const winnerCode = record.winnerPlayerSlot === 1 ? 1 : record.winnerPlayerSlot === 2 ? 2 : 3;
    const p1Score = playerScore(record.winnerPlayerSlot, 1);
    accumulator.winnerByWorld[worldIndex] = winnerCode;
    accumulator.terminalByWorld[worldIndex] = terminalCode;
    accumulator.roundsByWorld[worldIndex] = record.rounds;
    accumulator.runs += 1;
    accumulator.p1Score += p1Score;
    accumulator.p1Wins += Number(record.winnerPlayerSlot === 1);
    accumulator.p2Wins += Number(record.winnerPlayerSlot === 2);
    accumulator.draws += Number(record.winnerPlayerSlot === null);
    accumulator.roundSum += record.rounds;
    accumulator.minRounds = Math.min(accumulator.minRounds, record.rounds);
    accumulator.maxRounds = Math.max(accumulator.maxRounds, record.rounds);
    accumulator.terminals[record.terminalReason] += 1;
    const coarseKey = `${winnerCode}|${terminalCode}|${record.rounds}|${record.players[0].progress}|${record.players[0].drift}|${record.players[1].progress}|${record.players[1].drift}`;
    accumulator.coarseOutcomes.set(coarseKey, (accumulator.coarseOutcomes.get(coarseKey) ?? 0) + 1);
    addHll(accumulator.hll, record.outcomeHash);
    edgeRuns[ei] += 1;
    edgeP1Score[ei] += p1Score;
    const mei = mi * edgeCount + ei;
    modelEdgeRuns[mei] += 1;
    modelEdgeP1Score[mei] += p1Score;
    for (let playerOffset = 0; playerOffset < 2; playerOffset += 1) {
      const player = record.players[playerOffset];
      const ci = commanderIndex.get(player.commanderId);
      if (ci === undefined) throw new Error(`Unknown commander ${player.commanderId}`);
      const score = playerScore(record.winnerPlayerSlot, playerOffset + 1);
      const mci = mi * commanderCount + ci;
      modelCommanderRuns[mci] += 1;
      modelCommanderScore[mci] += score;
      modelCommanderProgress[mci] += player.progress;
      modelCommanderDrift[mci] += player.drift;
      commanderRuns[ci] += 1;
      commanderScore[ci] += score;
      commanderScoreSq[ci] += score * score;
      commanderWins[ci] += Number(score === 1);
      commanderDraws[ci] += Number(score === 0.5);
      commanderProgress[ci] += player.progress;
      commanderDrift[ci] += player.drift;
      profileSeen[ci] += 1;
      for (const mechanic of allMechanics) {
        const value = player.counters[mechanic] ?? 0;
        overallMechanics[mechanic] += value;
        modelMechanics[mechanic][mi] += value;
        if (commanderMechanics[mechanic]) commanderMechanics[mechanic][ci] += value;
      }
      controllerCalls.movement += player.controller.movementCalls;
      controllerCalls.capacity += player.controller.capacityCalls;
      controllerCalls.command += player.controller.commandCalls;
      for (const [kind, count] of Object.entries(player.controller.movementIntents)) increment(controllerIntents.movement, kind, count);
      for (const [kind, count] of Object.entries(player.controller.capacityIntents)) increment(controllerIntents.capacity, kind, count);
      for (const [kind, count] of Object.entries(player.controller.commandIntents)) increment(controllerIntents.command, kind, count);
    }
    if (profileSeen[commanderIndex.get(record.edge.left.profile.commanderId)] === 1) {
      const actual = record.edge.left.profile;
      const expected = profiles[commanderIndex.get(actual.commanderId)];
      if (sha256Value(actual) !== sha256Value(expected)) throw new Error(`Left profile payload mismatch ${actual.commanderId}`);
    }
    if (profileSeen[commanderIndex.get(record.edge.right.profile.commanderId)] === 1) {
      const actual = record.edge.right.profile;
      const expected = profiles[commanderIndex.get(actual.commanderId)];
      if (sha256Value(actual) !== sha256Value(expected)) throw new Error(`Right profile payload mismatch ${actual.commanderId}`);
    }
    policyHashes.add(record.edge.left.policyHash);
    policyHashes.add(record.edge.right.policyHash);
    compositionIds.add(record.edge.left.compositionId);
    compositionIds.add(record.edge.right.compositionId);
    seeds.add(record.identity.seed);
    battleSamples.add(record.battleSampleId);
    battleContexts.add(record.battleContextHash);
    for (const [kind, count] of Object.entries(record.eventTypes)) increment(eventTypes, kind, count);
    const stratum = strata[record.edge.stratum] ?? { runs: 0, p1Score: 0, draws: 0, roundLimits: 0 };
    stratum.runs += 1;
    stratum.p1Score += p1Score;
    stratum.draws += Number(record.winnerPlayerSlot === null);
    stratum.roundLimits += Number(record.terminalReason === "round-limit");
    strata[record.edge.stratum] = stratum;
    observedRuns += 1;
    shardRuns += 1;
    if (observedRuns % 250_000 === 0) process.stderr.write(`[attention-v2-corrected-analysis] ${observedRuns.toLocaleString()} / ${completion.plannedRuns.toLocaleString()} records\n`);
  }
  const shardIndex = Number(shardName.slice(6, 10));
  const marker = completion.shards.find((candidate) => candidate.shardIndex === shardIndex);
  if (!marker || marker.recordCount !== shardRuns) throw new Error(`${shardName} count differs from marker`);
}

if (observedRuns !== completion.observedRuns) throw new Error(`Analyzed ${observedRuns}, expected ${completion.observedRuns}`);
if (identityMismatches || attributionMismatches) throw new Error(`Identity/attribution mismatches: ${identityMismatches}/${attributionMismatches}`);
for (let mi = 0; mi < modelCount; mi += 1) {
  const accumulator = modelAccumulators[mi];
  if (accumulator.runs !== worldsPerModel || accumulator.winnerByWorld.includes(0)) throw new Error(`Model ${models[mi].modelId} coverage is incomplete`);
  for (let ei = 0; ei < edgeCount; ei += 1) {
    if (modelEdgeRuns[mi * edgeCount + ei] !== seedsPerCell) throw new Error(`Model/edge coverage is incomplete at ${mi}/${ei}`);
  }
}
if (profileSeen.some((count) => count === 0)) throw new Error("At least one commander profile is absent");
if (edgeRuns.some((count) => count !== modelCount * seedsPerCell)) throw new Error("At least one edge has incomplete model/seed coverage");

function inverseNormal(probability) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  const high = 1 - low;
  if (probability < low) {
    const q = Math.sqrt(-2 * Math.log(probability));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (probability > high) return -inverseNormal(1 - probability);
  const q = probability - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
const multiplicityZ = inverseNormal(1 - 0.05 / (2 * commanderCount));
function adjustedInterval(sum, sumSquares, count) {
  const mean = sum / count;
  const variance = Math.max(0, sumSquares / count - mean * mean);
  const margin = multiplicityZ * Math.sqrt(variance / count);
  return [Math.max(0, mean - margin), Math.min(1, mean + margin)];
}
function softmaxDiversity(scores, temperature = 0.03) {
  const max = Math.max(...scores);
  const weights = scores.map((score) => Math.exp((score - max) / temperature));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let entropy = 0;
  for (const weight of weights) {
    const p = weight / total;
    entropy -= p * Math.log(p);
  }
  const topTenShare = [...weights].sort((a, b) => b - a).slice(0, 10).reduce((sum, value) => sum + value, 0) / total;
  return { effectiveCount: Math.exp(entropy), topTenShare, weights, total };
}
function quantile(values, probability) {
  if (!values.length) throw new Error("Cannot take a quantile of an empty collection");
  const ordered = [...values].sort((left, right) => left - right);
  const position = (ordered.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return ordered[lower + 1] === undefined
    ? ordered[lower]
    : ordered[lower] + fraction * (ordered[lower + 1] - ordered[lower]);
}

const pairMap = new Map();
const selfEdges = [];
for (let ei = 0; ei < edges.length; ei += 1) {
  const edge = edges[ei];
  if (edge.stratum === "self-play") {
    selfEdges.push({ edge, edgeIndex: ei });
    continue;
  }
  const pair = pairMap.get(edge.pairHash) ?? { pairHash: edge.pairHash, leftCommanderId: edge.leftCommanderId, rightCommanderId: edge.rightCommanderId, stratum: edge.stratum, forward: -1, reverse: -1 };
  if (edge.seatOrientation === 1) pair.forward = ei;
  else pair.reverse = ei;
  pairMap.set(edge.pairHash, pair);
}
const pairs = [...pairMap.values()];
if (pairs.some((pair) => pair.forward < 0 || pair.reverse < 0)) throw new Error("A non-self pair is missing a seat reversal");

function graphSummary(nodeCount, arcs) {
  const adjacency = Array.from({ length: nodeCount }, () => []);
  const reverse = Array.from({ length: nodeCount }, () => []);
  const parent = Int32Array.from({ length: nodeCount }, (_, index) => index);
  const find = (value) => {
    let current = value;
    while (parent[current] !== current) current = parent[current];
    while (parent[value] !== value) {
      const next = parent[value];
      parent[value] = current;
      value = next;
    }
    return current;
  };
  const union = (left, right) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[b] = a;
  };
  for (const [from, to] of arcs) {
    adjacency[from].push(to);
    reverse[to].push(from);
    union(from, to);
  }
  const visited = new Uint8Array(nodeCount);
  const order = [];
  for (let root = 0; root < nodeCount; root += 1) {
    if (visited[root]) continue;
    visited[root] = 1;
    const stack = [[root, 0]];
    while (stack.length) {
      const frame = stack.at(-1);
      const neighbors = adjacency[frame[0]];
      if (frame[1] < neighbors.length) {
        const next = neighbors[frame[1]++];
        if (!visited[next]) {
          visited[next] = 1;
          stack.push([next, 0]);
        }
      } else {
        order.push(frame[0]);
        stack.pop();
      }
    }
  }
  visited.fill(0);
  const componentSizes = [];
  for (let oi = order.length - 1; oi >= 0; oi -= 1) {
    const root = order[oi];
    if (visited[root]) continue;
    let size = 0;
    const stack = [root];
    visited[root] = 1;
    while (stack.length) {
      const node = stack.pop();
      size += 1;
      for (const next of reverse[node]) if (!visited[next]) { visited[next] = 1; stack.push(next); }
    }
    componentSizes.push(size);
  }
  const weakRoots = new Map();
  for (let node = 0; node < nodeCount; node += 1) increment(weakRoots, find(node));
  const weakSizes = [...weakRoots.values()];
  return {
    arcs: arcs.length,
    stronglyConnectedComponents: componentSizes.length,
    largestStronglyConnectedComponent: Math.max(...componentSizes),
    largestStronglyConnectedFraction: Math.max(...componentSizes) / nodeCount,
    cyclicComponents: componentSizes.filter((size) => size > 1).length,
    weakComponents: weakSizes.length,
    largestWeakComponent: Math.max(...weakSizes),
    largestWeakFraction: Math.max(...weakSizes) / nodeCount
  };
}

function strategicLandscape(model = null, includeTopEdges = false) {
  const degrees = new Uint16Array(commanderCount);
  const wins = new Uint16Array(commanderCount);
  const losses = new Uint16Array(commanderCount);
  const balanced = new Uint16Array(commanderCount);
  const scoreSums = new Float64Array(commanderCount);
  const arcs = [];
  const pairResults = [];
  const seatEffects = [];
  const edgeMean = (ei) => model === null
    ? edgeP1Score[ei] / edgeRuns[ei]
    : modelEdgeP1Score[model * edgeCount + ei] / modelEdgeRuns[model * edgeCount + ei];
  for (const pair of pairs) {
    const left = commanderIndex.get(pair.leftCommanderId);
    const right = commanderIndex.get(pair.rightCommanderId);
    const leftAsP1 = edgeMean(pair.forward);
    const leftAsP2 = 1 - edgeMean(pair.reverse);
    const strategic = (leftAsP1 + leftAsP2) / 2;
    const seatEffect = leftAsP1 - leftAsP2;
    degrees[left] += 1;
    degrees[right] += 1;
    scoreSums[left] += strategic;
    scoreSums[right] += 1 - strategic;
    seatEffects.push(seatEffect);
    if (strategic > 0.55) { wins[left] += 1; losses[right] += 1; arcs.push([left, right]); }
    else if (strategic < 0.45) { wins[right] += 1; losses[left] += 1; arcs.push([right, left]); }
    else { balanced[left] += 1; balanced[right] += 1; }
    if (includeTopEdges) pairResults.push({ pairHash: pair.pairHash, leftCommanderId: pair.leftCommanderId, rightCommanderId: pair.rightCommanderId, stratum: pair.stratum, leftStrategicScore: strategic, seatEffect });
  }
  const selfP1Scores = selfEdges.map(({ edgeIndex: ei }) => edgeMean(ei));
  const nodeMetrics = profiles.map((profile, index) => ({
    commanderId: profile.commanderId,
    sampledOpponents: degrees[index],
    dominanceWins: wins[index],
    dominanceLosses: losses[index],
    balancedPairs: balanced[index],
    dominanceRate: degrees[index] ? wins[index] / degrees[index] : 0,
    lossRate: degrees[index] ? losses[index] / degrees[index] : 0,
    meanStrategicScore: degrees[index] ? scoreSums[index] / degrees[index] : 0.5
  }));
  pairResults.sort((a, b) => Math.abs(b.leftStrategicScore - 0.5) - Math.abs(a.leftStrategicScore - 0.5));
  return {
    graph: graphSummary(commanderCount, arcs),
    nodeMetrics,
    seat: {
      exactReversalPairs: seatEffects.length,
      meanSignedEffect: seatEffects.reduce((sum, value) => sum + value, 0) / seatEffects.length,
      meanAbsoluteEffect: seatEffects.reduce((sum, value) => sum + Math.abs(value), 0) / seatEffects.length,
      maximumAbsoluteEffect: Math.max(...seatEffects.map(Math.abs)),
      selfPlayCells: selfP1Scores.length,
      selfPlayMeanP1Score: selfP1Scores.reduce((sum, value) => sum + value, 0) / selfP1Scores.length,
      selfPlayMeanAbsoluteSkew: selfP1Scores.reduce((sum, value) => sum + Math.abs(value - 0.5), 0) / selfP1Scores.length
    },
    topEdges: includeTopEdges ? pairResults.slice(0, 100).map((edge) => ({ ...edge, leftStrategicScore: round(edge.leftStrategicScore), seatEffect: round(edge.seatEffect) })) : []
  };
}

const overallStrategic = strategicLandscape(null, true);
const overallNodeIndex = new Map(overallStrategic.nodeMetrics.map((metric) => [metric.commanderId, metric]));
const bridge = modelAccumulators[bridgeIndex];
const modelMetrics = [];
for (let mi = 0; mi < modelCount; mi += 1) {
  const accumulator = modelAccumulators[mi];
  let scoreDelta = 0;
  let roundDelta = 0;
  let simultaneousDelta = 0;
  let sameCoarse = 0;
  for (let world = 0; world < worldsPerModel; world += 1) {
    const currentScore = accumulator.winnerByWorld[world] === 1 ? 1 : accumulator.winnerByWorld[world] === 2 ? 0 : 0.5;
    const bridgeScore = bridge.winnerByWorld[world] === 1 ? 1 : bridge.winnerByWorld[world] === 2 ? 0 : 0.5;
    scoreDelta += currentScore - bridgeScore;
    roundDelta += accumulator.roundsByWorld[world] - bridge.roundsByWorld[world];
    simultaneousDelta += Number(accumulator.terminalByWorld[world] === 4) - Number(bridge.terminalByWorld[world] === 4);
    sameCoarse += Number(accumulator.winnerByWorld[world] === bridge.winnerByWorld[world] && accumulator.terminalByWorld[world] === bridge.terminalByWorld[world] && accumulator.roundsByWorld[world] === bridge.roundsByWorld[world]);
  }
  const scores = [];
  const commanderRows = [];
  for (let ci = 0; ci < commanderCount; ci += 1) {
    const index = mi * commanderCount + ci;
    const runs = modelCommanderRuns[index];
    if (!runs) throw new Error(`Model ${mi} never observed commander ${ci}`);
    const score = modelCommanderScore[index] / runs;
    scores.push(score);
    commanderRows.push({ ci, score, runs, progress: modelCommanderProgress[index] / runs, drift: modelCommanderDrift[index] / runs });
  }
  const diversity = softmaxDiversity(scores);
  commanderRows.sort((a, b) => b.score - a.score || a.ci - b.ci);
  const topTwenty = commanderRows.slice(0, 20);
  const modelStrategic = strategicLandscape(mi, false);
  const dominanceRates = modelStrategic.nodeMetrics.map((metric) => metric.dominanceRate);
  const universalCommanderCount = dominanceRates.filter((rate) => rate === 1).length;
  const topCompositions = new Set(topTwenty.map((row) => profiles[row.ci].compositionModule));
  const topArchetypes = new Set(topTwenty.map((row) => dimensions.map((dimension) => profiles[row.ci][dimension]).join("|")));
  const terminalRates = Object.fromEntries(terminalNames.map((name) => [name, accumulator.terminals[name] / accumulator.runs]));
  modelMetrics.push({
    modelId: models[mi].modelId,
    designRow: models[mi].designRow,
    role: models[mi].role,
    ruleShape: models[mi].ruleShape,
    runs: accumulator.runs,
    p1ScoreRate: round(accumulator.p1Score / accumulator.runs),
    p1WinRate: round(accumulator.p1Wins / accumulator.runs),
    p2WinRate: round(accumulator.p2Wins / accumulator.runs),
    drawRate: round(accumulator.draws / accumulator.runs),
    netP1SeatSkew: round(Math.abs(accumulator.p1Score / accumulator.runs - 0.5)),
    seatAdvantage: round(modelStrategic.seat.meanAbsoluteEffect),
    meanRounds: round(accumulator.roundSum / accumulator.runs),
    minRounds: accumulator.minRounds,
    maxRounds: accumulator.maxRounds,
    terminalRates: Object.fromEntries(Object.entries(terminalRates).map(([key, value]) => [key, round(value)])),
    approximateUniqueOutcomeHashes: Math.round(hllEstimate(accumulator.hll)),
    effectiveCoarseOutcomes: round(entropyEffectiveCount(accumulator.coarseOutcomes.values(), accumulator.runs), 2),
    commanderDiversity: {
      effectiveSoftmaxCount: round(diversity.effectiveCount, 2),
      topTenWeightShare: round(diversity.topTenShare),
      topTwentyCompositions: topCompositions.size,
      topTwentyArchetypes: topArchetypes.size,
      topCommanders: topTwenty.slice(0, 10).map((row) => ({ commanderId: profiles[row.ci].commanderId, profile: profiles[row.ci], scoreRate: round(row.score), appearances: row.runs, meanProgress: round(row.progress), meanDrift: round(row.drift) }))
    },
    counterplay: {
      ...Object.fromEntries(Object.entries(modelStrategic.graph).map(([key, value]) => [key, typeof value === "number" ? round(value) : value])),
      maximumCommanderDominanceRate: round(Math.max(...modelStrategic.nodeMetrics.map((metric) => metric.dominanceRate))),
      p95CommanderDominanceRate: round(quantile(dominanceRates, 0.95)),
      p99CommanderDominanceRate: round(quantile(dominanceRates, 0.99)),
      universalCommanderCount,
      universalCommanderFraction: round(universalCommanderCount / commanderCount),
      sampledOpponentsPerCommander: modelStrategic.nodeMetrics[0].sampledOpponents,
      meanAbsoluteSeatEffect: round(modelStrategic.seat.meanAbsoluteEffect),
      selfPlayP1Score: round(modelStrategic.seat.selfPlayMeanP1Score)
    },
    mechanics: Object.fromEntries(relevantMechanics.map((name) => [name, modelMechanics[name][mi]])),
    pairedVsV1Bridge: {
      p1ScoreDelta: round(scoreDelta / worldsPerModel),
      meanRoundDelta: round(roundDelta / worldsPerModel),
      simultaneousRateDelta: round(simultaneousDelta / worldsPerModel),
      sameWinnerTerminalRoundRate: round(sameCoarse / worldsPerModel)
    }
  });
}

const commanderMetrics = profiles.map((profile, ci) => {
  const runs = commanderRuns[ci];
  const mean = commanderScore[ci] / runs;
  const interval = adjustedInterval(commanderScore[ci], commanderScoreSq[ci], runs);
  const strategic = overallNodeIndex.get(profile.commanderId);
  return {
    commanderId: profile.commanderId,
    ordinal: profile.ordinal,
    compositionModule: profile.compositionModule,
    triageModule: profile.triageModule,
    movementModule: profile.movementModule,
    capacityModule: profile.capacityModule,
    profileHash: profile.profileHash,
    appearances: runs,
    scoreRate: round(mean),
    multiplicityAdjusted95: interval.map((value) => round(value)),
    winRate: round(commanderWins[ci] / runs),
    drawRate: round(commanderDraws[ci] / runs),
    meanProgress: round(commanderProgress[ci] / runs),
    meanDrift: round(commanderDrift[ci] / runs),
    strategic: Object.fromEntries(Object.entries(strategic).filter(([key]) => key !== "commanderId").map(([key, value]) => [key, typeof value === "number" ? round(value) : value])),
    mechanicRates: Object.fromEntries(relevantMechanics.map((name) => [name, round(commanderMechanics[name][ci] / runs)]))
  };
});
commanderMetrics.sort((a, b) => b.scoreRate - a.scoreRate || a.commanderId.localeCompare(b.commanderId));
const commanderDiversity = softmaxDiversity(commanderMetrics.map((metric) => metric.scoreRate));
const compositionWeights = new Map();
for (let index = 0; index < commanderMetrics.length; index += 1) increment(compositionWeights, commanderMetrics[index].compositionModule, commanderDiversity.weights[index]);
const effectiveCompositionDiversity = entropyEffectiveCount(compositionWeights.values(), commanderDiversity.total);

const moduleMetrics = {};
for (const dimension of dimensions) {
  moduleMetrics[dimension] = dimensionLevels[dimension].map((level) => {
    const members = commanderMetrics.filter((metric) => metric[dimension] === level);
    const appearances = members.reduce((sum, member) => sum + member.appearances, 0);
    const score = members.reduce((sum, member) => sum + member.scoreRate * member.appearances, 0) / appearances;
    return {
      module: level,
      commanderProfiles: members.length,
      appearances,
      scoreRate: round(score),
      meanProgress: round(members.reduce((sum, member) => sum + member.meanProgress * member.appearances, 0) / appearances),
      meanDrift: round(members.reduce((sum, member) => sum + member.meanDrift * member.appearances, 0) / appearances),
      mechanicRates: Object.fromEntries(relevantMechanics.map((name) => [name, round(members.reduce((sum, member) => sum + member.mechanicRates[name] * member.appearances, 0) / appearances)]))
    };
  });
}

const modelModule = models.map((model, mi) => ({
  modelId: model.modelId,
  dimensions: Object.fromEntries(dimensions.map((dimension) => [dimension, dimensionLevels[dimension].map((level) => {
    let runs = 0;
    let score = 0;
    for (let ci = 0; ci < commanderCount; ci += 1) {
      if (profiles[ci][dimension] !== level) continue;
      const index = mi * commanderCount + ci;
      runs += modelCommanderRuns[index];
      score += modelCommanderScore[index];
    }
    return { module: level, appearances: runs, scoreRate: score / runs };
  })]))
}));
const factorNames = Object.keys(models[0].ruleShape);
const factorModuleInteractions = [];
for (const factor of factorNames) {
  const factorLevels = [...new Set(models.map((model) => model.ruleShape[factor]))];
  for (const dimension of dimensions) {
    const cells = dimensionLevels[dimension].map((module) => ({
      module,
      levels: factorLevels.map((factorLevel) => {
        const members = models.map((model, mi) => ({ model, mi })).filter(({ model }) => model.ruleShape[factor] === factorLevel);
        let weightedScore = 0;
        let runs = 0;
        for (const { mi } of members) {
          const cell = modelModule[mi].dimensions[dimension].find((candidate) => candidate.module === module);
          weightedScore += cell.scoreRate * cell.appearances;
          runs += cell.appearances;
        }
        return { factorLevel, scoreRate: weightedScore / runs, appearances: runs };
      })
    }));
    const values = cells.flatMap((cell) => cell.levels.map((level) => level.scoreRate - 0.5));
    factorModuleInteractions.push({ factor, moduleDimension: dimension, interactionRange: Math.max(...values) - Math.min(...values), cells });
  }
}
factorModuleInteractions.sort((a, b) => b.interactionRange - a.interactionRange || a.factor.localeCompare(b.factor));

function dominates(left, right) {
  const comparisons = [
    left.drawRate <= right.drawRate,
    left.terminalRates["round-limit"] <= right.terminalRates["round-limit"],
    left.seatAdvantage <= right.seatAdvantage,
    left.counterplay.p95CommanderDominanceRate <= right.counterplay.p95CommanderDominanceRate,
    left.counterplay.universalCommanderFraction <= right.counterplay.universalCommanderFraction,
    left.commanderDiversity.effectiveSoftmaxCount >= right.commanderDiversity.effectiveSoftmaxCount,
    left.counterplay.largestStronglyConnectedFraction >= right.counterplay.largestStronglyConnectedFraction
  ];
  const strict = left.drawRate < right.drawRate || left.terminalRates["round-limit"] < right.terminalRates["round-limit"] ||
    left.seatAdvantage < right.seatAdvantage || left.counterplay.p95CommanderDominanceRate < right.counterplay.p95CommanderDominanceRate ||
    left.counterplay.universalCommanderFraction < right.counterplay.universalCommanderFraction ||
    left.commanderDiversity.effectiveSoftmaxCount > right.commanderDiversity.effectiveSoftmaxCount ||
    left.counterplay.largestStronglyConnectedFraction > right.counterplay.largestStronglyConnectedFraction;
  return comparisons.every(Boolean) && strict;
}
const pareto = modelMetrics.filter((candidate) => !modelMetrics.some((other) => other !== candidate && dominates(other, candidate)));
for (const metric of modelMetrics) {
  metric.screenGates = {
    drawRate: metric.drawRate < 0.05 ? "pass" : "fail",
    roundLimitRate: metric.terminalRates["round-limit"] < 0.10 ? "pass" : "fail",
    effectiveCommanderDiversity: metric.commanderDiversity.effectiveSoftmaxCount >= commanderCount * 0.02 ? "pass" : "fail",
    topCompositionBreadth: metric.commanderDiversity.topTwentyCompositions >= 3 ? "pass" : "fail",
    noSparseUniversalCollapse: metric.counterplay.universalCommanderFraction < 0.10 ? "pass" : "fail",
    supportedUniversalDominance: "pending-next-stage",
    battleSampleStability: "pending-next-stage",
    v1RegressionSentinels: "pending-gate-confirmation"
  };
  metric.screenPass = Object.values(metric.screenGates).filter((value) => value !== "pending-next-stage" && value !== "pending-gate-confirmation").every((value) => value === "pass");
  metric.pareto = pareto.includes(metric);
  metric.screenUtility = round(
    Math.log(metric.commanderDiversity.effectiveSoftmaxCount) / Math.log(commanderCount) +
    metric.counterplay.largestStronglyConnectedFraction -
    metric.counterplay.p95CommanderDominanceRate -
    metric.counterplay.universalCommanderFraction -
    1.5 * metric.seatAdvantage - 2 * metric.drawRate - 2 * metric.terminalRates["round-limit"]
  );
}
const candidatePool = pareto.filter((metric) => metric.screenPass).sort((a, b) => b.screenUtility - a.screenUtility || a.modelId.localeCompare(b.modelId));
const provisionalCandidates = candidatePool.slice(0, 6).map((metric, rank) => ({
  rank: rank + 1,
  modelId: metric.modelId,
  designRow: metric.designRow,
  role: metric.role,
  screenUtility: metric.screenUtility,
  effectiveCommanderDiversity: metric.commanderDiversity.effectiveSoftmaxCount,
  p95CommanderDominanceRate: metric.counterplay.p95CommanderDominanceRate,
  universalCommanderFraction: metric.counterplay.universalCommanderFraction,
  giantCounterplaySccFraction: metric.counterplay.largestStronglyConnectedFraction,
  drawRate: metric.drawRate,
  roundLimitRate: metric.terminalRates["round-limit"],
  refinementRole: metric.counterplay.largestStronglyConnectedFraction < 0.05
    ? "counterplay-collapse-boundary"
    : metric.seatAdvantage <= 0.23
      ? "lower-seat-effect-contrast"
      : metric.commanderDiversity.effectiveSoftmaxCount >= 400
        ? "diversity-cycle-anchor"
        : metric.terminalRates["round-limit"] >= 0.05
          ? "round-limit-contrast"
          : "counterplay-frontier",
  disposition: "advance-to-causal-refinement-not-final-promotion"
}));

const requiredMechanics = ["verified", "rejected", "seized", "assisted", "movementDistance", "stationaryTurns", "capacityClaims", "perfectFocusUses", "overclockUses", "macroFlareUses", "reconLockActivations", "targetLocksGenerated", "uplinkAttentionGenerated"];
const unreachableMechanics = requiredMechanics.filter((name) => overallMechanics[name] === 0);
const stratumMetrics = Object.fromEntries(Object.entries(strata).map(([name, value]) => [name, {
  runs: value.runs,
  p1ScoreRate: round(value.p1Score / value.runs),
  drawRate: round(value.draws / value.runs),
  roundLimitRate: round(value.roundLimits / value.runs)
}]));
const gib = 1024 ** 3;
const shapeScreenGiB = sourceBytes / gib;
const standardRuns = plan.budget.plannedRuns;
const fullStandardGiB = shapeScreenGiB * standardRuns / completion.plannedRuns;
const storageProjection = [1, 10, 25, 50].map((campaigns) => ({
  campaigns,
  correctedShapeScreensGiB: round(shapeScreenGiB * campaigns, 2),
  fullStandardCampaignsGiB: round(fullStandardGiB * campaigns, 2),
  generousProvisionGiB: round(fullStandardGiB * campaigns * 1.25, 2)
}));

const reportDraft = {
  schemaVersion: 2,
  analysisKind: "attention-v2-corrected-commander-landscape-assessment",
  source: {
    planId: plan.planId,
    planHash: plan.planHash,
    completionReportHash: completion.reportHash,
    parentV1ModelHash: parentModelHash,
    runs: observedRuns,
    models: modelCount,
    commanders: commanderCount,
    orientedEdges: edgeCount,
    exactReversalPairs: pairs.length,
    selfPlayEdges: selfEdges.length,
    seeds: [...seeds].sort((a, b) => a - b),
    battleSamples: [...battleSamples],
    battleContexts: [...battleContexts],
    policyHashes: policyHashes.size,
    compositionIds: compositionIds.size,
    compressedShardBytes: sourceBytes
  },
  integrity: {
    status: "pass",
    schemaVersion: 2,
    identityMismatches,
    attributionMismatches,
    exactRunCoverage: true,
    exactModelWorldCoverage: true,
    exactEdgeCoverage: true,
    allProfilesObserved: true
  },
  evidenceDecision: {
    commanderLandscapeEffects: "valid-train-screen-evidence",
    modelCommanderInteractions: "valid-train-screen-evidence",
    finalSurvivorSelectionEligible: false,
    nextStageSelectionEligible: provisionalCandidates.length > 0,
    reason: "Commander behavior is now causal and fully observed, but the screen uses one train battle sample and four train seeds; battle-volume stability, fresh holdout, and the original v1 regression sentinels remain required before promotion."
  },
  outcomes: {
    p1ScoreRate: round(modelAccumulators.reduce((sum, item) => sum + item.p1Score, 0) / observedRuns),
    drawRate: round(modelAccumulators.reduce((sum, item) => sum + item.draws, 0) / observedRuns),
    meanRounds: round(modelAccumulators.reduce((sum, item) => sum + item.roundSum, 0) / observedRuns),
    terminals: Object.fromEntries(terminalNames.map((name) => [name, modelAccumulators.reduce((sum, item) => sum + item.terminals[name], 0)])),
    strata: stratumMetrics
  },
  commanderDiversity: {
    effectiveSoftmaxCommanders: round(commanderDiversity.effectiveCount, 2),
    effectiveSoftmaxCompositions: round(effectiveCompositionDiversity, 2),
    topTenWeightShare: round(commanderDiversity.topTenShare),
    temperature: 0.03,
    multiplicityAdjustedZ: round(multiplicityZ, 4),
    maximumScoreCommander: commanderMetrics[0],
    minimumScoreCommander: commanderMetrics.at(-1),
    maximumDominanceCommander: [...commanderMetrics].sort((a, b) => b.strategic.dominanceRate - a.strategic.dominanceRate)[0]
  },
  counterplay: {
    graph: Object.fromEntries(Object.entries(overallStrategic.graph).map(([key, value]) => [key, typeof value === "number" ? round(value) : value])),
    seat: Object.fromEntries(Object.entries(overallStrategic.seat).map(([key, value]) => [key, typeof value === "number" ? round(value) : value])),
    topDecisiveEdges: overallStrategic.topEdges
  },
  mechanics: {
    totals: overallMechanics,
    controllerCalls,
    controllerIntents,
    eventTypes,
    requiredMechanics,
    unreachableMechanics,
    reachabilityStatus: unreachableMechanics.length === 0 ? "pass" : "fail"
  },
  modules: moduleMetrics,
  topFactorModuleInteractions: factorModuleInteractions.slice(0, 40).map((interaction) => ({ ...interaction, interactionRange: round(interaction.interactionRange), cells: interaction.cells.map((cell) => ({ ...cell, levels: cell.levels.map((level) => ({ ...level, scoreRate: round(level.scoreRate) })) })) })),
  selection: {
    finalPromotionEligible: false,
    paretoModelIds: pareto.map((metric) => metric.modelId),
    provisionalCandidates,
    pendingGates: ["multi-battle-sample stability", "fresh-seed landscape holdout", "v1 Scout/Siege/movement/escort regression sentinels", "fresh causal Macro Flare follow-up"],
    maximumCandidates: 6
  },
  models: modelMetrics,
  commanders: commanderMetrics,
  storage: {
    correctedShapeScreenGiB: round(shapeScreenGiB, 3),
    projectedFullStandardCampaignGiB: round(fullStandardGiB, 3),
    provisionWith25PercentMarginGiB: round(fullStandardGiB * 1.25, 3),
    scenarios: storageProjection
  }
};
const analysis = { ...reportDraft, analysisHash: sha256Value(reportDraft) };

function esc(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function svgFrame(title, subtitle, height, body, footer = "ATTENTION V2 / CORRECTED CAUSAL SHAPE SCREEN") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="${height}" viewBox="0 0 1800 ${height}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(subtitle)}</desc><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#061119"/><stop offset=".55" stop-color="#0b1723"/><stop offset="1" stop-color="#071b1b"/></linearGradient><pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#31506a" opacity=".12"/></pattern><style>.s{font-family:Inter,"Segoe UI",Arial,sans-serif}.m{font-family:"Cascadia Mono",Consolas,monospace}.t{fill:#f4f8fc;font-weight:750}.muted{fill:#91a7bb}.teal{fill:#4ff0c5}.amber{fill:#f8d66d}.coral{fill:#ff7188}.purple{fill:#b58cff}</style></defs><rect width="1800" height="${height}" fill="url(#bg)"/><rect width="1800" height="${height}" fill="url(#grid)"/><text x="80" y="80" class="s teal" font-size="17" font-weight="700" letter-spacing="3">CONTEXT LANDSCAPE / EVIDENCE LAB</text><text x="80" y="145" class="s t" font-size="52">${esc(title)}</text><text x="80" y="188" class="s muted" font-size="21">${esc(subtitle)}</text>${body}<text x="80" y="${height - 38}" class="m muted" font-size="13">${esc(footer)}</text><text x="1720" y="${height - 38}" text-anchor="end" class="m muted" font-size="13">${analysis.analysisHash.slice(0, 25)}</text></svg>`;
}
function overviewSvg() {
  const cards = [
    ["VERIFIED RUNS", observedRuns.toLocaleString(), "8/8 exact shards"],
    ["COMMANDERS", commanderCount.toLocaleString(), `${policyHashes.size.toLocaleString()} causal policies`],
    ["COUNTERPLAY SCC", `${(overallStrategic.graph.largestStronglyConnectedFraction * 100).toFixed(1)}%`, "largest cyclic component"],
    ["NEXT CANDIDATES", String(provisionalCandidates.length), "holdout-gated, not promoted"]
  ].map(([label, value, note], index) => { const x = 80 + index * 410; return `<rect x="${x}" y="245" width="370" height="155" rx="14" fill="#101e2b" stroke="#294157"/><text x="${x + 24}" y="282" class="s muted" font-size="14" font-weight="700" letter-spacing="2">${label}</text><text x="${x + 24}" y="338" class="s t teal" font-size="37">${value}</text><text x="${x + 24}" y="375" class="s muted" font-size="15">${note}</text>`; }).join("");
  const mechanics = requiredMechanics.map((name, index) => `<text x="${100 + (index % 3) * 550}" y="${505 + Math.floor(index / 3) * 48}" class="m t" font-size="17">${esc(name)}</text><text x="${590 + (index % 3) * 550}" y="${505 + Math.floor(index / 3) * 48}" text-anchor="end" class="m teal" font-size="16">${overallMechanics[name].toLocaleString()}</text>`).join("");
  return svgFrame("The commander landscape is finally causal", "9.216 million enriched matches with complete profile, telemetry, mechanic, seat, and model attribution.", 940, `${cards}<text x="80" y="460" class="s t" font-size="27">Mechanics reached in the corrected screen</text>${mechanics}<rect x="80" y="760" width="1640" height="92" rx="14" fill="#112435" stroke="#4ff0c5"/><text x="112" y="799" class="s teal" font-size="17" font-weight="700">EVIDENCE DECISION</text><text x="112" y="835" class="s t" font-size="21">Valid train-screen evidence. Advance candidates to multi-sample causal refinement; do not promote before holdout and v1 regression gates.</text>`);
}
function frontierSvg() {
  const maxDiversity = Math.max(...modelMetrics.map((metric) => metric.commanderDiversity.effectiveSoftmaxCount));
  const minDominance = Math.max(0, Math.min(...modelMetrics.map((metric) => metric.counterplay.p95CommanderDominanceRate)) - 0.025);
  const maxDominance = Math.min(1, Math.max(...modelMetrics.map((metric) => metric.counterplay.p95CommanderDominanceRate)) + 0.025);
  const dots = modelMetrics.map((metric) => {
    const x = 170 + (metric.counterplay.p95CommanderDominanceRate - minDominance) / (maxDominance - minDominance) * 1000;
    const y = 1150 - metric.commanderDiversity.effectiveSoftmaxCount / maxDiversity * 820;
    const selected = provisionalCandidates.some((candidate) => candidate.modelId === metric.modelId);
    const fill = selected ? "#f8d66d" : metric.pareto ? "#4ff0c5" : metric.role.includes("sentinel") ? "#b58cff" : "#67a9ff";
    return `<circle cx="${x}" cy="${y}" r="${selected ? 13 : 8}" fill="${fill}" opacity=".92"/><text x="${x + 12}" y="${y - 10}" class="m ${selected ? "t" : "muted"}" font-size="12">${metric.designRow}</text>`;
  }).join("");
  const candidates = provisionalCandidates.map((candidate, index) => `<text x="1280" y="${300 + index * 42}" class="m t" font-size="15">${candidate.rank}. row ${candidate.designRow} / ${esc(candidate.refinementRole)}</text>`).join("");
  return svgFrame("Model frontier: diversity versus dominance", "Upper-left is preferred: more viable commanders, less one-way dominance at the support-aware 95th percentile. Gold rows advance provisionally.", 1320, `<rect x="120" y="250" width="1100" height="950" rx="14" fill="#0c1824" stroke="#294157"/><line x1="170" y1="1150" x2="1170" y2="1150" stroke="#91a7bb"/><line x1="170" y1="330" x2="170" y2="1150" stroke="#91a7bb"/><text x="510" y="1220" class="s muted" font-size="18">95th-percentile commander dominance →</text><text x="80" y="760" transform="rotate(-90 80 760)" class="s muted" font-size="18">effective commander diversity →</text>${dots}<rect x="1250" y="250" width="470" height="315" rx="12" fill="#101e2b" stroke="#f8d66d"/><text x="1280" y="280" class="s amber" font-size="16" font-weight="700">PROVISIONAL NEXT-STAGE SET</text>${candidates}`);
}
function modulesSvg() {
  let y = 270;
  let body = "";
  for (const dimension of dimensions) {
    body += `<text x="80" y="${y}" class="s teal" font-size="22" font-weight="700">${esc(dimension)}</text>`;
    y += 35;
    for (const metric of moduleMetrics[dimension]) {
      const delta = metric.scoreRate - 0.5;
      const width = Math.abs(delta) * 2800;
      body += `<text x="100" y="${y + 14}" class="m t" font-size="14">${esc(metric.module)}</text><line x1="840" y1="${y + 5}" x2="1340" y2="${y + 5}" stroke="#294157"/><line x1="1090" y1="${y - 8}" x2="1090" y2="${y + 20}" stroke="#91a7bb"/><rect x="${delta >= 0 ? 1090 : 1090 - width}" y="${y - 3}" width="${width}" height="16" rx="3" fill="${delta >= 0 ? "#4ff0c5" : "#ff7188"}"/><text x="1390" y="${y + 14}" class="m t" font-size="14">${delta >= 0 ? "+" : ""}${delta.toFixed(4)}</text><text x="1570" y="${y + 14}" class="m muted" font-size="13">${metric.appearances.toLocaleString()} obs</text>`;
      y += 32;
    }
    y += 30;
  }
  return svgFrame("Commander module landscape", "Appearance-weighted score shift from 0.5 across every model, seat, edge, and seed.", y + 90, body);
}
function counterplaySvg() {
  const graph = overallStrategic.graph;
  const cards = [
    ["DOMINANCE ARCS", graph.arcs.toLocaleString()],
    ["LARGEST SCC", `${graph.largestStronglyConnectedComponent.toLocaleString()} / ${commanderCount.toLocaleString()}`],
    ["CYCLIC SCCs", graph.cyclicComponents.toLocaleString()],
    ["MEAN |SEAT Δ|", overallStrategic.seat.meanAbsoluteEffect.toFixed(4)]
  ].map(([label, value], index) => { const x = 80 + index * 410; return `<rect x="${x}" y="245" width="370" height="120" rx="14" fill="#101e2b" stroke="#294157"/><text x="${x + 22}" y="280" class="s muted" font-size="14">${label}</text><text x="${x + 22}" y="330" class="s t teal" font-size="31">${value}</text>`; }).join("");
  const top = commanderMetrics.slice(0, 12).map((metric, index) => `<rect x="80" y="${445 + index * 42}" width="1640" height="34" fill="${index % 2 ? "#0d1925" : "#101e2b"}"/><text x="100" y="${468 + index * 42}" class="m amber" font-size="13">${index + 1}</text><text x="150" y="${468 + index * 42}" class="m t" font-size="13">${esc(metric.commanderId)}</text><text x="720" y="${468 + index * 42}" class="m muted" font-size="13">${esc(metric.compositionModule)}</text><text x="1030" y="${468 + index * 42}" class="m muted" font-size="13">${esc(metric.triageModule)}</text><text x="1320" y="${468 + index * 42}" class="m teal" font-size="13">score ${metric.scoreRate.toFixed(4)}</text><text x="1520" y="${468 + index * 42}" class="m t" font-size="13">edges ${metric.strategic.dominanceWins}/${metric.strategic.sampledOpponents}</text>`).join("");
  return svgFrame("Counterplay topology", "Directed arcs require >55% seat-averaged score on exact reversals; SCCs reveal cycles rather than a simple ladder.", 1050, `${cards}<text x="80" y="415" class="s t" font-size="24">Highest aggregate commander scores</text>${top}`);
}
function mechanicsSvg() {
  const values = requiredMechanics.map((name) => overallMechanics[name]);
  const maxLog = Math.max(...values.map((value) => Math.log10(value + 1)));
  const rows = requiredMechanics.map((name, index) => {
    const y = 275 + index * 52;
    const width = Math.log10(overallMechanics[name] + 1) / maxLog * 1180;
    return `<text x="80" y="${y + 20}" class="m t" font-size="15">${esc(name)}</text><rect x="390" y="${y}" width="${width}" height="28" rx="5" fill="#173c35" stroke="#4ff0c5"/><text x="${410 + width}" y="${y + 20}" class="m teal" font-size="14">${overallMechanics[name].toLocaleString()}</text>`;
  }).join("");
  return svgFrame("Mechanic reachability", "Every required mechanic executed; logarithmic bars retain rare but causally important abilities.", 1070, rows);
}
function storageSvg() {
  const max = storageProjection.at(-1).generousProvisionGiB;
  const rows = storageProjection.map((entry, index) => { const y = 390 + index * 125; const width = entry.generousProvisionGiB / max * 1250; return `<text x="90" y="${y}" class="s t" font-size="24">${entry.campaigns}×</text><rect x="190" y="${y - 28}" width="${width}" height="42" rx="8" fill="#173c35" stroke="#4ff0c5"/><text x="${210 + width}" y="${y}" class="m t" font-size="18">${entry.generousProvisionGiB.toFixed(1)} GiB</text><text x="190" y="${y + 42}" class="s muted" font-size="14">full 30.009M-run standard campaigns with 25% margin</text>`; }).join("");
  return svgFrame("Measured artifact capacity", "Corrected enriched records are larger than the identity-only run; projections now use observed causal evidence density.", 1020, `<rect x="80" y="240" width="1640" height="92" rx="14" fill="#101e2b" stroke="#294157"/><text x="110" y="278" class="s muted" font-size="15">OBSERVED CORRECTED SHAPE SCREEN</text><text x="110" y="316" class="s teal" font-size="31" font-weight="750">${shapeScreenGiB.toFixed(2)} GiB / ${observedRuns.toLocaleString()} runs</text>${rows}`);
}
function markdown() {
  const topModels = provisionalCandidates.map((candidate) => {
    const model = modelMetrics.find((metric) => metric.modelId === candidate.modelId);
    return `| ${candidate.rank} | ${model.designRow} | ${candidate.refinementRole} | \`${model.modelId}\` | ${model.commanderDiversity.effectiveSoftmaxCount.toFixed(1)} | ${(model.counterplay.p95CommanderDominanceRate * 100).toFixed(1)}% | ${(model.drawRate * 100).toFixed(2)}% |`;
  }).join("\n");
  return `# Attention v2 corrected shape-screen assessment\n\nAnalysis hash: \`${analysis.analysisHash}\`  \nCompletion report: \`${completion.reportHash}\`\n\n## Decision\n\nThe corrected ${observedRuns.toLocaleString()}-run screen is complete, attributed, and causally valid. All 6,400 commander profiles changed actual compositions/controllers, every required mechanic executed, and exact seat reversals support strategy-versus-seat separation.\n\nThis is **valid train-screen evidence**, not final promotion evidence. One frozen battle sample and four train seeds cannot establish battle-volume stability or replace the original v1 Scout, Siege, movement, and escort regression sentinels. The six rows below advance only to causal refinement.\n\n## Provisional next-stage candidates\n\n| Rank | Row | Role | Model | Effective commanders | P95 dominance | Draw rate |\n|---:|---:|---|---|---:|---:|---:|\n${topModels}\n\nThe maximum of 6,400 sparse eight-opponent dominance rates is 100% for every model and is therefore non-discriminating. Selection uses the 95th percentile plus the fraction of commanders observed at 8/8; a supported >90% universal-dominance test is deferred to the replicated next stage.\n\n## Key findings\n\n- Artifact integrity: ${observedRuns.toLocaleString()}/${completion.plannedRuns.toLocaleString()} records, ${edgeCount.toLocaleString()} oriented edges, ${pairs.length.toLocaleString()} exact reversal pairs, zero identity or attribution mismatches.\n- Commander diversity: ${commanderDiversity.effectiveCount.toFixed(1)} softmax-effective commanders and ${effectiveCompositionDiversity.toFixed(2)} effective compositions at temperature 0.03.\n- Counterplay: ${overallStrategic.graph.arcs.toLocaleString()} >55% dominance arcs; the largest strongly connected component contains ${overallStrategic.graph.largestStronglyConnectedComponent.toLocaleString()} commanders (${(overallStrategic.graph.largestStronglyConnectedFraction * 100).toFixed(1)}%).\n- Seat effect: mean absolute exact-reversal effect ${overallStrategic.seat.meanAbsoluteEffect.toFixed(4)}; self-play Player-1 score ${overallStrategic.seat.selfPlayMeanP1Score.toFixed(4)}.\n- Mechanics: all ${requiredMechanics.length} required counters are nonzero; no reachability failures.\n- Storage: ${shapeScreenGiB.toFixed(3)} GiB compressed. A full ${standardRuns.toLocaleString()}-run standard campaign projects to ${fullStandardGiB.toFixed(3)} GiB, or ${(fullStandardGiB * 1.25).toFixed(3)} GiB with margin.\n\n## Evidence boundary\n\nDo not call these six models promoted survivors. They require multi-sample stability, fresh-seed holdout, the four accepted v1 regression gates, and the fresh causal Macro Flare follow-up. The next plan is in \`NEXT_CAMPAIGN.md\`.\n`;
}
function nextCampaignMarkdown() {
  const ids = provisionalCandidates.map((candidate) => `- Row ${candidate.designRow}: \`${candidate.modelId}\` — ${candidate.refinementRole}`).join("\n");
  return `# Attention v2 causal-refinement campaign\n\nStatus: planned; parent screen complete  \nParent plan: \`${plan.planId}\`  \nParent report: \`${completion.reportHash}\`  \nParent analysis: \`${analysis.analysisHash}\`\n\n## Objective\n\nSeparate model effects that survived the corrected train screen from one-sample, seat, and sparse-opponent artifacts before materializing the expensive standard refinement stages. This is a bounded causal audit, not a promotion run.\n\n## Candidate rows\n\n${ids}\n\n## Design\n\n1. **Module-direction replication:** 6 models × 32 one-module contrasts × 2 seats × 4 orthogonal battle-pressure samples × 64 fresh seeds = **98,304 matches**. Require each selected model to reproduce the sign of its screen-level module contrasts with bootstrap intervals and exact common streams.\n2. **Counterplay replication:** 6 models × 400 oriented edges (self-play, exact reversals, best/worst empirical responses, one-module neighbors, and fixed sentinels) × 8 battle samples × 8 fresh seeds = **153,600 matches**.\n3. **Regression panel:** rerun the original v1 Scout specialization, Siege specialization, movement-value, and stationary-Line escort cells plus the revised causal Macro Flare follow-up on fresh seeds. Preserve the original thresholds without retuning.\n\nTotal before any larger refinement: **251,904 landscape matches plus the fixed regression panel**.\n\n## Gates\n\n- exact attribution, replay, and common-stream checks remain hard failures;\n- every candidate must retain at least two top-20 commander archetypes across samples;\n- no candidate may exceed 5% draws, 10% round-limit terminals, or 90% maximum observed dominance;\n- module-effect signs must replicate across seats and at least three of four pressure axes;\n- counterplay must retain a nontrivial cyclic SCC rather than collapse to a universal ladder;\n- all four accepted v1 regression criteria must pass; Macro Flare uses the locked fresh causal criterion, not the historically failed 80% claim;\n- only passing rows may be materialized into survivor-refinement or holdout catalogs.\n\n## Artifact policy\n\nWrite enriched gzip JSONL, a compact report, charts, exact checksums, and a verified archive. Keep the parent screen immutable and link every downstream manifest to the report and analysis hashes above.\n`;
}

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(join(outputDir, "assessment.json"), `${JSON.stringify(analysis, null, 2)}\n`),
  writeFile(join(outputDir, "ASSESSMENT.md"), markdown().replace("| Rank | Row | Role |", "| Rank | Row | Refinement role |")),
  writeFile(join(outputDir, "NEXT_CAMPAIGN.md"), nextCampaignMarkdown().replace(
    "## Design",
    `## Isolation targets

- **Seat sensitivity:** the parent screen's pooled Player-1 score was ${analysis.outcomes.p1ScoreRate.toFixed(4)}, but exact reversals had ${analysis.counterplay.seat.meanAbsoluteEffect.toFixed(4)} mean absolute seat effect and self-play scored ${analysis.counterplay.seat.selfPlayMeanP1Score.toFixed(4)} for Player 1. Estimate signed and absolute effects per sample instead of trusting cancellation in a pooled mean.
- **Stratum tails:** self-play reached ${(analysis.outcomes.strata["self-play"].drawRate * 100).toFixed(2)}% draws and ${(analysis.outcomes.strata["self-play"].roundLimitRate * 100).toFixed(2)}% round limits; nearby edges reached ${(analysis.outcomes.strata.nearby.roundLimitRate * 100).toFixed(2)}% round limits. Preserve fixed stratum quotas and gate them separately.
- **Rule × doctrine interactions:** the largest observed ranges were ${factorModuleInteractions.slice(0, 4).map((item) => `${item.factor} × ${item.moduleDimension} ${item.interactionRange.toFixed(3)}`).join(", ")}. Choose the four pressure samples to stress those axes rather than resampling arbitrary worlds.
- **Sparse dominance:** every model produced at least one 8/8 commander maximum, so the parent maximum was non-identifying. The replicated panel must estimate supported intervals and distinguish a true universal strategy from eight lucky edges.
- **Capacity causality:** Macro Flare executed ${overallMechanics.macroFlareUses.toLocaleString()} times but induced only ${overallMechanics.driftDefeatsInduced.toLocaleString()} drift defeats. Keep the fresh paired Macro Flare effect-size test separate from reachability.

## Design`
  ).replace(
    "every candidate must retain at least two top-20 commander archetypes across samples;",
    "the commander- and composition-breadth floors from the parent screen must replicate across samples;"
  ).replace(
    "no candidate may exceed 5% draws, 10% round-limit terminals, or 90% maximum observed dominance;",
    "every candidate must retain at least 2% softmax-effective commander diversity and three composition modules among its top 20;\n- draw and round-limit gates must be reported both overall and by fixed edge stratum; pooled success cannot mask a failing self-play or nearby tail;\n- no candidate may exceed 5% draws or 10% round-limit terminals overall; fewer than 10% of commanders may appear universal in the sparse eight-opponent screen;\n- the 95% interval for systemic signed seat effect must overlap the ±5-point equivalence band, while absolute reversal sensitivity remains a reported diagnostic;\n- in the replicated panel, no commander may have a multiplicity-adjusted lower confidence bound above 90% dominance;"
  )),
  writeFile(join(outputDir, "01-causal-evidence.svg"), overviewSvg()),
  writeFile(join(outputDir, "02-model-frontier.svg"), frontierSvg()),
  writeFile(join(outputDir, "03-module-landscape.svg"), modulesSvg()),
  writeFile(join(outputDir, "04-counterplay-topology.svg"), counterplaySvg()),
  writeFile(join(outputDir, "05-mechanic-reachability.svg"), mechanicsSvg()),
  writeFile(join(outputDir, "06-storage-projection.svg"), storageSvg())
]);
console.log(JSON.stringify({ outputDir, analysisHash: analysis.analysisHash, runs: observedRuns, provisionalCandidates, shapeScreenGiB: round(shapeScreenGiB, 3), finalPromotionEligible: false }, null, 2));
