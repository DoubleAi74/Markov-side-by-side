export function rawResultBudgetBytes(deviceMemoryGiB) {
  if (!Number.isFinite(deviceMemoryGiB)) return 128 * 1024 ** 2;
  if (deviceMemoryGiB <= 2) return 64 * 1024 ** 2;
  if (deviceMemoryGiB <= 4) return 128 * 1024 ** 2;
  return 256 * 1024 ** 2;
}

export function estimateRawResultBytes({ runs, pointsPerRun, variables, transitionIds = false }) {
  for (const [label, value] of Object.entries({ runs, pointsPerRun, variables })) {
    if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer`);
  }
  const floats = runs * pointsPerRun * (1 + variables);
  const transitions = transitionIds ? runs * pointsPerRun * 4 : 0;
  return floats * Float64Array.BYTES_PER_ELEMENT + transitions;
}

export function preflightRawResult(request, deviceMemoryGiB) {
  const estimatedBytes = estimateRawResultBytes(request);
  const budgetBytes = rawResultBudgetBytes(deviceMemoryGiB);
  return {
    allowed: estimatedBytes <= budgetBytes,
    estimatedBytes,
    budgetBytes,
    choices: estimatedBytes <= budgetBytes
      ? []
      : ["summary", "reduced-recording", "fewer-runs", "solver-settings", "native-export"],
  };
}
