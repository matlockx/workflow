# OpenCode Workflow Framework

Portable workflow instructions for AI-assisted development. This file is
loaded automatically via `opencode.json` and should not be customized
per-project. Project-specific rules belong in `AGENTS.md`.

<!-- AIDEV-NOTE: This file is the portable core of the v2 workflow framework.
     It is designed to be copied into any repo without modification. All
     project-specific configuration (build commands, lint config, team
     conventions) belongs in the repo's AGENTS.md, not here. -->

---

## Golden Rules

| # | AI may do | AI must NOT do |
|---|-----------|---------------|
| G-0 | Ask the developer when unsure about project-specific decisions | Write code or use tools without context for the feature/decision |
| G-1 | Add/update `AIDEV-NOTE:` anchor comments near non-trivial code | Delete or mangle existing `AIDEV-` comments |
| G-2 | Follow the project's lint/style configuration | Reformat code to a different style |
| G-3 | Ask for confirmation when changes exceed 300 LOC or touch >3 files | Refactor large modules without human guidance |
| G-4 | Stay within the current task context | Continue prior work after "new task" — start fresh |
| G-5 | Update docs when behavior changes | Leave documentation out of sync |
| G-6 | Write tests for every code change (TDD preferred) | Commit code without corresponding tests |
| G-7 | Ensure every task has a self-contained description in the backend | Create tasks with only a title — no description = no task |

---

## 4-Agent Workflow

Work flows through four agents with three gates:

```
Planner (Gate 1) → Designer (Gate 2) → Developer → QA (Gate 3) → Done
                                                ↑          |
                                                └──────────┘
                                                 (loop-back)
```

| Agent | Gate | Responsibility |
|-------|------|---------------|
| **Planner** | Gate 1 | Detect intent, estimate scope, present plan, wait for confirmation |
| **Designer** | Gate 2 | Create tasks with Jira-ready descriptions, triage ADRs, confirm plan |
| **Developer** | — | TDD implementation, max 500 LOC per task |
| **QA** | Gate 3 | Run all quality gates, commit or route failures back |

### Commands

| Command | Purpose | Agent |
|---------|---------|-------|
| `/plan` | Plan work (Gate 1) | Planner |
| `/implement` | Implement a task (TDD) | Developer |
| `/review` | Run quality gates (Gate 3) | QA |
| `/status` | Show workflow state (read-only) | Planner |

---

## Quality Gates

Every code change must pass ALL gates before commit:

| Gate | Check | Hard block? |
|------|-------|-------------|
| Task | Beads task exists with self-contained description | Yes |
| Tests | Tests exist for changed code AND pass | Yes |
| Lint | Linter passes | Yes |
| ADR | ADR exists if change is architectural | Yes |
| Diff size | Total diff under 500 LOC | Yes |
| Secrets | No hardcoded credentials | Yes |
| Docs | Docs updated if user-facing behavior changed | Yes |
| AIDEV-NOTE | Anchor comments on non-obvious logic | Soft |
| Commit format | Conventional Commits with task ID `[BD-xxx]` | Yes |

### Loop-Back Routing

When a gate fails, QA routes to the responsible agent:

| Failure | Route to |
|---------|----------|
| Tests missing or failing | Developer |
| Lint errors | Developer |
| No task / bad description | Designer |
| ADR missing | Designer |
| Diff >500 LOC | Designer (split task) |
| Hardcoded secrets | Developer |
| Docs out of date | Developer |

---

## Anchor Comments

Use `AIDEV-NOTE:`, `AIDEV-TODO:`, or `AIDEV-QUESTION:` for inline knowledge:

- **Grep first**: before scanning files, `grep` for existing `AIDEV-` anchors
- **Update**: when modifying code with anchors, update the anchors too
- **Never remove**: don't delete `AIDEV-NOTE` comments without explicit permission
- **Add when**: code is complex, important, confusing, or could harbor bugs

---

## Commit Convention

```
<type>(<scope>): <subject> [BD-<task-id>]

<body: what changed and why>
```

Types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `style`, `perf`, `ci`, `build`

Rules:
- Subject: imperative mood, lowercase, no period
- Task ID: required — `[BD-xxx]` references the Beads task
- Body: explain the why, not the how
- Docs: include doc updates in the same commit as code changes

---

## ADR System

Architecture Decision Records live in `docs/adr/`:

- **Template**: `docs/adr/TEMPLATE.md`
- **Index**: `docs/adr/INDEX.md` (machine-readable wiki for agents)
- **Naming**: `ADR-NNN-<slug>.md`

### When to Write an ADR

- New architectural pattern or cross-cutting decision → **yes**
- Significant deletion or replacement of a component → **yes**
- Behavioral change future devs would reverse-engineer → **yes**
- Renaming, formatting, dep bumps, doc-only, bug fix → **no**

ADRs are drafted at Gate 2 (Designer) and finalized at Gate 3 (QA).
They must be committed in the same commit as the code they document.

---

## Backend: Beads

Tasks are managed through the `bd` CLI (Beads backend):

| Operation | Command |
|-----------|---------|
| List open tasks | `bd list --json` |
| Show task detail | `bd show <id> --json` |
| Create task | `bd create "title" --json` |
| Edit description | `bd edit <id> --notes "..."` |
| Close task | `bd close <id> --reason "..."` |
| Ready tasks | `bd ready --json` |
| All tasks | `bd list --json --all` |

### Source of Truth

- Backend state is authoritative for task existence and lifecycle
- Never fall back to `git log` for task queries without telling the user
- Never assume task state from local files or timestamps

---

## Documentation Requirements

Every code change that affects user-facing behavior must update docs:

- New commands/flags → update README
- Changed behavior/defaults → update relevant docs
- New config options → update config examples
- Docs go in the **same commit** as the code change

---

## What AI Must Never Do

1. Never modify test files without understanding their intent
2. Never change API contracts without explicit approval
3. Never alter migration files
4. Never commit secrets — use environment variables
5. Never assume business logic — always ask
6. Never remove `AIDEV-` comments
7. Never use `--no-verify` to skip pre-commit hooks
8. Never push to remote without explicit request

---

## Session Boundaries

- If a request is unrelated to current context, suggest starting fresh
- If unsure about scope, ask before proceeding
- Track multi-step work with to-do lists
- When stuck, re-plan instead of guessing

## AIDEV-NOTE: portability contract

This file must work in any repo without modification. It contains no
project-specific paths, build commands, or team conventions. Those
belong in the repo's AGENTS.md. The instructions array in opencode.json
loads this file alongside AGENTS.md, giving projects both portable
workflow rules and project-specific configuration.
