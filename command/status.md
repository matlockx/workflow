---
description: Show the current status of open issues and their implementation tasks
agent: build
mode: plan
---

# /status — Workflow status dashboard

Read-only view of open work items and their task progress. Queries the configured
backend directly — no local state files.

## Input

- `$ARGUMENTS`: optional issue ID for focused view, or `--all` to include closed items
  - Examples: *(empty — all open items)*, `ISSUE-3`, `--all`

---

## Steps

1. **Parse arguments**

   ```js
   const { parseBackendOverride, getBackend } = require('./lib/backend-loader.js')

   const { backendType, cleanedArguments } = parseBackendOverride($ARGUMENTS)
   const tokens = (cleanedArguments || '').trim().split(/\s+/).filter(Boolean)
   const showAll = tokens.includes('--all')
   const issueId = tokens.find(t => !t.startsWith('--')) || null
   const backend = getBackend(backendType)
   ```

2. **Focused view — single issue**

   If `issueId` was given:
   - Call `backend.getIssue(issueId)`.
   - If not found: print `No work item found for ${issueId}.` and stop.
   - Call `backend.getTasks({ issueId, tags: ['impl'] })`.
   - Print the detailed view (see format below) and stop.

3. **Dashboard view — all issues**

   If no `issueId`:
   - Call `backend.listIssues({ status: showAll ? 'all' : 'open' })`.
   - If no items returned: print:
     ```
     No open work items.
     Start one with: /feature <issueId>
     ```
     Stop.
   - For each issue, call `backend.getTasks({ issueId: issue.id, tags: ['impl'] })`
     to get task progress.
   - Print the summary table (see format below).

---

## Output Formats

### Summary table (dashboard view)

```
Open work items  (3)
══════════════════════════════════════════════════════════

  ID          SUMMARY                        TASKS           PHASE
  ISSUE-3     Add search API                 3/8 done        Phase 2
  ISSUE-7     Fix null pointer crash         0/4 done        Phase 1
  ISSUE-9     Improve error messages         8/8 done        complete

══════════════════════════════════════════════════════════
Run /resume <issueId> to continue any item.
```

If `--all` was passed, closed items appear below the open ones:

```
Closed  (2)
──────────────────────────────────────────────────────────

  ID          SUMMARY                        STATUS
  ISSUE-1     Dark mode toggle               closed/done
  ISSUE-2     Auth bug fix                   closed/done
```

### Detailed view (single issue)

```
══════════════════════════════════════════════════════════
[ISSUE-3]  Add search API
══════════════════════════════════════════════════════════

  Status:     open
  Tasks:      3/8 done

  Phases:
    ✓ Phase 1: Foundation          (3/3 tasks done)
    → Phase 2: Core Implementation  (0/4 tasks — IN PROGRESS)
      • [ ] Implement search index
      • [ ] Add result ranking
      • [ ] Write unit tests
      • [ ] Integration test
    · Phase 3: Polish               (not started)

══════════════════════════════════════════════════════════
Run /resume ISSUE-3 to continue.
```

---

## AIDEV-NOTE: backend-driven, read-only

This command reads exclusively from the configured backend — no local state files.
It must never call any state-mutating backend method. All task progress is derived
from backend task states (`todo`, `inprogress`, `done`, `approved`).

Phase grouping is reconstructed from task dependency or metadata returned by the
backend. If the backend does not expose phase grouping, fall back to a flat task list.
