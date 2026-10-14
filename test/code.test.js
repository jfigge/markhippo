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

// code.test.js — the code plugin's languages, and how fenced code is
// coloured in the preview: tokens per language, robustness against any
// input, and the seams (api.language, fence renderers first).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createMarkHippo } from "../src/js/core/host.js";
import commonmark from "../src/js/plugins/commonmark/index.js";
import code from "../src/js/plugins/code/index.js";
import { LANGUAGES } from "../src/js/plugins/code/languages.js";
import { languageFor, tokenizeCode } from "../src/js/highlight/code.js";
import { rng } from "./helpers.js";

const mh = createMarkHippo({ plugins: [commonmark, code] });

// The tokens of `src` in language `id`, as "token:text" strings.
function tokens(id, src) {
  const lang = mh.registry.languages.get(id);
  return lang.tokenize(src).map(([f, t, k]) => `${k}:${src.slice(f, t)}`);
}

test("JavaScript: keywords, strings, comments, numbers, calls", () => {
  assert.deepEqual(tokens("js", 'const s = `a${b}` + "c"; // note\nfoo(1.5e3, true)'), [
    "keyword:const",
    "string:`a${b}`",
    'string:"c"',
    "comment:// note",
    "function:foo",
    "number:1.5e3",
    "literal:true",
  ]);
});

test("JavaScript: a slash is a regex only where a value cannot end", () => {
  assert.deepEqual(tokens("js", "x = /a\\/b[/]/g"), ["regex:/a\\/b[/]/g"]);
  assert.deepEqual(tokens("js", "x = a / b / c"), []);
  assert.deepEqual(tokens("js", "return /x/.test(s)"), ["keyword:return", "regex:/x/", "function:test"]);
});

test("TypeScript adds its keywords and types", () => {
  assert.deepEqual(tokens("ts", "interface Point { x: string }"), ["keyword:interface", "type:Point", "type:string"]);
});

test("JSON: keys are properties, values are values", () => {
  assert.deepEqual(tokens("json", '{"a": [1, -2.5e3, true, null], "b": "s"}'), [
    'property:"a"',
    "number:1",
    "number:-2.5e3",
    "literal:true",
    "literal:null",
    'property:"b"',
    'string:"s"',
  ]);
});

test("YAML: keys, comments, scalars, anchors", () => {
  assert.deepEqual(tokens("yaml", "# c\nkey: value # c\nn: 12\nb: true\nurl: http://x\nr: &a x"), [
    "comment:# c",
    "property:key",
    "comment:# c",
    "property:n",
    "number:12",
    "property:b",
    "literal:true",
    "property:url",
    "property:r",
    "variable:&a",
  ]);
});

test("Python: def and class names, decorators, triple-quoted strings", () => {
  assert.deepEqual(tokens("py", '@dec\ndef f(self):\n    """d"""\n    return None'), [
    "meta:@dec",
    "keyword:def",
    "function:f",
    "variable:self",
    'string:"""d"""',
    "keyword:return",
    "literal:None",
  ]);
});

test("HTML: tags, attributes and values, entities, comments", () => {
  assert.deepEqual(tokens("html", '<a href="x">t &amp; u</a><!-- c -->'), [
    "tag:<a",
    "attr:href",
    'string:"x"',
    "tag:>",
    "literal:&amp;",
    "tag:</a",
    "tag:>",
    "comment:<!-- c -->",
  ]);
});

test("CSS: selectors outside blocks, properties and values inside", () => {
  assert.deepEqual(tokens("css", ".a:hover { color: #fff; margin: 0 !important }"), [
    "type:.a",
    "keyword::hover",
    "property:color",
    "number:#fff",
    "property:margin",
    "number:0",
    "keyword:!important",
  ]);
});

test("Shell: keywords only where a command starts, variables, options", () => {
  assert.deepEqual(tokens("sh", 'if [ -n "$X" ]; then echo for $HOME; fi'), [
    "keyword:if",
    "attr:-n",
    'string:"$X"',
    "keyword:then",
    "variable:$HOME",
    "keyword:fi",
  ]);
});

test("Diff: added, removed and header lines", () => {
  assert.deepEqual(tokens("diff", "--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n same"), [
    "meta:--- a",
    "meta:+++ b",
    "meta:@@ -1 +1 @@",
    "deleted:-old",
    "inserted:+new",
  ]);
});

test("every language: tokens in order and in bounds, for any input", () => {
  const rand = rng(11);
  const alphabet = ' \t\n"\'`/\\*#<>{}[]()=:;,.-+!@$&|%?~^0123456789abcxyzABCdefreturnclass';
  for (const lang of LANGUAGES) {
    for (let n = 0; n < 60; n++) {
      let src = "";
      const len = rand(120);
      for (let i = 0; i < len; i++) src += alphabet[rand(alphabet.length)];
      let at = 0;
      for (const [from, to, token] of lang.tokenize(src)) {
        assert.ok(from >= at && to > from && to <= src.length, `${lang.id}: ${JSON.stringify(src)}`);
        assert.match(token, /^[a-z]+$/);
        at = to;
      }
    }
  }
});

test("languages answer to their aliases, case-insensitively, by the info string's first word", () => {
  assert.equal(languageFor(mh.registry, "JS")?.id, "javascript");
  assert.equal(languageFor(mh.registry, "yml title=x")?.id, "yaml");
  assert.equal(languageFor(mh.registry, "c++")?.id, "cpp");
  assert.equal(languageFor(mh.registry, "nosuch"), null);
  assert.equal(languageFor(mh.registry, ""), null);
});

test("the preview colours fenced code in a known language", () => {
  const html = mh.render(mh.parse("```js\nlet x = 1 < 2\n```"));
  assert.equal(
    html,
    '<pre><code class="language-js"><span class="mh-tk-keyword">let</span> x = <span class="mh-tk-number">1</span> &lt; <span class="mh-tk-number">2</span>\n</code></pre>\n',
  );
  // Unknown languages, and hosts without the plugin, render plain.
  assert.equal(mh.render(mh.parse("```nosuch\na<b\n```")), '<pre><code class="language-nosuch">a&lt;b\n</code></pre>\n');
  const bare = createMarkHippo({ plugins: [commonmark] });
  assert.equal(bare.render(bare.parse("```js\nlet x\n```")), '<pre><code class="language-js">let x\n</code></pre>\n');
});

test("a fence renderer for a language wins over colouring it", () => {
  const host = createMarkHippo({
    plugins: [commonmark, code, { id: "json-tree", setup: (api) => api.fenceRenderer("json", (node, r) => r.lit("<tree/>")) }],
  });
  assert.equal(host.render(host.parse("```json\n{}\n```")), "<tree/>");
});

test("a third-party language plugs in, and a faulty tokenizer cannot break the markup", () => {
  const host = createMarkHippo({
    plugins: [
      commonmark,
      {
        id: "weird",
        setup(api) {
          // Overlapping, out-of-bounds and hostile tokens.
          api.language({ id: "weird", tokenize: () => [[0, 2, "keyword"], [1, 3, "string"], [2, 99, '"><script>'], [3, 4, "ok"]] });
        },
      },
    ],
  });
  // An overlap is trimmed to what is left, a bad name dropped.
  const html = host.render(host.parse("```weird\nabcdef\n```"));
  assert.equal(
    html,
    '<pre><code class="language-weird"><span class="mh-tk-keyword">ab</span><span class="mh-tk-string">c</span><span class="mh-tk-ok">d</span>ef\n</code></pre>\n',
  );
});

test("a tokenizer that throws, or answers nonsense, colours nothing and breaks nothing", () => {
  const host = createMarkHippo({
    plugins: [
      commonmark,
      {
        id: "broken",
        setup(api) {
          api.language({ id: "boom", tokenize: () => { throw new Error("boom"); } });
          api.language({ id: "five", tokenize: () => 5 });
        },
      },
    ],
  });
  for (const lang of ["boom", "five"]) {
    const doc = host.parse("```" + lang + "\na<b\n```");
    assert.equal(host.render(doc), `<pre><code class="language-${lang}">a&lt;b\n</code></pre>\n`);
    assert.ok(host.highlight(doc).length > 0);
  }
  assert.deepEqual(host.registry.languages.get("boom").aliases, []);
});

test("CSS: a nested a:hover { is a selector, not a declaration", () => {
  assert.ok(!tokens("css", ".card {\n  a:hover { color: red; }\n}").includes("property:a"));
});

test("long lines stay linear: YAML and CSS", () => {
  for (const [id, src] of [
    ["yaml", "a ".repeat(40000)],
    ["yaml", "[" + "foo bar, ".repeat(5000) + "]"],
    ["css", "a{\n" + "b:".repeat(40000)],
  ]) {
    const t0 = performance.now();
    mh.registry.languages.get(id).tokenize(src);
    assert.ok(performance.now() - t0 < 500, `${id}: ${Math.round(performance.now() - t0)} ms`);
  }
});

test("tokenizing is memoized per language", () => {
  const lang = mh.registry.languages.get("js");
  const a = tokenizeCode(lang, "let a = 1");
  assert.equal(tokenizeCode(lang, "let a = 1"), a);
});

test("the code plugin offers its languages for a fence's info string", () => {
  const provider = mh.registry.completionProviders.find((p) => p.context === "fence-info");
  const labels = provider.provide().map((s) => s.label);
  assert.ok(labels.includes("python") && labels.includes("json") && labels.includes("yaml"));
});
