/*
 * Copyright 2026 Jason Figge
 *
 * This file is part of MarkHippo.
 *
 * MarkHippo is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * MarkHippo is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with MarkHippo. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * highlight.js — an example plugin: ==highlighted text==, shown marked.
 *
 *   Remember to ==back up== first.     →   Remember to <mark>back up</mark> first.
 *
 * To try it in the desktop app: Plugins → Open Plugins Folder, copy this
 * file there, and Plugins → Reload Plugins. docs/PLUGINS.md walks through
 * it. It touches every part of a plugin a new inline syntax needs — how it
 * parses, renders, colours the editor and is suggested — and imports
 * nothing, so it works as a single file anywhere.
 */

export default {
  id: "highlight",
  name: "Highlight",
  version: "1.0.0",
  description: "==Highlighted text==, between pairs of equals signs, shown marked.",

  setup(api) {
    // Parsing: a run of = is a delimiter, paired like emphasis (it must
    // hug the text it marks, so "a == b" is left alone). Only runs of
    // exactly two make a highlight.
    api.delimiter({
      char: "=",
      matches: (opener, closer) => opener.origdelims === 2 && closer.origdelims === 2,
      use: () => 2,
      nodeType: () => "highlight",
    });

    // The preview: the node's children inside <mark>.
    api.renderer("highlight", (node, r) => {
      r.tag("mark");
      r.children(node);
      r.tag("/mark");
    });

    // The editor: the text coloured as strong text is, its == as markup.
    api.highlighter("highlight", (node, h) => {
      const from = node.pos.start.offset;
      const to = node.pos.end.offset;
      h.mark(from, to, "md-strong");
      h.mark(from, from + 2, "md-marker");
      h.mark(to - 2, to, "md-marker");
      h.children(node);
    });

    // Suggestions: in the list at the cursor, mid-line. ${text} is what is
    // selected after inserting, ready to type over.
    api.completions({
      context: "inline",
      provide: () => [{ label: "Highlight", detail: "==text==", keywords: ["mark", "=="], hint: "==text==", insert: "==${text}==" }],
    });
  },
};
