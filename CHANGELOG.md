# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
