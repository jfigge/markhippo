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

// preload.js — the bridge between the page and the shell: the only thing
// the page can reach outside itself, as window.markhippoDesktop. Each call
// is one named message, answered in main.js; nothing of Node or Electron
// itself is handed over. src/js/desktop.js is the page's side.
"use strict";

const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("markhippoDesktop", {
  // { version, platform, document: { path, name, text } | null } — or, on
  // a reload, { …, reload: true, document: { path, name, savedText } }.
  // `untitled`: the text the page starts with if there is no file.
  initial: (untitled) => ipcRenderer.invoke("initial", typeof untitled === "string" ? untitled : ""),
  // Open a file: the one given (a dropped file's path), or one chosen.
  open: (file) => ipcRenderer.invoke("open", typeof file === "string" ? file : null),
  newDocument: () => ipcRenderer.invoke("new"),
  // Save the text in place, or where the user chooses (`as`, or untitled):
  // { path, name }, or null if cancelled.
  save: (text, { as = false } = {}) => ipcRenderer.invoke("save", { text, as: Boolean(as) }),
  setDirty: (dirty) => ipcRenderer.send("dirty", Boolean(dirty)),
  // An export, saved where the user chooses: its path, or null.
  saveExport: (name, data) => ipcRenderer.invoke("save-export", { name, data }),
  // Rich text and its plain text onto the system clipboard.
  copy: (html, text) => ipcRenderer.invoke("copy", { html, text }),
  print: () => ipcRenderer.invoke("print"),
  printToPDF: (name) => ipcRenderer.invoke("print-pdf", { name }),
  // A pasted picture into the saved document's assets/: its relative path,
  // or null for an untitled document.
  saveImage: (name, type, bytes) => ipcRenderer.invoke("save-image", { name, type, bytes }),
  plugins: () => ipcRenderer.invoke("plugins"),
  openPluginsFolder: () => ipcRenderer.invoke("open-plugins-folder"),
  // A dropped file's place on disk (the page sees only its contents).
  pathForFile: (file) => webUtils.getPathForFile(file),
  // A document the shell opened (the menu, Finder, a second launch).
  onLoad: (fn) => ipcRenderer.on("load", (_event, doc) => fn(doc)),
  // A command from the menu; when the shell waits on it (save before
  // closing, say), what `fn` answers goes back.
  onCommand: (fn) =>
    ipcRenderer.on("command", async (_event, { command, id }) => {
      let result = null;
      try {
        result = (await fn(command)) ?? null;
      } catch (err) {
        console.error(`MarkHippo: the ${command} command failed:`, err);
      }
      if (id) ipcRenderer.invoke("reply", id, result);
    }),
});
