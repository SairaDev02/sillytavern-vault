# Character Gallery: LLM Context

Purpose: machine-readable orientation for this repository. Read this file before the source.
Audience: a coding agent that will modify the code. Optimized for retrieval, not for prose.
Companion documents: `docs/WIKI.md` (narrative, developer-facing), `docs/designMasonry.md` (layout rationale).

Facts below are verified against the current `HEAD`. When this file and the code disagree, the code wins. Update this file in the same pull request as the code, as the [Documentation Map](WIKI.md#18-documentation-map) requires.

---

## 1. Task Loop

```bash
npm install            # once
npm start              # build if dist/ is stale, serve it on :4173, open the browser
npm run dev            # Vite dev server, http://localhost:5173
npm test               # vitest run, all files
npx vitest run tests/gallery-scroll.test.ts   # one file
npx vitest run -t "sentinel"                  # by test name
npm run check          # svelte-check (types for src + tests)
npm run build          # vite build -> dist/ (does NOT type-check)
```

Definition of done for a code change:

1. `npm test` passes.
2. `npm run check` reports `0 errors and 0 warnings`.
3. `npm run build` succeeds.
4. The applicable documents are updated, per the [Documentation Map](WIKI.md#18-documentation-map).

There is no local linter or formatter: run the three commands above by hand. CI (`.github/workflows/ci.yml`) runs the same three commands for pushes to `main`, pull requests, and manual dispatch. It tests six Node and npm combinations. Four use the latest npm 12: Node 24.15.0, the latest 24.x, 26.0.0, and the latest 26.x. Two use npm 12.0.0: Node 24.15.0 and 26.0.0. Each combination enforces the dependency engine ranges during the install. See `CONTRIBUTING.md` for the merge expectations. `git log --oneline` messages record why the current code is shaped the way it is; read them before "simplifying" odd-looking code.

---

## 2. Repo Map

| Path | Role | Open when |
|---|---|---|
| `index.html` | Entry page, loads `src/main.ts` | Rarely |
| `src/main.ts` | `mount(App, { target: '#app' })` | Never |
| `src/App.svelte` | Page shell: renders the library state and its status, the delete notice, the download notice, and the form or gallery | Page layout, start-up states, notices, Retry focus |
| `src/types.ts` | `Character` interface | Any data-shape question |
| `src/character-library.svelte.ts` | `CharacterLibrary` class: the canonical list, start-up and Retry, record rules, mutation ordering, delete outcomes, legacy size repair | Any persistence, list, or record-rule change |
| `src/library-error.ts` | `LibraryError` + `LibraryErrorKind`, no storage imports | Error-kind branching in a component |
| `src/db.ts` | IndexedDB open/add/delete/getAll | Storage behavior |
| `src/id.ts` | `generateId()` | Id format |
| `src/image.ts` | `measureImage(src)` | Intrinsic size logic |
| `src/image-frame.ts` | The frame rule shared by the card and the lightbox: stored pair or 4:3 fallback, plus the source-scoped failure check | Image shape or image-failure display |
| `src/download-attempts.svelte.ts` | `DownloadAttempts` class: page-owned attempts, per-Character ordering, the one failure notice | Download feedback |
| `src/selected-image.svelte.ts` | `SelectedImage` class: choice ordering, image/dimension pairing, readiness, discard, obsolete-result suppression | Character form image behavior |
| `src/gallery-utils.ts` | `PAGE_SIZE`, `SortMode`, filter/sort | Search, sort, page size |
| `src/download.ts` | Data URL parse, PNG conversion, filename, download | Export path |
| `src/style.css` | Tailwind import + `@theme` color tokens | Colors, theme |
| `src/components/Gallery.svelte` | View state: search, sort, selection, paging, lightbox state | Any gallery behavior |
| `src/components/GalleryToolbar.svelte` | Search input, sort select, select-mode controls | Toolbar UI |
| `src/components/MasonryGrid.svelte` | CSS columns, keyed list, flip/fade animation | Layout, animation |
| `src/components/MasonryItem.svelte` | One card: image, hover label, download, checkbox | Card UI |
| `src/components/Lightbox.svelte` | `<dialog>` detail view, keyboard + button nav | Detail view |
| `src/components/CharacterForm.svelte` | Add/edit form, text fields, save gating and locking | Form behavior |
| `tests/*` | Vitest suites + helpers | Any behavior change |
| `docs/WIKI.md` | Developer wiki | Before changing architecture |

Recommended reading order for first contact: `src/types.ts` -> `src/character-library.svelte.ts` -> `src/App.svelte` -> `src/components/Gallery.svelte` -> `src/gallery-utils.ts` -> `src/db.ts` -> the remaining components.

Component graph:

```mermaid
graph TD
  main --> App
  App --> characterLibrary
  App --> downloadAttempts
  App --> Gallery
  App --> CharacterForm
  characterLibrary --> db
  characterLibrary --> id
  characterLibrary --> image
  downloadAttempts --> download
  Gallery --> GalleryToolbar
  Gallery --> MasonryGrid
  Gallery --> Lightbox
  Gallery --> galleryUtils
  MasonryGrid --> MasonryItem
  MasonryItem --> imageFrame
  Lightbox --> imageFrame
  CharacterForm --> selectedImage
  selectedImage --> image
```

---

## 3. API Surface (exact)

```ts
// src/types.ts
export interface Character {
  id: string; name: string; description: string; image: string;
  width?: number; height?: number; createdAt: number;
}

// src/db.ts
export const STORE_NAME = 'characters';
export function openDB(dbName: string): Promise<IDBDatabase>;
export function dbAdd<T>(db: IDBDatabase, item: T): Promise<void>;      // put: insert-or-replace
export function dbDelete(db: IDBDatabase, id: string): Promise<void>;
export function dbGetAll<T>(db: IDBDatabase): Promise<T[]>;
export function dbDeleteMany(db: IDBDatabase, ids: string[]): Promise<void>;

// src/id.ts
export function generateId(): string;   // crypto.randomUUID(), fallback: time36 + random

// src/image.ts
export function measureImage(src: string): Promise<{ width: number; height: number }>;

// src/image-frame.ts
export const FALLBACK_IMAGE_SIZE = { width: 4, height: 3 };
export const IMAGE_UNAVAILABLE_TEXT = 'Image unavailable';
export function isUsableImageSize(size: { width?: number; height?: number } | null | undefined): boolean;
export function imageFrameSize(size: { width?: number; height?: number } | null | undefined): { width: number; height: number };
export function imageFrameAspectRatio(size: { width?: number; height?: number } | null | undefined): string;
export function isImageUnavailable(source: string, failedSource: string | null): boolean;

// src/download-attempts.svelte.ts
export interface DownloadNotice { characterId: string; characterName: string; }
export class DownloadAttempts {
  readonly notice: DownloadNotice | null;
  readonly message: string | null;
  start(character: Character): void;
  dismiss(): void;
}

// src/selected-image.svelte.ts
export type PreparationStatus = 'idle' | 'preparing' | 'ready' | 'failed';
export interface ImageSnapshot { image: string; width?: number; height?: number; }
export interface SelectedImageDeps {
  readFile?: (file: File) => Promise<string>;
  measure?: (src: string) => Promise<{ width: number; height: number }>;
}
export class SelectedImage {
  constructor(initial: ImageSnapshot | null, deps?: SelectedImageDeps);
  readonly image: string;
  readonly status: PreparationStatus;
  readonly error: string | null;
  readonly warning: string | null;
  readonly canSubmit: boolean;
  readonly hasReplacement: boolean;
  select(file: File): void;
  discard(): void;
  snapshot(): ImageSnapshot | null;
  dispose(): void;
}

// src/character-library.svelte.ts
export const REPAIR_WARNING: string;
export type LibraryStatus = 'loading' | 'ready' | 'failed';
export interface CharacterDraft {
  id?: string; name: string; description: string; image: string;
  width?: number; height?: number;
}
export interface CharacterLibraryDeps {
  openDatabase?: (name: string) => Promise<IDBDatabase>;
  readAll?: (db: IDBDatabase) => Promise<Character[]>;
  write?: (db: IDBDatabase, character: Character) => Promise<void>;
  remove?: (db: IDBDatabase, id: string) => Promise<void>;
  removeMany?: (db: IDBDatabase, ids: string[]) => Promise<void>;
  measure?: (src: string) => Promise<{ width: number; height: number }>;
  generateId?: () => string;
  now?: () => number;
  databaseName?: string;
  logger?: Pick<Console, 'warn' | 'error'>;
}
export class CharacterLibrary {
  constructor(deps?: CharacterLibraryDeps);
  readonly characters: Character[];
  readonly status: LibraryStatus;
  readonly failureMessage: string | null;
  readonly repairWarning: string | null;
  initialize(): Promise<void>;
  save(draft: CharacterDraft): Promise<void>;
  remove(id: string): Promise<void>;
  removeMany(ids: string[]): Promise<void>;
  dispose(): void;
}

// src/library-error.ts (re-exported by character-library.svelte.ts)
export type LibraryErrorKind = 'unavailable' | 'missing-target' | 'write-failed';
export class LibraryError extends Error {
  readonly kind: LibraryErrorKind;
  readonly cause: unknown;
}

// src/gallery-utils.ts
export const PAGE_SIZE = 24;
export type SortMode = 'newest' | 'oldest' | 'name';
export function filterCharacters(characters: Character[], searchTerm: string): Character[];
export function sortCharacters(characters: Character[], sortMode: SortMode): Character[];
export function filterAndSortCharacters(characters: Character[], searchTerm: string, sortMode: SortMode): Character[];

// src/download.ts
export function parseDataUrl(dataUrl: string): { mime: string; base64: string; ext: string };
export function base64ToBlob(base64: string, mime: string): Blob;
export function sanitizeFilename(name: string): string;
export function downloadCharacterImage(character: Character): Promise<void>;
```

`parseDataUrl` throws with these messages (asserted by tests):
`'Invalid data URL'` (no match), `'Unsupported data URL type: <mime>'` (not `image/*`), `'Unsupported data URL: expected base64 encoding'` (missing `;base64`).

`sanitizeFilename` returns `'character'` for an empty result or a reserved Windows base name (`con prn aux nul com1-9 lpt1-9`); it strips `\ / : * ? " < > |`, control chars, and trailing dots/spaces.

---

## 4. Component Contracts

| Component | Props (`?` = optional) | Notes |
|---|---|---|
| `App` | none | Page shell. Constructs one `CharacterLibrary` and one `DownloadAttempts`, calls `initialize` on mount, disposes the library on destroy. Renders loading, failure with Retry, the ready status, the delete notice, the download notice, the form, and the gallery. No storage knowledge, no record building. |
| `Gallery` | `characters`, `onEdit(id)`, `onDelete(id)`, `onDeleteMany(ids) => Promise<boolean>`, `onDownload(character)`, `notice?`, `onLightboxChange?(open)` | Owns view state and lightbox selection. `onDownload` only reports the Character; the page owns the attempt and the notice. `onLightboxChange` tells the page where to present that notice. |
| `GalleryToolbar` | `searchTerm`, `sortMode`, `onSearchChange`, `onSortChange`, `selectMode?`, `selectedCount?`, `onToggleSelectMode?`, `onDeleteSelected?`, `onCancelSelect?` | Two modes: normal and selection. |
| `MasonryGrid` | `characters`, `animate?`, `onOpen(id)`, `selectMode?`, `selectedIds?`, `onToggleSelect?(id)`, `onDownload?(character)` | Pure layout + keyed list. No data access. |
| `MasonryItem` | `character`, `onOpen`, `selectMode?`, `selected?`, `onToggleSelect?`, `onDownload?` | Reserves the frame from `width`/`height` through `image-frame.ts`, falling back to 4:3, and describes a failed image on the browse button or checkbox. |
| `Lightbox` | `character: Character \| null`, `characters`, `onEdit(id)`, `onDelete(id)`, `onClose()`, `onSelect(id)`, `onDownload(character)`, `notice?` | `characters` is the filtered list, so arrows move within the filter. `notice` is the page's download notice snippet, rendered inside the dialog. |
| `CharacterForm` | `editingCharacter: Character \| null`, `onSave(draft: CharacterDraft) => Promise<void>`, `onCancel()` | Mounted per target by `{#key}`. `onSave` rejects with a `LibraryError`; a `missing-target` rejection gets its own message. Imports the error from `library-error.ts`, not from the library module. |

State ownership (one owner per item; do not duplicate it):

| Owner | State | Notes |
|---|---|---|
| `CharacterLibrary` | `characters`, `status`, `failureMessage`, `repairWarning` | The canonical list and the only writer. One instance per page lifetime. |
| `CharacterLibrary` (internal) | operation chain, repair attempt keys, per-record image generations, database connection, lifetime counter | Private. Never assert on these in tests; observe the public state and the storage. |
| `App` | `editingCharacter`, `showForm`, `deleteNotice`, `lightboxOpen`, the focused heading, one library instance, one download owner | Presentation and navigation only. `lightboxOpen` comes from `Gallery`, so the page never assumes a dialog it cannot see. |
| `DownloadAttempts` | attempt and applied counters per Character, `notice` | Pending attempts and the notice survive Gallery teardown, so a failure can still reach the page while the form is open. |
| `Gallery` | `searchTerm`, `sortMode`, `selectedId`, `selectMode`, `selectedIds`, `visibleCount`, `sentinelEl`; derived `selectedCharacter`, `filteredCharacters`, `visibleCharacters`, `hasMore`, `emptyState` | View state. `selectedId` holds the open Character's identity, and `selectedCharacter` is derived from the canonical list. It also reports the dialog state upward. |
| `Lightbox` | `dialogEl` (`$state`), `triggerButton`, `toreDown`, `failed` (Character id plus source); derived `index`, `hasPrevious`, `hasNext`, `imageUnavailable` | Dialog, focus, and the displayed image's failure. |
| `CharacterForm` | `name`, `description`, `saving`, `saveError`, one `SelectedImage` | Draft and save locking. |

---

## 5. Invariants

MUST hold after any change.

1. `Character.id` is the IndexedDB key path (`db.ts`, store `characters`, keyPath `id`). Ids are opaque, unique, and never derived from array position.
2. `CharacterLibrary` is the only writer of Character records and the only owner of the canonical list. `App`, `Gallery`, and `CharacterForm` never import `db.ts`, build a record, reload the list, or start storage work. A review that finds any of those in the shell is a regression.
3. A mutation resolves only after the storage transaction commits and the committed record is published. A rejection always means nothing was committed, and storage and the canonical list still agree. A resolved mutation never triggers a full-library read.
4. `createdAt` is set once. `CharacterLibrary` copies the stored value during an edit and never re-derives it from the clock. Never write `Date.now()` over an existing record.
5. `width`/`height` describe `image`. If unknown, leave both `undefined` and let the library's background repair measure them. The stored pair reserves the card frame only when both numbers are finite and greater than zero; otherwise every image view uses the complete 4:3 fallback, so one stored side is never paired with one fallback side (`src/image-frame.ts`). A partial pair is normalized to two absent dimensions.
   - A draft with no complete pair supplies no size; a partial pair collapses to no size. With no size supplied and the image unchanged, the stored pair is kept. Otherwise the record has no size.
   - A stored pair survives a save only while the image is unchanged. A replaced image never inherits the previous dimensions.
   - `SelectedImage` publishes only the current selection. A generation token guards every asynchronous state write; `discard` and `dispose` invalidate outstanding work.
   - `SelectedImage.status` stays `preparing` until read and measurement settle. `canSubmit` is true only for `idle` or `ready` with a non-empty image. A read failure blocks submission; a measurement failure allows it with both dimensions absent.
6. An edit whose identity is not in the canonical list rejects with `missing-target` and writes nothing. Do not add a save-as-new recovery path.
7. Commits and publications run on one serialized chain in acceptance order. Image decoding never enters the chain. A start-up read waits for writes accepted before the call, then runs outside the chain, and its publication joins the chain; a newer `initialize` never waits for an older pending read. A failed step must not poison the chain.
8. Background repair writes only into the record as it stands now, and only while the record exists, still shows the measured image, is still the same image generation, and still has no size. Attempts are bounded once per identity and image generation per initialized lifetime. A failure leaves both dimensions absent, logs, and sets one `repairWarning`.
9. `dispose` publishes nothing afterwards and rejects new mutations, but an accepted write still commits and its promise still settles. Do not pretend to roll back a committed write.
10. `image` is a base64 image data URL. It is required for a new record.
11. Sort and filter never mutate their input array (`sortCharacters` copies; `filterCharacters` returns the input itself for a blank term).
12. Filter and sort tolerate records with missing `name` or `description`.
13. `PAGE_SIZE` lives in `src/gallery-utils.ts`. Do not re-hard-code 24.
14. `visibleCount` resets to `PAGE_SIZE` on a search or sort change.
15. `Gallery.sentinelEl` stays `$state`. The `$effect` must read it so the observer attaches to the live element and disconnects from a replaced one. See `tests/gallery-scroll.test.ts`.
16. `Lightbox` teardown runs from the dialog `close` event, which covers Escape, and from the direct `teardown` call in `requestClose` when the dialog is unavailable or not open. Do not close from a keydown handler or the DOM and the parent state can diverge. See `src/components/Lightbox.svelte`.
17. Every DB write promise rejects on `error` and on `abort`. A pending-forever promise is a bug.
18. `downloadCharacterImage` always emits PNG and always runs the name through `sanitizeFilename`. The object URL is released ~60 s after the click, not immediately.
19. Reduced motion (`prefers-reduced-motion`) gates durations and `transform`. It MUST NOT gate the visibility of a control (the hover label and the download button stay reachable).
20. Start-up is three distinct states. Loading is not an empty library. A failed start keeps Retry and the reason on screen and keeps Add and edit entry points unavailable. Retry never deletes or replaces stored records.
21. A delete failure is announced in one place in the page shell and keeps the records and the batch selection. A committed batch delete clears the selection and leaves select mode.
22. No runtime dependencies. `dependencies` must stay absent unless there is an explicit decision to add one.
23. `npm run check` stays at 0 errors and 0 warnings. Do not delete or weaken a test to make a change pass.

---

## 6. Task Routing

| Change | Files to touch | Tests to extend |
|---|---|---|
| Add/alter a `Character` field | `src/types.ts`, `src/character-library.svelte.ts` (record rules + repair), `src/components/CharacterForm.svelte`; `src/db.ts` only for a store/index change | `tests/character-library.test.ts`, `tests/db.test.ts`, `tests/app.test.ts` |
| Persistence rules, start-up, delete outcomes, or size repair | `src/character-library.svelte.ts` | `tests/character-library.test.ts`, `tests/app.test.ts` |
| Page layout, start-up states, or the delete notice | `src/App.svelte` | `tests/app.test.ts` |
| Schema or index change | `src/db.ts` (`DB_VERSION`, `onupgradeneeded`) | `tests/db.test.ts` |
| Search behavior | `src/gallery-utils.ts` | `tests/gallery-utils.test.ts` |
| Sort behavior or a new mode | `src/gallery-utils.ts` (`SortMode`, `sortCharacters`), `src/components/GalleryToolbar.svelte` (option) | `tests/gallery-utils.test.ts` |
| Page size / paging | `src/gallery-utils.ts` (`PAGE_SIZE`), `src/components/Gallery.svelte` | `tests/gallery-scroll.test.ts` |
| Card layout or card hover UI | `src/components/MasonryItem.svelte`, `src/components/MasonryGrid.svelte` | `tests/gallery-scroll.test.ts` |
| Column layout or animation | `src/components/MasonryGrid.svelte` | — |
| Lightbox behavior | `src/components/Lightbox.svelte` | `tests/app.test.ts` |
| Download or filename | `src/download.ts` | `tests/download.test.ts` |
| Selected-image preparation or form gating | `src/selected-image.svelte.ts`, `src/components/CharacterForm.svelte` | `tests/selected-image.test.ts`, `tests/character-form.test.ts` |
| Theme color | `src/style.css` (`@theme` tokens) | — |
| Id format | `src/id.ts` | `tests/id.test.ts` |
| Storage semantics | `src/db.ts` | `tests/db.test.ts` |

---

## 7. Test Recipes

Environment: Vitest with `environment: 'node'`. A DOM test needs the first line `// @vitest-environment jsdom`. `vitest.config.ts` loads the Svelte plugin and sets `resolve.conditions = ['browser']` when `process.env.VITEST` is set (required for `mount()` of Svelte 5 components).

`tests/setup.ts` provides: `fake-indexeddb` globals, `matchMedia`, a Web Animations API stub (`Element.prototype.animate` / `getAnimations`, finishes on a microtask), and `<dialog>` `showModal` / `close` / `open` plus an async `close` event.

Helpers available:

- `tests/fixtures.ts`: `PNG_1X1`, `makeCharacter(index, overrides?)`, `makeCharacters(count, startIndex?)`.
- `tests/GalleryHarness.svelte`: mounts `Gallery`, exposes `setCharacters(next)`.
- `tests/LightboxHarness.svelte`: mounts `Lightbox` with a replaceable list and a chosen open Character.
- `tests/selected-image.test.ts`: controlled `readFile` and `measure` promises for the preparation module.
- `tests/character-library.test.ts`: constructs `CharacterLibrary` with the real `db.ts` helpers against a unique `fake-indexeddb` database per test. Controls measurement, identity, the clock, and held writes; asserts the canonical list, the start-up state, the repair warning, and storage.
- `tests/character-form.test.ts`: a controlled `FileReader` and `Image` for the mounted form. It also rejects with a `LibraryError` to witness the missing-target message.
- A manual real-browser smoke check ran in headless Chrome 156 on Windows against the production build. It covers real file reading and image decoding through programmatic file-input assignment, same-file recovery, and the accessible feedback markup. It does not exercise the native picker dialog or a screen-reader announcement. It is not part of `npm test`; see WIKI section 13.
- A second manual check in headless Chrome 156.0.8078.49 on Windows 11 covers the Gallery states, card and lightbox image failures with measured frame geometry, and the download notice across page, dialog, and form, including measured contrast. Android, Firefox, Safari, screen readers, and save completion stay unverified. The numbers and limits are in WIKI section 13.
- `settle()` pattern (copy from `tests/gallery-scroll.test.ts`): `flushSync()` + `await tick()` in a loop. Use it after any change that starts a transition.
- `vi.waitFor(fn, { timeout, interval })` for promise-driven UI (database reads, `FileReader`).

Component test skeleton:

```ts
// @vitest-environment jsdom
import { flushSync, mount, tick, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import Component from '../src/components/Component.svelte';

async function settle() { for (let i = 0; i < 5; i += 1) { flushSync(); await tick(); } flushSync(); }

it('does the thing', async () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Component, { target, props: { /* required props */ } });
  await settle();
  expect(target.textContent).toContain('expected');
  unmount(app);
  target.remove();
});
```

Pitfalls:

- jsdom does not decode images. Stub `Image` (see `tests/app.test.ts`) before any path that calls `measureImage`.
- Stub `confirm` and `alert` before delete or validation paths.
- Elements with an `out:fade` transition stay in the DOM until the animation finishes. `settle()` is what removes them.
- IndexedDB state is shared per test file. `tests/app.test.ts` clears and seeds the `character-gallery` database in each test.

---

## 8. Sharp Edges (intentional, do not "clean up")

| Code | Why it exists |
|---|---|
| `Gallery.svelte`: `$effect` reads `sentinelEl` | The sentinel appears only after a page is full. Without a reactive read the observer is created once and never reattached, so load-more dies silently. Regression: `tests/gallery-scroll.test.ts`. |
| `character-library.svelte.ts`: operation chain and commit-then-publish | Every write and its publication run in one serialized step, so an older result cannot land after a newer one and there is no full reload after a save. |
| `character-library.svelte.ts`: repair merges into the current record | The decode is slow and the user can edit meanwhile. Writing the snapshot back would revert a newer name or description. Regression: `tests/character-library.test.ts`. |
| `character-library.svelte.ts`: attempt key is identity plus image generation | An ordinary publication must not re-attempt a failed measurement, a replaced image must be eligible again, and a fresh start must try once more. |
| `character-library.svelte.ts`: mutations reject while unavailable | The page shell used to swallow a save with no storage, which lost the draft without a message. Persistence rejection is the second line of defence behind the ready-state gating. |
| `App.svelte`: delete notice lives in the shell | The lightbox closes before the delete runs, so a failure shown inside it would disappear. |
| `CharacterForm.svelte`: `untrack(() => editingCharacter?.…)` | Deliberate one-time snapshot. `App.svelte` wraps the form in `{#key editingCharacter?.id ?? 'new'}`, so each target gets a fresh instance. |
| `selected-image.svelte.ts`: generation token checked after every `await` | File reads and image measurement can finish out of order. Without the check, an older read could replace the newer preview or submit the wrong image. Regression: `tests/selected-image.test.ts`, `tests/character-form.test.ts`. |
| `selected-image.svelte.ts`: a read failure restores the stored preview but keeps `status: 'failed'` | The stored image stays visible for context, but `canSubmit` stays false. This prevents a silent fallback after an explicit replacement choice. |
| `download.ts`: 60 s `setTimeout` before `revokeObjectURL` | An immediate revoke can cancel the download. |
| `db.ts`: `tx.onabort` rejection | Aborted transactions fire only `abort`; without it the promise never settles. |
| `MasonryGrid.svelte`: `matchMedia` read once at component creation | The duration is a construction-time constant; the values only drive `animate:flip` / `fade`. |
| `tests/setup.ts` shims | jsdom lacks `matchMedia`, WAAPI, and real `<dialog>` methods. The shims are approximations, not test logic. |

---

## 9. Known Gaps (do not assume these exist)

- No import/export of character cards; no SillyTavern card format support.
- No thumbnails or blob storage; images are base64 strings held in memory for every record.
- No per-image retry. A failed image shows "Image unavailable" in its reserved frame until the source is replaced or the page reloads; the card keeps its normal browse, selection, and Edit paths.
- Download feedback only covers a failure the app can detect while preparing the file. A browser handoff is not proof the file was saved, so nothing reports a saved file.
- No virtualisation; `dbGetAll` loads the whole library, the gallery renders `PAGE_SIZE` at a time.
- No backdrop-click close in the lightbox (Escape and buttons only).
- No ESLint or Prettier; `.editorconfig` provides editor settings.
- `MasonryGrid`'s `animate` prop is `true` by literal at its only call site.
- `--color-bg-card` in `src/style.css` is unused.

---

## 10. Conventions for Edits

- Svelte 5 runes only: `$state`, `$derived`, `$props`, `$effect`. No stores, no `export let`, no `on:click` (use `onclick`).
- Destructure props in one `$props()` call with an inline type annotation; the codebase has no separate prop types.
- Callbacks are `onX` props. Async work returns a promise so the caller can show an error.
- Styling: Tailwind utility classes with the theme tokens (`bg-accent`, `border-border`, `text-danger`, `text-warning`). Add a token to `src/style.css` instead of a raw hex value.
- Comments explain a non-obvious reason, in short sentences. Do not comment the obvious.
- Keep the pure helpers free of component state so the node-environment tests can import them.
- American English, no em dashes in prose, present tense in docs.
- When you fix a bug that a test could catch, add the test in the same commit.
