const DB_VERSION = 1;
export const STORE_NAME = 'characters';

export function openDB(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

/**
 * Resolve when a transaction commits. Reject on both `error` and `abort`,
 * because an aborted transaction fires only `abort` and would otherwise leave
 * the caller's promise pending forever.
 */
function awaitTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/** Insert a record, or replace the existing record with the same key. */
export async function dbAdd<T>(db: IDBDatabase, item: T): Promise<void> {
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(item);
  return awaitTransaction(tx);
}

export async function dbDelete(db: IDBDatabase, id: string): Promise<void> {
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete(id);
  return awaitTransaction(tx);
}

export async function dbGetAll<T>(db: IDBDatabase): Promise<T[]> {
  const tx = db.transaction(STORE_NAME, 'readonly');
  const request = tx.objectStore(STORE_NAME).getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export async function dbDeleteMany(db: IDBDatabase, ids: string[]): Promise<void> {
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  for (const id of ids) {
    store.delete(id);
  }
  return awaitTransaction(tx);
}

/**
 * Store every record in one transaction, and resolve only when it commits.
 *
 * A rejection or an abort means nothing was written. `put` can also throw
 * synchronously — an uncloneable value, for example — after earlier records are
 * already queued; without an explicit abort those would commit on their own,
 * so the batch is aborted instead and the original error is reported.
 */
export async function dbPutMany<T>(db: IDBDatabase, items: readonly T[]): Promise<void> {
  if (items.length === 0) return;

  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const committed = awaitTransaction(tx);

  try {
    for (const item of items) {
      store.put(item);
    }
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // The transaction already finished or aborted; nothing else to undo.
    }
    // The abort's rejection is not the cause, so the queueing error wins.
    await committed.catch(() => undefined);
    throw error;
  }

  return committed;
}
