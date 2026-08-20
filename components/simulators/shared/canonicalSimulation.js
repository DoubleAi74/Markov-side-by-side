import { createBrowserCoordinator } from "@/lib/execution/coordinator";
import { sha256Hex } from "@/lib/model-v2/hash";
import { migratePayloadV1 } from "@/lib/model-v2/migrate";
import { validateModelV2 } from "@/lib/model-v2/schema";

const SOLVER_VERSIONS = Object.freeze({
  "gillespie-direct-v2": "2.0.0",
  "ctmp-piecewise-frozen-v1": "1.0.0",
  "ctmp-integrated-hazard-v1": "1.0.0",
  "euler-maruyama-v2": "2.0.0",
  "milstein-diagonal-v1": "1.0.0",
});

export function makeClientNamespace(prefix = "model") {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}`;
}

export function canonicalModelFromSerialized(
  serialized,
  { simulatorType, seed, runs, namespace },
) {
  let model;
  if (serialized?.payloadVersion === 2) {
    model = structuredClone(serialized.payload);
  } else {
    const migration = migratePayloadV1(
      {
        payloadVersion: 1,
        simulatorType,
        payload: serialized?.payload,
      },
      { seed, namespace },
    );
    if (migration.needsRepair) {
      const error = new Error(
        migration.report?.join(" ") || "This model requires repair before it can run.",
      );
      error.code = "MODEL_NEEDS_REPAIR";
      error.details = { issues: migration.report ?? [] };
      throw error;
    }
    model = migration.model;
  }

  model.settings = {
    ...model.settings,
    seed: String(seed),
    runs: Number(runs),
  };
  const validation = validateModelV2(model);
  if (!validation.ok) {
    const error = new Error("Model validation failed.");
    error.code = "INVALID_MODEL";
    error.details = { issues: validation.issues };
    throw error;
  }
  return model;
}

export function makeSimulationRequest(model, runs, retentionMode = "raw") {
  return {
    version: 1,
    model,
    modelHash: sha256Hex(model),
    solverConfig: {
      ...model.settings,
      solver: model.settings.solver,
    },
    runs: Number(runs),
    rootSeed: String(model.settings.seed),
    retentionMode,
    requestedBackend: "js-f64",
  };
}

export function createCanonicalCoordinator() {
  return createBrowserCoordinator();
}

export function datasetsFromRuns({ runs, model, colors, stepped = false }) {
  const variables = model.variables ?? [];
  const count = variables.length;
  const seriesCount = Math.max(1, runs.length * count);
  const pointsPerSeries = Math.max(2, Math.min(2_000, Math.floor(100_000 / seriesCount)));
  const displayIndices = (run, variableIndex) => {
    const length = run.times.length;
    if (length <= pointsPerSeries) return Array.from({ length }, (_, index) => index);
    const indices = new Set([0, length - 1]);
    const buckets = Math.max(1, Math.floor((pointsPerSeries - 2) / 2));
    for (let bucket = 0; bucket < buckets; bucket += 1) {
      const start = 1 + Math.floor((bucket * (length - 2)) / buckets);
      const end = 1 + Math.floor(((bucket + 1) * (length - 2)) / buckets);
      let minIndex = start;
      let maxIndex = start;
      for (let index = start + 1; index < end; index += 1) {
        const value = run.values[index * count + variableIndex];
        if (value < run.values[minIndex * count + variableIndex]) minIndex = index;
        if (value > run.values[maxIndex * count + variableIndex]) maxIndex = index;
      }
      indices.add(minIndex);
      indices.add(maxIndex);
    }
    return [...indices].sort((a, b) => a - b).slice(0, pointsPerSeries);
  };
  return runs.flatMap((run) =>
    variables.map((variable, variableIndex) => {
      const color = colors[variableIndex % colors.length];
      const indices = displayIndices(run, variableIndex);
      const dataset = {
        label: variable.label || variable.name,
        data: indices.map((rowIndex) => ({
          x: run.times[rowIndex],
          y: run.values[rowIndex * count + variableIndex],
        })),
        borderColor: color,
        backgroundColor: color,
        borderWidth: runs.length > 10 ? 1 : 1.5,
        stepped: stepped ? "after" : false,
        pointRadius: 0,
        runIndex: run.runIndex,
        variableIndex,
        variableId: variable.id,
        variableLabel: variable.label || variable.name,
        termination: run.termination,
        retainedPointCount: run.times.length,
      };
      Object.defineProperties(dataset, {
        rawTimes: { value: run.times },
        rawValues: { value: run.values },
        rawStateCount: { value: count },
        rawVariableIndex: { value: variableIndex },
        rawTransitionIds: { value: run.transitionIds ?? [] },
        modelSnapshot: { value: model },
      });
      return dataset;
    }),
  );
}

export function buildResultProvenance(request, durationMs, status = "complete") {
  const solver = request.solverConfig.solver;
  return {
    modelHash: request.modelHash,
    seed: request.rootSeed,
    prng: "xoshiro256**/splitmix64-v1",
    solver,
    solverVersion: SOLVER_VERSIONS[solver] ?? "unknown",
    backend: "js-worker",
    precision: "f64",
    durationMs,
    completionStatus: status,
  };
}

export function resultIssues(runs) {
  return runs
    .filter((run) => run?.termination?.kind === "error")
    .map((run) => ({
      runIndex: run.runIndex,
      code: run.termination.code || "RUN_FAILED",
      message: run.termination.message || "The run failed.",
      details: run.termination.details,
    }));
}

function finiteTerminalSummary(runs, variables) {
  return variables.map((variable, variableIndex) => {
    const values = runs.flatMap((run) => {
      const row = run.times?.length - 1;
      const value = row >= 0 ? run.values?.[row * variables.length + variableIndex] : Number.NaN;
      return Number.isFinite(value) ? [value] : [];
    }).sort((left, right) => left - right);
    const mean = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
    const variance = values.length > 1
      ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
      : values.length === 1 ? 0 : null;
    const at = (probability) => {
      if (!values.length) return null;
      const position = (values.length - 1) * probability;
      const lower = Math.floor(position);
      const fraction = position - lower;
      return values[lower] + fraction * ((values[lower + 1] ?? values[lower]) - values[lower]);
    };
    return {
      variableId: variable.id,
      label: variable.label || variable.name,
      included: values.length,
      excluded: runs.length - values.length,
      mean,
      variance,
      quantiles: { q05: at(0.05), q50: at(0.5), q95: at(0.95) },
    };
  });
}

/** Store only an exact input snapshot and bounded summaries, never trajectories. */
export async function persistBoundedRunHistory({ modelId, request, outcome }) {
  if (!modelId || !request?.model || !outcome) return null;
  const response = await fetch(`/api/saved-simulations/${encodeURIComponent(modelId)}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inputSnapshot: request.model,
      seed: request.rootSeed,
      solver: {
        name: outcome.provenance?.solver ?? request.solverConfig?.solver,
        version: outcome.provenance?.solverVersion ?? "unknown",
      },
      backend: {
        name: "js-worker",
        precision: outcome.provenance?.precision ?? "f64",
      },
      warnings: outcome.warnings ?? [],
      summary: {
        runCount: request.runs,
        retainedRunCount: outcome.runs?.length ?? 0,
        retentionMode: request.retentionMode,
        terminal: finiteTerminalSummary(outcome.runs ?? [], request.model.variables ?? []),
        diagnostics: outcome.summaries?.ensemble?.diagnostics ?? {
          terminations: outcome.terminations ?? [],
        },
      },
      status: outcome.status === "success" ? "complete" : outcome.status === "cancelled" ? "cancelled" : outcome.status === "failed" ? "failed" : "truncated",
      completedAt: outcome.provenance?.finishedAt ?? new Date().toISOString(),
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Run history could not be saved.");
  }
  return response.json();
}

export function formatStructuredError(error) {
  const issues = error?.details?.issues;
  if (Array.isArray(issues) && issues.length) {
    return issues
      .slice(0, 8)
      .map((issue) =>
        typeof issue === "string"
          ? issue
          : `${issue.path || issue.code || "Model"}: ${issue.message}`,
      )
      .join("\n");
  }
  return `${error?.code ? `${error.code}: ` : ""}${error?.message || "Simulation failed."}`;
}
