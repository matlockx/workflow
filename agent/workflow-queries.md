# Workflow Query Instructions

**CRITICAL: Always query the configured workflow backend for task/issue data — never fall back to git history or local files silently.**

When users ask about tasks, issues, or workflow state, use the **configured workflow backend** — not git commands, `feature-progress.json`, or assumptions.

## When to Use the Workflow Backend

Activate these instructions for queries like:

- "what was the last task" / "recent tasks" / "what did I work on"
- "show open issues" / "list issues"
- "what's pending" / "what's in progress" / "what's ready"
- "task status" / "workflow status"
- "what's next" / "what should I work on"
- Any question about issues, specs, tasks, phases, or workflow state

## How to Determine the Backend

1. Read `.agent/config.json` in the project root
2. Check `backend.type` for the configured backend
3. Use the appropriate CLI commands for that backend

Example `.agent/config.json`:
```json
{
  "backend": {
    "type": "beads",
    "config": {
      "workspaceDir": "/path/to/project",
      "specsDir": "./specs"
    }
  }
}
```

## Backend CLI Reference

### Beads (`backend.type: "beads"`)

Uses the `bd` CLI.

| Query | Command |
|-------|---------|
| List all tasks/issues | `bd list --json --all` |
| List open/pending | `bd list --json` |
| Show ready work | `bd ready --json` |
| Show blocked work | `bd blocked --json` |
| Show specific item | `bd show <id> --json` |
| Recent activity | `bd list --json --all --limit 10` |

**Last task query**: Use `bd list --json --all --limit 1` or parse the full list for the most recently updated item.

### Jira-Taskwarrior (`backend.type: "jira-taskwarrior"`)

Uses `task` (Taskwarrior) CLI for local task state and `acli` for Jira issues.

| Query | Command |
|-------|---------|
| List implementation tasks | `task +impl export` |
| List pending tasks | `task +impl status:pending export` |
| List completed tasks | `task +impl status:completed export` |
| Show specific task | `task <uuid> export` |
| List specs | `task +spec export` |
| Show Jira issue | `acli jira workitem show <ISSUE-KEY> --json` |

**Last task query**: Use `task +impl limit:1 export` or sort by modification time.

### File Backend (`backend.type: "file"`)

Uses local JSON files in `.agent/data/`. Query by reading the files directly:

| Query | Location |
|-------|----------|
| Issues | `.agent/data/issues.json` |
| Tasks | `.agent/data/tasks.json` |
| Specs | `.agent/data/specs.json` |

## Response Format

When presenting workflow data to users:

1. **Summarize first** - "You have 3 open tasks, 1 in progress"
2. **Show recent/relevant items** - List the most pertinent items
3. **Suggest next action** - "Run `/resume <id>` to continue" or "The next ready task is..."

Example response:
```
Based on your Beads backend, here's your current workflow state:

**Last task**: opencode-yab — "Create Go skill + fix workflow two-gate confirmation" (closed)

**Open work**: None currently open

**Recently completed**:
1. opencode-yab — Create Go skill + fix workflow... (closed 2h ago)
2. opencode-2rk — Intelligent Workflow Guide (closed yesterday)

No pending tasks. Start new work with `/feature` or `/issue`.
```

## Do NOT Use

- `git log` for task queries — that shows commits, not workflow tasks
- `feature-progress.json` for task queries — that only tracks `/feature` command cursor position (stage/substage/phase), NOT actual task data
- Hardcoded backend assumptions — always check `.agent/config.json` first
- Backend CLIs without verifying the configured backend type

## Error Handling (CRITICAL)

**Never silently fall back to git history when the backend fails.** Silent fallbacks confuse users when their answers don't match their actual workflow state.

If `.agent/config.json` is missing or the backend CLI fails:

1. **Clearly report the failure**:
   ```
   ⚠ Backend query failed: <error message>
   ```

2. **Explain why it might have failed**:
   ```
   The workflow backend (beads) is not accessible. This may be due to:
   - Sandbox permissions (bd needs access to .beads/ directory)
   - Missing credentials or configuration
   - Backend CLI not installed or not in PATH
   ```

3. **Offer explicit alternatives**:
   ```
   I can show git history instead, but this won't reflect your actual task state.
   Would you like me to: [show git history] [help configure backend]?
   ```

### Sandbox Mode Considerations

When running in sandbox mode (e.g., `nono run`), the `bd` CLI may fail because:

- It needs access to `.beads/` directory for state
- It needs access to `.beads-credential-key` for authentication
- The executable path may not be in the sandboxed `$PATH`

**DO NOT** silently fall back to `git log` in this case. Instead, inform the user about the sandbox limitation.

## What `feature-progress.json` Actually Stores

The file `.agent/state/feature-progress.json` is for `/feature` command orchestration ONLY:

- `activeItems[]` — tracks cursor position (stage, substage, phase, taskIndex)
- `skippedSteps[]` — records steps the user skipped
- `history[]` — completed work items

**It does NOT store**:
- Task descriptions or IDs (those live in the backend)
- Issue content (those live in the backend)
- Spec content (those live in spec files)

When users ask "what was the last task", querying `feature-progress.json` would give you cursor position data, not actual task information.

## AIDEV-NOTE: Backend-agnostic query routing

This file teaches the agent to query the configured workflow backend instead of defaulting to git. When adding new backends, update the CLI reference table here. The agent should always read `.agent/config.json` first to determine which CLI to use.

The separation between `feature-progress.json` (cursor state) and backend (task data) is critical. Never conflate these two systems.
