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
 * match.js — filtering and ranking suggestions by what has been typed.
 *
 * A suggestion matches when the query is its label or one of its keywords
 * exactly (best: "js" is JavaScript, not JSON), a prefix of one, the start
 * of a word in one, a substring, or the initials of one ("cb" finds
 * "Code block"). Case is ignored.
 */

export function score(query, item) {
  if (!query) return 0;
  const q = query.toLowerCase();
  let best = null;
  const names = [item.label, ...(item.keywords ?? [])];
  for (let i = 0; i < names.length; i++) {
    const s = scoreName(q, names[i].toLowerCase());
    if (s === null) continue;
    // The label itself beats a keyword that matches as well.
    const total = i === 0 ? s : s - 5;
    if (best === null || total > best) best = total;
  }
  return best;
}

function scoreName(q, name) {
  if (name === q) return 120;
  if (name.startsWith(q)) return 100 - Math.min(20, name.length - q.length);
  if (name.split(/[\s\-_/.]+/).some((word) => word.startsWith(q))) return 70;
  if (name.includes(q)) return 50;
  // Initials: "cb" for "code block".
  const initials = name
    .split(/[\s\-_/.]+/)
    .map((word) => word[0] ?? "")
    .join("");
  return q.length > 1 && initials.startsWith(q) ? 40 : null;
}

// The items that match `query`, best first; ties keep their given order.
export function rank(items, query) {
  return items
    .map((item, order) => ({ item, order, score: score(query, item) }))
    .filter((r) => r.score !== null)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((r) => r.item);
}
