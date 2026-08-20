export const REFERENCE_BACKEND = Object.freeze({ id: "js", precision: "f64", label: "JavaScript reference (f64)" });

export function wasmAutoDecision(report) {
  const accepted = Boolean(
    report?.conformant
    && report.stressSpeedup >= 1.5
    && report.memoryRatio <= 1.25
    && report.smallJobRatio <= 1.1,
  );
  return {
    accepted,
    backend: accepted ? "wasm" : "js",
    precision: "f64",
    reasons: accepted ? [] : [
      !report?.conformant && "f64 conformance has not passed",
      !(report?.stressSpeedup >= 1.5) && "stress speed-up is below 1.5×",
      !(report?.memoryRatio <= 1.25) && "memory use exceeds 1.25× reference",
      !(report?.smallJobRatio <= 1.1) && "small-job regression exceeds 10%",
    ].filter(Boolean),
  };
}

export function gpuCalibration(reference, candidate, tolerance = {}) {
  const meanScale = Math.max(1, Math.abs(reference.mean));
  const meanRelativeDelta = Math.abs(candidate.mean - reference.mean) / meanScale;
  const varianceRatio = reference.variance > 0 ? candidate.variance / reference.variance : candidate.variance === 0 ? 1 : Infinity;
  const finite = [candidate.mean, candidate.variance].every(Number.isFinite);
  const passed = finite
    && meanRelativeDelta <= (tolerance.meanRelative ?? 0.05)
    && varianceRatio >= (tolerance.varianceRatioMin ?? 0.8)
    && varianceRatio <= (tolerance.varianceRatioMax ?? 1.25);
  return { passed, finite, meanRelativeDelta, varianceRatio };
}

export function webGpuAvailability({ supported, stateUpdates, measuredSpeedup, calibration }) {
  const available = Boolean(supported && stateUpdates >= 10_000_000 && measuredSpeedup >= 3 && calibration?.passed);
  return {
    available,
    autoEligible: false,
    id: "webgpu-experimental",
    precision: "f32",
    label: "Experimental approximate (f32)",
    reasons: available ? [] : [
      !supported && "WebGPU is unavailable",
      stateUpdates < 10_000_000 && "workload is below ten million state updates",
      measuredSpeedup < 3 && "measured speed-up is below 3×",
      !calibration?.passed && "f64 calibration did not pass",
    ].filter(Boolean),
  };
}
