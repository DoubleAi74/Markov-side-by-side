const DB_NAME = "markov-lab-local";
const DB_VERSION = 2;
const STORE = "runs";
const MAX_RECENT_PER_MODEL = 100;
const MAX_PRESERVED_PER_MODEL = 20;
let fallbackSequence = 0;

function openDatabase(indexedDBImpl = globalThis.indexedDB) {
  if (!indexedDBImpl) return Promise.reject(new Error("IndexedDB is unavailable."));
  return new Promise((resolve, reject) => {
    const request = indexedDBImpl.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("drafts")) {
        const drafts = database.createObjectStore("drafts", { keyPath: "key" });
        drafts.createIndex("updatedAt", "updatedAt");
      }
      if (!database.objectStoreNames.contains(STORE)) {
        const runs = database.createObjectStore(STORE, { keyPath: "key" });
        runs.createIndex("modelKey", "modelKey");
        runs.createIndex("completedAt", "completedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestResult(database, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const request = operation(transaction.objectStore(STORE));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function allForModel(modelKey, options = {}) {
  const database = await openDatabase(options.indexedDBImpl);
  const values = await requestResult(database, "readonly", (store) => store.index("modelKey").getAll(String(modelKey)));
  return values.sort((left, right) => String(right.completedAt).localeCompare(String(left.completedAt)));
}

async function removeKeys(keys, options = {}) {
  for (const key of keys) {
    const database = await openDatabase(options.indexedDBImpl);
    await requestResult(database, "readwrite", (store) => store.delete(key));
  }
}

export async function saveLocalRun(modelKey, record, options = {}) {
  const id = globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${fallbackSequence += 1}`;
  const value = structuredClone({
    ...record,
    id,
    key: `${String(modelKey)}:${id}`,
    modelKey: String(modelKey),
    preserved: false,
    completedAt: record.completedAt ?? new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
  const database = await openDatabase(options.indexedDBImpl);
  await requestResult(database, "readwrite", (store) => store.put(value));
  const all = await allForModel(modelKey, options);
  const recent = all.filter((entry) => !entry.preserved);
  await removeKeys(recent.slice(MAX_RECENT_PER_MODEL).map((entry) => entry.key), options);
  return value;
}

export async function listLocalRuns(modelKey, { limit = 20, ...options } = {}) {
  return (await allForModel(modelKey, options)).slice(0, Math.max(1, Math.min(100, limit))).map((entry) => structuredClone(entry));
}

export async function setLocalRunPreserved(modelKey, id, preserved, options = {}) {
  const all = await allForModel(modelKey, options);
  const target = all.find((entry) => entry.id === id);
  if (!target) throw new Error("Local run was not found.");
  if (preserved && !target.preserved && all.filter((entry) => entry.preserved).length >= MAX_PRESERVED_PER_MODEL) {
    throw new Error(`At most ${MAX_PRESERVED_PER_MODEL} local runs can be preserved per model.`);
  }
  const updated = { ...target, preserved: Boolean(preserved) };
  const database = await openDatabase(options.indexedDBImpl);
  await requestResult(database, "readwrite", (store) => store.put(updated));
  return structuredClone(updated);
}

function terminalSummary(outcome, variables) {
  const terminal = outcome.summaries?.ensemble?.terminal;
  if (terminal?.mean) return variables.map((variable, index) => ({
    variableId: variable.id,
    label: variable.label || variable.name,
    mean: terminal.mean[index],
    variance: terminal.variance[index],
    q05: terminal.quantiles?.["0.05"]?.[index],
    q50: terminal.quantiles?.["0.5"]?.[index],
    q95: terminal.quantiles?.["0.95"]?.[index],
  }));
  return variables.map((variable, variableIndex) => {
    const samples = (outcome.runs ?? []).flatMap((run) => {
      const row = run.times.length - 1;
      const value = row >= 0 ? run.values[row * variables.length + variableIndex] : Number.NaN;
      return Number.isFinite(value) ? [value] : [];
    });
    return { variableId: variable.id, label: variable.label || variable.name, mean: samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : null };
  });
}

/** Store exact inputs and bounded summaries locally; raw trajectory buffers are excluded. */
export function createLocalRunRecord(request, outcome) {
  return {
    inputSnapshot: structuredClone(request.model),
    seed: request.rootSeed,
    solver: { name: outcome.provenance?.solver ?? request.solverConfig.solver, version: outcome.provenance?.solverVersion ?? "unknown" },
    backend: { name: "js-worker", precision: outcome.provenance?.precision ?? "f64" },
    warnings: structuredClone(outcome.warnings ?? []),
    summary: {
      runCount: request.runs,
      retainedRunCount: outcome.runs?.length ?? 0,
      retentionMode: request.retentionMode,
      terminal: terminalSummary(outcome, request.model.variables ?? []),
      diagnostics: structuredClone(outcome.summaries?.ensemble?.diagnostics ?? { terminations: outcome.terminations ?? [] }),
    },
    status: outcome.status === "success" ? "complete" : outcome.status === "cancelled" ? "cancelled" : outcome.status === "failed" ? "failed" : "truncated",
    completedAt: outcome.provenance?.finishedAt ?? new Date().toISOString(),
  };
}
