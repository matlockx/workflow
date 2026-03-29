---
description: Implement tasks from an approved spec using the configured workflow backend
agent: build
mode: build
---

# Implement backend-managed tasks

Execute implementation tasks for an issue sequentially using the configured workflow backend. This workflow is resumable.

## Input

- `$ARGUMENTS`: issue ID (examples: `IMP-7070`, `MOCK-1`, `beads:123`)

## Workflow

1. **Load and validate the backend**
   - Parse raw arguments with `require('./lib/backend-loader.js').parseBackendOverride($ARGUMENTS)`.
   - If a `--backend` override is provided, use it.
   - Load the backend with `require('./lib/backend-loader.js').getBackend(backendType)`.
   - If initialization fails, stop and show the error.

2. **Resolve the issue and spec**
   - Read the full issue ID from the cleaned arguments returned by `parseBackendOverride()`.
   - Call `backend.getIssue(issueId)` to confirm the issue exists.
   - Call `backend.getSpec(issueId)` to confirm a spec exists.
   - If no spec exists, stop and tell the user to create one first with `/spec <issueId>`.
   - If `spec.state !== 'approved'`, stop and tell the user the spec must be approved before implementation begins.

3. **Load all implementation tasks**
   - Call `backend.getTasks({ issueId, tags: ['impl'] })`.
   - If no implementation tasks exist, stop and tell the user to create them first with `/createtasks <issueId>`.
   - Split the tasks into:
     - phase tasks: `task.isPhase === true`
     - implementation tasks: `task.isPhase === false`

4. **Find the active phase**
   - Prefer a phase in state `inprogress`.
   - Otherwise, if a phase is in `review`, stop and tell the user that phase is awaiting validation/commit approval before work can continue.
   - Otherwise, pick the first phase still in a non-terminal state (`todo`, `new`, or `draft`) using returned order.
   - If there are no remaining open phases:
     - Report that all phases are complete.
     - Suggest creating a PR or finishing the issue workflow.
     - Stop.
   - If starting a new phase:
     - Call `backend.updateTaskState(phase.id, 'inprogress')`.
     - Report that the phase has started.

5. **Resolve tasks for the active phase**
   - Determine the tasks that belong to the active phase.
   - Prefer explicit backend metadata when available.
   - Otherwise, use dependency relationships:
     - tasks that depend on the phase task belong to that phase
   - Keep only tasks for the current phase.

6. **Find the next ready task**
   - Ignore tasks already in terminal states (`done`, `approved`).
   - For each remaining task, inspect its dependencies.
   - Treat a dependency as satisfied when the dependent task is in `done` or `approved`.
   - Pick the first task whose non-phase dependencies are all satisfied.
   - If no task is ready:
     - If all phase tasks are complete, go to Step 9.
     - Otherwise stop and tell the user the phase is blocked by dependencies.

7. **Present the task and implement it**
   - Read `spec.filePath` for context as needed.
   - Present the next task with:
     - issue ID
     - phase name
     - task ID
     - task description
     - dependency summary
     - spec path
   - Ask: `Ready to implement? (yes/no/edit)`
   - If `no`, stop and tell the user they can resume with `/implement <issueId>`.
   - If `edit`, incorporate the user guidance and re-present the task.
   - If `yes`, implement the task following the approved spec.

8. **Mark the task complete**
   - After implementation, summarize what changed and ask: `Mark as completed? (yes/no/edit)`
   - If `no`, stop and leave the task unchanged.
   - If `edit`, continue implementation work.
   - If `yes`, call `backend.updateTaskState(task.id, 'done')`.
   - Then return to Step 6 to find the next ready task in the same phase.

9. **Move the phase into review**
   - When all tasks in the phase are complete, call `backend.updateTaskState(phase.id, 'review')`.
   - Report that the phase is complete and awaiting validation.
   - Ask the user to run tests and complete a commit before the phase is approved.
   - If you can run tests in the current session, do so.
   - If tests fail, stop and keep the phase in `review`.

10. **Approve the phase after validation**
   - Once tests and commit/review steps are complete, call `backend.updateTaskState(phase.id, 'approved')`.
   - Report that the phase is approved.
   - Then return to Step 4 to continue with the next phase if one exists.

## Implementation protocol

### Before coding

- Confirm the spec is approved.
- Confirm the active task is ready based on dependencies.
- Read the relevant sections of `spec.filePath` before changing code.

### Task routing

- Tasks involving tests or TDD: write failing tests first.
- Tasks involving implementation: follow the spec design and existing code patterns.
- Tasks involving integration or validation: verify behavior across boundaries, not just isolated units.

### Completion quality gate

- Code follows project conventions.
- Error handling matches the design.
- Public APIs remain typed/documented when needed.
- Relevant `AIDEV-NOTE` anchors are added near non-obvious logic.
- No hardcoded secrets.
- Scope stays aligned with the current task.

## AIDEV-NOTE: backend-driven implementation workflow

- `/implement` should never query Taskwarrior directly.
- Phase and task state changes must flow through `backend.updateTaskState()`.
- Resumability comes from backend task states, not command-local memory.
- Use backend task dependency data to determine readiness.
- Support optional command-time backend selection via `--backend=<type>`.

## Notes

- This command preserves the original resumable workflow, but the backend now owns state transitions.
- Phase approval remains a human checkpoint after tests and commit hygiene.
- Backend-specific inspection commands may still be suggested in user output, but not used as the command's core logic.
