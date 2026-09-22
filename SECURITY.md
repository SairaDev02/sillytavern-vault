# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.0.x | Yes |
| < 1.0 | No |

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report it through GitHub private vulnerability reporting. Open the
[Security tab](https://github.com/SairaDev02/sillytavern-vault/security) and choose
*Report a vulnerability*, or go straight to the
[confidential report form](https://github.com/SairaDev02/sillytavern-vault/security/advisories/new).

This is the only supported channel. It keeps the discussion private, tracks the
fix in one place, and needs no personal contact details from either side.

If you cannot use GitHub, open a public issue that contains **no details of the
problem** and ask the maintainer to arrange a private channel.

Include what you can:

- A description of the problem and its impact.
- Step-by-step reproduction instructions.
- The commit, tag, or version you tested.
- Browser and operating system versions.
- A proof of concept, if you have one.

You can expect an acknowledgement within **7 days** and a status update within
**30 days**. Fixes are released as a patch version, and you are credited in the
release notes unless you ask to stay anonymous.

## Scope

This project is a static, client-side application. It has no server, no accounts,
no network calls, and no stored secrets. That shapes what can and cannot be a
vulnerability here.

### In scope

- **Stored cross-site scripting.** Character names, descriptions, and image data
  URLs are attacker-controlled input that is stored in IndexedDB and rendered
  later. Any path that renders this content without escaping it is a valid report.
- **Data corruption or silent data loss** caused by the persistence layer, such
  as a transaction that resolves before it commits, or a delete that removes more
  than the selected records.
- **A dependency vulnerability that is reachable in the built output.** Only a
  package that affects `dist/` counts. A problem in a build-only or test-only
  tool is better reported upstream, though we still want to know about it.
- **Supply-chain problems in this repository**, such as a GitHub Actions workflow
  that can be made to run untrusted code with write permissions.

### Out of scope

- Loss of data after the user clears site data, uses private browsing, or changes
  the origin (scheme, host, or port). This is documented browser behavior.
- Malicious content inside an image file that the user chose to add.
- Vulnerabilities in a browser, an extension, or an operating system.
- Any deployed copy of the app that this project does not operate.
- Missing hardening features, such as a Content-Security-Policy, when no exploit
  follows from their absence. Report these as normal issues instead.

## Handling untrusted content

Keep these invariants when you change the code:

- Render user text through Svelte. Do not introduce `{@html}` for a character
  name, a description, or a data URL.
- Treat a data URL as untrusted input. `parseDataUrl` in `src/download.ts`
  validates the shape before the app turns it into a blob.
- Do not add a network request. The app must keep working with the network
  disabled, and nothing the user adds should ever leave their browser.
- Pin GitHub Actions to a commit SHA, and keep `permissions` at the minimum the
  workflow needs.
