import type { Character } from './types';

/** Characters rendered before the load-more sentinel adds another page. */
export const PAGE_SIZE = 24;

export type SortMode = 'newest' | 'oldest' | 'name';

/**
 * Filter by a free-text term. The term matches the name or the description,
 * ignoring case. An empty term keeps the list unchanged.
 */
export function filterCharacters(characters: Character[], searchTerm: string): Character[] {
  const term = searchTerm.trim().toLowerCase();
  if (!term) return characters;

  return characters.filter(
    (character) =>
      (character.name ?? '').toLowerCase().includes(term) ||
      (character.description ?? '').toLowerCase().includes(term)
  );
}

/**
 * Sort a copy of the list. Name order ignores case so that "apple" sorts next
 * to "Apple" instead of after "Zebra".
 */
export function sortCharacters(characters: Character[], sortMode: SortMode): Character[] {
  const sorted = [...characters];

  switch (sortMode) {
    case 'oldest':
      return sorted.sort((a, b) => a.createdAt - b.createdAt);
    case 'name':
      return sorted.sort((a, b) =>
        (a.name ?? '').localeCompare(b.name ?? '', undefined, {
          sensitivity: 'base',
          numeric: true,
        })
      );
    case 'newest':
    default:
      return sorted.sort((a, b) => b.createdAt - a.createdAt);
  }
}

/** Filter and sort without mutating the input list. */
export function filterAndSortCharacters(
  characters: Character[],
  searchTerm: string,
  sortMode: SortMode
): Character[] {
  return sortCharacters(filterCharacters(characters, searchTerm), sortMode);
}
