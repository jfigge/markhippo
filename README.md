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

Themes are palettes with a light and a dark mode — Hippo, Catppuccin, Grey,
High contrast, or your own, made in the built-in theme editor.

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
  navigation in [`docs/features/04-navigation.md`](docs/features/04-navigation.md)

## Develop

Plain HTML, CSS and ES modules, with no bundler and no runtime dependencies.
You need Node 20.19 or later and Python 3 (for `make serve`).

```sh
make install       # dev tooling: eslint, html-validate
make serve         # http://localhost:8080
make check         # lint + validate + tests (incl. the CommonMark spec suite)
make spec-report   # conformance by spec section
make site          # publish into ../hippoherd/website/markhippo/
```

## License

Apache-2.0. See `LICENSE` and `NOTICE`.
