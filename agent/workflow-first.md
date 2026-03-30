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

## Skip Conditions

Skip this checklist ONLY when:
- User invoked an explicit slash command (`/spec`, `/feature`, `/implement`)
- User is asking a question, not requesting work
- User is continuing mid-workflow (already confirmed earlier)
- User already confirmed in this conversation turn

## AIDEV-NOTE: This is a meta-instruction

This file is loaded as an instruction to enforce workflow-first behavior.
It ensures intent detection happens before any task execution, preventing
the agent from jumping directly into implementation without acknowledgment.
