# MarkHippo

The discoverable, extensible, developer-friendly markdown editor, from the
[Hippo Herd](https://hippoherd.com/).

You write markdown on the left and see it rendered live on the right. The
markdown is read by MarkHippo's **own parser**, not an off-the-shelf
library:

- It covers all of CommonMark 0.31.2. All 652 spec examples pass, byte for
  byte.
- It produces a tree in which every node knows its exact source position.
- It reparses incrementally as you type.
- It colours the editor too, so you see what it understood as you type: a
  heading marker turns heading-coloured, and an unclosed code fence turns
  everything after it into code.
- It suggests the syntax where it fits: `/` at the start of a line for
  block types, `/` mid-line for links and emphasis, languages on a code
  fence, and Ctrl+Space (or Alt+/) anywhere.

An outline, a minimap and synced scrolling come from the same tree.

Beyond CommonMark, plugins add GitHub Flavored Markdown — tables, task
lists, strikethrough, bare-URL autolinks, the tag filter — plus footnotes,
LaTeX math (drawn as MathML by the vendored [Temml](https://temml.org/)) and
[Mermaid](https://mermaid.js.org/) diagrams. They pass cmark-gfm's examples.

Themes are palettes with a light and a dark mode — Hippo, Catppuccin, Grey,
High contrast, or your own, made in the built-in theme editor.

Paste a screenshot or drop a picture on the editor and it goes into the
document, which stays one self-contained file. **Export** prints the
document or saves it as a PDF, an HTML page, RTF for Pages and Word, or
plain text, or copies it as rich text to paste into an email.

The core is a plugin host. CommonMark itself is a plugin, written against the
same API anyone else would use, and so is the syntax colouring of fenced code
in some twenty languages.

- **Use it:** <https://hippoherd.com/markhippo/>
- **User guide:** [`src/docs/index.html`](src/docs/index.html), served at
  <https://hippoherd.com/markhippo/docs/>
- **Design:** [`features/markhippo-design-spec.md`](features/markhippo-design-spec.md)
  and [`features/markhippo-parser-core.md`](features/markhippo-parser-core.md)
- **Architecture, conventions and plugin API:**
  [`docs/features/00-overview.md`](docs/features/00-overview.md); the
  edit-pane highlighting and the code plugin are in
  [`docs/features/01-highlighting.md`](docs/features/01-highlighting.md),
  autocomplete in [`docs/features/02-autocomplete.md`](docs/features/02-autocomplete.md),
  themes in [`docs/features/03-themes.md`](docs/features/03-themes.md),
  navigation in [`docs/features/04-navigation.md`](docs/features/04-navigation.md),
  extensions in [`docs/features/05-extensions.md`](docs/features/05-extensions.md),
  images and export in [`docs/features/06-images-export.md`](docs/features/06-images-export.md)

## Develop

Plain HTML, CSS and ES modules, with no bundler and no runtime dependencies.
You need Node 20.19 or later and Python 3 (for `make serve`).

```sh
make install       # dev tooling: eslint, html-validate
make serve         # http://localhost:8080
make check         # lint + validate + tests (incl. the CommonMark spec suite)
make spec-report   # conformance by spec section
make vendor        # refresh the vendored Temml and Mermaid from npm
make site          # publish into ../hippoherd/website/markhippo/
```

## License

GPL-3.0-or-later (the GNU General Public License, version 3 or any later
version). See `LICENSE` and `NOTICE`.
