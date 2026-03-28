---
name: workflow-backend
description: Reference for backend-agnostic workflow orchestration in OpenCode. Use this skill when commands or agents need to reason about issues, specs, implementation tasks, phase progression, dependency readiness, or workflow state transitions through the configured backend interface.
license: MIT
metadata:
  workflow: backend-agnostic
  audience: ai-agents
---

# Workflow Backend Skill

Reference for interacting with OpenCode's workflow system through the `WorkflowBackend` interface rather than direct backend CLIs.

## Core principle

Commands and agents should orchestrate workflow through the configured backend.

- Do use backend methods such as `getIssue()`, `getSpec()`, `createTasks()`, and `updateTaskState()`.
- Do not embed backend-specific CLI commands in generic command or agent logic.
- Treat backend-returned IDs, file paths, metadata, and state as the source of truth.

## Core entities

### Issue

High-level work item tracked by the configured backend.

Typical fields:
- `id`
- `summary`
- `description`
- `status`
- `url`
- `metadata`

### Spec

Technical specification derived from an issue.

Typical fields:
- `id`
- `issueId`
- `filePath`
- `state`
- `createdAt`
- `approvedAt`

### Task

Granular implementation work item created from an approved spec.

Typical fields:
- `id`
- `description`
- `specId`
- `issueId`
- `state`
- `tags`
- `isPhase`
- `depends`
- `metadata`

## Core lifecycle

### Spec lifecycle

- `draft` -> `approved`
- `approved` -> `rejected` or back to draft depending on backend behavior

### Implementation lifecycle

Recommended generic flow:

- Phase: `todo` -> `inprogress` -> `review` -> `approved`
- Task: `todo` -> `inprogress` -> `review` -> `done`

Backends may compress or adapt this flow, but commands should use backend transition APIs rather than hardcoding assumptions.

## Required orchestration patterns

### Validate issue-backed planning

For `/spec` flows:

1. `backend.getIssue(issueId)`
2. `backend.getSpec(issueId)` if checking for existing spec
3. `backend.createSpec(issueId)` if no spec exists
4. `backend.approveSpec(spec.id)` when the user approves

### Create implementation tasks

For `/createtasks` flows:

1. `backend.getSpec(issueId)`
2. Verify the spec state is approved
3. `backend.getTasks({ issueId, tags: ['impl'] })` to detect existing implementation work
4. `backend.createTasks(spec.id)`

### Resume implementation

For `/implement` flows:

1. `backend.getSpec(issueId)`
2. `backend.getTasks({ issueId, tags: ['impl'] })`
3. Identify active phase from backend task state
4. Identify ready tasks from dependency satisfaction
5. `backend.updateTaskState(task.id, nextState)` as work progresses

## Readiness rules

A task is ready when all of its required dependencies are satisfied.

Generic dependency check:

1. Read the task's `depends` list
2. Resolve each dependency through task data already loaded, or via `backend.getTask(depId)` if needed
3. Treat terminal states like `done` or `approved` as satisfied unless the backend documents otherwise
4. Only start tasks whose dependencies are satisfied

## Source of truth rules

- Backend state is authoritative for issue/spec/task existence and lifecycle
- Spec markdown file is authoritative for planning content
- Command logic should not recreate backend persistence rules in markdown instructions

## Error handling

Handle backend errors by code when possible:

- `NOT_FOUND` -> resource missing; guide the user to the prior workflow step
- `INVALID_STATE` -> resource exists but is not ready for the requested action
- `INVALID_TRANSITION` -> attempted an unsupported state change
- `BACKEND_UNAVAILABLE` -> backend cannot be reached or initialized
- `PERMISSION_DENIED` -> credentials or authorization problem
- `VALIDATION_FAILED` -> bad creation or update input

## When to use a backend-specific skill

Use this skill for generic orchestration.

Use a backend-specific skill or backend README when you need:

- CLI invocation details
- backend-specific tags or metadata
- installation and auth setup
- backend-only recovery steps

Example:
- `skills/workflow-backend/SKILL.md` -> generic command/agent behavior
- `backends/jira-taskwarrior/README.md` -> Jira + Taskwarrior details

## AIDEV-NOTE: keep generic orchestration here

This skill should describe backend-interface behavior and shared workflow concepts. Do not reintroduce Taskwarrior-only commands here; keep those in the Jira-Taskwarrior backend documentation.
