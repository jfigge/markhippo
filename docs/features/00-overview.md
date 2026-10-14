# 00 — Overview: architecture, conventions, plugin API v0

*Companion to `features/markhippo-design-spec.md` and
`features/markhippo-parser-core.md`. This file records what was built for
Milestone 1 and the rules later milestones build on. Phase 2 (edit-pane
highlighting, the code plugin, the plugin list) is in
`01-highlighting.md`, phase 3 (autocomplete) in `02-autocomplete.md`,
phase 4 (themes) in `03-themes.md`, phase 5 (synced scroll, outline,
minimap) in `04-navigation.md`, phase 6 (extensions) in
`05-extensions.md`, phase 7 (images, export) in `06-images-export.md`,
phase 8 (the desktop app, user plugins) in `07-desktop.md`. Writing a
plugin is in `../PLUGINS.md`.*

## Layout

```
src/index.html            the editor page          → hippoherd.com/markhippo/
src/docs/index.html       the user guide           → hippoherd.com/markhippo/docs/
src/js/core/              plugin host + registry   (pure)
src/js/parser/            the parser engine        (pure)
src/js/render/            AST → HTML               (pure)
src/js/highlight/         AST → edit-pane colours, code tokens (pure)
src/js/complete/          autocomplete: context, ranking, snippets (pure)
src/js/themes/            palettes: tokens, Hippo, custom themes (pure)
src/js/nav/               outline, scroll mapping (pure)
src/js/export/            rendered HTML → plain text, RTF, an HTML page (pure)
src/js/images/            where a pasted image goes in the markdown (pure)
src/js/plugins/gfm        tables, task lists, strikethrough, autolinks, tag filter
src/js/plugins/footnotes, math, mermaid
src/vendor/               Temml and Mermaid, loaded on demand (see NOTICE)
src/js/plugins/themes     more palettes: Catppuccin, Grey, High contrast
src/js/plugins/commonmark CommonMark: parsing, HTML, colouring (pure)
src/js/plugins/code       syntax colouring for fenced code     (pure)
src/js/*.js               the page: editor, preview, status bar, app wiring;
                          desktop.js is its side of the desktop app
electron/                 the desktop shell: main.js, preload.js, policy.js (pure)
examples/plugins/         a plugin to copy: ==highlight==
test/                     node --test; the CommonMark spec suite in test/fixtures/commonmark/
```

**Pure** modules have no DOM. The ESLint config gives them only ES globals, so
they run under `node --test` and, later, in a worker or in the Electron main
process unchanged.

## Conventions

These are copied from JsonHippo and Rest Hippo:

- Plain HTML, CSS and vanilla ES modules. There is no bundler, no framework
  and no runtime dependency. `make dist` is a copy.
- `make` is the entry point. `make check` runs lint, html-validate and tests,
  and must pass before `make site`.
- Class names use the `mh-` prefix, with `block--modifier` for states. Use the
  CSS variables in `app.css` and never hard-code a colour.
- Widgets report to their parent through constructor callbacks, for example
  `new EditorView(el, { onChange })`.
- localStorage keys use the `markhippo.` prefix (`markhippo.theme`,
  `markhippo.document`, …).
- The page's CSP allows no inline script. Inline styles are allowed only
  because Mermaid's diagrams need them; the preview strips a document's own
  (phase 6). Raw HTML in a document is rendered, but nothing in it can run. The preview also builds its HTML in an
  inert `<template>` first and removes what the CSP cannot stop — `meta`
  (a refresh would navigate away), `base`, `link`, `form`, scripts, frames —
  and clears unsafe URLs from raw HTML's attributes (`preview-view.js`).

## The AST

`parse(text)` returns plain data:

```js
{ type, pos: { start, end }, children?, ...fields }
// start/end: { line, column, offset }. line and column are 1-based (UTF-16
// columns, as editors count), offset is 0-based. `end` is exclusive, so
// source.slice(pos.start.offset, pos.end.offset) is exactly the node.
```

The document node also carries `refs` (normalized label → `{ destination,
title }`) and `source`.

| Node | Fields |
|---|---|
| `heading` | `level`, `setext` |
| `paragraph`, `block_quote`, `item`, `thematic_break` | — |
| `list` | `ordered`, `start`, `delimiter`, `bullet`, `tight` |
| `code_block` | `fenced`, `info`, `literal`; fenced only: `fence`, `closed` |
| `html_block` | `literal`, `htmlType` (1–7) |
| `link_reference_definition` | `label`, `destination`, `title` |
| `text`, `code`, `html_inline` | `literal` |
| `emph`, `strong`, `softbreak`, `linebreak` | — |
| `link`, `image` | `destination`, `title`; autolinks also have `autolink: true` |

Definitions stay in the tree, where the outline and the highlighter can see
them, but they render as nothing.

The inline position rules:

- A soft or hard break covers its line ending, and for a hard break the
  trailing spaces too.
- An inline node inside a container maps past the container's markers to the
  exact characters it came from.

## Parsing

The parser runs in two phases, as CommonMark prescribes:

1. `parser/blocks.js` builds the block structure for the whole document.
2. `parser/inlines.js` parses the inline content of each leaf block.

It passes all 652 examples of the CommonMark 0.31.2 spec, matching the
reference HTML byte for byte (`make spec-report`).

**Incremental reparse** (`parser/incremental.js`): only the top-level blocks
around an edit are reparsed, and the result is spliced in. It falls back to a
full parse when the result could differ from one:

- the document is small (under 1000 lines);
- link definitions changed;
- an edge block reparsed differently.

`test/incremental.test.js` fuzzes this against full parses.

Every node's span covers exactly its own source. A paragraph or setext
heading that began with link reference definitions starts after them (the
definitions are its preceding siblings), and a list item that ends with a
definition ends after it — though, as the spec requires, that definition
does not make the list loose.

**Implementation limits** guard against hostile input:

- Containers nest at most 100 deep; past that, a marker is text.
- Emphasis, links and images nest at most 64 deep.

## Plugin API v0

```js
export default {
  id: "my-plugin",
  setup(api) {
    api.blockRule({ type, start | starts, priority, triggers, continue, finalize,
                    canContain, acceptsLines, inlineContent?, onlyInside?, lineAdded? });
    api.inlineRule({ name, triggers: "@", priority?, parse(state) });
    api.delimiter({ char, use(opener, closer), nodeType(use), matches?, intraword?, ruleOf3? });
    api.renderer(type, (node, r) => { … });
    api.fenceRenderer("mermaid", (node, r, lang) => { … });
    api.language({ id, name?, aliases?, tokenize(code) });
    api.highlighter(type, (node, h) => { … });
    api.completions({ context, provide(ctx) });
    api.theme({ id, name, light: { "--bg": "#…", … }, dark: { … } });
    api.inlineFinisher((state, block) => { … });
    api.enhancer({ selector, run(elements, context) { … } });
  },
};
```

- **Block rules** follow the CommonMark appendix's parsing strategy:
  - `start` answers 0 (no match), 1 (it opened a container) or 2 (it opened a
    leaf).
  - `continue` answers 0 (the line matched), 1 (it did not) or 2 (the line was
    consumed whole).
  - Registering a type again replaces the earlier rule; that is how the
    CommonMark plugin's paragraph replaces the engine's bare one.
  - The parser state handed to `start` and `continue` is the block parser
    itself. Its methods are documented in `parser/blocks.js`.
- **Inline rules** are tried when the scanner reaches one of their trigger
  characters. They append nodes with `state.add(node, from, to)` or
  `state.text(literal, from, to)` and advance `state.pos`.
- **Delimiters** join the shared delimiter stack and the spec's "process
  emphasis" procedure.
- **Renderers** write through the HTML renderer (`r.tag`, `r.out`, `r.lit`,
  `r.cr`, `r.children`, `r.attrs`). See `render/html.js`.
- **Languages** and **highlighters** are described in `01-highlighting.md`.
- **Completion providers** feed the autocomplete popup; see
  `02-autocomplete.md`.
- **Themes** are named palettes with a light and a dark mode; see
  `03-themes.md`.
- **Inline finishers** and **enhancers** are described in `05-extensions.md`.

The core registers only `document`, `paragraph` and text. With no plugins,
everything is plain paragraphs. CommonMark (`plugins/commonmark/`) is
installed through this API and nothing else, and `test/plugins.test.js`
checks that, along with a toy third-party plugin.

## Not yet

- Word (`.docx`) export, on the back burner as the design has it.
- A choice of folder for pasted pictures in the desktop app.
