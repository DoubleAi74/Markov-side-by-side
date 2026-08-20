const DEFAULT_DATASET_LIMIT = 2_000;

function assertAligned(times, values) {
  if (!(times instanceof Float64Array) || !(values instanceof Float64Array)) {
    throw new TypeError("Analysis requires Float64Array inputs.");
  }
  if (times.length !== values.length) {
    throw new RangeError("Time and value buffers must have equal length.");
  }
}

/**
 * Deterministic min/max decimation for display data. The source buffers are
 * never modified. Each bucket contributes its temporal extrema in source order.
 */
export function decimateContinuous(times, values, limit = DEFAULT_DATASET_LIMIT) {
  assertAligned(times, values);
  if (!Number.isInteger(limit) || limit < 4) throw new RangeError("limit must be at least 4");
  if (times.length <= limit) return { times: times.slice(), values: values.slice() };

  const interiorBudget = limit - 2;
  const bucketCount = Math.max(1, Math.floor(interiorBudget / 2));
  const width = (times.length - 2) / bucketCount;
  const selected = [0];

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = 1 + Math.floor(bucket * width);
    const end = Math.min(times.length - 1, 1 + Math.floor((bucket + 1) * width));
    if (start >= end) continue;
    let minIndex = start;
    let maxIndex = start;
    for (let index = start + 1; index < end; index += 1) {
      if (values[index] < values[minIndex]) minIndex = index;
      if (values[index] > values[maxIndex]) maxIndex = index;
    }
    if (minIndex === maxIndex) selected.push(minIndex);
    else if (minIndex < maxIndex) selected.push(minIndex, maxIndex);
    else selected.push(maxIndex, minIndex);
  }
  selected.push(times.length - 1);

  const unique = [...new Set(selected)].slice(0, limit);
  return {
    times: Float64Array.from(unique, (index) => times[index]),
    values: Float64Array.from(unique, (index) => values[index]),
  };
}

/** Preserve visible vertical jump edges by emitting both sides of chosen jumps. */
export function decimateStep(times, values, limit = DEFAULT_DATASET_LIMIT) {
  assertAligned(times, values);
  if (times.length <= limit) return { times: times.slice(), values: values.slice() };
  if (limit < 4) throw new RangeError("limit must be at least 4");

  const jumps = [];
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] !== values[index - 1]) {
      jumps.push({ index, magnitude: Math.abs(values[index] - values[index - 1]) });
    }
  }
  const jumpBudget = Math.max(1, Math.floor((limit - 2) / 2));
  const kept = jumps.length <= jumpBudget
    ? jumps
    : jumps
        .slice()
        .sort((a, b) => b.magnitude - a.magnitude || a.index - b.index)
        .slice(0, jumpBudget)
        .sort((a, b) => a.index - b.index);
  const selected = new Set([0, times.length - 1]);
  for (const { index } of kept) {
    selected.add(index - 1);
    selected.add(index);
  }
  const indices = [...selected].sort((a, b) => a - b).slice(0, limit);
  return {
    times: Float64Array.from(indices, (index) => times[index]),
    values: Float64Array.from(indices, (index) => values[index]),
  };
}
