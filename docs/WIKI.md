# Character Gallery: Project Wiki

> This document describes the `character-gallery` codebase. It follows ASD-STE100 Issue 9 writing rules for clarity.

## Overview

The Character Gallery app stores character cards in the browser. Each card holds a name, a description, and a base64 image. The app stores all data in IndexedDB. The data stays in the browser. The app clears the data when you clear the browser data.

The app is a single page. The page shows a gallery grid. The page shows a form to add or edit a character. The page shows a lightbox to view one character.

## Technology Stack

The project uses these technologies:

- Svelte 5 with runes for the user interface and the state.
- Vite 6 as the development server and the build tool.
- Tailwind CSS 4 for the style rules.
- TypeScript 5.6 with strict mode for type checking.
- IndexedDB as the client-side storage.
- Vitest 5 with jsdom for the tests.

The app has no backend server. The app has no third-party runtime dependencies. All dependencies are build tools and test tools.

## Project Structure

The source files are in the `src` folder. The components are in the `src/components` folder. The test files are in the `tests` folder. The documents are in the `docs` folder.

```text
index.html                    HTML entry page
src/main.ts                   Mounts the App component
src/App.svelte                Page shell, database access, save and delete actions
src/style.css                 Tailwind import and the color theme
src/types.ts                  The Character type
src/db.ts                     IndexedDB open, read, and write functions
src/id.ts                     The generateId function
src/image.ts                  The measureImage function
src/gallery-utils.ts          Search, sort, and page-size rules
src/download.ts               Data URL parsing, PNG conversion, file download
src/components/Gallery.svelte          Search state, sort state, paging, selection
src/components/GalleryToolbar.svelte   Search box, sort control, selection controls
src/components/MasonryGrid.svelte      Column layout and list animation
src/components/MasonryItem.svelte      One card: image, hover label, download button
src/components/Lightbox.svelte         Detail dialog, keyboard and button navigation
src/components/CharacterForm.svelte    Add and edit form
tests/                        Vitest test files and test helpers
docs/designMasonry.md         The gallery design document
```

## Data Model

The app stores the `Character` type. The `Character` type has these fields:

- `id`: string. The unique key. The app uses this value as the IndexedDB key path.
- `name`: string. The character name. The name is required.
- `description`: string. The character description. The description is optional.
- `image`: string. The base64 data URL of the image. The image is required for a new character.
- `width`: number. The intrinsic image width in pixels. The value is optional.
- `height`: number. The intrinsic image height in pixels. The value is optional.
- `createdAt`: number. The creation time in milliseconds.

The app uses `width` and `height` to reserve the image aspect ratio before the image decodes. The browser uses the reserved space for the column layout. A card therefore does not move when the image arrives.

The app measures `width` and `height` when the user saves a character. The app also measures old records that have no dimensions. This action is the backfill. The backfill runs after each load.

## Storage

The IndexedDB database name is `character-gallery`. The database version is 1. The object store name is `characters`. The store has one index on the `name` field. The `name` index is not unique.

The `src/db.ts` file supplies these functions:

- `openDB`: opens the database. The function creates the object store on first use.
- `dbAdd`: inserts a record or replaces the record with the same id.
- `dbDelete`: removes one record by id.
- `dbDeleteMany`: removes many records in one transaction.
- `dbGetAll`: reads all records.

Each write function waits for the transaction to complete. A failed transaction rejects the promise. An aborted transaction also rejects the promise.

## Architecture

The `App.svelte` component owns the database connection and the character list. The component does these steps at start:

1. Open the database.
2. Load all characters.
3. Show the gallery.

The `App.svelte` component also does these actions:

- Save a new character. The app makes a new id and the current time.
- Save an edited character. The app keeps the original `createdAt` value.
- Delete one character or many characters after a confirmation.
- Start the dimension backfill for old records.

The `Gallery.svelte` component owns the view state. The component holds the search term, the sort mode, the selected character, the selection mode, and the page count. The component sends the visible characters to `MasonryGrid.svelte`.

The `src/gallery-utils.ts` file holds the filter and sort rules. The rules are pure functions. A test can call these functions without a browser.

The `Lightbox.svelte` component is independent of the gallery layout. The component uses a `<dialog>` element. The dialog opens when a character is selected. The browser keeps the focus inside the dialog. The `close` event of the dialog runs the teardown. The teardown restores the focus to the button that opened the dialog.

The `CharacterForm.svelte` component serves the add mode and the edit mode. The `App.svelte` component mounts a new form for each target. The key of the form is the character id, or `new` in the add mode. The form therefore never shows the values of a different character.

## Features

The app provides these features:

- Add a character with a name, a description, and an image.
- Edit an existing character. The creation time does not change.
- Delete one character. Delete many characters at the same time.
- Search the name and the description. The search ignores the letter case.
- Sort by newest, oldest, or name. The name order ignores the letter case.
- Show the cards in a masonry layout. The browser does the layout work.
- Load more cards when the user scrolls to the end of the list.
- Open one character in a lightbox. Move to the next or the previous character with the arrow keys or the arrow buttons.
- Download the image of a character as a PNG file.
- Keep the motion small when the user sets the reduced-motion preference.

## Behavior Details

The page size is 24 characters. The `Loading more...` element at the end of the list is the sentinel. An `IntersectionObserver` watches the sentinel. When the sentinel becomes visible, the app adds 24 more characters. The effect that starts the observer reads the sentinel from state. The observer therefore always watches the current element.

A search or a sort change resets the page count to the first page.

The download function reads the data URL of the image. A PNG image goes directly to a blob. The app converts a JPEG or WebP image with a canvas. The file name comes from the character name. The function removes characters that Windows does not accept in a file name. The function releases the object URL after the download starts.

## Getting Started

Follow these steps to run the app.

1. Install the dependencies. Run `npm install`.
2. Start the development server. Run `npm run dev`.
3. Open the printed URL in a browser.
4. Click the `+ Add Character` button.
5. Fill in the name and the image.
6. Click `Save`.

Follow these steps to build the app.

1. Run `npm run build`.
2. Find the output in the `dist` folder.
3. Run `npm run preview` to serve the built app.

## Commands

The `package.json` file defines these scripts:

- `dev`: start the Vite development server.
- `build`: build the production bundle into `dist`.
- `preview`: serve the production build.
- `check`: run the Svelte and TypeScript check one time.
- `check:watch`: run the check in watch mode.
- `test`: run the Vitest suite one time.
- `test:watch`: run the Vitest suite in watch mode.
- `test:ui`: open the Vitest user interface.

## Tests

The test suite runs in the Node environment. The default environment is `node`. A test file that needs the DOM starts with the comment `// @vitest-environment jsdom`.

The test files are:

- `tests/db.test.ts`: the IndexedDB functions.
- `tests/id.test.ts`: the id function, including the fallback path.
- `tests/download.test.ts`: the data URL parser, the blob conversion, and the file name rules.
- `tests/gallery-utils.test.ts`: the search rules and the sort rules.
- `tests/gallery-scroll.test.ts`: the paging behavior of the gallery, including the sentinel.
- `tests/app.test.ts`: the full workflow. The test loads records, adds a character, edits a character, and deletes a character.

The `tests/setup.ts` file supplies the test environment. It adds the `fake-indexeddb` module. It also adds small stand-ins for browser interfaces that jsdom does not supply: `matchMedia`, the Web Animations API, and the `<dialog>` methods.

## Security and Safety

The app is client-side only. The app sends no data to a server. The data stays in the browser of the user.

Do not store large images. The base64 image uses more space than the image file. The browser storage has a limit. The app shows an alert when the browser does not accept a write. The app has no import feature, so a record comes from the user or from the local browser profile.

Svelte escapes the name and the description. The text of a character therefore stays text. The app does not insert the values into HTML.

The download function converts the character name to a safe file name. The function removes the reserved Windows names and the control characters.

## Technical Notes

The app targets ES2020. The app uses the strict TypeScript mode. The `tsconfig.json` file includes the `src` folder and the `tests` folder, so the check also covers the tests.

The gallery uses the CSS multi-column layout. A card uses `break-inside-avoid`, so the browser does not split a card between two columns. The app does not calculate positions in JavaScript.

The app starts no list animation at the first rendering. The app animates a list change with the Svelte `animate:flip` directive and a short fade.

The `prefers-reduced-motion` setting stops the movement. The setting does not stop a change of state. A user with the reduced-motion preference therefore still sees the hover label and the download button.

The `generateId` function uses `crypto.randomUUID` when the browser supplies it. The function uses the time and a random value as a fallback for a non-secure context.

The `createdAt` value does not change during an edit. The `newest` sort therefore keeps a stable order after an edit.

## Known Limits

- The app stores the image as a base64 string. A store of full-size character cards uses much memory. A future version can store a blob and a small thumbnail instead.
- The app loads all records into memory at start. The gallery renders 24 cards at a time, but the browser holds every record.
- A card shows no error state when an image does not decode. The card keeps its aspect ratio, so the layout does not move.
- The app has no import or export feature. A user cannot move the library to another browser profile.
