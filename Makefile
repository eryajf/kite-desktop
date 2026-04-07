# Makefile for Kite Desktop
.PHONY: help install deps wails3-check static dev build desktop-dev desktop-build clean lint golangci-lint format pre-commit test

UI_DIR := ui
DESKTOP_DIR := desktop
DESKTOP_FRONTEND_DIR := $(DESKTOP_DIR)/frontend

UI_INSTALL_STAMP := $(UI_DIR)/node_modules/.install-stamp
DESKTOP_FRONTEND_INSTALL_STAMP := $(DESKTOP_FRONTEND_DIR)/node_modules/.install-stamp

LOCALBIN ?= $(shell pwd)/bin
WAILS3_DEFAULT := $(or $(shell command -v wails3 2>/dev/null),$(shell find "$$HOME/.gvm/pkgsets" -path '*/bin/wails3' -type f -print -quit 2>/dev/null),wails3)
WAILS3 ?= $(WAILS3_DEFAULT)
GOLANGCI_LINT := $(or $(shell command -v golangci-lint 2>/dev/null),$(LOCALBIN)/golangci-lint)
UI_SOURCES := $(shell find $(UI_DIR)/src -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \)) \
	$(UI_DIR)/index.html \
	$(UI_DIR)/package.json \
	$(UI_DIR)/pnpm-lock.yaml \
	$(UI_DIR)/vite.config.ts \
	$(UI_DIR)/tsconfig.json \
	$(UI_DIR)/tsconfig.app.json \
	$(UI_DIR)/tsconfig.node.json \
	$(UI_DIR)/eslint.config.js

.DEFAULT_GOAL := build

$(LOCALBIN):
	mkdir -p $(LOCALBIN)

help: ## Show this help message
	@echo "Available targets:"
	@awk 'BEGIN {FS = ":.*?## "} /^[[:alnum:]_.\/-]+:.*?## / {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

$(UI_INSTALL_STAMP): $(UI_DIR)/package.json $(UI_DIR)/pnpm-lock.yaml
	@echo "📦 Installing shared web UI dependencies..."
	pnpm --dir $(UI_DIR) install --frozen-lockfile
	@mkdir -p $(dir $@)
	@touch $@

$(DESKTOP_FRONTEND_INSTALL_STAMP): $(DESKTOP_FRONTEND_DIR)/package.json $(DESKTOP_FRONTEND_DIR)/package-lock.json
	@echo "📦 Installing desktop bootstrap frontend dependencies..."
	npm --prefix $(DESKTOP_FRONTEND_DIR) ci
	@mkdir -p $(dir $@)
	@touch $@

install: deps ## Install all desktop development dependencies

deps: $(UI_INSTALL_STAMP) $(DESKTOP_FRONTEND_INSTALL_STAMP) ## Install desktop and shared UI dependencies
	@echo "📦 Downloading Go modules..."
	go mod download

wails3-check: ## Ensure the Wails v3 CLI is available
	@command -v $(WAILS3) >/dev/null 2>&1 || { \
		echo "wails3 not found. Install it with: go install github.com/wailsapp/wails/v3/cmd/wails3@<version>"; \
		exit 1; \
	}

static: $(UI_INSTALL_STAMP) $(UI_SOURCES) ## Build the shared web UI embedded by the desktop app
	@echo "📦 Building shared web UI..."
	pnpm --dir $(UI_DIR) run build

dev: wails3-check static $(DESKTOP_FRONTEND_INSTALL_STAMP) ## Run the desktop app in Wails dev mode
	cd $(DESKTOP_DIR) && $(WAILS3) dev -config ./build/config.yml

build: wails3-check static $(DESKTOP_FRONTEND_INSTALL_STAMP) ## Build the desktop app with Wails v3
	cd $(DESKTOP_DIR) && $(WAILS3) build

desktop-dev: dev ## Backward-compatible alias for desktop development

desktop-build: build ## Backward-compatible alias for desktop builds

clean: ## Clean desktop build artifacts and installed frontend dependencies
	rm -rf $(UI_DIR)/dist $(UI_DIR)/node_modules internal/server/static
	rm -rf $(DESKTOP_FRONTEND_DIR)/dist $(DESKTOP_FRONTEND_DIR)/node_modules
	rm -rf $(DESKTOP_DIR)/bin kite bin
	@echo "🧹 Cleaned desktop build artifacts"

lint: $(UI_INSTALL_STAMP) golangci-lint ## Run linters
	@echo "🔍 Running linters..."
	go vet ./...
	$(GOLANGCI_LINT) run
	pnpm --dir $(UI_DIR) run lint

golangci-lint: $(LOCALBIN) ## Download golangci-lint locally if necessary
	test -f $(GOLANGCI_LINT) || curl -sSfL https://golangci-lint.run/install.sh | sh -s v2.7.2

format: $(UI_INSTALL_STAMP) ## Format Go and shared web UI sources
	@echo "✨ Formatting code..."
	go fmt ./...
	pnpm --dir $(UI_DIR) run format

pre-commit: format lint ## Run the standard pre-commit checks
	@echo "✅ Pre-commit checks completed!"

test: $(UI_INSTALL_STAMP) ## Run backend and shared web UI tests
	@echo "🧪 Running tests..."
	go test -v ./...
	pnpm --dir $(UI_DIR) run test
