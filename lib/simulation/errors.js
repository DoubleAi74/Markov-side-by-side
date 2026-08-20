export class SimulationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "SimulationError";
    this.code = code;
    this.details = details;
  }

  toTermination(time = 0, state = null) {
    return { kind: "error", code: this.code, message: this.message, time, state, details: this.details };
  }
}

export function assertFinite(value, code, message, details) {
  if (!Number.isFinite(value)) throw new SimulationError(code, message, details);
  return value;
}
