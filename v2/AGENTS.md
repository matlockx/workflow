# AGENTS.md — Project Configuration

<!-- Load the portable workflow framework -->
@.opencode/INSTRUCTIONS.md

## Project Overview

<!-- Describe what this project does, its architecture, and key decisions -->

## Build & Test Commands

<!-- Project-specific commands -->

| Action | Command |
|--------|---------|
| Build | `go build ./...` |
| Test | `go test ./... -race` |
| Lint | `golangci-lint run` |
| Coverage | `go test -cover ./...` |

## Project Conventions

<!-- Team-specific rules that supplement the portable framework -->

- <!-- e.g., "Use stdlib only — no third-party HTTP routers" -->
- <!-- e.g., "All errors must include request ID for tracing" -->
- <!-- e.g., "Database migrations use golang-migrate" -->

## Directory Structure

<!-- Key directories and what lives in them -->

```
├── cmd/            # Entry points
├── internal/       # Private packages
├── docs/adr/       # Architecture Decision Records
└── ...
```

## Domain Glossary

<!-- Project-specific terms that AI should understand -->

| Term | Definition |
|------|-----------|
| <!-- e.g., "Widget" --> | <!-- "A configurable UI component..." --> |
