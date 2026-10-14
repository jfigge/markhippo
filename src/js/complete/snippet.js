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
 * snippet.js — the text a suggestion inserts.
 *
 * A suggestion's `insert` is a snippet:
 *
 *   ${name}   a placeholder: "name" is inserted, and the first placeholder
 *             is left selected, ready to be typed over
 *   $0        where the cursor goes (when there is no placeholder)
 *   $$        a literal $
 *   \n        a new line — which gets the line's container prefix, so a
 *             code block inserted in a quote stays in the quote
 *
 * With no placeholder and no $0 the cursor goes to the end. When text was
 * selected, it fills the first placeholder and the next one (if any) is
 * selected instead — so "Link" with "MarkHippo" selected gives
 * [MarkHippo](https://) with the URL selected. (Only snippets with a
 * placeholder can wrap a selection: see wraps().)
 */

export function expandSnippet(snippet, { prefix = "", selection = "" } = {}) {
  let text = "";
  const holders = [];
  let caret = null;
  const re = /\$(?:\{([^}]*)\}|(0)|(\$))|\n/g;
  let at = 0;
  let m;
  while ((m = re.exec(snippet)) !== null) {
    text += snippet.slice(at, m.index);
    at = re.lastIndex;
    if (m[0] === "\n") {
      text += "\n" + prefix;
    } else if (m[3]) {
      text += "$";
    } else if (m[2]) {
      caret ??= text.length;
    } else {
      const content = holders.length === 0 && selection ? selection : m[1];
      holders.push([text.length, text.length + content.length]);
      text += content;
    }
  }
  text += snippet.slice(at);

  let select;
  if (selection && holders.length) select = holders[1] ?? [caret ?? text.length, caret ?? text.length];
  else if (holders.length) select = holders[0];
  else select = [caret ?? text.length, caret ?? text.length];
  return { text, select };
}

// Can this snippet wrap a selection? Only if it has a placeholder to put it
// in — anything else would replace the selected text.
export function wraps(snippet) {
  return /\$\{[^}]*\}/.test(snippet ?? "");
}
