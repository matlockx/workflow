---
description: Show current workflow state — open tasks, in-progress work, and recent completions
agent: planner
---

# /status — Workflow dashboard

Read-only view of current workflow state from the Beads backend. Does not
modify any state.

## Input

- `$ARGUMENTS`: optional flags
  - `/status` — show open and in-progress tasks
  - `/status --all` — include recently completed tasks
  - `/status BD-<id>` — detailed view of a specific task

## Workflow

1. **Query the backend**

   ```sh
   # Open and in-progress tasks
   bd list --json

   # If --all flag: include completed
   bd list --json --all
   ```

2. **Dashboard view (no specific task)**

   ```
   ━━━ Workflow Status ━━━

   In Progress:
     BD-{id1}: {title} — {state}

   Ready:
     BD-{id2}: {title}
     BD-{id3}: {title}

   Blocked:
     BD-{id4}: {title} — waiting on BD-{id2}
   ```

   If `--all`:
   ```
   Recently Completed:
     BD-{id5}: {title} — closed {when}
     BD-{id6}: {title} — closed {when}
   ```

   If no tasks exist:
   ```
   No active tasks. Start with /plan to create work.
   ```

3. **Detail view (specific task)**

   ```sh
   bd show <task-id> --json
   ```

   ```
   ━━━ Task Detail ━━━
   ID:          BD-{id}
   Title:       {title}
   State:       {state}
   Description: {description}
   Depends on:  {dependency list or "none"}
   Created:     {timestamp}
   Updated:     {timestamp}
   ```

4. **Suggest next action**

   Based on current state:
   - Tasks ready → "Run `/implement --next` to start the next task"
   - Task in progress → "Run `/review` to check quality gates"
   - No tasks → "Run `/plan` to plan new work"

## AIDEV-NOTE: status is read-only

This command NEVER modifies Beads state. It only queries with `bd list`
and `bd show`. Always query the backend — never infer state from git
history or local files.
