// IndexedDB persistence for the post outbox. A thin, promise-based wrapper — no
// business logic (that lives in postOutboxCore). Every method fails soft: if
// IndexedDB is unavailable (private mode, old browser, SSR) it resolves to an
// empty/no-op result so the caller can fall back to the normal publish path.
//
// Records are stored whole, including File/Blob media, which IndexedDB persists
// natively — no base64 inflation. IndexedDB is also the one store a Service
// Worker can read, which is what makes the Phase 1 background drain possible.

const DB_NAME = "kunthai-post-outbox";
const STORE = "posts";
const DB_VERSION = 1;

let dbPromise = null;

function hasIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function openDb() {
  if (!hasIndexedDb()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  }).catch(() => null);

  return dbPromise;
}

function runTx(mode, operation) {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) {
          resolve(undefined);
          return;
        }
        let tx;
        try {
          tx = db.transaction(STORE, mode);
        } catch {
          resolve(undefined);
          return;
        }
        const store = tx.objectStore(STORE);
        let result;
        try {
          result = operation(store);
        } catch {
          resolve(undefined);
          return;
        }
        tx.oncomplete = () => resolve(result?.result ?? result);
        tx.onerror = () => resolve(undefined);
        tx.onabort = () => resolve(undefined);
      }),
  );
}

export function putOutboxRecord(record) {
  if (!record?.id) return Promise.resolve(record);
  return runTx("readwrite", (store) => store.put(record)).then(() => record);
}

export function deleteOutboxRecord(id) {
  if (!id) return Promise.resolve();
  return runTx("readwrite", (store) => store.delete(id));
}

export function getAllOutboxRecords() {
  return runTx("readonly", (store) => store.getAll()).then((result) => {
    // store.getAll() returns an IDBRequest; runTx resolves after oncomplete, so
    // read the request's result here.
    if (Array.isArray(result)) return result;
    return Array.isArray(result?.result) ? result.result : [];
  });
}

export function isOutboxStorageAvailable() {
  return hasIndexedDb();
}
