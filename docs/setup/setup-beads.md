# Beads Setup Guide

Complete setup instructions for using OpenCode with the `beads` workflow backend.

---

## Overview

The Beads backend uses Steve Yegge's [Beads](https://github.com/steveyegge/beads) CLI (`bd`) as the workflow engine.

OpenCode uses Beads for:

- issues and tasks
- dependency tracking
- ready-work detection
- task state updates

Specs are stored as markdown files in `specs/` directory (configurable via `specsDir`).

---

## Prerequisites

- `bd` installed and available in `PATH`
- a writable Beads workspace

Optional but recommended:

- Homebrew on macOS
- isolated Beads workspace per repo

---

## Step 1: Install Beads

### macOS (Homebrew)

```bash
brew install beads
```

### npm

```bash
npm install -g @beads/bd
```

### Go

```bash
go install github.com/steveyegge/beads/cmd/bd@latest
```

Verify:

```bash
bd version
```

---

## Step 2: Initialize a Beads Workspace

From the repository root:

```bash
bd init --stealth
```

This creates a local `.beads/` workspace and starts the Dolt-backed Beads database.

Expected files:

```text
.beads/
  config.yaml
  metadata.json
  dolt/
  dolt-server.log
  dolt-server.pid
  dolt-server.port
```

If you want to verify the workspace:

```bash
bd status --json
bd list --json --all
```

---

## Step 3: Configure OpenCode

Set the workflow backend in `.agent/config.json`:

```json
{
  "backend": {
    "type": "beads",
    "config": {
      "workspaceDir": "/absolute/path/to/your/repo",
      "beadsDir": "/absolute/path/to/your/repo/.beads",
      "specsDir": "./specs"
    }
  }
}
```

### Config fields

- `workspaceDir`: repo root where Beads commands should run
- `beadsDir`: path to the `.beads` workspace
- `specsDir`: directory for spec markdown files (default: `./specs`)
- `homeDir`: optional explicit `HOME` override for Beads execution
- `defaultAssignee`: optional assignee for issue creation

---

## Step 4: Verify the Backend Runtime

From the Beads workspace root:

```bash
bd create "Backend verification" \
  --type task \
  --description "Used to verify OpenCode Beads integration" \
  --json

bd list --json --all
bd ready --json
```

You should see JSON output for the created issue.

Important:

- run Beads commands from the initialized workspace root, or
- configure `workspaceDir` correctly so OpenCode runs `bd` in the right place

This matters because `bd list` / `bd ready` can return misleading empty results when run outside the active Beads workspace context.

---

## Step 5: Use OpenCode Commands

Once configured, the generic workflow commands work with Beads:

```bash
/spec ISSUE-ID --backend=beads
/createtasks ISSUE-ID --backend=beads
/implement ISSUE-ID --backend=beads
```

Or configure `beads` as the default backend and omit the override:

```bash
/spec ISSUE-ID
/createtasks ISSUE-ID
/implement ISSUE-ID
```

---

## Current Backend Status

The Beads backend in this repo is a first-pass implementation.

Currently supported:

- issue creation and retrieval
- task retrieval and updates
- conservative state mapping
- file-backed spec tracking with Beads metadata

Still evolving:

- richer spec lifecycle modeling
- full implementation task generation semantics
- end-to-end validation of the full workflow

---

## Troubleshooting

### `bd init` fails with Dolt startup errors

Try:

```bash
bd dolt killall
rm -rf .beads
bd init --stealth
```

If the issue persists, inspect:

```bash
cat .beads/dolt-server.log
```

### `bd list --json` returns an empty array unexpectedly

Make sure you are running inside the initialized Beads workspace:

```bash
pwd
ls .beads
```

If OpenCode is invoking the backend, verify `workspaceDir` and `beadsDir` in `opencode.json`.

### Warning: `beads.role not configured`

This warning appeared during local validation but did not block JSON command execution.

Re-run init if needed:

```bash
bd init --stealth
```

### Validate the workspace

```bash
bd doctor --json
bd status --json
```

---

## AIDEV-NOTE: Beads setup depends on workspace context

The Beads backend is more sensitive to working-directory and workspace initialization than the Jira-Taskwarrior backend. Keep `workspaceDir` and `.beads` paths explicit in configuration and test commands from the actual Beads workspace root.
