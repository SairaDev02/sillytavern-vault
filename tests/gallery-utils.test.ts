import { describe, it, expect } from 'vitest';
import {
  filterCharacters,
  filterAndSortCharacters,
  sortCharacters,
} from '../src/gallery-utils';
import { makeCharacter } from './fixtures';

describe('filterCharacters', () => {
  const list = [
    makeCharacter(1, { name: 'Alice', description: 'A knight' }),
    makeCharacter(2, { name: 'Bob', description: 'A merchant' }),
    makeCharacter(3, { name: 'carol', description: 'A KNIGHT of the round table' }),
  ];

  it('should return the same list for an empty term', () => {
    expect(filterCharacters(list, '')).toBe(list);
    expect(filterCharacters(list, '   ')).toBe(list);
  });

  it('should match the name without regard to case', () => {
    expect(filterCharacters(list, 'ALICE').map((c) => c.name)).toEqual(['Alice']);
    expect(filterCharacters(list, 'car').map((c) => c.name)).toEqual(['carol']);
  });

  it('should match the description without regard to case', () => {
    expect(filterCharacters(list, 'knight').map((c) => c.name)).toEqual(['Alice', 'carol']);
  });

  it('should return an empty list when nothing matches', () => {
    expect(filterCharacters(list, 'dragon')).toEqual([]);
  });

  it('should tolerate records with missing fields', () => {
    const legacy = [{ id: 'x', createdAt: 1, image: '' } as never];
    expect(filterCharacters(legacy, 'anything')).toEqual([]);
    expect(() => filterCharacters(legacy, '')).not.toThrow();
  });
});

describe('sortCharacters', () => {
  it('should sort newest first', () => {
    const list = [makeCharacter(1), makeCharacter(3), makeCharacter(2)];
    expect(sortCharacters(list, 'newest').map((c) => c.id)).toEqual([
      'char-3',
      'char-2',
      'char-1',
    ]);
  });

  it('should sort oldest first', () => {
    const list = [makeCharacter(3), makeCharacter(1), makeCharacter(2)];
    expect(sortCharacters(list, 'oldest').map((c) => c.id)).toEqual([
      'char-1',
      'char-2',
      'char-3',
    ]);
  });

  it('should sort by name without regard to case', () => {
    const list = [
      makeCharacter(1, { name: 'Zebra' }),
      makeCharacter(2, { name: 'apple' }),
      makeCharacter(3, { name: 'Banana' }),
    ];
    expect(sortCharacters(list, 'name').map((c) => c.name)).toEqual([
      'apple',
      'Banana',
      'Zebra',
    ]);
  });

  it('should sort numbered names naturally', () => {
    const list = [
      makeCharacter(1, { name: 'Character 10' }),
      makeCharacter(2, { name: 'Character 2' }),
    ];
    expect(sortCharacters(list, 'name').map((c) => c.name)).toEqual([
      'Character 2',
      'Character 10',
    ]);
  });

  it('should not mutate the input list', () => {
    const list = [makeCharacter(1), makeCharacter(2)];
    const before = [...list];

    sortCharacters(list, 'oldest');

    expect(list).toEqual(before);
  });
});

describe('filterAndSortCharacters', () => {
  it('should filter and sort in one step', () => {
    const list = [
      makeCharacter(1, { name: 'Alice', description: 'mage' }),
      makeCharacter(2, { name: 'Bob', description: 'mage' }),
      makeCharacter(3, { name: 'Carol', description: 'rogue' }),
    ];

    const result = filterAndSortCharacters(list, 'mage', 'name');
    expect(result.map((c) => c.name)).toEqual(['Alice', 'Bob']);
  });
});
