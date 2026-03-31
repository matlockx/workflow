---
description: Create implementation tasks for an issue using the configured workflow backend
agent: create-tasks
mode: plan
---

# Create implementation tasks

Create backend-managed implementation tasks for an issue. The task descriptions
come from the issue itself — no separate spec file is required.

## Input

- `$ARGUMENTS`: issue ID (examples: `IN-1373`, `MOCK-1`, `beads:123`)

## Steps

1. **Load and validate the backend**
   - Parse raw arguments with `require('./lib/backend-loader.js').parseBackendOverride($ARGUMENTS)`.
   - If a `--backend` override is provided, use it.
   - Load the backend with `require('./lib/backend-loader.js').getBackend(backendType)`.
   - If initialization fails, stop and show the error.

2. **Extract the issue ID**
   - Read the full issue identifier from the cleaned arguments returned by `parseBackendOverride()`.
   - Preserve backend-specific prefixes.
   - Store it as `issueId`.

3. **Fetch the issue**
   - Call `backend.getIssue(issueId)`.
   - If not found, stop and tell the user.
   - The issue summary and description are the primary input for task generation.

4. **Check for existing implementation tasks**
   - Call `backend.getTasks({ issueId, tags: ['impl'] })`.
   - If implementation tasks already exist:
     - Show a concise summary of the existing tasks.
     - Stop and tell the user tasks already exist for this issue.
   - Do not delete or recreate tasks here because the generic backend interface does not yet expose task deletion.

5. **Preview the task-generation scope**
   - Summarize before creating tasks:
     - issue ID
     - issue summary
     - key themes from the issue description
   - Tell the user you are creating backend-managed implementation tasks for this issue.

6. **Create tasks through the backend**
   - Call `backend.createTasks(issueId)`.
   - Let the backend decide how phases, dependencies, metadata, and backend-specific fields are created.
   - If the backend throws `INVALID_STATE`, surface that clearly.
   - If the backend throws `ALREADY_EXISTS`, tell the user tasks already exist.

7. **Summarize the created task set**
   - Split the returned tasks into:
     - phase tasks: `task.isPhase === true`
     - implementation tasks: `task.isPhase === false`
   - Report:
     - total task count
     - number of phases
     - number of implementation tasks
   - For each phase, list the tasks whose dependencies or metadata indicate they belong to that phase when available.
   - If phase grouping cannot be reconstructed cleanly, report a flat list ordered by returned task order.

8. **Give next-step guidance**
   - Tell the user to begin implementation with `/implement <issueId>`.
   - If the backend is `jira-taskwarrior`, mention they can inspect the created tasks with Taskwarrior commands.

## AIDEV-NOTE: backend-owned task generation

- No spec file is required. Task generation works from the issue description stored in the backend.
- `backend.createTasks(issueId)` is called with the issue ID directly (not a spec ID).
- Existing-task detection uses `backend.getTasks({ issueId, tags: ['impl'] })` because both
  current backends attach `impl` to generated implementation work.
- Regeneration is intentionally not handled here until the interface grows delete/archive support.
- Support optional command-time backend selection via `--backend=<type>`.

## Notes

- Task creation is backend-owned; this command is the orchestrator.
- Keep the command backend-agnostic even if one backend currently uses Taskwarrior under the hood.
