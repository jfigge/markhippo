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

// helpers.js — shared by the test files.

import { readFileSync } from "node:fs";
import { createMarkHippo } from "../src/js/core/host.js";
import commonmark from "../src/js/plugins/commonmark/index.js";

export function commonMarkHippo() {
  return createMarkHippo({ plugins: [commonmark] });
}

const fixture = (name) => new URL(`./fixtures/commonmark/${name}`, import.meta.url);

// The CommonMark 0.31.2 examples: [{ markdown, html, example, section, … }].
export const SPEC = JSON.parse(readFileSync(fixture("spec.json"), "utf8"));

// Examples known not to pass, by number, each with the reason: { "123": "…" }.
// Empty while the suite passes in full; it exists so a regression that has
// to be lived with stays visible here instead of being skipped silently.
export const KNOWN_FAILURES = Object.fromEntries(
  JSON.parse(readFileSync(fixture("known-failures.json"), "utf8")).map((f) => [f.example, f.reason]),
);

// A deterministic pseudo-random generator (LCG), so a failing fuzz case is
// reproducible from its seed.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return (n) => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return (s >>> 8) % n;
  };
}

// The source text a node covers.
export const covered = (src, node) => src.slice(node.pos.start.offset, node.pos.end.offset);

// The first node of `type`, depth first.
export function find(node, type) {
  if (node.type === type) return node;
  for (const child of node.children ?? []) {
    const hit = find(child, type);
    if (hit) return hit;
  }
  return null;
}

export function findAll(node, type, out = []) {
  if (node.type === type) out.push(node);
  for (const child of node.children ?? []) findAll(child, type, out);
  return out;
}
