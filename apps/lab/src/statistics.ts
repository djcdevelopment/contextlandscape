export type ConfidenceInterval = {
  estimate: number;
  lower: number;
  upper: number;
  confidence: number;
};

const DEFAULT_Z = 1.959963984540054;

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

/** Wilson score interval for a binomial proportion. */
export function wilsonInterval(successes: number, total: number, z = DEFAULT_Z): ConfidenceInterval {
  if (!Number.isInteger(successes) || !Number.isInteger(total) || successes < 0 || total <= 0 || successes > total) {
    throw new RangeError("Wilson interval requires 0 <= successes <= total and total > 0");
  }
  finite(z, "z");
  const proportion = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = (proportion + z2 / (2 * total)) / denominator;
  const margin = z * Math.sqrt((proportion * (1 - proportion) + z2 / (4 * total)) / total) / denominator;
  return {
    estimate: proportion,
    lower: successes === 0 ? 0 : Math.max(0, center - margin),
    upper: successes === total ? 1 : Math.min(1, center + margin),
    confidence: 0.95
  };
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(sorted: number[], probability: number): number {
  if (sorted.length === 0) throw new RangeError("Cannot calculate a quantile of an empty sample");
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Deterministic percentile bootstrap. The label is part of the random stream so
 * report regeneration is stable while unrelated cells do not share resamples.
 */
export function bootstrapInterval<T>(
  samples: readonly T[],
  statistic: (sample: readonly T[]) => number,
  label: string,
  repetitions = 2000
): ConfidenceInterval {
  if (samples.length === 0) throw new RangeError("Bootstrap requires at least one sample");
  if (!Number.isInteger(repetitions) || repetitions < 100) throw new RangeError("Bootstrap repetitions must be an integer >= 100");
  const estimate = finite(statistic(samples), "bootstrap estimate");
  if (samples.length === 1) return { estimate, lower: estimate, upper: estimate, confidence: 0.95 };
  const next = random(hashSeed(label));
  const resampled: T[] = new Array(samples.length);
  const estimates = new Array<number>(repetitions);
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    for (let index = 0; index < samples.length; index += 1) {
      resampled[index] = samples[Math.floor(next() * samples.length)];
    }
    estimates[repetition] = finite(statistic(resampled), "bootstrap statistic");
  }
  estimates.sort((left, right) => left - right);
  return {
    estimate,
    lower: quantile(estimates, 0.025),
    upper: quantile(estimates, 0.975),
    confidence: 0.95
  };
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError("Mean requires at least one value");
  return values.reduce((sum, value) => sum + finite(value, "mean value"), 0) / values.length;
}

export function pairedDeltaInterval(
  pairs: readonly { left: number; right: number }[],
  label: string,
  repetitions = 2000
): ConfidenceInterval {
  return bootstrapInterval(
    pairs,
    (sample) => mean(sample.map((pair) => pair.right - pair.left)),
    label,
    repetitions
  );
}

export function normalizedDrift(progress: number, drift: number, objectiveTarget = 12): number {
  finite(progress, "progress");
  finite(drift, "drift");
  finite(objectiveTarget, "objectiveTarget");
  return objectiveTarget * drift / Math.max(1, progress);
}
