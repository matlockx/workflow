---
description: Implement tasks from the Designer's plan — TDD workflow with one task at a time
agent: developer
---

# /implement — Implement tasks

Executes implementation tasks sequentially. Each task follows TDD and stays
within the 500 LOC limit.

## Input

- `$ARGUMENTS`: Beads task ID or `--next` to pick the next ready task
  - Examples: `/implement BD-abc123`, `/implement --next`

## Workflow

1. **Resolve the task**

   If a task ID is given:
   ```sh
   bd show <task-id> --json
   ```

   If `--next` is given:
   ```sh
   bd ready --json
   ```
   Pick the first ready task.

   If no tasks are ready, report and stop.

2. **Start the task**

   ```sh
   bd edit <task-id> --state inprogress
   ```

3. **Load skills**

   Load the **golang** and **tdd** skills for implementation guidance.

4. **Read the task description**

   Verify the task has a self-contained description with:
   - What to implement
   - Acceptance criteria
   - File paths and references

   If the description is insufficient, stop and route to Designer.

5. **Implement with TDD**

   Follow the Developer agent's TDD workflow:
   1. Write failing test
   2. Run `go test ./...` — confirm failure
   3. Implement minimal code
   4. Run `go test ./...` — confirm pass
   5. Refactor
   6. Run `go test ./...` — still green

6. **Self-check before handoff**

   - [ ] Tests written and passing
   - [ ] `golangci-lint run` clean
   - [ ] Diff under 500 LOC: `git diff --shortstat`
   - [ ] `AIDEV-NOTE:` on non-obvious logic
   - [ ] No hardcoded secrets

7. **Hand off to QA**

   Present implementation summary and hand off to the QA agent
   for Gate 3 review.

## AIDEV-NOTE: implement command boundaries

This command runs one task at a time. After QA approves and commits,
call `/implement --next` for the next task, or `/implement BD-<id>`
for a specific one. The Developer agent does the actual coding.
