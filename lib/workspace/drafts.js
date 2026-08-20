const DB_NAME = "markov-lab-local";
const DB_VERSION = 2;
const STORE = "drafts";
const RUN_STORE = "runs";
const MAX_DRAFTS = 20;

function openDatabase(indexedDBImpl = globalThis.indexedDB) {
  if (!indexedDBImpl) return Promise.reject(new Error("IndexedDB is unavailable."));
  return new Promise((resolve, reject) => {
    const request = indexedDBImpl.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("updatedAt", "updatedAt");
      }
      if (!database.objectStoreNames.contains(RUN_STORE)) {
        const runs = database.createObjectStore(RUN_STORE, { keyPath: "key" });
        runs.createIndex("modelKey", "modelKey");
        runs.createIndex("completedAt", "completedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function transaction(database, mode, operation) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, mode);
    const request = operation(tx.objectStore(STORE));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    tx.oncomplete = () => database.close();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveLocalDraft(key, model, { indexedDBImpl } = {}) {
  const database = await openDatabase(indexedDBImpl);
  await transaction(database, "readwrite", (store) => store.put({
    key: String(key), model: structuredClone(model), updatedAt: new Date().toISOString(),
  }));
  await pruneLocalDrafts({ indexedDBImpl });
}

export async function loadLocalDraft(key, { indexedDBImpl } = {}) {
  const database = await openDatabase(indexedDBImpl);
  const value = await transaction(database, "readonly", (store) => store.get(String(key)));
  return value ? structuredClone(value) : null;
}

export async function removeLocalDraft(key, { indexedDBImpl } = {}) {
  const database = await openDatabase(indexedDBImpl);
  await transaction(database, "readwrite", (store) => store.delete(String(key)));
}

export async function pruneLocalDrafts({ indexedDBImpl, maxDrafts = MAX_DRAFTS } = {}) {
  const database = await openDatabase(indexedDBImpl);
  const values = await transaction(database, "readonly", (store) => store.getAll());
  const expired = values.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(maxDrafts);
  for (const draft of expired) await removeLocalDraft(draft.key, { indexedDBImpl });
  return expired.length;
}
