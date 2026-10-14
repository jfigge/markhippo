# 07 — The desktop app, your own plugins, the hero page (phase 8)

*Phase 8 of the roadmap in `features/markhippo-design-spec.md`: the
Electron shell with user-installable plugins (§1, §2.2), the desktop's
answer to where images go (§4.4), and the hero page and docs.*

## The shell (`electron/`)

The shell is JsonHippo's arrangement, so the herd builds, signs and ships
every app the same way:

- **Its own `package.json`.** Electron 42 and electron-builder 26 are
  installed only by the desktop targets, never by `make check`.
- **The six installers.** `.dmg`, NSIS `.exe` and AppImage, each for arm64
  and x64, built by `make dist-mac`, `dist-win` and `dist-linux`.
- **The same Release workflow** (`.github/workflows/release.yml`): it
  publishes a GitHub Release the first time `main` is pushed with a new
  version, once the macOS signing secrets are set.
- **`release.env`.** Signing credentials are read from it as in JsonHippo
  and Rest Hippo, so `RELEASE_ENV=../resthippo/release.env` works.
- **Icons** (`make icons`) are drawn from `src/img/markhippo.svg` and a
  macOS variant on Apple's safe-area grid.

The app is the web page, unchanged; `make desktop-setup` stages `dist/` as
`web/`. Unlike JsonHippo, the page is not loaded from `file://`. It is
served on a scheme of its own, `app://markhippo/` (`protocol.handle`,
privileged as standard and secure), which gives it a real origin:

- the CSP's `'self'` means the app;
- `fetch()` works, so the HTML export can read its stylesheets;
- module imports and `localStorage` behave as on the web.

`electron/policy.js` (pure, under `node --test`) decides what that scheme
serves. Besides the app's own files, it maps two directories:

| Path | Serves | Limits |
|---|---|---|
| `/@plugins/…` | the user's plugins folder (`userData/plugins`), so a plugin is `'self'` to the CSP as the bundled ones are | scripts, stylesheets, JSON, fonts and images only, and never outside the folder |
| `/@doc/<ref>` | an image the open document refers to | `<ref>` is the image's address as the document wrote it, percent-encoded into one segment by the page (`src/js/desktop.js`), and resolved against the document's folder; only image files are ever served, from wherever the address leads |

Encoding the address as one segment keeps `../shared/logo.png` intact.
Otherwise the page's own URL would collapse the dots before the shell
saw them.

**Locked down**, as JsonHippo is:

- **Sandboxed renderer.** Context isolation is on and Node is off.
- **A small bridge.** The preload (`electron/preload.js`) exposes a dozen
  named calls as `window.markhippoDesktop`, and `main.js` rejects any call
  that does not come from the editor's window.
- **Network.** Every request leaves only if it is for an image or media a
  document shows. Fetches, scripts and sockets are cancelled, the page's and
  plugins' alike.
- **Permissions.** Only the clipboard write that Copy as rich text needs is
  granted.
- **Navigation.** Links open in the system browser. The bundled user guide
  opens in a window of its own; navigating to it would otherwise strand the
  editor. Nothing else navigates.

## The page in the desktop app (`src/js/desktop.js`)

The page finds the bridge, or `null` in a browser, where everything works as
before. The headless check in Chrome confirms it: no PDF item, no plugins
folder, no version line, and no console errors.

**Files**
- **Open and save.** The shell does both, with the system's dialogs:
  - `New`, `Open…`, `Save` (in place) and `Save As…` come from the menu,
    the header buttons, or ⌘N, ⌘O, ⌘S and ⇧⌘S.
  - Dropping a `.md` file on the window opens it in place (its path comes
    from `webUtils.getPathForFile`), so Save writes it back.
- **Opening from outside.** Finder or Explorer (`fileAssociations`; macOS
  `open-file`), the dock icon, the command line, or a second launch, which
  hands its file to the first.
- **Unsaved changes.**
  - The page tells the shell whenever the text stops or starts matching
    the last saved text.
  - The shell shows it in the title: macOS's edited dot and represented
    file, a `•` elsewhere.
  - Closing, quitting, New and Open ask *Save / Don't Save / Cancel*. On
    Save, the page saves and answers whether it did (Save As can be
    cancelled). On Don't Save, the browser's copy goes back to the saved
    text.
- **Next launch.** The last session's file is reopened from disk. An
  untitled document comes back from the browser's storage, as on the web.
  A reload keeps the document and knows what was saved.

**Images** — the design's plan for the desktop:
- In a saved document, a pasted or dropped picture is written to
  `assets/` beside it and linked by its relative path:
  `![login screen](assets/login-screen.png)`.
  - Names are tidied, and numbered rather than overwritten
    (`policy.assetName`).
  - Formats the page can show go in byte for byte. HEIC or TIFF is
    converted first.
- An untitled document embeds the picture as on the web, and says once
  that saving it would put pictures beside it instead.
- The preview shows a document's own images, existing or new, through
  `/@doc/`. The rewrite happens after sanitizing (`PreviewView`'s new
  `rewrite` option), so exports still carry the paths the document wrote.

**Exports**
- **Saved, not downloaded.** Every download goes through a Save dialog,
  opening in the document's folder. That covers the theme editor's
  Export too.
- **PDF.** Export → PDF uses `webContents.printToPDF`: the print area is
  filled as for printing, and `Exporter.pdf()` wraps it. Print goes
  through the shell's print dialog.
- **The document's own images** are fetched through `/@doc/` and put inside
  the HTML page, the RTF, the PDF and the copy as data: URLs, so the
  export reads anywhere (`Exporter`'s `localImages`).
- **Copy as rich text** uses Electron's clipboard. A menu command reaches
  the page with no click of its own, which the web clipboard API would
  refuse.

**The rest**
- **Menu bar:**
  - File: New, Open, Open Recent (macOS), Save, Save As, Export ▸, Print.
  - View: Outline, Minimap, Sync Scroll, Themes, plus zoom and full
    screen.
  - Plugins: Show, Open Folder, Reload, Writing a Plugin.
  - Help: the guide, the web app, the hero page, the source, Support.
- **Shortcuts.** The page's own shortcuts step aside, so each runs once.
- **About.** The About dialog shows the version.

## Your own plugins

- **What counts as a plugin.** Each `.js` or `.mjs` file in the plugins
  folder, and each folder holding an `index.js` or `index.mjs`, is
  imported as the page starts (`loadUserPlugins`). The bundled plugins
  are installed first, then the user's.
- **A plugin that fails** stays out, with its reason in the Plugins list:
  - it will not import;
  - it does not export `{ id, setup }`;
  - it throws in `setup`;
  - its id is taken.
- **The host can skip a plugin.** `createMarkHippo` takes an
  `onError(plugin, err)` and goes on without the plugin. A plugin that
  fails part-way may have registered some rules, so the app builds the
  host again without it, from a clean registry.
- **The Plugins list.** User plugins are marked *Yours* and show their
  file. *Open plugins folder* and *Reload plugins* appear in the desktop
  app only.
- **The example.** `examples/plugins/highlight.js` adds `==highlight==`:
  a delimiter, a renderer, a highlighter and a suggestion, and no
  imports.
- **The guide.** `docs/PLUGINS.md` walks through the example and the rest
  of the API, and the user guide's "Your own plugins" section covers
  installing.

## The hero page

hippoherd.com/markhippo/about/ is written by hippoherd's generator from
MarkHippo's entry in its `content/hippos.mjs`. That entry now describes
what phases 6 to 8 added, and its mark copies the new logo's path (see
the summary of changes for what was done there, and what waits for the
first release).

## Fixes from reviewing phase 7

**Rendering and export**
- **The same diagram on the page twice** (the preview, and a light-mode
  print or export from the same cache) had the same SVG ids. Its markers
  (`marker-end="url(#mh-mermaid-3_…)"`) could find the copy hidden while
  printing, and print without arrowheads. Each placed copy now renames the
  ids Mermaid gave it, which all begin with its own.
- **Image labels.** `nextImageLabel` matched only lowercase `[image-N]`,
  but labels ignore case. A document defining `[Image-1]` got a duplicate.
- **HTML export** rendered and sanitized the document twice, and fetched
  its stylesheets only after the enhancers finished. It now renders once,
  and fetches while they work.

**The app**
- **Pasting while typing.** A picture pasted while typing above the caret
  went in at the old offset. If the text changed while the image was
  read, it now goes at the current caret.
- **Task clicks after a theme change.** The theme-change re-render did not
  record which text it showed, so the stale-task-click guard compared
  against the wrong text.
- **Status notes.** A lasting warning (storage full) replaced a note still
  being shown. It now waits for the note's few seconds.
- **Saving to the browser** wrote the whole document to localStorage
  synchronously after every short pause in typing. With pictures inside,
  that is megabytes each time.
  - It is now debounced on its own, at 2 s, and skipped when nothing
    changed.
  - It is flushed on leaving and when the page is hidden.

**Tidying**
- The exporter's copy of the FileReader helper is gone: `image-import.js`
  exports the one.
- An unused `isElement` is gone from `export/tree.js`.

## Tests

`test/desktop.test.js` covers:

- where each window may go;
- what the scheme serves:
  - the app's files and their types;
  - traversal by dots and by escaped slashes;
  - the plugins folder's limits;
  - the document's images, round-tripped from the page's address to the
    shell's file, including spaces, `../`, absolute paths, queries and
    non-images;
- the launch's document from argv;
- asset names;
- titles and dialog filters;
- loading user plugins, including ones that are not plugins, are missing,
  or sit in an unreadable folder;
- the host's `onError`;
- the example plugin's rendering, colours and suggestion;
- the packaging config: the six installers, no publishing, the stamped
  version, file associations, and every file `main.js` loads.

**`make desktop-smoke`** (`scripts/desktop-smoke.mjs`) runs the real app
end to end. It runs the shell on `src/` in a throwaway profile, with the
example plugin and two broken ones installed and a document on the
command line. It drives the page over the DevTools protocol, with Node's
WebSocket and no framework. Dialogs answer themselves through a
development-only knob, and it saves before quitting. It checks 22 things:

- the origin and the bridge;
- the document from argv;
- the user's plugin rendering, and the broken ones listed with their
  reasons;
- the document's image served from beside it;
- `fetch()` refused;
- Save in place;
- a pasted picture written to `assets/`, linked by its relative path and
  shown;
- HTML, RTF, text and PDF exports, with the pictures inside them;
- the print area emptied afterwards;
- the guide's own window;
- a reload keeping the document.

All pass. It never prints or copies, which would open the system's dialog
or replace your clipboard.

`make desktop-pack` builds an unsigned macOS app. Checked by hand:

- its `Info.plist` declares the markdown document types;
- the asar holds the shell and `web/`;
- launched, it serves the page from the asar with math and Mermaid
  working, and shows version 0.1.0.

## Limits

- **Assets folder.** Pictures always go in `assets/`. Typora lets you
  choose, and so should this, later. A document moved with Save As leaves
  its pictures where they were.
- **Absolute image paths** are POSIX paths. A Windows drive path in a
  document (`C:\…`) is taken for a URL scheme and not served.
- **Untested here:**
  - Windows and Linux builds, and the Release workflow (it is JsonHippo's,
    renamed), which need their runners.
  - Signing, which needs the herd's certificates.
  - The close prompt, which is a native dialog.
- **One window, one document**, as in JsonHippo.
