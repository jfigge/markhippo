/*
 * Copyright 2026 Jason Figge
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
 * context.js — where the cursor is, as autocomplete sees it.
 *
 * The context comes from the parser's tree (is the cursor in a code block?
 * on a fence's opening line? in a code span?) and from the text just
 * before the cursor (a / that starts a command, the [ of a reference).
 * It is one of:
 *
 *   block       a / at the start of a line (inside any quotes and list
 *               items), or an explicit request on a line with no content
 *               yet: block types — headings, lists, quotes, code…
 *   inline      a / starting a word mid-line, or an explicit request
 *               there: inline scaffolding — links, images, emphasis…
 *   fence-info  the info string of a code fence's opening line: languages
 *   link-ref    after "][": the document's link reference labels
 *
 * and the answer is { kind, from, query, prefix }: the suggestion replaces
 * text[from, cursor), `query` is what has been typed of it, and `prefix` is
 * what a new line needs to stay in the same quotes and list items.
 */

import { lineStartAt } from "../highlight/lines.js";

// Quote markers, list markers and indentation at the start of a line.
const CONTAINERS = String.raw`(?:[ \t]{0,3}(?:>[ \t]?|(?:[-+*]|[0-9]{1,9}[.)])[ \t]+))*[ \t]*`;
const reContainers = new RegExp(`^${CONTAINERS}`);
const reBlockSlash = new RegExp(`^(${CONTAINERS})/([A-Za-z0-9-]*)$`);
const reBlank = new RegExp(`^${CONTAINERS}$`);
const reInlineSlash = /(?:^|\s)\/([A-Za-z0-9-]*)$/;
const reFenceInfo = /(?:`{3,}|~{3,})[ \t]*([^\s`]*)$/;
const reLinkRef = /\]\[([^\][\n]*)$/;

// Inline nodes inside which nothing is suggested.
const VERBATIM = new Set(["code", "html_inline", "html_block"]);

export function completionContext(ast, text, offset, { explicit = false } = {}) {
  const lineStart = lineStartAt(text, offset);
  const before = text.slice(lineStart, offset);
  const prefix = continuation(before.match(reContainers)[0]);
  const at = (kind, from, query) => ({ kind, from, query, prefix });

  const path = ast ? pathAt(ast, offset) : [];
  const code = path.find((n) => n.type === "code_block");
  if (code) {
    if (!code.fenced || code.pos.start.offset < lineStart) return null;
    const m = before.match(reFenceInfo);
    return m ? at("fence-info", offset - m[1].length, m[1]) : null;
  }
  if (path.some((n) => VERBATIM.has(n.type))) return null;

  let m = before.match(reLinkRef);
  if (m) return at("link-ref", offset - m[1].length, m[1]);
  m = before.match(reBlockSlash);
  if (m) return at("block", lineStart + m[1].length, m[2]);
  m = before.match(reInlineSlash);
  if (m) return at("inline", offset - m[1].length - 1, m[1]);
  if (explicit) return at(reBlank.test(before) ? "block" : "inline", offset, "");
  return null;
}

// The nodes containing `offset`, outermost first. A node ending exactly at
// the offset contains it too: the cursor sits at its end.
export function pathAt(ast, offset) {
  const path = [];
  let node = ast;
  while (node) {
    path.push(node);
    let next = null;
    for (const child of node.children ?? []) {
      if (child.pos.start.offset > offset) break;
      if (offset <= child.pos.end.offset) next = child;
    }
    node = next;
  }
  return path;
}

// What continues a line's containers onto a new line: the quote markers
// stay, list markers become the spaces of their width.
export function continuation(lead) {
  return lead.replace(/(?:[-+*]|[0-9]{1,9}[.)])(?=[ \t])/g, (marker) => " ".repeat(marker.length));
}
