# 06 — Images and export (phase 7)

*Phase 7 of the roadmap in `features/markhippo-design-spec.md`: image
handling (§4.4) and export, print and copy (§8).*

## Images

Paste a picture into the editor, or drop image files on it, and it goes
into the document.

- **Where it goes.** The design left this open for the web, which has no
  folder beside the document. It is now decided: the image goes in the
  document itself, as a data: URL, in a reference definition at the end.
  ```
  The login screen: ![login screen][image-1]
  …

  [image-1]: data:image/png;base64,iVBORw0KGgo…
  ```
  - The prose stays readable, and the saved `.md` is one self-contained
    file that any CommonMark reader shows the same way.
  - Labels are `image-N`, one past the highest the text defines
    (`images/embed.js`, pure).
  - The definitions collect at the end, a blank line after the text, with
    a line break between each.
  - A caret inside the definitions puts the image just before them, as a
    paragraph of its own.
  - Before inserting, the result is parsed to check that the definition
    is defined. Something left open at the end, such as an unclosed fence
    or an HTML block, would swallow it; then the URL goes inline instead.
  - The desktop app (phase 8) will keep images in a folder beside the
    document, as the design intends.
- **Where in the text.** A paste goes at the caret, replacing the
  selection. A drop goes where it lands on the editor
  (`SourceHighlight.offsetAt`, the inverse of `caretRect`: the line under
  the point, then a binary search along it), or at the caret when dropped
  anywhere else. A single image's alt text is left selected, to type a
  description over.
- **What is pasted.** A clipboard holding any `text/plain` pastes its
  text, as before. A spreadsheet's cells come with a picture of them, and
  the cells are what is wanted.
- **Sizes and formats** (`image-import.js`):
  - PNG, JPEG, GIF and WebP up to 1600 × 3200 px and 1.5 MB go in byte for
    byte.
  - Larger images are scaled to fit. 1600 px is the widest the preview
    shows an image even at 2×. They are re-encoded as PNG (JPEG stays
    JPEG), or as JPEG when an opaque PNG would still be over 1.5 MB. If
    converting saves nothing, the original is kept.
  - Other formats the browser can decode (SVG, AVIF, BMP; HEIC and TIFF on
    a Mac) are converted the same way. The renderer only allows the four
    formats above as data: URLs, and an SVG could carry script.
  - GIFs are never re-encoded, so they keep their animation.
  - A file the browser cannot decode is refused with a note in the status
    bar.
- **Undo.** Each image is two edits: the definition appended, then the
  reference. Both go through `execCommand("insertText")`, so they undo
  natively.
- **Storage.** The document is kept in localStorage, which holds a few
  megabytes. When a save fails, the status bar warns *"Too big to keep in
  this browser: Save to keep a copy"* until a later save succeeds.
  Before this, a failed save was silent, and a reload brought back the last
  version that fitted. `storage.set` now reports whether it kept the
  value.

## Export

**Export** in the header is a menu button (`menu-button.js`, the ARIA
menu-button pattern: arrows, Home and End, letter keys, Escape back to the
button). It offers:

| Item | Output | Made from |
|---|---|---|
| Print or save as PDF… (Ctrl/⌘+P) | the print dialog | finished HTML, in the print area |
| HTML page | one `.html` file | finished HTML + styles |
| Rich text | `.rtf` | the HTML as rendered (`export/rtf.js`) |
| Plain text | `.txt` | the HTML as rendered (`export/text.js`) |
| Copy as rich text | `text/html` + `text/plain` on the clipboard | finished HTML, and the plain text |

- **One pipeline** (`exporter.js`):
  - Every export starts from the renderer's HTML. It has no source lines
    or live checkboxes, and is sanitized as the preview's is.
  - *Finished* exports wait for the plugins' enhancers (math to MathML,
    diagrams to SVG). They work in a hidden stage in the page, because
    Mermaid and the enhancers need the elements connected.
  - Exports are always in the light theme, in the light colours of the
    palette in use: paper is white.
- **The converters read HTML, not the AST.** Plain text and RTF read the
  rendered HTML (`export/tree.js` is the slice of the DOM they use), so any
  plugin's syntax exports with no extra work from the plugin. They are pure
  and run under node on `test/mini-dom.js`.
- **Plain text.**
  - Headings: levels 1–2 underlined.
  - Lists: `•` and numbers, on a hanging indent.
  - `>` quotes, and code indented four spaces.
  - Tables in aligned columns.
  - Links: `text (url)` unless the text is the address.
  - `[Image: alt]` for images, `$TeX$` for math, and `[n]` footnotes listed
    after a rule.
- **RTF.** Only what Pages, Word, TextEdit and LibreOffice all read:
  - Paragraph indents, spacing and borders: quotes get a left rule, code a
    shaded paragraph.
  - Hyperlink fields, and `\outlinelevel` on headings.
  - Simple tables, with the head row repeated on each page.
  - PNG and JPEG pictures. The size comes from the image's own header, and
    the picture is scaled to the page.
  - Lists are drawn as marker + tab on a hanging indent, not RTF list
    tables, which readers disagree on.
  - Everything outside ASCII is `\uN?`.
- **HTML page.** One file:
  - `preview.css`, `syntax.css` and the enhancers' stylesheets, with Temml's
    font inlined as a data: URL.
  - The palette's light colours on `:root`, and `data-theme="light"` so the
    stylesheets' dark defaults stay off.
  - A Content-Security-Policy with `default-src 'none'` and no
    `script-src`. The page holds the document's raw HTML and will be opened
    from disk, where no app stands between it and a script.
  - The `@media print` rules that hide the app's chrome moved from
    `preview.css` to `app.css`, because exported pages carry `preview.css`.
- **Print.**
  - The page is never printed as it stands. The document goes into
    `#mh-print`, the light colours are set on it, and the print stylesheet
    shows it alone.
  - `document.title` becomes the document's title while printing, which
    names the PDF.
  - Printing from the browser's own menu (not Ctrl/⌘+P, which is caught)
    gets a copy of the preview as it is, from `beforeprint`. There is no
    time there to redraw diagrams in the light theme.
- **Copy.** Uses `navigator.clipboard.write` with the HTML as a promise:
  - the write starts inside the click, as Safari requires, while the
    enhancers finish;
  - without `ClipboardItem` it falls back to a `copy` event carrying the
    HTML as rendered.
- **Title** (for the page, the RTF and the PDF): the first level-1
  heading, else the first heading, else the file name.

## New plugin seams

- **`stylesheet` on an enhancer** (`api.enhancer({ selector, run,
  stylesheet })`): the URL of the CSS the finished elements need. Exported
  HTML carries it, for every enhancer whose selector matched. The math
  plugin declares Temml's.
- **`enhance()` returns a promise** that settles when every enhancer has
  finished. The preview ignores it; exports wait for it.
- **Mermaid draws one call at a time.** Mermaid has a single configuration,
  and the theme is part of it, so a light export and a dark preview must not
  interleave.
  - Diagrams already in the cache are placed at once, so typing still does
    not flicker.
  - Only uncached diagrams queue to be drawn. Each queued run sets the
    theme it needs just before drawing.
  - This replaces the phase 6 review's fix below, which stopped an older
    call when a newer one switched the theme. That would have cut an
    export short whenever the preview redrew in the other mode.

## Fixes from reviewing phase 6

**Rendering**
- Bare-URL autolinks were skipped for a whole text run if it held any
  backslash escape or entity, because its literal no longer matched its
  source. The run is now split into stretches that match, each searched
  with exact offsets.
- Inline math and footnote references wrote tags with `r.lit` inside image
  alt text, which breaks the `alt` attribute. In alt text they are now
  their text: the TeX, and `[^label]`.
- Footnotes were numbered in tree order, so a reference inside a
  definition placed before the text took the first number. They are now
  numbered in rendering order: the text first, then each numbered note's
  own references.
- Backrefs were counted while rendering, so a note cited again from a
  later note lost a backref. They are now counted in the same pass as the
  numbering.

**The app**
- A task checkbox clicked before the debounced preview caught up used a
  stale source offset, and could tick the wrong box. The preview now
  records which text it shows. If the editor has moved on, the click
  re-renders instead of editing.
- The first Temml load was not shared, so concurrent renders added the
  stylesheet more than once. One shared promise now loads it, and is
  retried after a failure.
- Mermaid: diagrams no longer in the page are not drawn. The figure keeps
  every attribute but `class`, not only those starting `data-line`, so
  synced scroll survives a renamed line attribute. The theme race is now
  handled by the queue above.

**Tidying**
- `make gfm-fixtures` looped forever on an unterminated example. It now
  fails, naming the example.
- Strikethrough's highlighter was a copy of CommonMark's `wrapped`, which
  is now exported and shared.
- A garbled sentence in `render/html.js`'s option list (`sourceLines`) is
  rewritten.

## Tests

`test/export.test.js` covers:

- plain text for a document using every extension, pinned in full;
- loose lists and empty documents;
- when a link reads as its address;
- RTF:
  - well-formed groups and ASCII only;
  - the formatting, hyperlink fields and list indents;
  - quotes, code and a table's rows and cells;
  - Unicode and surrogates, and escapes;
  - PNG and JPEG pictures sized from their headers, scaled to the page,
    with other formats falling back to alt text;
- base64;
- the HTML page's CSP, title escaping, a `</style>` in CSS, and unsafe
  custom properties dropped;
- image labels, alt text from file names, and the trailing definitions;
- placing images: first, next, inside the definitions, over a selection,
  in an empty document, and inline when a fence would swallow the
  definition.

`test/gfm.test.js` adds regression tests for the review's rendering
fixes: autolinks beside escapes and entities, alt text, footnote order and
backrefs.

Checked by hand in Chrome:

- the Export menu by pointer and keyboard;
- the HTML page:
  - opened on its own: light colours with the app in dark mode;
  - MathML with Temml's font, the diagram in Mermaid's light theme;
  - no app attributes, no console errors;
- RTF and plain text downloads;
- print, with the browser's dialog stubbed:
  - the print area filled with light colours over a dark page;
  - the title set, then restored, and the area emptied afterwards;
- copy writes `text/html` and `text/plain`;
- images:
  - a pasted PNG lands at the caret with its alt text selected;
  - a 3000 × 2000 PNG dropped on a word lands before that word and comes
    out 1600 × 1067;
  - two undos remove an image completely;
  - text-with-picture clipboards paste text;
  - an unreadable file is refused with a note;
  - a full localStorage raises the warning, and it clears when saving works
    again;
- switching mode redraws diagrams in each theme, including during an
  export.

## Limits

- **RTF and plain text:** a diagram is its Mermaid source, and math is
  its TeX. RTF carries PNG and JPEG pictures only; WebP and GIF become
  their alt text.
- **Printing from the browser's menu:** in dark mode, diagrams print in
  the dark theme. Use Export or Ctrl/⌘+P for light ones.
- **Copy as rich text:** the pasted SVG diagrams and MathML show only where
  the target application supports them; most email clients do not.
- **Word (.docx):** export stays on the back burner, as planned.
