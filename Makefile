# ─────────────────────────────────────────────────────────────────────────────
#  MarkHippo – the discoverable, extensible, developer-friendly markdown editor
#  Static single-page web app (HTML + CSS + vanilla ES modules, no bundler),
#  built on its own CommonMark parser, plus an Electron shell that packages
#  the same page as a desktop app
# ─────────────────────────────────────────────────────────────────────────────
#
# Recipes stick to POSIX sh and to what GNU make 3.81 (the one macOS ships)
# understands, so every target runs unchanged on macOS and Linux — and, for
# the desktop targets, on Windows under MSYS2, which is how the Release
# workflow runs them there.

WORKSPACE := $(realpath $(dir $(realpath $(firstword $(MAKEFILE_LIST)))))
SRC_DIR   := $(WORKSPACE)/src
DIST_DIR  := $(WORKSPACE)/dist
BUILD_DIR := $(WORKSPACE)/build

PORT      ?= 8080
SITE_PORT ?= 8791

# A checkout of jfigge/hippoherd. The app is published at
# hippoherd.com/markhippo/: `make site` copies dist/ into its website/markhippo/.
HIPPOHERD ?= $(WORKSPACE)/../hippoherd

# hippoherd's own page ABOUT MarkHippo lives in the same directory as the app,
# at website/markhippo/about/. It is generated there by hippoherd (`page` in
# its content/hippos.mjs), so the copy below must leave it alone: an rsync
# --delete of dist/ would remove it.
HIPPOHERD_PAGE := /about/

NODE_BIN  := $(WORKSPACE)/node_modules/.bin
HTML      := src/index.html src/docs/index.html

# ── Desktop (Electron) ────────────────────────────────────────────────────────
# JsonHippo's arrangement. electron/ holds the shell and its own package.json,
# so Electron and electron-builder (~400 MB once Electron has fetched its
# binary) are installed only by the desktop targets, never by `make check`. A
# build is staged in build/electron/ — the shell, plus dist/ as web/ — and
# packaged from there; installers land in build/electron/dist/.
ELECTRON_DIR := $(WORKSPACE)/electron
DESKTOP_DIR  := $(BUILD_DIR)/electron

# The one version number is package.json's. desktop-setup stamps it into the
# staged electron/package.json, so the installers carry it, and the Release
# workflow publishes v<it> the first time main is pushed with it.
VERSION := $(shell cd "$(WORKSPACE)" && node -p "require('./package.json').version" 2>/dev/null)

# ── Release signing environment ───────────────────────────────────────────────
# The same variables, read the same way, as JsonHippo's and Rest Hippo's
# Makefiles: credentials for SIGNED installers, all optional — with none set,
# electron-builder emits unsigned artifacts and skips notarization. Locally
# they come from release.env (git-ignored; see release.env.example). The
# certificates are the herd's, so a sibling's file works unchanged:
#
#     make dist-mac RELEASE_ENV=../resthippo/release.env
#
# In CI the same names come from repository secrets (.github/workflows/release.yml).
#
# Each is exported only when set AND non-empty, and unexported otherwise: an
# EMPTY CSC_LINK reads to electron-builder as "a certificate was given", and
# fails the build with "… not a file". `$(value …)` keeps the secret itself out
# of make's expansion.
RELEASE_ENV ?= $(WORKSPACE)/release.env
RELEASE_ENV_VARS := CSC_LINK CSC_KEY_PASSWORD CSC_IDENTITY_AUTO_DISCOVERY \
                    APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID \
                    APPLE_API_KEY APPLE_API_KEY_ID APPLE_API_ISSUER \
                    WIN_CSC_LINK WIN_CSC_KEY_PASSWORD
-include $(RELEASE_ENV)
$(foreach v,$(RELEASE_ENV_VARS),$(if $(strip $(value $(v))),$(eval export $(v)),$(eval unexport $(v))))

# Strip every credential from one electron-builder call and turn off keychain
# discovery, so the result is unsigned whatever release.env or the keychain
# holds. Paired with -c.mac.notarize=false where it is used.
UNSIGNED_ENV := env $(foreach v,$(filter-out CSC_IDENTITY_AUTO_DISCOVERY,$(RELEASE_ENV_VARS)),-u $(v)) CSC_IDENTITY_AUTO_DISCOVERY=false

.DEFAULT_GOAL := help

.PHONY: help install serve test lint validate check dist clean spec-report entities gfm-fixtures vendor site preview-site \
        desktop desktop-setup desktop-pack desktop-smoke dist-mac dist-linux dist-win icons sync-mac

# Third-party code the app ships, in src/vendor/ (see NOTICE), loaded only
# when a document needs it. `make vendor` refreshes it from npm.
TEMML_VERSION   := 0.14.0
MERMAID_VERSION := 12.2.0

help:
	@echo ""
	@echo "  MarkHippo — the discoverable, extensible markdown editor"
	@echo ""
	@echo "  Targets:"
	@echo "    help          List these targets (the default)"
	@echo "    install       Install the dev tooling (npm ci): eslint, html-validate"
	@echo "    serve         Serve src/ at http://localhost:$(PORT)  (PORT=…)"
	@echo "    test          Unit tests + the CommonMark spec suite (node --test)"
	@echo "    lint          ESLint over src/js, test and scripts"
	@echo "    validate      html-validate over the app and the guide"
	@echo "    check         lint + validate + test"
	@echo "    dist          Copy src/ to dist/, ready to publish (no bundling)"
	@echo "    clean         Remove dist/ and build/"
	@echo ""
	@echo "  Extras:"
	@echo "    spec-report   CommonMark conformance, pass rate per spec section"
	@echo "    entities      Regenerate src/js/parser/entities.js from WHATWG's list"
	@echo "    gfm-fixtures  Regenerate the GFM extension examples from cmark-gfm"
	@echo "    vendor        Refresh src/vendor/ (Temml $(TEMML_VERSION), Mermaid $(MERMAID_VERSION)) from npm"
	@echo "    site          Publish: check, then copy the app into a hippoherd"
	@echo "                  checkout's website/markhippo/  (HIPPOHERD=…, default ../hippoherd)"
	@echo "    preview-site  Serve a hippoherd checkout with this app in it, at"
	@echo "                  http://localhost:$(SITE_PORT)/  — before running make site"
	@echo ""
	@echo "  Desktop (Electron):"
	@echo "    desktop       Run the desktop shell on src/ (no packaging)"
	@echo "    desktop-smoke Drive the desktop app through its file, image, plugin"
	@echo "                  and export paths, in a throwaway profile"
	@echo "    desktop-pack  Unsigned app for this machine, no installer (smoke test)"
	@echo "    dist-mac      macOS .dmg, arm64 + x64 — signed and notarized when the"
	@echo "                  credentials are set (RELEASE_ENV=…, default ./release.env)"
	@echo "    dist-win      Windows installers, x64 + arm64 (CI builds them on Windows)"
	@echo "    dist-linux    Linux AppImages, x64 + arm64 (CI builds them on Linux)"
	@echo "    icons         Re-render the app icons from the SVG sources"
	@echo "    sync-mac      Push the macOS signing credentials from RELEASE_ENV to"
	@echo "                  this repo's GitHub Actions secrets (needs gh)"
	@echo ""

# npm ci only re-runs when the lockfile changes; the touch stops make from
# re-running it because node_modules/ is older than package-lock.json.
node_modules: package.json package-lock.json
	npm ci
	@touch node_modules

install: node_modules

# scripts/serve.py is `python3 -m http.server` plus Cache-Control: no-store,
# so a plain reload always runs the modules on disk, never a cached copy.
serve:
	python3 scripts/serve.py $(PORT) "$(SRC_DIR)"

test:
	node --test test/*.test.js

lint: node_modules
	"$(NODE_BIN)/eslint" src/js test scripts electron examples

validate: node_modules
	"$(NODE_BIN)/html-validate" $(HTML)

check: lint validate test

dist: clean
	mkdir -p "$(DIST_DIR)"
	cp -R "$(SRC_DIR)/." "$(DIST_DIR)/"
	@echo "dist/ is ready to publish."

clean:
	rm -rf "$(DIST_DIR)" "$(BUILD_DIR)"

spec-report:
	node scripts/spec-report.mjs

# The table is committed; this only needs re-running if WHATWG ever adds a
# named character reference (it has not since 2013).
entities:
	node scripts/make-entities.mjs

gfm-fixtures:
	node scripts/make-gfm-fixtures.mjs

# Only what the browser loads: Temml's ES module and its stylesheet and font;
# Mermaid's ES build and its code-split chunks (no source maps, no types).
vendor:
	rm -rf "$(BUILD_DIR)/vendor" && mkdir -p "$(BUILD_DIR)/vendor"
	cd "$(BUILD_DIR)/vendor" && npm pack --silent temml@$(TEMML_VERSION) mermaid@$(MERMAID_VERSION) >/dev/null
	cd "$(BUILD_DIR)/vendor" && for f in *.tgz; do mkdir -p "$${f%.tgz}" && tar -xzf "$$f" -C "$${f%.tgz}"; done
	rm -rf "$(SRC_DIR)/vendor/temml" "$(SRC_DIR)/vendor/mermaid"
	mkdir -p "$(SRC_DIR)/vendor/temml" "$(SRC_DIR)/vendor/mermaid/chunks/mermaid.esm.min"
	T="$(BUILD_DIR)/vendor/temml-$(TEMML_VERSION)/package"; \
	  cp "$$T/dist/temml.mjs" "$$T/dist/Temml-Local.css" "$$T/dist/Temml.woff2" "$$T/LICENSE" "$(SRC_DIR)/vendor/temml/"
	M="$(BUILD_DIR)/vendor/mermaid-$(MERMAID_VERSION)/package"; \
	  cp "$$M/dist/mermaid.esm.min.mjs" "$$M/LICENSE" "$(SRC_DIR)/vendor/mermaid/" && \
	  cp "$$M/dist/chunks/mermaid.esm.min/"*.mjs "$(SRC_DIR)/vendor/mermaid/chunks/mermaid.esm.min/"
	@echo "src/vendor/ refreshed."

# Publish the app to hippoherd.com/markhippo/. hippoherd's generator never
# writes website/markhippo/index.html — MarkHippo's entry in its
# content/hippos.mjs puts the page about it at /markhippo/about/ and names
# /markhippo/ as the app — so the copy made here is the only source of the
# app: --delete keeps it an exact mirror of dist/, except for that page
# (HIPPOHERD_PAGE, above), and `check` runs first so a red build never reaches
# the site. Commit and push in hippoherd afterwards; its CI deploys on push.
site: check dist
	@test -d "$(HIPPOHERD)/website" || { echo "No hippoherd checkout at $(HIPPOHERD) — set HIPPOHERD=…"; exit 1; }
	mkdir -p "$(HIPPOHERD)/website/markhippo"
	rsync -a --delete --exclude .DS_Store --exclude "$(HIPPOHERD_PAGE)" "$(DIST_DIR)/" "$(HIPPOHERD)/website/markhippo/"
	@echo "Published to $(HIPPOHERD)/website/markhippo/ — review, commit and push it in hippoherd."

# The whole hippoherd site with this build of the app in it — the index card,
# the page about the app, and the app — without touching the hippoherd checkout.
preview-site: dist
	@test -d "$(HIPPOHERD)/website" || { echo "No hippoherd checkout at $(HIPPOHERD) — set HIPPOHERD=…"; exit 1; }
	rm -rf "$(BUILD_DIR)/site"
	mkdir -p "$(BUILD_DIR)/site"
	cp -R "$(HIPPOHERD)/website/." "$(BUILD_DIR)/site/"
	rsync -a --delete --exclude .DS_Store --exclude "$(HIPPOHERD_PAGE)" "$(DIST_DIR)/" "$(BUILD_DIR)/site/markhippo/"
	@echo "hippoherd with this MarkHippo at http://localhost:$(SITE_PORT)/  (app at /markhippo/, its page at /markhippo$(HIPPOHERD_PAGE))"
	python3 scripts/serve.py $(SITE_PORT) "$(BUILD_DIR)/site"

# ── Desktop (Electron) ───────────────────────────────────────────────────────

# Same idiom as node_modules above, for the shell's own dependencies.
electron/node_modules: electron/package.json electron/package-lock.json
	cd "$(ELECTRON_DIR)" && npm ci --no-audit --no-fund
	@touch "$(ELECTRON_DIR)/node_modules"

# Run the shell straight from electron/ against src/, so a reload (⌘R) picks
# up an edit to the app. DevTools are in the View menu in this mode only.
desktop: electron/node_modules
	cd "$(ELECTRON_DIR)" && MARKHIPPO_WEB_DIR="$(SRC_DIR)" npx electron .

# The desktop app driven end to end, as a user would but without dialogs: a
# throwaway profile and folder, the example plugin installed, a document
# opened from the command line. See scripts/desktop-smoke.mjs.
desktop-smoke: electron/node_modules
	node scripts/desktop-smoke.mjs

# Stage a packageable copy in build/electron/: the shell, the app as web/, its
# dependencies, and package.json's version. `dist` starts from `clean`, so the
# stage is rebuilt from scratch every time.
desktop-setup: dist
	@test -n "$(VERSION)" || { echo "Could not read the version from package.json."; exit 1; }
	mkdir -p "$(DESKTOP_DIR)"
	rsync -a --exclude node_modules --exclude dist --exclude .DS_Store "$(ELECTRON_DIR)/" "$(DESKTOP_DIR)/"
	rsync -a --exclude .DS_Store "$(DIST_DIR)/" "$(DESKTOP_DIR)/web/"
	cd "$(DESKTOP_DIR)" && npm ci --no-audit --no-fund
	cd "$(DESKTOP_DIR)" && npm pkg set version="$(VERSION)"

# A fast, unsigned `--dir` package for this machine: the whole electron-builder
# pack (asar, file list, icons) without an installer or any signing.
desktop-pack: desktop-setup
	cd "$(DESKTOP_DIR)" && $(UNSIGNED_ENV) npx electron-builder --dir --publish never -c.mac.notarize=false
	@echo "  → $(DESKTOP_DIR)/dist/"

# The release installers, one recipe per platform — the entry points the
# Release workflow runs, each on its own platform's runner. Signing follows
# the environment and is never forced off here: with CSC_LINK/CSC_KEY_PASSWORD
# set, the macOS app is signed with that Developer ID certificate, and with
# Apple's notarization credentials as well (APPLE_ID +
# APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID, or APPLE_API_KEY +
# APPLE_API_KEY_ID + APPLE_API_ISSUER) it is notarized and stapled. Without
# CSC_LINK, electron-builder signs with a Developer ID identity from the login
# keychain if it finds one, and builds unsigned if not;
# CSC_IDENTITY_AUTO_DISCOVERY=false forces unsigned.
dist-mac: desktop-setup
	cd "$(DESKTOP_DIR)" && npx electron-builder --mac --publish never
	@echo "  → $(DESKTOP_DIR)/dist/"

dist-linux: desktop-setup
	cd "$(DESKTOP_DIR)" && npx electron-builder --linux --publish never
	@echo "  → $(DESKTOP_DIR)/dist/"

# Windows signing happens in CI, out of band (SignPath, see release.yml), not
# here — unless WIN_CSC_LINK names a code-signing certificate, which no hippo
# has yet.
dist-win: desktop-setup
	cd "$(DESKTOP_DIR)" && npx electron-builder --win --publish never
	@echo "  → $(DESKTOP_DIR)/dist/"

# Re-render electron/icons/ from src/img/markhippo.svg and the macOS variant,
# electron/icons/markhippo-mac-icon.svg. Runs under Electron (see the script).
icons: electron/node_modules
	cd "$(ELECTRON_DIR)" && npx electron ../scripts/make-icons.mjs

# Copy the macOS signing credentials from RELEASE_ENV into this repository's
# Actions secrets, where the Release workflow reads them — the same recipe as
# JsonHippo's and Rest Hippo's sync-mac. Each value is read with $(…), which
# drops the trailing newline, and piped to `gh secret set`, never echoed; an
# empty one is skipped rather than stored, because an empty CSC_LINK breaks
# the build. For the API key route to notarization, set APPLE_API_KEY_ID,
# APPLE_API_ISSUER and APPLE_API_KEY_BASE64 by hand (see release.yml).
sync-mac:
	@test -f "$(RELEASE_ENV)" || { echo "No $(RELEASE_ENV) — copy release.env.example, or set RELEASE_ENV=…"; exit 1; }
	@echo "Pushing the macOS signing secrets from $(RELEASE_ENV) to GitHub…"
	@for k in CSC_LINK CSC_KEY_PASSWORD APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID; do \
		v=$$(grep "^$$k=" "$(RELEASE_ENV)" | head -1 | cut -d= -f2-); \
		if [ -z "$$v" ]; then echo "  ! $$k is missing or empty — skipped"; continue; fi; \
		printf '%s' "$$v" | gh secret set "$$k" --repo jfigge/markhippo && echo "  ✓ $$k"; \
	done
