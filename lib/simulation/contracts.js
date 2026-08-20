import { validateModelV2 } from "../model-v2/schema.js";
import { parseUint64Seed } from "./rng.js";

/**
 * Runtime validation for SimulationRequestV1.
 * @returns {{ok:boolean, issues:Array<{severity:string,code:string,path:string,message:string}>}}
 */
export function validateSimulationRequest(request) {
  const issues = [];
  const add = (path, message, code = "INVALID_REQUEST") => issues.push({ severity: "error", code, entity: null, path, range: null, message });
  if (!request || typeof request !== "object") return { ok: false, issues: [{ severity: "error", code: "INVALID_REQUEST", entity: null, path: "", range: null, message: "Request must be an object." }] };
  if (request.version !== 1) add("version", "Simulation request version must be 1.");
  const modelCheck = validateModelV2(request.model);
  issues.push(...modelCheck.issues.map((issue) => ({ ...issue, path: `model.${issue.path}` })));
  if (!(Number.isSafeInteger(request.runs) && request.runs >= 1 && request.runs <= 100000)) add("runs", "runs must be an integer from 1 to 100000.");
  try { parseUint64Seed(request.rootSeed); } catch (error) { add("rootSeed", error.message, "INVALID_SEED"); }
  if (!request.modelHash || !/^[0-9a-f]{64}$/.test(request.modelHash)) add("modelHash", "modelHash must be a SHA-256 hex digest.");
  if (!["raw", "summary"].includes(request.retentionMode ?? "raw")) add("retentionMode", "retentionMode must be raw or summary.");
  if (!["auto", "js-f64"].includes(request.requestedBackend ?? "auto")) add("requestedBackend", "Only auto and js-f64 are supported by the reference engine.");
  return { ok: issues.length === 0, issues };
}

export function isRunResult(value) {
  return value && Number.isInteger(value.runIndex) && value.times instanceof Float64Array && value.values instanceof Float64Array && Number.isInteger(value.stateCount) && value.values.length === value.times.length * value.stateCount && value.times.length > 0;
}

/** Validate the typed-buffer SimulationResultV1 boundary used by workers. */
export function validateSimulationResult(result) {
  const issues = [];
  if (result?.version !== 1) issues.push("Result version must be 1.");
  if (!["success", "partial", "failed", "cancelled"].includes(result?.status)) issues.push("Invalid result status.");
  if (!Array.isArray(result?.runs) || result.runs.some((run) => !isRunResult(run))) issues.push("Result contains an invalid RunResult.");
  if (!result?.provenance?.modelHash || !result?.provenance?.seed) issues.push("Result provenance is incomplete.");
  return { ok: issues.length === 0, issues };
}
