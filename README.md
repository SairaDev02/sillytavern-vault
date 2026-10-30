# Character Gallery

A local-first character card gallery that runs entirely in the browser.

Add a character with a name, a description, and an image. The app stores the card
in IndexedDB and shows it in a responsive masonry gallery with search, sorting, a
detail view, and image export. There is no backend, no account, and no upload:
your cards never leave your machine.

[![CI](https://github.com/SairaDev02/sillytavern-vault/actions/workflows/ci.yml/badge.svg)](https://github.com/SairaDev02/sillytavern-vault/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![CI Node](https://img.shields.io/badge/CI%20Node-24%20%7C%2026%2C%20npm%2012-brightgreen.svg)](#requirements)

## Features

- **Masonry gallery** — a CSS multi-column layout with no JavaScript position
  math, so it stays smooth with hundreds of cards and never shifts after load.
- **Add, edit, and delete** characters from a single form. A new image is
  prepared before saving, so the latest file choice is the one stored.
- **Search** across names and descriptions, case-insensitive.
- **Sort** by newest, oldest, or name (numeric-aware, case-insensitive).
- **Incremental rendering** — 24 cards at a time, with an `IntersectionObserver`
  sentinel that loads the next page as you scroll.
- **Lightbox detail view** — full-size image, description, keyboard navigation
  with Arrow Left and Arrow Right, and Escape to close.
- **Batch delete** — a select mode that removes many cards in one transaction.
- **Image export** — download a card's image as a PNG. JPEG and WebP sources are
  converted on a canvas; PNG sources are passed through untouched.
- **Accessible by default** — real `<dialog>` semantics, visible focus rings,
  keyboard operability, and animation that respects `prefers-reduced-motion`.
- **No runtime dependencies** — the shipped bundle is application code plus
  nothing else.

## Requirements

- **Node.js `^24.15.0 || ^26.0.0` and npm `^12.0.0`.** `package.json` declares
  both ranges, and `package-lock.json` repeats them at the root of the lockfile.
  Node 26 is preferred for local development and `.nvmrc` selects it. Node
  24.15.0 is the oldest supported release. Other Node majors, including 22, are
  outside this support promise.
- **Six CI combinations.** CI tests Node 24.15.0, the latest 24.x, 26.0.0, and
  the latest 26.x, each with the latest npm 12; it also tests Node 24.15.0 and
  26.0.0 with npm 12.0.0. Every entry runs the locked install, the type check, the
  tests, and the build, and enforces the dependency engine ranges during that
  install.
- **Install scripts.** npm 12 does not run a dependency install script that
  `package.json` does not approve. It blocks the script and prints a warning; it
  does not fail the install. The approved build dependency is esbuild, approved
  by exact version under `allowScripts`. A new esbuild version needs a new
  approval.
- **No local version guard.** No install step and no launcher rejects an
  unsupported Node or npm version on your machine; only CI enforces the ranges.
  Node runs the local tools and the included launcher. The deployed app remains
  static files for the browser.
- A modern browser with IndexedDB — Chrome, Edge, Firefox, or Safari.

## Quick start

```bash
npm ci        # install dependencies (npm install works too)
npm start     # build if needed, serve, and open the browser
```

`npm start` builds the production bundle when `dist/` is missing or stale, serves
it at <http://localhost:4173>, and opens your browser. It rebuilds only when a
source file is newer than the last build.

On Windows you can also double-click **`start.cmd`**, which installs dependencies
on the first run, starts the app, and pauses on error so you can read the message.

> **Note:** `npm start -- --dev` passes flags to the launcher. `npm start --dev`
> does not work, because npm consumes the flag first.

### Development mode

```bash
npm run dev       # Vite dev server with hot module replacement on :5173
npm run start:dev # the same server, started through the launcher
```

### All scripts

| Command | Action |
| --- | --- |
| `npm start` | Build if stale, then serve `dist/` and open the browser. |
| `npm run start:dev` | Start the dev server through the launcher. |
| `npm run dev` | Start the Vite dev server with HMR. |
| `npm run build` | Build the production bundle into `dist/`. Does not type-check. |
| `npm run preview` | Serve an existing `dist/` with the Vite preview server. |
| `npm run check` | Type-check `src/` and `tests/` with `svelte-check`. |
| `npm run check:watch` | Type-check in watch mode. |
| `npm test` | Run the Vitest suite. |
| `npm run test:watch` | Run tests in watch mode. |
| `npm run test:ui` | Open the Vitest UI. |

Launcher flags: `--dev`, `--port <n>`, `--host`, `--force`, `--no-build`,
`--no-open`, `--help`.

## Where your data lives

Cards are stored with IndexedDB, in a database called `character-gallery`. An
important consequence: **the data is scoped to the origin**, so the scheme, host,
and port must stay the same. Serving the app from port 4173, then from 8080, gives
you two separate, empty galleries.

Because the app is client-side only:

- Nothing is uploaded. There is no server and no telemetry.
- Clearing site data, or "Clear browsing data → Cookies and other site data" in
  some browsers, deletes the gallery permanently.
- The app cannot open `file://` URLs. Use the launcher or any static server.
- Export important images with the download button. That is the only backup path
  today.

## Releases and compatibility

Version 1.0.0 is the first tagged public release. Its dated entry in
[`CHANGELOG.md`](CHANGELOG.md#100---2026-09-22) records what it contained, and
that entry links to the
[v1.0.0 tag page](https://github.com/SairaDev02/sillytavern-vault/releases/tag/v1.0.0).

### Identify a release by its tag or commit

A tag page is not a GitHub Release. The tag page shows a tagged revision and its
annotation. A GitHub Release is a separate, optional object that GitHub attaches
to a tag. This project created none for 1.0.0, and it does not create one after
the fact. Do not read the tag page as proof that a Release exists.

`main` can still show version 1.0.0 in `package.json` while it carries newer
changes under `Unreleased`. The version field alone does not identify the tagged
revision. Identify a released checkout by its tag or by its commit.

The project follows
[Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).
A backward-compatible fix is a patch release, and a backward-compatible addition
or a deprecation is a minor release. An incompatible change to the public
contract is a major release.

A released version keeps its contents. A tag identifies the same contents for as
long as it exists.

### What a stable release promises

The public contract of a stable release has three parts.

- **Your library.** A valid existing Character library stays accessible, with no
  data loss caused by the application, after a normal upgrade on the same
  origin.
- **The core capabilities.** These are saving and managing Characters, browsing,
  searching and sorting, the detail view, batch deletion, and PNG image export,
  as the [features](#features) describe them. A compatible release does not
  remove a capability from this list.
- **The supported toolchain.** A release's contract covers the Node and npm
  combinations that the release states as supported.
  [Requirements](#requirements) gives the current ranges.

### The limits of the promise

The data promise does not cover four cases:

- Data that was already corrupt before the upgrade.
- A failure of browser storage that the application does not cause.
- Clearing site data.
- A change of origin.

These limits do not excuse data loss caused by the application's own upgrade
logic. The promise also does not create a permanent direct-migration path from
every historical version.

Exact UI wording, layout, and internal implementation are not part of the
contract. A renamed label, a changed color, a moved button, or a refactored
module is not a breaking change by itself.

Node 22 support belongs to the tagged 1.0.0 release. The current toolchain no
longer supports Node 22, so a stable release that contains that removal needs a
major increment.

The privacy and accessibility commitments do not change with a release. Nothing
is uploaded, there is no telemetry, and the documented keyboard and focus
behavior stays in place.

For the release procedure, the full compatibility statement, and the security
support policy, read
[section 19 of the developer wiki](docs/WIKI.md#19-releases-and-the-public-contract)
and [`SECURITY.md`](SECURITY.md).

## Project structure

```
src/
  main.ts                    Svelte mount entry point
  App.svelte                 Page shell: start-up states and the delete notice
  character-library.svelte.ts  The Character library, the only writer of records
  library-error.ts           The error kinds a library mutation can refuse
  db.ts                      IndexedDB open plus CRUD helpers
  gallery-utils.ts           Filter, sort, and page-size rules
  download.ts                Data URL parsing and image export
  image.ts                   Aspect-ratio measurement
  selected-image.svelte.ts   Selected-image preparation for the character form
  id.ts                      Card ID generation
  types.ts                   The Character type
  components/
    Gallery.svelte           Pagination, selection state, sentinel wiring
    GalleryToolbar.svelte    Search, sort, select mode
    MasonryGrid.svelte       CSS-columns masonry layout
    MasonryItem.svelte       One card
    Lightbox.svelte          Detail view
    CharacterForm.svelte     Add and edit form
tests/                       Vitest suites, fixtures, and a jsdom harness
docs/                        Developer wiki, layout design, writing rules
scripts/start.mjs            The launcher behind `npm start`
```

For a deeper tour, read [`docs/WIKI.md`](docs/WIKI.md). For the gallery layout
decisions, read [`docs/designMasonry.md`](docs/designMasonry.md).

## Tech stack

| Layer | Choice |
| --- | --- |
| UI | Svelte 5 (runes) |
| Build | Vite 6 |
| Styling | Tailwind CSS 4 |
| Language | TypeScript 5 |
| Storage | IndexedDB (no wrapper library) |
| Tests | Vitest 5, jsdom, fake-indexeddb (components mounted with Svelte's own `mount`) |

## Testing

```bash
npm run check   # svelte-check, type errors
npm test        # Vitest suite
npm run build   # production build
```

All three run in CI on every push to `main` and every pull request, on each of the
six supported Node and npm combinations. Run them before you open a pull request.

## Contributing

Contributions are welcome. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) first, and
follow the [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

- Report bugs and request features through the [issue templates](https://github.com/SairaDev02/sillytavern-vault/issues/new/choose).
- Report security problems privately as described in [`SECURITY.md`](SECURITY.md).
- Changes are recorded in [`CHANGELOG.md`](CHANGELOG.md).

## License

Licensed under the [Apache License 2.0](LICENSE). See [`NOTICE`](NOTICE) for
attribution.

## Disclaimer

This project is an independent, standalone tool. It is **not affiliated with,
sponsored by, or endorsed by SillyTavernAI or the SillyTavern project**, and it
bundles no SillyTavern code or branding. It reads no SillyTavern file formats; it
is a general-purpose gallery for character images and descriptions.
