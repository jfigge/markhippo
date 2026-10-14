// eslint.config.js — ESLint flat configuration for MarkHippo
import js from "@eslint/js";
import globals from "globals";

const unused = ["error", { argsIgnorePattern: "^_", ignoreRestSiblings: true }];

export default [
  {
    ignores: ["dist/**", "build/**", "node_modules/**", "src/vendor/**", "electron/node_modules/**", "electron/dist/**", "electron/web/**"],
  },

  {
    ...js.configs.recommended,
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-undef": "error",
      "no-unused-vars": unused,
    },
  },

  // ── Browser modules ───────────────────────────────────────────────────────
  {
    files: ["src/js/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },

  // ── Pure modules: no DOM, so they run under `node --test` ─────────────────
  // The parser is the source of truth for the whole app (preview, edit-pane
  // highlighting, and later autocomplete, outline, minimap and synced
  // scroll), so it must stay runnable anywhere. Only ES built-ins are defined here, so
  // `no-undef` catches any `document` or `window` that slips in.
  {
    files: [
      "src/js/core/**/*.js",
      "src/js/export/**/*.js",
      "src/js/highlight/**/*.js",
      "src/js/images/**/*.js",
      "src/js/complete/**/*.js",
      "src/js/parser/**/*.js",
      "src/js/render/**/*.js",
      "src/js/plugins/**/*.js",
      "src/js/debounce.js",
      "examples/plugins/**/*.js",
    ],
    languageOptions: {
      globals: { ...globals.es2021, setTimeout: "readonly", clearTimeout: "readonly" },
    },
  },

  // ── The Electron shell: Node's main process, CommonJS ─────────────────────
  // electron/package.json has no "type", so these load as CommonJS, like the
  // sibling apps' main processes. (preload.js runs in the window, sandboxed,
  // but is CommonJS too and sees only what Electron gives a preload.)
  {
    files: ["electron/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },

  // ── Classic (non-module) script loaded in <head> ──────────────────────────
  {
    files: ["src/js/theme.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser },
    },
  },
];
