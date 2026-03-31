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

## CRITICAL: Five-Gate Workflow System

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

### Gate 3: Task Tracking (Non-Trivial Work)

**CRITICAL**: Before writing any files for non-trivial work (>30 LOC or multi-file), create a tracking task in the configured workflow backend.

1. Read `.agent/config.json` to determine the backend type
2. Create a task to track this work:
   - **Beads backend**: `bd create "Brief description of work" --json`
   - **Jira-Taskwarrior**: Use appropriate task creation
   - **Other backends**: Follow backend-specific task creation
3. Note the task ID for reference in commits and summaries

**Skip task creation only when**:
- Work is trivial (<30 LOC, single file, typo/rename)
- User explicitly says "don't track" or "quick fix"
- Already working within an existing tracked task/issue

This ensures all meaningful work is captured in the workflow system for history and continuity.

### Gate 4: Review/QA (After Implementation)

After implementation is complete, verify the work before committing. This gate uses an **auto-loop** — the agent automatically fixes clear failures without user intervention, only consulting the user when unsure or when presenting completion.

#### Review Steps

1. **Build check** — Compile/build the project
   - If fails → auto-loop back to implementation, fix the issue
   
2. **Test check** — Run tests (use `/test` or project test command)
   - If fails → auto-loop back to implementation, fix failing tests
   
3. **Spec compliance** — If a spec exists for this work, verify requirements are met
   - Use the `spec-reviewer` agent or manually check acceptance criteria
   - If clear gaps → auto-loop back to implementation (or planning if design was wrong)
   
4. **Code review** — Self-review the diff for quality issues
   - Use the `code-reviewer` agent or apply the review checklist
   - Fix obvious issues (naming, error handling, security) automatically
   
5. **PR size check** — Verify total diff is under ~500 LOC
   - If exceeds → warn user, suggest splitting into smaller PRs/features
   - This is a **hard gate** — PRs over 500 LOC should not proceed without user decision

#### Auto-Loop Rules

| Condition | Action |
|-----------|--------|
| Build fails | Auto-loop to implementation, fix immediately |
| Tests fail | Auto-loop to implementation, fix immediately |
| Spec gaps (clear) | Auto-loop to implementation or planning (agent decides based on whether it's a code issue or design issue) |
| Code review issues (obvious) | Auto-fix in implementation |
| PR too large (>500 LOC) | Stop, present to user, suggest split strategy |
| Unsure about any failure | Stop, ask user for guidance |
| All checks pass | Present summary, proceed to user approval |

#### Completion Summary

When all checks pass, present a summary to the user:

```
━━━ Review Complete ━━━
✓ Build: passing
✓ Tests: 42 passing, 0 failing
✓ Spec: 8/8 requirements met
✓ Code review: no issues
✓ PR size: ~180 LOC (under limit)

Ready to commit? [y/n]
```

If any checks required auto-fix loops, mention them:
```
Note: Fixed 2 failing tests during review (see above).
```

### Gate 5: Task Closure (After Commit)

After committing work, close the tracking task with a summary:

1. **Close the task** with a brief summary of what was done:
   - **Beads backend**: `bd close <task-id> --reason "Summary of changes. Commit <hash>."`
   - **Jira-Taskwarrior**: Transition the task to done
   - **Other backends**: Follow backend-specific closure

2. **Include in the closure reason**:
   - What was accomplished
   - Commit hash for traceability
   - Any notable decisions or follow-ups

**Skip task closure only when**:
- No task was created (trivial work)
- Work is incomplete and will continue in the next session

### Ambiguous Responses Require Clarification

| Response | Action |
|----------|--------|
| "go" | Ask: "Proceed with implementation? [y/n]" |
| "ok", "sure", "fine" | Ask: "Shall I begin writing the files? [y/n]" |
| "looks good" | Ask: "Looks good — ready to implement? [y/n]" |

## Skip Conditions

Skip Gate 1 ONLY when:
- User invoked an explicit slash command (`/spec`, `/feature`, `/implement`)
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
| **feature** | Full workflow | Issue → Spec (requirements) → Spec (design) → Tasks → Implement → Review |
| **fix/bug** | Quick workflow | Issue → Quick spec → Implement → Review |
| **review/optimize** | Analysis workflow | Issue → Analyze → Tasks → Implement → Benchmark |
| **quick/trivial** | Minimal | Implement directly (no spec, no issue) |

### Confidence-Based Routing

**High confidence (≥0.8)**: Present the workflow plan and start on confirmation.

**Medium confidence (0.5–0.8)**: Offer workflow options:
```
This could be handled as:
[1] New feature — full spec → tasks → implement
[2] Bug fix — quick spec → implement
[3] Code review — analyze → optimize
[4] Quick change — just implement

Which fits? [1-4]
```

**Low confidence (<0.5)**: Ask clarifying questions before proceeding.

### Checkpoint Behavior

At each workflow checkpoint, provide a concise summary and options:

```
━━━ {Phase} Summary ━━━
• {key metrics: requirements count, estimated LOC, files}

[c]ontinue  [s]kip  [m]odify  [d]etails  [q]uit
```

**Smart skip suggestions**: For small changes (<50 LOC, ≤2 files), suggest skipping heavyweight steps:
- Skip design review for straightforward fixes
- Skip formal spec for trivial changes
- Skip task breakdown for single-task work

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
       **Workflow**: full (6 steps)
       **Scope**: ~120 LOC, 5 files

       Proceed? [y/n/?]

User: y

Agent: ━━━ Workflow Plan ━━━
       Steps:
         1. Create issue
         2. Spec (requirements)
         3. Spec (design)
         4. Task breakdown
         5. Implementation
         6. Review

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

This file enforces workflow-first behavior with a five-gate confirmation system
and post-confirmation orchestration. It combines:

1. Gate 1: Intent acknowledgment (confirm user wants to work on this)
2. Gate 2: Implementation confirmation (confirm the plan before writing files)
3. Gate 3: Task tracking (create backend task for non-trivial work)
4. Gate 4: Review/QA (auto-loop on failures, verify before commit)
5. Gate 5: Task closure (close task after commit with summary)
6. Orchestration: Route to appropriate workflow based on intent and scope

The intent detection is deliberately conservative — when unsure, ask rather than guess.
This preserves user trust and prevents mis-routing.
