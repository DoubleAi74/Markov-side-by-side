const DEFAULT_REPLICATES = 100;

function axisValues(axis, defaultPoints) {
  const points = axis.points ?? defaultPoints;
  if (!Number.isInteger(points) || points < 2 || points > 501) throw new RangeError("Sweep points must be between 2 and 501.");
  if (!(Number.isFinite(axis.min) && Number.isFinite(axis.max) && axis.max > axis.min)) {
    throw new RangeError("Sweep bounds must be finite and increasing.");
  }
  return Array.from({ length: points }, (_, index) => axis.min + ((axis.max - axis.min) * index) / (points - 1));
}

function withParameters(model, assignments) {
  return {
    ...model,
    parameters: (model.parameters ?? []).map((parameter) => assignments.has(parameter.id)
      ? { ...parameter, value: assignments.get(parameter.id) }
      : parameter),
  };
}

function meanAndInterval(samples) {
  const values = samples.filter(Number.isFinite);
  if (!values.length) return { mean: Number.NaN, low: Number.NaN, high: Number.NaN, sampleSize: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.length > 1
    ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
    : 0;
  const halfWidth = 1.96 * Math.sqrt(variance / values.length);
  return { mean, low: mean - halfWidth, high: mean + halfWidth, sampleSize: values.length };
}

/**
 * Execute a one- or two-parameter sweep. simulateCell receives an exact model
 * snapshot and the same root seed for each cell, providing common random numbers.
 */
export async function runParameterSweep({ model, definition, rootSeed, simulateCell, signal, onProgress }) {
  if (typeof simulateCell !== "function") throw new TypeError("simulateCell is required");
  const axes = definition.axes ?? [];
  if (axes.length < 1 || axes.length > 2) throw new RangeError("Sweeps require one or two parameter axes.");
  const replicates = definition.replicates ?? DEFAULT_REPLICATES;
  if (!Number.isInteger(replicates) || replicates < 1 || replicates > 100_000) throw new RangeError("Invalid replicate count.");
  const values = axes.map((axis) => axisValues(axis, axes.length === 1 ? 21 : 15));
  const cells = [];
  for (const first of values[0]) {
    for (const second of values[1] ?? [null]) cells.push([first, second]);
  }

  const output = [];
  for (let index = 0; index < cells.length; index += 1) {
    if (signal?.aborted) return { status: "cancelled", cells: output };
    const assignments = new Map([[axes[0].parameterId, cells[index][0]]]);
    if (axes[1]) assignments.set(axes[1].parameterId, cells[index][1]);
    try {
      const response = await simulateCell({
        model: withParameters(model, assignments),
        rootSeed,
        replicates,
        response: definition.response,
        commonRandomNumbers: definition.commonRandomNumbers !== false,
        signal,
      });
      const samples = Array.isArray(response) ? response : response.samples;
      output.push({ coordinates: cells[index], ...meanAndInterval(samples), status: "valid" });
    } catch (error) {
      output.push({ coordinates: cells[index], status: "invalid", error: { code: error.code ?? "CELL_FAILED", message: error.message } });
    }
    onProgress?.({ completed: index + 1, total: cells.length });
  }
  return { status: "completed", axes: axes.map((axis, index) => ({ ...axis, values: values[index] })), cells: output, replicates, rootSeed };
}

export async function centredSensitivity({ model, parameterId, value, relativeStep = 0.01, evaluate }) {
  const step = Math.max(Math.abs(value) * relativeStep, relativeStep);
  const lowerModel = withParameters(model, new Map([[parameterId, value - step]]));
  const upperModel = withParameters(model, new Map([[parameterId, value + step]]));
  const [lower, upper] = await Promise.all([evaluate(lowerModel), evaluate(upperModel)]);
  return { parameterId, value, step, derivative: (upper - lower) / (2 * step), lower, upper, method: "centred-finite-difference" };
}
