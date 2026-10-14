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

// themes.test.js — palettes: that every built-in one is complete and
// readable, the colour arithmetic, the plugin seam, and that themes read
// back from storage or files are cleaned before use.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createMarkHippo } from "../src/js/core/host.js";
import themesPlugin, { PALETTES } from "../src/js/plugins/themes/index.js";
import { HIPPO } from "../src/js/themes/palettes.js";
import { CONTRAST_PAIRS, TOKEN_NAMES, cleanVariant, contrast, normalizeHex } from "../src/js/themes/tokens.js";
import { CUSTOM, cleanPalette, loadCustom, parseThemeFile, themeFile, themeFileName } from "../src/js/themes/store.js";
import { readFileSync } from "node:fs";

const BUILT_IN = [HIPPO, ...PALETTES];

test("every built-in palette defines every token, as #rrggbb, in both modes", () => {
  for (const palette of BUILT_IN) {
    for (const mode of ["light", "dark"]) {
      assert.deepEqual(Object.keys(palette[mode]).sort(), [...TOKEN_NAMES].sort(), `${palette.id} ${mode}`);
      for (const [name, value] of Object.entries(palette[mode])) {
        assert.match(value, /^#[0-9a-f]{6}$/, `${palette.id} ${mode} ${name}`);
      }
    }
  }
});

test("every built-in palette keeps its text at WCAG AA (4.5:1)", () => {
  for (const palette of BUILT_IN) {
    for (const mode of ["light", "dark"]) {
      const vars = palette[mode];
      for (const [fg, bg] of CONTRAST_PAIRS) {
        const ratio = contrast(vars[fg], vars[bg]);
        assert.ok(ratio >= 4.5, `${palette.id} ${mode}: ${fg} on ${bg} is ${ratio.toFixed(2)}`);
      }
    }
  }
});

test("the stylesheet defaults are the Hippo palette", () => {
  const css = readFileSync(new URL("../src/css/app.css", import.meta.url), "utf8") + readFileSync(new URL("../src/css/syntax.css", import.meta.url), "utf8");
  const light = css.slice(0, css.indexOf("@media (prefers-color-scheme: dark)"));
  for (const [name, value] of Object.entries(HIPPO.light)) {
    if (new RegExp(`${name}:`).test(light)) assert.match(css, new RegExp(`${name}: ${value};`), name);
  }
  for (const [name, value] of Object.entries(HIPPO.dark)) {
    assert.match(css, new RegExp(`${name}: ${value};`), `dark ${name}`);
  }
});

test("colour arithmetic", () => {
  assert.equal(normalizeHex("#ABC"), "#aabbcc");
  assert.equal(normalizeHex(" 1A2b3C "), "#1a2b3c");
  assert.equal(normalizeHex("red"), null);
  assert.equal(normalizeHex("#12345"), null);
  assert.equal(normalizeHex("#000;}"), null);
  assert.equal(contrast("#000000", "#ffffff").toFixed(1), "21.0");
  assert.equal(contrast("#777777", "#777777"), 1);
});

test("a variant is cleaned: unknown tokens and bad values never get through", () => {
  const vars = cleanVariant({ "--bg": "#FFF", "--text": "url(x)", "--evil": "#000000", "--accent": "#123" }, HIPPO.light);
  assert.equal(vars["--bg"], "#ffffff");
  assert.equal(vars["--text"], HIPPO.light["--text"]);
  assert.equal(vars["--accent"], "#112233");
  assert.equal("--evil" in vars, false);
  assert.deepEqual(Object.keys(vars), TOKEN_NAMES);
});

test("palettes are a plugin type: api.theme registers them", () => {
  const mh = createMarkHippo({ plugins: [themesPlugin] });
  assert.deepEqual([...mh.registry.themes.keys()], PALETTES.map((p) => p.id));
  assert.equal(mh.registry.themes.get("catppuccin").plugin, "themes");
  assert.throws(() => createMarkHippo({ plugins: [{ id: "x", setup: (api) => api.theme({ id: "y" }) }] }), /missing "name"/);
});

test("custom themes round-trip through storage, cleaned, ids kept, duplicates dropped", () => {
  const mine = cleanPalette({ name: "  Mine  ", light: { "--bg": "#fafafa" }, dark: HIPPO.dark }, `${CUSTOM}abc`);
  assert.equal(mine.name, "Mine");
  const json = JSON.stringify([mine, mine, { name: "no colours" }, 42, null]);
  const back = loadCustom(json);
  assert.equal(back.length, 2);
  assert.deepEqual(back[0], mine);
  assert.ok(back[1].id.startsWith(CUSTOM));
  assert.equal(back[1].light["--bg"], HIPPO.light["--bg"]);
  assert.deepEqual(loadCustom("not json"), []);
  assert.deepEqual(loadCustom(null), []);
});

test("theme files: export, import, and Rest Hippo's format", () => {
  const mine = cleanPalette({ name: "Sea / Sky", light: HIPPO.light, dark: { ...HIPPO.dark, "--accent": "#00ccff" } }, `${CUSTOM}x`);
  const file = themeFile(mine);
  assert.equal(JSON.parse(file)["markhippo-theme"], 1);
  assert.equal(themeFileName(mine), "Sea _ Sky.markhippo-theme.json");
  const back = parseThemeFile(file);
  assert.equal(back.name, "Sea / Sky");
  assert.equal(back.dark["--accent"], "#00ccff");
  assert.notEqual(back.id, mine.id);

  const rest = parseThemeFile(
    JSON.stringify({ "resthippo-theme": "1", name: "Rest", colorScheme: "light", vars: { "--color-base": "#eff1f5", "--color-text": "#4c4f69", "--color-success": "#40a02b" } }),
  );
  assert.equal(rest.light["--bg"], "#eff1f5");
  assert.equal(rest.light["--text"], "#4c4f69");
  assert.equal(rest.light["--tk-string"], "#40a02b");
  assert.equal(rest.dark["--bg"], "#eff1f5");
  assert.equal(rest.light["--accent"], HIPPO.light["--accent"]);

  assert.throws(() => parseThemeFile("{"), /not JSON/);
  assert.throws(() => parseThemeFile("[]"), /no theme colours/);
  assert.throws(() => parseThemeFile('"x"'), /not a theme/);
});
