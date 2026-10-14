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
 * outline.js — the document's headings, for the outline panel and for
 * suggesting #links to them.
 *
 * Each heading's id is the one the preview gives it (render/slug.js, with
 * the renderer's `headingIds`): both hand out ids to the same headings in
 * the same order.
 */

import { plainText, slugger } from "../render/slug.js";

// [{ level, text, id, line, offset }], in document order.
export function outline(ast) {
  const slug = slugger();
  const items = [];
  const visit = (node) => {
    if (node.type === "heading") {
      const text = plainText(node).replace(/\s+/g, " ").trim();
      items.push({ level: node.level, text, id: slug(text), line: node.pos.start.line, offset: node.pos.start.offset });
      return;
    }
    for (const child of node.children ?? []) visit(child);
  };
  if (ast) visit(ast);
  return items;
}

// The index of the heading whose section holds 1-based `line`: the last one
// at or above it (-1 above the first).
export function sectionAt(items, line) {
  let lo = 0;
  let hi = items.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].line <= line) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
