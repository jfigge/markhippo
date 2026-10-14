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
 * theme-manager.js — which palette, which mode, and putting them on the
 * page.
 *
 * Two independent choices: the MODE (System, Light, Dark — the header
 * button) and the PALETTE (Hippo, the plugins' palettes, the user's own —
 * the Themes dialog). The page gets the chosen palette's colours for the
 * resolved mode as custom properties on <html>; they override the defaults
 * in the stylesheets. The colours are also cached for js/theme.js, which
 * puts them on the page before the first paint next time.
 *
 * Storage: markhippo.theme (the mode), markhippo.palette (the palette id),
 * markhippo.themes (the user's palettes), markhippo.theme.vars (the cache).
 */

import { HIPPO } from "./themes/palettes.js";
import { TOKEN_NAMES, cleanVariant } from "./themes/tokens.js";
import { isCustom, loadCustom } from "./themes/store.js";

export const MODES = ["system", "light", "dark"];
const KEYS = { mode: "markhippo.theme", palette: "markhippo.palette", custom: "markhippo.themes", cache: "markhippo.theme.vars" };

export class ThemeManager {
  // `storage`: { get(key), set(key, value) }; `registry`: () => the plugin
  // registry, whose `themes` the plugins registered.
  constructor({ storage, registry }) {
    this.storage = storage;
    this.registry = registry;
    this.root = document.documentElement;
    this.mode = MODES.includes(storage.get(KEYS.mode)) ? storage.get(KEYS.mode) : "system";
    this.paletteId = storage.get(KEYS.palette) || HIPPO.id;
    this.custom = loadCustom(storage.get(KEYS.custom));
    // While the theme editor shows one mode of a palette, whatever the
    // user's mode: { palette, mode }.
    this.preview = null;
    this.listeners = new Set();
    this.media = window.matchMedia("(prefers-color-scheme: dark)");
    this.media.addEventListener("change", () => {
      if (this.mode === "system") this.apply();
    });
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  // Every palette there is: Hippo, the plugins', the user's.
  palettes() {
    const fromPlugins = [...(this.registry()?.themes?.values() ?? [])].map((p) => ({
      ...p,
      light: cleanVariant(p.light, HIPPO.light),
      dark: cleanVariant(p.dark, HIPPO.dark),
    }));
    return [HIPPO, ...fromPlugins, ...this.custom];
  }

  find(id) {
    return this.palettes().find((p) => p.id === id) ?? null;
  }

  // The palette in use: the chosen one, or Hippo if it is gone (its plugin
  // switched off, say — switch it back on and the choice returns).
  current() {
    return this.find(this.paletteId) ?? HIPPO;
  }

  resolvedMode() {
    if (this.mode !== "system") return this.mode;
    return this.media.matches ? "dark" : "light";
  }

  setMode(mode) {
    this.mode = MODES.includes(mode) ? mode : "system";
    this.storage.set(KEYS.mode, this.mode);
    this.apply();
  }

  choose(id) {
    if (!this.find(id)) return;
    this.paletteId = id;
    this.storage.set(KEYS.palette, id);
    this.apply();
  }

  // ── The user's palettes ──────────────────────────────────────────────────

  saveCustom() {
    this.storage.set(KEYS.custom, JSON.stringify(this.custom));
  }

  addCustom(palette) {
    this.custom.push(palette);
    this.saveCustom();
    this.choose(palette.id);
  }

  updateCustom(id, change) {
    const palette = this.custom.find((p) => p.id === id);
    if (!palette) return;
    change(palette);
    this.saveCustom();
    this.apply();
  }

  deleteCustom(id) {
    this.custom = this.custom.filter((p) => p.id !== id);
    this.saveCustom();
    if (this.paletteId === id) this.choose(HIPPO.id);
    else this.apply();
  }

  isCustom(id) {
    return isCustom({ id });
  }

  // ── Putting it on the page ───────────────────────────────────────────────

  setPreview(preview) {
    this.preview = preview;
    this.apply();
  }

  apply() {
    const palette = this.preview ? (this.find(this.preview.palette) ?? this.current()) : this.current();
    const mode = this.preview ? this.preview.mode : this.resolvedMode();
    const vars = palette[mode];
    for (const name of TOKEN_NAMES) this.root.style.setProperty(name, vars[name]);
    this.root.style.colorScheme = mode;
    // The stylesheets' own light/dark defaults follow too.
    this.root.dataset.theme = mode;
    if (!this.preview) {
      const active = this.current();
      this.storage.set(KEYS.cache, JSON.stringify({ light: active.light, dark: active.dark }));
    }
    for (const fn of this.listeners) fn();
  }
}
