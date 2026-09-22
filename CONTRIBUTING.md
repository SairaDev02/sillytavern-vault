# Contributing to Character Gallery

Thanks for taking the time to contribute. This document describes how to set up
the project, what to check before you open a pull request, and the conventions
this repository follows.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug** with the [bug report template](https://github.com/SairaDev02/sillytavern-vault/issues/new?template=bug_report.yml).
- **Request a feature** with the [feature request template](https://github.com/SairaDev02/sillytavern-vault/issues/new?template=feature_request.yml).
- **Improve documentation** — the README, `docs/`, or code comments.
- **Send a pull request** for an open issue, or for a small, self-contained fix.

For a large change, open an issue first. That way we agree on the approach before
you spend time on the implementation.

## Requirements

- Node.js **20 or newer** (22 LTS recommended).
- npm (the repository ships a `package-lock.json`).

## Setup

```bash
git clone https://github.com/SairaDev02/sillytavern-vault.git
cd sillytavern-vault
npm ci
npm start          # build and serve the production bundle
# or
npm run dev        # dev server with hot module replacement
```

## Before you open a pull request

Run the same gate that CI runs. All three commands must pass:

```bash
npm run check   # svelte-check: type errors in src/ and tests/
npm test        # Vitest suite
npm run build   # production build
```

If you changed behavior, add or update tests in `tests/`. If you changed the
command line, the setup steps, or the architecture, update the README and
`docs/WIKI.md` in the same pull request.

## Project conventions

### Code

- **TypeScript everywhere.** `src/` and `tests/` are type-checked by
  `svelte-check`. Do not add `any` to silence a real type problem.
- **Svelte 5 runes.** Use `$state`, `$derived`, and `$effect`. Do not mix in
  Svelte 4 stores or `export let` props in new code.
- **Keep layout in CSS.** The masonry layout is deliberately pure CSS. Do not add
  JavaScript position calculation as a shortcut; see `docs/designMasonry.md`.
- **No runtime dependencies.** The app ships with an empty `dependencies` field
  and should keep it that way. Build and test tooling belongs in
  `devDependencies`.
- **Pure logic lives outside components.** Filtering, sorting, parsing, and ID
  generation belong in `src/*.ts` so they are directly testable.
- **Comment the "why", not the "what".** Explain a decision that a reader could
  otherwise mistake for a mistake.
- **Respect the existing style.** Two-space indentation, single quotes, trailing
  commas, and a print width of roughly 100 columns. Match the file you edit.

### Commits

This repository uses [Conventional Commits](https://www.conventionalcommits.org/).
The subject line is imperative and lower case, and it fits in about 72 characters.

```
feat(gallery): add keyboard paging to the lightbox
fix(db): reject on transaction abort
docs: explain the IndexedDB origin scoping
test(download): cover SVG data URLs
chore: bump vite to 6.0.1
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore`, `revert`.

### Pull requests

- Branch from `main`, and use a descriptive branch name such as
  `fix/lightbox-focus-trap`.
- Keep one logical change per pull request.
- Fill out the pull request template. Describe what changed, why, and how you
  verified it.
- Link the issue the pull request closes, for example `Closes #12`.
- Keep the history clean. Squash fixup commits before you ask for review.
- Expect CI to run `npm run check`, `npm test`, and `npm run build` on Node 22
  and 24. A red CI run blocks merge.

### Documentation style

The developer documentation in `docs/` follows the plain-language rules in
`docs/ASD-STE100-LLM-Writing-Rules.md`: short sentences, active voice, one idea
per sentence. Match that style when you edit a document in `docs/`.

Note that this style applies to documentation only. The README uses normal
developer prose.

## Reporting security issues

Do not open a public issue for a security problem. Follow
[SECURITY.md](SECURITY.md) instead.

## License

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE), as described in section 5 of that license.
