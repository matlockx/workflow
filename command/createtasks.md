---
description: Create implementation tasks from an approved spec using the configured workflow backend
agent: create-tasks
mode: plan
---

# Create implementation tasks from spec

Create backend-managed implementation tasks from an approved spec.

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

3. **Resolve the spec through the backend**
   - Call `backend.getSpec(issueId)`.
   - If the spec does not exist, stop and tell the user to create one first with `/spec <issueId>`.
   - Use the returned object as the canonical source for:
     - `spec.id`
     - `spec.filePath`
     - `spec.state`

4. **Validate the spec state**
   - If `spec.state !== 'approved'`:
     - Warn the user that task generation should only happen from an approved spec.
     - Stop and tell them to finish and approve the spec with `/spec <issueId>`.
   - Do not bypass approval in the generic workflow.

5. **Read the spec file for operator context**
   - Read `spec.filePath`.
   - Confirm the spec includes both `## Requirements` and `## Design`.
   - If either section is missing or clearly incomplete, stop and tell the user to complete the spec first.
   - Use the file contents only to summarize what is about to be generated; the backend remains responsible for actual task creation.

6. **Check for existing implementation tasks**
   - Call `backend.getTasks({ issueId, tags: ['impl'] })`.
   - If implementation tasks already exist:
     - Show a concise summary of the existing tasks.
     - Stop and tell the user tasks already exist for this issue.
   - Do not delete or recreate tasks here because the generic backend interface does not yet expose task deletion.

7. **Preview the task-generation scope**
   - Summarize the spec before creating tasks:
     - issue ID
     - spec path
     - notable requirement themes
     - notable design components/files
   - Tell the user you are creating backend-managed implementation tasks from the approved spec.

8. **Create tasks through the backend**
   - Call `backend.createTasks(spec.id)`.
   - Let the backend decide how phases, dependencies, metadata, and backend-specific fields are created.
   - If the backend throws `INVALID_STATE`, surface that clearly.
   - If the backend throws `ALREADY_EXISTS`, tell the user tasks already exist.

9. **Summarize the created task set**
   - Split the returned tasks into:
     - phase tasks: `task.isPhase === true`
     - implementation tasks: `task.isPhase === false`
   - Report:
     - total task count
     - number of phases
     - number of implementation tasks
     - spec path
   - For each phase, list the tasks whose dependencies or metadata indicate they belong to that phase when available.
   - If phase grouping cannot be reconstructed cleanly, report a flat list ordered by returned task order.

10. **Give next-step guidance**
   - Tell the user to begin implementation with the backend's ready or todo tasks.
   - If the backend is `jira-taskwarrior`, mention they can inspect the created tasks with Taskwarrior commands.

## AIDEV-NOTE: backend-owned task generation

- The generic command should use `backend.getSpec()` and `backend.createTasks()` instead of recreating backend logic in markdown instructions.
- Existing-task detection uses `backend.getTasks({ issueId, tags: ['impl'] })` because both current backends attach `impl` to generated implementation work.
- Regeneration is intentionally not handled here until the interface grows delete/archive support.
- Support optional command-time backend selection via `--backend=<type>`.

## Notes

- Task creation is backend-owned; this command is the orchestrator.
- Keep the command backend-agnostic even if one backend currently uses Taskwarrior under the hood.
- This command replaces the legacy Jira-specific / Taskwarrior-specific flow.
