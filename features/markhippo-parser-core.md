# MarkHippo — Parser Core Brief (Milestone 1)

*Hand-off brief for Claude Code. Companion to `markhippo-design-spec.md`.*

---

## Goal

Write MarkHippo's **own** markdown parser (no markdown-it, marked, etc.) covering the **CommonMark core**, and render it live in a split-pane web editor.

The parser is the single source of truth for the whole app. Later it will also drive edit-pane highlighting, context-aware autocomplete, an outline, a minimap and synced scroll — so design for that from day one.

---

## Design requirements

1. **Produce a structured document tree (AST)**, not just an HTML string. HTML rendering is one consumer of the tree.
2. **Source positions on every node** — start/end line and column (or offset). Needed for:
   - highlighting the edit pane,
   - working out what block/inline context the cursor is in (autocomplete),
   - mapping editor lines to preview elements (synced scroll),
   - outline and minimap.
3. **Incremental-friendly** — be able to re-parse just the region around an edit (block boundaries are natural re-parse units) rather than the whole document.
4. **Plugin hooks** — leave clean seams for plugins to register:
   - new block types and inline syntaxes,
   - renderers for fenced code by info string (e.g. `mermaid`, `json`, `yaml`),
   - autocomplete suggestions.
   Built-in features should use these same hooks.
5. **Separate phases:** block parsing first, then inline parsing within leaf blocks (the standard CommonMark two-phase approach).

---

## Scope — Block-level

| Construct | Notes |
|---|---|
| ATX headings | `#` to `######`, optional closing hashes |
| Setext headings | Text underlined with `===` or `---` |
| Paragraphs | Including lazy continuation lines |
| Block quotes | `>`, nesting, lazy continuation |
| Lists — unordered | `-`, `*`, `+` markers |
| Lists — ordered | `1.` / `1)`, start number preserved |
| Nested lists | ⚠️ Tricky: indentation rules, loose vs tight lists |
| Fenced code blocks | Backticks or tildes; capture the **info string** (language) |
| Indented code blocks | 4-space indent |
| Thematic breaks | `***`, `---`, `___` |
| Raw HTML blocks | Optional / configurable |
| Link reference definitions | `[label]: url "title"` |

## Scope — Inline

| Construct | Notes |
|---|---|
| Emphasis / strong | `*`/`_` single and double. ⚠️ Tricky: left/right-flanking delimiter rules, intraword `_` |
| Code spans | Backtick runs of matching length |
| Links — inline | `[text](url "title")` |
| Links — reference | Full, collapsed and shortcut forms |
| Images | `![alt](src "title")` |
| Autolinks | `<https://…>`, `<email@…>` |
| Hard line breaks | Two trailing spaces or a backslash |
| Backslash escapes & entities | |

---

## Known hard spots

- **Nested lists** — container indentation, when a line belongs to a list item, loose vs tight.
- **Emphasis** — the delimiter-run algorithm (flanking rules, "rule of 3", process-emphasis stack). Implement it as specified; don't improvise.

## Testing

- Use the **official CommonMark spec test suite** (spec.json) as the conformance target; track pass rate by section.
- Add tests asserting **source positions** on nodes, since the rest of the app depends on them.

## Out of scope for milestone 1

Tables, footnotes, task lists, math, Mermaid, theming, autocomplete UI, export, Electron shell. (Keep the plugin seams so they slot in later.)

## Deliverable

- Parser module producing a positioned AST.
- HTML renderer consuming the AST.
- Minimal split-pane page: textarea/editor on the left, live preview on the right, re-rendered on a ~1s typing pause.
