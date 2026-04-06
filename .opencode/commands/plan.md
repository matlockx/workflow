---
description: Detect intent, estimate scope, and create a plan for a feature, fix, or refactor
agent: planner
---

# /plan — Plan work

Gate 1 orchestrator. Takes a user request and produces a structured acknowledgment
with intent, scope, and workflow recommendation.

## Input

- `$ARGUMENTS`: free-text description of the work
  - Examples: `/plan add rate limiting to API`, `/plan fix login timeout bug`

## Workflow

1. **Detect intent**

   Read `$ARGUMENTS` and classify as: feature, fix, review, or trivial.
   Use the intent detection table from the **workflow** skill.

2. **Estimate scope**

   - Search the codebase for affected files (`grep`, `glob`)
   - Check for existing related Beads tasks: `bd list --json`
   - Estimate LOC changes (additions + deletions)

3. **Present acknowledgment**

   Use the appropriate template based on scope:

   - **Non-trivial** (>30 LOC or multi-file): full acknowledgment with workflow + scope
   - **Small** (<30 LOC, single file): one-line quick fix prompt
   - **Trivial** (<10 LOC): minimal prompt

4. **Wait for confirmation**

   - `y` / `yes` → hand off to Designer (or Developer for trivial)
   - `n` / `no` → stop
   - `?` → explain in more detail
   - Ambiguous → ask for explicit yes/no

5. **Hand off**

   On confirmation, summarize the plan and hand off to the next agent:
   - Non-trivial: hand off to **Designer** for task creation
   - Trivial: hand off to **Developer** for direct implementation

## AIDEV-NOTE: plan command boundaries

This command orchestrates Gate 1 only. It does not create tasks, write code,
or run quality gates. The Planner agent does the actual analysis work.
