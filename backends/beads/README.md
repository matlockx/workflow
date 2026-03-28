# Beads Backend

Workflow backend for [Beads](https://github.com/steveyegge/beads), implemented around the `bd` CLI.

## Overview

Beads is a local-first, Dolt-backed graph issue tracker for AI agents. Based on upstream documentation, the backend model is a strong fit for OpenCode's workflow abstraction because it provides:

- CLI-first task and issue management via `bd`
- JSON output for agent-safe parsing
- dependency-aware ready-task detection
- hierarchical IDs for epics, tasks, and subtasks
- local project initialization via `bd init`
- cross-platform installation support (macOS, Linux, Windows, FreeBSD)

## Upstream References

- Repo: `https://github.com/steveyegge/beads`
- CLI binary: `bd`
- Install docs: upstream `docs/INSTALLING.md`
- Agent workflow docs: upstream `AGENT_INSTRUCTIONS.md`

## Initial mapping to `WorkflowBackend`

This is the planned mapping for Phase 4 implementation.

## Confirmed upstream characteristics

Based on upstream README, FAQ, troubleshooting docs, and `cmd/bd/main.go`:

- `bd` is CLI-first and optimized for agent use
- commands are designed around `--json` output
- `bd ready` is a first-class command for actionable work with no open blockers
- Beads distinguishes blocked vs ready work through dependency semantics
- core state updates are done with `bd update` and `bd close`
- dependency creation is done through `bd dep add`
- storage is local and Dolt-backed, not remote-SaaS-backed
- Beads can work without git via `BEADS_DIR` and `bd init --stealth`
- issue IDs are hash-based (`bd-a1b2`) and can be hierarchical (`bd-a3f8.1`)
- `bd list`, `bd ready`, and `bd show` have explicit `--json` output paths in the CLI source
- `bd create` supports direct issue creation with title, type, priority, assignee, notes, acceptance, metadata, and dependency flags

## Important differences from Jira-Taskwarrior

- There is no separate synced issue source like Jira + Bugwarrior
- There is no obvious dual-field `status` + `work_state` model like Taskwarrior UDAs
- Beads appears to own both issue and task state directly in one system
- Ready-work detection is native (`bd ready`) rather than derived manually from raw task exports
- The backend wrapper will likely be thinner for dependency and readiness logic, but thicker for mapping Beads-specific status to OpenCode work states

## Confirmed Beads status model from source

Upstream `internal/types/types.go` defines built-in statuses:

- `open`
- `in_progress`
- `blocked`
- `deferred`
- `closed`
- `pinned`
- `hooked`

Behavioral notes from upstream source:

- `bd update --claim` atomically claims an issue and sets it to `in_progress`
- `bd ready` excludes `in_progress`, `blocked`, `deferred`, and `hooked`
- `bd close` transitions an issue to `closed`
- `bd blocked` exposes blocked issues separately
- custom statuses exist, but Phase 4 should start with built-in status support only

### Issue management

- `listIssues()` -> likely `bd list --json` with optional filtering
- `getIssue(id)` -> `bd show <id> --json`
- `createIssue(data)` -> `bd create ... --json`

More concrete command assumptions from source:

- `bd list --json` returns a JSON array of enriched issue objects with counts and computed parent info
- `bd show <id> --json` returns detailed issue records including dependencies, dependents, comments, labels, and parent info
- `bd create "Title" --json` returns the created issue object

### Spec management

Beads does not appear to have a first-class “spec” concept in the same way Jira-Taskwarrior does, so the likely strategy is:

- keep spec markdown in portable notes storage
- create a Beads issue/task to represent the planning/spec artifact when needed
- store spec path in Beads notes/description/metadata if supported

Open question for implementation: whether specs should be represented as:

1. a dedicated Beads issue type/tag,
2. a planning child task under the issue,
3. or file-only state with Beads issue metadata.

### Task management

Likely mapping:

- `createTasks(specId)` -> create Beads tasks/subtasks from spec analysis using `bd create`
- `getTasks(filter)` -> Beads list/ready/show commands with `--json`
- `getTask(taskId)` -> `bd show <id> --json`
- `updateTaskState(taskId, state)` -> `bd update`, `bd close`, and claim/progress flags as appropriate

Likely concrete mapping:

- claim/start work -> `bd update <id> --claim` or status update flags
- mark in progress -> `bd update <id> --status in_progress`
- mark done -> `bd close <id> "reason"`
- fetch blocked work -> `bd blocked --json`
- fetch ready work -> `bd ready --json`

### Conservative OpenCode state mapping for initial backend

Recommended initial mapping:

| OpenCode state | Beads status | Notes |
|---|---|---|
| `new` | `open` | Use only if we need a distinct pre-planning issue state |
| `draft` | `open` | Spec/planning work likely stored as open planning issue + file state |
| `todo` | `open` | Default pending work |
| `inprogress` | `in_progress` | Direct mapping |
| `review` | `hooked` or metadata-backed `open` | No exact built-in review state; avoid guessing until CLI validation |
| `approved` | `closed` or metadata-backed `open` | Depends on whether approval means completion or workflow checkpoint |
| `rejected` | `blocked` or metadata-backed `open` | Avoid direct status mapping initially |
| `done` | `closed` | Direct mapping |

Practical takeaway:

- `todo` <-> `open`
- `inprogress` <-> `in_progress`
- `done` <-> `closed`
- keep `draft`, `review`, `approved`, and `rejected` in backend metadata or spec-file state until a better native Beads representation is confirmed

### Dependencies

Beads appears to support dependency edges via:

- `bd dep add <child> <parent>`

This should map well to OpenCode's `depends` field.

Upstream docs also describe typed dependency semantics, which suggests we may need to normalize Beads edge types down into OpenCode's simpler dependency list.

### Ready-task detection

Beads has native ready-task detection:

- `bd ready`
- `bd ready --json`

This may allow a simpler implementation than the Jira-Taskwarrior backend for finding actionable tasks.

Likely OpenCode mapping:

- use `bd ready --json` when the filter is effectively “ready work only”
- use broader list commands when we need all tasks for issue grouping and phase reconstruction

Important nuance from upstream source:

- `bd ready` is not equivalent to `bd list --ready`
- `bd ready` uses blocker-aware semantics and excludes `in_progress`, `blocked`, `deferred`, and `hooked`
- `bd list --ready` appears to be a lighter status-based filter, not the true ready-work computation

## Known Beads concepts from upstream docs

### CLI commands explicitly documented upstream

- `bd init`
- `bd list`
- `bd ready`
- `bd create "Title" -p 0`
- `bd update <id> --claim`
- `bd dep add <child> <parent>`
- `bd show <id>`
- `bd close <id> "reason"`
- `bd prime`
- `bd blocked`
- `bd dep tree <id>`

### CLI commands confirmed in source as relevant for backend wrapper

- `bd list --json`
- `bd ready --json`
- `bd blocked --json`
- `bd show <id> --json`
- `bd create ... --json`
- `bd update ...`
- `bd close <id> <reason>`
- `bd dep add <child> <parent>`

### Storage model

- local `.beads/` project data directory
- Dolt-backed database
- supports git-free usage through `BEADS_DIR`
- supports `--stealth` local-only mode

### Identity model

- hashed IDs like `bd-a1b2`
- hierarchical IDs like `bd-a3f8.1` and `bd-a3f8.1.1`

## Proposed OpenCode implementation strategy

### Phase 4.1 research outputs

1. verify the exact JSON shape from key `bd` commands
2. identify how Beads distinguishes open, in-progress, ready, blocked, and closed work
3. determine how best to model spec approval state
4. determine whether Beads supports tags, types, labels, assignee, and arbitrary metadata in a way that maps to OpenCode filters

### Phase 4.2 implementation direction

1. create `backends/beads/index.js`
2. wrap `bd` CLI invocations
3. parse JSON into `Issue`, `Spec`, and `Task` objects
4. implement state mapping between Beads workflow and OpenCode work states
5. add tests with mocked `bd` output

## Open questions

- What exact `bd update` flags should map to OpenCode states like `draft`, `review`, and `approved` when there is no obvious Beads-native equivalent?
- How should spec approval be represented in Beads?
- Does Beads expose tags, priorities, and assignee in stable JSON fields?
- What is the best way to attach or reference spec file paths from Beads items?
- Should OpenCode phases map to Beads parent tasks, labels/types, or plain tasks with metadata?

## Suggested implementation defaults

Until local CLI verification proves otherwise, the safest initial Beads backend strategy is:

1. represent OpenCode issues and implementation tasks as Beads issues/tasks
2. use Beads parent-child relationships for phases and tasks where possible
3. keep spec markdown as portable file storage outside Beads
4. represent spec tracking in Beads using metadata or a dedicated planning issue type/tag
5. use `bd ready --json` for actionable-task selection rather than reimplementing blocker logic
6. map only `open`, `in_progress`, and `closed` directly at first; keep richer workflow state conservative and reversible

## Installation notes

From upstream docs, Beads can be installed via:

```bash
brew install beads
```

or:

```bash
npm install -g @beads/bd
```

or:

```bash
go install github.com/steveyegge/beads/cmd/bd@latest
```

Project setup:

```bash
bd init
```

## Local validation findings in this environment

Real `bd` CLI validation was attempted in an isolated temp workspace.

Verified:

- `bd` is installed in this environment (`0.62.0` via Homebrew)
- `bd help` works normally with an isolated `HOME`
- `bd init --help`, `bd dolt --help`, and `bd doctor --help` confirm Beads is Dolt-server-based in current releases
- a fresh isolated temp workspace now initializes successfully with `bd init --quiet --stealth`
- successful init writes `.beads/metadata.json`, `.beads/config.yaml`, and Dolt server metadata files
- the following commands were verified against a real sandbox workspace:
  - `bd create ... --json`
  - `bd show <id> --json`
  - `bd list --json --all`
  - `bd list --json --ready`
  - `bd ready --json`
  - `bd status --json`

Observed environment/runtime blockers:

- `bd init --quiet --stealth` failed under the default user environment because Dolt global config access hit a local permission/config issue under `~/.dolt`
- retrying with an isolated temp `HOME` got further, but Dolt auto-start timed out waiting for a local server port
- manual recovery attempts showed a partially started Dolt server plus lock/port mismatch behavior in the temp workspace
- repeated clean-room retries reproduced the same pattern: a first Dolt server reports `Server ready. Accepting connections.`, followed immediately by a second startup attempt that fails with `database "dolt" is locked by another dolt process`, leaving `bd init` unfinished and no `metadata.json`

Resolved/clarified during retry:

- after resetting temp directories and retrying with a fresh isolated `HOME`, `bd init` succeeded cleanly
- JSON list/ready commands behaved correctly when executed from the initialized sandbox working directory
- running the same commands outside the workspace context returned misleading empty arrays, so backend integration should either set the working directory to the Beads workspace or use explicit routing/db configuration consistently
- `bd list --json --ready` and `bd ready --json` both returned the created open issue in the verified sandbox
- Beads emitted a non-fatal warning: `beads.role not configured. Run 'bd init' to set.` even after successful init in the temp sandbox

Practical implication:

- We can rely on the upstream/source-verified CLI contract for planning
- We now have a repeatable local `bd init` + `bd create` + `bd show/list/ready --json` workflow in an isolated temp environment
- The Beads backend can move from research into implementation, but it must manage workspace context carefully

### Repro summary for this environment

Using an isolated temp environment:

```bash
HOME=/tmp/opencode-beads-home \
BEADS_DIR=/tmp/opencode-beads-sandbox-2/.beads \
bd init --quiet --stealth
```

Observed log sequence:

1. Dolt server starts and reports ready on one port
2. A second startup attempt is made on another port
3. The second attempt fails with a Dolt database lock error
4. `.beads/` is created, but `metadata.json` and `config.yaml` are never written

This issue was later bypassed with a fully fresh temp HOME + sandbox retry, so it appears intermittent or environment-state-sensitive rather than a hard blocker.

## AIDEV-NOTE: Phase 4 research snapshot

This file captures only the initial upstream research and proposed mapping. Do not treat it as final implementation truth until the actual `bd --json` command behavior is verified locally.
