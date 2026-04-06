---
name: workflow
description: Unified workflow orchestration — 3-gate system, Beads task management, agent handoff rules, and backend query reference. Load this skill for any workflow, planning, or task-state question.
license: MIT
metadata:
  audience: ai-agents
  workflow: three-gate
---

# Workflow Skill

Unified reference for the 3-gate workflow system, Beads backend interaction,
and agent coordination.

<!-- AIDEV-NOTE: This skill merges v1's workflow-first.md, workflow-queries.md,
     and workflow-backend/SKILL.md into one file. It is the single source of
     truth for how work flows through the system. -->

## The 4-Agent Model

| Agent | Gate | Responsibility | Hands off to |
|-------|------|---------------|--------------|
| **Planner** | Gate 1 | Detect intent, estimate scope, present plan | User (for confirmation) |
| **Designer** | Gate 2 | Create Beads tasks, write ADRs, update ADR index | Developer (to implement) |
| **Developer** | — | TDD implementation, max 500 LOC per task | QA (for review) |
| **QA** | Gate 3 | Quality gates, loop-back on failures | Developer or Designer |

Work flows in one direction: Planner → Designer → Developer → QA → Done.
QA can loop back to Developer (code issues) or Designer (missing task/ADR).

---

## Gate 1: Intent Acknowledgment

Before any work begins, detect the user's intent and present an acknowledgment.

### Intent Detection

| Pattern | Intent | Confidence |
|---------|--------|-----------|
| "Add X", "Create X", "Build X", "Implement X", "New feature" | feature | high |
| "Fix X", "Resolve X", "Debug X", "X is broken" | fix | high |
| "Optimize X", "Refactor X", "Clean up X", "X is slow" | review | high |
| "Plan X", "Brainstorm X", "Roadmap" | plan | medium |
| Typo, rename, single-line change | trivial | high |

### Acknowledgment Templates

**Non-trivial** (>30 LOC or multi-file):
```
**Detected**: {type} — {confidence}%
**Workflow**: {steps}
**Scope**: ~{loc} LOC, {files} files

Proceed? [y/n/?]
```

**Small** (<30 LOC, single file):
```
Quick fix (~{loc} LOC, {files} file). Proceed? [y/n/?]
```

**Trivial** (<10 LOC):
```
Trivial change. Proceed? [y/n]
```

### Confirmation Rules

- `y`, `yes`, `proceed`, `go ahead` → proceed as planned
- `y <instructions>` → proceed and incorporate additional instructions
- `n`, `no` → stop
- `?` → explain the plan in more detail
- Ambiguous ("ok", "sure", "looks good") → ask for explicit confirmation

### Skip Conditions

Skip Gate 1 only when:
- User invoked an explicit command (`/plan`, `/implement`, etc.)
- User is asking a question, not requesting work
- User is mid-workflow (already confirmed earlier)

---

## Gate 2: Design Confirmation

After planning, the Designer creates tasks and optionally ADRs.

### Task Creation

Create Beads tasks using `bd create`:

```sh
bd create "Task title" --json
bd edit <id> --notes "Detailed description..."
```

Every task description must be **self-contained** and include:
1. **What**: Specific work to be done
2. **Why**: Motivation and context
3. **Acceptance criteria**: How to verify completion
4. **References**: File paths, ADR links, related tasks

Descriptions must be detailed enough to create Jira items from them.

### ADR Triage

Before confirming implementation, evaluate whether an ADR is needed:

| Condition | ADR needed? |
|-----------|------------|
| New architectural pattern or cross-cutting decision | Yes |
| Significant deletion or replacement of a component | Yes |
| Behavioral change future devs would reverse-engineer | Yes |
| Renaming, formatting, dependency bumps, doc-only, bug fix | No |

If needed: draft Context + Decision sections, add to `docs/adr/INDEX.md`.

### Confirmation Prompt

```
Ready to implement:
- [ ] {task-1}: {description} (~{loc} LOC)
- [ ] {task-2}: {description} (~{loc} LOC)
- [ ] ADR-NNN (if needed)

Begin? [y/n]
```

---

## Gate 3: Quality & Ship

After implementation, QA runs all quality gates.

### Gate Checklist

| # | Check | Command / Method | Blocks commit? |
|---|-------|-----------------|---------------|
| 1 | Beads task exists with description | `bd show <id> --json` | Yes |
| 2 | Tests exist and pass | `go test ./...` | Yes |
| 3 | Linter passes | `golangci-lint run` | Yes |
| 4 | ADR exists (if architectural) | Check `docs/adr/INDEX.md` | Yes |
| 5 | Diff under 500 LOC | `git diff --stat` | Yes |
| 6 | No hardcoded secrets | Grep for patterns | Yes |
| 7 | AIDEV-NOTE comments on non-obvious logic | Manual review | Soft |
| 8 | Docs updated if behavior changed | Manual review | Yes |

### Auto-Loop Rules

| Failure | Action | Route to |
|---------|--------|----------|
| No task exists | Create retroactively via `bd create` | Designer |
| Task has no description | Add via `bd edit <id> --notes` | Designer |
| Tests missing | Write tests before proceeding | Developer |
| Tests fail | Fix tests | Developer |
| Lint fails | Fix lint issues | Developer |
| ADR missing for architectural change | Write ADR | Designer |
| Diff >500 LOC | Split into smaller tasks | Designer |
| Security issue found | Fix | Developer |
| Docs out of date | Update | Developer |
| All checks pass | Present summary | — |

### Completion Summary

```
━━━ Review Complete ━━━
✓ Task: {task-id} tracked
✓ Tests: {n} passing, 0 failing
✓ Lint: passing
✓ ADR: not needed | ADR-NNN written
✓ Diff: ~{n} LOC (under 500)
✓ Secrets: none found
✓ Docs: up to date

Ready to commit? [y/n]
```

### Commit Format

Conventional Commits with task ID:

```
<type>(<scope>): <subject> [BD-<task-id>]

<body: what changed and why>
```

Valid types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `style`, `perf`, `ci`, `build`.

### Task Closure

After commit:
```sh
bd close <task-id> --reason "Summary of changes. Commit <hash>."
```

---

## Beads Backend Reference

### CLI Commands

| Operation | Command |
|-----------|---------|
| List all tasks | `bd list --json --all` |
| List open tasks | `bd list --json` |
| Show specific task | `bd show <id> --json` |
| Create task | `bd create "title" --json` |
| Edit task description | `bd edit <id> --notes "..."` |
| Close task | `bd close <id> --reason "..."` |
| Show ready tasks | `bd ready --json` |
| Show blocked tasks | `bd blocked --json` |

### Core Entities

**Task**: Granular implementation work item.
- `id`: Unique identifier
- `description`: Self-contained work description
- `state`: `todo` → `inprogress` → `review` → `done`
- `tags`: Categorization labels
- `depends`: Dependency list

### Source of Truth Rules

- **Backend state is authoritative** for task existence, lifecycle, and metadata
- **Never fall back to git log** for task queries without telling the user
- **Never assume task state** from local files or timestamps

### Error Handling

If `bd` CLI fails:

```
⚠ Backend query failed: <error>

The Beads backend is not accessible. This may be due to:
- Missing .beads/ directory (run `bd init`)
- bd CLI not installed or not in PATH

I can show git history instead, but this won't reflect actual task state.
Would you like me to: [show git history] [help configure backend]?
```

---

## Workflow Patterns

### Feature Workflow

```
User request
  → Planner: detect intent, estimate scope
  → User confirms plan
  → Designer: create tasks, ADR if needed
  → User confirms tasks
  → Developer: implement task (TDD, ≤500 LOC)
  → QA: run gates
    → Pass: commit + close task → present next task to Developer
    → Fail: loop back to Developer or Designer
  → Next task (repeat Developer → QA)
  → All tasks done
```

<!-- AIDEV-NOTE: After QA commits a task, it advances to the next task in
     the Designer's plan and hands off to the Developer. The user does not
     need to drive task-by-task advancement — QA handles the transition. -->

### Fix Workflow

```
User reports bug
  → Planner: confirm understanding
  → Designer: create single task
  → Developer: write failing test, then fix
  → QA: run gates → commit
```

### Trivial Workflow

```
User requests small change (<10 LOC)
  → Planner: "Trivial change. Proceed? [y/n]"
  → Developer: implement + create Beads task inline (bd create)
  → QA: run gates → commit
```

<!-- AIDEV-NOTE: Even trivial changes need a Beads task. The Developer creates
     it inline to avoid bouncing through the Designer for one-liners. QA's
     task gate still applies — no exceptions. -->
