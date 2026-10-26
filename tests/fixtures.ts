/**
 * Shared fixtures for tests.
 */

import type { Character } from '../src/types';

/** A real 1x1 PNG, used as a stand-in for a stored character image. */
export const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

export function makeCharacter(index: number, overrides: Partial<Character> = {}): Character {
  return {
    id: `char-${index}`,
    name: `Character ${index}`,
    description: `Description ${index}`,
    image: PNG_1X1,
    width: 1,
    height: 1,
    createdAt: 1_700_000_000_000 + index,
    ...overrides,
  };
}

export function makeCharacters(count: number, startIndex = 1): Character[] {
  return Array.from({ length: count }, (_, i) => makeCharacter(startIndex + i));
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

/** A promise whose settlement the test controls. */
export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A file object with the given name, used for controlled file-read tests. */
export function makeFile(name: string): File {
  return new File([new Uint8Array([1])], name, { type: 'image/png' });
}
