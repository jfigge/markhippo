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

// main.js — the Electron shell for MarkHippo.
//
// The app is the web page in web/, unchanged: `make desktop-setup` copies
// the repo's src/ there (via dist/). The page notices it is in the desktop
// app by the bridge preload.js gives it (window.markhippoDesktop), and
// then uses the shell for what a browser cannot do:
//
//   * Files. Open and save in place, with the system's dialogs; open from
//     Finder or Explorer, or the command line; ask before unsaved changes
//     are lost. Exports are saved through a dialog rather than downloaded.
//   * Images. A picture pasted into a saved document is written to an
//     assets/ folder beside it and linked by its relative path — the
//     design's plan for the desktop (on the web it goes in the document).
//   * The user's own plugins, from a folder of their own (see policy.js
//     for how they are served).
//
// And it keeps the page to itself:
//
//   * The renderer is sandboxed, with context isolation and no Node; the
//     bridge is a handful of named calls, each checked here.
//   * Nothing leaves the machine but the images a document shows: every
//     other request to the network is cancelled. Plugins run in the page,
//     so this holds for them too.
//   * Links open in the system browser, never in this window.
//
// CommonJS, like the sibling apps' main processes.
"use strict";

const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, nativeTheme, protocol, session, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const policy = require("./policy");

// Before the app is ready: the page's scheme behaves like https — an origin,
// fetch(), secure-context APIs (the clipboard).
protocol.registerSchemesAsPrivileged([
  { scheme: policy.SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
]);

// Development knobs, ignored by a packaged build:
//   MARKHIPPO_WEB_DIR    run the page from the repo's src/ (`make desktop`),
//                        so a reload picks up an edit
//   MARKHIPPO_USER_DATA  a profile of its own (plugins, storage) — the smoke
//                        test's
//   MARKHIPPO_SAVE_DIR   save dialogs answer themselves with this folder and
//                        the name offered — the smoke test's
const DEV = !app.isPackaged;
const WEB_DIR = DEV && process.env.MARKHIPPO_WEB_DIR ? path.resolve(process.env.MARKHIPPO_WEB_DIR) : path.join(__dirname, "web");
if (DEV && process.env.MARKHIPPO_USER_DATA) app.setPath("userData", path.resolve(process.env.MARKHIPPO_USER_DATA));
const SAVE_DIR = DEV && process.env.MARKHIPPO_SAVE_DIR ? path.resolve(process.env.MARKHIPPO_SAVE_DIR) : null;

const HOME_PAGE = "https://hippoherd.com/markhippo/about/";
const WEB_APP = "https://hippoherd.com/markhippo/";
const SOURCE = "https://github.com/jfigge/markhippo";
const PLUGIN_GUIDE = `${SOURCE}/blob/main/docs/PLUGINS.md`;
const DONATE = "https://github.com/sponsors/jfigge";

// The page's own --bg in each theme (src/css/app.css), so the window does
// not flash white before a dark first paint.
const BACKGROUND = { light: "#ffffff", dark: "#1c1c1c" };
const SHOW_TIMEOUT_MS = 3000;

const pluginsDir = () => path.join(app.getPath("userData"), "plugins");
const sessionFile = () => path.join(app.getPath("userData"), "session.json");

// The document: its file (null while untitled), the text last read from or
// written to it, and whether the editor holds changes since.
const doc = { path: null, savedText: "", dirty: false };
// A file asked for before there was a window to open it in (macOS sends
// open-file before ready at launch; the command line is read at start).
let requested = null;
// The page has asked for its first document; a second ask is a reload.
let started = false;

let mainWindow = null;
let guideWindow = null;
let closing = false;

function openExternal(url) {
  shell.openExternal(url).catch((err) => console.error(`[main] could not open ${url}:`, err));
}

const docName = () => (doc.path ? path.basename(doc.path) : "untitled.md");

// ── Serving the page ─────────────────────────────────────────────────────────

function serve() {
  protocol.handle(policy.SCHEME, async (request) => {
    const hit = policy.resolveRequest(request.url, {
      webDir: WEB_DIR,
      pluginsDir: pluginsDir(),
      docDir: doc.path ? path.dirname(doc.path) : null,
    });
    if (!hit) return new Response("Not found", { status: 404 });
    try {
      const body = await fs.readFile(hit.file);
      return new Response(body, { headers: { "content-type": hit.type, "cache-control": "no-store" } });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

function lockDownSession() {
  const ses = session.defaultSession;
  // The network: only images (and audio or video) a document shows. No
  // fetch, no script, no socket, for the page or any plugin in it.
  ses.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] }, (details, callback) => {
    callback({ cancel: details.resourceType !== "image" && details.resourceType !== "media" });
  });
  // One permission, for Export → Copy as rich text; the rest are refused
  // without a prompt.
  const allowed = (permission) => permission === "clipboard-sanitized-write";
  ses.setPermissionRequestHandler((_contents, permission, callback) => callback(allowed(permission)));
  ses.setPermissionCheckHandler((_contents, permission) => allowed(permission));
}

// ── Windows ──────────────────────────────────────────────────────────────────

function showWhenPainted(win) {
  let shown = false;
  const show = () => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    clearTimeout(timer);
    win.show();
  };
  const timer = setTimeout(show, SHOW_TIMEOUT_MS);
  win.once("ready-to-show", show);
  win.webContents.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame) return;
    console.error(`[main] load failed: ${url} — ${desc} (${code})`);
    show();
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    console.error(`[main] renderer gone: ${details.reason}`);
    show();
  });
}

function windowOptions(extra) {
  return {
    minWidth: 720,
    minHeight: 480,
    backgroundColor: nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light,
    // Windows and Linux take the window icon from here; macOS the bundle's.
    icon: path.join(__dirname, "icons", "linux", "512x512.png"),
    show: false,
    ...extra,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, ...extra.webPreferences },
  };
}

// Links and window.open, in any window: the guide in its window, the web
// in the system browser, nothing else anywhere.
function guard(win, { isGuide = false } = {}) {
  win.webContents.on("will-navigate", (event, url) => {
    const verdict = policy.classifyNavigation(url);
    if (verdict === (isGuide ? "guide" : "app")) return;
    event.preventDefault();
    if (verdict === "guide") openGuide();
    else if (verdict === "app") showWindow();
    else if (verdict === "external") openExternal(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    const verdict = policy.classifyNavigation(url);
    if (verdict === "external") openExternal(url);
    else if (verdict === "guide") openGuide();
    else if (verdict === "app") showWindow();
    return { action: "deny" };
  });
  // The page's <title> is not the window's: the document's name is.
  win.on("page-title-updated", (e) => e.preventDefault());
}

function createWindow() {
  const win = new BrowserWindow(
    windowOptions({
      width: 1360,
      height: 900,
      title: "MarkHippo",
      webPreferences: { preload: path.join(__dirname, "preload.js") },
    }),
  );
  showWhenPainted(win);
  guard(win);
  win.webContents.on("render-process-gone", dropQuestions);
  win.webContents.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument) dropQuestions();
  });
  win.on("close", (event) => {
    if (closing || !doc.dirty) return;
    event.preventDefault();
    confirmDiscard().then((ok) => {
      if (!ok) return;
      closing = true;
      win.close();
    });
  });
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
    closing = false;
  });
  win.loadURL(policy.INDEX_URL).catch((err) => console.error("[main] the page failed to load:", err));
  mainWindow = win;
  updateTitle();
  return win;
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// The user guide, which ships in the app, in a window of its own beside
// the document.
function openGuide() {
  if (guideWindow && !guideWindow.isDestroyed()) {
    guideWindow.show();
    guideWindow.focus();
    return;
  }
  guideWindow = new BrowserWindow(windowOptions({ width: 900, height: 860, title: "MarkHippo User Guide" }));
  showWhenPainted(guideWindow);
  guard(guideWindow, { isGuide: true });
  guideWindow.on("closed", () => (guideWindow = null));
  guideWindow.loadURL(policy.GUIDE_URL).catch((err) => console.error("[main] the guide failed to load:", err));
}

function updateTitle() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setTitle(policy.windowTitle({ name: docName(), dirty: doc.dirty, platform: process.platform }));
  if (process.platform === "darwin") {
    mainWindow.setRepresentedFilename(doc.path ?? "");
    mainWindow.setDocumentEdited(doc.dirty);
  }
}

// ── Talking to the page ──────────────────────────────────────────────────────

const send = (channel, data) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data);
};

// A command the page carries out and answers (save before closing, say).
let asked = 0;
const answers = new Map();
function ask(command) {
  if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve(null);
  const id = ++asked;
  return new Promise((resolve) => {
    answers.set(id, resolve);
    send("command", { command, id });
  });
}

// A page that reloads or dies answers nothing: what was asked of it is
// answered "no" (not saved), so a close waiting on it can go on.
function dropQuestions() {
  for (const resolve of answers.values()) resolve(null);
  answers.clear();
}

// ── Documents ────────────────────────────────────────────────────────────────

// Unsaved changes: save them, drop them, or stay. Answers whether to go on.
async function confirmDiscard() {
  if (!doc.dirty || !mainWindow || mainWindow.isDestroyed()) return true;
  showWindow();
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    message: `Do you want to save the changes you made to ${docName()}?`,
    detail: "Your changes will be lost if you don't save them.",
  });
  if (response === 2) return false;
  if (response === 1) {
    await ask("discard");
    doc.dirty = false;
    return true;
  }
  return Boolean(await ask("save"));
}

async function readDocument(file) {
  const text = await fs.readFile(file, "utf8");
  // A byte-order mark is not part of the text.
  return text.replace(/^\uFEFF/, "");
}

function remember(file) {
  if (file) app.addRecentDocument(file);
  fs.mkdir(app.getPath("userData"), { recursive: true })
    .then(() => fs.writeFile(sessionFile(), JSON.stringify({ path: file })))
    .catch(() => {});
}

async function lastSession() {
  try {
    const { path: file } = JSON.parse(await fs.readFile(sessionFile(), "utf8"));
    return typeof file === "string" ? file : null;
  } catch {
    return null;
  }
}

// Open `file` in the window, once any unsaved changes are dealt with.
async function openDocument(file) {
  if (!mainWindow || !started) {
    requested = file;
    showWindow();
    return;
  }
  if (!(await confirmDiscard())) return;
  let text;
  try {
    text = await readDocument(file);
  } catch (err) {
    dialog.showMessageBox(mainWindow, { type: "error", message: `${path.basename(file)} could not be opened.`, detail: err.message });
    return;
  }
  Object.assign(doc, { path: file, savedText: text, dirty: false });
  remember(file);
  updateTitle();
  send("load", { path: file, name: path.basename(file), text });
  showWindow();
}

async function newDocument() {
  if (!(await confirmDiscard())) return;
  Object.assign(doc, { path: null, savedText: "", dirty: false });
  remember(null);
  updateTitle();
  send("load", { path: null, name: "untitled.md", text: "" });
}

async function chooseToOpen() {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    defaultPath: doc.path ? path.dirname(doc.path) : app.getPath("documents"),
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "mkdn"] },
      { name: "Text", extensions: ["txt"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (!canceled && filePaths[0]) await openDocument(filePaths[0]);
}

// Where to save `name`: a dialog, starting in the document's folder — or,
// in the smoke test, the test's folder, without asking.
async function chooseSavePath(name) {
  if (SAVE_DIR) return path.join(SAVE_DIR, name);
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(doc.path ? path.dirname(doc.path) : app.getPath("documents"), name),
    filters: policy.saveFilters(name),
  });
  return canceled || !filePath ? null : filePath;
}

// ── The bridge's calls (preload.js) ──────────────────────────────────────────

const fromMain = (event) => mainWindow && event.sender === mainWindow.webContents;
const isText = (value) => typeof value === "string";

function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!fromMain(event)) throw new Error(`${channel}: not from the editor window`);
    return fn(...args);
  });
}

function bridge() {
  // The first document: a file asked for at launch, else the last session's
  // file, else nothing (the page keeps its own, as on the web). Asked again
  // (a reload), the document as it stands: the page has the text.
  handle("initial", async () => {
    const info = { version: app.getVersion(), platform: process.platform };
    if (started) return { ...info, reload: true, document: { path: doc.path, name: docName(), savedText: doc.savedText } };
    started = true;
    for (const file of [requested, await lastSession()]) {
      if (!file) continue;
      try {
        const text = await readDocument(file);
        Object.assign(doc, { path: file, savedText: text, dirty: false });
        remember(file);
        updateTitle();
        return { ...info, document: { path: file, name: path.basename(file), text } };
      } catch {
        // Moved or deleted since: try the next, or start untitled.
      }
    }
    requested = null;
    return { ...info, document: null };
  });

  handle("open", async (file) => {
    if (isText(file) && file) await openDocument(file);
    else await chooseToOpen();
  });

  handle("new", () => newDocument());

  // Save the text: in place, or (Save As, or untitled) where the user says.
  // Answers { path, name }, or null if the dialog was cancelled.
  handle("save", async ({ text, as } = {}) => {
    if (!isText(text)) throw new Error("save: no text");
    const file = as || !doc.path ? await chooseSavePath(docName()) : doc.path;
    if (!file) return null;
    await fs.writeFile(file, text, "utf8");
    Object.assign(doc, { path: file, savedText: text, dirty: false });
    remember(file);
    updateTitle();
    return { path: file, name: path.basename(file) };
  });

  ipcMain.on("dirty", (event, dirty) => {
    if (!fromMain(event)) return;
    if (doc.dirty === Boolean(dirty)) return;
    doc.dirty = Boolean(dirty);
    updateTitle();
  });

  // An export: text or bytes, saved where the user says.
  handle("save-export", async ({ name, data } = {}) => {
    if (!isText(name) || !(isText(data) || data instanceof Uint8Array)) throw new Error("save-export: bad arguments");
    const file = await chooseSavePath(path.basename(name));
    if (!file) return null;
    await fs.writeFile(file, data);
    return file;
  });

  // Export → Copy as rich text. The system clipboard, from here: a menu
  // command reaches the page with no click of its own to permit a copy.
  handle("copy", ({ html, text } = {}) => {
    if (!isText(html) || !isText(text)) throw new Error("copy: bad arguments");
    clipboard.write({ html, text });
  });

  handle(
    "print",
    () =>
      new Promise((resolve) => {
        mainWindow.webContents.print({ printBackground: false }, (ok, reason) => {
          if (!ok && reason !== "cancelled") console.error(`[main] printing failed: ${reason}`);
          resolve(ok);
        });
      }),
  );

  // The page has put the document in its print area; this prints it to a
  // PDF and saves it.
  handle("print-pdf", async ({ name } = {}) => {
    if (!isText(name)) throw new Error("print-pdf: no name");
    const pdf = await mainWindow.webContents.printToPDF({ printBackground: false, preferCSSPageSize: true });
    const file = await chooseSavePath(path.basename(name));
    if (!file) return null;
    await fs.writeFile(file, pdf);
    return file;
  });

  // A picture pasted into a saved document goes in assets/ beside it.
  // Answers its path relative to the document, or null when the document
  // has no folder yet (untitled: the page embeds the picture instead).
  handle("save-image", async ({ name, type, bytes } = {}) => {
    if (!(bytes instanceof Uint8Array) || !isText(type)) throw new Error("save-image: bad arguments");
    if (!doc.path) return null;
    const dir = path.join(path.dirname(doc.path), "assets");
    await fs.mkdir(dir, { recursive: true });
    const taken = new Set((await fs.readdir(dir)).map((f) => f.toLowerCase()));
    const file = policy.assetName(name, type, (candidate) => taken.has(candidate));
    await fs.writeFile(path.join(dir, file), bytes, { flag: "wx" });
    return `assets/${file}`;
  });

  // The plugins folder's plugins: each .js or .mjs file in it, and each
  // folder holding an index.js or index.mjs — as addresses to import.
  handle("plugins", async () => {
    let entries;
    try {
      entries = await fs.readdir(pluginsDir(), { withFileTypes: true });
    } catch {
      return [];
    }
    const found = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".")) continue;
      const url = (rel) => `${policy.ORIGIN}/@plugins/${rel.split("/").map(encodeURIComponent).join("/")}`;
      if (entry.isFile() && /\.m?js$/i.test(entry.name)) found.push({ name: entry.name, url: url(entry.name) });
      else if (entry.isDirectory()) {
        for (const index of ["index.js", "index.mjs"]) {
          try {
            await fs.access(path.join(pluginsDir(), entry.name, index));
            found.push({ name: entry.name, url: url(`${entry.name}/${index}`) });
            break;
          } catch {
            // Not this one.
          }
        }
      }
    }
    return found;
  });

  handle("open-plugins-folder", async () => {
    await fs.mkdir(pluginsDir(), { recursive: true });
    const failed = await shell.openPath(pluginsDir());
    if (failed) throw new Error(failed);
  });

  ipcMain.handle("reply", (event, id, result) => {
    if (!fromMain(event)) return;
    answers.get(id)?.(result);
    answers.delete(id);
  });
}

// ── The menu ─────────────────────────────────────────────────────────────────
// Roles where there is one, which is what makes ⌘C ⌘V ⌘Z work at all on
// macOS. The page's own shortcuts for these commands step aside in the
// desktop app (src/js/desktop.js), so each runs once.

function buildMenu() {
  const isMac = process.platform === "darwin";
  const command = (name) => () => send("command", { command: name });
  const file = [
    { label: "New", accelerator: "CmdOrCtrl+N", click: () => newDocument() },
    { label: "Open…", accelerator: "CmdOrCtrl+O", click: () => chooseToOpen() },
    ...(isMac ? [{ role: "recentDocuments", submenu: [{ role: "clearRecentDocuments" }] }] : []),
    { type: "separator" },
    { label: "Save", accelerator: "CmdOrCtrl+S", click: command("save") },
    { label: "Save As…", accelerator: "CmdOrCtrl+Shift+S", click: command("save-as") },
    { type: "separator" },
    {
      label: "Export",
      submenu: [
        { label: "PDF…", click: command("export:pdf") },
        { label: "HTML Page…", click: command("export:html") },
        { label: "Rich Text…", click: command("export:rtf") },
        { label: "Plain Text…", click: command("export:text") },
        { type: "separator" },
        { label: "Copy as Rich Text", click: command("export:copy") },
      ],
    },
    { label: "Print…", accelerator: "CmdOrCtrl+P", click: command("export:print") },
    { type: "separator" },
    isMac ? { role: "close" } : { role: "quit" },
  ];
  const view = [
    { label: "Outline", click: command("toggle:outline") },
    { label: "Minimap", click: command("toggle:minimap") },
    { label: "Sync Scroll", click: command("toggle:sync") },
    { type: "separator" },
    { label: "Themes…", click: command("show:themes") },
    { type: "separator" },
    { role: "reload" },
    ...(DEV ? [{ role: "toggleDevTools" }] : []),
    { type: "separator" },
    { role: "resetZoom" },
    { role: "zoomIn" },
    { role: "zoomOut" },
    { type: "separator" },
    { role: "togglefullscreen" },
  ];
  const plugins = [
    { label: "Show Plugins…", click: command("show:plugins") },
    { label: "Open Plugins Folder", click: () => fs.mkdir(pluginsDir(), { recursive: true }).then(() => shell.openPath(pluginsDir())) },
    { label: "Reload Plugins", click: () => mainWindow?.webContents.reload() },
    { type: "separator" },
    { label: "Writing a Plugin", click: () => openExternal(PLUGIN_GUIDE) },
  ];
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    { label: "File", submenu: file },
    { role: "editMenu" },
    { label: "View", submenu: view },
    { label: "Plugins", submenu: plugins },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        { label: "User Guide", click: () => openGuide() },
        { label: "MarkHippo in the Browser", click: () => openExternal(WEB_APP) },
        { label: "MarkHippo on Hippo Herd", click: () => openExternal(HOME_PAGE) },
        { type: "separator" },
        { label: "Source on GitHub", click: () => openExternal(SOURCE) },
        { label: "Support MarkHippo…", click: () => openExternal(DONATE) },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

// macOS hands a document over by event — at launch before ready, and later
// whenever one is opened from Finder or dropped on the dock icon.
app.on("open-file", (event, file) => {
  event.preventDefault();
  if (app.isReady() && started) openDocument(file);
  else requested = file;
});

// One window, one process: a second launch focuses the first, opening the
// document it was given.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  requested = requested ?? policy.documentFromArgv(process.argv);
  app.on("second-instance", (_event, argv) => {
    const file = policy.documentFromArgv(argv);
    if (file) openDocument(path.resolve(file));
    else showWindow();
  });

  app.whenReady().then(() => {
    app.setAboutPanelOptions({
      applicationName: "MarkHippo",
      applicationVersion: app.getVersion(),
      copyright: "Copyright © 2026 Jason Figge · GPL-3.0-or-later",
      credits: "Designed by Jason, Coded by Claude",
      website: HOME_PAGE,
    });
    serve();
    lockDownSession();
    bridge();
    Menu.setApplicationMenu(buildMenu());
    createWindow();
    app.on("activate", showWindow);
  });

  // One document in one window, so closing it quits — on macOS too, as
  // JsonHippo and Chip Hippo do.
  app.on("window-all-closed", () => app.quit());
}
