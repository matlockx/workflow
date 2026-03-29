---
description: Show the current status of all active (and recently completed) workflow items
agent: spec-mode
mode: plan
---

# /status — Workflow status dashboard

Read-only view of all active work items and their progress. Does not modify
any state.

## Input

- `$ARGUMENTS`: optional issue ID for focused view, or `--all` to include history
  - Examples: *(empty — all active items)*, `ISSUE-3`, `--all`

---

## Steps

1. **Parse arguments**

   ```js
   const wf = require('./lib/workflow-state.js')

   const tokens = ($ARGUMENTS || '').trim().split(/\s+/).filter(Boolean)
   const showAll = tokens.includes('--all')
   const issueId = tokens.find(t => !t.startsWith('--')) || null
   ```

2. **Load state**

   ```js
   const state = wf.loadWorkflowState()
   ```

3. **Focused view — single issue**

   If `issueId` was given:

   ```js
   const item = state.activeItems.find(i => i.issueId === issueId)
            || (showAll && state.history?.find(i => i.issueId === issueId))
   ```

   - If not found: print `No work item found for ${issueId}.` and stop.
   - Print the detailed view (see format below).
   - Stop.

4. **Dashboard view — all active items**

   If no `issueId`:

   ```js
   const items = state.activeItems
   const history = showAll ? (state.history || []) : []
   ```

   - If no active items and no history: print:
     ```
     No active work items.
     Start one with: /feature <issueId>
     ```
     Stop.

   - Print the summary table (see format below).

---

## Output Formats

### Summary table (dashboard view)

```
Active work items  (3)
══════════════════════════════════════════════════════════

  TYPE     ID          STAGE              NEXT STEP             STARTED
  feature  ISSUE-3     spec/design-review Review design         2d ago
  bug      ISSUE-7     implement/in-phase  Implement tasks       5h ago
  feature  ISSUE-9     tasks/pending      Create tasks          1h ago

══════════════════════════════════════════════════════════
Run /resume <issueId> to continue any item.
```

If `--all` was passed, append a **Completed** section:

```
Completed  (2)
──────────────────────────────────────────────────────────

  TYPE     ID          COMPLETED
  feature  ISSUE-1     3d ago
  bug      ISSUE-2     1w ago
```

If any item has skipped steps, add a warning footer:

```
⚠ Items with skipped steps: ISSUE-3 (1 skip), ISSUE-7 (2 skips)
  Run /status <issueId> for details.
```

### Detailed view (single issue)

```
══════════════════════════════════════════════════════════
[ISSUE-3]  Add search API  (feature)
══════════════════════════════════════════════════════════

  Stage:      spec › design-review
  Next step:  Review design — confirm the technical design is sound
  Started:    2d ago  (2024-01-15T10:23:00Z)
  Updated:    4h ago

  Stage history:
    ✓ spec/drafting            completed
    ✓ spec/requirements-review completed
    → spec/design-review       IN PROGRESS

  Skipped steps (1):
    - [SKIPPED] Review requirements: "requirements were obvious, skipped"
                at spec/requirements-review  (2d ago)

══════════════════════════════════════════════════════════
Run /resume ISSUE-3 to continue.
```

---

## Formatting helpers

Use these `workflow-state.js` helpers:
- `wf.getNextStep(item)` — get `{ label, hint }` for the current position
- `wf.formatItemSummary(item)` — one-line summary string
- `wf.formatSkips(item)` — multi-line skip detail

For the stage history, reconstruct progress by comparing the item's current
`stage`/`substage` against the ordered `wf.STAGES` and `wf.SUBSTAGES` arrays:
- Stages before the current one are complete.
- The current stage/substage is `IN PROGRESS`.
- Stages after are not yet started.

---

## AIDEV-NOTE: read-only contract

This command must NEVER call `wf.updateWorkItem`, `wf.advanceSubstage`,
`wf.createWorkItem`, `wf.completeWorkItem`, or any other state-mutating
function. It only reads `workflow.json` and formats the data for display.
This ensures `/status` is always safe to run at any point.
