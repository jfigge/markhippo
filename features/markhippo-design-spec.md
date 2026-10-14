# MarkHippo — Design Specification

*Hippo family · HippoHerd · Drafted 13 October 2026*

---

## 1. Overview

MarkHippo is a standalone markdown viewer, renderer and editor in the Hippo family.

**Motivation:** opening a `.md` file on a Mac just shows plain text in Xcode, with no way to render it as a document. Existing viewers are either paid (e.g. Marked 2) or lack the features wanted here.

**Delivery model** — mirrors JsonHippo:

- Lives as its own section on **HippoHerd** (no dedicated domain).
- Web presence: **hero page**, **documentation**, and the **live editor page**.
- A desktop **Electron** app hosts the same web page (one codebase, thin shell).

---

## 2. Architecture

### 2.1 Plugin-first core

The core knows nothing except **how to host plugins**. Every feature is a plugin, including:

- Mermaid diagrams
- Code syntax highlighting
- JSON / YAML handling
- Markdown extensions (tables, footnotes, task lists, math…)
- Themes (candidate — see §6)

MarkHippo ships a **default plugin set** built against *exactly the same* interface a third party would use. Dog-fooding the interface proves it is genuinely capable.

### 2.2 Web vs desktop extensibility

| | Website (HippoHerd) | Electron desktop app |
|---|---|---|
| Plugins | Curated / bundled only | Bundled **plus** user-added |
| Why | Browser security prevents loading arbitrary external code | Real environment; plugin files can be dropped in |
| Role | Clean, safe, works everywhere | Power-user, extend-it-yourself |

The extensibility gap is deliberate: it gives people a reason to reach for the desktop app.

### 2.3 One parser, one source of truth

A **single custom parser** (written via Claude Code, not an off-the-shelf engine such as markdown-it) drives:

- Preview rendering
- Edit-pane syntax highlighting
- Context-aware autocomplete
- Document outline / table of contents
- Minimap
- Synced scroll

Its structural awareness of the document is what makes every other feature cheap.

---

## 3. Parser scope

### 3.1 Tier 1 — CommonMark core (first milestone)

See `markhippo-parser-core.md` for the detailed brief.

**Block-level:** headings (ATX & Setext), paragraphs, block quotes, ordered/unordered/nested lists, fenced & indented code blocks, thematic breaks, raw HTML blocks (optional).

**Inline:** emphasis & strong, inline code, inline & reference links, images, autolinks, hard line breaks.

**Known hard spots:** nested lists; emphasis open/close rules.

### 3.2 Later tiers — extensions as plugins

Added one by one, each earning its place:

- Tables
- Footnotes
- Task lists
- Math (LaTeX)
- **Mermaid** — text-to-diagram rendering. Jason has a real document that uses it, so it's wanted, but as a plugin rather than core.

---

## 4. Editor UX

### 4.1 Split pane

Markdown on the **left**, live rendered preview on the **right**.

### 4.2 Edit-pane syntax highlighting

- Driven by the same parser as the preview.
- Instant feedback that input was understood (a heading marker turns heading-coloured).
- Catches mistakes early — e.g. an unclosed code fence visibly turns everything below it into code.

### 4.3 Context-aware autocomplete — headline feature

Solves markdown's discoverability problem: how would anyone know `mermaid` exists as a fence type?

**Behaviour**

- A popup appears directly at/under the cursor as you type.
- It shows options contextually relevant to what has been typed so far.
- Keep typing to refine/filter the list, **or** arrow up/down through it.
- **Enter** or **Tab** selects.

**Context is driven by cursor position in the document structure** — beginning, middle or end of line, and which block the cursor is inside:

| Cursor context | Suggestions |
|---|---|
| Inside a code fence opener | Languages: `mermaid`, `python`, `javascript`, `json`, `yaml`… |
| Start of a blank line | Block types: heading, list, quote, table, code block… |
| Mid-sentence | Inline scaffolding: link, image, emphasis… |

**Slash commands** — Notion-style: typing `/` at the start of a line offers table, task list, footnote, heading, etc. A familiar discoverability pattern.

Plugins contribute their own suggestions (e.g. the Mermaid plugin registers `mermaid` as a fence language and its diagram types).

### 4.4 Image handling

Inspired by Typora: **paste or drag images straight into the editor**; the app manages the files.

**Open design question — where do images go?**

| Option | Pros | Cons |
|---|---|---|
| Inline base64 in the markdown | Single self-contained file | Bloated, unreadable source |
| Copy into an assets folder beside the doc, link relatively | Clean markdown | Document becomes a folder |

Likely split: the **desktop app** manages an assets folder on disk (configurable, as Typora does); the **website** has no filesystem, so it leans on base64 or an upload. To be decided.

**Decided for the website (phase 7):** base64, but not inline. The image goes in a reference definition at the end of the document (`![alt][image-1]` in the text, `[image-1]: data:image/png;base64,…` at the end), so the file stays self-contained and the prose stays readable. Large images are scaled to 1600 px wide. See `docs/features/06-images-export.md`. The desktop app's assets folder is still to come.

---

## 5. Performance

- **Incremental parsing** — re-parse only the section around where you're editing, never the whole document per keystroke.
- **Debounce** — run the parse when the user pauses typing (~1 second) for preview and highlighting.
- **Two speeds** *(tuning note)* — the autocomplete popup should feel instant, faster than the debounced re-render.

---

## 6. Theming

Modelled on **RestHippo's** theme system and theme editor:

- Top-level modes: **Light**, **Dark**, **System-following**.
- A handful of **named palettes** out of the box (e.g. *Mocha*), each of which can be twisted light or dark.
- A **theme editor** so users can create and add their own themes.
- *Consider:* treat themes as a plugin type, so one extensibility story covers both features and looks.
- Bonus: consistent mental model across the Hippo family; possibly shareable theme files between apps later.

---

## 7. Navigation

All three come from the parser's structural data, so they're cheaper to build together.

- **Synced scroll** between edit and preview panes *(definite)*.
- **Document outline / table of contents** panel generated from headings.
- **Minimap** — a zoomed-out overview of the whole document down the side, VS Code style.

---

## 8. Export, print & copy

| Format | Status | Notes |
|---|---|---|
| PDF | **Definite** | Electron / browser print-to-PDF |
| Print | **Definite** | Same engine as PDF; prints the rendered version |
| HTML | Planned | Near-free — already produced for preview |
| RTF | Planned | Fairly forgiving format; also how Pages users open docs |
| Plain text | Planned | |
| Copy as rendered HTML | Planned | Button for pasting into email etc. |
| Word (.docx) | **Back burner** | Needs a library; do when out of other MarkHippo work |
| Pages | **Dropped** | Proprietary; Pages opens RTF/.docx anyway |

---

## 9. Positioning

Live split-pane preview is table stakes (Typora, MacDown, Marked 2 all do it). MarkHippo doesn't try to out-feature mature apps like Typora or Obsidian on day one.

**The niche:** *the discoverable, extensible, developer-friendly markdown editor.*

Lead with:

1. Context-aware autocomplete that teaches syntax as you type.
2. A clean plugin core, extensible in the desktop app.
3. One parser powering everything consistently.

### Typora ideas noted but not adopted

- Seamless in-place rendering (markup melts away as you type) — a different philosophy from split pane.
- Focus mode / typewriter mode.
- Spreadsheet-like inline table editing.

---

## 10. Roadmap

| Phase | Scope |
|---|---|
| **1** | Custom parser for CommonMark core; split-pane web editor on HippoHerd with live preview |
| **2** | Plugin host + default plugin set; edit-pane highlighting; incremental + debounced parsing |
| **3** | Context-aware autocomplete & slash commands |
| **4** | Theming (light/dark/system, palettes, theme editor) |
| **5** | Navigation trio: synced scroll, outline, minimap |
| **6** | Extensions: tables, footnotes, task lists, math, Mermaid |
| **7** | Image handling; export (PDF, print, HTML, RTF, text, copy-as-HTML) |
| **8** | Electron desktop shell with user-installable plugins; hero page & docs |
| Back burner | Word (.docx) export |

*Phase order is a suggestion — reshuffle freely.*
