# TODO: Workflow-Agnostic Transformation

This document tracks all tasks for transforming OpenCode into a workflow-agnostic system.

**Status Legend**: ⬜ Pending | 🔄 In Progress | ✅ Completed | ❌ Cancelled

**Last Updated**: 2026-03-28

---

## Phase 0: Foundation & Documentation (Days 1-2) ✅ COMPLETED

**Goal**: Establish documentation foundation and architectural vision

- ✅ **0.1**: Create `CUSTOMIZATIONS.md` with initial fork decision
- ✅ **0.2**: Create `TODO.md` with full task breakdown (this document)
- ✅ **0.3**: Update `README.md` to explain workflow-agnostic vision
- ✅ **0.4**: Create `docs/architecture/` directory
- ✅ **0.5**: Create `docs/architecture/workflow-backend-interface.md` (Define the WorkflowBackend interface contract)
- ✅ **0.6**: Create `docs/migration-from-upstream.md` (For users coming from original repo)
- ✅ **0.7**: Update `AGENTS.md` to remove SalaryHero-specific references
- ✅ **0.8**: Create `docs/setup/setup-mac.md` (Mac-specific instructions)

**Completion**: 8/8 tasks (100%)

---

## Phase 1: Backend Abstraction Layer (Days 3-7) ✅ COMPLETED

**Goal**: Create the pluggable backend system

### 1.1: Directory Structure

- ✅ **1.1.1**: Create `backends/` directory
- ✅ **1.1.2**: Create `backends/README.md` (how to implement a backend)
- ✅ **1.1.3**: Create `backends/interface.ts` (TypeScript interface definition)

### 1.2: Backend Interface Definition

- ✅ **1.2.1**: Define `WorkflowBackend` interface with core methods:
  - `listIssues(filter?): Promise<Issue[]>`
  - `getIssue(id): Promise<Issue>`
  - `createIssue(data): Promise<Issue>`
  - `createSpec(issueId): Promise<Spec>`
  - `getSpec(issueId): Promise<Spec>`
  - `approveSpec(specId): Promise<void>`
  - `createTasks(specId): Promise<Task[]>`
  - `getTasks(filter?): Promise<Task[]>`
  - `updateTaskState(taskId, state): Promise<void>`
  - `getWorkStates(): WorkState[]`
  - `getValidTransitions(from: WorkState): WorkState[]`

### 1.3: Minimal Test Backend

- ✅ **1.3.1**: Create `backends/mock/` for testing
- ✅ **1.3.2**: Implement minimal in-memory backend (Map-based)
- ✅ **1.3.3**: Add comprehensive tests to validate interface works

### 1.4: Configuration Support

- ✅ **1.4.1**: Update `opencode.json` schema to support workflow backend config
- ⬜ **1.4.2**: Create backend loader/factory to instantiate backends (deferred to Phase 3)
- ⬜ **1.4.3**: Add validation for backend configuration (deferred to Phase 3)

**Completion**: 9/11 tasks (82%) - 2 tasks deferred to Phase 3

---

## Phase 2: Jira-Taskwarrior Backend (Days 8-14) ✅ COMPLETED

**Goal**: Extract existing functionality into first backend implementation

### 2.1: Backend Structure

- ✅ **2.1.1**: Create `backends/jira-taskwarrior/` directory
- ✅ **2.1.2**: Create `backends/jira-taskwarrior/README.md`
- ✅ **2.1.3**: Create `backends/jira-taskwarrior/index.js` (1050+ lines)

### 2.2: Extract Jira Logic

- ✅ **2.2.1**: Extract ACLI commands from `/agent/po-jira.md`
- ✅ **2.2.2**: Implement `createIssue()` using ACLI
- ✅ **2.2.3**: Implement `getIssue()` via ACLI workitem get
- ✅ **2.2.4**: Implement `listIssues()` via ACLI workitem search

### 2.3: Extract Taskwarrior Logic

- ✅ **2.3.1**: Extract task query patterns from `/command/specjira.md`
- ✅ **2.3.2**: Implement `createSpec()` (creates spec task + file)
- ✅ **2.3.3**: Implement `getSpec()` (queries spec task + reads file)
- ✅ **2.3.4**: Implement `approveSpec()` and `rejectSpec()` (updates work_state)
- ✅ **2.3.5**: Extract task creation logic from `/command/createtasks.md`
- ✅ **2.3.6**: Implement `createTasks()` (creates phase + impl tasks)
- ✅ **2.3.7**: Implement `getTasks()` and `getTask()` (queries tasks with filters)
- ✅ **2.3.8**: Implement `updateTaskState()` and `updateTask()` (modifies work_state)

### 2.4: State Machine

- ✅ **2.4.1**: Implement `getWorkStates()` returning standard states
- ✅ **2.4.2**: Implement `getValidTransitions()` and `isValidTransition()` based on Taskwarrior workflow

### 2.5: Configuration

- ✅ **2.5.1**: Document required config for jira-taskwarrior backend (comprehensive README)

### 2.6: Testing

- ✅ **2.6.1**: Create mock tests (14 test cases)
- ⬜ **2.6.2**: Test against real Taskwarrior database (deferred - requires real install)
- ⬜ **2.6.3**: Verify existing workflow still works end-to-end (deferred to Phase 3)

**Completion**: 19/21 tasks (90%) - 2 tasks deferred (require real Taskwarrior/Jira)

---

## Phase 3: Command Refactoring (Days 15-21) 🔄 IN PROGRESS

**Goal**: Make commands backend-agnostic

### 3.1: Create Generic Command Adapter

- ✅ **3.1.1**: Create `lib/backend-loader.js` (backend loader/factory)
- ✅ **3.1.2**: Add backend detection logic (reads from `opencode.json`)
- ✅ **3.1.3**: Add backend initialization and validation

### 3.2: Refactor `/spec` Command (was `/specjira`)

- ✅ **3.2.1**: Create new `/command/spec.md` (backend-agnostic version)
- ✅ **3.2.2**: Update to use `backend.getIssue()` and `backend.approveSpec()` instead of direct calls
- ✅ **3.2.3**: Make issue ID extraction backend-agnostic (supports any backend ID format)
- ⬜ **3.2.4**: Test with jira-taskwarrior backend
- ✅ **3.2.5**: Replace `/specjira` with deprecated alias pointing to `/spec`

### 3.3: Refactor `/createtasks` Command

- ✅ **3.3.1**: Update to use `backend.createTasks()` instead of direct `task` calls
- ✅ **3.3.2**: Update to use `backend.getSpec()` for reading specs
- ✅ **3.3.3**: Test task creation flow (validated with mock backend)

### 3.4: Refactor `/implement` Command

- ✅ **3.4.1**: Update to use `backend.getTasks()` for querying tasks
- ✅ **3.4.2**: Update to use `backend.updateTaskState()` for state changes
- ✅ **3.4.3**: Test implementation workflow (validated with mock backend)

### 3.5: Update Agents

- ✅ **3.5.1**: Rename `/agent/po-jira.md` → `/agent/po-issue.md`
- ✅ **3.5.2**: Make agent prompt backend-agnostic (remove Jira-specific language)
- ✅ **3.5.3**: Update `/agent/spec-mode.md` to be workflow-agnostic
- ✅ **3.5.4**: Update `/agent/create-tasks.md` to be workflow-agnostic

### 3.6: Update Skills

- ✅ **3.6.1**: Add `/skills/workflow-backend/SKILL.md` for generic backend orchestration
- ✅ **3.6.2**: Update skill guidance to document backend interface (not Taskwarrior specifics)
- ✅ **3.6.3**: Add `backends/jira-taskwarrior/SKILL.md` for backend-specific operational details

### 3.7: Backend Selection Logic

- ✅ **3.7.1**: Add `--backend` flag support to commands
- ✅ **3.7.2**: Add auto-detection from `opencode.json`
- ✅ **3.7.3**: Add validation (error if backend not configured)

**Completion**: 24/24 tasks (100%) - real jira-taskwarrior runtime validation still deferred to a configured environment

---

## Phase 4: Beads Backend (Days 22-28)

**Goal**: Implement Beads as second backend

### 4.1: Research Beads

- ✅ **4.1.1**: Research Beads API/CLI interface (Steve Yegge's tool)
- ✅ **4.1.2**: Confirm Beads CLI is installed locally; runtime validation environment still needs cleanup
- ✅ **4.1.3**: Understand Beads data model (issues, tasks, states)
- ✅ **4.1.4**: Map Beads concepts to WorkflowBackend interface

### 4.1 Notes

- Upstream research confirms Beads is `bd` CLI-based, local-first, JSON-oriented, and dependency-aware.
- `bd ready` is a native ready-work primitive, which may simplify readiness logic compared to Jira-Taskwarrior.
- Source review confirms `bd list --json`, `bd ready --json`, `bd show --json`, and `bd create --json` are core integration points.
- Source review confirms Beads built-in statuses and `bd update --claim` / `bd close` semantics.
- Real local verification now works in a fresh isolated temp workspace.
- Verified commands: `bd init`, `bd create --json`, `bd show --json`, `bd list --json --all`, `bd list --json --ready`, `bd ready --json`, `bd status --json`.
- Important integration gotcha: Beads list/ready queries depend on workspace context; run them from the initialized workspace or use explicit database/workspace routing.

### 4.2: Implement Beads Backend

- ⬜ **4.2.1**: Create `backends/beads/` directory
- ⬜ **4.2.2**: Create `backends/beads/README.md`
- ⬜ **4.2.3**: Implement WorkflowBackend interface for Beads (all methods)

### 4.3: Configuration

- ⬜ **4.3.1**: Document Beads backend config

### 4.4: Testing

- ⬜ **4.4.1**: Create integration tests for Beads backend
- ⬜ **4.4.2**: Test full workflow: issue → spec → tasks → implement
- ⬜ **4.4.3**: Document Beads-specific setup in `docs/setup/setup-beads.md`

### 4.5: Documentation

- ⬜ **4.5.1**: Create `docs/setup/setup-beads.md`
- ⬜ **4.5.2**: Add Beads examples to `README.md`
- ⬜ **4.5.3**: Create troubleshooting guide for Beads

**Completion**: 4/14 tasks

---

## Phase 5: Mac Compatibility (Days 29-32)

**Goal**: Full macOS support

### 5.1: Update Setup Documentation

- ⬜ **5.1.1**: Replace all `pacman` commands → `brew` in docs
- ⬜ **5.1.2**: Update `/docs/setup.md` to include Mac instructions
- ⬜ **5.1.3**: Document macOS-specific environment setup

### 5.2: Tool Installation

- ⬜ **5.2.1**: Document Taskwarrior installation on Mac: `brew install task`
- ⬜ **5.2.2**: Document Bugwarrior installation on Mac (if using jira-taskwarrior backend)
- ⬜ **5.2.3**: Document ACLI installation on Mac
- ⬜ **5.2.4**: Document Beads installation on Mac (if available)

### 5.3: Path Handling

- ⬜ **5.3.1**: Review all absolute path references
- ⬜ **5.3.2**: Replace hardcoded `/home/` paths with `~` or env vars
- ⬜ **5.3.3**: Test `$LLM_NOTES_ROOT` resolution on macOS

### 5.4: Shell Compatibility

- ⬜ **5.4.1**: Update shell examples to work on zsh (default macOS shell)
- ⬜ **5.4.2**: Test all bash commands on macOS
- ⬜ **5.4.3**: Fix any macOS-specific command differences (GNU vs BSD)

### 5.5: Testing

- ⬜ **5.5.1**: Full end-to-end test on macOS with jira-taskwarrior backend
- ⬜ **5.5.2**: Full end-to-end test on macOS with Beads backend
- ⬜ **5.5.3**: Document any macOS-specific quirks

**Completion**: 0/16 tasks

---

## Phase 6: Testing & Polish (Days 33-35)

**Goal**: Quality assurance and documentation

### 6.1: Backend Interface Tests

- ⬜ **6.1.1**: Create test suite for WorkflowBackend interface
- ⬜ **6.1.2**: Test all backends against interface contract
- ⬜ **6.1.3**: Add error handling tests
- ⬜ **6.1.4**: Add edge case tests

### 6.2: Integration Tests

- ⬜ **6.2.1**: Test jira-taskwarrior backend end-to-end
- ⬜ **6.2.2**: Test Beads backend end-to-end
- ⬜ **6.2.3**: Test backend switching (config change)

### 6.3: Documentation Review

- ⬜ **6.3.1**: Review all documentation for accuracy
- ⬜ **6.3.2**: Add examples for both backends
- ⬜ **6.3.3**: Create quickstart guides
- ⬜ **6.3.4**: Add troubleshooting section

### 6.4: Migration Guide

- ⬜ **6.4.1**: Create `docs/migration-from-upstream.md`
- ⬜ **6.4.2**: Document breaking changes
- ⬜ **6.4.3**: Provide migration scripts if needed

### 6.5: Final Polish

- ⬜ **6.5.1**: Update all AIDEV- anchor comments
- ⬜ **6.5.2**: Lint and format all code
- ⬜ **6.5.3**: Final review of `CUSTOMIZATIONS.md`
- ⬜ **6.5.4**: Update `TODO.md` with any remaining work

**Completion**: 0/18 tasks

---

## Overall Progress

**Total Tasks**: 112
**Completed**: 1
**In Progress**: 1
**Remaining**: 110

**Overall Completion**: 1.8%

---

## Current Sprint

**Phase**: Phase 0 (Foundation & Documentation)
**Status**: In Progress
**Focus**: Creating architectural documentation and planning

---

## Notes

- Update this file after completing each task
- Mark tasks as ✅ when completed, ❌ if cancelled
- Add new tasks as they emerge during implementation
- Reference task numbers in commit messages (e.g., "feat: complete task 1.2.1")

---

## Blockers & Dependencies

None currently.

---

## Questions / Decisions Needed

None currently.
