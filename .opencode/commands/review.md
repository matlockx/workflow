---
description: Run Gate 3 quality checks on current changes and commit if all pass
agent: qa
---

# /review — Quality gate review

Gate 3 orchestrator. Runs all quality checks on the current implementation and
either commits (if all pass) or routes failures back to the responsible agent.

## Input

- `$ARGUMENTS`: optional Beads task ID
  - Examples: `/review`, `/review BD-abc123`
  - If no task ID given, infer from recent `bd list --json` or git branch

## Workflow

1. **Identify the task**

   If task ID provided:
   ```sh
   bd show <task-id> --json
   ```

   If not provided, find the in-progress task:
   ```sh
   bd list --json | # find task with state "inprogress"
   ```

   If no task found, report: "No in-progress task found. Create one first."

2. **Run gates in order**

   Load the **quality-gates** skill and run each gate:

   | # | Gate | Command |
   |---|------|---------|
   | 1 | Task exists with description | `bd show <id> --json` |
   | 2 | Tests exist and pass | `go test ./... -race -count=1` |
   | 3 | Lint passes | `golangci-lint run` |
   | 4 | ADR check (if architectural) | Check `docs/adr/INDEX.md` |
   | 5 | Diff under 500 LOC | `git diff --shortstat` |
   | 6 | No hardcoded secrets | Pattern grep on staged files |
   | 7 | Docs up to date | Manual review |

3. **Handle failures**

   On first hard failure, stop and route:

   ```
   ━━━ Gate 3 Failure ━━━
   Gate: {name}
   Status: FAILED
   Details: {error output}

   Routing to: {Developer|Designer}
   Action needed: {what to fix}
   ```

   After the fix, re-run ALL gates from step 2.

4. **All gates pass — present summary**

   ```
   ━━━ Gate 3 Complete ━━━
   ✓ Task: BD-{id} tracked
   ✓ Tests: {n} passing, 0 failing
   ✓ Lint: passing
   ✓ ADR: not needed | ADR-NNN written
   ✓ Diff: ~{n} LOC (under 500)
   ✓ Secrets: none found
   ✓ Docs: up to date

   Ready to commit? [y/n]
   ```

5. **Commit on confirmation**

   ```sh
   git add -A
   git commit -m "<type>(<scope>): <subject> [BD-<task-id>]

   <body>"
   ```

6. **Close the task**

   ```sh
   bd close <task-id> --reason "Implemented and committed. Commit <hash>."
   ```

7. **Advance to next task**

   If more tasks remain, present the next one:
   ```
   Next task: BD-{next-id} — {title}
   Run /implement BD-{next-id} or /implement --next to continue.
   ```

## AIDEV-NOTE: review command boundaries

This command is the final gatekeeper. It never skips gates and always re-runs
all gates after a fix. The QA agent does the actual review work.
