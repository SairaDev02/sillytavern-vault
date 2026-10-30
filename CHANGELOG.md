# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A failed start-up offers Retry. Retry reads the library again, deletes or
  replaces no stored Character, and moves focus to the page heading before the
  control disappears. Add stays unavailable until the library is ready, and
  loading, readiness, and the failure are announced as status.
- The Gallery tells an empty library from a search with no matches, and a search
  with no matches offers Clear search. Clear search keeps the sort order, the
  selection, and the selection mode, and returns focus to the search field or to
  the first card.
- An image that cannot be displayed is replaced by "Image unavailable" inside
  the frame reserved for it, on the Gallery card and in the detail view. The card
  keeps the Character name and the checkbox state, and the detail view announces
  the failure as status without moving focus.
- A download that fails while the app prepares the file is reported as one
  dismissible notice that names the Character, in page content or inside the open
  detail view. A handoff to the browser is never reported as a saved file.

### Changed

- The supported toolchain is Node `^24.15.0 || ^26.0.0` with npm `^12.0.0`, and
  Node 26 is the preferred local version. CI runs six Node and npm combinations,
  each with the locked install, type check, tests, and production build.
- Changes reach `main` through a pull request that satisfies the required status
  checks, the CodeQL findings threshold, and the dependency review. See
  `docs/branch-gate.md`.
- The release identity and the public compatibility policy are documented. A
  released checkout is identified by its annotated tag or commit, not by the
  version field. `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, and
  `docs/WIKI.md` section 19 state the Semantic Versioning mapping, the
  compatibility boundary and its limits, and the release procedure.
- The search field and the sort control have persistent visible labels.
- Muted text, placeholder text, and outlined control borders use a lighter step
  on the dark panels. Every focused control gets one shared outline, and a card
  face over artwork adds a two-tone inner ring so the indicator stays visible on
  light and dark images.
- In selection mode each Character exposes its selection through one native
  checkbox, and the card face toggles the same selection with a pointer or touch.
  The number selected is announced as status.
- Contributor and agent guidance now share one documentation update contract,
  which the [Documentation Map](docs/WIKI.md#18-documentation-map) states. A
  noteworthy user-facing, setup or toolchain, or maintainer-policy change
  records its impact in `Unreleased` in the same pull request. A routine
  refactor, a dependency bump, or a test-only change needs an entry only when
  its impact is noteworthy. A document whose audience-relevant statements change
  or become inaccurate is updated in that pull request. Historical release
  entries and accepted architecture decisions are preserved.

### Fixed

- The Character form now honors the latest explicit image choice. A slower read
  or measurement from an earlier file can no longer replace the preview, the
  dimensions, or the image that is saved.
- Save is disabled while a selected image is being prepared, and a failed read
  blocks saving until the user discards the replacement or chooses another
  file. A failed size measurement still allows saving, with both dimensions
  absent and a visible warning.
- Discarding a pending replacement restores the stored image and its known
  dimensions. Choosing the same file again starts a new preparation.
- Saving freezes the draft and ignores duplicate submissions. A rejected save
  keeps the prepared draft, shows the error, and unlocks the form for a retry.
- A failed delete is reported in a notice that says the Character is still in the
  library.
- A failed batch delete reports the failure and keeps the selection, so the
  operation can be reviewed or retried.
- Background dimension repair merges the measured pair into the record as it
  stands, so a newer name or description always wins. A repair never revives a
  deleted Character or restores a replaced image.

## [1.0.0] - 2026-09-22

The first public release.

### Added — application

- Character cards with a name, a description, and an image, persisted in
  IndexedDB. No backend and no runtime dependencies.
- Responsive masonry gallery built with CSS multi-column layout, with no
  JavaScript position calculation.
- Search across character names and descriptions, case-insensitive.
- Sorting by newest, oldest, and name, with numeric-aware name order.
- Incremental rendering: 24 cards per page, with an `IntersectionObserver`
  sentinel that loads the next page on scroll.
- Lightbox detail view with Arrow Left and Arrow Right navigation and Escape to
  close.
- Batch delete through a selection mode that removes many records in one
  transaction.
- Image export to PNG. JPEG and WebP sources are converted on a canvas; PNG
  sources are passed through unchanged.
- Aspect-ratio backfill for records that were written before dimensions were
  stored, so older galleries render without layout shift.
- Reduced-motion support, visible focus rings, and real `<dialog>` semantics in
  the detail view.

### Added — project and tooling

- `npm start` launcher (`scripts/start.mjs`). It builds the production bundle
  only when `dist/` is missing or stale, serves it, and opens the browser.
  Flags: `--dev`, `--port <n>`, `--host`, `--force`, `--no-build`, `--no-open`,
  `--help`.
- `start.cmd`, a double-click launcher for Windows. It installs dependencies on
  the first run and pauses on error so the message stays readable.
- Continuous integration in `.github/workflows/ci.yml`. Every push to `main` and
  every pull request runs `npm run check`, `npm test`, and `npm run build` on
  Node 22 and Node 24.
- CodeQL code scanning and pull request dependency review workflows.
- Dependabot configuration for npm packages and GitHub Actions.
- Community documentation: `README.md`, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, and issue and pull request templates.
- Apache-2.0 licensing: the verbatim license in `LICENSE` and attribution in
  `NOTICE`.
- Developer documentation: `docs/WIKI.md` for the codebase,
  `docs/designMasonry.md` for the gallery layout, and
  `docs/ASD-STE100-LLM-Writing-Rules.md` for documentation style.

### Security

- Character data, including images, stays in the browser. The app makes no
  network requests and has no telemetry.

[1.0.0]: https://github.com/SairaDev02/sillytavern-vault/releases/tag/v1.0.0
