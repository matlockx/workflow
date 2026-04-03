# Workflow-First Checklist

Before responding to ANY task request, follow this checklist:

1. **Detect intent** — Is this a feature, fix, review, plan, or quick task?
2. **Estimate scope** — How many files? Roughly how many lines of code?
3. **Present acknowledgment** — Use the adaptive template based on scope
4. **Wait for confirmation** — Do not execute until user confirms

## Adaptive Templates

| Scope | Template |
|-------|----------|
| >30 LOC or multi-file | `**Detected**: {type} — {confidence}%` + workflow + scope + `[y/n/?]` |
| <30 LOC, single file | `Quick fix (~{loc} LOC, {files} file). Proceed? [y/n/?]` |
| <10 LOC (typo/rename) | `Trivial change. Proceed? [y/n]` |

## CRITICAL: Three-Gate Workflow System

### Gate 1: Intent Acknowledgment (this checklist)

Present the acknowledgment template BEFORE any other interaction — including
asking clarifying questions or doing research. This gate confirms the USER
wants you to work on this task at all.

### Gate 2: Implementation Confirmation

After planning is complete (questions answered, plan reviewed), present:

```
Ready to implement:
- [ ] {file1} (~{loc} LOC)
- [ ] {file2} (~{loc} LOC)

Begin? [y/n]
```

**Valid confirmations**:
- `y`, `yes`, `proceed`, `do it`, `implement`, `go ahead` — proceed as planned
- `y <instructions>`, `yes, <instructions>`, `yes but <instructions>` — proceed and incorporate the additional instructions

When the user provides text after their confirmation, treat it as additional instructions to incorporate during implementation. Examples:
- `y but skip the README update` → proceed, skip README
- `yes, also add AIDEV-NOTE comments` → proceed, ensure comments are added
- `sure and run tests after` → proceed, run tests when done
- `y don't forget to update the exports` → proceed, make sure exports are updated

### Gate 3: Ship (Build + Tests + Commit)

After implementation is complete, run the quality checks and close the loop.
This gate uses an **auto-loop** — fix clear failures immediately without user
intervention; only stop when unsure or all checks pass.

#### Steps

1. **Task existence + detail check** — Verify a tracking task exists in the backend for this work AND has a meaningful description
   - If missing → auto-loop: create the task retroactively (`bd create "..." --json`), note the ID, then continue
   - If the task title is the only content (no body/notes describing *what* needs to be done and *why*) → auto-loop: add a description via `bd edit <id> --notes "..."` before continuing
   - The description must include: what the work entails, any acceptance criteria or findings, and links/references needed to execute it without context from the current session
   - This is a **hard requirement** — no work is committed without a task ID **and a self-contained description**

2. **Build check** — Compile/build the project
   - If fails → auto-loop back to implementation, fix immediately

3. **Test check** *(hard gate)* — Verify tests exist AND pass
   - **First: check for test coverage** — Does the changed code have corresponding tests? Look for test files (`*_test.py`, `*.test.ts`, `*_test.go`, `test_*.py`, `*.spec.*`, etc.) covering the changed logic.
   - **If no tests exist** → auto-loop back to implementation: **write tests before proceeding**. This is non-negotiable (see G-6 in AGENTS.md). Do not skip, do not continue, do not ask the user — just write the tests.
   - **If tests exist but fail** → auto-loop back to implementation, fix failing tests
   - Only continue to the next step once tests both exist and pass

4. **Code review** — Self-review the diff for quality issues
   - Use the `code-reviewer` agent or apply the review checklist
   - Fix obvious issues (naming, error handling, security) automatically

5. **Documentation & script check** *(hard gate)* — Verify all user-facing surfaces are up to date:
   - **README / docs**: Does any changed behavior, CLI flag, config option, or file layout need a doc update? If yes → update before committing.
   - **Helper / build scripts** (`bin/`, `Makefile`, `scripts/`, etc.): Do any scripts need updating to reflect the changes (new flags, removed commands, renamed files)? If yes → update.
   - **AGENTS.md** (root + directory-specific): Do any workflow rules, glossary entries, or directory descriptions need updating? If yes → update.
   - If unsure whether a doc update is needed → err on the side of updating.

6. **ADR check** *(hard gate)* — Decide if an Architecture Decision Record is needed:
   - **Write an ADR** when the change involves any of: a new architectural pattern, a significant deletion or replacement of a system component, a cross-cutting behavioral change, or a decision that future contributors would otherwise have to reverse-engineer.
   - **Skip the ADR** only for purely mechanical changes (renaming, formatting, dependency bumps, doc-only edits, bug fixes with no design trade-off).
   - When in doubt → write a short ADR. Short is better than missing.
   - ADRs live in `docs/architecture/adr/ADR-NNN-<slug>.md`. Use the template at `docs/architecture/adr/TEMPLATE.md`.
   - The ADR must be committed in the **same commit** as the code it documents.

7. **PR size check** — Verify total diff is under ~500 LOC
   - If exceeds → warn user, suggest splitting into smaller PRs/features
   - This is a **hard gate** — PRs over 500 LOC should not proceed without user decision

8. **Commit** — Commit with a Conventional Commit message

9. **Task closure** — Close the tracking task with a summary:
   - **Beads backend**: `bd close <task-id> --reason "Summary of changes. Commit <hash>."`
   - Include what was accomplished and the commit hash for traceability

#### Auto-Loop Rules

| Condition | Action |
|-----------|--------|
| No task exists | Auto-loop: create task retroactively (`bd create "..." --json`), note the ID, then continue |
| Task has no description | Auto-loop: add description via `bd edit <id> --notes "..."` before continuing |
| Build fails | Auto-loop to implementation, fix immediately |
| **No tests exist for changed code** | **Auto-loop to implementation: write tests immediately — this is a hard block, no exceptions** |
| Tests fail | Auto-loop to implementation, fix immediately |
| Code review issues (obvious) | Auto-fix in implementation |
| Docs/scripts out of date | Auto-fix: update before committing |
| ADR needed but missing | Auto-loop: write ADR, add to commit |
| PR too large (>500 LOC) | Stop, present to user, suggest split strategy |
| Unsure about any failure | Stop, ask user for guidance |
| All checks pass | Present summary, proceed to commit |

#### Completion Summary

When all checks pass, present a summary to the user:

```
━━━ Review Complete ━━━
✓ Task: opencode-xyz tracked
✓ Build: passing
✓ Tests: 42 passing, 0 failing
✓ Code review: no issues
✓ Docs/scripts: up to date
✓ ADR: not needed (mechanical change) | ADR-004 written
✓ PR size: ~180 LOC (under limit)

Ready to commit? [y/n]
```

If any checks required auto-fix loops, mention them:
```
Note: Fixed 2 failing tests during review (see above).
Note: Updated README usage section (new --flag added).
```

### Ambiguous Responses Require Clarification

| Response | Action |
|----------|--------|
| "go" | Ask: "Proceed with implementation? [y/n]" |
| "ok", "sure", "fine" | Ask: "Shall I begin writing the files? [y/n]" |
| "looks good" | Ask: "Looks good — ready to implement? [y/n]" |

## Skip Conditions

Skip Gate 1 ONLY when:
- User invoked an explicit slash command (`/feature`, `/implement`, etc.)
- User is asking a question, not requesting work
- User is continuing mid-workflow (already confirmed earlier)
- User already confirmed in this conversation turn

Gate 2 is NEVER skipped for non-trivial tasks.

---

## Post-Confirmation: Workflow Orchestration

After the user confirms at Gate 2, orchestrate the appropriate workflow based on detected intent.

### Workflow Types

| Intent | Workflow | Steps |
|--------|----------|-------|
| **feature** | Full workflow | Issue → Tasks → Implement → Review |
| **fix/bug** | Quick workflow | Issue → Implement → Review |
| **review/optimize** | Analysis workflow | Issue → Analyze → Tasks → Implement → Benchmark |
| **quick/trivial** | Minimal | Implement directly (no issue) |

### Confidence-Based Routing

**High confidence (≥0.8)**: Present the workflow plan and start on confirmation.

**Medium confidence (0.5–0.8)**: Offer workflow options:
```
This could be handled as:
[1] New feature — issue → tasks → implement
[2] Bug fix — issue → implement
[3] Code review — analyze → optimize
[4] Quick change — just implement

Which fits? [1-4]
```

**Low confidence (<0.5)**: Ask clarifying questions before proceeding.

### Checkpoint Behavior

At each workflow checkpoint, provide a concise summary and options:

```
━━━ {Phase} Summary ━━━
• {key metrics: task count, estimated LOC, files}

[c]ontinue  [s]kip  [m]odify  [d]etails  [q]uit
```

**Smart skip suggestions**: For small changes (<50 LOC, ≤2 files), suggest skipping heavyweight steps:
- Skip task breakdown for single-task work
- Skip phase review for trivial implementation

### Delegation Rules

After orchestration decisions are made:

- **Full feature/fix/review** → Delegate to `/feature` command
- **Quick changes** → Delegate to `/feature --quick` or implement directly
- **Trivial changes** → Just do it (single edit, no ceremony)

### Pattern Recognition

Recognize these natural language patterns to detect intent:

| Pattern | Intent |
|---------|--------|
| "Add X", "Create X", "Build X", "Implement X", "I want to", "New feature" | feature |
| "Fix X", "Resolve X", "Debug X", "X is broken", "X doesn't work", "Bug:" | fix |
| "Optimize X", "Improve X", "Refactor X", "Clean up X", "X is slow" | review |
| "Plan X", "Brainstorm X", "Roadmap", "Strategy" | plan |
| Typo, rename, single-line change | quick |

### Example: Feature Request

```
User: I want to add dark mode to the settings page

Agent: **Detected**: feature — 85%
       **Workflow**: full (4 steps)
       **Scope**: ~120 LOC, 5 files

       Proceed? [y/n/?]

User: y

Agent: ━━━ Workflow Plan ━━━
       Steps:
         1. Create issue
         2. Task breakdown
         3. Implementation
         4. Review

       Starting with issue creation...
       [Delegates to /feature]
```

### Example: Trivial Fix

```
User: Fix the typo "Sing In" on the login button

Agent: Trivial change. Proceed? [y/n]

User: y

Agent: Fixed "Sing In" → "Sign In" in src/components/LoginButton.tsx:23
```

---

## AIDEV-NOTE: Unified workflow-first behavior

This file enforces workflow-first behavior with a three-gate confirmation system
and post-confirmation orchestration. The pipeline is: issue → tasks → implement → review.
The backend IS the state — no local cursor files, no spec stage.

Gates:
1. Gate 1: Intent acknowledgment (confirm user wants to work on this)
2. Gate 2: Implementation confirmation (confirm the plan before writing files)
3. Gate 3: Ship (build + tests + commit + task closure — auto-loop on failures)
   Steps: task-check → build → tests → code-review → docs/scripts → ADR → PR-size → commit → close

Gate 3 doc/script check and ADR check are **hard gates** — they block commit if skipped.
The test check is also a **hard gate** — missing tests are treated the same as failing tests: auto-loop to write them first, no exceptions.
The intent detection is deliberately conservative — when unsure, ask rather than guess.
This preserves user trust and prevents mis-routing.
