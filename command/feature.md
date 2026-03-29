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

- `$ARGUMENTS`: issue ID, optionally with `--type=fix` or `--backend=<type>`
  - Examples: `ISSUE-3`, `IN-1234 --type=fix`, `MOCK-1 --backend=mock`

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
   const issueId = tokens.filter(t => !t.startsWith('--'))[0]
   ```

2. **Validate input**
   - If no `issueId` is supplied, print usage and stop:
     ```
      Usage: /feature <issueId> [--type=fix] [--backend=<type>]
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
     item = wf.createWorkItem({ issueId, type: workType, title })
   }
   ```
   - If `item` already exists and `item.stage === 'done'`, report the issue is
     complete and stop.

6. **Show current position**
   ```
   ══════════════════════════════════════════
   /feature  [ISSUE-3]  My feature title
   Stage: spec › requirements-review
   ══════════════════════════════════════════
   ```

---

## Interaction Protocol

At every pause point, show exactly:

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

1. Pause — show: `Ready to draft the spec for ${issueId}?`
2. On **c/a**: invoke the spec workflow inline:
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

1. Pause — show:
   ```
   Please review the requirements above.
   Are they accurate and complete?

   [c]ontinue to Design  [s]kip  [a]uto-run  [q]uit
   ```
2. On **c/a**: write the Design section of the spec.
3. Advance: `wf.advanceSubstage(issueId)` → `design-review`.

### spec / design-review

1. Pause — show:
   ```
   Please review the design above.
   Is it accurate and complete?

   [c]ontinue to approval  [s]kip  [a]uto-run  [q]uit
   ```
2. On **c/a**:
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

1. Pause — show: `Ready to break the spec into implementation tasks?`
2. On **c/a**: invoke the create-tasks workflow:
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

1. Pause — show:
   ```
   Phase complete. Please run tests and review the code.

   [c]ontinue (approve phase)  [s]kip  [a]uto-run  [q]uit
   ```
2. On **c/a**:
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

1. Pause — show:
   ```
   Implementation complete. Ready to create a PR and finish the review?

   [c]ontinue  [s]kip  [a]uto-run  [q]uit
   ```
2. On **c/a**:
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
