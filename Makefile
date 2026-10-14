# ─────────────────────────────────────────────────────────────────────────────
#  MarkHippo – the discoverable, extensible, developer-friendly markdown editor
#  Static single-page web app (HTML + CSS + vanilla ES modules, no bundler),
#  built on its own CommonMark parser
# ─────────────────────────────────────────────────────────────────────────────
#
# Recipes stick to POSIX sh and to what GNU make 3.81 (the one macOS ships)
# understands, so every target runs unchanged on macOS and Linux.

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

.DEFAULT_GOAL := help

.PHONY: help install serve test lint validate check dist clean spec-report entities gfm-fixtures vendor site preview-site

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
	"$(NODE_BIN)/eslint" src/js test scripts

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
