# 01 — Edit-pane highlighting, the code plugin, the plugin list (phase 2)

*Phase 2 of the roadmap in `features/markhippo-design-spec.md` is the plugin
host, the default plugin set, edit-pane highlighting, and incremental,
debounced parsing. The host and incremental parsing arrived with Milestone 1
(`00-overview.md`); this file covers the rest.*

## The edit pane

The editor is still a `<textarea>`, which keeps native typing, selection,
undo, IME and accessibility. Its text is transparent. Underneath it is a
`<pre>` holding the same text, coloured (`src/js/source-highlight.js`).

- **Alignment.** The two share font, size, line height, padding, wrapping
  (`pre-wrap`, `overflow-wrap: break-word`) and tab size. Kerning and
  ligatures are off in both. `syntax.css` may change colour, weight and slant
  only, never anything that moves a glyph.
- **Lines.** Each source line is one block `<span>` ending in `"\n"`. The
  `"\n"` gives an empty line its height, and a block ignores a final line
  break, so each line is exactly as tall as the textarea's.
- **Scrolling.** The textarea is as tall as the `<pre>` and never scrolls
  itself; the pane scrolls both. The browser does not scroll an ancestor to
  follow the caret of a textarea that cannot scroll, so `EditorView` does it
  on `selectionchange`, measuring where the coloured copy draws the caret's
  character.
- **Selection.** It is painted by the textarea over the copy, in a
  translucent colour.

## Two speeds

Nothing is parsed per keystroke (`debounce.js`):

| On | What runs | Cost on a 10,500-line document |
|---|---|---|
| Every keystroke | The old colours are carried across the edit (`lines.js` `mapEdit`). Only touched lines are redrawn. | about 9 ms, most of it the textarea's own work |
| Typing pauses `HIGHLIGHT_DELAY_MS` (150 ms) | An incremental reparse, `highlight(ast)`, and a redraw of the lines whose colours changed | about 25 ms |
| Typing pauses `RENDER_DELAY_MS` (1000 ms) | The preview renders from the same AST | — |

The spec asks for highlighting on the ~1 s pause. It also asks for "instant
feedback that input was understood". Because the incremental parse is cheap,
the colours follow a short pause and the preview keeps the long one.

When an edit is carried across between parses, colours stay on the
characters they were on. Text typed inside or at the end of a coloured
stretch takes its colour, so typing on at the end of a heading keeps it a
heading. The next parse corrects any wrong guess.

**Layout containment matters.** Each pane has `contain: strict`, and the
grid row is `minmax(0, 1fr)`. Without both, every keystroke made the grid
re-measure the whole 250,000-px editor, about 130 ms on that document.

## Highlighters: AST → colours

`mh.highlight(ast)` (`src/js/highlight/highlight.js`) walks the tree. Each
node type is coloured by a function a plugin registered:

```js
api.highlighter("mention", (node, h) => {
  h.mark(node.pos.start.offset, node.pos.end.offset, "x-mention");
});
```

`h` has:

- `mark(from, to, token)`
- `children(node)`
- `source`
- `lineStart(line)` and `lineEnd(line)`
- `code(info, literal, firstLine)`, which colours a code block's content in
  its language

A type with no highlighter just has its children visited.

Marks nest. They are flattened into **segments**, `[from, to, className]`,
in order and not overlapping. The class lists every token covering that
stretch, outermost first, each as `mh-<token>`:
`"mh-md-heading mh-md-h2 mh-md-marker"`. Each top-level block is flattened
on its own, so sorting stays local.

The CommonMark plugin's tokens (`plugins/commonmark/highlight.js`):

| Token | What |
|---|---|
| `md-heading`, `md-h1`…`md-h6` | a heading, all of it |
| `md-marker` | syntax that is not content: `#`s, setext underlines, emphasis delimiters, link brackets, code-span backticks |
| `md-quote`, `md-list` | `>` on every line of a quote (found at the quote's own column), list item markers |
| `md-emph`, `md-strong`, `md-code` | |
| `md-codeblock`, `md-fence`, `md-info` | a code block, its fence lines, its info string |
| `md-link`, `md-image`, `md-url` | link text, alt text, and the `(url "title")` / `[ref]` part |
| `md-definition`, `md-label`, `md-string` | a link reference definition and its parts |
| `md-html`, `md-hr`, `md-break`, `md-escape`, `md-entity` | |

**Code in containers.** Each literal line of a code block is the end of its
source line, because container markers and indentation come off the front.
So tokens map back exactly, even in `> - ```py`. A line where that does not
hold (a tab split by indentation) stays plain.

## Languages: the code plugin

`plugins/code/` registers 20 languages through the new `api.language`:

```js
api.language({ id: "lua", name: "Lua", aliases: ["luau"], tokenize(code) {
  return [[from, to, "keyword"], …]; // in order, plain text left out
}});
```

- A language answers to its id and aliases, case-insensitively, by the first
  word of a fence's info string.
- Both panes use it: the preview through `r.code()` in the code block
  renderer, the edit pane through `h.code()`. Tokens become `mh-tk-<token>`.
- A fence renderer for the same name wins over colouring.
- Tokenizing is memoized per language (`highlight/code.js`, up to 256
  entries), so unchanged code blocks cost nothing on reparse.
- Tokenizer output is plugin code, so it is sanitized: out-of-order or
  overlapping tokens are trimmed and bad names are dropped. A faulty
  tokenizer can colour wrongly but cannot corrupt text or markup.

The bundled languages:

- JavaScript and TypeScript
- JSON and YAML
- Python
- HTML/XML and CSS
- shell and SQL
- C, C++, C#, Java, Kotlin, Go, Rust and Swift
- INI/TOML and Dockerfile
- diff

They are lexical and table-driven (`plugins/code/tokenizer.js`): ordered
sticky-regex rules, with a little context. Examples of that context:

- the previous token decides whether `/` starts a JavaScript regex;
- a name before `(` is a call;
- brace depth decides CSS selector vs declaration;
- shell keywords count only where a command starts.

The plugin also registers a `fence-info` completion provider, so the
autocomplete popup offers these languages on a fence's opening line
(`02-autocomplete.md`).

## The plugin list

The **Plugins** header button lists the bundled plugins with name, version
and description.

- A plugin object may now carry `version`, `description` and `required`.
- `required` (CommonMark) cannot be switched off.
- Switching a plugin rebuilds the host and reparses in full. The choice is
  stored as `markhippo.plugins` = `{ disabled: [ids] }`.
- On the web the list is the curated bundled set. The Electron app will add
  user plugins to the same list.

## Parser fixes made along the way

The highlighter assumes sibling spans never overlap. A property test over
all 652 spec examples now checks that, and it found two cases:

- A paragraph or setext heading that began with link reference definitions
  started at the first definition, on top of them. It now starts after
  them.
- A list item ending with a definition ended before it. It now ends after
  it. Looseness still ignores the definition (spec example 317), through a
  separate content end.

## Tests

- `test/highlight.test.js`: tokens per construct, markers inside nested
  containers, code coloured inside containers, unclosed fences, the
  third-party `api.highlighter` seam, flattening, and well-formed segments
  for every spec example.
- `test/lines.test.js`: splitting by line, carrying colours across edits,
  and 2,000 random edits that keep one well-formed entry per line.
- `test/code.test.js`: tokens per language, random input for every language
  (in order, in bounds, terminates), aliases, preview HTML, fence-renderer
  precedence, a hostile third-party tokenizer, memoization, and the
  completion provider.
