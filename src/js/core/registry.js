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
 * registry.js — everything plugins can register, and the API they register
 * it through.
 *
 * The core knows no markdown syntax of its own. A registry starts with only
 * what the engine cannot do without: a document to hold blocks, paragraphs
 * for lines nothing else claims, and text. With no plugins at all, every
 * input renders as plain paragraphs. CommonMark itself is a plugin
 * (plugins/commonmark/) and uses exactly this API — the same one a third
 * party would.
 *
 * A plugin is
 *
 *   { id, name?, version?, description?, required?, setup(api) }
 *
 * — `required` marks a plugin the app cannot do without (CommonMark): the
 * plugin list shows it, but it cannot be switched off.
 *
 * and api offers:
 *
 *   blockRule(rule)             a block type: how it starts, continues and
 *                               closes (see parser/blocks.js). Registering a
 *                               type again replaces the earlier rule.
 *   inlineRule(rule)            an inline syntax, by trigger character (see
 *                               parser/inlines.js)
 *   delimiter(spec)             an emphasis-like delimiter run
 *   renderer(type, fn)          how a node type renders to HTML
 *                               (see render/html.js)
 *   fenceRenderer(info, fn)     how a fenced code block with that language
 *                               renders — mermaid, json, yaml…
 *   language(spec)              a programming language for fenced code:
 *                               { id, name?, aliases?, tokenize(code) },
 *                               used by the preview and the edit pane alike
 *                               (see highlight/code.js)
 *   highlighter(type, fn)       how a node type is coloured in the edit pane
 *                               (see highlight/highlight.js)
 *   completions(provider)       autocomplete suggestions: { context, provide }
 *                               (see complete/complete.js)
 *   theme(palette)              a named colour palette with a light and a
 *                               dark mode: { id, name, light, dark }
 *                               (see themes/tokens.js)
 */

// The block types the engine needs to function at all.
const DOCUMENT_RULE = {
  type: "document",
  continue: () => 0,
  finalize() {},
  // Anything but a block that only lives inside one particular parent.
  canContain: (type, parser) => !parser.rule(type).onlyInside,
  acceptsLines: false,
};

const PARAGRAPH_RULE = {
  type: "paragraph",
  continue: (parser) => (parser.blank ? 1 : 0),
  finalize() {},
  canContain: () => false,
  acceptsLines: true,
  inlineContent: true,
};

export function createRegistry() {
  const registry = {
    plugins: [],
    blocks: new Map(),
    blockStarts: [],
    // The set of characters that can begin any block start, or null when a
    // rule did not declare its triggers (so every line must try them all).
    blockTriggers: new Set(),
    inlineRules: [],
    inlineTriggers: new Map(),
    delimiters: new Map(),
    renderers: new Map(),
    fenceRenderers: new Map(),
    // Every name a language answers to (lowercased) → its spec.
    languages: new Map(),
    highlighters: new Map(),
    completionProviders: [],
    themes: new Map(),
  };
  registry.blocks.set("document", DOCUMENT_RULE);
  registry.blocks.set("paragraph", PARAGRAPH_RULE);
  return registry;
}

let order = 0;

// Rebuild the derived lookups after a registration.
function reindex(registry) {
  const byPriority = (a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a._order - b._order;

  // A rule has one start, or several (`starts`) when its type can begin in
  // more than one way — a fenced or an indented code block, say.
  registry.blockStarts = [...registry.blocks.values()]
    .flatMap((r) =>
      (r.starts ?? (r.start ? [r] : [])).map((s, i) => ({
        type: r.type,
        start: s.start,
        priority: s.priority ?? 0,
        triggers: s.triggers,
        _order: r._order + i / 100,
      })),
    )
    .sort(byPriority);
  let triggers = new Set();
  for (const r of registry.blockStarts) {
    if (r.triggers === undefined) {
      triggers = null;
      break;
    }
    for (const ch of r.triggers) triggers.add(ch);
  }
  registry.blockTriggers = triggers;

  registry.inlineTriggers = new Map();
  for (const r of [...registry.inlineRules].sort(byPriority)) {
    for (const ch of r.triggers) {
      if (!registry.inlineTriggers.has(ch)) registry.inlineTriggers.set(ch, []);
      registry.inlineTriggers.get(ch).push(r);
    }
  }
}

function required(obj, keys, what) {
  for (const key of keys) {
    if (obj[key] === undefined) throw new Error(`${what} is missing "${key}"`);
  }
}

// The API handed to one plugin's setup().
export function pluginApi(registry, plugin) {
  const owner = plugin.id;
  return {
    plugin: owner,

    blockRule(rule) {
      required(rule, ["type", "continue", "finalize", "canContain", "acceptsLines"], `Block rule from ${owner}`);
      registry.blocks.set(rule.type, { ...rule, plugin: owner, _order: order++ });
      reindex(registry);
    },

    inlineRule(rule) {
      required(rule, ["name", "triggers", "parse"], `Inline rule from ${owner}`);
      const triggers = typeof rule.triggers === "string" ? [...rule.triggers] : rule.triggers;
      registry.inlineRules.push({ ...rule, triggers, plugin: owner, _order: order++ });
      reindex(registry);
    },

    delimiter(spec) {
      required(spec, ["char", "use", "nodeType"], `Delimiter from ${owner}`);
      registry.delimiters.set(spec.char, { ...spec, plugin: owner });
      reindex(registry);
    },

    renderer(type, fn) {
      registry.renderers.set(type, fn);
    },

    fenceRenderer(info, fn) {
      registry.fenceRenderers.set(info.toLowerCase(), fn);
    },

    language(spec) {
      required(spec, ["id", "tokenize"], `Language from ${owner}`);
      const lang = { ...spec, name: spec.name ?? spec.id, aliases: spec.aliases ?? [], plugin: owner };
      for (const name of [lang.id, ...lang.aliases]) registry.languages.set(name.toLowerCase(), lang);
    },

    highlighter(type, fn) {
      registry.highlighters.set(type, fn);
    },

    theme(palette) {
      required(palette, ["id", "name", "light", "dark"], `Theme from ${owner}`);
      registry.themes.set(palette.id, { ...palette, plugin: owner });
    },

    completions(provider) {
      required(provider, ["context", "provide"], `Completion provider from ${owner}`);
      registry.completionProviders.push({ ...provider, plugin: owner });
    },
  };
}

export function installPlugin(registry, plugin) {
  if (!plugin || typeof plugin.setup !== "function" || !plugin.id) {
    throw new Error("A plugin needs an id and a setup(api) function");
  }
  if (registry.plugins.some((p) => p.id === plugin.id)) {
    throw new Error(`Plugin "${plugin.id}" is already installed`);
  }
  plugin.setup(pluginApi(registry, plugin));
  registry.plugins.push({
    id: plugin.id,
    name: plugin.name ?? plugin.id,
    version: plugin.version ?? null,
    description: plugin.description ?? "",
    required: Boolean(plugin.required),
  });
}
