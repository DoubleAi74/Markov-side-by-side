const ROUTES = new Set(["gillespie", "ctmp-inhomo", "sde"]);
const OPERATIONS = new Set(["compile", "simulate", "analyse", "export"]);
const BACKENDS = new Set(["js", "wasm", "webgpu-experimental"]);
const PRECISIONS = new Set(["f64", "f32"]);

function boundedInteger(value, max) {
  return Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;
}

/** Strict allow-list: model content, seed, names, state and identity cannot pass. */
export function sanitizePerformanceTelemetry(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Telemetry payload must be an object.");
  const output = {
    schemaVersion: 1,
    route: ROUTES.has(input.route) ? input.route : null,
    operation: OPERATIONS.has(input.operation) ? input.operation : null,
    backend: BACKENDS.has(input.backend) ? input.backend : null,
    precision: PRECISIONS.has(input.precision) ? input.precision : null,
    durationMs: boundedInteger(input.durationMs, 86_400_000),
    runs: boundedInteger(input.runs, 100_000),
    stateCount: boundedInteger(input.stateCount, 10_000),
    recordedPoints: boundedInteger(input.recordedPoints, 100_000_000),
    completed: Boolean(input.completed),
  };
  if ([output.route, output.operation, output.backend, output.precision, output.durationMs].some((value) => value == null)) {
    throw new Error("Telemetry payload contains invalid required metrics.");
  }
  return output;
}
