---
description: Guide an issue through its full lifecycle — spec → tasks → implement → review — with natural language input and cross-session persistence
agent: spec-mode
mode: plan
---

# /feature — Full lifecycle orchestrator

Drive an issue from idea to merged code in a single resumable workflow.
State is persisted in `.agent/state/feature-progress.json` so work can span multiple
sessions.

Accepts either an issue ID or natural language description of what you want to build.

## Input

- `$ARGUMENTS`: issue ID or natural language description
  - Issue ID: `ISSUE-3`, `IN-1234 --type=fix`, `MOCK-1 --backend=mock`
  - Natural language: `Add OAuth login with Google and GitHub`
  - Optional flags:
    - `--type=fix`: Treat as bug fix (streamlined workflow)
    - `--backend=<type>`: Override configured backend
    - `--yolo`: Skip all approval gates, execute end-to-end
    - `--quick`: Skip spec phase for small changes

---

## Bootstrap

1. **Parse arguments**

   ```js
   const { parseBackendOverride } = require('./lib/backend-loader.js')
   const { detectIntent, getWorkflowRecommendation } = require('./lib/intent-router.js')
   const wf = require('./lib/workflow-state.js')

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
     // Treat entire non-flag input as natural language description
     description = nonFlagTokens.join(' ')
   }
   ```

3. **Load the backend**
   ```js
   const { getBackend } = require('./lib/backend-loader.js')
   const backend = getBackend(backendType)
   ```
   If initialization fails, show the error and stop.

---

## Natural Language Input Flow

If `description` is set (no issue ID provided):

4. **Detect intent and confirm**

   ```js
   const intent = detectIntent(description)
   const recommendation = getWorkflowRecommendation(intent)

   // Override workType if intent suggests different type
   if (intent.type && intent.type !== 'feature') {
     workType = intent.type
   }
   ```

   **High confidence (≥0.8):**
   ```
   ━━━ Workflow Plan ━━━
   I'll treat this as: {intent.type}

   {recommendation.suggestion}

   Steps:
   {recommendation.steps.map((s, i) => `  ${i+1}. ${s}`).join('\n')}

   {if quickMode or recommendation.canSkip.length > 0}
   ⚡ I can skip: {recommendation.canSkip.join(', ')}
   {/if}

   [s]tart  [c]ustomize  [q]uit
   ```

   **Medium confidence (0.5-0.8):**
   ```
   I'm not entirely sure what workflow fits best.

   This sounds like it could be:
   [1] New feature (full spec → tasks → implement)
   [2] Bug fix (quick spec → implement)
   [3] Code review (analyze → optimize)
   [4] Research first (investigate options → then spec)
   [5] Quick change (just implement)

   Which workflow fits your needs? [1-5]
   ```

   **Low confidence (<0.5):**
   ```
   I need a bit more context to set up the right workflow.

   Could you tell me:
   • Is this a new feature, bug fix, or improvement?
   • Roughly how big is this change?
   • Are there any existing issues or specs?
   ```

5. **On [s]tart: Create issue and continue**

   ```js
   // Extract summary (first sentence or first 100 chars)
   const summary = extractSummary(description)

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

6. **Fetch the issue**
   - Call `backend.getIssue(issueId)`.
   - If not found, tell the user and stop.
   - Store `issue.summary` as `title`.

7. **Resolve or create the work item**
   ```js
   let item = wf.getActiveItem(issueId)

   if (!item) {
     item = wf.createWorkItem({ issueId, type: workType, title, yolo: yoloMode, quick: quickMode })
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
   - If `quickMode` is active, print:
     ```
     ⚡ Quick mode — skipping spec phase, going straight to implementation.
     ```

8. **Show current position**
   ```
   ══════════════════════════════════════════
   /feature  [ISSUE-3]  My feature title
   Stage: spec › requirements-review
   ══════════════════════════════════════════
   ```

---

## Quick Mode (--quick)

When `--quick` flag is passed or workflow type is 'quick':

1. Skip issue creation if work is truly trivial
2. Skip spec phase entirely
3. Go straight to implementation with inline planning:
   ```
   Quick mode: Skipping formal spec.

   I'll implement: {description}

   Before I start, quick check:
   • Files I expect to change: {predicted files}
   • Estimated LOC: ~{estimate}

   [g]o  [a]dd more context  [q]uit
   ```
4. Jump directly to `implement` stage

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

- **If `item.yolo` is false (normal mode):** show:

```
[c]ontinue  [s]kip  [m]odify  [a]uto-run  [q]uit
```

- **c** — execute the current step, then pause again at the next pause point
- **s** — skip the current step; prompt for an optional reason, record it with
  `wf.recordSkip(issueId, stepName, reason)`, then continue to the next pause
  point
- **m** — modify the current work (edit spec, change requirements, etc.)
- **a** — execute all steps until the next **major stage boundary**
  (spec → tasks, tasks → implement, phase N end → phase N+1 start)
- **q** — save state (`wf.updateWorkItem` is already called after each step)
  and stop; tell the user `/resume <issueId>` picks up where they left off

---

## Enhanced Checkpoints (Smart Skip)

At each pause point, add smart skip suggestions using `lib/intent-router.js`.

```js
const { shouldSkipStep, generateCheckpointSummary, formatCheckpointPrompt } =
  require('./lib/intent-router.js')

// Estimate change size from spec content
const context = {
  estimatedLOC: estimateLOCFromSpec(spec),
  fileCount: estimateFilesFromSpec(spec),
  type: item.type
}

const skipSuggestion = shouldSkipStep(currentStep, context)
const summary = generateCheckpointSummary(currentStage, {
  requirementsCount: countRequirements(spec),
  estimatedLOC: context.estimatedLOC,
  fileCount: context.fileCount
})

console.log(summary)
console.log('')
console.log(formatCheckpointPrompt(currentStep, {
  skipSuggested: skipSuggestion.suggest,
  skipReason: skipSuggestion.reason
}))
```

Example output:
```
━━━ Spec Summary ━━━
• 3 requirements defined
• Estimated: ~45 LOC across 2 files

⚡ Suggestion: Skip this step? Small change (~45 LOC, 2 files)

[c]ontinue to Design  [s]kip  [m]odify  [d]etails  [q]uit
```

---

## Stage: research (optional)

**Entry condition:** `item.stage === 'research'` (only entered when intent.type === 'research')

Switch the active agent to **research-agent** for this stage.

This stage produces a decision-grade research artifact before committing to a spec.
Use it when the work involves technical decisions, vendor evaluation, architectural
choices, or any situation where options need investigation.

### research / pending

1. Pause — unless YOLO mode, show:
   ```
   Starting research phase for ${issueId}

   I'll investigate:
   • Available options and approaches
   • Trade-offs and constraints
   • Risks and unknowns

   [c]ontinue  [s]kip to spec  [q]uit
   ```
   In YOLO mode, proceed immediately.

2. On **c** (or auto in YOLO): invoke the research-agent workflow:
   - Clarify the decision being supported
   - Decompose into research questions
   - Produce a structured research note:

   ```markdown
   # Research Note: {topic}

   ## Context
   {background and why this decision matters}

   ## Decision to Support
   {what decision will this research enable}

   ## Key Questions
   - {question 1}
   - {question 2}

   ## Verified Facts
   {with sources or explicit uncertainty markers}

   ## Constraints & Non-Negotiables
   {hard requirements that constrain options}

   ## Option Space
   | Option | Pros | Cons | Risk |
   |--------|------|------|------|
   | ... | ... | ... | ... |

   ## Risks & Unknowns
   {what we still don't know}

   ## Recommendation
   {if evidence supports one, otherwise "Needs more investigation"}

   ## Follow-Up Research Tasks
   - {if any gaps remain}
   ```

3. Save research note to `specs/{issueId}-research.md`
4. Advance: `wf.advanceSubstage(issueId)` → `decision`.

### research / decision

1. Pause — show:
   ```
   Research complete. Please review the findings above.

   [c]ontinue to Spec (with recommendation)
   [r]evise research
   [s]kip to spec (ignore research)
   [q]uit
   ```

2. On **c**: proceed to spec stage with research context loaded.
3. Advance:
   ```js
   wf.updateStage(issueId, 'spec', 'drafting')
   ```

---

## Stage: spec

**Entry condition:** `item.stage === 'spec'` (skipped in quick mode)

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

   [c]ontinue to Design  [s]kip  [m]odify  [r]ewrite (polish)  [a]uto-run  [q]uit
   ```
   In YOLO mode, auto-approve requirements and proceed immediately.
2. On **r** (rewrite): invoke the **rewrite-agent** to polish the requirements:
   - Preserve meaning and technical accuracy
   - Improve clarity, structure, and readability
   - Fix grammar without changing intent
   - After rewrite, return to this review stage
3. On **c/a** (or auto in YOLO): write the Design section of the spec.
4. Advance: `wf.advanceSubstage(issueId)` → `design-review`.

### spec / design-review

1. Pause — unless YOLO mode, show:
   ```
   Please review the design above.
   Is it accurate and complete?

   [c]ontinue to approval  [s]kip  [m]odify  [r]ewrite (polish)  [a]uto-run  [q]uit
   ```
   In YOLO mode, auto-approve design and proceed immediately.
2. On **r** (rewrite): invoke the **rewrite-agent** to polish the design section:
   - Preserve technical decisions and architecture
   - Improve clarity and readability
   - Structure for easy scanning
   - After rewrite, return to this review stage
3. On **c/a** (or auto in YOLO):
   - Update spec frontmatter: `work_state: approved`, `approvedAt: <ISO8601>`.
   - Call `backend.approveSpec(spec.id)`.
4. Advance: `wf.advanceSubstage(issueId)` → `approved`.

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

   [c]ontinue (approve phase)  [s]kip  [m]odify  [a]uto-run  [q]uit
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

   [c]ontinue  [s]kip  [m]odify  [a]uto-run  [q]uit
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
| Intent unclear | Ask clarifying questions |
| Backend unavailable | Show error, stop — state is already saved |
| `approveSpec` fails | Warn user, keep item at `design-review` |
| `createTasks` already exist | Skip task creation, advance to `created` |
| Task dependency blocked | Stop and tell user which dependency is unmet |
| User presses `q` | Save state, print `/resume <issueId>` hint |

---

## Example Sessions

### Example 1: Issue ID Input

```
User: /feature PROJ-42

Agent: ══════════════════════════════════════════
       /feature  [PROJ-42]  Add dark mode toggle
       Stage: spec › drafting
       ══════════════════════════════════════════

       Ready to draft the spec for PROJ-42?

       [c]ontinue  [s]kip  [m]odify  [a]uto-run  [q]uit
```

### Example 2: Natural Language Input

```
User: /feature add a dark mode toggle to the settings page

Agent: ━━━ Workflow Plan ━━━
       I'll treat this as: feature

       Full feature workflow with spec and task breakdown

       Steps:
         1. Create issue
         2. Spec (requirements)
         3. Spec (design)
         4. Task breakdown
         5. Implementation
         6. Review

       [s]tart  [c]ustomize  [q]uit

User: s

Agent: Created issue PROJ-42: "Add dark mode toggle to settings page"
       Starting spec phase...

       [Drafts requirements]

       ━━━ Spec Summary ━━━
       • 4 requirements defined
       • Estimated: ~120 LOC across 5 files

       [c]ontinue to Design  [s]kip  [m]odify  [d]etails  [q]uit
```

### Example 3: Quick Mode

```
User: /feature fix the typo in the login button --quick

Agent: ⚡ Quick mode — skipping spec phase.

       Quick mode: Skipping formal spec.

       I'll implement: fix the typo in the login button

       Before I start, quick check:
       • Files I expect to change: src/components/LoginButton.tsx
       • Estimated LOC: ~5

       [g]o  [a]dd more context  [q]uit

User: g

Agent: Found the typo in src/components/LoginButton.tsx:23
       Changing "Sing In" → "Sign In"

       [a]pply  [r]eview diff  [q]uit
```

---

## AIDEV-NOTE: agent-switching design

This command acts as a thin orchestrator. It does NOT implement spec writing,
task decomposition, or coding itself — it delegates to the appropriate agent
at each stage boundary:

- `research-agent` → decision-grade research (optional, before spec)
- `spec-mode`      → requirements & design authoring
- `rewrite-agent`  → polish specs during review (on-demand via [r]ewrite)
- `create-tasks`   → task breakdown
- `build`          → implementation loop

The spec file is the durable context shared between all agents. Feature progress state
in `feature-progress.json` only tracks position (stage/substage/phase) and skip records.
It never duplicates content that the backend already owns.

State is written after **every** substage transition so a quit at any point
results in a clean resume point.

## AIDEV-NOTE: yolo mode design

The `--yolo` flag sets `item.yolo = true` on the work item in `feature-progress.json`.
This persists across sessions so `/resume` inherits it automatically. In YOLO
mode, all pause points auto-continue — the AI executes the entire lifecycle
(spec → tasks → implement → review) without stopping for human approval.
Tests are still run; failures are fixed rather than reported. The only hard
stop is an unrecoverable error (backend unavailable, etc.).

## AIDEV-NOTE: natural language input

This command now accepts natural language descriptions as an alternative to issue IDs.
When NL input is detected, the intent router (`lib/intent-router.js`) analyzes the
description, detects the workflow type (feature, fix, review, quick), and shows a
confirmation before creating the issue. This provides a user-friendly entry point
without requiring users to pre-create issues in the backend.

The `--quick` flag enables a streamlined workflow that skips the spec phase entirely,
useful for trivial changes like typo fixes or simple renames.
