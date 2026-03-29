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

## Backends

| Backend | Best for | Dependencies |
|---------|----------|--------------|
| `file` | Solo developers, simple projects, getting started | None |
| `jira-taskwarrior` | Teams using Jira | ACLI, Taskwarrior |

### File backend (default)

Zero dependencies. Issues and tasks stored as JSON files under `.agent/state/`. Sequential IDs: `ISSUE-1`, `ISSUE-2`, …

```json
{
  "workflow": {
    "backend": { "type": "file", "config": {} }
  }
}
```

### Jira-Taskwarrior backend

Uses Atlassian CLI (ACLI) for Jira and Taskwarrior for local task execution.

```json
{
  "workflow": {
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
  --backend=TYPE    file (default) or jira-taskwarrior
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
  skills/         workflow-backend (always), plus any --stack/--skills/--lang extras
specs/            spec documents (committed to git)
plans/            backlog markdowns from /plan (committed to git)
opencode.json     workflow configuration
AGENTS.md         AI assistant context (customize for your project)
```

---

## Repository layout

```
agent/              agent definition files
backends/
  file/             zero-dependency local backend
  jira-taskwarrior/ Jira + Taskwarrior backend
  interface.ts      WorkflowBackend interface
bin/
  opencode-init     project initializer
  opencode-update   update workflow files in an existing project
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

Place your implementation in `backends/<name>/index.js` and register it in `lib/backend-loader.js`.

---

## License

MIT
