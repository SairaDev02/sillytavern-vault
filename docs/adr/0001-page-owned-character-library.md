# 0001: The page-owned Character library is the only writer

- Status: Accepted
- Date: 2026-10-26
- Related: issue #21, spec "one page-owned Character library"; follows the selected-image extraction (#14)

## Context

Before this decision, `src/App.svelte` held the database connection, built every
`Character` record, preserved the creation time on an edit, called the storage
helpers, reloaded the whole library after each save, and started the legacy
dimension backfill. Four user-visible defects came from that arrangement:

- A save reported success when the storage was unavailable or failed to open.
  The form closed, nothing was stored, and no message appeared.
- The backfill measured an image, then wrote a stale copy of the whole record
  back. A name or description edited during the decode was overwritten.
- Adding a Character was possible before the library was ready, so a whole card
  could be entered that could not be saved.
- A failed single delete reported nothing. A failed batch delete kept the batch
  selected without saying whether anything was removed.

The page shell also could not tell a write that never committed from a write
that committed without the view catching up.

## Decision

One page-owned module, `src/character-library.svelte.ts` with the class
`CharacterLibrary`, becomes the single writer of Character records and the
single owner of the canonical list.

- `App.svelte` constructs one instance per page, calls `initialize()` on mount,
  reads `characters` and the start-up state, and calls `dispose()` on destroy.
  It no longer imports `db.ts`, `id.ts`, or `image.ts`, builds a record, reloads
  the list, or starts storage work.
- Every mutation is accepted by the module, committed on one serialized chain,
  and published into the canonical list in the same step. There is no
  full-library read after a mutation, and an older result cannot land after a
  newer one.
- A mutation promise resolves only after the storage transaction commits and the
  record is published. A rejection always means nothing was committed. The
  module exports the error kinds `unavailable`, `missing-target`, and
  `write-failed` so callers branch on the kind, never on message text.
- The module owns the record rules: a new identity on create, the stored
  identity and creation time on edit, a size that is a pair, and a stored size
  that survives only while the image is unchanged.
- The legacy size repair runs inside the module, outside the commit chain for
  the decode and inside it for the write. The write merges the measured pair
  into the record as it stands now, so a newer edit wins, a replaced image is
  not measured again with the old size, and a deleted record is not resurrected.
- Start-up has three distinct states. A failed open or read reaches `failed`
  with a message and an empty list; Retry calls `initialize()` again and never
  deletes or replaces stored records. Mutations attempted before readiness are
  rejected, never queued.
- The delete confirmation stays in the page shell. A failed delete sets one page
  notice that survives closing the lightbox. A failed batch delete also keeps
  the selection.

## Consequences

- The page shell no longer knows the storage rules, the record shape, or the
  order of a save. Adding a `Character` field touches the library, not two call
  sites that can drift apart.
- Storage semantics still live in `db.ts`: transaction commit, error, and abort
  handling are reused, not re-implemented.
- The canonical list is the only in-memory copy. A second cache would recreate
  the disagreement this decision removes.
- Recovery from a start-up failure is a Retry, not a page refresh. A temporary
  storage problem no longer loses the user's context.
- The module holds the database connection for the page lifetime and closes it
  after the commit chain drains on dispose.

## Alternatives considered

- **Keep the logic in `App.svelte` and add guards.** It leaves two owners of the
  record rules once the form also needs the draft shape, and the stale-copy
  repair would still be coordinated by a component.
- **Reload the library after each commit.** A read can fail after a committed
  write, which is how a retry used to create a duplicate. It also costs a full
  library read per save and can show an older list over a newer one.
- **Queue mutations while the library is unavailable.** An attempt made before
  readiness could land later without the user's knowledge. Rejecting is honest
  and keeps the draft on screen.
- **A repository or adapter layer over `db.ts`.** The spec treats this as out of
  scope. `db.ts` already exposes the transaction knowledge the module needs.
- **A custom confirmation dialog or a global notice system.** The change keeps
  the existing `confirm()` prompts, the lightbox behavior, and one page-level
  notice.

## Out of scope

- Multi-tab synchronization, cross-tab invalidation, and conflict resolution
  between tabs. The module orders its own operations only.
- Remote or server storage, a generic repository framework, and a second cache.
- New runtime dependencies, a new browser test runner, and property-based tests.
- A schema migration. No stored field changed, and the database version stays 1.
