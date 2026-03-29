---
description: Resume a previously started /feature or /fix workflow from where it left off
agent: spec-mode
mode: plan
---

# /resume — Resume an in-progress workflow

Pick up where you left off on any active work item. If a specific issue ID is
given, resume it directly. If no argument is given, show a picker for all
active items.

## Input

- `$ARGUMENTS`: optional issue ID, optionally with `--backend=<type>`
  - Examples: `ISSUE-3`, `IN-9821`, *(empty — show picker)*

---

## Steps

1. **Parse arguments**

   ```js
   const { parseBackendOverride } = require('./lib/backend-loader.js')
   const wf = require('./lib/workflow-state.js')

   const { backendType, cleanedArguments } = parseBackendOverride($ARGUMENTS)
   const issueId = cleanedArguments.trim().split(/\s+/).filter(t => !t.startsWith('--'))[0] || null
   ```

2. **Load active items**

   ```js
   const activeItems = wf.getAllActiveItems()
   ```

3. **If no active items exist**

   Print and stop:
   ```
   No active work items found.
   Start one with: /feature <issueId>
   ```

4. **If a specific issueId was given**

   ```js
   const item = wf.getActiveItem(issueId)
   ```

   - If not found in active items:
     - Check if it appears in `history` (completed items).
     - If in history: print `[ISSUE-X] is already complete.` and stop.
     - If not found at all: print `No work item found for ${issueId}.` and stop.
   - If found: jump to **Step 6**.

5. **Picker — show active items and let user choose**

   Format each item using `wf.formatItemSummary(item)` and present as a
   numbered list:

   ```
   Active work items:

     1. [ISSUE-3] Add search API — spec › design-review  (started 2d ago)
     2. [ISSUE-7] Fix null pointer crash — implement › in-phase  (started 5h ago)
     3. [ISSUE-9] Improve error messages — tasks › pending  (started 1h ago)

   Enter a number to resume, or press Enter to cancel:
   ```

   - Wait for user input.
   - If input is empty or non-numeric: print `Cancelled.` and stop.
   - If input is out of range: print `Invalid selection.` and stop.
   - Set `issueId` to the selected item's `issueId`.

6. **Show resume summary**

   Load the work item and display its current state:

   ```js
   const item = wf.getActiveItem(issueId)
   const next = wf.getNextStep(item)
   const skips = wf.formatSkips(item)
   ```

   Print:
   ```
   ══════════════════════════════════════════
   Resuming [ISSUE-3] "Add search API"
   Stage:    spec › design-review
   Next:     Review design
   ══════════════════════════════════════════
   ```

   If there are skipped steps, append:
   ```
   Skipped steps:
     - [SKIPPED] Review requirements: deferred (spec/requirements-review)
   ```

7. **Re-enter the /feature workflow at the current position**

   Delegate to `command/feature.md` starting from the **Interaction Protocol**
   section, using the already-loaded `item.stage` and `item.substage` to skip
   directly to the right step.

   - Load the backend: `getBackend(backendType)`.
   - Fetch the issue: `backend.getIssue(issueId)`.
   - Do **not** call `wf.createWorkItem` — the item already exists.
   - Execute the stage handler that matches `item.stage`/`item.substage`.

---

## AIDEV-NOTE: re-entry design

`/resume` is deliberately a thin redirect — it finds the right work item,
prints a summary, and then falls into the exact same stage/substage logic that
`/feature` uses. There is no separate "resume mode"; the stage machine in
`feature.md` is stateless and reads position from `workflow.json` every time.
