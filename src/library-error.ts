/**
 * Why a Character library mutation was refused.
 *
 * This module has no storage imports, so a component can branch on the error
 * kind without pulling the database into its own module graph.
 */

export type LibraryErrorKind = 'unavailable' | 'missing-target' | 'write-failed';

export class LibraryError extends Error {
  readonly kind: LibraryErrorKind;
  /** The underlying storage error, for a write that did not commit. */
  readonly cause: unknown;

  constructor(kind: LibraryErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = 'LibraryError';
    this.kind = kind;
    this.cause = cause;
  }
}
