# 04 — Navigation: synced scroll, outline, minimap (phase 5)

*Phase 5 of the roadmap in `features/markhippo-design-spec.md` (§7). All
three come from the parser's structural data, which is why the spec
groups them.*

## What the user sees

Three toggles in the status bar (bottom right) switch the features on and
off. The choice is remembered as `markhippo.view` =
`{ outline, minimap, sync }`; synced scroll is on by default, the other two
off.

- **Sync scroll.** Scrolling either pane scrolls the other to the same
  place. A heading in the editor lines up with the heading in the preview,
  even though one is a single line and the other a large block.
- **Outline.** A panel on the left lists the headings, indented by level.
  - The section at the top of the editor is marked (`aria-current`).
  - Choosing a heading puts the editor's caret on its line, scrolled near
    the top, and the preview on the heading.
  - When the document has no headings, the panel says how to add one.
  - It is hidden on narrow screens.
- **Minimap.** A strip beside the editor draws the whole document in
  miniature.
  - Each line's words appear as short bars in the colours the parser gave
    them.
  - A band marks the part in view.
  - Clicking or dragging on the strip scrolls there.

Headings in the preview now have **ids**, using GitHub's scheme
(`Hello, World!` becomes `#hello-world`, repeats get `-1`, `-2`), so
`[see below](#hello-world)` works. Typing `](#` suggests the document's
headings by id, with a new autocomplete context, `link-anchor`.

## How it works

```
src/js/render/slug.js     PURE  plainText(node), slugify, slugger()
src/js/nav/outline.js     PURE  outline(ast) → [{ level, text, id, line, offset }], sectionAt(items, line)
src/js/nav/scroll-map.js  PURE  scrollMap(pairs, aEnd, bEnd) → { forward, backward }
src/js/scroll-sync.js     DOM   the two panes, anchors, feedback-free syncing
src/js/outline-view.js    DOM   the panel
src/js/minimap.js         DOM   the canvas
```

**Heading ids.**
- The renderer has a new option, `headingIds`. It is on in the app and off
  by default, so the spec suite's HTML is unchanged.
- The renderer and `outline()` both use a fresh `slugger()` over the same
  headings in the same order, so an outline entry's id is always the
  preview's.

**Synced scroll.** The edit pane and the preview are laid out differently,
so a scroll position cannot be copied across; it is mapped through anchors.

- **Anchors:**
  - Every preview element the renderer marked with its source line is
    paired with that line's top in the editor (the overlay's line element).
    The app names the mark attribute afresh each session
    (`data-line-<random>`, the renderer's `sourceLines` option given a
    string), so raw HTML in a document cannot plant anchors that would
    derail the mapping.
  - `scrollMap` drops pairs that would run backwards in either view, such
    as a paragraph inside a list item.
  - It adds the two tops and the two bottoms as anchors, and interpolates
    linearly between anchors.
- **Measuring is lazy.**
  - Anchors are marked stale after a parse, a render or a resize (via a
    `ResizeObserver`).
  - They are measured on the next scroll: one layout read per preview
    element.
  - A scroll itself then costs a binary search.
- **No feedback loop.** Setting a pane's `scrollTop` fires that pane's
  scroll event. The position the browser settled on is remembered, and the
  event that reports it is not synced back.

**Outline.**
- Rebuilt on each parse (the 150 ms highlight pause), but its DOM is
  replaced only when the headings actually changed.
- The section marked is the one at the editor's top. It is found with a
  binary search over the overlay's line elements (`EditorView.lineAt`) and
  over the headings (`sectionAt`).

**Minimap.**
- Draws from the edit pane's own per-line segments (`SourceHighlight.lines`),
  so it shows exactly the colours the editor does.
- Each class maps to a theme token: the code tokens, then markdown code,
  markup (muted), headings/quotes/lists (accent), links, HTML, and so on.
- Lines are at most 3 px tall, and less when the document would not fit,
  so it always shows the whole document.
- The text is drawn into an offscreen canvas only after a parse, a resize
  or a theme change. Scrolling redraws only the band, in a
  `requestAnimationFrame`.
- It is a pointer affordance and is `aria-hidden`; the outline is the
  keyboard's route around the document.

## Layout

- `main` became a flex row: the outline panel, then the `mh-panes` grid
  (source, divider, preview) as before.
- The source pane is a flex row: the editor's scroller
  (`mh-source-scroll`), then the minimap canvas.
- The panes keep `contain: strict` and the fixed grid row from phase 2, so
  editing a long document still lays out only its own line.
- The status bar's live region is now only the parse status. The cursor
  position and toggles are not announced on every change.

## Fixes from reviewing phase 4

**Themes dialog**
- The Light/Dark tabs follow the ARIA tabs pattern: arrows, Home and End
  move between them.
- Focus stays on the chosen palette after choosing, deleting or importing.
- Committing a hex value no longer rebuilds the grid under the focused
  field.
- An armed Delete is disarmed by New, Duplicate or Import.
- An emptied name field reverts.
- Closing the dialog restores the user's mode on cancel and Done as well as
  on `close`, which a background tab delivers late.

**Colours**
- `--crust` (minimap) and `--surface-2` (button hover borders) are now used
  by the stylesheets, and a test keeps every token in use.
- Contrast is checked against both backgrounds a colour is read on. Code
  colours sit on `--code-bg` in the preview and `--bg` in the editor, and
  the badge shows the worse.
  - That caught Catppuccin Latte's markdown-code teal, which was 4.31:1 on
    Mantle and is now deepened to 4.67:1.

**Storage and import**
- The first-paint colour cache is written during previews too, so a reload
  with the dialog open shows the latest edit.
- A theme file with no valid colour is rejected with a message instead of
  importing as a copy of Hippo.

**Autocomplete**
- A dismissed fence-language list stays dismissed when spaces follow the
  fence. The suggestion now starts right after the fence.

## Tests

`test/navigation.test.js` covers:

- slugs and their de-duplication;
- plain text of headings;
- heading ids rendered only when asked for;
- the outline, with ids matching the preview's;
- `sectionAt`;
- scroll-map interpolation, end anchors and backwards anchors;
- `](#` suggestions.

Checked by hand in Chrome on a 700-line document:

- the outline jumps both panes and marks the current section;
- wheel scrolling in either pane drives the other;
- the minimap draws the document in the theme's colours;
- dialog tabs work from the keyboard;
- focus is kept on the chosen palette;
- ```` ``` ```` then Tab twice indents without reopening the list.
