import { describe, expect, it, vi } from 'vitest';
import {
  CharacterLibrary,
  LibraryError,
  REPAIR_WARNING,
  type CharacterLibraryDeps,
  type CharacterDraft,
} from '../src/character-library.svelte';
import { openDB, dbAdd, dbGetAll, dbDelete, dbDeleteMany, dbPutMany } from '../src/db';
import type { Character } from '../src/types';
import { deferred, makeCharacter, PNG_1X1 } from './fixtures';

const OTHER_IMAGE = 'data:image/png;base64,other-image';

interface MeasureCall {
  src: string;
  resolve: (value: { width: number; height: number }) => void;
  reject: (reason: unknown) => void;
}

interface HeldWrite {
  record: Character;
  release: () => void;
  /** Settles when the released write's transaction has finished. */
  outcome: Promise<void>;
}

interface WriteCall {
  record: Character;
  /** Settles when the storage transaction for this write has finished. */
  outcome: Promise<void>;
}

let databaseCounter = 0;

/**
 * Let every microtask queued by the module run. No timers and no polling: the
 * interleavings are decided by the deferreds each test resolves.
 */
async function flushMicrotasks(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
}

/** Await a write's storage transaction, then let its publication run. */
async function committed(call: WriteCall | undefined): Promise<void> {
  if (!call) throw new Error('The expected write never started.');
  await call.outcome;
  await flushMicrotasks();
}

async function seed(databaseName: string, records: Character[]): Promise<void> {
  const db = await openDB(databaseName);
  for (const record of records) {
    await dbAdd(db, record);
  }
  db.close();
}

async function stored(databaseName: string): Promise<Character[]> {
  const db = await openDB(databaseName);
  const all = await dbGetAll<Character>(db);
  db.close();
  return all;
}

/**
 * The real storage helpers are the default dependencies, pointed at one
 * database per test. Only the measurement, the identity, and the clock are
 * controlled, so the tests assert what a caller can observe.
 */
function makeHarness(overrides: Partial<CharacterLibraryDeps> = {}) {
  const databaseName = `character-library-test-${databaseCounter++}`;
  const measures: MeasureCall[] = [];

  const measure = vi.fn((src: string) => {
    const pending = deferred<{ width: number; height: number }>();
    measures.push({ src, resolve: pending.resolve, reject: pending.reject });
    return pending.promise;
  });

  let idCounter = 0;
  const generateId = vi.fn(() => `id-${(idCounter += 1)}`);
  let clock = 1_000;
  const now = vi.fn(() => clock);

  const readAll = vi.fn((database: IDBDatabase) => dbGetAll<Character>(database));
  const writes: WriteCall[] = [];
  const write = vi.fn((database: IDBDatabase, record: Character) => {
    const outcome = dbAdd(database, record);
    writes.push({ record, outcome: outcome.then(() => undefined, () => undefined) });
    return outcome;
  });
  const remove = vi.fn((database: IDBDatabase, id: string) => dbDelete(database, id));
  const removeMany = vi.fn((database: IDBDatabase, ids: string[]) => dbDeleteMany(database, ids));
  const writeMany = vi.fn((database: IDBDatabase, records: Character[]) =>
    dbPutMany(database, records)
  );
  const logger = { warn: vi.fn(), error: vi.fn() };

  const deps: CharacterLibraryDeps = {
    databaseName,
    measure,
    generateId,
    now,
    readAll,
    write,
    remove,
    removeMany,
    writeMany,
    logger,
    ...overrides,
  };

  return {
    databaseName,
    library: new CharacterLibrary(deps),
    measures,
    writes,
    generateId,
    now,
    readAll,
    write,
    remove,
    removeMany,
    // The dependency the library actually uses, so a test can observe or gate
    // an injected write without losing its spy.
    writeMany: vi.mocked(deps.writeMany!),
    logger,
    setClock(value: number) {
      clock = value;
    },
  };
}

/** Hold the next writes until the test releases them, so interleavings are explicit. */
function holdWrites() {
  const pending: HeldWrite[] = [];
  let holding = false;

  const write = vi.fn((database: IDBDatabase, record: Character) => {
    if (!holding) return dbAdd(database, record);

    const gate = deferred<void>();
    const outcome = gate.promise.then(() => dbAdd(database, record));
    pending.push({ record, release: () => gate.resolve(), outcome });
    return outcome;
  });

  return {
    write,
    pending,
    hold() {
      holding = true;
    },
    resume() {
      holding = false;
    },
  };
}

const draft = (overrides: Partial<CharacterDraft> = {}): CharacterDraft => ({
  name: 'Newcomer',
  description: 'A new character',
  image: PNG_1X1,
  width: 4,
  height: 3,
  ...overrides,
});

describe('CharacterLibrary: record rules', () => {
  it('assigns an identity and the creation time once, and keeps both on an edit', async () => {
    const harness = makeHarness();
    await harness.library.initialize();

    await harness.library.save(draft());
    expect(harness.generateId).toHaveBeenCalledTimes(1);

    const created = harness.library.characters[0];
    expect(created).toMatchObject({ id: 'id-1', name: 'Newcomer', createdAt: 1_000 });

    harness.setClock(9_999);
    await harness.library.save(
      draft({ id: created.id, name: 'Renamed', image: created.image, width: 4, height: 3 })
    );

    // The clock moved, but an edit never re-derives the creation time.
    expect(harness.generateId).toHaveBeenCalledTimes(1);
    expect(harness.library.characters).toHaveLength(1);
    expect(harness.library.characters[0]).toMatchObject({
      id: 'id-1',
      name: 'Renamed',
      createdAt: 1_000,
    });

    const persisted = await stored(harness.databaseName);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({ id: 'id-1', name: 'Renamed', createdAt: 1_000 });
  });

  it('refuses an edit whose target is gone without writing or inventing a record', async () => {
    const harness = makeHarness();
    await seed(harness.databaseName, [makeCharacter(1)]);
    await harness.library.initialize();

    const refusal = await harness.library
      .save(draft({ id: 'missing-id', name: 'Ghost' }))
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(LibraryError);
    expect((refusal as LibraryError).kind).toBe('missing-target');
    expect(harness.generateId).not.toHaveBeenCalled();
    expect(harness.now).not.toHaveBeenCalled();

    const persisted = await stored(harness.databaseName);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].id).toBe('char-1');
    expect(harness.library.characters.map((character) => character.id)).toEqual(['char-1']);
  });

  it('keeps the stored size pair when the image is unchanged and no size is supplied', async () => {
    const harness = makeHarness();
    await seed(harness.databaseName, [makeCharacter(1, { width: 5, height: 6 })]);
    await harness.library.initialize();

    await harness.library.save({
      id: 'char-1',
      name: 'Edited',
      description: 'Edited',
      image: PNG_1X1,
    });

    expect(harness.library.characters[0]).toMatchObject({ width: 5, height: 6 });
    expect((await stored(harness.databaseName))[0]).toMatchObject({ width: 5, height: 6 });
  });

  it('never carries the stored size over to a replaced image', async () => {
    const harness = makeHarness();
    await seed(harness.databaseName, [makeCharacter(1, { width: 5, height: 6 })]);
    await harness.library.initialize();

    await harness.library.save({
      id: 'char-1',
      name: 'Edited',
      description: 'Edited',
      image: OTHER_IMAGE,
    });

    expect(harness.library.characters[0]).toMatchObject({
      image: OTHER_IMAGE,
      width: undefined,
      height: undefined,
    });
    expect((await stored(harness.databaseName))[0]).toMatchObject({
      image: OTHER_IMAGE,
      width: undefined,
      height: undefined,
    });
  });

  it('treats a partial pair as no size at all', async () => {
    const harness = makeHarness();
    await harness.library.initialize();

    await harness.library.save(draft({ width: 9, height: undefined }));

    expect(harness.library.characters[0]).toMatchObject({ width: undefined, height: undefined });
    expect((await stored(harness.databaseName))[0]).toMatchObject({
      width: undefined,
      height: undefined,
    });
  });

  it('keeps the stored pair when a partial draft describes the unchanged image', async () => {
    const harness = makeHarness();
    await seed(harness.databaseName, [makeCharacter(1, { width: 5, height: 6 })]);
    await harness.library.initialize();

    await harness.library.save({
      id: 'char-1',
      name: 'Edited',
      description: 'Edited',
      image: PNG_1X1,
      width: 9,
    });

    expect(harness.library.characters[0]).toMatchObject({ width: 5, height: 6 });
    expect((await stored(harness.databaseName))[0]).toMatchObject({ width: 5, height: 6 });
  });

  it('never pairs a partial draft size with a different image', async () => {
    const harness = makeHarness();
    await seed(harness.databaseName, [makeCharacter(1, { width: 5, height: 6 })]);
    await harness.library.initialize();

    await harness.library.save({
      id: 'char-1',
      name: 'Edited',
      description: 'Edited',
      image: OTHER_IMAGE,
      width: 9,
    });

    expect(harness.library.characters[0]).toMatchObject({
      image: OTHER_IMAGE,
      width: undefined,
      height: undefined,
    });
    expect((await stored(harness.databaseName))[0]).toMatchObject({
      width: undefined,
      height: undefined,
    });
  });

  it('stores a supplied pair as given', async () => {
    const harness = makeHarness();
    await harness.library.initialize();

    await harness.library.save(draft({ width: 640, height: 480 }));

    expect(harness.library.characters[0]).toMatchObject({ width: 640, height: 480 });
    expect((await stored(harness.databaseName))[0]).toMatchObject({ width: 640, height: 480 });
  });

  it('copies the draft, so a later caller change cannot alter an accepted save', async () => {
    const harness = makeHarness();
    await harness.library.initialize();

    const pendingDraft: CharacterDraft = {
      name: 'Original',
      description: 'Original',
      image: PNG_1X1,
      width: 4,
      height: 3,
    };
    const save = harness.library.save(pendingDraft);
    pendingDraft.name = 'Changed after the call';
    await save;

    expect(harness.library.characters[0].name).toBe('Original');
    expect((await stored(harness.databaseName))[0].name).toBe('Original');
  });

  it('reads the full library only at start, never after a mutation', async () => {
    const harness = makeHarness();
    await seed(harness.databaseName, [makeCharacter(1)]);
    await harness.library.initialize();
    expect(harness.readAll).toHaveBeenCalledTimes(1);

    await harness.library.save(draft({ id: 'char-1', name: 'Edited' }));
    await harness.library.remove('char-1');

    expect(harness.readAll).toHaveBeenCalledTimes(1);
  });
});

describe('CharacterLibrary: start-up and recovery', () => {
  it('recovers from a failed open with the stored records intact', async () => {
    let opens = 0;
    const harness = makeHarness({
      openDatabase: (name) =>
        (opens += 1) === 1 ? Promise.reject(new Error('open blocked')) : openDB(name),
    });
    await seed(harness.databaseName, [makeCharacter(1)]);

    await harness.library.initialize();
    expect(harness.library.status).toBe('failed');
    expect(harness.library.failureMessage).toContain('open blocked');
    expect(harness.library.characters).toEqual([]);

    // An attempt made while unavailable is rejected, not queued, and never replayed.
    await expect(harness.library.save(draft({ name: 'Lost' }))).rejects.toMatchObject({
      kind: 'unavailable',
    });
    expect(await stored(harness.databaseName)).toHaveLength(1);

    await harness.library.initialize();
    expect(harness.library.status).toBe('ready');
    expect(harness.library.failureMessage).toBeNull();
    expect(harness.library.characters.map((character) => character.id)).toEqual(['char-1']);
    expect(await stored(harness.databaseName)).toHaveLength(1);
  });

  it('reaches the failed state when the initial read fails, then recovers', async () => {
    const databaseName = `character-library-test-${databaseCounter++}`;
    let reads = 0;
    const readAll = vi.fn((database: IDBDatabase) => {
      reads += 1;
      return reads === 1
        ? Promise.reject(new Error('read blocked'))
        : dbGetAll<Character>(database);
    });
    const library = new CharacterLibrary({
      databaseName,
      readAll,
      measure: vi.fn(),
      logger: { warn: vi.fn(), error: vi.fn() },
    });
    await seed(databaseName, [makeCharacter(1)]);

    await library.initialize();
    expect(library.status).toBe('failed');
    expect(library.failureMessage).toContain('read blocked');
    expect(library.characters).toEqual([]);

    await library.initialize();
    expect(library.status).toBe('ready');
    expect(library.characters.map((character) => character.id)).toEqual(['char-1']);
  });

  it('rejects every mutation before readiness with the unavailable kind', async () => {
    const harness = makeHarness();

    await expect(harness.library.save(draft())).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(harness.library.remove('char-1')).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(harness.library.removeMany(['char-1'])).rejects.toMatchObject({
      kind: 'unavailable',
    });

    expect(await stored(harness.databaseName)).toEqual([]);
  });

  it('supersedes a start that has not opened yet', async () => {
    const databaseName = `character-library-test-${databaseCounter++}`;
    interface PendingOpen {
      resolve: (db: IDBDatabase) => void;
      reject: (error: unknown) => void;
    }
    const opens: PendingOpen[] = [];
    const library = new CharacterLibrary({
      databaseName,
      openDatabase: () => {
        const pending = deferred<IDBDatabase>();
        opens.push({ resolve: pending.resolve, reject: pending.reject });
        return pending.promise;
      },
      measure: vi.fn(),
      logger: { warn: vi.fn(), error: vi.fn() },
    });

    const first = library.initialize();
    const second = library.initialize();
    await flushMicrotasks();

    // Only the newer start opens the database. The older one is superseded
    // before it begins, so it can never publish a stale list.
    expect(opens).toHaveLength(1);

    const db = await openDB(databaseName);
    await dbAdd(db, makeCharacter(1));
    opens[0].resolve(db);
    await Promise.all([first, second]);

    expect(library.status).toBe('ready');
    expect(library.characters.map((character) => character.id)).toEqual(['char-1']);
  });
});

describe('CharacterLibrary: ordering and write outcomes', () => {
  it('publishes resolved mutations only after the storage transaction commits', async () => {
    const held = holdWrites();
    const harness = makeHarness({ write: held.write });
    await harness.library.initialize();
    held.hold();

    const save = harness.library.save(draft());
    await flushMicrotasks();
    expect(held.pending).toHaveLength(1);

    // The write has not committed, so nothing is visible or stored yet.
    expect(harness.library.characters).toEqual([]);
    expect(await stored(harness.databaseName)).toEqual([]);

    held.pending[0].release();
    await save;

    expect(harness.library.characters).toHaveLength(1);
    expect(await stored(harness.databaseName)).toHaveLength(1);
  });

  it('never publishes an older edit after a newer accepted edit', async () => {
    const held = holdWrites();
    const harness = makeHarness({ write: held.write });
    await seed(harness.databaseName, [makeCharacter(1, { name: 'Original' })]);
    await harness.library.initialize();
    held.hold();

    const first = harness.library.save(
      draft({ id: 'char-1', name: 'First', image: PNG_1X1, width: 1, height: 1 })
    );
    const second = harness.library.save(
      draft({ id: 'char-1', name: 'Second', image: PNG_1X1, width: 1, height: 1 })
    );
    await flushMicrotasks();
    expect(held.pending).toHaveLength(1);

    held.pending[0].release();
    await held.pending[0].outcome;
    await flushMicrotasks();
    expect(harness.library.characters[0].name).toBe('First');
    expect(held.pending).toHaveLength(2);

    held.pending[1].release();
    await Promise.all([first, second]);

    expect(harness.library.characters).toHaveLength(1);
    expect(harness.library.characters[0].name).toBe('Second');
    expect((await stored(harness.databaseName))[0].name).toBe('Second');
  });

  it('lets a newer start overtake one whose read is still pending', async () => {
    const firstDbName = `character-library-test-${databaseCounter++}`;
    const secondDbName = `character-library-test-${databaseCounter++}`;
    const opens: Array<(db: IDBDatabase) => void> = [];
    const library = new CharacterLibrary({
      databaseName: firstDbName,
      openDatabase: () => {
        const pending = deferred<IDBDatabase>();
        opens.push(pending.resolve);
        return pending.promise;
      },
      measure: vi.fn(),
      logger: { warn: vi.fn(), error: vi.fn() },
    });
    await seed(firstDbName, [makeCharacter(1, { name: 'Stale' })]);
    await seed(secondDbName, [makeCharacter(2, { name: 'Fresh' })]);

    const first = library.initialize();
    await flushMicrotasks();
    expect(opens).toHaveLength(1);

    const second = library.initialize();
    await flushMicrotasks();
    // The newer start does not wait behind the older pending open.
    expect(opens).toHaveLength(2);

    opens[1](await openDB(secondDbName));
    await second;
    expect(library.characters.map((character) => character.name)).toEqual(['Fresh']);

    // The older read finishes late and must not replace the newer list.
    opens[0](await openDB(firstDbName));
    await first;
    expect(library.status).toBe('ready');
    expect(library.characters.map((character) => character.name)).toEqual(['Fresh']);
  });

  it('finishes an accepted write before a later initialize reads the library', async () => {
    const harness = makeHarness();
    await seed(harness.databaseName, [makeCharacter(1, { name: 'Original' })]);
    await harness.library.initialize();

    const save = harness.library.save(
      draft({ id: 'char-1', name: 'Edited', image: PNG_1X1, width: 1, height: 1 })
    );
    // The restart is requested while the edit is accepted but not yet stored.
    const restart = harness.library.initialize();

    await expect(save).resolves.toBeUndefined();
    await restart;

    expect(harness.library.status).toBe('ready');
    expect(harness.library.characters).toHaveLength(1);
    expect(harness.library.characters[0].name).toBe('Edited');
    expect((await stored(harness.databaseName))[0].name).toBe('Edited');
  });

  it('rejects a write that does not commit, then keeps working', async () => {
    const storageError = new Error('quota exceeded');
    const harness = makeHarness();
    harness.write.mockRejectedValueOnce(storageError);
    await harness.library.initialize();

    const refusal = await harness.library.save(draft()).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(LibraryError);
    expect((refusal as LibraryError).kind).toBe('write-failed');
    expect((refusal as LibraryError).cause).toBe(storageError);
    // A rejection means nothing was committed and nothing was published.
    expect(harness.library.characters).toEqual([]);
    expect(await stored(harness.databaseName)).toEqual([]);

    // The queue tail recovers, so the next save still commits.
    await harness.library.save(draft({ name: 'Retried' }));
    expect(harness.library.characters[0].name).toBe('Retried');
    expect((await stored(harness.databaseName))[0].name).toBe('Retried');
  });

  it('removes one record and removes many as all-or-nothing', async () => {
    const harness = makeHarness();
    await seed(harness.databaseName, [makeCharacter(1), makeCharacter(2), makeCharacter(3)]);
    await harness.library.initialize();

    const ids = () => harness.library.characters.map((character) => character.id);
    const storedIds = async () =>
      (await stored(harness.databaseName)).map((character) => character.id);

    await harness.library.remove('char-1');
    expect(ids()).toEqual(['char-2', 'char-3']);
    expect(await storedIds()).toEqual(['char-2', 'char-3']);

    harness.removeMany.mockRejectedValueOnce(new Error('delete failed'));
    await expect(harness.library.removeMany(['char-2', 'char-3'])).rejects.toMatchObject({
      kind: 'write-failed',
    });
    // A failed batch keeps every record and the list unchanged.
    expect(ids()).toEqual(['char-2', 'char-3']);
    expect(await storedIds()).toEqual(['char-2', 'char-3']);

    await harness.library.removeMany(['char-2', 'char-3']);
    expect(harness.library.characters).toEqual([]);
    expect(await stored(harness.databaseName)).toEqual([]);
  });
});

describe('CharacterLibrary: legacy size repair', () => {
  it('does not block start-up on measurement', async () => {
    const harness = makeHarness();
    await seed(harness.databaseName, [
      makeCharacter(1, { width: undefined, height: undefined }),
      makeCharacter(2, { width: undefined, height: undefined }),
    ]);

    await harness.library.initialize();

    expect(harness.library.status).toBe('ready');
    expect(harness.library.characters).toHaveLength(2);
    expect(harness.library.characters[0].width).toBeUndefined();
    expect(harness.measures.map((call) => call.src)).toEqual([PNG_1X1, PNG_1X1]);
  });

  it('merges a late measurement into an edit that happened meanwhile', async () => {
    const harness = makeHarness();
    await seed(harness.databaseName, [makeCharacter(1, { width: undefined, height: undefined })]);
    await harness.library.initialize();
    expect(harness.measures).toHaveLength(1);

    // The edit finishes first, then the measurement that started earlier.
    await harness.library.save({
      id: 'char-1',
      name: 'Edited later',
      description: 'New description',
      image: PNG_1X1,
    });
    harness.measures[0].resolve({ width: 64, height: 32 });
    await flushMicrotasks();
    expect(harness.writes).toHaveLength(2);
    await committed(harness.writes[1]);

    const expected = {
      name: 'Edited later',
      description: 'New description',
      width: 64,
      height: 32,
    };
    expect(harness.library.characters[0]).toMatchObject(expected);
    expect((await stored(harness.databaseName))[0]).toMatchObject(expected);
  });

  it('merges a late measurement even when it finishes before the edit commits', async () => {
    const held = holdWrites();
    const harness = makeHarness({ write: held.write });
    await seed(harness.databaseName, [makeCharacter(1, { width: undefined, height: undefined })]);
    await harness.library.initialize();
    held.hold();

    const save = harness.library.save({
      id: 'char-1',
      name: 'Edited later',
      description: 'New description',
      image: PNG_1X1,
    });
    await flushMicrotasks();
    expect(held.pending).toHaveLength(1);

    // The measurement completes while the edit's write is still held.
    harness.measures[0].resolve({ width: 64, height: 32 });
    await flushMicrotasks();

    held.pending[0].release();
    await held.pending[0].outcome;
    await flushMicrotasks();
    // The repair's write is queued behind the edit and passes the same gate.
    expect(held.pending).toHaveLength(2);
    held.pending[1].release();
    await held.pending[1].outcome;
    await flushMicrotasks();
    await save;

    const expected = {
      name: 'Edited later',
      description: 'New description',
      width: 64,
      height: 32,
    };
    expect(harness.library.characters[0]).toMatchObject(expected);
    expect((await stored(harness.databaseName))[0]).toMatchObject(expected);
  });

  it('discards a measurement for an image that was replaced meanwhile', async () => {
    const harness = makeHarness();
    await seed(harness.databaseName, [makeCharacter(1, { width: undefined, height: undefined })]);
    await harness.library.initialize();
    expect(harness.measures).toHaveLength(1);

    await harness.library.save({
      id: 'char-1',
      name: 'Edited',
      description: 'Edited',
      image: OTHER_IMAGE,
    });
    // The replacement is offered for repair too.
    expect(harness.measures).toHaveLength(2);

    harness.measures[0].resolve({ width: 64, height: 32 });
    await flushMicrotasks();
    expect(harness.writes).toHaveLength(1);

    // The old image's size must not attach to the new image.
    expect(harness.library.characters[0]).toMatchObject({
      image: OTHER_IMAGE,
      width: undefined,
      height: undefined,
    });
    expect((await stored(harness.databaseName))[0]).toMatchObject({ width: undefined });

    harness.measures[1].resolve({ width: 8, height: 9 });
    await flushMicrotasks();
    expect(harness.writes).toHaveLength(2);
    await committed(harness.writes[1]);
    expect(harness.library.characters[0]).toMatchObject({
      image: OTHER_IMAGE,
      width: 8,
      height: 9,
    });
  });

  it('never resurrects a Character deleted while its measurement ran', async () => {
    const harness = makeHarness();
    await seed(harness.databaseName, [makeCharacter(1, { width: undefined, height: undefined })]);
    await harness.library.initialize();

    await harness.library.remove('char-1');
    harness.measures[0].resolve({ width: 64, height: 32 });
    await flushMicrotasks();

    expect(harness.library.characters).toEqual([]);
    expect(await stored(harness.databaseName)).toEqual([]);
  });

  it('attempts a failing measurement once, again for a new image, and on a fresh start', async () => {
    const harness = makeHarness();
    await seed(harness.databaseName, [makeCharacter(1, { width: undefined, height: undefined })]);
    await harness.library.initialize();
    expect(harness.measures).toHaveLength(1);

    const failure = new Error('decode failed');
    harness.measures[0].reject(failure);
    await flushMicrotasks();

    expect(harness.library.repairWarning).toBe(REPAIR_WARNING);
    expect(harness.logger.warn).toHaveBeenCalledTimes(1);
    expect(harness.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Character 1'),
      failure
    );
    expect(harness.library.characters[0].width).toBeUndefined();

    // An ordinary publication does not re-attempt the same image.
    await harness.library.save({
      id: 'char-1',
      name: 'Edited',
      description: 'Edited',
      image: PNG_1X1,
    });
    expect(harness.measures).toHaveLength(1);
    expect(harness.library.characters[0].name).toBe('Edited');

    // A replaced image is eligible again.
    await harness.library.save({
      id: 'char-1',
      name: 'Edited',
      description: 'Edited',
      image: OTHER_IMAGE,
    });
    expect(harness.measures).toHaveLength(2);

    // A fresh start gives the same image one more chance.
    harness.measures[1].reject(new Error('still broken'));
    await flushMicrotasks();
    await harness.library.initialize();
    expect(harness.measures).toHaveLength(3);
    expect(harness.logger.warn).toHaveBeenCalledTimes(2);
  });

  it('keeps foreground mutations working after a repair failure', async () => {
    const harness = makeHarness();
    await seed(harness.databaseName, [makeCharacter(1, { width: undefined, height: undefined })]);
    await harness.library.initialize();
    harness.measures[0].reject(new Error('decode failed'));
    await flushMicrotasks();

    await harness.library.save({
      id: 'char-1',
      name: 'Still editable',
      description: 'Edited',
      image: PNG_1X1,
      width: 7,
      height: 8,
    });

    expect(harness.library.status).toBe('ready');
    expect(harness.library.characters[0]).toMatchObject({
      name: 'Still editable',
      width: 7,
      height: 8,
    });
  });
});

describe('CharacterLibrary: disposal', () => {
  it('publishes no repair after disposal and rejects new mutations', async () => {
    const harness = makeHarness();
    await seed(harness.databaseName, [makeCharacter(1, { width: undefined, height: undefined })]);
    await harness.library.initialize();
    expect(harness.measures).toHaveLength(1);

    harness.library.dispose();
    harness.measures[0].resolve({ width: 64, height: 32 });
    await flushMicrotasks();

    expect(harness.writes).toEqual([]);
    expect(harness.library.characters[0].width).toBeUndefined();
    expect(await stored(harness.databaseName)).toMatchObject([{ width: undefined }]);
    expect(harness.library.repairWarning).toBeNull();
    await expect(harness.library.save(draft())).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('settles an accepted write after disposal without publishing it', async () => {
    const held = holdWrites();
    const harness = makeHarness({ write: held.write });
    await seed(harness.databaseName, [makeCharacter(1, { name: 'Stored' })]);
    await harness.library.initialize();
    held.hold();

    const save = harness.library.save(
      draft({ id: 'char-1', name: 'Committed late', image: PNG_1X1, width: 1, height: 1 })
    );
    await flushMicrotasks();
    expect(held.pending).toHaveLength(1);

    harness.library.dispose();
    held.pending[0].release();

    // The promise settles, storage keeps the committed write, and the dead
    // page's list is not updated.
    await expect(save).resolves.toBeUndefined();
    expect(harness.library.characters[0].name).toBe('Stored');
    expect((await stored(harness.databaseName))[0].name).toBe('Committed late');
  });
});

/**
 * The read barrier a Backup uses before it snapshots the canonical list: it
 * waits for accepted mutations, and nothing else.
 */
describe('CharacterLibrary: settle barrier', () => {
  it('rejects with the unavailable kind before the library is ready', async () => {
    const harness = makeHarness();

    await expect(harness.library.settled()).rejects.toMatchObject({ kind: 'unavailable' });
    expect(harness.readAll).not.toHaveBeenCalled();
  });

  it('resolves only after an accepted save has committed and published', async () => {
    const held = holdWrites();
    const harness = makeHarness({ write: held.write });
    await harness.library.initialize();
    held.hold();

    const save = harness.library.save(draft());
    await flushMicrotasks();
    expect(held.pending).toHaveLength(1);

    let settled = false;
    const barrier = harness.library.settled().then(() => {
      settled = true;
    });
    await flushMicrotasks();
    // The save has not committed, so the barrier has not opened.
    expect(settled).toBe(false);
    expect(harness.library.characters).toEqual([]);

    held.pending[0].release();
    await save;
    await barrier;

    expect(settled).toBe(true);
    expect(harness.library.characters).toHaveLength(1);
  });

  it('does not wait for a background measurement and does not read storage again', async () => {
    const harness = makeHarness();
    await seed(harness.databaseName, [
      makeCharacter(1, { width: undefined, height: undefined }),
    ]);
    await harness.library.initialize();

    // Start-up handed the record without a size to the repair, which is still
    // pending: the barrier must not wait for that background work.
    expect(harness.measures).toHaveLength(1);
    const readsAfterStartUp = harness.readAll.mock.calls.length;

    await expect(harness.library.settled()).resolves.toBeUndefined();

    expect(harness.library.characters[0].width).toBeUndefined();
    expect(harness.readAll.mock.calls.length).toBe(readsAfterStartUp);
  });
});

/**
 * Restore is additive, atomic, and idempotent. It runs on the same chain as
 * saves and deletes, so the collision rule is always applied to the list as it
 * stands when the write is about to run.
 */
describe('CharacterLibrary: restore', () => {
  it('rejects with the unavailable kind before the library is ready', async () => {
    const harness = makeHarness();

    await expect(harness.library.restore([makeCharacter(1)])).rejects.toMatchObject({
      kind: 'unavailable',
    });

    expect(harness.writeMany).not.toHaveBeenCalled();
    expect(await stored(harness.databaseName)).toEqual([]);
  });

  it('adds every record with its stored identity and creation time in one write', async () => {
    const harness = makeHarness();
    await harness.library.initialize();
    const records = [
      makeCharacter(1, { name: 'Aria', createdAt: 111 }),
      makeCharacter(2, { name: 'Bram', createdAt: 222 }),
    ];

    const result = await harness.library.restore(records);

    expect(result).toEqual({ added: 2, skipped: 0 });
    expect(harness.writeMany).toHaveBeenCalledTimes(1);
    expect(harness.writeMany.mock.calls[0][1]).toEqual(records);
    // One bulk write, never one write per record.
    expect(harness.write).not.toHaveBeenCalled();
    expect(harness.library.characters).toEqual(records);

    const persisted = await stored(harness.databaseName);
    expect(persisted.map((character) => [character.id, character.createdAt])).toEqual([
      ['char-1', 111],
      ['char-2', 222],
    ]);
  });

  it('keeps the library copy of an id that is already present', async () => {
    const harness = makeHarness();
    const kept = makeCharacter(1, { name: 'Library copy', createdAt: 1 });
    await seed(harness.databaseName, [kept]);
    await harness.library.initialize();

    const result = await harness.library.restore([
      makeCharacter(1, { name: 'File copy', createdAt: 999 }),
      makeCharacter(2),
    ]);

    expect(result).toEqual({ added: 1, skipped: 1 });
    expect(harness.library.characters.map((character) => character.name)).toEqual([
      'Library copy',
      'Character 2',
    ]);
    expect(harness.writeMany.mock.calls[0][1].map((character) => character.id)).toEqual(['char-2']);

    const persisted = await stored(harness.databaseName);
    expect(persisted).toHaveLength(2);
    expect(persisted.find((character) => character.id === 'char-1')).toMatchObject({
      name: 'Library copy',
      createdAt: 1,
    });
  });

  it('writes nothing when every record is already present', async () => {
    const harness = makeHarness();
    await seed(harness.databaseName, [makeCharacter(1), makeCharacter(2)]);
    await harness.library.initialize();
    const before = harness.library.characters;

    const result = await harness.library.restore([makeCharacter(1), makeCharacter(2)]);

    expect(result).toEqual({ added: 0, skipped: 2 });
    expect(harness.writeMany).not.toHaveBeenCalled();
    expect(harness.library.characters).toBe(before);
  });

  it('runs after an accepted save, so the save is counted as present', async () => {
    const held = holdWrites();
    const harness = makeHarness({ write: held.write });
    await harness.library.initialize();
    held.hold();

    // The generated identity of the accepted save is 'id-1'.
    const save = harness.library.save(draft());
    const restore = harness.library.restore([
      { id: 'id-1', name: 'File copy', description: 'From the file', image: PNG_1X1, createdAt: 5 },
      makeCharacter(2),
    ]);
    await flushMicrotasks();

    // The save is accepted but not committed, so Restore waits behind it.
    expect(held.pending).toHaveLength(1);
    expect(harness.writeMany).not.toHaveBeenCalled();

    held.pending[0].release();
    await save;
    const result = await restore;

    expect(result).toEqual({ added: 1, skipped: 1 });
    expect(harness.writeMany).toHaveBeenCalledTimes(1);
    expect(harness.writeMany.mock.calls[0][1].map((character) => character.id)).toEqual(['char-2']);
    expect(harness.library.characters.map((character) => character.name)).toEqual([
      'Newcomer',
      'Character 2',
    ]);
  });

  it('publishes the added records in one step only after the transaction commits', async () => {
    const gate = deferred<void>();
    const harness = makeHarness({
      writeMany: vi.fn(async (database: IDBDatabase, records: Character[]) => {
        await gate.promise;
        return dbPutMany(database, records);
      }),
    });
    await harness.library.initialize();
    const before = harness.library.characters;

    const restore = harness.library.restore([makeCharacter(1), makeCharacter(2)]);
    await flushMicrotasks();

    // The transaction is queued but not committed: nothing is stored and the
    // canonical list has not moved.
    expect(harness.writeMany).toHaveBeenCalledTimes(1);
    expect(harness.library.characters).toBe(before);
    expect(await stored(harness.databaseName)).toEqual([]);

    gate.resolve();
    const result = await restore;

    expect(result).toEqual({ added: 2, skipped: 0 });
    expect(harness.library.characters).not.toBe(before);
    expect(harness.library.characters.map((character) => character.id)).toEqual([
      'char-1',
      'char-2',
    ]);
    expect(await stored(harness.databaseName)).toHaveLength(2);
  });

  it('leaves the canonical list unchanged when the write fails', async () => {
    const storageError = new Error('quota exceeded');
    const harness = makeHarness();
    await seed(harness.databaseName, [makeCharacter(1)]);
    await harness.library.initialize();
    const before = harness.library.characters;
    harness.writeMany.mockRejectedValueOnce(storageError);

    const refusal = await harness.library
      .restore([makeCharacter(2)])
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(LibraryError);
    expect((refusal as LibraryError).kind).toBe('write-failed');
    expect((refusal as LibraryError).cause).toBe(storageError);
    expect(harness.library.characters).toBe(before);
    expect(await stored(harness.databaseName)).toHaveLength(1);

    // A rejection never poisons the chain: the next Restore still commits.
    await expect(harness.library.restore([makeCharacter(2)])).resolves.toEqual({
      added: 1,
      skipped: 0,
    });
  });

  it('offers added records without a size pair to the background repair', async () => {
    const harness = makeHarness();
    await harness.library.initialize();

    await harness.library.restore([
      makeCharacter(1, { width: undefined, height: undefined }),
      makeCharacter(2),
    ]);

    // Only the record without a complete pair is measured.
    expect(harness.measures.map((call) => call.src)).toEqual([PNG_1X1]);

    harness.measures[0].resolve({ width: 8, height: 9 });
    await flushMicrotasks();
    expect(harness.writes).toHaveLength(1);
    await committed(harness.writes[0]);
    expect(harness.library.characters[0]).toMatchObject({ id: 'char-1', width: 8, height: 9 });
  });
});
