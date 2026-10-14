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
 * Shared helpers for the CommonMark block rules.
 */

export const isSpaceOrTab = (c) => c === " " || c === "\t";

export const reNonSpace = /[^ \t\f\v\r\n]/;

// Link reference definitions never render and never count as content: an
// item that holds only definitions is, for every structural purpose, empty.
export const isDefinition = (node) => node.type === "link_reference_definition";

export function firstContent(node) {
  let c = node._first;
  while (c && isDefinition(c)) c = c._next;
  return c;
}

export function lastContent(node) {
  let c = node._last;
  while (c && isDefinition(c)) c = c._prev;
  return c;
}

export function nextContent(node) {
  let c = node._next;
  while (c && isDefinition(c)) c = c._next;
  return c;
}
