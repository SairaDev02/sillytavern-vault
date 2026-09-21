import { describe, it, expect, beforeEach } from 'vitest';
import { openDB, dbAdd, dbGetAll, dbDelete, dbDeleteMany, STORE_NAME } from '../src/db';
import { generateId } from '../src/id';
import type { Character } from '../src/types';

let testDbCounter = 0;
function getTestDbName(): string {
  return `character-gallery-test-${testDbCounter++}`;
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
});
