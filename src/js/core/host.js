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
 * host.js — the plugin host: the one object the app (and anything else)
 * talks to.
 *
 *   const mh = createMarkHippo({ plugins: [commonmark] });
 *   const doc = mh.parse(text);            // positioned AST
 *   const next = mh.reparse(doc, newText); // incremental, same result
 *   const html = mh.render(doc, { sourceLines: true });
 *   const segments = mh.highlight(doc);    // edit-pane colouring
 *   const found = mh.complete(doc, text, offset); // autocomplete
 */

import { createRegistry, installPlugin } from "./registry.js";
import { parse } from "../parser/index.js";
import { reparse } from "../parser/incremental.js";
import { HtmlRenderer } from "../render/html.js";
import { highlight } from "../highlight/highlight.js";
import { complete } from "../complete/complete.js";

export function createMarkHippo({ plugins = [] } = {}) {
  const registry = createRegistry();
  for (const plugin of plugins) installPlugin(registry, plugin);

  return {
    registry,
    get plugins() {
      return registry.plugins.slice();
    },
    use(plugin) {
      installPlugin(registry, plugin);
      return this;
    },
    parse: (text) => parse(registry, text),
    reparse: (prev, text, options) => reparse(registry, prev, text, options),
    render: (ast, options) => new HtmlRenderer(registry, options).render(ast),
    highlight: (ast) => highlight(registry, ast),
    complete: (ast, text, offset, options) => complete(registry, ast, text, offset, options),
  };
}
