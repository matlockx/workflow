---
description: Resume a previously started /feature workflow from where it left off
agent: build
mode: plan
---

# /resume — Resume an in-progress workflow

Pick up where you left off on any active work item. The backend owns all state,
so resuming is simply re-entering `/feature` with the right issue ID.

## Input

- `$ARGUMENTS`: optional issue ID, optionally with `--backend=<type>` or `--yolo`
  - Examples: `ISSUE-3`, `IN-9821`, `ISSUE-3 --yolo`, *(empty — list open items)*

---

## Steps

1. **Parse arguments**

   ```js
   const { parseBackendOverride, getBackend } = require('./lib/backend-loader.js')

   const { backendType, cleanedArguments } = parseBackendOverride($ARGUMENTS)
   const tokens = cleanedArguments.trim().split(/\s+/).filter(Boolean)
   const yoloFlag = tokens.some(t => t === '--yolo')
   const issueId = tokens.filter(t => !t.startsWith('--'))[0] || null
   const backend = getBackend(backendType)
   ```

2. **If no issue ID given — list open items**

   Call `backend.listIssues({ status: 'open' })` (or equivalent for the configured
   backend). If none are returned, print and stop:
   ```
   No open work items found.
   Start one with: /feature <issueId>
   ```

   Otherwise, present a numbered list:
   ```
   Open work items:

     1. ISSUE-3  — Add search API
     2. ISSUE-7  — Fix null pointer crash
     3. ISSUE-9  — Improve error messages

   Enter a number to resume, or press Enter to cancel:
   ```

   - Wait for user input.
   - If empty or non-numeric: print `Cancelled.` and stop.
   - If out of range: print `Invalid selection.` and stop.
   - Set `issueId` to the selected issue's ID.

3. **Verify the issue exists**

   Call `backend.getIssue(issueId)`.
   - If not found: print `No work item found for ${issueId}.` and stop.

4. **Delegate to /feature**

   Re-enter the `/feature` workflow with the resolved issue ID, forwarding any flags:

   ```
   Resuming [ISSUE-3] "Add search API"...
   ```

   If `--yolo` was passed, append `--yolo` when delegating so YOLO mode is active.

   The `/feature` command reads backend task state to determine where work left off
   and continues from there automatically.

---

## AIDEV-NOTE: stateless resume design

`/resume` is a thin lookup-and-redirect. The backend is the sole source of truth
for issue and task state — there is no local cursor file to read or update.
Passing `--yolo` here simply forwards the flag to `/feature`, which handles it.
Re-entering `/feature` with the same issue ID is always safe: it checks existing
task states and picks up from the first non-terminal task.
