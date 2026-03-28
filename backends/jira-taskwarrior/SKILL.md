---
name: jira-taskwarrior-backend
description: Backend-specific reference for OpenCode's Jira-Taskwarrior workflow. Use this when you need Jira + Taskwarrior operational details such as ACLI setup, Taskwarrior UDAs, query patterns, dual-field state handling, Bugwarrior sync, or backend-specific recovery steps.
license: MIT
metadata:
  workflow: jira-taskwarrior
  audience: ai-agents
---

# Jira-Taskwarrior Backend Skill

Use this skill only when the configured workflow backend is `jira-taskwarrior`.

For generic orchestration rules, use `skills/workflow-backend/SKILL.md`.

## Purpose

This backend combines:

- Jira for issue tracking via `acli`
- Taskwarrior for local task and workflow-state management
- optional Bugwarrior sync for mirroring Jira issues into Taskwarrior

## Backend-specific data model

### Taskwarrior UDAs

| UDA | Purpose | Example |
|-----|---------|---------|
| `jiraid` | Links local work to a Jira issue | `jiraid:IMP-7070` |
| `work_state` | Workflow lifecycle state | `work_state:review` |
| `repository` | Repo name for filtering | `repository:account-api` |

### Tags

| Tag | Purpose |
|-----|---------|
| `+jira` | Jira issue synced by Bugwarrior |
| `+spec` | Spec tracking task |
| `+impl` | Implementation work |
| `+phase` | Phase container |
| `+conditional` | Optional work |

## Dual-field state handling

Taskwarrior tracks both native status and custom workflow state.

- Native status: `pending`, `completed`, `deleted`
- Workflow UDA: `new`, `draft`, `todo`, `inprogress`, `review`, `approved`, `rejected`, `done`

When working through the backend interface, prefer `backend.updateTaskState()` and let the backend synchronize both fields.

Do not issue raw `task done` / `task modify work_state:...` commands from generic command logic.

## Common operational commands

### ACLI

```bash
acli jira auth status
acli jira workitem view PROJ-123 --json
acli jira workitem search --jql "project = PROJ AND assignee = currentUser()" --json
```

### Taskwarrior

```bash
task jiraid:PROJ-123 +spec export
task jiraid:PROJ-123 +impl export
task jiraid:PROJ-123 +phase export
task show | grep "uda\."
```

### Bugwarrior

```bash
bugwarrior-pull
```

## Backend-specific recovery guidance

- Issue missing in Taskwarrior but present in Jira -> run `bugwarrior-pull`
- `acli` auth failures -> run `acli jira auth login --web`
- missing UDA fields -> verify `~/.taskrc` contains the required `jiraid`, `work_state`, and `repository` definitions
- backend init failures -> verify `opencode.json` backend config and local tool installation

## AIDEV-NOTE: backend-local operational detail lives here

Keep Jira + Taskwarrior CLI details in this backend-local skill or backend README, not in generic command and agent prompts.
