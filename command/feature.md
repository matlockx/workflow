---
description: Guide an issue through its full lifecycle — spec → tasks → implement → review — with cross-session persistence
agent: spec-mode
mode: plan
---

# /feature — Full lifecycle orchestrator

Drive an issue from idea to merged code in a single resumable workflow.
State is persisted in `.agent/state/workflow.json` so work can span multiple
sessions.

## Input

- `$ARGUMENTS`: issue ID, optionally with `--type=fix`, `--backend=<type>`, or `--yolo`
  - Examples: `ISSUE-3`, `IN-1234 --type=fix`, `MOCK-1 --backend=mock`, `ISSUE-3 --yolo`

---

## Bootstrap

1. **Parse arguments**

   ```js
   const { parseBackendOverride } = require('./lib/backend-loader.js')
   const wf = require('./lib/workflow-state.js')

   const { backendType, cleanedArguments } = parseBackendOverride($ARGUMENTS)
   const tokens = cleanedArguments.trim().split(/\s+/).filter(Boolean)

   // Detect --type flag
   let workType = 'feature'
   const typeFlag = tokens.find(t => t.startsWith('--type='))
   if (typeFlag) workType = typeFlag.replace('--type=', '')

   // Detect --yolo flag
   const yoloMode = tokens.some(t => t === '--yolo')

   const issueId = tokens.filter(t => !t.startsWith('--'))[0]
   ```

2. **Validate input**
   - If no `issueId` is supplied, print usage and stop:
     ```
      Usage: /feature <issueId> [--type=fix] [--backend=<type>] [--yolo]
     ```

3. **Load the backend**
   ```js
   const { getBackend } = require('./lib/backend-loader.js')
   const backend = getBackend(backendType)
   ```
   If initialization fails, show the error and stop.

4. **Fetch the issue**
   - Call `backend.getIssue(issueId)`.
   - If not found, tell the user and stop.
   - Store `issue.summary` as `title`.

5. **Resolve or create the work item**
   ```js
   let item = wf.getActiveItem(issueId)

   if (!item) {
     item = wf.createWorkItem({ issueId, type: workType, title, yolo: yoloMode })
   } else if (yoloMode && !item.yolo) {
     // Upgrade an existing item to yolo mode if flag is passed
     wf.updateWorkItem(issueId, { yolo: true })
     item.yolo = true
   }
   ```
   - If `item` already exists and `item.stage === 'done'`, report the issue is
     complete and stop.
   - If `yoloMode` is active, print:
     ```
     ⚡ YOLO mode — skipping all approval gates, executing end-to-end.
     ```

6. **Show current position**
   ```
   ══════════════════════════════════════════
   /feature  [ISSUE-3]  My feature title
   Stage: spec › requirements-review
   ══════════════════════════════════════════
   ```

---

## Interaction Protocol

At every pause point, check `item.yolo` first:

- **If `item.yolo` is true (YOLO mode):** skip the prompt entirely and
  auto-continue through every step. Do not pause for requirements review,
  design review, task creation confirmation, task implementation confirmation,
  phase review, or PR creation. Execute everything end-to-end and only stop
  when the feature is complete or an unrecoverable error occurs.
  Tests should still be run — if they fail, fix them and continue rather
  than stopping to ask.

- **If `item.yolo` is false (normal mode):** show exactly:

```
[c]ontinue  [s]kip  [a]uto-run  [q]uit
```

- **c** — execute the current step, then pause again at the next pause point
- **s** — skip the current step; prompt for an optional reason, record it with
  `wf.recordSkip(issueId, stepName, reason)`, then continue to the next pause
  point
- **a** — execute all steps until the next **major stage boundary**
  (spec → tasks, tasks → implement, phase N end → phase N+1 start)
- **q** — save state (`wf.updateWorkItem` is already called after each step)
  and stop; tell the user `/resume <issueId>` picks up where they left off

---

## Stage: spec

**Entry condition:** `item.stage === 'spec'`

Switch the active agent to **spec-mode** for this stage.

### spec / drafting

1. Pause — unless YOLO mode, show: `Ready to draft the spec for ${issueId}?`
   In YOLO mode, proceed immediately.
2. On **c/a** (or auto in YOLO): invoke the spec workflow inline:
   - Call `backend.getSpec(issueId)` to check for an existing spec.
   - If none exists, call `backend.createSpec(issueId)`.
   - Write the spec file following the `/spec` command's steps 5–6
     (requirements section only at this point).
3. After writing requirements, advance:
   ```js
   wf.advanceSubstage(issueId) // drafting → requirements-review
   ```
4. Fall through to next substage.

### spec / requirements-review

1. Pause — unless YOLO mode, show:
   ```
   Please review the requirements above.
   Are they accurate and complete?

   [c]ontinue to Design  [s]kip  [a]uto-run  [q]uit
   ```
   In YOLO mode, auto-approve requirements and proceed immediately.
2. On **c/a** (or auto in YOLO): write the Design section of the spec.
3. Advance: `wf.advanceSubstage(issueId)` → `design-review`.

### spec / design-review

1. Pause — unless YOLO mode, show:
   ```
   Please review the design above.
   Is it accurate and complete?

   [c]ontinue to approval  [s]kip  [a]uto-run  [q]uit
   ```
   In YOLO mode, auto-approve design and proceed immediately.
2. On **c/a** (or auto in YOLO):
   - Update spec frontmatter: `work_state: approved`, `approvedAt: <ISO8601>`.
   - Call `backend.approveSpec(spec.id)`.
3. Advance: `wf.advanceSubstage(issueId)` → `approved`.

### spec / approved

- Advance to tasks stage:
  ```js
  wf.updateStage(issueId, 'tasks', 'pending')
  ```
- Fall through immediately (no pause needed here).

---

## Stage: tasks

**Entry condition:** `item.stage === 'tasks'`

Switch the active agent to **create-tasks** for this stage.

### tasks / pending

1. Pause — unless YOLO mode, show: `Ready to break the spec into implementation tasks?`
   In YOLO mode, proceed immediately.
2. On **c/a** (or auto in YOLO): invoke the create-tasks workflow:
   - Call `backend.getSpec(issueId)` and verify state is `approved`.
   - Check `backend.getTasks({ issueId, tags: ['impl'] })` for existing tasks.
   - If none, call `backend.createTasks(spec.id)` then let the create-tasks
     agent generate and persist the task list.
3. Advance: `wf.advanceSubstage(issueId)` → `created`.

### tasks / created

- Advance to implement stage:
  ```js
  wf.updateStage(issueId, 'tasks', null)
  wf.updateStage(issueId, 'implement', 'in-phase')
  ```
- Fall through immediately.

---

## Stage: implement

**Entry condition:** `item.stage === 'implement'`

Switch the active agent to **build** for this stage.

### implement / in-phase

Delegate entirely to the `/implement` command workflow (Steps 4–8 from
`command/implement.md`) using the same `issueId`.

After each **phase** completes (all its tasks reach `done`):
- Call `backend.updateTaskState(phase.id, 'review')`.
- Advance: `wf.advanceSubstage(issueId)` → `phase-review`.

### implement / phase-review

1. Pause — unless YOLO mode, show:
   ```
   Phase complete. Please run tests and review the code.

   [c]ontinue (approve phase)  [s]kip  [a]uto-run  [q]uit
   ```
   In YOLO mode, run tests automatically. If tests pass, auto-approve and
   continue. If tests fail, attempt to fix them and re-run. Only stop on
   unrecoverable errors.
2. On **c/a** (or auto in YOLO):
   - Call `backend.updateTaskState(phase.id, 'approved')`.
   - Advance: `wf.advanceSubstage(issueId)` → `phase-approved`.

### implement / phase-approved

- Check if more phases remain (any phase task not in `done`/`approved`):
  - If yes: reset to `in-phase` and loop:
    ```js
    wf.updateWorkItem(issueId, { substage: 'in-phase', phase: nextPhaseId })
    ```
  - If no: advance to review stage:
    ```js
    wf.updateStage(issueId, 'review', 'pending')
    ```

---

## Stage: review

**Entry condition:** `item.stage === 'review'`

### review / pending

1. Pause — unless YOLO mode, show:
   ```
   Implementation complete. Ready to create a PR and finish the review?

   [c]ontinue  [s]kip  [a]uto-run  [q]uit
   ```
   In YOLO mode, auto-create the PR and finish.
2. On **c/a** (or auto in YOLO):
   - Suggest running `/git` or `gh pr create` to open a pull request.
   - Optionally invoke `/PR-summary` if available.
3. Advance: `wf.advanceSubstage(issueId)` → `done`.

### review / done

- Mark complete and move to history:
  ```js
  wf.completeWorkItem(issueId)
  ```
- Print:
  ```
  ✓ [ISSUE-3] "My feature title" is complete.
  All stages done. Check your PR and close the issue when merged.
  ```

---

## Error Handling

| Situation | Action |
|-----------|--------|
| Backend unavailable | Show error, stop — state is already saved |
| `approveSpec` fails | Warn user, keep item at `design-review` |
| `createTasks` already exist | Skip task creation, advance to `created` |
| Task dependency blocked | Stop and tell user which dependency is unmet |
| User presses `q` | Save state, print `/resume <issueId>` hint |

---

## AIDEV-NOTE: agent-switching design

This command acts as a thin orchestrator. It does NOT implement spec writing,
task decomposition, or coding itself — it delegates to the appropriate agent
at each stage boundary:

- `spec-mode`     → requirements & design authoring
- `create-tasks`  → task breakdown
- `build`         → implementation loop

The spec file is the durable context shared between all agents. Workflow state
in `workflow.json` only tracks position (stage/substage/phase) and skip records.
It never duplicates content that the backend already owns.

State is written after **every** substage transition so a quit at any point
results in a clean resume point.

## AIDEV-NOTE: yolo mode design

The `--yolo` flag sets `item.yolo = true` on the work item in `workflow.json`.
This persists across sessions so `/resume` inherits it automatically. In YOLO
mode, all pause points auto-continue — the AI executes the entire lifecycle
(spec → tasks → implement → review) without stopping for human approval.
Tests are still run; failures are fixed rather than reported. The only hard
stop is an unrecoverable error (backend unavailable, etc.).
