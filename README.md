# OpenCode Agentic Workflow Framework

A pluggable, agent-assisted development workflow for OpenCode. Covers the full lifecycle — from brainstorming to merged PR — while keeping humans in control at every approval gate.

---

## What it does

- **`/plan`** — brainstorm features, prioritize a backlog, bulk-create issues (with optional Epic)
- **`/feature`** — full lifecycle orchestrator: issue → spec → tasks → implement → review
- **`/bug`** — same flow, tuned for bug fixes
- **`/resume`** — pick up any in-progress work item across sessions
- **`/status`** — dashboard of all active work items and their stages
- Step-by-step commands: `/issue`, `/spec`, `/createtasks`, `/implement`
- Utility commands: `/git`, `/test`, `/codereview`, `/PR-summary`

Workflow state persists in `.agent/state/` so you can close the terminal and resume days later.

---

## Quick start

```bash
# 1. Clone this repo
git clone https://github.com/your-username/opencode.git

# 2. Initialize OpenCode workflow in your project
cd opencode
./bin/opencode-init ~/projects/myapp          # file backend (default, zero deps)
./bin/opencode-init --backend=jira-taskwarrior ~/projects/myapp

# 3. Open your project in OpenCode and start working
cd ~/projects/myapp
# /plan "improve onboarding"     ← brainstorm & bulk-create a backlog
# /feature ISSUE-1               ← start the full lifecycle
# /resume  ISSUE-1               ← pick up where you left off
# /status                        ← see all active work
```

---

## Agents and Modes

This workflow system uses OpenCode's **agent** system to provide specialized AI assistants for different tasks.

### How it works with OpenCode's built-in modes

OpenCode has two built-in **primary agents** that you switch between with **Tab**:

| Primary Agent | Purpose | Tool Access |
|---------------|---------|-------------|
| **Build** | Full development work | All tools enabled |
| **Plan** | Analysis and planning | Read-only (no edits) |

Our workflow agents are **subagents** — specialized assistants invoked by slash commands:

| Subagent | Invoked by | Purpose |
|----------|------------|---------|
| `plan-mode` | `/plan` | Brainstorm features, create backlog |
| `spec-mode` | `/spec`, `/feature` | Draft requirements and design |
| `create-tasks` | `/createtasks`, `/feature` | Break spec into phased tasks |
| `build` | `/implement`, `/feature` | Implement tasks with TDD |
| `code-reviewer` | `/codereview`, `/feature` | Review code changes |
| `test-agent` | `/test` | Run and fix tests |

### Usage pattern

```
┌─────────────────────────────────────────────────────┐
│  1. Use Tab to switch to Plan mode (read-only)     │
│  2. Run /plan "improve onboarding" → plan-mode     │
│  3. Switch to Build mode with Tab                   │
│  4. Run /feature ISSUE-1 → spec-mode → create-tasks │
│     → build → code-reviewer                         │
└─────────────────────────────────────────────────────┘
```

Subagents run in **child sessions** and return results to your main conversation.

### Model configuration

Agents inherit the model from your OpenCode configuration. To use different models for different agents, configure them in your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-20250514",
  "agent": {
    "plan-mode": {
      "model": "anthropic/claude-sonnet-4-20250514"
    },
    "spec-mode": {
      "model": "anthropic/claude-sonnet-4-20250514"
    },
    "build": {
      "model": "anthropic/claude-sonnet-4-20250514"
    }
  }
}
```

The model ID format is `provider/model-id`. Common providers:
- `anthropic/claude-sonnet-4-20250514`
- `openai/gpt-4o`
- `github-copilot/claude-sonnet-4`
- `opencode/gpt-5.1-codex` (OpenCode Zen)

Run `opencode models` to see available models for your configured providers.

---

## Backends

| Backend | Best for | Dependencies |
|---------|----------|--------------|
| `file` | Solo developers, simple projects, getting started | None |
| `beads` | Individuals wanting lightweight local workflow | Beads (`bd`) CLI |
| `jira-taskwarrior` | Teams using Jira | ACLI, Taskwarrior |

### File backend (default)

Zero dependencies. Issues and tasks stored as JSON files under `.agent/state/`. Sequential IDs: `ISSUE-1`, `ISSUE-2`, …

`.agent/config.json`:
```json
{
  "backend": { "type": "file", "config": {} }
}
```

### Beads backend

Lightweight local-first task manager using the `bd` CLI. Issues and tasks stored locally; no external service required.

`.agent/config.json`:
```json
{
  "backend": {
    "type": "beads",
    "config": {
      "workspaceDir": "/path/to/project",
      "beadsDir": "/path/to/project/.beads",
      "lmmNotesRoot": "/path/to/project/notes"
    }
  }
}
```

Run `bd init --stealth` in your project root before first use. See [`backends/beads/README.md`](backends/beads/README.md) for setup.

### Jira-Taskwarrior backend

Uses Atlassian CLI (ACLI) for Jira and Taskwarrior for local task execution.

`.agent/config.json`:
```json
{
  "backend": {
    "type": "jira-taskwarrior",
    "config": {
      "jiraSite": "your-org.atlassian.net",
      "jiraProject": "PROJ",
      "jiraEmail": "you@example.com",
      "taskrcPath": "~/.taskrc",
      "taskDataLocation": "~/.task",
      "lmmNotesRoot": "./notes"
    }
  }
}
```

See [`backends/jira-taskwarrior/README.md`](backends/jira-taskwarrior/README.md) for setup.

---

## Typical workflow

### Option A — Full lifecycle (recommended)

```
/feature ISSUE-1
```

Drives you through every stage with pause points:

1. **spec** — agent drafts Requirements + Design; you approve
2. **tasks** — agent breaks spec into phased implementation tasks; you approve
3. **implement** — agent implements task by task (TDD); phase review gates after each phase
4. **review** — final code review + PR summary

At each gate you choose: `[c]ontinue  [s]kip  [a]uto-run  [q]uit`

### Option B — Step by step

```bash
/issue "Add CSV export to reports"   # create issue
/spec  ISSUE-1                       # draft + approve spec
/createtasks ISSUE-1                 # generate phased tasks
/implement   ISSUE-1                 # implement phase by phase
/test                                # run tests
/codereview                          # review the diff
/git "feat(reports): add CSV export" # commit
/PR-summary                          # write PR description
```

### Option C — Brainstorm first

```bash
/plan "improve developer onboarding"
# → discovery questions → feature proposals → prioritized backlog
# → bulk-creates issues (auto-creates an Epic when backlog > 1 item)
# → backlog exported to plans/<plan-id>-backlog.md
```

---

## opencode-init

`bin/opencode-init` copies all workflow files into `.agent/` of a target project.

```
Usage: opencode-init [OPTIONS] [target-dir]

Options:
  --backend=TYPE    file (default), beads, or jira-taskwarrior
  --stack=backend   Copy all backend infra skills (postgres, kafka, docker, …)
  --skills=LIST     Comma-separated skills (e.g. postgres,kafka,docker)
  --lang=LANG       Language tooling: go, rust, node, python, both
  --with-startup    Add flachnetz/startup library (Go)
  --scaffold[=NAME] Scaffold a Go service from templates/go-service/
  --list-skills     List all available skills
```

What gets installed into `.agent/`:

```
.agent/
  command/        all workflow commands
  agent/          spec-mode, create-tasks, plan-mode, build,
                  test-agent, code-reviewer
  backends/       chosen backend implementation + interface.ts
  lib/            backend-loader.js, workflow-state.js, plan-state.js
  config.json     workflow backend configuration
  skills/         workflow-backend (always), plus any --stack/--skills/--lang extras
specs/            spec documents (committed to git)
plans/            backlog markdowns from /plan (committed to git)
opencode.json     OpenCode configuration ($schema, instructions, providers)
AGENTS.md         AI assistant context (customize for your project)
```

To pull in updates after the initial setup, use `opencode-sync` (see below).

---

## opencode-sync

`bin/opencode-sync` refreshes workflow files in an already-initialized project without touching any project-specific config or state.

```
Usage: opencode-sync [OPTIONS] [target-dir]

Options:
  --dry-run     Show what would be updated without making changes
  --verbose     Show each file being copied
```

What is updated:

```
.agent/command/      All slash commands
.agent/agent/        Core agents (spec-mode, create-tasks, plan-mode, build,
                     test-agent, code-reviewer) + any language agents
.agent/lib/          backend-loader.js, workflow-state.js, plan-state.js
.agent/backends/     Active backend implementation + interface.ts
.agent/skills/       All currently installed skill packs
```

What is **never** touched:

```
.agent/config.json   Your backend configuration
.agent/state/        Runtime workflow data (issues, specs, tasks)
AGENTS.md            Your project AI context
opencode.json        Your OpenCode provider/model config
specs/               Your spec documents
plans/               Your plan documents
```

Language agents (`debugger-go`, `debugger-rust`, `debugger-ts`) are synced if `"language"` is set in `.agent/config.json`. Only commands and agents that are already installed are updated — `opencode-sync` does not add new files.

---

## Repository layout

```
agent/              agent definition files
backends/
  file/             zero-dependency local backend
  beads/            Beads local-first backend
  jira-taskwarrior/ Jira + Taskwarrior backend
  interface.ts      WorkflowBackend interface
bin/
  opencode-init     project initializer
  opencode-sync     sync workflow files into an initialized project
  opencode-update   update the opencode-init binary itself
command/            slash command definitions
lib/
  backend-loader.js runtime backend selection
  workflow-state.js cross-session state persistence
  plan-state.js     plan + epic state persistence
skills/             reusable skill packs (postgres, kafka, coding-standards, …)
templates/
  go-service/       Go service scaffold
  AGENTS.md.tmpl    AGENTS.md template used by opencode-init
```

---

## Workflow state

Stages and valid substages tracked per work item:

| Stage | Substages |
|-------|-----------|
| `spec` | `drafting` → `requirements-review` → `design-review` → `approved` |
| `tasks` | `pending` → `created` |
| `implement` | `in-phase` → `phase-review` → `phase-approved` (repeats per phase) |
| `review` | `pending` → `done` |
| `done` | — |

State file: `.agent/state/workflow.json` (gitignored).

---

## Adding a custom backend

Implement the `WorkflowBackend` interface in `backends/interface.ts`:

```typescript
interface WorkflowBackend {
  getIssue(id: string): Promise<Issue>
  getSpec(issueId: string): Promise<Spec | null>
  createSpec(issueId: string): Promise<Spec>
  approveSpec(specId: string): Promise<Spec>
  getTasks(filter: TaskFilter): Promise<Task[]>
  createTasks(specId: string): Promise<Task[]>
  updateTaskState(taskId: string, state: string): Promise<Task>
  linkIssueToEpic(issueId: string, epicId: string): Promise<Issue>
  // … see interface.ts for the full contract
}
```

Place your implementation in `backends/<name>/index.js` and register it in `lib/backend-loader.js`. Then configure it in `.agent/config.json`:

```json
{ "backend": { "type": "<name>", "config": { ... } } }
```

---

## Credits & Acknowledgments

This project is a fork of [opencode by Geert Theys](https://github.com/gtheys/opencode). A huge thanks to Geert for laying the groundwork — the original slash command structure, agent definitions, and workflow orchestration concepts all trace back to that repo.

**What this fork adds on top:**

- Backend-agnostic workflow engine (`file`, `beads`, `jira-taskwarrior`) with a common `WorkflowBackend` interface
- Full slash command suite: `/plan`, `/feature`, `/bug`, `/resume`, `/status`, `/issue`, `/spec`, `/createtasks`, `/implement`, `/git`, `/test`, `/codereview`, `/PR-summary`
- Cross-session workflow state persistence (`.agent/state/workflow.json`)
- Epic auto-creation and issue-to-epic linking across all backends
- `opencode-init` installer with language scaffolding, startup library detection, and multi-backend support
- `opencode-sync` for keeping workflow files up to date in initialized projects
- Separation of workflow config (`.agent/config.json`) from OpenCode native config (`opencode.json`) to comply with upstream schema validation
- macOS bash 3.2 compatibility throughout all shell scripts

If this project is useful to you, go give Geert's repo a star too.

---

## License

MIT
