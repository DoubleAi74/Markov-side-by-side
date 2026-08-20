import { createSimulationResultBuilder } from "../simulation/index.js";
import { preflightSimulationRequest, SimulationPreflightError } from "./preflight.js";

let fallbackJobSequence = 0;

function defaultPoolSize(runs, { hardwareConcurrency, constrained = false } = {}) {
  const available = Math.max(1, Number(hardwareConcurrency ?? globalThis.navigator?.hardwareConcurrency ?? 2) - 1);
  return Math.max(1, Math.min(constrained ? 2 : 4, available, runs));
}

function cancellationView() {
  try { return typeof SharedArrayBuffer === "function" ? new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)) : null; }
  catch { return null; }
}

export { defaultPoolSize, preflightSimulationRequest, SimulationPreflightError };

export class SimulationCoordinator {
  constructor({ workerFactory, hardwareConcurrency, constrained = false, cancelTimeoutMs = 1_000, deviceMemoryGiB } = {}) {
    if (typeof workerFactory !== "function") throw new TypeError("A workerFactory is required.");
    this.workerFactory = workerFactory;
    this.hardwareConcurrency = hardwareConcurrency;
    this.constrained = constrained;
    this.cancelTimeoutMs = cancelTimeoutMs;
    this.deviceMemoryGiB = deviceMemoryGiB;
    this.active = null;
  }

  preflight(request, options = {}) {
    return preflightSimulationRequest(request, { deviceMemoryGiB: options.deviceMemoryGiB ?? this.deviceMemoryGiB, ...options });
  }

  run(request, { onProgress, resourceConsent = false, pointsPerRun, deviceMemoryGiB } = {}) {
    if (this.active) throw new Error("A simulation job is already active.");
    const runs = Number(request.runs);
    if (!Number.isSafeInteger(runs) || runs < 1) throw new RangeError("runs must be a positive safe integer.");
    const preflight = this.preflight(request, { pointsPerRun, deviceMemoryGiB });
    if (preflight.allowed === false && !resourceConsent) throw new SimulationPreflightError(preflight);
    const jobId = globalThis.crypto?.randomUUID?.() ?? `job-${Date.now()}-${fallbackJobSequence += 1}`;
    const poolSize = defaultPoolSize(runs, { hardwareConcurrency: this.hardwareConcurrency, constrained: this.constrained });
    const queue = Array.from({ length: runs }, (_, index) => index);
    const workers = [], cancelView = cancellationView();
    const builder = createSimulationResultBuilder(request, { totalRuns: runs });

    const promise = new Promise((resolve, reject) => {
      const active = {
        jobId, request, queue, workers, resolve, reject, onProgress, builder, preflight, cancelView,
        received: new Set(), completed: 0, startedAt: performance.now(), lastProgressAt: 0, cancelled: false, cancelTimer: null,
      };
      this.active = active;
      for (let index = 0; index < poolSize; index++) {
        const worker = this.workerFactory();
        workers.push(worker);
        worker.onmessage = (event) => this.#onMessage(active, worker, event.data);
        worker.onerror = (event) => this.#fail(active, event.error ?? new Error(event.message ?? "Simulation worker failed."));
        worker.postMessage({ type: "prepare", jobId, request, cancellationBuffer: cancelView?.buffer });
      }
    });
    return { jobId, promise, preflight, cancel: () => this.cancel(jobId) };
  }

  cancel(jobId = this.active?.jobId) {
    const active = this.active;
    if (!active || active.jobId !== jobId || active.cancelled) return false;
    active.cancelled = true;
    active.queue.length = 0;
    if (active.cancelView) Atomics.store(active.cancelView, 0, 1);
    for (const worker of active.workers) worker.postMessage({ type: "cancel", jobId });
    active.cancelTimer = setTimeout(() => this.#finishCancelled(active, true), this.cancelTimeoutMs);
    return true;
  }

  #dispatch(active, worker) {
    if (active.cancelled) return;
    const runIndex = active.queue.shift();
    if (runIndex === undefined) {
      if (active.completed === active.request.runs) this.#complete(active);
      return;
    }
    worker.postMessage({ type: "run", jobId: active.jobId, runIndex });
  }

  #report(active, detail = {}) {
    const current = performance.now();
    if (!detail.force && current - active.lastProgressAt < 250) return;
    active.lastProgressAt = current;
    active.onProgress?.({ jobId: active.jobId, completed: active.completed, total: active.request.runs, ...detail, force: undefined });
  }

  #onMessage(active, worker, message) {
    if (this.active !== active || message?.jobId !== active.jobId) return;
    if (message.type === "ready") return this.#dispatch(active, worker);
    if (message.type === "run-progress") { this.#report(active, { activeRunIndex: message.runIndex, runProgress: message.progress }); return; }
    if (message.type === "cancelled") {
      worker.__markovCancelled = true;
      if (active.workers.every((item) => item.__markovCancelled)) this.#finishCancelled(active, false);
      return;
    }
    if (message.type === "error") return this.#fail(active, Object.assign(new Error(message.error?.message ?? "Worker simulation failed."), message.error));
    if (message.type !== "result") return;
    if (!active.received.has(message.runIndex)) {
      active.received.add(message.runIndex);
      active.builder.add(message.packet ?? { status: "success", run: message.result, warnings: message.warnings ?? [] });
      active.completed++;
    }
    this.#report(active, { force: active.completed === active.request.runs });
    if (!active.cancelled) this.#dispatch(active, worker);
  }

  #complete(active) {
    if (this.active !== active) return;
    for (const worker of active.workers) worker.terminate();
    this.active = null;
    const durationMs = performance.now() - active.startedAt;
    const result = active.builder.finish({ durationMs });
    result.jobId = active.jobId;
    result.execution = { preflight: active.preflight, forcedCancellation: false };
    active.resolve(result);
  }

  #finishCancelled(active, forced) {
    if (this.active !== active) return;
    clearTimeout(active.cancelTimer);
    for (const worker of active.workers) worker.terminate();
    this.active = null;
    const durationMs = performance.now() - active.startedAt;
    const result = active.builder.finish({ status: "cancelled", forced, durationMs });
    result.jobId = active.jobId;
    result.execution = { preflight: active.preflight, forcedCancellation: forced };
    active.resolve(result);
  }

  #fail(active, error) {
    if (this.active !== active) return;
    clearTimeout(active.cancelTimer);
    for (const worker of active.workers) worker.terminate();
    this.active = null;
    active.reject(error);
  }
}

export function createBrowserCoordinator(options = {}) {
  return new SimulationCoordinator({
    ...options,
    deviceMemoryGiB: options.deviceMemoryGiB ?? globalThis.navigator?.deviceMemory,
    workerFactory: options.workerFactory ?? (() => new Worker(new URL("./simulation-worker.js", import.meta.url), { type: "module" })),
  });
}
