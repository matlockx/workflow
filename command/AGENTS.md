# AGENTS.md — command/

This directory contains **slash command definitions** for the OpenCode workflow system.

## What command files are

A command file defines a slash command — an orchestration script that the AI
executes when the user types `/commandname`. Commands drive multi-step workflows:
they parse input, load the backend, call backend methods, delegate to agents, and
guide the user through lifecycle checkpoints.

Commands are **not** agent personas. An agent (in `agent/`) provides the AI's
mindset and constraints. A command provides step-by-step orchestration logic that
runs *within* an agent context.

**Key distinction:**

| | Agent (`agent/`) | Command (`command/`) |
|---|---|---|
| Purpose | Who the AI *is* | What the AI *does* |
| Content | Persona, boundaries, reasoning style | Step-by-step workflow logic |
| Invoked by | AI selection / frontmatter | User typing `/commandname` |
| State | Stateless | Reads backend; some use `lib/plan-state.js` |

## How commands are distributed

`opencode-sync` copies **all** `command/*.md` files verbatim to `.agent/commands/`
in the downstream project on every sync. Stale commands (present in the target but
absent from this repo) are removed automatically.

Commands are **not** filtered by language — every command is distributed to every
project. Commands must therefore remain backend-agnostic; they must not call any
backend CLI directly.

There is no `opencode-init` filtering for commands — all commands are installed
from the first run.

## Frontmatter schema

Every command file **must** have YAML frontmatter. Recognized fields:

| Field         | Required | Values / Notes |
|---------------|----------|----------------|
| `description` | Yes      | 1–2 sentence summary shown in the command picker. Be specific — vague descriptions cause wrong command selection. |
| `agent`       | Yes      | The `name:` value of the agent that runs this command (e.g. `build`, `plan-mode`). Must match a `name:` field in an `agent/*.md` file. |
| `mode`        | No       | `build` (code-writing, file-editing), `plan` (analysis, read-only). Default: `build`. |
| `model`       | No       | Model override for this command (e.g. `github-copilot/claude-haiku-4.5` for lightweight ops). |
| `temperature` | No       | Float 0.0–1.0. Use low values (`0.1`) for analysis/review commands. |
| `subtask`     | No       | `true` when this command is always invoked as a subagent/subtask, not directly by the user. |

Example:

```yaml
---
description: "Short description of what this command does. Use when X."
agent: build
mode: build
---
```

## The delegation model

Commands are thin **orchestrators**. Agents do the thinking; commands direct the flow.

```
User: /feature PROJ-42
  └─► command/feature.md   (orchestrates: parse args, load backend, checkpoint loop)
        └─► agent/build.md  (builds code, reads context, applies changes)
              └─► lib/backend-loader.js  (resolves backend, delegates to backend impl)
```

### What commands do
- Parse `$ARGUMENTS` (the raw string the user typed after the command name)
- Load the backend via `lib/backend-loader.js`
- Call backend methods (`getIssue`, `getTasks`, `updateTaskState`, etc.)
- Present checkpoints and wait for `[c]ontinue / [s]kip / [q]uit` input
- Delegate to other commands (e.g. `/feature` calls `/createtasks` and `/implement`)
- Never write local state files (except `/plan`, which uses `lib/plan-state.js`)

### What commands do NOT do
- Call backend CLIs directly (no `task`, `bd`, `acli` shell commands in command logic)
- Encode business logic about specific backends (`jira-taskwarrior`, `beads`)
- Duplicate orchestration from another command — delegate instead

## `$ARGUMENTS` usage

`$ARGUMENTS` is the raw string the user typed after the slash command name.

```
/feature PROJ-42 --yolo
         ^^^^^^^^^^^^^^^^ $ARGUMENTS
```

All commands that accept arguments should parse them with
`require('./lib/backend-loader.js').parseBackendOverride($ARGUMENTS)` first,
which strips any `--backend=<type>` override and returns `cleanedArguments`.

Then split `cleanedArguments` into tokens and extract flags (`--yolo`, `--all`, etc.)
and positional arguments (issue IDs, topic strings, etc.).

### Handling no arguments

When a command makes sense without arguments (e.g. `/resume` lists open work), show
a usage hint or interactive list. When a command requires an argument (e.g. `/implement`),
show usage and stop:

```js
if (!issueId) {
  console.log('Usage: /implement <issueId> [--backend=<type>] [--yolo]')
  // stop
}
```

## Backend access pattern

Every command that reads or mutates workflow state must go through the backend loader:

```js
const { parseBackendOverride, getBackend } = require('./lib/backend-loader.js')

const { backendType, cleanedArguments } = parseBackendOverride($ARGUMENTS)
const backend = getBackend(backendType)
```

`getBackend()` returns an object that implements the `WorkflowBackend` interface.
See `skills/workflow-backend/SKILL.md` for the full method reference.

**Never** call `bd`, `task`, `acli`, or any other backend CLI directly inside a
command. Those CLIs are implementation details of specific backends.

## `lib/backend-loader.js` — key exports

| Export | Purpose |
|--------|---------|
| `parseBackendOverride(args)` | Strips `--backend=<type>` from raw args; returns `{ backendType, cleanedArguments }` |
| `getBackend(backendType?)` | Loads the configured backend (reads `.agent/config.json`); returns backend instance |

## `lib/plan-state.js` — used only by `/plan`

`/plan` is the only command that maintains local persisted state (plan phases,
proposals, backlog). It uses `lib/plan-state.js` for this. All other commands are
stateless — the backend is the sole source of truth for issue and task state.

## Command patterns

### Lifecycle orchestrator (most commands)

Commands like `/feature`, `/implement`, `/resume` follow this pattern:

1. Load backend
2. Resolve issue/task from backend
3. Present checkpoint with `[c]ontinue / [s]kip / [q]uit`
4. Mutate state via `backend.updateTaskState()`
5. Loop or delegate to the next command

### Read-only viewer

Commands like `/status` read backend state and render it. They must **never**
call state-mutating backend methods.

### Thin alias

Commands like `/fix` are one-line delegators:

```
/fix ISSUE-5 → /feature ISSUE-5 --type=fix
```

Keep alias commands short — all logic lives in the canonical command.

### Subagent command

Commands with `subtask: true` (like `/test`, `/codereview`) are not invoked
directly by users — they are called by other commands or agents as subordinate
tasks. They typically delegate immediately to their `agent:` without interactive
checkpoints.

## Naming conventions

| Pattern | When to use | Example |
|---------|-------------|---------|
| Verb (imperative) | Primary action commands | `implement.md`, `resume.md`, `plan.md` |
| Noun | Viewing/status commands | `status.md` |
| Verb-noun | Compound action commands | `createtasks.md`, `codereview.md` |
| Kebab-case for multi-word | Always | `PR-summary.md` *(exception: legacy)* |

> **Note:** New commands should use lowercase kebab-case for the filename.
> `PR-summary.md` is a legacy exception.

## Adding a new command

1. Create `command/<name>.md` with complete frontmatter
2. Ensure `agent:` matches a `name:` field in an `agent/*.md` file
3. Start the body with `## Input` describing `$ARGUMENTS`
4. Use `require('./lib/backend-loader.js')` for any backend access
5. End with an `AIDEV-NOTE:` comment describing the command's design intent
6. Run `opencode-sync` locally to verify the file is copied correctly
7. Update this file if the command introduces a new pattern

## What NOT to put in command files

- **Direct backend CLI calls** — use `backend.*` methods, not shell commands
- **Backend-specific logic** — `if (backendType === 'jira-taskwarrior') { ... }` belongs in the backend implementation, not the command
- **Hardcoded branch names** like `develop` or `master` — detect dynamically
- **Inline agent personas** — keep persona definition in `agent/`; reference it via `agent:` frontmatter
- **Local state writes** — only `/plan` is allowed to write local files; all other state lives in the backend

## AIDEV-NOTE: backend-is-the-state design

All commands (except `/plan`) are stateless orchestrators. They read backend task
states to know where work left off, and call `backend.updateTaskState()` to advance
it. There is no local cursor file for issue/task progress — re-running any command
with the same issue ID is always safe and idempotent.

`lib/plan-state.js` is the one deliberate exception: `/plan` needs multi-session
brainstorming state that isn't modeled as issues/tasks in the backend. The plan
JSON files in `.agent/state/plans/` are gitignored runtime state; the exported
`plans/<id>-backlog.md` is the human-readable artefact that gets committed.
