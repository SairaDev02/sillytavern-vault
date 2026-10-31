import { describe, it, expect, beforeEach } from 'vitest';
import {
  openDB,
  dbAdd,
  dbGetAll,
  dbDelete,
  dbDeleteMany,
  dbPutMany,
  STORE_NAME,
} from '../src/db';
import { generateId } from '../src/id';
import type { Character } from '../src/types';

let testDbCounter = 0;
function getTestDbName(): string {
  return `character-gallery-test-${testDbCounter++}`;
}

interface AbortArm {
  /** Recorded transaction events, one entry per transaction the helper created. */
  events: string[][];
  restore: () => void;
}

/**
 * Abort the next transaction a storage helper creates, after the given number
 * of requests have succeeded but before the transaction commits. The
 * transaction is captured at the test boundary, so the helper's own abort
 * handling is what these tests observe.
 */
function abortNextTransaction(db: IDBDatabase, afterRequests = 1): AbortArm {
  const events: string[][] = [];
  let remaining = afterRequests;
  const originalTransaction = db.transaction.bind(db);

  (db as unknown as { transaction: unknown }).transaction = (...args: unknown[]) => {
    const tx = (originalTransaction as (...a: unknown[]) => IDBTransaction)(...args);
    const seen: string[] = [];
    events.push(seen);
    tx.addEventListener('complete', () => seen.push('complete'));
    tx.addEventListener('error', () => seen.push('error'));
    tx.addEventListener('abort', () => seen.push('abort'));

    const realObjectStore = tx.objectStore.bind(tx);
    (tx as unknown as { objectStore: unknown }).objectStore = (name: string) => {
      const store = realObjectStore(name as never);
      for (const method of ['put', 'delete'] as const) {
        const originalMethod = store[method].bind(store) as (...a: unknown[]) => IDBRequest;
        (store as unknown as Record<string, unknown>)[method] = (...a: unknown[]) => {
          const request = originalMethod(...a);
          request.addEventListener('success', () => {
            remaining -= 1;
            if (remaining === 0) tx.abort();
          });
          return request;
        };
      }
      return store;
    };
    return tx;
  };

  return {
    events,
    restore() {
      delete (db as unknown as Record<string, unknown>).transaction;
    },
  };
}

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: generateId(),
    name: 'Test Character',
    description: 'A test character',
    image: 'data:image/png;base64,iVBORw0KGgo=',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('IndexedDB Character Store', () => {
  let db: IDBDatabase | null = null;

  beforeEach(async () => {
    db = await openDB(getTestDbName());
  });

  it('should create the object store on first open', async () => {
    expect(db!.objectStoreNames.contains(STORE_NAME)).toBe(true);
  });

  it('should add a character and retrieve it', async () => {
    const char = makeCharacter({ name: 'Test Character', description: 'A test character' });

    await dbAdd(db!, char);
    const all = await dbGetAll<Character>(db!);

    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Test Character');
    expect(all[0].description).toBe('A test character');
  });

  it('should retrieve multiple characters', async () => {
    await dbAdd(db!, makeCharacter({ name: 'Character One' }));
    await dbAdd(db!, makeCharacter({ name: 'Character Two' }));

    const all = await dbGetAll<Character>(db!);
    expect(all).toHaveLength(2);
  });

  it('should delete a character', async () => {
    const char = makeCharacter({ name: 'To Delete' });

    await dbAdd(db!, char);
    expect(await dbGetAll<Character>(db!)).toHaveLength(1);

    await dbDelete(db!, char.id);
    expect(await dbGetAll<Character>(db!)).toHaveLength(0);
  });

  it('should resolve when deleting an id that does not exist', async () => {
    await expect(dbDelete(db!, 'missing-id')).resolves.toBeUndefined();
  });

  it('should update a character when re-added with same ID', async () => {
    const original = makeCharacter({ name: 'Original Name' });
    await dbAdd(db!, original);

    const updated: Character = { ...original, name: 'Updated Name' };
    await dbAdd(db!, updated);

    const all = await dbGetAll<Character>(db!);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Updated Name');
  });

  it('should return empty array when no characters exist', async () => {
    const all = await dbGetAll<Character>(db!);
    expect(all).toEqual([]);
  });

  it('should delete multiple characters at once', async () => {
    const char1 = makeCharacter({ name: 'Char 1' });
    const char2 = makeCharacter({ name: 'Char 2' });
    const char3 = makeCharacter({ name: 'Char 3' });

    await dbAdd(db!, char1);
    await dbAdd(db!, char2);
    await dbAdd(db!, char3);
    expect(await dbGetAll<Character>(db!)).toHaveLength(3);

    await dbDeleteMany(db!, [char1.id, char3.id]);
    const remaining = await dbGetAll<Character>(db!);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(char2.id);
  });

  it('should handle empty array in dbDeleteMany', async () => {
    await dbAdd(db!, makeCharacter({ name: 'Keep Me' }));

    await dbDeleteMany(db!, []);
    expect(await dbGetAll<Character>(db!)).toHaveLength(1);
  });

  it('should reject when the record cannot be stored', async () => {
    // A function cannot be structured-cloned, so the write must fail loudly
    // instead of leaving a pending promise.
    const uncloneable = { ...makeCharacter(), image: () => 'not clonable' } as unknown as Character;

    await expect(dbAdd(db!, uncloneable)).rejects.toBeTruthy();
  });

  describe('pre-commit abort', () => {
    it('rejects an insert and leaves the store unchanged', async () => {
      const arm = abortNextTransaction(db!, 1);

      await expect(dbAdd(db!, makeCharacter({ name: 'Aborted' }))).rejects.toBeTruthy();
      arm.restore();

      expect(await dbGetAll<Character>(db!)).toEqual([]);
      // The isolated witness never sees `complete` or `error`, so the abort
      // rejection path is the one under test.
      expect(arm.events).toEqual([['abort']]);
    });

    it('rejects an overwrite and keeps the stored record', async () => {
      const original = makeCharacter({ name: 'Original' });
      await dbAdd(db!, original);

      const arm = abortNextTransaction(db!, 1);
      await expect(dbAdd(db!, { ...original, name: 'Replaced' })).rejects.toBeTruthy();
      arm.restore();

      const all = await dbGetAll<Character>(db!);
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('Original');
    });

    it('rejects a single delete and keeps the record', async () => {
      const char = makeCharacter({ name: 'Kept' });
      await dbAdd(db!, char);

      const arm = abortNextTransaction(db!, 1);
      await expect(dbDelete(db!, char.id)).rejects.toBeTruthy();
      arm.restore();

      expect(await dbGetAll<Character>(db!)).toHaveLength(1);
    });

    it('rejects an atomic batch delete and rolls back every request', async () => {
      const first = makeCharacter({ name: 'First' });
      const second = makeCharacter({ name: 'Second' });
      const third = makeCharacter({ name: 'Third' });
      await dbAdd(db!, first);
      await dbAdd(db!, second);
      await dbAdd(db!, third);

      // Abort after both deletes have succeeded, so the rollback is what keeps
      // the records, not a request that never ran.
      const arm = abortNextTransaction(db!, 2);
      await expect(dbDeleteMany(db!, [first.id, third.id])).rejects.toBeTruthy();
      arm.restore();

      const all = await dbGetAll<Character>(db!);
      expect(all).toHaveLength(3);
      expect(all.map((character) => character.name).sort()).toEqual(['First', 'Second', 'Third']);
    });
  });
});

/**
 * Count the transactions a storage helper creates, so "one transaction for the
 * whole batch" is observed at the storage seam rather than inferred.
 */
function countTransactions(db: IDBDatabase): { count: () => number; restore: () => void } {
  const originalTransaction = db.transaction.bind(db);
  let count = 0;

  (db as unknown as { transaction: unknown }).transaction = (...args: unknown[]) => {
    count += 1;
    return (originalTransaction as (...a: unknown[]) => IDBTransaction)(...args);
  };

  return {
    count: () => count,
    restore() {
      delete (db as unknown as Record<string, unknown>).transaction;
    },
  };
}

/** A database whose store rejects a duplicate `name` asynchronously. */
async function openUniqueNameDB(name: string): Promise<IDBDatabase> {
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('name', 'name', { unique: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

describe('bulk write', () => {
  let db: IDBDatabase | null = null;

  beforeEach(async () => {
    db = await openDB(getTestDbName());
  });

  it('writes every record in one transaction', async () => {
    const counter = countTransactions(db!);
    const records = [
      makeCharacter({ name: 'First' }),
      makeCharacter({ name: 'Second' }),
      makeCharacter({ name: 'Third' }),
    ];

    await dbPutMany(db!, records);
    counter.restore();

    expect(counter.count()).toBe(1);
    const all = await dbGetAll<Character>(db!);
    expect(all).toHaveLength(3);
    expect(all.map((character) => character.name).sort()).toEqual(['First', 'Second', 'Third']);
  });

  it('writes nothing when a later put throws while the batch is queued', async () => {
    // A function cannot be structured-cloned, so `put` throws synchronously
    // after the first record is already queued. The earlier request must not
    // commit on its own.
    const records = [
      makeCharacter({ name: 'Queued first' }),
      { ...makeCharacter(), image: () => 'not clonable' } as unknown as Character,
    ];

    await expect(dbPutMany(db!, records)).rejects.toBeTruthy();

    expect(await dbGetAll<Character>(db!)).toEqual([]);
  });

  it('writes nothing when a queued request fails asynchronously', async () => {
    const uniqueDb = await openUniqueNameDB(getTestDbName());
    const records = [
      makeCharacter({ name: 'Same name' }),
      makeCharacter({ name: 'Same name' }),
    ];

    // The duplicate name fails the unique index at request time, after the
    // first record is queued, so the transaction aborts on its own.
    await expect(dbPutMany(uniqueDb, records)).rejects.toBeTruthy();

    expect(await dbGetAll<Character>(uniqueDb)).toEqual([]);
    uniqueDb.close();
  });

  it('rejects an explicitly aborted batch and rolls back every record', async () => {
    const kept = makeCharacter({ name: 'Already stored' });
    await dbAdd(db!, kept);

    const arm = abortNextTransaction(db!, 2);
    await expect(
      dbPutMany(db!, [makeCharacter({ name: 'First' }), makeCharacter({ name: 'Second' })])
    ).rejects.toBeTruthy();
    arm.restore();

    const all = await dbGetAll<Character>(db!);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Already stored');
    expect(arm.events).toEqual([['abort']]);
  });
});
