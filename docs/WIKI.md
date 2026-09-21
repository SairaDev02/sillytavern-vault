# Character Gallery — Project Wiki

> This document describes the `character-gallery` codebase. It follows ASD-STE100 Issue 9 writing rules for clarity.

## Overview

The Character Gallery app stores character cards in the browser. Each card holds a name, a description, and a base64 image. The app stores all data in IndexedDB. The data stays in the browser. The app clears the data when you clear the browser data.

The app is a single page. The page shows a gallery grid. The page shows a form to add or edit a character.

## Technology Stack

The project uses these technologies:

- Vite 6.0.0 as the development server and build tool.
- TypeScript 5.6.0 with strict mode for type checking.
- IndexedDB as the client-side storage.
- Plain HTML and CSS for the user interface.

The app has no backend server. The app has no third-party runtime dependencies. The only dependencies are build tools.

## Project Structure

The source files are in the `src` folder. The static assets are in the `public` folder. The main page is `index.html`.

```text
index.html          HTML entry page
vite.config.ts      Vite build configuration
tsconfig.json       TypeScript compiler configuration
src/main.ts         Application logic and IndexedDB access
src/style.css       Style rules and color theme
public/vite.svg     Site icon
package.json        Project manifest and scripts
```

All application logic lives in `src/main.ts`. The app builds the user interface in code. The app does not use a template file.

## Data Model

The app stores the `Character` type. The `Character` type has these fields:

- `id`: string. The unique key. The app uses this value as the IndexedDB key path.
- `name`: string. The character name. The name is required.
- `description`: string. The character description. The description is optional.
- `image`: string. The base64 data URL of the image. The image is required for new characters.
- `createdAt`: number. The creation time in milliseconds.

The IndexedDB database name is `character-gallery`. The database version is 1. The object store name is `characters`. The store has one index on the `name` field. The `name` index is not unique.

## Architecture

The app runs one initialization function. The `init` function runs when the page loads. The `init` function builds the user interface. The `init` function opens the database. The `init` function loads existing characters. The `init` function renders the gallery.

The app uses these functions:

- `openDB`: opens the IndexedDB database. The function creates the object store on first use.
- `dbAdd`: saves a new character.
- `dbDelete`: removes a character by id.
- `dbGetAll`: loads all characters.
- `renderGallery`: draws the gallery grid. The function attaches edit and delete listeners.
- `showForm`: shows the add or edit form.
- `hideForm`: hides the form. The function shows the gallery.
- `startEdit`: fills the form with an existing character.
- `handleSubmit`: saves the form. The function adds or updates a character.
- `handleImageSelect`: shows an image preview when you pick a file.
- `fileToBase64`: converts a file to a base64 data URL.
- `generateId`: creates a unique id.

The app keeps this module-level state:

- `db`: the open database.
- `characters`: the loaded character list.
- `editingId`: the id of the character in edit mode.

## Features

The app provides these features:

- Add a character with a name, a description, and an image.
- Edit an existing character.
- Delete a character.
- Preview the selected image before you save.
- Persist all data in IndexedDB.
- Show an empty state when no characters exist.

## Getting Started

Follow these steps to run the app.

1. Install the dependencies. Run `npm install`.
2. Start the development server. Run `npm run dev`.
3. Open the printed URL in a browser.
4. Click the `+ Add Character` button.
5. Fill in the name and image.
6. Click `Save`.

Follow these steps to build the app.

1. Run `npm run build`.
2. Find the output in the `dist` folder.
3. Run `npm run preview` to serve the built app.

## Security and Safety

The app shows browser alerts for errors. The app uses `confirm` before it deletes a character. The app shows images as inline data URLs.

Do not store large images. The base64 image stores in IndexedDB. Large images use storage space. The app has no input sanitization. The app inserts the name and description into HTML. The app inserts the user name and description into innerHTML. Do not store untrusted input in a deployed app.

## Technical Notes

The app targets ES2020. The app uses strict TypeScript mode. The build runs `tsc && vite build`.

The `generateId` function uses the current time and a random value. The `substr` call has no strict-type error, but the modern form is `substring`.

The app reuses the single form for add and edit. The `editingId` value decides the mode. The `handleSubmit` function adds a character or updates an existing one.

## Build Commands

The `package.json` file defines these scripts:

- `dev`: start the Vite development server.
- `build`: run the type checker, then build the app.
- `preview`: serve the production build.
