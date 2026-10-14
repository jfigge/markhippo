/*
 * Copyright 2026 Jason Figge
 *
 * This file is part of MarkHippo.
 *
 * MarkHippo is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * MarkHippo is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with MarkHippo. If not, see <https://www.gnu.org/licenses/>.
 */

// policy.js — the desktop shell's decisions, made without Electron: where
// the page may go, which file answers each request on the app's own scheme,
// and the names it gives files. Pure, so `node --test` covers it
// (test/desktop.test.js).
//
// The page is served on app://markhippo/, not file://, so it has an origin
// of its own: its CSP's 'self', its fetch() of its stylesheets for export,
// its module imports and its localStorage all work as they do on the web.
// Under that origin, two directories are mapped besides the app itself:
//
//   /@plugins/…   the user's plugins folder — scripts and what they load —
//                 so a plugin is 'self' to the page's CSP, as the bundled
//                 ones are
//   /@doc/<ref>   an IMAGE the open document refers to: <ref> is the image's
//                 address as the document wrote it (one path segment,
//                 percent-encoded — src/js/desktop.js writes it), resolved
//                 against the document's folder. Only image files are ever
//                 served from there.
"use strict";

const path = require("node:path");

const SCHEME = "app";
const HOST = "markhippo";
const ORIGIN = `${SCHEME}://${HOST}`;
const INDEX_URL = `${ORIGIN}/index.html`;
const GUIDE_URL = `${ORIGIN}/docs/index.html`;

const EXTERNAL = new Set(["http:", "https:", "mailto:"]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const IMAGES = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".svg", ".ico"]);
const PLUGIN_FILES = new Set([".js", ".mjs", ".css", ".json", ".woff", ".woff2", ...IMAGES]);
const DOCUMENT = /\.(?:md|markdown|mdown|mkd|mkdn|txt)$/i;

const extOf = (file) => path.extname(file).toLowerCase();

/**
 * Where the page may navigate, or open a window to.
 *
 *   "app"       the editor's own page (a reload)
 *   "guide"     the bundled user guide, which opens in a window of its own
 *   "external"  http(s) or mailto: handed to the system browser or mail app
 *   "deny"      anything else — a local file, data: or blob: URLs,
 *               javascript:, another page of the app, another scheme
 *
 * @param {string} url
 * @returns {"app"|"guide"|"external"|"deny"}
 */
function classifyNavigation(url) {
  let target;
  try {
    target = new URL(url);
  } catch {
    return "deny";
  }
  if (EXTERNAL.has(target.protocol)) return "external";
  if (target.protocol !== `${SCHEME}:` || target.host !== HOST) return "deny";
  const page = target.pathname;
  if (page === "/" || page === "/index.html") return "app";
  if (page === "/docs" || page === "/docs/" || page === "/docs/index.html") return "guide";
  return "deny";
}

// `rel` inside `root`, or null if it would leave it.
function inside(root, rel) {
  const base = path.resolve(root);
  const file = path.resolve(base, rel.replace(/^[/\\]+/, ""));
  return file === base || file.startsWith(base + path.sep) ? file : null;
}

/**
 * The file that answers a request on app://markhippo/, and its type — or
 * null, which is a 404.
 *
 * @param {string} url
 * @param {{ webDir: string, pluginsDir?: string|null, docDir?: string|null }} dirs
 * @returns {{ file: string, type: string } | null}
 */
function resolveRequest(url, { webDir, pluginsDir = null, docDir = null }) {
  let target;
  try {
    target = new URL(url);
  } catch {
    return null;
  }
  if (target.protocol !== `${SCHEME}:` || target.host !== HOST) return null;

  if (target.pathname.startsWith("/@doc/")) {
    if (!docDir) return null;
    const file = documentImage(target.pathname.slice("/@doc/".length), docDir);
    return file ? { file, type: MIME[extOf(file)] } : null;
  }

  let page;
  try {
    page = decodeURIComponent(target.pathname);
  } catch {
    return null;
  }
  if (page.includes("\0")) return null;

  if (page.startsWith("/@plugins/")) {
    if (!pluginsDir) return null;
    const file = inside(pluginsDir, page.slice("/@plugins/".length));
    return file && PLUGIN_FILES.has(extOf(file)) ? { file, type: MIME[extOf(file)] } : null;
  }

  const file = inside(webDir, page.endsWith("/") ? `${page}index.html` : page);
  if (!file) return null;
  return { file, type: MIME[extOf(file)] ?? "application/octet-stream" };
}

// An image the document refers to: its address (as written in the
// document, percent-encoded once more to make it one segment) resolved
// against the document's folder. Only image files; anywhere the address
// leads, as a markdown file's images may be in a folder beside it.
function documentImage(segment, docDir) {
  let ref;
  try {
    ref = decodeURIComponent(segment);
  } catch {
    return null;
  }
  ref = ref.replace(/[?#].*$/, "");
  // The document's address is itself a URL: %20 is a space.
  let rel = ref;
  try {
    rel = decodeURI(ref);
  } catch {
    // A stray % in a file name: take it as written.
  }
  if (!rel || rel.includes("\0") || /^[a-z][a-z0-9+.-]*:/i.test(rel)) return null;
  const file = path.resolve(docDir, rel);
  return IMAGES.has(extOf(file)) ? file : null;
}

// ── Files ────────────────────────────────────────────────────────────────────

const isDocument = (file) => DOCUMENT.test(file);

// The document a launch asks for: the last command-line argument that names
// a markdown file (flags and the app's own path are passed over).
function documentFromArgv(argv) {
  for (let i = argv.length - 1; i > 0; i--) {
    const arg = argv[i];
    if (!arg.startsWith("-") && isDocument(arg)) return arg;
  }
  return null;
}

// A pasted image's file name, for the assets folder: the name it came with,
// tidied ("Screen Shot 1.png" → "screen-shot-1.png"), or "image", with an
// extension for its type, and a number when `taken(name)` says it is used.
const EXTENSIONS = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/avif": ".avif",
  "image/bmp": ".bmp",
};

function assetName(name, type, taken) {
  const base =
    String(name ?? "")
      .replace(/\.[a-z0-9]{1,5}$/i, "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image";
  const ext = EXTENSIONS[type] ?? ".png";
  let candidate = base + ext;
  for (let n = 2; taken(candidate); n++) candidate = `${base}-${n}${ext}`;
  return candidate;
}

// The window's title. On macOS the title bar shows the file's icon and an
// edited dot of its own (setRepresentedFilename, setDocumentEdited), so the
// name alone; elsewhere the dot goes in the title.
function windowTitle({ name, dirty, platform }) {
  if (platform === "darwin") return name;
  return `${dirty ? "• " : ""}${name} — MarkHippo`;
}

// The save dialog's filter for a file name, by its extension.
const FILTERS = {
  md: "Markdown",
  html: "HTML page",
  rtf: "Rich text",
  txt: "Plain text",
  pdf: "PDF",
};

function saveFilters(name) {
  const ext = path.extname(name).slice(1).toLowerCase();
  const extensions = ext === "md" ? ["md", "markdown"] : [ext];
  return FILTERS[ext] ? [{ name: FILTERS[ext], extensions }] : [];
}

module.exports = {
  SCHEME,
  HOST,
  ORIGIN,
  INDEX_URL,
  GUIDE_URL,
  assetName,
  classifyNavigation,
  documentFromArgv,
  isDocument,
  resolveRequest,
  saveFilters,
  windowTitle,
};
