# Plan: Design and Philosophy Consistency

Status: Draft for review. Nothing in this plan is implemented yet.
Date: 2026-09-24. Baseline commit: `26b6392` (clean `main`).
Scope: the browser app in `src/`, its docs, and its CI. No data-layer features.

## 1. Goal

The app is documented as a local-first, accessible, no-dependency gallery. The
code mostly follows that philosophy, but several details drift from it. This
plan finds the drift, names the principle that each item breaks, and fixes the
drift in small phases.

Two kinds of drift appear in this plan:

1. **Code drifts from a documented rule.** Example: `docs/WIKI.md` section 11
   says to use theme tokens, but the components use 50 raw palette utilities.
   The fix changes the code.
2. **Two documents disagree.** Example: `docs/designMasonry.md` section 9 asks
   for one shared motion helper, but `docs/LLM-WIKI.md` section 8 calls the
   read-once `matchMedia` call an intentional sharp edge. The fix reconciles
   the documents.

The plan does not treat the sharp edges in `docs/LLM-WIKI.md` section 8 as
bugs. Each one is kept or changed for a stated reason.

Baseline, measured on 2026-09-24:

- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 49 tests in 6 files, all pass.
- `npm run build`: succeeds. Svelte 5.57.1, Tailwind 4.3.3, Vite 6.4.3.

Do not land a task if the three gate commands fail.

## 2. The Design Constitution

These principles come from the existing documents. Every finding below cites
one of them. When a task and a principle disagree, cite the principle in the
task and say so.

| ID | Principle | Source |
|---|---|---|
| D1 | Local-first and private. Data stays in the browser. No network calls and no telemetry. | `README.md`, `docs/LLM-WIKI.md` section 5.14 |
| D2 | No runtime dependencies. Every `devDependency` is a build or test tool. | `README.md`, `docs/LLM-WIKI.md` section 5.14 |
| D3 | CSS owns layout. Svelte owns state and interaction. No JavaScript masonry loop. | `docs/designMasonry.md` sections 2.1 and 2.2 |
| D4 | A card reserves its space before the image decodes. Ids are stable. Stored dimensions describe the stored image. | `docs/designMasonry.md` section 2.4, `docs/LLM-WIKI.md` section 5.3 |
| D5 | Tokens are the styling API. Custom CSS stays small. | `docs/WIKI.md` section 11, `docs/LLM-WIKI.md` section 10 |
| D6 | Motion is opt-in and physical. Animate `transform` and `opacity` only. Do not animate the first render. Respect reduced motion. Never hide a control because of it. | `docs/designMasonry.md` sections 2.3, 8.5, 9, 20, `docs/LLM-WIKI.md` section 5.13 |
| D7 | Accessible by default. Real controls, labels, visible focus, state not by color alone, managed focus. | `docs/designMasonry.md` sections 14 and 20, `docs/WIKI.md` section 12 |
| D8 | Failures are visible and recoverable. Images have pending, loaded, and error states. | `docs/designMasonry.md` section 12 |
| D9 | One container, one rhythm, one visual language. | `docs/designMasonry.md` section 5 |
| D10 | Keep the surface small. Small props, pure helpers, no dead code, no leftovers. | `docs/designMasonry.md` section 17, `docs/WIKI.md` section 16 |
| D11 | Docs and code move together. Update the matching document in the same commit. | `docs/WIKI.md` section 18, `docs/LLM-WIKI.md` preamble |

## 3. Audit

Severity: **High** means a documented rule or a WCAG A/AA rule is broken.
**Medium** means visible or semantic drift. **Low** means polish.

Contrast ratios below are approximate. Confirm each one with a contrast checker
before the task sets a final token value.

### 3.1 Tokens and contrast

| ID | Where | What drifts | Violates | Severity |
|---|---|---|---|---|
| F01 | All 7 `src/**/*.svelte` files | 50 raw palette utilities (`text-white` x12, `text-zinc-300` x7, `bg-zinc-800` x7, `text-zinc-200` x6, `text-zinc-500` x3, `text-zinc-400` x3, red x4, purple x2, black x3, `border-zinc-600`, `accent-purple-500`) sit beside theme tokens. | D5 | High |
| F02 | `src/style.css:9` | No semantic tokens exist for surface, text hierarchy, danger, overlay, and on-accent. `--color-bg-card` is declared but unused. | D5, D10 | High |
| F03 | `GalleryToolbar.svelte:25` vs `Lightbox.svelte:180` | The same action, delete, is red-600 in the toolbar and accent pink in the lightbox. | D5 | High |
| F04 | `Lightbox.svelte:166,173` vs `GalleryToolbar.svelte:32` | Secondary buttons hover to `purple-700` in the lightbox and to `zinc-800` in the toolbar. The lightbox uses `bg-border` as a button background. | D5 | Medium |
| F05 | `App.svelte:117`, `CharacterForm.svelte:171`, `Lightbox.svelte:180` | White text on `--color-accent` (`#e94560`) is about 3.8:1. WCAG AA needs 4.5:1 for 14 px text. | D7 | High |
| F06 | `Gallery.svelte:143`, `MasonryGrid.svelte:28`, `CharacterForm.svelte:156` | `text-zinc-500` on `--color-bg-primary` is about 3.5:1. Below AA for body text. | D7 | High |
| F07 | Every `focus-visible:ring-accent/50` | A 50 percent accent ring over the page background is about 2:1. Non-text contrast needs 3:1. | D7 | High |
| F08 | `GalleryToolbar.svelte:46,53`, `CharacterForm.svelte:132,142,154` | `border-border` (`#533483`) on `--color-bg-secondary` is about 1.7:1. Input boundaries need 3:1. | D7 | High |

### 3.2 Motion

| ID | Where | What drifts | Violates | Severity |
|---|---|---|---|---|
| F09 | `MasonryGrid.svelte:34` | `in:fade` runs on the initial render, so all 24 first cards animate. Svelte plays intro transitions on mount by default. | D6, design section 8.5 | High |
| F10 | `App.svelte:117`, `GalleryToolbar.svelte:25` | `hover:-translate-y-0.5` has no `motion-safe:` gate. | D6, `docs/LLM-WIKI.md` section 5.13 | Medium |
| F11 | `MasonryGrid.svelte:22-24` | The motion preference is read once in one component. No shared helper exists. `docs/designMasonry.md` section 9 asks for one; `docs/LLM-WIKI.md` section 8 declares the read-once behavior intentional. The documents disagree. | D6 | Medium |
| F12 | `tests/setup.ts` | The `matchMedia` stub always returns `matches: false`. No test covers the reduced-motion path. | D6, `docs/LLM-WIKI.md` section 5.15 | Medium |

### 3.3 Accessibility structure

| ID | Where | What drifts | Violates | Severity |
|---|---|---|---|---|
| F13 | `GalleryToolbar.svelte:44-58` | The search input and the sort select have no accessible name. Only a placeholder names the input. | D7 | High |
| F14 | `GalleryToolbar.svelte:20`, `Gallery.svelte` | The selected count and the result count are not announced. No live region exists. | D7 | Medium |
| F15 | `MasonryItem.svelte:32,62-68` | Selection is shown by a ring only, so the state is color-only. The card button has no `aria-pressed`. The checkbox is a second focus stop that repeats the card action. | D7 | High |
| F16 | `MasonryItem.svelte:33,44,84` | The button has `aria-label={name}`, the image has `alt={name}`, and the caption repeats the description. The name is announced more than once in browse mode. | D7 | Low |
| F17 | `MasonryGrid.svelte:28` | A search with no match shows "No characters yet. Add one above!". The grid receives only the visible page, so it cannot tell the two cases apart. `col-span-full` is a grid leftover inside a columns layout. | D8, D10 | Medium |

### 3.4 Feedback and interaction

| ID | Where | What drifts | Violates | Severity |
|---|---|---|---|---|
| F18 | `App.svelte:73,81,104`, `CharacterForm.svelte:63,87,95,112`, download errors | Four error channels exist: native `confirm`, native `alert`, console only, and silent. The UI language is not consistent. | D8 | High |
| F19 | `CharacterForm.svelte:87` vs `:130` | The `alert('Name is required')` branch cannot run. The `required` attribute stops submit before the handler runs. | D8, D10 | Medium |
| F20 | `App.svelte:127-136` | Opening the form replaces the gallery with no focus move. Cancel returns focus nowhere. | D7 | Medium |
| F21 | `Lightbox.svelte:99-100` | The dialog names itself but does not describe itself. The description is not linked with `aria-describedby`. | D7 | Low |
| F22 | `Lightbox.svelte:98-101` | A backdrop click does not close the dialog. `docs/designMasonry.md` section 13 lists it in the state machine. | design section 13 | Low |
| F23 | `MasonryItem.svelte` | A broken image leaves an empty card of the correct shape. There is no error state and no retry. | D8, design section 12 | Medium |
| F24 | `MasonryItem.svelte:38` | `aspect-ratio: ${width ?? 4} / ${height ?? 3}` mixes a known value with a fallback. A record with only one dimension gets a wrong ratio. | D4 | Medium |
| F25 | `Gallery.svelte:130` | `animate={true}` is a literal, so the `animate` prop of `MasonryGrid` is dead. | D10, `docs/LLM-WIKI.md` section 9 | Medium |
| F26 | `MasonryGrid.svelte:32-36` vs `MasonryItem.svelte:29` | `mb-4 break-inside-avoid` sits on the inner figure, not on the animated wrapper. The reference skeleton in `docs/designMasonry.md` section 8.1 puts both classes on the animated element. | D3 | Low |
| F27 | `MasonryItem.svelte:51` | `bg-gradient-to-t` is the Tailwind v3 name. Tailwind v4 renamed it to `bg-linear-to-t`. The old name still compiles, but it is deprecated. | D5 | Low |

### 3.5 Chrome and system

| ID | Where | What drifts | Violates | Severity |
|---|---|---|---|---|
| F28 | `App.svelte:112` vs `:125` | The header uses `px-6 sm:px-10`. The main area uses `px-4 sm:px-6 lg:px-10`. No shared max width exists. | D9 | Medium |
| F29 | `src/style.css`, `src/App.svelte:111` | `color-scheme` is not set, so the select popup, checkboxes, and scrollbars render light. `body` has no background, so overscroll shows white. | D5, D9 | Medium |
| F30 | `index.html` | The page ships the default Vite favicon. No description, no theme-color, no `noscript` fallback. | D9, D1 | Low |
| F31 | Repository | Nothing enforces the token rule. The repo has no linter, and the docs cannot enforce themselves. | D11 | Medium |
| F32 | `Lightbox.svelte:100,141` | The dialog caps the image at 60 vh, but only the image container scrolls. A long description can push the actions out of view. | D9 | Low |

## 4. Workstreams

Phases are ordered by risk and by dependency. P0 changes the visual language
first, because every later task styles against it. Each task lands green.

### P0: Tokens and contrast

The token layer must exist before the components change, otherwise every later
task re-touches the same class strings.

#### T-01: Add the semantic token layer (F01, F02)

**Goal.** Give the app one small set of semantic tokens, so a component says
what a color means, not what it looks like.

**Files.** `src/style.css`.

**Change.**
- Keep `--color-bg-primary`, `--color-bg-secondary`, `--color-accent`,
  `--color-accent-hover`, `--color-border`.
- Add tokens for the roles that raw utilities fill today:
  `--color-surface` (elevated cards, image placeholders),
  `--color-surface-hover` (hover states), `--color-text` (body text,
  applied once on the body), `--color-muted` (dim text),
  `--color-on-accent`, `--color-danger`, `--color-danger-hover`,
  `--color-scrim` (black, used with an opacity modifier), `--color-focus`,
  `--color-border-strong`.
- Remove `--color-bg-card`, or use it. Prefer removal; nothing reads it.
- Candidate values: `surface` `#27272a` (the current `bg-zinc-800`, keep the
  look and name the role), `surface-hover` `#3f3f46`, `text` `#e4e4e7`,
  `muted` `#a1a1aa` (zinc-400 passes AA on both backgrounds, zinc-500 does
  not), `danger` `#dc2626`, `danger-hover` `#b91c1c`, `scrim` `#000000`,
  `on-accent` `#ffffff`. Verify each with a contrast checker against
  `bg-primary` and `bg-secondary` before the commit.

**Acceptance.**
- `src/style.css` declares the token set with a one-line comment per role.
- No component refers to a token that does not exist.

**Tests.** None. The token file has no logic.

**Docs.** `docs/WIKI.md` section 11 token table gains the new rows and drops
the unused token note. `docs/LLM-WIKI.md` section 9 loses the unused-token gap.

#### T-02: Fix the contrast failures (F05, F06, F07, F08)

**Goal.** Meet WCAG AA for text and WCAG 1.4.11 for focus rings and control
boundaries, using tokens only.

**Files.** `src/style.css`, then every component that uses the affected role.

**Change.**
- Accent: white on `#e94560` is about 3.8:1. Two options, see DP1. The
  recommended option darkens `--color-accent` to `#d63a54` (the current hover
  value, about 4.6:1 with white) and moves hover to `#c22d4a` (about 5.6:1).
- Muted text: use the `text-muted` token (zinc-400 value) everywhere
  `text-zinc-400` or `text-zinc-500` appears. Replace
  `placeholder:text-zinc-500` with `placeholder:text-muted`.
- Focus ring: drop the `/50` alpha. `ring-2 ring-focus` must meet 3:1 against
  both page and surface backgrounds. Set `--color-focus` from the accent, or
  to a lighter tint if the accent value fails.
- Control boundaries: add `--color-border-strong` for inputs and the sort
  select. `border-border` may stay for decorative dividers. Candidate
  `#8b6fc9` (about 3.9:1 on `bg-secondary`). Verify.

**Acceptance.** Every text pair and every input boundary meets the stated
ratio. A browser contrast checker confirms the values; record the numbers in
the commit message or in `docs/WIKI.md`.

**Tests.** None automated. Add the results of the manual check to the pull
request.

**Docs.** `docs/WIKI.md` section 11 records the contrast rules as a table.

#### T-03: Replace raw palette utilities and unify button roles (F01, F03, F04)

**Goal.** End the split between tokens and raw colors, and give one action one
color everywhere.

**Files.** `src/App.svelte`, `src/components/GalleryToolbar.svelte`,
`src/components/MasonryItem.svelte`, `src/components/Lightbox.svelte`,
`src/components/CharacterForm.svelte`, `src/components/MasonryGrid.svelte`.

**Change.**
- Replace each raw utility with the matching token:
  `text-zinc-200` and `text-zinc-300` disappear where they only repeat the
  body color (the body rule provides it), `text-zinc-400` and `text-zinc-500`
  become `text-muted`, `bg-zinc-800` becomes `bg-surface-hover` for hover
  states and `bg-surface` for the image placeholder, `bg-black/50` and
  `bg-black/80` become `bg-scrim/50` and `bg-scrim/80`, `border-zinc-600`
  becomes `border-border`, and `text-white` becomes `text-on-accent` where
  the text sits on accent or danger.
- Danger: the toolbar and the lightbox both use `bg-danger` and
  `bg-danger-hover` for delete. The accent stays for primary actions.
- Secondary buttons: both the toolbar and the lightbox use one recipe:
  transparent background, `border-border`, the body text color, and
  `hover:bg-surface-hover`. Remove `bg-border` as a button background and
  remove `hover:bg-purple-700`.
- The card hover label sits on a scrim gradient. Use `from-scrim/60` and
  `text-on-accent`.

**Acceptance.**
- `grep -E "(zinc|purple|red|black/)" src/**/*.svelte` returns nothing except
  an explicit allowlist (for example the checkbox accent, if kept).
- The same action has the same color in every view.

**Tests.** `tests/app.test.ts` and `tests/gallery-scroll.test.ts` still pass.
Class-only changes do not need new logic tests.

**Decision.** See DP2: extract a `Button.svelte` now, or keep class recipes and
revisit. The plan recommends extracting it after this task, when the recipes
are proven.

**Docs.** `docs/WIKI.md` section 11 and `docs/LLM-WIKI.md` section 10 record
the final button recipes.

### P1: Motion and accessibility structure

#### T-04: Stop the initial-render animation and wire the `animate` prop (F09, F25)

**Goal.** The first paint is still, and later list changes still animate.

**Files.** `src/components/Gallery.svelte`, `src/components/MasonryGrid.svelte`.

**Change.**
- Hold `animate` in gallery state, initially `false`. Set it to `true` after
  the first render (for example in an `$effect` that runs after mount). Pass
  the state to `MasonryGrid` instead of the literal `true`.
- Run a short spike on `mount(..., { intro: false })` first. The option is
  documented for the mount call, but it may not reach transitions inside child
  components in Svelte 5.57. If the spike works, use it and keep the `animate`
  prop for explicit control. If it does not, use the state gate.
- Remove the now-dead `animate` prop from the known-gaps list, or keep the
  prop and document that `Gallery` owns it.

**Acceptance.** A cold load renders the first page with no fade. Adding,
deleting, filtering, and sorting still animate. `npm run check` stays at 0/0.

**Tests.** Extend `tests/gallery-scroll.test.ts`: mount the gallery, assert no
fade transition runs on the first batch, then change the list and assert the
transition runs. The Web Animations stub in `tests/setup.ts` makes this
observable.

**Docs.** `docs/LLM-WIKI.md` section 9 loses the dead-prop gap.
`docs/WIKI.md` section 9 records the mechanism.

#### T-05: Gate motion and share the preference helper (F10, F11, F12)

**Goal.** One reduced-motion rule for the whole app, and no unguarded motion.

**Files.** New `src/motion.ts`. `src/App.svelte`,
`src/components/GalleryToolbar.svelte`, `src/components/MasonryGrid.svelte`.
`tests/setup.ts`, tests.

**Change.**
- Add `src/motion.ts` with `prefersReducedMotion()` that reads
  `window.matchMedia('(prefers-reduced-motion: reduce)').matches` once and
  caches the result. Keep the read-once semantics; see DP4.
- `MasonryGrid` imports the helper instead of calling `matchMedia` directly.
- Gate the two hover lifts: `motion-safe:hover:-translate-y-0.5`, and keep the
  transition off under `motion-reduce`. Do not gate the visibility of any
  control; invariant 13 still holds.
- Reconcile the documents: `docs/designMasonry.md` section 9 says "keep the
  motion preference in a small reusable store or helper". A cached function is
  that helper. `docs/LLM-WIKI.md` section 8 keeps the read-once note.

**Acceptance.** With `prefers-reduced-motion: reduce`, list durations are 0 and
no hover lift runs. Controls stay visible.

**Tests.** Add a test that stubs `window.matchMedia` to `matches: true` and
asserts the computed durations are 0. The current stub in `tests/setup.ts`
hardcodes `false`; a per-test stub overrides it.

**Docs.** `docs/WIKI.md` sections 9 and 11 gain a line about `src/motion.ts`.

#### T-06: Label the toolbar controls and announce counts (F13, F14)

**Goal.** Every control has a name, and every count is announced.

**Files.** `src/components/GalleryToolbar.svelte`, `src/components/Gallery.svelte`.

**Change.**
- Give the search input and the sort select an accessible name. Use a
  visually hidden `<label>`, not a placeholder.
- Add one polite live region for the selection count ("3 selected") and one
  for the result count ("12 characters" or "No matches"). Use `role="status"`
  so the announcement is polite and not an interruption.

**Acceptance.** A screen reader announces both counts after a change. The
controls are named in the accessibility tree.

**Tests.** Extend `tests/app.test.ts` with attribute assertions:
`aria-label` or a labeled input, and the live region text.

**Docs.** `docs/WIKI.md` section 12 records the live-region rule.

#### T-07: Express selection with state, not color (F15, F16)

**Goal.** Selection is programmatic state, and the card has one focus stop.

**Files.** `src/components/MasonryItem.svelte`, `src/components/MasonryGrid.svelte`.

**Change.**
- Add `aria-pressed={selected}` to the card button in select mode. A screen
  reader then reports the toggle state.
- Replace the checkbox with a decorative check badge. The card button already
  toggles selection, so the checkbox duplicates the action and adds a focus
  stop. If the checkbox stays, give it `tabindex="-1"` and `aria-hidden="true"`.
  The plan recommends the badge.
- The selected ring stays as a visual cue, but it is no longer the only cue.
- The card image becomes decorative inside the named button: `alt=""`. Keep
  the informative `alt` on the lightbox image, where the image is the content.
  Keep or drop the `sr-only` caption; do not repeat the description twice.

**Acceptance.** Keyboard focus moves once per card. Activating a card toggles
selection and updates the announced state. The name is announced once.

**Tests.** Extend `tests/gallery-scroll.test.ts` or add a card test: assert
`aria-pressed` flips, assert one focusable element per card in select mode.

**Docs.** `docs/WIKI.md` section 12 records the one-focus-stop rule.

#### T-08: Show a no-results state (F17)

**Goal.** The gallery tells the truth when a search matches nothing.

**Files.** `src/components/MasonryGrid.svelte`,
`src/components/Gallery.svelte`.

**Change.**
- `MasonryGrid` keeps the empty state, per `docs/designMasonry.md` section 16,
  but receives context. Add a prop such as `emptyKind: 'library' | 'no-match'`
  and an optional `onClearSearch`. See DP5.
- `Gallery` computes the kind from `characters.length` and
  `filteredCharacters.length`.
- The no-match message names the search and offers a clear action that resets
  `searchTerm` and `visibleCount`.
- Remove `col-span-full`. It has no effect in a columns container, and
  `docs/WIKI.md` section 16 already flags it.

**Acceptance.** A search with no match shows the no-match message and a clear
button. An empty library shows the add message. The clear action restores the
full list.

**Tests.** Extend `tests/app.test.ts` or add a gallery test: type a
non-matching term, assert the message, click clear, assert the list returns.

**Docs.** `docs/WIKI.md` section 9 records the new prop. Section 16 loses the
`col-span-full` note.

### P2: Feedback, form, and card and lightbox robustness

#### T-09: Replace native alerts and confirms with one notice channel (F18)

**Goal.** One visible pattern for errors, confirmations, and results.

**Files.** New `src/components/Notice.svelte` and
`src/components/ConfirmDialog.svelte` (or one component). `src/App.svelte`,
`src/components/CharacterForm.svelte`, `src/components/Gallery.svelte`,
`src/components/Lightbox.svelte`.

**Change.**
- Add an app-level notice area with `role="status"` for success and
  `role="alert"` for errors. `App` owns the message state and passes a setter
  down, or each view owns its own inline notice. Decide in DP3.
- Replace `alert()` calls with the notice channel.
- Replace `confirm()` with a native `<dialog>` confirm component. Keep the
  Lightbox teardown rules: one teardown path through the `close` event,
  focus moves in on open and returns to the trigger on close. No runtime
  dependency.
- Download failures show a notice instead of console-only. Keep the console
  log for debugging.

**Acceptance.** No `alert()` or `confirm()` remains in `src/`. Errors are
visible without opening devtools. The confirm dialog traps focus and returns
it.

**Tests.** Stub paths in existing tests change. `tests/app.test.ts` covers
delete confirmation through the new dialog. Assert `role="alert"` text on a
failed save.

**Docs.** `docs/WIKI.md` sections 9 and 10 record the notice pattern.
`docs/LLM-WIKI.md` section 9 loses the error-channel gap if the confirm dialog
lands; otherwise record the deliberate deferral.

**Decision.** DP3. If the custom dialog is deferred, record that decision in
`docs/LLM-WIKI.md` section 9 instead of leaving the drift silent.

#### T-10: Make form validation reachable and inline (F19, F20)

**Goal.** One validation path with visible errors, and correct focus.

**Files.** `src/components/CharacterForm.svelte`, `src/App.svelte`.

**Change.**
- Add `novalidate` to the form. Keep the name and image checks in the submit
  handler, so one path validates.
- Render inline errors under each field with `aria-describedby` and
  `aria-invalid`. Focus the first invalid field on a failed submit.
- Remove the dead `alert('Name is required')` branch or make it the live
  inline error. Do not keep both.
- Move focus into the form when it opens. Focus the heading with
  `tabindex="-1"`, or the first field. Return focus to the Add button when the
  form closes without saving. When the form opens from the lightbox, return
  focus to the card, or to the lightbox trigger if it still exists.

**Acceptance.** Submitting an empty name shows an inline error and moves
focus. The helper text and error text are linked to the field.

**Tests.** Extend `tests/app.test.ts`: submit empty, assert the error text and
`aria-invalid`; submit with a file, assert the save path still works.

**Docs.** `docs/WIKI.md` section 9 records the validation rules.

#### T-11: Add an image error state and a safe aspect ratio (F23, F24)

**Goal.** A broken image keeps its shape and offers a retry.

**Files.** `src/gallery-utils.ts` (or `src/image.ts`),
`src/components/MasonryItem.svelte`, `tests/gallery-utils.test.ts`.

**Change.**
- Add a pure helper such as `cardAspectRatio(character): string`. Return
  `'4 / 3'` unless both `width` and `height` are positive finite numbers, then
  return `` `${width} / ${height}` ``. Test the half-known and zero cases.
- Track load state in `MasonryItem`: `pending`, `loaded`, `error`. On
  `onerror`, show a neutral icon and a retry button inside the reserved
  frame. Retry re-mounts the image. The frame keeps its aspect ratio in all
  three states, per `docs/designMasonry.md` section 12.
- Do not let the error UI change the card size, or the columns reflow.

**Acceptance.** A corrupt data URL shows the error state, the card keeps its
shape, and retry is reachable by keyboard.

**Tests.** Add a card test that dispatches `error` on the image and asserts
the retry control. Unit-test the aspect-ratio helper.

**Docs.** `docs/WIKI.md` section 17 loses the no-error-state limit.
`docs/designMasonry.md` section 12 becomes implemented, not aspirational.

#### T-12: Finish the lightbox (F21, F22, F32)

**Goal.** The dialog matches the documented state machine and behaves well
with long content.

**Files.** `src/components/Lightbox.svelte`.

**Change.**
- Link the description with `aria-describedby` when it exists.
- Close on a backdrop click. Check the click target against the dialog's own
  bounds, or compare `event.target === dialogEl`. Route the close through
  `dialogEl.close()` so the single teardown path in `docs/LLM-WIKI.md`
  section 5.10 and section 8 still holds.
- Make the dialog body scroll instead of only the image container. Cap the
  dialog height and let the content area scroll, so the action row stays
  reachable.

**Acceptance.** Escape, the close button, the backdrop, and the action
buttons all close through the same teardown path. Focus returns to the
trigger. A long description scrolls.

**Tests.** Extend `tests/app.test.ts` with a backdrop click. The jsdom dialog
shim supports `open` and `close`; a target check is testable.

**Docs.** `docs/WIKI.md` section 9 records the backdrop rule.
`docs/LLM-WIKI.md` section 9 loses the backdrop gap.

### P3: Chrome, guardrails, and cleanup

#### T-13: Align the page container (F28)

**Goal.** One gutter system for the header and the main area.

**Files.** `src/App.svelte`, `src/components/CharacterForm.svelte`,
`src/components/Gallery.svelte`.

**Change.**
- Put a shared container class on the header content and the main content:
  `mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10`.
- Keep the header border on the full-width wrapper; apply the container to the
  inner row. The current header uses `px-6 sm:px-10`, so the title and the
  cards do not share a left edge today.
- Fit the form card inside the same container.

**Acceptance.** The header title, the toolbar, the first card, and the form
share one left and right edge at every breakpoint from 320 px to 1920 px.

**Tests.** None. Class-level change.

**Docs.** `docs/WIKI.md` section 11 records the container rule.

#### T-14: Set the color scheme and the page background (F29)

**Goal.** Native controls and overscroll match the dark theme.

**Files.** `src/style.css`, `src/App.svelte`.

**Change.**
- Set `color-scheme: dark` on `:root` in `src/style.css`. The sort select
  popup, the checkboxes, and the scrollbars then render dark.
- Set the background on `html, body` from the token, with a matching text
  color. Keep `min-h-screen` on the app shell if it is still useful.

**Acceptance.** The select popup and the scrollbars are dark. Overscroll and
the area under a short page show the page background, not white.

**Tests.** None. A browser check at 320 px and 1920 px.

**Docs.** `docs/WIKI.md` section 11 records the `color-scheme` rule.

#### T-15: Own the page metadata (F30)

**Goal.** The page presents the app, not the build tool.

**Files.** `index.html`, `public/`.

**Change.**
- Replace `public/vite.svg` with an app favicon. Reference the theme colors.
- Add `<meta name="description">` and `<meta name="theme-color">` with the
  page background token value.
- Add a short `<noscript>` message. The app is local-first, so the message
  says that JavaScript is required for the gallery, and the user data stays in
  the browser.

**Acceptance.** The tab shows the app icon. The metadata appears in view
source. A browser with JavaScript disabled shows the message.

**Tests.** None.

**Docs.** `README.md` loses the default-favicon implication only if it
mentions assets; otherwise no change. `CHANGELOG.md` lists the item.

#### T-16: Add the design guardrail (F31)

**Goal.** Make the token rule checkable, in the style of the existing
`check` and `test` gates. Do not add ESLint or Prettier; see Non-goals.

**Files.** New `scripts/check-design.mjs`. `package.json`,
`.github/workflows/ci.yml`, `CONTRIBUTING.md`, `docs/WIKI.md`,
`docs/LLM-WIKI.md`.

**Change.**
- Add `scripts/check-design.mjs`. It scans `src/**/*.svelte` for raw palette
  utilities (`zinc-`, `purple-`, `red-`, `bg-black/`) and for `alert(` and
  `confirm(`. It fails with a file-and-line list. Support a small allowlist
  for documented exceptions.
- Add `"check:design": "node scripts/check-design.mjs"` to `package.json`.
- Add the step to CI after `npm run check`.
- Document the exceptions in the script and in `CONTRIBUTING.md`.

**Acceptance.** `npm run check:design` passes on the fixed tree and fails on a
reintroduced raw utility. CI runs it.

**Tests.** A small self-test is optional. A CI run on a scratch commit proves
the failure path.

**Docs.** `CONTRIBUTING.md` lists the new gate. `docs/WIKI.md` sections 2 and
14 list the command. `docs/LLM-WIKI.md` section 1 lists it in the task loop.

#### T-17: Clean up the remaining leftovers (F02, F26, F27)

**Goal.** Remove the small items that no other task covers.

**Files.** `src/style.css`, `src/components/MasonryGrid.svelte`,
`src/components/MasonryItem.svelte`.

**Change.**
- Remove the unused `--color-bg-card` token if T-01 has not already.
- Move `mb-4 break-inside-avoid` from the inner figure to the animated
  wrapper in `MasonryGrid`, matching `docs/designMasonry.md` section 8.1. Keep
  the card round and the image background on the figure.
- Rename `bg-gradient-to-t` to `bg-linear-to-t` in `MasonryItem`.

**Acceptance.** The visual result is unchanged after each item. The design
check from T-16 passes.

**Tests.** Existing suites pass.

**Docs.** `docs/WIKI.md` section 16 loses the unused-token note.

## 5. Decision Points

| ID | Question | Recommendation | Why |
|---|---|---|---|
| DP1 | Darken the accent, or add a separate strong accent for buttons? | Darken `--color-accent` to `#d63a54` and move hover to `#c22d4a`. | One token, one meaning. White text passes AA on both values. It is a visible brand shift, so confirm with the maintainer. |
| DP2 | Extract `Button.svelte`, or keep class recipes? | Extract after T-03, when the recipes are proven. Variants: primary, secondary, danger, ghost. | 12 buttons in 4 files produced the danger-color and hover drift. One component prevents a repeat. Keep the API small. |
| DP3 | Custom confirm dialog, or keep native `confirm()`? | Build `ConfirmDialog.svelte` on a native `<dialog>` in T-09. If deferred, record the deferral in `docs/LLM-WIKI.md` section 9. | Native dialogs cannot match the design or the focus rules, and `confirm()` blocks the main thread. A native `<dialog>` adds no dependency. |
| DP4 | Motion preference: read once or subscribe? | Keep read once, extract it to `src/motion.ts`, and reconcile both docs. | Preserves the intentional sharp edge in `docs/LLM-WIKI.md` section 8. A live system change is rare, and the current behavior is documented. |
| DP5 | Where does the no-results state live? | Keep the empty state in `MasonryGrid` and pass `emptyKind` plus a clear callback from `Gallery`. | `docs/designMasonry.md` section 16 gives the empty state to the grid. The grid still needs context to tell the two cases apart. |
| DP6 | How to stop the initial-render fade? | Try `mount(..., { intro: false })` in a short spike. If it reaches child transitions, use it. Otherwise gate `animate` in `Gallery` state, initially `false`. | `docs/designMasonry.md` section 8.5 requires a still first paint. The state gate also makes the dead `animate` prop meaningful. |

## 6. Non-Goals

- No JavaScript masonry engine and no virtualization. See
  `docs/designMasonry.md` section 23.
- No runtime dependency. No toast or headless-UI library. Use native
  `<dialog>` and Svelte state.
- No import or export of character cards, no SillyTavern card format, no
  thumbnails or blob storage, no `srcset` or CDN work. These are data-layer
  features in `docs/LLM-WIKI.md` section 9, not design drift.
- No ESLint or Prettier. The design check script is the one new gate. See
  `docs/WIKI.md` section 17.
- No light theme and no theme switcher.
- No changes to the storage layer, the data model, or the download path,
  except where a task names it.
- No real-browser test runner. jsdom cannot test the focus trap or Escape
  handling. The browser checklist in section 7 covers those.

## 7. Verification

Per task:

```bash
npm run check          # 0 errors and 0 warnings
npm test               # all tests pass
npm run build          # succeeds
npm run check:design   # after T-16
```

Browser checklist for the affected areas. Run it after P1, P2, and P3, on
Chrome or Edge plus Firefox:

- Keyboard only: Tab through the toolbar, the cards, the lightbox, and the
  form. Every stop has a visible ring. Enter and Space activate cards.
  Escape closes the dialog. Arrow keys move in the lightbox.
- Reduced motion: enable the OS setting. The first paint is still. Filter and
  sort do not animate. Hover labels and buttons stay visible.
- Contrast: check the final token values with a contrast tool. Record the
  numbers.
- Widths: 320, 768, 1280, and 1920 px. Check the shared gutter, the column
  count, and the dialog.
- Dark native UI: open the sort select and scroll. The popup and the
  scrollbars are dark.
- Failure paths: corrupt one record's `image` in the IndexedDB devtools. The
  card shows the error state and keeps its shape. Save with storage blocked
  and confirm the notice appears.
- Empty and no-match states: empty the library, then search for a term with
  no match.

CI gains the `check:design` step in T-16. The existing CI steps stay.

## 8. Suggested Commit Sequence

Each commit lands green and follows `CONTRIBUTING.md` conventional commits.

1. `style(tokens): add semantic theme tokens and fix contrast`
2. `style(ui): replace raw palette utilities with theme tokens`
3. `fix(motion): stop animating the initial gallery render`
4. `fix(motion): gate hover movement and share the motion helper`
5. `fix(a11y): label toolbar controls and announce result counts`
6. `fix(a11y): express card selection with aria-pressed`
7. `fix(gallery): show a no-results state and clear it`
8. `refactor(feedback): replace alerts and confirms with in-app UI`
9. `fix(form): use inline validation and manage focus`
10. `fix(card): add an image error state and a safe aspect ratio`
11. `fix(lightbox): close on backdrop click and describe the dialog`
12. `style(chrome): align the page container and set the color scheme`
13. `chore(html): own the favicon, metadata, and noscript message`
14. `ci(design): add the token and feedback guardrail`
15. `chore: remove the remaining design leftovers`
16. `docs: update the wiki for the design pass`

Update `CHANGELOG.md` under an Unreleased heading as the tasks land. Update
the matching `docs/` file in the same commit, per D11.

## 9. Maintenance

- Keep a status column or a status line per task when work starts. Mark a task
  Done only when its acceptance criteria and the browser checklist pass.
- On adoption, add a `plan.md` row to the documentation map in
  `docs/WIKI.md` section 18.
- When a decision changes, update the decision table here and the matching
  document. Do not let this plan become a second source of truth for the
  architecture; the wiki stays primary.
- Re-run the audit when the app gains a new view or a new control family. The
  three drift patterns to watch are raw colors, ungated motion, and silent
  failures.
