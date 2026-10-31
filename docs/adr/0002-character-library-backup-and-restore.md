# 0002: A Backup is a versioned JSON Lines file, restored additively

- Status: Accepted
- Date: 2026-10-31
- Related: issue #27, "Grilling 6/6: local Character library backup and restore"; follows ADR-0001 and the image-failure and dimension decisions in #32; its follow-on work blocks #29 and #30

## Context

The Character library exists only in origin-scoped IndexedDB. Clearing site
data, or serving the app from another scheme, host, or port, loses it
permanently, and the app promises no server and no upload. The only export
today is one PNG per Character, which keeps the image and discards the name,
the description, and the creation time.

Issue #27 decides that a whole-library Backup and Restore is the first slice,
and that browser eviction protection is requested alongside it. The decisions
below fit the existing system: browser-only, no network, no new runtime
dependency, one page-owned writer (ADR-0001), and the existing image fallback
and dimension rules from #32.

A single JSON document was rejected on measured grounds. Building and parsing a
library-shaped document costs about twice the file size on export and three
times on import, because import must hold the whole document as one string. A
267 MB document serialized; a 400 MB one failed with
`RangeError: Invalid string length`. The person with the largest library is the
person who most needs a Backup, so a format that fails there is not acceptable.
These measurements are grounding from Node 26, not browser evidence.

## Decision

**The Backup is one UTF-8 JSON Lines file.** The first line is a header, and
every following line is one stored Character with its image. Both directions
stream: export builds the download Blob from per-record parts rather than one
string, and Restore reads the file line by line, so no single string spans the
library.

**One line has a ceiling, and both directions apply it.** The reader holds at
most one line, bounded by 128 × 1024 × 1024 UTF-16 code units of the decoded
line. That count is a JavaScript string length, not a byte count, so a line of
non-ASCII text can carry more bytes than its length. Backup checks the same
bound on every serialized Character before it builds the file: a Character over
the bound refuses the whole Backup before any handoff, with a message that names
it. Backup therefore does not hand off a file with an over-bound Character line.

**The format is app-owned and versioned.** The header declares
`format: "character-gallery/backup"`, `formatVersion: 1`, `exportedAt`, and
`appVersion`. This version restores format version 1 only, and refuses an
unknown or newer version before writing anything, naming the version the file
declares. Later app versions keep restoring version 1. No other tool's format
is promised, and SillyTavern interchange stays excluded.

**A record is the stored Character, unchanged.** The fields are `id`, `name`,
`description`, `image` (a data URL), `width`/`height`, and `createdAt`.
Dimensions are accepted only as a complete, finite, positive pair; otherwise
both are omitted. Unknown extra fields are ignored. Validation checks the data
URL's shape — an `image/*` MIME type, the `base64` flag, and a non-empty
payload — not the pixels: an undisplayable image already has the #32 fallback,
and decoding hundreds of megabytes would buy no stronger guarantee.

**Restore is additive and idempotent.** Every Character keeps its stored `id`
and `createdAt`. When the `id` already exists in the library, the library's copy
wins and the file's copy is skipped, so Restore can never overwrite or roll back
local work, and re-Restoring the same Backup converges. A Restore that would
change nothing writes nothing.

**One write, all or none.** All admitted records are written in one IndexedDB
transaction; a failed or aborted transaction writes nothing and leaves the
canonical list unchanged. `CharacterLibrary` owns the collision rule, the write,
and the publish, and returns the actual added and skipped counts, so the report
cannot disagree with the library.

**File damage is separated from record damage.** A structural failure — not
JSON Lines, a missing or unreadable header, an unsupported version, or
duplicate ids within the file — rejects the whole file before any write. An
invalid record is skipped and reported, and the rest is restored. Nothing is
dropped silently.

**The file is delivered by the page, not by a server.** Export and Restore are
user-triggered file operations, offline, with no upload and no third-party
dependency. Persistent storage is requested once after the library is ready and
its state is shown in the Backup area; Backup and Restore never depend on the
outcome. The app shows no notice of its own when it asks, though the browser may
show its own permission prompt.

## Consequences

- A stale Backup cannot roll back a local edit. Overwriting or per-Character
  version history is a different feature, not a flag on this one.
- The format becomes a compatibility promise: version 1 must stay restorable,
  so a later shape change needs its own version or an upgrade path.
- Restore holds the admitted records in memory until the transaction commits,
  because an IndexedDB transaction cannot stay open across a stream. The cost is
  proportional to the file, not to a single string, and a large-library run is
  required evidence rather than an assumption.
- A new format module, a bulk write helper, and a library Restore operation are
  added. The database schema does not change.
- Recovery is not universal. A single Character whose serialized line exceeds
  the reader's bound cannot be backed up or restored by this app, and its
  library is refused as a whole, with that Character named, rather than partly
  written. The bound is the app's own ceiling on one record; the format and its
  version-1 bytes are unchanged by it.
- Damage that is not detectable from the data URL's shape — a byte-corrupt PNG,
  for example — restores a Character whose card shows the existing image
  fallback.

## Alternatives considered

- **A single JSON document.** Simplest, but it imports as one string and has a
  hard ceiling; measured above. It also needs an arbitrary size cap that would
  exclude the largest libraries.
- **A ZIP archive with a manifest and raw image files.** Linear memory in both
  directions and extractable without this app, but it needs a hand-rolled
  writer, reader, and CRC32 because no new dependency is allowed. That is the
  largest and riskiest slice for a first version.
- **A single JSON document with a documented size cap.** Accepts the ceiling
  and refuses to back up the libraries that need it most.
- **Minting new ids and creation times on Restore.** Reuses the existing save
  path, but every re-Restore duplicates the library and the original creation
  order is lost.
- **Replacing the library's copy on collision.** Makes a Backup able to roll
  back edits, but a stale file would silently destroy newer local work.
- **Refusing to Restore into a non-empty library.** Safest, but it blocks
  recovering a few deleted Characters and re-Restoring after a partial
  recovery.
- **Rejecting the whole file for one invalid record.** Strongest integrity
  statement, but one bad line in a large Backup would block recovery of
  everything else.
- **An unversioned format.** Every shape change becomes a silent break, and a
  newer file cannot be told from a damaged one.

## Out of scope

- Per-Character Backup, per-Character selection during Restore, and overwrite or
  rollback Restore.
- Checksums, compression, and a ZIP container.
- Drag-and-drop import, cancelling an in-flight Restore, and cross-tab
  synchronization.
- The File System Access API, cloud storage, accounts, and telemetry.
- SillyTavern card interchange and any other tool's file format.
- A schema migration, a second cache, or a generic notification system.
