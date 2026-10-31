import { openDB, dbAdd, dbGetAll, dbDelete, dbDeleteMany, dbPutMany } from './db';
import { generateId } from './id';
import { measureImage } from './image';
import { LibraryError } from './library-error';
import type { Character } from './types';

export { LibraryError } from './library-error';
export type { LibraryErrorKind } from './library-error';

/**
 * The stored Character collection and the only writer of Character records.
 *
 * One instance belongs to one page lifetime. It owns the canonical list, the
 * start-up status, the persisted-record rules, mutation ordering, and the
 * background repair of old records. The page shell reads the list and renders
 * it; it never builds a record or reloads the library after a mutation.
 */

const DEFAULT_DATABASE_NAME = 'character-gallery';

/** Shown once when one or more stored images could not be measured. */
export const REPAIR_WARNING =
  'Some stored images could not be measured. Their cards keep the fallback shape.';

export type LibraryStatus = 'loading' | 'ready' | 'failed';

/** What a Restore would add, and what it keeps because the library holds it. */
export interface RestoreCounts {
  added: number;
  skipped: number;
}

/** One Restore batch split by the collision rule: what is written, and the counts. */
export interface RestorePlan {
  /** The records a write adds, in batch order. */
  records: Character[];
  counts: RestoreCounts;
}

/**
 * The collision rule, in its one home: a record whose identity the library
 * already holds is kept rather than written, and so is the second copy of an
 * identity inside one batch. Restore and the section's preview both count with
 * this function, so neither can state a different rule.
 */
export function planRestore(
  records: readonly Character[],
  present: readonly Character[]
): RestorePlan {
  const held = new Set(present.map((character) => character.id));
  const added: Character[] = [];

  for (const record of records) {
    if (held.has(record.id)) continue;
    held.add(record.id);
    added.push(record);
  }

  return {
    records: added,
    counts: { added: added.length, skipped: records.length - added.length },
  };
}

/** What the form hands over. The library owns identity, creation time, and size rules. */
export interface CharacterDraft {
  id?: string;
  name: string;
  description: string;
  image: string;
  width?: number;
  height?: number;
}

export interface CharacterLibraryDeps {
  openDatabase?: (name: string) => Promise<IDBDatabase>;
  readAll?: (database: IDBDatabase) => Promise<Character[]>;
  write?: (database: IDBDatabase, character: Character) => Promise<void>;
  remove?: (database: IDBDatabase, id: string) => Promise<void>;
  removeMany?: (database: IDBDatabase, ids: string[]) => Promise<void>;
  writeMany?: (database: IDBDatabase, records: Character[]) => Promise<void>;
  measure?: (src: string) => Promise<{ width: number; height: number }>;
  generateId?: () => string;
  now?: () => number;
  databaseName?: string;
  logger?: Pick<Console, 'warn' | 'error'>;
}

function hasSize(record: { width?: number; height?: number }): boolean {
  return typeof record.width === 'number' && typeof record.height === 'number';
}

/**
 * Resolve the size that belongs to this record's own image. A supplied pair is
 * used as given, a partial pair collapses to no size, and the stored pair is
 * kept only while the image is unchanged.
 */
function resolveSize(
  draft: CharacterDraft,
  stored: Character | undefined
): { width?: number; height?: number } {
  if (hasSize(draft)) return { width: draft.width, height: draft.height };
  if (stored && stored.image === draft.image && hasSize(stored)) {
    return { width: stored.width, height: stored.height };
  }
  return { width: undefined, height: undefined };
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

export class CharacterLibrary {
  readonly #openDatabase: (name: string) => Promise<IDBDatabase>;
  readonly #readAll: (database: IDBDatabase) => Promise<Character[]>;
  readonly #write: (database: IDBDatabase, character: Character) => Promise<void>;
  readonly #remove: (database: IDBDatabase, id: string) => Promise<void>;
  readonly #removeMany: (database: IDBDatabase, ids: string[]) => Promise<void>;
  readonly #writeMany: (database: IDBDatabase, records: Character[]) => Promise<void>;
  readonly #measure: (src: string) => Promise<{ width: number; height: number }>;
  readonly #generateId: () => string;
  readonly #now: () => number;
  readonly #databaseName: string;
  readonly #logger: Pick<Console, 'warn' | 'error'>;

  #database: IDBDatabase | null = null;
  #disposed = false;
  /** Bumped by every `initialize`; older reads and older repairs go stale. */
  #lifetime = 0;
  /** Serialized commit-and-publish steps. Acceptance order is commit order. */
  #chain: Promise<void> = Promise.resolve();
  /** One measurement attempt per identity and image generation. */
  #attempts = new Set<string>();
  #imageGenerations = new Map<string, number>();

  #characters = $state<Character[]>([]);
  #status = $state<LibraryStatus>('loading');
  #failureMessage = $state<string | null>(null);
  #repairWarning = $state<string | null>(null);

  constructor(deps: CharacterLibraryDeps = {}) {
    this.#openDatabase = deps.openDatabase ?? openDB;
    this.#readAll = deps.readAll ?? ((database) => dbGetAll<Character>(database));
    this.#write = deps.write ?? dbAdd;
    this.#remove = deps.remove ?? dbDelete;
    this.#removeMany = deps.removeMany ?? dbDeleteMany;
    this.#writeMany = deps.writeMany ?? dbPutMany;
    this.#measure = deps.measure ?? measureImage;
    this.#generateId = deps.generateId ?? generateId;
    this.#now = deps.now ?? Date.now;
    this.#databaseName = deps.databaseName ?? DEFAULT_DATABASE_NAME;
    this.#logger = deps.logger ?? console;
  }

  /** The canonical list. Nothing else may hold a second copy. */
  get characters(): Character[] {
    return this.#characters;
  }

  get status(): LibraryStatus {
    return this.#status;
  }

  /** The reason a start-up failed, for the user to describe. */
  get failureMessage(): string | null {
    return this.#failureMessage;
  }

  /** One quiet notice for a batch of failed size measurements, or null. */
  get repairWarning(): string | null {
    return this.#repairWarning;
  }

  /**
   * Open the library and read every record. The same call serves the first
   * start and Retry. A later call supersedes an earlier one.
   */
  initialize(): Promise<void> {
    if (this.#disposed) return Promise.resolve();

    const lifetime = ++this.#lifetime;
    this.#status = 'loading';
    this.#failureMessage = null;

    // Wait for writes accepted before this call to commit, then read outside
    // the chain, so a superseded start cannot hold up a newer one.
    return this.#enqueue(() => Promise.resolve()).then(async () => {
      if (this.#disposed || lifetime !== this.#lifetime) return;

      let database: IDBDatabase | null = null;
      try {
        database = await this.#openDatabase(this.#databaseName);
        const records = await this.#readAll(database);

        if (this.#disposed || lifetime !== this.#lifetime) {
          database.close();
          return;
        }

        const loaded = database;
        await this.#enqueue(async () => {
          if (this.#disposed || lifetime !== this.#lifetime) {
            loaded.close();
            return;
          }

          // A fresh lifetime gets a fresh set of repair attempts.
          this.#attempts.clear();
          this.#imageGenerations.clear();
          this.#adoptDatabase(loaded);
          this.#characters = records;
          this.#failureMessage = null;
          this.#repairWarning = null;
          this.#status = 'ready';
          this.#scheduleRepair();
        });
      } catch (error) {
        database?.close();
        if (this.#disposed || lifetime !== this.#lifetime) return;

        await this.#enqueue(async () => {
          if (this.#disposed || lifetime !== this.#lifetime) return;

          const previous = this.#database;
          this.#database = null;
          previous?.close();
          this.#characters = [];
          this.#status = 'failed';
          this.#failureMessage = describeError(error);
          this.#logger.error('Failed to open the character library:', error);
        });
      }
    });
  }

  /**
   * Store a draft, then publish the committed record. The promise resolves
   * only after both, and a rejection always means nothing was committed.
   */
  save(draft: CharacterDraft): Promise<void> {
    const copy: CharacterDraft = { ...draft };
    return this.#queueMutation((database) => this.#commitSave(database, copy));
  }

  /** Delete one record, then drop it from the canonical list. */
  remove(id: string): Promise<void> {
    return this.#queueMutation(async (database) => {
      await this.#commitRemoval(
        () => this.#remove(database, id),
        'The Character could not be deleted.'
      );
      this.#finishRemoval([id]);
    });
  }

  /** Delete every record or none, then publish the removal. */
  removeMany(ids: string[]): Promise<void> {
    const copied = [...ids];
    return this.#queueMutation(async (database) => {
      await this.#commitRemoval(
        () => this.#removeMany(database, copied),
        'The selected Characters could not be deleted.'
      );
      this.#finishRemoval(copied);
    });
  }

  /**
   * Add every record the library does not already hold, in one transaction.
   *
   * Restore keeps each record's stored identity and creation time, so it can
   * never overwrite or roll back local work. The collision rule is
   * `planRestore`, applied here on the mutation chain against the list as it
   * stands when the write is about to run, so the returned counts are what
   * actually happened. A rejection means nothing was written and the canonical
   * list is unchanged.
   */
  restore(records: Character[]): Promise<RestoreCounts> {
    const copied = records.map((record) => ({ ...record }));
    return this.#queueMutation(async (database) => {
      const plan = planRestore(copied, this.#characters);

      if (plan.records.length > 0) {
        try {
          await this.#writeMany(database, plan.records);
        } catch (error) {
          throw new LibraryError(
            'write-failed',
            'The Characters could not be restored.',
            error
          );
        }
        this.#publishMany(plan.records);
        this.#scheduleRepair();
      }

      return plan.counts;
    });
  }

  /**
   * Resolve once every mutation accepted before this call has settled.
   *
   * A Backup uses this as its read barrier: it queues behind the same chain as
   * saves and deletes, so the canonical list it then reads already contains
   * every accepted change. It deliberately does not wait for background image
   * measurement and does not read storage again.
   */
  settled(): Promise<void> {
    try {
      this.#requireDatabase();
    } catch (error) {
      return Promise.reject(error);
    }
    return this.#enqueue(() => Promise.resolve());
  }

  /**
   * Mark the instance inactive. New calls reject, late repairs and late
   * publications publish nothing, and an accepted mutation still commits and
   * settles. The connection closes once the queue drains.
   */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#lifetime += 1;

    const database = this.#database;
    this.#database = null;
    if (database) void this.#chain.then(() => database.close());
  }

  #requireDatabase(): IDBDatabase {
    if (this.#disposed || this.#status !== 'ready' || !this.#database) {
      throw new LibraryError('unavailable', 'The character library is not available.');
    }
    return this.#database;
  }

  /** Reject immediately when unavailable; otherwise queue the write-and-publish step. */
  #queueMutation<T>(step: (database: IDBDatabase) => Promise<T>): Promise<T> {
    let database: IDBDatabase;
    try {
      database = this.#requireDatabase();
    } catch (error) {
      return Promise.reject(error);
    }
    return this.#enqueue(() => step(database));
  }

  async #commitRemoval(run: () => Promise<void>, failureMessage: string): Promise<void> {
    try {
      await run();
    } catch (error) {
      throw new LibraryError('write-failed', failureMessage, error);
    }
  }

  #finishRemoval(ids: string[]): void {
    for (const id of ids) this.#bumpGeneration(id);
    this.#publishRemoval(ids);
  }

  #adoptDatabase(database: IDBDatabase): void {
    const previous = this.#database;
    this.#database = database;
    if (previous) void this.#chain.then(() => previous.close());
  }

  /** Append a step to the one serialized chain. A failed step never poisons it. */
  #enqueue<T>(step: () => Promise<T>): Promise<T> {
    const result = this.#chain.then(step);
    this.#chain = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  #generationOf(id: string): number {
    return this.#imageGenerations.get(id) ?? 0;
  }

  #bumpGeneration(id: string): void {
    this.#imageGenerations.set(id, this.#generationOf(id) + 1);
  }

  async #commitSave(database: IDBDatabase, draft: CharacterDraft): Promise<void> {
    const stored = draft.id
      ? this.#characters.find((character) => character.id === draft.id)
      : undefined;

    // An edit aimed at a record that is no longer in the library must not
    // invent a new record or a new creation time.
    if (draft.id && !stored) {
      throw new LibraryError(
        'missing-target',
        'The Character no longer exists in the library.'
      );
    }

    const record: Character = {
      id: stored ? stored.id : this.#generateId(),
      name: draft.name,
      description: draft.description,
      image: draft.image,
      ...resolveSize(draft, stored),
      createdAt: stored ? stored.createdAt : this.#now(),
    };

    try {
      await this.#write(database, record);
    } catch (error) {
      throw new LibraryError('write-failed', 'The Character could not be stored.', error);
    }

    if (stored && stored.image !== record.image) {
      this.#bumpGeneration(record.id);
    }
    this.#publish(record);
    this.#scheduleRepair();
  }

  #publish(record: Character): void {
    if (this.#disposed) return;

    const index = this.#characters.findIndex((character) => character.id === record.id);
    if (index === -1) {
      this.#characters = [...this.#characters, record];
      return;
    }

    const next = [...this.#characters];
    next[index] = record;
    this.#characters = next;
  }

  #publishRemoval(ids: string[]): void {
    if (this.#disposed) return;
    this.#characters = this.#characters.filter((character) => !ids.includes(character.id));
  }

  /** Add a committed Restore batch to the canonical list in one step. */
  #publishMany(records: Character[]): void {
    if (this.#disposed) return;
    this.#characters = [...this.#characters, ...records];
  }

  /**
   * Offer every record without a size to the background repair, at most once
   * per identity and image generation in this lifetime.
   */
  #scheduleRepair(): void {
    if (this.#disposed || this.#status !== 'ready') return;

    for (const record of this.#characters) {
      if (hasSize(record)) continue;

      const generation = this.#generationOf(record.id);
      const key = `${record.id}:${generation}`;
      if (this.#attempts.has(key)) continue;

      this.#attempts.add(key);
      void this.#repair(record.id, record.image, generation, this.#lifetime);
    }
  }

  async #repair(id: string, image: string, generation: number, lifetime: number): Promise<void> {
    let size: { width: number; height: number };
    try {
      // The decode stays outside the chain so it never holds up foreground work.
      size = await this.#measure(image);
    } catch (error) {
      if (this.#disposed || lifetime !== this.#lifetime) return;

      // One notice for any number of failures, with each reason in the console.
      this.#repairWarning = REPAIR_WARNING;
      const name = this.#characters.find((character) => character.id === id)?.name ?? id;
      this.#logger.warn(`Failed to measure dimensions for ${name}:`, error);
      return;
    }

    if (this.#disposed || lifetime !== this.#lifetime) return;

    await this.#enqueue(async () => {
      if (this.#disposed || lifetime !== this.#lifetime) return;

      const database = this.#database;
      const current = this.#characters.find((character) => character.id === id);
      // The record must still exist, still show the measured image, still be
      // the same generation, and still have no size.
      if (!database || !current) return;
      if (current.image !== image) return;
      if (this.#generationOf(id) !== generation) return;
      if (hasSize(current)) return;

      // Merge into the record as it stands now, never the snapshot the repair
      // started with, so a newer name or description always wins.
      const updated: Character = { ...current, width: size.width, height: size.height };
      try {
        await this.#write(database, updated);
      } catch (error) {
        if (this.#disposed) return;
        this.#repairWarning = REPAIR_WARNING;
        this.#logger.warn(`Failed to store dimensions for ${current.name}:`, error);
        return;
      }
      this.#publish(updated);
    });
  }
}
