---
description: Guide an issue through its full lifecycle — tasks → implement → review — with natural language input
agent: build
mode: plan
---

# /feature — Full lifecycle orchestrator

Drive an issue from idea to merged code. Accepts either an issue ID or a natural
language description of what you want to build. The backend owns all state;
this command reads backend task states to know where to resume.

## Input

- `$ARGUMENTS`: issue ID or natural language description
  - Issue ID: `ISSUE-3`, `IN-1234 --type=fix`, `MOCK-1 --backend=mock`
  - Natural language: `Add OAuth login with Google and GitHub`
  - Optional flags:
    - `--type=fix`: Treat as bug fix (streamlined workflow)
    - `--backend=<type>`: Override configured backend
    - `--yolo`: Skip all approval gates, execute end-to-end
    - `--quick`: Skip task breakdown for small changes

---

## Bootstrap

1. **Parse arguments**

   ```js
   const { parseBackendOverride, getBackend } = require('./lib/backend-loader.js')
   const { detectIntent } = require('./lib/intent-router.js')

   const { backendType, cleanedArguments } = parseBackendOverride($ARGUMENTS)
   const tokens = cleanedArguments.trim().split(/\s+/).filter(Boolean)

   // Extract flags
   const yoloMode = tokens.some(t => t === '--yolo')
   const quickMode = tokens.some(t => t === '--quick')
   const typeFlag = tokens.find(t => t.startsWith('--type='))
   let workType = typeFlag ? typeFlag.replace('--type=', '') : 'feature'

   // Get non-flag tokens
   const nonFlagTokens = tokens.filter(t => !t.startsWith('--'))
   const firstToken = nonFlagTokens[0]
   ```

2. **Detect input type (issue ID vs natural language)**

   ```js
   // Check if first token looks like an issue ID (e.g., PROJ-123, IN-42, MOCK-1)
   const issueIdPattern = /^[A-Z]+-\d+$/i
   const isIssueId = firstToken && issueIdPattern.test(firstToken)

   let issueId = null
   let description = null

   if (isIssueId) {
     issueId = firstToken
   } else {
     description = nonFlagTokens.join(' ')
   }
   ```

3. **Load the backend**
   ```js
   const backend = getBackend(backendType)
   ```
   If initialization fails, show the error and stop.

4. **Print mode banners if applicable**

   If `yoloMode`:
   ```
   ⚡ YOLO mode — skipping all approval gates, executing end-to-end.
   ```
   If `quickMode`:
   ```
   ⚡ Quick mode — skipping task breakdown, going straight to implementation.
   ```

---

## Natural Language Input Flow

If `description` is set (no issue ID provided):

5. **Detect intent and confirm**

   ```js
   const intent = detectIntent(description)

   // Override workType if intent suggests different type
   if (intent.type && intent.type !== 'feature') {
     workType = intent.type
   }
   ```

   **High confidence (≥0.8):**
   ```
   ━━━ Workflow Plan ━━━
   I'll treat this as: {intent.type}

   Steps:
     1. Create issue
     2. Create tasks
     3. Implement
     4. Review

   [s]tart  [c]ustomize  [q]uit
   ```

   **Medium confidence (0.5–0.8):**
   ```
   I'm not entirely sure what workflow fits best.

   This sounds like it could be:
   [1] New feature (tasks → implement → review)
   [2] Bug fix (tasks → implement → review, streamlined)
   [3] Code review (analyze → optimize tasks)
   [4] Quick change (just implement, no task breakdown)

   Which workflow fits your needs? [1-4]
   ```

   **Low confidence (<0.5):**
   ```
   I need a bit more context.

   Could you tell me:
   • Is this a new feature, bug fix, or improvement?
   • Roughly how big is this change?
   • Are there any existing issues?
   ```

6. **On [s]tart: Create issue and continue**

   ```js
   const summary = description.split(/[.!?]/)[0].slice(0, 100).trim()

   const issue = await backend.createIssue({
     summary,
     description,
     issueType: workType === 'fix' ? 'bug' : 'feature'
   })

   console.log(`Created issue ${issue.id}: ${issue.summary}`)
   issueId = issue.id
   ```

---

## Issue ID Flow

If `issueId` is set:

7. **Fetch the issue**
   - Call `backend.getIssue(issueId)`.
   - If not found, tell the user and stop.

8. **Show current position**
   ```
   ══════════════════════════════════════════
   /feature  [ISSUE-3]  My feature title
   ══════════════════════════════════════════
   ```

---

## Stage: tasks

9. **Check for existing implementation tasks**

   ```js
   const existingTasks = await backend.getTasks({ issueId, tags: ['impl'] })
   ```

   - If tasks already exist: skip to **Stage: implement** (Step 12).
   - If `quickMode`: skip to **Stage: implement** (Step 12), implementing inline without tasks.

10. **Pause — unless YOLO mode**

    ```
    Ready to break this issue into implementation tasks?

    [c]ontinue  [s]kip (implement directly)  [q]uit
    ```
    In YOLO mode, proceed immediately.

11. **Create tasks**

    On **c** (or auto in YOLO):
    - Delegate to the `/createtasks` workflow using the same `issueId`.
    - After tasks are created, fall through to the implement stage.

---

## Stage: implement

12. **Delegate to /implement**

    Delegate entirely to the `/implement` command workflow using the same
    `issueId` (and forwarding `--yolo` if active).

    After each **phase** completes (all its tasks reach `done`):
    - Pause — unless YOLO mode, show:
      ```
      Phase complete. Please run tests and review the code.

      [c]ontinue (approve phase)  [q]uit
      ```
      In YOLO mode, run tests automatically. If tests pass, auto-approve.
      If tests fail, fix and re-run. Only stop on unrecoverable errors.
    - On **c** (or auto in YOLO): call `backend.updateTaskState(phase.id, 'approved')`.
    - Continue with the next phase if one exists.

    When all phases are approved, continue to **Stage: review**.

---

## Stage: review

13. **Pause — unless YOLO mode**

    ```
    Implementation complete. Ready to create a PR and finish the review?

    [c]ontinue  [q]uit
    ```
    In YOLO mode, auto-create the PR and finish.

14. **On c (or auto in YOLO)**:
    - Suggest running `/git` or `gh pr create` to open a pull request.
    - Print:
      ```
      ✓ [ISSUE-3] "My feature title" is complete.
      All stages done. Check your PR and close the issue when merged.
      ```

---

## Error Handling

| Situation | Action |
|-----------|--------|
| Intent unclear | Ask clarifying questions |
| Backend unavailable | Show error, stop — backend state is durable |
| `createTasks` already exist | Skip task creation, go straight to implement |
| Task dependency blocked | Stop and tell user which dependency is unmet |
| User presses `q` | Stop — `/resume <issueId>` or re-run `/feature <issueId>` picks up from backend state |

---

## Example Sessions

### Example 1: Issue ID Input

```
User: /feature PROJ-42

Agent: ══════════════════════════════════════════
       /feature  [PROJ-42]  Add dark mode toggle
       ══════════════════════════════════════════

       Ready to break this issue into implementation tasks?

       [c]ontinue  [s]kip (implement directly)  [q]uit
```

### Example 2: Natural Language Input

```
User: /feature add a dark mode toggle to the settings page

Agent: ━━━ Workflow Plan ━━━
       I'll treat this as: feature

       Steps:
         1. Create issue
         2. Create tasks
         3. Implement
         4. Review

       [s]tart  [c]ustomize  [q]uit

User: s

Agent: Created issue PROJ-42: "Add dark mode toggle to settings page"
       Ready to break this issue into implementation tasks?

       [c]ontinue  [s]kip (implement directly)  [q]uit
```

### Example 3: YOLO Mode

```
User: /feature PROJ-42 --yolo

Agent: ⚡ YOLO mode — skipping all approval gates, executing end-to-end.

       ══════════════════════════════════════════
       /feature  [PROJ-42]  Add dark mode toggle
       ══════════════════════════════════════════

       Creating tasks... [auto]
       Implementing Phase 1... [auto]
       Tests passing ✓ Phase 1 approved [auto]
       Implementing Phase 2... [auto]
       ...
       ✓ [PROJ-42] complete.
```

---

## AIDEV-NOTE: backend-is-the-state design

This command is a thin orchestrator. It does NOT write any local state files.
The backend owns all issue, task, and phase state. When `/feature` is re-run
with the same issueId, it reads backend task states to determine where work
left off and continues from the first non-terminal task automatically.

YOLO mode is a session-scoped flag passed at invocation time (`--yolo`).
It is forwarded to `/implement` and `/createtasks` but is never persisted locally.

The new pipeline is: **issue → tasks → implement → review**.
There is no spec stage. Task descriptions in the backend serve as the spec.

## AIDEV-NOTE: natural language input

When NL input is detected, the intent router (`lib/intent-router.js`) analyses
the description and detects the workflow type (feature, fix, review, quick).
Only `detectIntent()` is used — the removed `getWorkflowRecommendation()` function
is no longer called. Workflow steps are listed inline above.
