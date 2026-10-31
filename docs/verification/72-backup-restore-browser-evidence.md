# 72 Backup and Restore: desktop browser and large-library evidence

> This file records a real-browser recheck of the Backup and Restore slice of spec [#72](https://github.com/SairaDev02/sillytavern-vault/issues/72), run for ticket [#77](https://github.com/SairaDev02/sillytavern-vault/issues/77).
> It records what the run observed, including its limits.
> It is not a conformance claim.

**Result.** Every checked flow behaved as the specification requires.
The recheck found no defect, so this branch changes no source file and adds no test.

## 1. Environment

| Item | Value |
|---|---|
| Date | 2026-10-31 (local time, GMT+0800) |
| Browser | Microsoft Edge 156.0.4314.50 (Chromium 156.0.0.0), the `msedge` channel |
| Browser mode | Headless, window 1280 x 720. No visible window was used. |
| User agent | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0` |
| Platform | Windows (Win32), `navigator.platform` = `Win32` |
| Driver | Playwright CLI 0.1.22, `playwright-cli -s=<session> ... --browser msedge` |
| App under test | Commit `f3587a3643b915040159dcc153df99ee24704153`, branch `ticket/77-browser-evidence` (integration branch `spec/72-backup-restore` with tickets 73 to 76 merged) |
| Server | `npx vite --port 5201 --strictPort` from that worktree, page `http://localhost:5201/` |
| Origin | `http://localhost:5201` (one origin for every flow) |

The version came from `page.context().browser().version()` and the user agent from `navigator.userAgent` in the page.

## 2. How the flows were driven

- A page-level owner asked the browser for persistent storage once after the library became ready. The Backup section rendered the answer.
- Files were chosen by setting the file input's files, except in section 6 where the keyboard itself opened the browser's file chooser.
- The download was captured with Playwright's `download` event and saved to disk, and then the saved bytes were inspected with Node.
- `window.confirm` and the browser's file chooser are intercepted by Playwright CLI. Playwright reports the dialog text and holds the dialog until it is accepted or dismissed. Section 6 and section 10 state what that interception does and does not exercise.
- Scratch scripts, the seeded images, and the downloaded Backups lived under the gitignored `.pi-tmp/` of the worktree. Playwright's own session logs and its copy of the download lived under `.playwright-cli/` there. None of them is part of this record or of this commit: the files are not tracked, and the downloaded Backups are reproducible by pressing **Create Backup** as section 3.1 and section 4 describe.

## 3. Small-library flows

The library for these flows was three Characters, each added through the **Add Character** form.

| Character | Image | Stored width x height | `createdAt` | Image data URL length |
|---|---|---|---|---|
| Aurora | 96 x 64 PNG, uploaded to the form | 96 x 64 | 1793449467747 | 338 |
| Bramble | 64 x 96 PNG, uploaded to the form | 64 x 96 | 1793449468017 | 358 |
| Cinder | 72 x 72 PNG, uploaded to the form | 72 x 72 | 1793449468154 | 326 |

Each form submission read the real image, enabled Save only after the image was prepared, and published a card.
The three ids are UUIDs created by the app.

### 3.1 Create a Backup

**Done.** Pressed **Create Backup**, captured the download, and saved it to disk.

**Observed.**

- Suggested file name: `character-gallery-backup-2026-10-31.jsonl`. The date is the local date.
- The browser handed the file over: the download event fired 33 ms after the click, and `download.failure()` returned `null`.
- Edge also opened its own `edge://downloads-hub/` tab on the download.
- The saved file is 1637 bytes. Its first three bytes are `7b 22 66` (`{"f`), so it has no byte-order mark. It has no CRLF pair and it ends with a newline. It has 4 non-empty lines.
- Header line, field order as written:

```json
{"format":"character-gallery/backup","formatVersion":1,"exportedAt":"2026-10-31T12:24:47.180Z","appVersion":"1.0.0"}
```

- Three record lines, one per Character, each with the keys `id,name,description,image,width,height,createdAt`. The `id` and `createdAt` values equal the stored records, and each `image` is the stored `data:image/png;base64,` URL.
- Section status after the handoff: `Backup handed to your browser for download as character-gallery-backup-2026-10-31.jsonl. Your browser or operating system chooses where it saves it.`

### 3.2 Restore the same file into the same library

**Done.** Chose the file just created.

**Observed.**

- No confirmation appeared, because no Character would be added.
- Status: `Nothing was written: 0 added, 3 already in your library and kept.`
- No dialog appeared. The library stayed at 3 Characters, with no duplicate.
- The file input was reset to an empty value, so the same file was selectable again later.

### 3.3 Clear the library through the app

**Done.** Pressed **Select**, checked every card's checkbox, pressed **Delete Selected**, and accepted the native confirmation.

**Observed.**

- The toolbar showed three checkboxes labelled `Select Cinder`, `Select Bramble`, and `Select Aurora`.
- **Delete Selected** was disabled before any box was checked and enabled afterwards; the selection status read `3 selected`.
- Native confirmation text: `Delete 3 characters?`. Accepted.
- The library went from 3 to 0 records in 184 ms. The page then showed `No characters yet. Add one above!`
- Selection mode ended, and **Create Backup** became disabled with the visible reason `There are no Characters to back up yet.`

### 3.4 Restore after clearing

**Done.** Chose the same Backup file into the empty library.

**Observed.**

- Native confirmation text, exactly:

```
Restore this Backup?
3 Characters will be added.
0 Characters already in your library will be kept.
0 records could not be read and will be skipped.
```

- Accepted. Report: `Restore finished: 3 added, 0 already in your library and kept.`
- The three cards came back with their names and their real images: Cinder at 72 x 72, Bramble at 64 x 96, Aurora at 96 x 64. Each card's image frame used the stored aspect ratio, for example `aspect-ratio: 64 / 96;`.
- The stored records carry the original `id` and `createdAt` values listed in section 3.
- The file input was reset again.

### 3.5 A file that is not a Backup

**Done.** Chose `not-a-backup.txt`, a two-line text file.

**Observed.**

- Inline alert: `The file is not a Character Gallery Backup: its first line is not JSON.`
- The alert is a `role="alert"` node. The polite status line is empty, and no confirmation appeared.
- The library stayed at 3 records. The input was reset.

### 3.6 Dismiss the confirmation, then choose the same file again

The file was the section 3.1 Backup plus one record the library did not hold (a Character named `Dusk`, with a real PNG and a new id).

**Done.** Three attempts with that one file: dismiss, dismiss, accept.

**Observed.**

- Attempt 1: the native confirmation appeared with exactly

```
Restore this Backup?
1 Character will be added.
3 Characters already in your library will be kept.
0 records could not be read and will be skipped.
```

  Dismissing it produced `Restore canceled. Nothing was written.` The library stayed at 3 records and the input was reset. The status line was respelled from `cancelled` to `canceled` after the run, to follow the repository's American English rule. Nothing else in this observation changed, and the flow was not run again.
- Attempt 2 selected the same file again, and the same confirmation appeared again. That shows the input had been reset. Dismissed again: nothing was written.
- Attempt 3 accepted the same confirmation: `Restore finished: 1 added, 3 already in your library and kept.` The library then held Aurora, Bramble, Cinder, and Dusk.

## 4. Large-library case

**Seeding.** Wrote records straight into the app's IndexedDB database `character-gallery`, object store `characters`, key path `id`: 99 synthetic records that share one `data:image/png;base64,` image string of 2 700 022 characters, and one record named `Real Aurora` seeded with a real 96 x 64 PNG. The page was then reloaded, and the app read all 100 records from storage.

| Step | Observed |
|---|---|
| Seeding | 100 records in 1336 ms. Total stored image string length 267 302 516 characters. |
| After reload | 100 records stored, 24 cards rendered on the first page, `Loading more...` present, **Create Backup** enabled |
| Backup, click to download handoff | 1343 ms |
| Backup, click to file saved on disk by the driver | 2174 ms |
| Downloaded file size | 267 320 057 bytes (about 254.9 MiB) |
| Download failure | `null` |
| Backup file shape | 101 lines: 1 header and 100 records. Header `format` `character-gallery/backup`, `formatVersion` 1, `appVersion` `1.0.0`. Longest record line 2 700 195 characters. Ends with a newline, no byte-order mark. First record is `Real Aurora` with the real PNG. |
| Clearing through the app | **Select**, then scrolling the Gallery loaded 24, 72, 96, and 100 checkboxes. `100 selected`. Native confirmation `Delete 100 characters?` accepted. The 100 records were deleted in 123 ms, and the whole step took 1974 ms. |
| Restore of the 267 MB file | Native confirmation `Restore this Backup? / 100 Characters will be added. / 0 Characters already in your library will be kept. / 0 records could not be read and will be skipped.` Accepted. |
| Restore, page-side duration | 2612 ms, from the `Reading and checking the Backup file…` status to the `Restore finished` status |
| Restore, driver-side duration | 2626 ms, from setting the file to the finished status |
| Restore report | `Restore finished: 100 added, 0 already in your library and kept.` |
| Library after Restore | 100 records; 100 cards rendered; first cards `Real Aurora`, `Synthetic 099`, `Synthetic 098` |
| Real image after Restore | The `Real Aurora` card rendered an image of 96 x 64 pixels, complete |
| Synthetic images after Restore | The 99 synthetic records restored. Their cards showed the app's existing `Image unavailable` fallback, because those payloads are not decodable images. All 100 cards were either an image element or that fallback. |
| Re-Restore of the same 267 MB file | 1879 ms, no confirmation, `Nothing was written: 0 added, 100 already in your library and kept.`, library still 100 |
| Failure during any of these steps | None. No alert appeared, and the console held no Backup or Restore error. |

`navigator.storage.estimate()` reported a quota of 10 737 545 216 bytes. Its usage figure read 126 976 bytes immediately after seeding, before the browser finished accounting, so that figure is not a measurement of the seeded data.

## 5. Browser storage protection line

- State the browser reported: **not protected**. The line said: `This browser has not protected this site's storage, so it may clear your library to free up space. Create a Backup to keep a copy.`
- The line is a `role="status"` node with `aria-live="polite"` and `aria-atomic="true"`, in its own block below the Backup feedback.
- The retry control's visible text is `Try again` and its accessible name is `Try again asking this browser to protect your storage`.
- **Try again**, activated with the Space key, disabled the button while the request ran and then re-enabled it. The line kept the same text.
- Answers observed during that one user-initiated request: `navigator.storage.persisted()` returned `false`, then `navigator.storage.persist()` returned `false`. Each was called once for that activation.
- Neither Backup nor Restore changed state or became unavailable because of this answer.

## 6. Keyboard operation

The keyboard walk used Tab, Space, and Enter only.

| Control | Result |
|---|---|
| Tab order from the page body | `+ Add Character` (1), Search characters (2), Sort characters (3), Select (4), then each card's open and download buttons (5 to 12 with 4 cards), **Create Backup** (13), **Backup file** input (14). From the page body, one Tab reached **Try again**. |
| **Create Backup** | Focused with Tab, activated with Enter. A download fired with the expected name, `download.failure()` was `null`, and the handoff status appeared. Focus stayed on the button. |
| **Backup file** input | Focused with Tab (step 20 of that walk), activated with Enter. The browser's own file chooser opened, Playwright reported a `filechooser` event, and the file supplied to that chooser ran the Restore. |
| Restore from that keyboard-started chooser | Native confirmation `Restore this Backup? / 2 Characters will be added. / 6 Characters already in your library will be kept. / 0 records could not be read and will be skipped.` Accepted. Report: `Restore finished: 2 added, 6 already in your library and kept.` Both new cards rendered their images. |
| **Try again** | Focused with Tab, activated with Space. See section 5. |

**Not verified: the native confirmation with the keyboard.** Playwright CLI intercepts `window.confirm`, so keystrokes never reach the dialog. This run drove the two outcomes through the driver's dialog accept and dismiss, which correspond to the dialog's default button and to Escape. That Tab reaches the dialog's buttons and that Enter or Escape acts on them in the operating system's dialog remains unverified.

## 7. Announced states

These are accessibility-tree snapshots and DOM text, taken from the running page. They are what a screen reader *could* read from the tree. Real screen-reader speech, order, and timing were not tested (section 10).

| State | What the page exposed |
|---|---|
| Busy, during the 267 MB Restore | The region `Backup and restore` had `aria-busy="true"`. Its snapshot: `button "Create Backup" [disabled]`, `paragraph: A Restore is in progress.`, `button "Backup file" [disabled]`, `paragraph: A Restore is in progress.`, `status: Reading and checking the Backup file…`. Both operations were excluded at once. |
| Busy, during the 267 MB Backup | `aria-busy="true"`, status `Preparing your Backup…`, both controls disabled. |
| Success | `status: "Restore finished: 100 added, 0 already in your library and kept."` in the same polite live region. |
| Alert, a file that is not a Backup | `alert: "The file is not a Character Gallery Backup: its first line is not JSON."` as a `role="alert"` node, with the polite status line empty. |
| Storage line | A separate `role="status"` line, `aria-live="polite"`, below the Backup feedback. |

The polite status region and its text node exist before any message arrives, so the region is in the tree when its text changes. The region kept `aria-atomic="true"`, so the whole sentence is the unit of change.

**Observation, not a defect.** The sentence `A Restore is in progress.` renders twice while a Restore runs: once as the **Create Backup** button's description and once as the file input's description. Each is the `aria-describedby` target of a different control, so both are reachable by a screen reader. It is redundant on screen. No acceptance criterion forbids it.

## 8. Gallery view and focus

- With `Synthetic` typed in the search box, sort `newest`, and 24 cards rendered, a Restore added 3 Characters. The search text, the sort, and the rendered page were unchanged afterwards, and focus stayed in the search box.
- Focus stayed on the Search box through a 267 MB Restore that reported `Nothing was written: 0 added, 100 already in your library and kept.`
- After the keyboard-started file chooser closed, the browser had moved focus to the page body. That is the browser's choice on closing its own chooser, not the app moving focus.

## 9. Defects

**No defect was found in the shipped Backup or Restore behavior.** Every flow in section 3, section 4, section 5, and section 6 matched the specification and the format contract. This branch therefore adds no source change and no test.

The page console held no Backup or Restore failure. Its only app log was the expected `Failed to restore a Backup: BackupFileError: The file is not a Character Gallery Backup: its first line is not JSON.` from section 3.5.

The console also held 161 `WebSocket connection to 'ws://localhost:5201/' failed` errors and two `[vite] server connection lost` lines from the Vite development client. They come from the development server's hot-reload socket in this session, and they do not touch the app's behavior: every flow in this file ran while the page was fully loaded and before or after those entries. They are a development-server detail, not a product defect.

## 10. What this does not prove

- **A Backup handoff is not proof that a file was saved.** The app can only observe that the browser took the download. This run saved the download with the driver and inspected those bytes. It did not confirm that Edge or Windows wrote a file to a user-chosen folder, showed a save dialog, or kept the file.
- **A Restore report proves what the library committed, not that an image will display.** The large-library run shows exactly this: 100 records were committed, and 99 of them show `Image unavailable` because their bytes are not an image. Restore validates the data-URL shape and never decodes the pixels.
- **This run is headless.** The page ran in headless Edge 156 driven by Playwright CLI. A visible browser window, a real user profile, and its own settings were not part of the run.
- **The storage answer is this profile's answer.** `navigator.storage.persist()` uses browser heuristics, so "not protected" here does not mean another profile or another browser would answer the same. The other three states were not produced by a real browser in this run.
- **The dialog was intercepted.** The confirmation text is Playwright's report of the real `window.confirm` message, and the outcome came from the driver's accept and dismiss. Operating the dialog's buttons with the keyboard was not verified.
- **The file chooser was intercepted in most flows.** Except for the keyboard walk, files were set on the input directly. The operating system's file picker, its filters, and dragging a file onto it were not exercised.
- **No screen reader was running.** Section 7 records the accessibility tree and the live-region attributes. Speech output, announcement order, and interruption behavior are unverified.
- **No assistive-technology or WCAG conformance is claimed.** Nothing here supports a conformance statement.
- **Touch, tablet, and small viewports were not tested.** The run used one 1280 x 720 desktop viewport.

## 11. Outstanding and unverified

| Item | Status |
|---|---|
| Android Chrome | **Outstanding.** No Android device was reachable through this tooling. Desktop viewport emulation was not used and is not Android evidence. |
| Firefox | Unverified |
| Safari | Unverified |
| Physical touch input | Unverified |
| Real screen-reader sessions | Unverified |
| Operating system file picker and save dialog | Unverified |
| Headed browser window | Unverified |

## 12. Recorded checks

Run in this worktree twice: at commit `f3587a3`, which is the merge base of this branch and `spec/72-backup-restore`, and again on the commit that adds this file. Both runs gave the results below.

| Command | Result |
|---|---|
| `npm test` | 20 test files passed, 380 tests passed, 0 failed |
| `npm run check` | `svelte-check found 0 errors and 0 warnings` |
| `npm run build` | `vite build` completed: 134 modules transformed, `dist/index.html` 0.46 kB, `dist/assets/index-eHXv8-5R.css` 32.35 kB, `dist/assets/index-DV9INkEx.js` 104.83 kB. Both runs produced the same asset names and sizes. |

`git merge spec/72-backup-restore` reported `Already up to date`, so the integration branch had not moved and these commands already ran on the final revision of this branch.
This branch changes no script, style, or test: it adds this file only.
