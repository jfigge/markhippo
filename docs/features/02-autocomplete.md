# 02 — Context-aware autocomplete and slash commands (phase 3)

*Phase 3 of the roadmap in `features/markhippo-design-spec.md` (§4.3): a
popup at the cursor that offers what makes sense where the cursor is, fed by
plugins, and faster than the debounced re-render.*

## What the user sees

| Where the cursor is | Opens on | Offers (from CommonMark and the code plugin) |
|---|---|---|
| Start of a line, inside any quotes or list items | typing `/` | block types: headings 1–6, bulleted and numbered lists, quote, code block, divider, link definition, comment |
| Mid-line, a `/` that starts a word | typing `/` | inline scaffolding: link, image, bold, italic, inline code, reference link, autolink, line break |
| A code fence's opening line | typing the fence (```` ``` ````), or right after inserting a code block | languages |
| After `][` | typing it | the document's reference labels, as written, with their destinations |
| Anywhere else | Ctrl+Space, or Alt+/ (macOS gives Ctrl+Space to input sources) | blocks on a line with no content yet, inline scaffolding elsewhere |

How the popup behaves:

- **Filtering.** Typing filters the list. Navigation:
  - ↑ and ↓ move, wrapping at the ends;
  - PgUp and PgDn jump;
  - Enter or Tab inserts;
  - Esc closes.
- **Esc is remembered.** Once Esc closes a suggestion, it does not reopen
  while you keep typing the same word.
- **Matching.** A query matches a suggestion's label or keywords in this
  order of preference: exactly ("js" is JavaScript, not JSON), as a prefix,
  at the start of a word, as a substring, or as the initials ("cb" is Code
  block).
- **Hints.** Each suggestion shows the markdown it stands for (`##`,
  `[text](url)`), so choosing from the list teaches the syntax.
- **Placeholders.** Inserted text keeps its first placeholder selected, so
  you can type straight over it (`# Heading`, `[text](https://)`).
- **Passive opening.** Opened by itself on a fence or after `][`, the list
  has nothing chosen until you type a query or press an arrow, so a plain
  ```` ``` ```` followed by Enter stays a plain fence.
- **Leaving.** Moving the caret anywhere but where typing left it closes the
  list. So does replacing the document, or an IME composition, which keeps
  its own keys.
- **Selections.** With text selected, Ctrl+Space wraps it. Only suggestions
  with a placeholder are offered, because anything else would replace the
  selection. Choosing Bold
  turns `text` into `**text**`. Choosing Link turns it into
  `[text](https://)` with the URL selected.
- **Containers.** Multi-line suggestions keep the line's containers. A code
  block chosen inside `> - ` continues its lines with `>   `.
- **Code blocks.** Inserting one immediately offers its language.

Nothing is suggested inside code blocks (except on a fence's opening line),
code spans or raw HTML. `and/or` and URLs never open the popup, because the
`/` has to start a word.

## The two speeds

The popup opens on the keystroke itself. It does not wait for the
150 ms highlight pause or the 1 s preview pause.

- Before asking for suggestions, the app brings the parse up to date. The
  parse is incremental, so this costs a few milliseconds even on a long
  document.
- A cheap regex on the current line is tried first. A parse is asked for
  only when a context could start there at all.
- While the popup is open, typing only re-filters the suggestions it already
  has. It does not parse again.

## Architecture

```
src/js/complete/context.js   PURE  cursor → { kind, from, query, prefix } from the AST + the line
src/js/complete/complete.js  PURE  context → items from registered providers
src/js/complete/match.js     PURE  rank(items, query)
src/js/complete/snippet.js   PURE  expandSnippet(insert, { prefix, selection })
src/js/autocomplete.js       DOM   the popup: opening, filtering, keys, inserting, placement
src/js/plugins/commonmark/completions.js   block, inline and link-ref suggestions
src/js/plugins/code/index.js               fence-info: the languages
```

`mh.complete(ast, text, offset, { explicit })` answers `{ context, items }`,
or `null` where nothing should be suggested. Items come back unfiltered;
callers rank them by `context.query`.

### Providers (plugin API)

```js
api.completions({
  context: "block",            // "block" | "inline" | "fence-info" | "link-ref" | "*" | [ … ]
  provide(ctx) {               // ctx: { kind, from, query, prefix, ast, text, offset, registry }
    return [{
      label: "Table",          // shown, and filtered on
      detail: "3 columns",     // optional, shown dimmed
      keywords: ["grid"],      // optional, also filtered on
      hint: "| a | b |",       // optional, the markdown it stands for
      insert: "| ${Column} | Column |\n| --- | --- |\n| $0 | |",   // a snippet
    }];
  },
});
```

- Items without a `label` are dropped.
- A provider that throws loses only its own suggestions.
- The phase-6 extensions (tables, task lists, footnotes, Mermaid) add their
  slash commands and fence languages this way.

### Snippets

| Syntax | Meaning |
|---|---|
| `${name}` | a placeholder; the first one is selected after inserting |
| `$0` | where the caret goes when there is no placeholder |
| `$$` | a literal `$` |
| `\n` | a new line, continued with the line's container prefix |

With a selection, the selection fills the first placeholder and the next
one is selected instead.

### Accessibility

- The textarea has `aria-autocomplete="list"` and `aria-controls`. While the
  popup is open it has `aria-expanded` and `aria-activedescendant`.
- The popup is an ARIA listbox of options with `aria-selected`.
- The list is mouse-friendly: hovering highlights an option, and clicking
  inserts it without taking focus from the editor.
- The editor's description tells screen-reader users about `/` and
  Ctrl+Space.

## Tests

`test/complete.test.js` covers:

- contexts, including inside containers, fence opening lines only, and none
  in code, code spans or HTML;
- explicit requests;
- reference labels (de-duplicated, as written);
- CommonMark and code plugin suggestions;
- third-party providers, including `"*"`, arrays, and failing providers;
- ranking;
- snippets (placeholders, `$0`, `$$`, prefix, selection);
- container continuation.

The popup was checked by hand in Chrome:

- `/` → block list;
- `/cb` ↵ inside a quote gives a fenced block with `>` continuations and the
  language list;
- Ctrl+Space with a selection → Bold wraps it.
