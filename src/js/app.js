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
 * app.js — wires the page together: the editor, the parser host, the
 * preview, the status bar, files and the theme.
 *
 * Everything the parser and renderer do happens in MarkHippo's own modules
 * (core/, parser/, render/, plugins/); this file is only the page.
 */

import { createMarkHippo } from "./core/host.js";
import commonmark from "./plugins/commonmark/index.js";
import code from "./plugins/code/index.js";
import { HIGHLIGHT_DELAY_MS, RENDER_DELAY_MS, debounce } from "./debounce.js";
import { Autocomplete } from "./autocomplete.js";
import { EditorView } from "./editor-view.js";
import { PreviewView } from "./preview-view.js";
import { StatusBar } from "./status-bar.js";
import { SAMPLE } from "./sample.js";

const STORE = {
  document: "markhippo.document",
  filename: "markhippo.filename",
  theme: "markhippo.theme",
  split: "markhippo.split",
  plugins: "markhippo.plugins",
};

const $ = (id) => document.getElementById(id);

const storage = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage blocked or full: the document still works, it just will not
      // be there next time.
    }
  },
};

// The bundled plugin set, in installation order. The extensions (tables,
// footnotes, task lists, math, Mermaid) arrive as further plugins here.
const BUNDLED = [commonmark, code];

// Plugins the user switched off, by id (required ones cannot be).
function loadDisabled() {
  try {
    return new Set(JSON.parse(storage.get(STORE.plugins) ?? "{}").disabled ?? []);
  } catch {
    return new Set();
  }
}

let disabled = loadDisabled();
const createHost = () => createMarkHippo({ plugins: BUNDLED.filter((p) => p.required || !disabled.has(p.id)) });
let mh = createHost();

const RENDER_OPTIONS = { html: true, safe: true, sourceLines: true };

// The last parse, and the text it was of.
let ast = null;
let parsedText = null;
let filename = storage.get(STORE.filename) || "untitled.md";

const status = new StatusBar({ parse: $("mh-status-parse"), doc: $("mh-status-doc"), cursor: $("mh-status-cursor") });
const preview = new PreviewView($("mh-preview"), document.querySelector(".mh-pane--preview"));
const editor = new EditorView($("mh-source"), {
  highlight: $("mh-highlight"),
  scroller: $("mh-source-pane"),
  onChange: () => {
    scheduleParse();
    scheduleRender();
  },
  onCursor: (pos) => status.cursor(pos),
});

// Two speeds: the edit pane's colours follow a short pause in typing, the
// preview a longer one. Both use the same parse — incremental, so the
// frequent one stays cheap.
const scheduleParse = debounce(parse, HIGHLIGHT_DELAY_MS);
const scheduleRender = debounce(render, RENDER_DELAY_MS);

// Suggestions are the fast path: they open on the keystroke, parsing first
// (incrementally) if the colours have not caught up yet.
editor.attach(
  new Autocomplete(editor, $("mh-complete"), {
    complete(text, offset, options) {
      parse();
      return mh.complete(ast, text, offset, options);
    },
  }),
);

function parse() {
  const text = editor.value;
  if (text === parsedText) return;
  const t0 = performance.now();
  const stats = { mode: "full" };
  ast = ast ? mh.reparse(ast, text, { stats }) : mh.parse(text);
  editor.highlight(text, mh.highlight(ast));
  parsedText = text;
  status.parsed(stats, performance.now() - t0, ast);
  storage.set(STORE.document, text);
}

function render() {
  scheduleParse.cancel();
  parse();
  preview.update(mh.render(ast, RENDER_OPTIONS));
}

// Start again from a full parse — a new document, or a new set of plugins.
function rerender() {
  scheduleParse.cancel();
  scheduleRender.cancel();
  ast = null;
  parsedText = null;
  render();
}

// ── Files ──────────────────────────────────────────────────────────────────

function load(text, name) {
  filename = name;
  storage.set(STORE.filename, name);
  $("mh-filename").textContent = name;
  editor.setValue(text);
  rerender();
}

async function openFile(file) {
  if (!file) return;
  load(await file.text(), file.name);
}

function save() {
  scheduleRender.flush();
  const blob = new Blob([editor.value], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = /\.(md|markdown|mdown|mkd|txt)$/i.test(filename) ? filename : `${filename}.md`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const fileInput = $("mh-file-input");
fileInput.addEventListener("change", () => {
  openFile(fileInput.files[0]);
  fileInput.value = "";
});

const ACTIONS = {
  new: () => {
    load("", "untitled.md");
    editor.focus();
  },
  open: () => fileInput.click(),
  save,
};

document.addEventListener("click", (e) => {
  const button = e.target.closest("[data-action]");
  if (button && ACTIONS[button.dataset.action]) ACTIONS[button.dataset.action]();
});

document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
  const key = e.key.toLowerCase();
  if (key === "s") {
    e.preventDefault();
    save();
  } else if (key === "o") {
    e.preventDefault();
    ACTIONS.open();
  }
});

// Drag and drop a file anywhere on the page.
const drop = $("mh-drop");
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");
document.addEventListener("dragenter", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  drop.hidden = false;
});
document.addEventListener("dragover", (e) => {
  if (hasFiles(e)) e.preventDefault();
});
document.addEventListener("dragleave", (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) drop.hidden = true;
});
document.addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  drop.hidden = true;
  openFile(e.dataTransfer.files[0]);
});

// ── Split pane ─────────────────────────────────────────────────────────────

const main = $("mh-main");
const divider = $("mh-divider");

function setSplit(percent) {
  const p = Math.min(80, Math.max(20, percent));
  main.style.setProperty("--split", `${p}%`);
  divider.setAttribute("aria-valuenow", String(Math.round(p)));
  storage.set(STORE.split, String(p));
}

divider.addEventListener("pointerdown", (e) => {
  divider.setPointerCapture(e.pointerId);
  divider.classList.add("mh-divider--dragging");
});
divider.addEventListener("pointermove", (e) => {
  if (!divider.hasPointerCapture(e.pointerId)) return;
  const rect = main.getBoundingClientRect();
  setSplit(((e.clientX - rect.left) / rect.width) * 100);
});
divider.addEventListener("pointerup", (e) => {
  divider.releasePointerCapture(e.pointerId);
  divider.classList.remove("mh-divider--dragging");
});
divider.addEventListener("keydown", (e) => {
  const now = Number(divider.getAttribute("aria-valuenow"));
  if (e.key === "ArrowLeft") setSplit(now - 5);
  else if (e.key === "ArrowRight") setSplit(now + 5);
  else return;
  e.preventDefault();
});

// ── Theme ──────────────────────────────────────────────────────────────────

const THEMES = [
  { id: "system", label: "System", icon: "mh-i-system" },
  { id: "light", label: "Light", icon: "mh-i-sun" },
  { id: "dark", label: "Dark", icon: "mh-i-moon" },
];
const themeButton = $("mh-theme");

function showTheme(id) {
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
  themeButton.querySelector("use").setAttribute("href", `#${theme.icon}`);
  themeButton.querySelector(".mh-theme-label").textContent = theme.label;
  themeButton.setAttribute("aria-label", theme.id === "system" ? "Theme: follow the system" : `Theme: ${theme.label}`);
}

themeButton.addEventListener("click", () => {
  const current = document.documentElement.dataset.theme ?? "system";
  const next = THEMES[(THEMES.findIndex((t) => t.id === current) + 1) % THEMES.length].id;
  if (next === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = next;
  storage.set(STORE.theme, next);
  showTheme(next);
});

// ── Plugins ────────────────────────────────────────────────────────────────

const pluginList = $("mh-plugin-list");

function showPlugins() {
  const running = new Set(mh.plugins.map((p) => p.id));
  pluginList.replaceChildren(
    ...BUNDLED.map((plugin) => {
      const li = document.createElement("li");
      li.className = "mh-plugin";
      const label = document.createElement("label");
      label.className = "mh-plugin-head";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.dataset.plugin = plugin.id;
      box.checked = running.has(plugin.id);
      box.disabled = Boolean(plugin.required);
      const name = document.createElement("span");
      name.className = "mh-plugin-name";
      name.textContent = plugin.name ?? plugin.id;
      label.append(box, name);
      if (plugin.version) {
        const version = document.createElement("span");
        version.className = "mh-plugin-version";
        version.textContent = plugin.version;
        label.append(version);
      }
      if (plugin.required) {
        const badge = document.createElement("span");
        badge.className = "mh-plugin-badge";
        badge.textContent = "Required";
        label.append(badge);
      }
      const desc = document.createElement("p");
      desc.className = "mh-plugin-desc";
      desc.textContent = plugin.description ?? "";
      li.append(label, desc);
      return li;
    }),
  );
}

pluginList.addEventListener("change", (e) => {
  const id = e.target.dataset.plugin;
  if (!id) return;
  if (e.target.checked) disabled.delete(id);
  else disabled.add(id);
  storage.set(STORE.plugins, JSON.stringify({ disabled: [...disabled] }));
  mh = createHost();
  rerender();
});

$("mh-plugins-open").addEventListener("click", () => {
  showPlugins();
  $("mh-plugins").showModal();
});

// ── About ──────────────────────────────────────────────────────────────────

$("mh-about-open").addEventListener("click", () => $("mh-about").showModal());

// ── Start ──────────────────────────────────────────────────────────────────

showTheme(document.documentElement.dataset.theme ?? "system");
const split = Number(storage.get(STORE.split));
if (split) setSplit(split);
$("mh-filename").textContent = filename;
editor.setValue(storage.get(STORE.document) ?? SAMPLE);
render();
window.addEventListener("beforeunload", () => scheduleParse.flush());
