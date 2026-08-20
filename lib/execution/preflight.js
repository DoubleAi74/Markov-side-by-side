import { preflightRawResult } from "../analysis/resource-budget.js";

function inferredPointsPerRun(request) {
  const settings = { ...(request.model?.settings ?? {}), ...(request.solverConfig ?? {}) };
  if (request.model?.solverFamily === "sde" && Number.isFinite(settings.tMax) && Number.isFinite(settings.dt) && settings.dt > 0) return Math.ceil(settings.tMax / settings.dt) + 1;
  if (Number.isSafeInteger(settings.maxEvents) && settings.maxEvents >= 0) return settings.maxEvents + 2;
  return null;
}

/** Explicit raw-memory preflight API for coordinator/UI integration. */
export function preflightSimulationRequest(request, options = {}) {
  if (request?.retentionMode === "summary") {
    return { allowed: true, required: false, mode: "summary", estimatedBytes: null, budgetBytes: null, choices: [] };
  }
  const pointsPerRun = options.pointsPerRun ?? inferredPointsPerRun(request);
  if (!Number.isSafeInteger(pointsPerRun) || pointsPerRun < 1) {
    return {
      allowed: null,
      required: true,
      mode: "raw",
      reason: "POINT_ESTIMATE_REQUIRED",
      estimatedBytes: null,
      budgetBytes: null,
      choices: ["summary", "reduced-recording", "fewer-runs", "solver-settings", "native-export"],
    };
  }
  return {
    ...preflightRawResult({ runs: request.runs, pointsPerRun, variables: request.model?.variables?.length ?? 0, transitionIds: options.transitionIds ?? false }, options.deviceMemoryGiB),
    required: true,
    mode: "raw",
    pointsPerRun,
  };
}

export class SimulationPreflightError extends Error {
  constructor(preflight) {
    super("Raw simulation output exceeds the device memory budget; choose a retention alternative explicitly.");
    this.name = "SimulationPreflightError";
    this.code = "RAW_RESULT_BUDGET_EXCEEDED";
    this.preflight = preflight;
  }
}
