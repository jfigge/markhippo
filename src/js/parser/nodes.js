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
 * nodes.js — the mutable tree the parser builds, and its conversion to the
 * plain AST everything else consumes.
 *
 * While parsing, nodes are linked lists (parent, first/last child, siblings),
 * because the inline phase constantly splices runs of siblings into new
 * parents — emphasis and links are only known once their closer is seen.
 * Fields the parser keeps for itself start with "_"; everything else on a
 * node is part of the public AST and is copied out by toAst().
 *
 * The public AST is plain data:
 *
 *   { type, pos: { start, end }, children?, ...fields }
 *
 * `children` is present only when non-empty. Positions are described in
 * source.js.
 */

export class Node {
  constructor(type, fields) {
    this.type = type;
    this._parent = null;
    this._first = null;
    this._last = null;
    this._prev = null;
    this._next = null;
    if (fields) Object.assign(this, fields);
  }

  get parent() {
    return this._parent;
  }
  get firstChild() {
    return this._first;
  }
  get lastChild() {
    return this._last;
  }
  get next() {
    return this._next;
  }
  get prev() {
    return this._prev;
  }

  appendChild(child) {
    child.unlink();
    child._parent = this;
    if (this._last) {
      this._last._next = child;
      child._prev = this._last;
      this._last = child;
    } else {
      this._first = child;
      this._last = child;
    }
    return child;
  }

  insertAfter(sibling) {
    sibling.unlink();
    sibling._next = this._next;
    if (sibling._next) sibling._next._prev = sibling;
    sibling._prev = this;
    this._next = sibling;
    sibling._parent = this._parent;
    if (!sibling._next && sibling._parent) sibling._parent._last = sibling;
    return sibling;
  }

  insertBefore(sibling) {
    sibling.unlink();
    sibling._prev = this._prev;
    if (sibling._prev) sibling._prev._next = sibling;
    sibling._next = this;
    this._prev = sibling;
    sibling._parent = this._parent;
    if (!sibling._prev && sibling._parent) sibling._parent._first = sibling;
    return sibling;
  }

  unlink() {
    if (this._prev) this._prev._next = this._next;
    else if (this._parent) this._parent._first = this._next;
    if (this._next) this._next._prev = this._prev;
    else if (this._parent) this._parent._last = this._prev;
    this._parent = null;
    this._next = null;
    this._prev = null;
  }
}

// Copy the public fields of a parse node into a plain AST node. `posOf`
// supplies the node's { start, end }; it is called for every node.
export function toAst(node, posOf) {
  const out = { type: node.type, pos: posOf(node) };
  for (const key of Object.keys(node)) {
    if (key[0] !== "_" && key !== "type") out[key] = node[key];
  }
  if (node._first) {
    const children = [];
    for (let c = node._first; c; c = c._next) children.push(toAst(c, posOf));
    out.children = children;
  }
  return out;
}

// Depth-first visit of a plain AST. Return false from `enter` to skip a
// node's children.
export function walk(node, enter, parent = null) {
  if (enter(node, parent) === false) return;
  if (node.children) for (const child of node.children) walk(child, enter, node);
}
