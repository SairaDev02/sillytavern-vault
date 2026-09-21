import { describe, it, expect, beforeEach } from 'vitest';
import { openDB, dbAdd, dbGetAll, dbDelete, dbDeleteMany } from '../src/db';

let testDbCounter = 0;
function getTestDbName(): string {
  return `character-gallery-test-${testDbCounter++}`;
}

const STORE_NAME = 'characters';

interface Character {
  id: string;
  name: string;
  description: string;
  image: string;
  createdAt: number;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
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
    const char: Character = {
      id: generateId(),
      name: 'Test Character',
      description: 'A test character',
      image: 'data:image/png;base64,iVBORw0KGgo=',
      createdAt: Date.now(),
    };

    await dbAdd(db!, char);
    const all = await dbGetAll<Character>(db!);

    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Test Character');
    expect(all[0].description).toBe('A test character');
  });

  it('should retrieve multiple characters', async () => {
    const char1: Character = {
      id: generateId(),
      name: 'Character One',
      description: '',
      image: 'data:image/png;base64,iVBORw0KGgo=',
      createdAt: Date.now(),
    };

    const char2: Character = {
      id: generateId(),
      name: 'Character Two',
      description: '',
      image: 'data:image/png;base64,iVBORw0KGgo=',
      createdAt: Date.now(),
    };

    await dbAdd(db!, char1);
    await dbAdd(db!, char2);

    const all = await dbGetAll<Character>(db!);
    expect(all).toHaveLength(2);
  });

  it('should delete a character', async () => {
    const char: Character = {
      id: generateId(),
      name: 'To Delete',
      description: '',
      image: 'data:image/png;base64,iVBORw0KGgo=',
      createdAt: Date.now(),
    };

    await dbAdd(db!, char);
    expect(await dbGetAll<Character>(db!)).toHaveLength(1);

    await dbDelete(db!, char.id);
    expect(await dbGetAll<Character>(db!)).toHaveLength(0);
  });

  it('should update a character when re-added with same ID', async () => {
    const id = generateId();
    const original: Character = {
      id,
      name: 'Original Name',
      description: '',
      image: 'data:image/png;base64,iVBORw0KGgo=',
      createdAt: Date.now(),
    };

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
    const char1: Character = { id: generateId(), name: 'Char 1', description: '', image: 'data:image/png;base64,iVBORw0KGgo=', createdAt: Date.now() };
    const char2: Character = { id: generateId(), name: 'Char 2', description: '', image: 'data:image/png;base64,iVBORw0KGgo=', createdAt: Date.now() };
    const char3: Character = { id: generateId(), name: 'Char 3', description: '', image: 'data:image/png;base64,iVBORw0KGgo=', createdAt: Date.now() };

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
    const char: Character = { id: generateId(), name: 'Keep Me', description: '', image: 'data:image/png;base64,iVBORw0KGgo=', createdAt: Date.now() };
    await dbAdd(db!, char);

    await dbDeleteMany(db!, []);
    expect(await dbGetAll<Character>(db!)).toHaveLength(1);
  });
});

describe('ID Generation', () => {
  it('should generate unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('should generate non-empty string IDs', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});
