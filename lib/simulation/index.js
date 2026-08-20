/**
 * Stable scientific-core API.
 *
 * SimulationRequestV1:
 * { version:1, model, modelHash, solverConfig, runs, rootSeed,
 *   retentionMode:'raw'|'summary', requestedBackend:'auto'|'js-f64' }
 *
 * SimulationResultV1 contains
 * {version,status,runs,summaries,warnings,terminations,provenance}.
 * Each RunResult owns Float64Array `times` and row-major Float64Array `values`,
 * plus stateCount, reachedTime, eventCount, stepCount, and termination.
 * In summary retention, `runs` contains no more than 20 deterministic sample
 * paths and `summaries.ensemble` contains a 501-point grid, terminal samples,
 * streaming moments/quantiles, and solver diagnostics. Full-path export is not
 * available from a summary result.
 * `prepareSimulationRequest` compiles once; `runPreparedSimulation` executes a
 * scheduling-independent global run index; `createSimulationResultBuilder`
 * assembles their packets into the canonical result envelope.
 * Worker coordinators may pass internal `hooks.runIndices` to assign global run
 * indices without changing the public request or its deterministic streams.
 */
export * from "./errors.js";
export * from "./rng.js";
export * from "./contracts.js";
export * from "./compile-model.js";
export * from "./gillespie.js";
export * from "./ctmp.js";
export * from "./sde.js";
export * from "./progress.js";
export * from "./summary.js";
export * from "./run.js";
