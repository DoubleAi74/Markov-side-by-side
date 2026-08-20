import { prepareSimulationRequest, runPreparedSimulation } from "../simulation/index.js";

const jobs = new Map();

function serialiseError(error) {
  return { name: error.name, code: error.code ?? "WORKER_ERROR", message: error.message, details: error.details };
}

function cancellationSignal(buffer) {
  if (typeof SharedArrayBuffer !== "function" || !(buffer instanceof SharedArrayBuffer)) return { aborted: false };
  const view = new Int32Array(buffer);
  return { get aborted() { return Atomics.load(view, 0) !== 0; } };
}

self.onmessage = ({ data }) => {
  const { type, jobId } = data ?? {};
  if (type === "prepare") {
    try {
      const prepared = prepareSimulationRequest(data.request);
      jobs.set(jobId, { prepared, signal: cancellationSignal(data.cancellationBuffer), cancelled: false });
      self.postMessage({ type: "ready", jobId, prepared: { modelHash: prepared.modelHash, solver: prepared.solver, solverVersion: prepared.solverVersion } });
    } catch (error) {
      self.postMessage({ type: "error", jobId, error: serialiseError(error) });
    }
    return;
  }
  const job = jobs.get(jobId);
  if (!job) return;
  if (type === "cancel") {
    job.cancelled = true;
    jobs.delete(jobId);
    self.postMessage({ type: "cancelled", jobId });
    return;
  }
  if (type !== "run" || job.cancelled) return;
  try {
    const packet = runPreparedSimulation(job.prepared, data.runIndex, {
      signal: job.signal,
      onProgress: (progress) => self.postMessage({ type: "run-progress", jobId, runIndex: data.runIndex, progress }),
    });
    const run = packet.run;
    const transfer = [run.times.buffer, run.values.buffer];
    if (ArrayBuffer.isView(run.transitionIds)) transfer.push(run.transitionIds.buffer);
    self.postMessage({ type: "result", jobId, runIndex: data.runIndex, packet }, transfer);
  } catch (error) {
    self.postMessage({ type: "error", jobId, error: serialiseError(error) });
  }
};
