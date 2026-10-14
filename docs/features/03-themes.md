# 03 — Themes: modes, palettes and the theme editor (phase 4)

*Phase 4 of the roadmap in `features/markhippo-design-spec.md` (§6), which
models theming on Rest Hippo's theme system and editor.*

## What the user sees

The page has two separate choices.

- **Mode:** System, Light or Dark. Set it with the header button, which
  cycles through the three, or in the Themes dialog.
- **Palette:** chosen in the Themes dialog. MarkHippo comes with these:

  | Palette | Light / dark |
  |---|---|
  | Hippo | the default: the Hippo family's greys with the brand orange |
  | Catppuccin | Latte / Mocha |
  | Grey | Rest Hippo's greys |
  | High contrast | black and white with strong colours |

  The user can add their own palettes too.

Every palette has a light and a dark version (the spec's "twisted light or
dark"), and the mode picks between them. System follows
`prefers-color-scheme` live.

**The Themes dialog:**

- **Palette list.** Each entry shows the palette's light and dark swatches.
  Choosing one applies it.
- **Editor.** Shows the selected palette's 26 colours for one mode at a
  time, in Light and Dark tabs. They are grouped as Surfaces, Text, Accents
  and Syntax.
- **Editing.** Each colour has a picker and a hex field. Every text colour
  shows its contrast ratio against what it is read on, in red below WCAG AA
  (4.5:1).
- **Live preview.** While the dialog is open, the page shows the tab being
  edited, whatever the mode. Closing the dialog puts the mode back.
- **Built-in palettes are read-only.**
  - **Duplicate** makes an editable copy.
  - **New** starts a copy of Hippo.
  - Custom palettes save as they are edited; there is no Save button.
  - **Delete** asks for a second press within four seconds.
- **Export** downloads `<name>.markhippo-theme.json`.
- **Import…** accepts MarkHippo theme files and also Rest Hippo's.

## Model

A palette is `{ id, name, light, dark }`. Each mode maps every token in
`themes/tokens.js` to `#rrggbb`:

| Group | Tokens |
|---|---|
| Surfaces | `--bg --mantle --crust --surface-0 --surface-1 --surface-2 --code-bg` |
| Text | `--text --subtext --muted` |
| Accents | `--accent --selection --quote-bar --error` |
| Syntax | `--md-code --tk-keyword --tk-string --tk-number --tk-comment --tk-function --tk-type --tk-property --tk-tag --tk-attr --tk-variable --tk-meta` |

- Translucent colours are derived in CSS, not stored. The editor's
  selection and the hard-break tint use
  `color-mix(in srgb, var(--accent) N%, transparent)`.
- The brand orange (`--brand`, `--on-brand`) is identity, not theme, so it
  stays fixed.
- `CONTRAST_PAIRS` lists each text token and the background it is read
  against:
  - the text tokens, `--error` and `--md-code` against `--bg`;
  - the code tokens against `--code-bg`.

  `test/themes.test.js` holds every built-in palette to 4.5:1 on all of
  them. Where a canonical colour fell short, it was deepened just enough
  (mixed toward black or white). Catppuccin Latte's yellows and teals on
  Mantle are the main case.

## Where palettes come from

Palettes are a plugin type: `api.theme({ id, name, light, dark })`.

- **Hippo** is `themes/palettes.js`. Its values are also the stylesheets'
  defaults, which a test keeps in step.
- **The themes plugin** (`plugins/themes/`, switchable in Plugins) adds
  Catppuccin, Grey and High contrast.
- **The user's palettes** live in storage.
- If a palette's plugin is switched off, the page falls back to Hippo. The
  choice is kept, so it comes back when the plugin does.

## Applying, storage and first paint

`theme-manager.js`:

- sets every token of the active palette's resolved mode on `<html>` as
  inline custom properties, which win over the stylesheet defaults;
- sets `color-scheme`, and `data-theme` for the stylesheet's own light/dark
  rules.

| Key | Holds |
|---|---|
| `markhippo.theme` | the mode (as before) |
| `markhippo.palette` | the palette id |
| `markhippo.themes` | the user's palettes (JSON array) |
| `markhippo.theme.vars` | `{ light, dark }` of the active palette, cached for first paint |

`js/theme.js` is a classic `<head>` script.

- It resolves the mode and applies the cached colours before the first
  frame, so a custom palette doesn't flash. It accepts only `--token` names
  and `#rrggbb` values.
- Nothing is injected as a `<style>` element. The CSP forbids that, and
  custom properties set through CSSOM need no exception.

## Safety

Everything read back, whether from storage or from a file, goes through
`cleanVariant`:

- known tokens only;
- each value normalised to `#rrggbb` (`#abc` is expanded);
- anything else replaced by Hippo's value.

A theme can colour the page but can carry nothing else into it. Rest
Hippo's `buildCustomThemeCss` has to guard a `<style>` element; here there
is none to guard.

## Theme files

```json
{ "markhippo-theme": 1, "name": "Ocean", "light": { "--bg": "#ffffff", … }, "dark": { … } }
```

A file with only one of `light`/`dark` uses it for both.

Rest Hippo files (`{ "resthippo-theme": "1", colorScheme, vars }`) import
like this:

- their one mode is mapped token by token, the way Rest Hippo's Prism
  styles map its semantic colours, so `--color-success` becomes strings;
- that mode is used for both light and dark, ready to adjust.

## Differences from Rest Hippo, on purpose

| Rest Hippo | MarkHippo |
|---|---|
| Separate dark and light themes | Palettes, each with both modes, plus a System mode |
| Editor in its own window, with a Save button | In-page dialog that saves as it goes, and previews in the editor itself as well as the page |
| No contrast feedback | Contrast feedback |
| No Metrics tab | No Metrics tab here either: MarkHippo's spacing isn't themable |

Both use the same family of colour tokens and the same Catppuccin/Grey
palettes, so a theme can travel from Rest Hippo to MarkHippo.

## Tests

`test/themes.test.js` checks:

- built-in palettes are complete, valid and AA;
- the stylesheet defaults equal Hippo;
- hex normalisation and contrast;
- `cleanVariant` drops unknown tokens and bad values;
- the `api.theme` seam;
- storage round-trips (dedupe, garbage);
- export and import, including Rest Hippo files and the error messages.

Checked by hand in Chrome:

- choose Catppuccin; switch to Light;
- Duplicate, rename, and edit the accent, which shows live with a red
  contrast badge;
- reload: the custom palette is on the page from the first frame;
- the header button cycles Dark → System (following the OS).
