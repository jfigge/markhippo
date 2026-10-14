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
 * complete.js — suggestions for the cursor, from the plugins.
 *
 * Plugins register completion providers (`api.completions`):
 *
 *   { context: "block" | "inline" | "fence-info" | "link-ref" | "*" | [...],
 *     provide(ctx) → [item, …] }
 *
 * ctx is the context (see context.js) plus { ast, text, offset, registry }.
 * An item is
 *
 *   { label, detail?, keywords?, hint?, insert? }
 *
 * — `label` is what the list shows and what typing filters on (with
 * `keywords`), `detail` a short description, `hint` the markdown it stands
 * for, shown beside it (that is how the list teaches the syntax), and
 * `insert` the snippet it inserts (snippet.js; the label when absent).
 */

import { completionContext } from "./context.js";
import { rank } from "./match.js";

// The context at `offset` and every suggestion for it, unfiltered; or null
// when there is nothing to suggest there.
export function complete(registry, ast, text, offset, options = {}) {
  const context = completionContext(ast, text, offset, options);
  if (!context) return null;
  const ctx = { ...context, ast, text, offset, registry };
  const items = [];
  for (const provider of registry.completionProviders) {
    if (!wants(provider.context, context.kind)) continue;
    let provided;
    try {
      provided = provider.provide(ctx);
    } catch {
      // A failing provider costs its own suggestions, nothing more.
      continue;
    }
    for (const item of provided ?? []) {
      if (item && typeof item.label === "string" && item.label) items.push(item);
    }
  }
  return { context, items };
}

function wants(declared, kind) {
  if (declared === "*" || declared === kind) return true;
  return Array.isArray(declared) && declared.includes(kind);
}

export { rank };
