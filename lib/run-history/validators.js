export class RunHistoryValidationError extends Error {}

const FORBIDDEN_RAW_KEYS = new Set([
  "trajectories",
  "trajectory",
  "runBuffers",
  "rawBuffers",
  "csv",
]);

function assert(condition, message) {
  if (!condition) throw new RunHistoryValidationError(message);
}

function boundedJson(value, label, maxBytes = 512 * 1024) {
  let encoded;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new RunHistoryValidationError(`${label} must be serialisable JSON.`);
  }
  assert(encoded && Buffer.byteLength(encoded, "utf8") <= maxBytes, `${label} exceeds the storage limit.`);
  return JSON.parse(encoded);
}

function assertNoRawTrajectories(value, path = "run") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRawTrajectories(item, `${path}[${index}]`));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    assert(!FORBIDDEN_RAW_KEYS.has(key), `${path}.${key} cannot be stored in run history.`);
    assertNoRawTrajectories(item, `${path}.${key}`);
  }
}

export function validateCreateRunInput(input) {
  assert(input && typeof input === "object" && !Array.isArray(input), "Request body must be an object.");
  const seed = String(input.seed ?? "").trim();
  assert(/^(0|[1-9][0-9]{0,19})$/.test(seed), "seed must be a uint64 decimal string.");
  try {
    assert(BigInt(seed) <= 18446744073709551615n, "seed must be a uint64 decimal string.");
  } catch {
    throw new RunHistoryValidationError("seed must be a uint64 decimal string.");
  }
  assert(["complete", "failed", "cancelled", "truncated"].includes(input.status), "Invalid run status.");
  const normalized = {
    inputSnapshot: boundedJson(input.inputSnapshot, "inputSnapshot"),
    seed,
    solver: boundedJson(input.solver, "solver", 32 * 1024),
    backend: boundedJson(input.backend, "backend", 16 * 1024),
    warnings: boundedJson(input.warnings ?? [], "warnings", 64 * 1024),
    summary: boundedJson(input.summary, "summary"),
    status: input.status,
    completedAt: input.completedAt ? new Date(input.completedAt) : null,
  };
  assert(normalized.inputSnapshot && typeof normalized.inputSnapshot === "object", "inputSnapshot is required.");
  assert(normalized.summary && typeof normalized.summary === "object", "summary is required.");
  assertNoRawTrajectories(normalized);
  if (normalized.completedAt) assert(Number.isFinite(normalized.completedAt.getTime()), "completedAt is invalid.");
  return normalized;
}

export function validateUpdateRunInput(input) {
  assert(input && typeof input === "object" && !Array.isArray(input), "Request body must be an object.");
  const output = {};
  if ("label" in input) {
    assert(typeof input.label === "string" && input.label.trim().length <= 120, "label must be at most 120 characters.");
    output.label = input.label.trim();
  }
  if ("notes" in input) {
    assert(typeof input.notes === "string" && input.notes.trim().length <= 1000, "notes must be at most 1000 characters.");
    output.notes = input.notes.trim();
  }
  if ("preserved" in input) {
    assert(typeof input.preserved === "boolean", "preserved must be a boolean.");
    output.preserved = input.preserved;
  }
  assert(Object.keys(output).length > 0, "No mutable run fields were provided.");
  return output;
}
