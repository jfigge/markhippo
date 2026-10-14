# Writing a MarkHippo plugin

Everything MarkHippo understands comes from a plugin, CommonMark included,
and every bundled plugin uses the same interface as yours will. In the
desktop app you can add your own.

This guide works through a complete example,
[`examples/plugins/highlight.js`](../examples/plugins/highlight.js), which
adds `==highlighted text==`. The full interface is in
[`docs/features/00-overview.md`](features/00-overview.md) ("Plugin API v0"),
and the bundled plugins in [`src/js/plugins/`](../src/js/plugins/) show
every part of it.

## Installing a plugin

1. In the desktop app, choose **Plugins → Open Plugins Folder**.
2. Put the plugin in that folder:
   - a single `.js` (or `.mjs`) file, or
   - a folder with an `index.js` (or `index.mjs`), which can import its own
     files and carry stylesheets and images.
3. Choose **Plugins → Reload Plugins**.

**Plugins → Show Plugins…** lists your plugins with a *Yours* badge, beside
the bundled ones.

- You can switch a plugin off there, like any other.
- A plugin that fails to load, or throws while setting up, is listed with
  the reason and left out. The rest of MarkHippo carries on without it.

The folder is in the app's data folder:

| System | Plugins folder |
|---|---|
| macOS | `~/Library/Application Support/MarkHippo/plugins/` |
| Windows | `%APPDATA%\MarkHippo\plugins\` |
| Linux | `~/.config/MarkHippo/plugins/` |

The web app at hippoherd.com runs only the bundled plugins. A web page
cannot load code from your disk.

## What a plugin is

A plugin is an ES module whose default export is an object:

```js
export default {
  id: "highlight", // unique; a bundled plugin's id is taken
  name: "Highlight", // for the plugin list
  version: "1.0.0",
  description: "==Highlighted text==, between pairs of equals signs, shown marked.",
  setup(api) {
    // register what the plugin adds
  },
};
```

`setup` runs once, as MarkHippo starts, with the plugin API. Everything the
plugin does, it registers there. MarkHippo then calls the registered
functions as it parses, renders, colours and suggests.

## The example, step by step

### 1. Parsing

`==` behaves like `*` for emphasis:

- it pairs up;
- it must hug the text it marks, so `a == b` stays text;
- it nests with the rest.

So it is a **delimiter**, which joins the same stack as emphasis:

```js
api.delimiter({
  char: "=",
  matches: (opener, closer) => opener.origdelims === 2 && closer.origdelims === 2,
  use: () => 2,
  nodeType: () => "highlight",
});
```

- `matches` accepts only runs of exactly two.
- `use` says how many characters each pairing consumes.
- `nodeType` names the node it makes.

Syntax that is not delimited needs one of the other two rules:

| Rule | For | Bundled example |
|---|---|---|
| `api.inlineRule({ name, triggers, parse(state) })` | inline syntax that starts with a particular character | the math plugin's `$` |
| `api.blockRule({ … })` | a new kind of block | footnote definitions, `$$` math blocks, tables |

### 2. The preview

A **renderer** writes a node as HTML through the renderer object `r`:

```js
api.renderer("highlight", (node, r) => {
  r.tag("mark");
  r.children(node);
  r.tag("/mark");
});
```

| Call | Writes |
|---|---|
| `r.tag()` | a tag, with its attributes already escaped |
| `r.out()` | escaped text |
| `r.lit()` | raw HTML |
| `r.children()` | the node's children |

For a fenced code block in a language of your own, register
`api.fenceRenderer("mylang", fn)`, as the Mermaid plugin does.

### 3. The editor

A **highlighter** colours the node's source in the edit pane.
`h.mark(from, to, token)` colours a range of source offsets, and
`node.pos` holds the node's exact place in the source:

```js
api.highlighter("highlight", (node, h) => {
  const from = node.pos.start.offset;
  const to = node.pos.end.offset;
  h.mark(from, to, "md-strong");
  h.mark(from, from + 2, "md-marker");
  h.mark(to - 2, to, "md-marker");
  h.children(node);
});
```

Use the tokens the themes already colour: `md-strong`, `md-emph`,
`md-code`, `md-link`, `md-marker` and the rest in `src/css/syntax.css`.
Every palette, including the user's own, then colours your syntax too.

### 4. Suggestions

A **completion provider** adds items to the list at the cursor. Its
`context` says where it applies:

| Context | Where |
|---|---|
| `"block"` | `/` at the start of a line |
| `"inline"` | `/` mid-line |
| `"fence-info"` | after a code fence's backticks |
| `"*"` | anywhere |

```js
api.completions({
  context: "inline",
  provide: () => [{ label: "Highlight", detail: "==text==", keywords: ["mark", "=="], hint: "==text==", insert: "==${text}==" }],
});
```

In `insert`, `${text}` is a placeholder. It is selected after inserting,
ready to type over.

## More the API offers

| Call | What it adds | Bundled example |
|---|---|---|
| `api.language({ id, aliases, tokenize })` | colouring for a programming language in fenced code, in the editor and the preview | `plugins/code/` |
| `api.theme({ id, name, light, dark })` | a palette in the Themes dialog | `plugins/themes/` |
| `api.inlineFinisher(fn)` | a pass over each paragraph's inline nodes once they are parsed | GFM's bare-URL autolinks |
| `api.enhancer({ selector, run, stylesheet })` | finishing the rendered preview in the page, after it is sanitized; exports run it too, and carry `stylesheet` | math to MathML, diagrams to SVG |

## Importing

A plugin can import MarkHippo's own modules by their absolute path in the
app. For example, this gives a language plugin the tokenizer the bundled
languages use:

```js
import { tokenizer, words } from "/js/plugins/code/tokenizer.js";
```

A folder plugin can also import its own files relatively.

## Where a plugin runs

Your plugin runs in the editor's page, with no more access than the page
has:

- **No Node and no file system.** The desktop app's page is sandboxed.
- **No network**, except the images a document shows. The app cancels every
  other request, the page's and plugins' alike.
- **No running in exports.** A document's exported HTML carries a policy
  that lets nothing run, including anything your renderer writes into it.

Even so, a plugin is code you choose to run. Install the ones you trust.

## Testing

Plugins are plain modules, so they run under Node with no browser. The
example's test, in `test/desktop.test.js`, builds a host with it and checks
what it renders, colours and suggests:

```js
import { createMarkHippo } from "../src/js/core/host.js";
import commonmark from "../src/js/plugins/commonmark/index.js";
import highlight from "../examples/plugins/highlight.js";

const mh = createMarkHippo({ plugins: [commonmark, highlight] });
mh.render(mh.parse("Remember to ==back up== first."));
// → "<p>Remember to <mark>back up</mark> first.</p>\n"
```
