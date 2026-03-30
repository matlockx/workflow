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

## CRITICAL: Two-Gate Confirmation System

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

Only write files after explicit confirmation: "y", "yes", "proceed", "do it", "implement".

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

## AIDEV-NOTE: Two-gate confirmation system

This file enforces workflow-first behavior with a two-gate confirmation system.
Gate 1 confirms intent. Gate 2 confirms implementation. Both are required for
non-trivial tasks to prevent premature file modifications.
