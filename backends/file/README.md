# File Backend

Zero-dependency, file-only workflow backend for OpenCode. No external CLIs or services required.

## Overview

The `file` backend stores everything locally:

| Path | Contents | Git |
|------|----------|-----|
| `specs/ISSUE-1.md` | Spec markdown | ✅ Commit |
| `.agent/state/issues/ISSUE-1.json` | Issue metadata | ❌ Gitignore |
| `.agent/state/tasks/ISSUE-1/tasks.json` | Task list | ❌ Gitignore |
| `.agent/state/counter.json` | Sequential ID counter | ❌ Gitignore |

Specs are committed so they're visible in code review and history. State (issues, tasks) is local-only.

## Configuration

In `opencode.json`:

```json
{
  "workflow": {
    "backend": {
      "type": "file",
      "config": {}
    }
  }
}
```

Optional config overrides:

```json
{
  "workflow": {
    "backend": {
      "type": "file",
      "config": {
        "specsDir": "docs/specs",
        "stateDir": ".agent/state"
      }
    }
  }
}
```

## Usage

```
/issue "Add user authentication"      # Creates ISSUE-1, starts /spec
/spec ISSUE-1                         # Write/review spec (plan mode)
/createtasks ISSUE-1                  # Generate implementation tasks
/implement ISSUE-1                    # Start implementing (build mode)
```

## Issue IDs

Sequential, human-readable: `ISSUE-1`, `ISSUE-2`, etc.  
Task IDs: `ISSUE-1-T1`, `ISSUE-1-T2`, etc.

## Prerequisites

None. Node.js only.

## Gitignore

`opencode-init` adds `.agent/state/` to `.gitignore` automatically.
To also ignore specs (e.g., keep planning notes private), add `specs/` to `.gitignore`.
