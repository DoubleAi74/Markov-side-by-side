import { sha256Hex } from "../model-v2/hash.js";
import { compileModelV2 } from "./compile-model.js";
import { validateSimulationRequest } from "./contracts.js";
import { runIntegratedHazardCTMP, runPiecewiseFrozenCTMP } from "./ctmp.js";
import { SimulationError } from "./errors.js";
import { runGillespie } from "./gillespie.js";
import { createRunRng } from "./rng.js";
import { runSDE } from "./sde.js";
import { SummaryAccumulator } from "./summary.js";

export const SOLVER_VERSIONS = Object.freeze({
  "gillespie-direct-v2": "2.0.0",
  "ctmp-piecewise-frozen-v1": "1.0.0",
  "ctmp-integrated-hazard-v1": "1.0.0",
  "euler-maruyama-v2": "2.0.0",
  "milstein-diagonal-v1": "1.0.0",
});

const FAMILY_SOLVERS = Object.freeze({
  gillespie: new Set(["gillespie-direct-v2"]),
  "ctmp-inhomo": new Set(["ctmp-piecewise-frozen-v1", "ctmp-integrated-hazard-v1"]),
  sde: new Set(["euler-maruyama-v2", "milstein-diagonal-v1"]),
});

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

/** Validate, hash-check, and compile a request once for repeated per-run execution. */
export function prepareSimulationRequest(request) {
  const checked = validateSimulationRequest(request);
  if (!checked.ok) throw new SimulationError("INVALID_REQUEST", "Simulation request validation failed.", { issues: checked.issues });
  const actualHash = sha256Hex(request.model);
  if (actualHash !== request.modelHash) throw new SimulationError("MODEL_HASH_MISMATCH", "Request model hash does not match its model snapshot.", { expected: request.modelHash, actual: actualHash });
  const compiled = compileModelV2(request.model);
  const solver = request.solverConfig?.solver ?? compiled.model.settings.solver;
  if (!SOLVER_VERSIONS[solver] || !FAMILY_SOLVERS[compiled.model.solverFamily]?.has(solver)) throw new SimulationError("UNKNOWN_SOLVER", `Solver ${JSON.stringify(solver)} is incompatible with ${compiled.model.solverFamily}.`);
  return Object.freeze({ request, model: compiled.model, modelHash: actualHash, solver, solverVersion: SOLVER_VERSIONS[solver], preparedAt: new Date().toISOString() });
}

/** Execute one deterministic global run index against an already-compiled model. */
export function runPreparedSimulation(prepared, runIndex, hooks = {}) {
  if (!prepared?.model || !Number.isSafeInteger(runIndex) || runIndex < 0) throw new SimulationError("INVALID_RUN_INDEX", "Prepared execution requires a non-negative safe run index.");
  const rng = createRunRng(prepared.request.rootSeed, runIndex);
  const options = {
    ...prepared.model.settings,
    ...prepared.request.solverConfig,
    rng,
    runIndex,
    signal: hooks.signal,
    onProgress: hooks.onProgress,
  };
  let outcome;
  if (prepared.solver === "gillespie-direct-v2") outcome = runGillespie(prepared.model, options);
  else if (prepared.solver === "ctmp-piecewise-frozen-v1") outcome = runPiecewiseFrozenCTMP(prepared.model, options);
  else if (prepared.solver === "ctmp-integrated-hazard-v1") outcome = runIntegratedHazardCTMP(prepared.model, options);
  else outcome = runSDE(prepared.model, { ...options, method: prepared.solver });
  return {
    status: outcome.status,
    run: outcome.run,
    warnings: (outcome.warnings ?? []).map((warning) => ({ ...warning, runIndex })),
  };
}

export class SimulationResultBuilder {
  constructor(request, options = {}) {
    this.request = request;
    this.solver = options.solver ?? request.solverConfig?.solver ?? request.model.settings.solver;
    this.solverVersion = options.solverVersion ?? SOLVER_VERSIONS[this.solver];
    this.modelHash = options.modelHash ?? request.modelHash;
    this.expectedRuns = options.totalRuns ?? request.runs;
    this.startedAt = options.startedAt ?? new Date().toISOString();
    this.startedClock = options.startedClock ?? now();
    this.rawRuns = [];
    this.warnings = [];
    this.terminations = [];
    this.summary = request.retentionMode === "summary" ? new SummaryAccumulator(request, this.expectedRuns) : null;
  }

  add(packet) {
    if (!packet?.run) throw new TypeError("Simulation packet requires a RunResult.");
    this.warnings.push(...(packet.warnings ?? []));
    this.terminations.push({ ...packet.run.termination, runIndex: packet.run.runIndex });
    if (this.summary) this.summary.add(packet);
    else this.rawRuns.push(packet.run);
  }

  finish(options = {}) {
    const summary = this.summary?.finish() ?? null;
    const runs = summary ? summary.samplePaths : this.rawRuns;
    runs.sort((a, b) => a.runIndex - b.runIndex);
    this.warnings.sort((a, b) => (a.runIndex ?? -1) - (b.runIndex ?? -1));
    this.terminations.sort((a, b) => a.runIndex - b.runIndex);
    const failed = this.terminations.filter((termination) => termination.kind === "error");
    const cancelled = options.status === "cancelled" || failed.some((termination) => termination.code === "CANCELLED");
    const incomplete = this.terminations.length < this.expectedRuns;
    const status = cancelled ? "cancelled" : failed.length === 0 && !incomplete ? "success" : failed.length === this.terminations.length && !incomplete ? "failed" : "partial";
    const finishedAt = options.finishedAt ?? new Date().toISOString();
    const durationMs = options.durationMs ?? now() - this.startedClock;
    let summaries = null;
    if (summary) {
      const { samplePaths: _samplePaths, ...boundedSummary } = summary;
      summaries = { ensemble: boundedSummary };
    }
    return {
      version: 1,
      status,
      runs,
      summaries,
      warnings: this.warnings,
      terminations: this.terminations,
      provenance: {
        modelSnapshot: this.request.model,
        modelHash: this.modelHash,
        seed: this.request.rootSeed,
        prng: "xoshiro256**/splitmix64-v1",
        solver: this.solver,
        solverVersion: this.solverVersion,
        backend: "js",
        precision: "f64",
        startedAt: this.startedAt,
        finishedAt,
        durationMs,
        retentionMode: this.request.retentionMode ?? "raw",
        requestedBackend: this.request.requestedBackend ?? "auto",
        completionStatus: cancelled ? "cancelled" : failed.length || incomplete ? "with-errors" : "complete",
        ...(options.forced != null ? { forcedCancellation: Boolean(options.forced) } : {}),
      },
    };
  }
}

export function createSimulationResultBuilder(request, options) {
  return new SimulationResultBuilder(request, options);
}

/**
 * Execute SimulationRequestV1 synchronously in the calling worker.
 * Compilation occurs once, regardless of the number of requested runs.
 */
export function runSimulationRequest(request, hooks = {}) {
  const prepared = prepareSimulationRequest(request);
  const runIndices = hooks.runIndices ?? Array.from({ length: request.runs }, (_, index) => index);
  if (!Array.isArray(runIndices) || runIndices.length !== request.runs || runIndices.some((index) => !Number.isSafeInteger(index) || index < 0)) throw new SimulationError("INVALID_RUN_INDICES", "Internal runIndices must contain one non-negative safe integer for each requested run.");
  const totalRuns = hooks.totalRuns ?? Math.max(request.runs, ...runIndices.map((index) => index + 1));
  const builder = createSimulationResultBuilder(request, { solver: prepared.solver, solverVersion: prepared.solverVersion, modelHash: prepared.modelHash, totalRuns });
  for (let slot = 0; slot < runIndices.length; slot++) {
    const packet = runPreparedSimulation(prepared, runIndices[slot], {
      signal: hooks.signal,
      onProgress: (progress) => hooks.onProgress?.({ completedRuns: slot, totalRuns: runIndices.length, runIndex: runIndices[slot], runProgress: progress }),
    });
    builder.add(packet);
    hooks.onProgress?.({ completedRuns: slot + 1, totalRuns: runIndices.length, runIndex: runIndices[slot] });
    if (packet.run.termination?.code === "CANCELLED") break;
  }
  return builder.finish();
}
