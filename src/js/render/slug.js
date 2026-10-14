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
 * slug.js — the plain text of a node, and the ids headings get from it.
 *
 * Ids follow GitHub's scheme, since that is what people link to: lower
 * case, punctuation dropped, spaces to hyphens, and a repeat of an id
 * already used gets -1, -2…  "Hello, World!" → hello-world.
 */

// The text a reader sees in `node`: text and code literally, breaks as
// spaces, everything else by its children.
export function plainText(node) {
  if (node.type === "text" || node.type === "code") return node.literal ?? "";
  if (node.type === "softbreak" || node.type === "linebreak") return " ";
  let out = "";
  for (const child of node.children ?? []) out += plainText(child);
  return out;
}

export function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-");
}

// A slugger hands out each document's ids, unique within it. A heading
// with no letters or digits at all is "section".
export function slugger() {
  const used = new Set();
  const next = new Map();
  return (text) => {
    const base = slugify(text) || "section";
    let id = base;
    if (used.has(id)) {
      let n = next.get(base) ?? 1;
      do id = `${base}-${n++}`;
      while (used.has(id));
      next.set(base, n);
    }
    used.add(id);
    return id;
  };
}
