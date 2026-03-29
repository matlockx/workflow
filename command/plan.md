---
description: Brainstorm, prioritize, and bulk-create a backlog of issues from a topic or problem statement
agent: plan-mode
mode: plan
---

# /plan — Planning orchestrator

Turn a vague topic or problem statement into a prioritized backlog of issues
in a single guided session. State is persisted between phases so you can
pause and resume.

## Input

- `$ARGUMENTS`: A topic, goal, or problem statement — free text.
  - Examples: `/plan "improve onboarding experience"`, `/plan auth overhaul`
  - Optional flags: `--resume=<plan-id>` to continue an existing plan
  - Optional flags: `--backend=<type>` to override the configured backend

---

## Bootstrap

```js
const { parseBackendOverride } = require('./lib/backend-loader.js')
const ps = require('./lib/plan-state.js')

const { backendType, cleanedArguments } = parseBackendOverride($ARGUMENTS)
const tokens = cleanedArguments.trim().split(/\s+/)

// Check for --resume flag
const resumeFlag = tokens.find(t => t.startsWith('--resume='))
const planId = resumeFlag ? resumeFlag.replace('--resume=', '') : null

// Everything that's not a flag is the topic
const topic = tokens.filter(t => !t.startsWith('--')).join(' ').replace(/^["']|["']$/g, '')
```

**If `--resume` is provided:**
- Load the plan with `ps.getPlan(planId)`.
- If not found, stop and show: `Plan ${planId} not found. Run /plan <topic> to start a new one.`
- Jump to the phase matching `plan.stage` (see phase map below).

**If starting fresh:**
- If no `topic` is provided, show usage and stop:
  ```
  Usage: /plan <topic> [--backend=<type>]
  Example: /plan "improve onboarding experience"
  ```
- Load the backend:
  ```js
  const { getBackend } = require('./lib/backend-loader.js')
  const backend = getBackend(backendType)
  ```
  If initialization fails, show the error and stop.
- Create a new plan:
  ```js
  const plan = ps.createPlan({ title: topic })
  ```
- Show:
  ```
  ══════════════════════════════════════════
  /plan  [${plan.id}]  ${plan.title}
  Phase: discovery
  ══════════════════════════════════════════
  ```

---

## Phase map

| `plan.stage`  | Jump to section          |
|---------------|--------------------------|
| `discovery`   | § Phase: discovery       |
| `brainstorm`  | § Phase: brainstorm      |
| `prioritize`  | § Phase: prioritize      |
| `review`      | § Phase: review          |
| `bulk-create` | § Phase: bulk-create     |
| `done`        | Report complete and stop |

---

## Interaction protocol

At every pause point show:

```
[c]ontinue  [e]dit  [s]kip  [q]uit
```

- **c** — proceed to the next step
- **e** — let the user edit proposals / order before continuing
- **s** — skip this phase; record a note; advance to the next phase
- **q** — save state and stop; tell user `/plan --resume=<plan-id>` to continue

---

## Phase: discovery

**Entry condition:** `plan.stage === 'discovery'`

Switch the active agent to **plan-mode** for this session.

1. Hand the raw `topic` (and any existing `plan.context`) to the plan-mode
   agent, asking it to run its discovery protocol (3–5 clarifying questions).
2. After the user answers, the agent produces a short summary.
3. Persist the Q&A pairs:
   ```js
   for (const { question, answer } of clarifications) {
     ps.addClarification(plan.id, question, answer)
   }
   ps.updatePlan(plan.id, { context: summaryText })
   ```
4. **Pause** — show the summary and ask:
   ```
   Does this capture the scope correctly?

   [c]ontinue to Brainstorm  [e]dit  [s]kip  [q]uit
   ```
5. On **c/e/s**: advance:
   ```js
   ps.advancePlanStage(plan.id) // discovery → brainstorm
   ```

---

## Phase: brainstorm

**Entry condition:** `plan.stage === 'brainstorm'`

1. Instruct the plan-mode agent to generate proposals, passing:
   - `plan.context` (the discovery summary)
   - `plan.clarifications` (the Q&A pairs)
2. The agent presents 5–10 proposals using its brainstorm format.
3. Allow the user to request additions, removals, or merges (**e**).
4. Once the user is satisfied, persist:
   ```js
   ps.setProposals(plan.id, proposals)
   ```
5. **Pause:**
   ```
   ${proposals.length} proposals recorded.

   [c]ontinue to Prioritize  [e]dit proposals  [s]kip  [q]uit
   ```
6. On **c/e/s**: advance:
   ```js
   ps.advancePlanStage(plan.id) // brainstorm → prioritize
   ```

---

## Phase: prioritize

**Entry condition:** `plan.stage === 'prioritize'`

1. Instruct the plan-mode agent to present the proposals in recommended
   priority order and facilitate reordering.
2. Apply any ordering changes the user requests.
3. Persist the final order:
   ```js
   ps.setPrioritizedOrder(plan.id, orderedProposalIds)
   ```
4. **Pause:**
   ```
   Order confirmed (${orderedIds.length} items).

   [c]ontinue to Review  [e]dit order  [s]kip  [q]uit
   ```
5. On **c/e/s**: advance:
   ```js
   ps.advancePlanStage(plan.id) // prioritize → review
   ```

---

## Phase: review

**Entry condition:** `plan.stage === 'review'`

1. Build the final `backlog` array from the prioritized proposals:
   - Preserve all proposal fields.
   - `type`: infer from proposal content (`bug`, `task`, or default `feature`).
   - `labels`: derive from any thematic groupings the agent identified.
2. Instruct the plan-mode agent to render the backlog table and ask for
   sign-off.
3. Allow edits (**e**) — title tweaks, type/priority corrections, etc.
4. Once confirmed, persist:
   ```js
   ps.setBacklog(plan.id, backlog)
   ```
5. Export the backlog as markdown:
   ```js
   const fs = require('fs')
   const path = require('path')
   const markdown = ps.renderBacklogMarkdown(plan)
   const outDir = path.join(process.cwd(), 'plans')
   fs.mkdirSync(outDir, { recursive: true })
   const outPath = path.join(outDir, `${plan.id}-backlog.md`)
   fs.writeFileSync(outPath, markdown, 'utf8')
   ps.setBacklogFilePath(plan.id, outPath)
   ```
6. Report: `Backlog exported to plans/${plan.id}-backlog.md`
7. **Pause:**
   ```
   Backlog finalized (${backlog.length} items).
   Create these as issues in the backend now?

   [c]ontinue to Create Issues  [e]dit  [s]kip  [q]uit
   ```
8. On **c/e/s**: advance:
   ```js
   ps.advancePlanStage(plan.id) // review → bulk-create
   ```

---

## Phase: bulk-create

**Entry condition:** `plan.stage === 'bulk-create'`

Create each backlog item as an issue in the backend, in priority order.

```js
const plan = ps.getPlan(plan.id)
const backend = getBackend(backendType)

for (const item of plan.backlog) {
  // Skip items already created (idempotent resume)
  if (plan.createdIssues.find(ci => ci.backlogId === item.id)) continue

  try {
    const issue = await backend.createIssue({
      summary: item.title,
      description: item.description,
      issueType: item.type || 'feature'
    })
    ps.recordCreatedIssue(plan.id, item.id, issue.id, issue.summary)
    console.log(`  Created ${issue.id}: ${issue.summary}`)
  } catch (err) {
    console.warn(`  Failed to create "${item.title}": ${err.message}`)
    // Continue with remaining items; user can re-run to retry
  }
}
```

After the loop:
- Reload the plan and report:
  ```
  Created ${plan.createdIssues.length} / ${plan.backlog.length} issues.
  ```
- If any failed, list them and suggest re-running `/plan --resume=${plan.id}`.
- Advance to done:
  ```js
  ps.advancePlanStage(plan.id) // bulk-create → done
  ```

---

## Phase: done

Report completion and print a summary:

```
══════════════════════════════════════════
/plan complete  [${plan.id}]  ${plan.title}
══════════════════════════════════════════

  ${plan.createdIssues.length} issues created
  Backlog: plans/${plan.id}-backlog.md

  Use /feature <issueId> to start work on any issue.
```

---

## Error handling

| Situation | Action |
|-----------|--------|
| Backend unavailable | Warn; skip bulk-create; backlog is already saved |
| `createIssue` fails for one item | Log warning, continue with others |
| Plan file missing on `--resume` | Stop and show clear error |
| No topic provided | Show usage and stop |

---

## AIDEV-NOTE: plan command is a thin orchestrator

This command manages lifecycle state via `lib/plan-state.js` and delegates
all thinking (questioning, brainstorming, prioritizing) to the `plan-mode`
agent. The command never writes proposals directly — it only reads what the
agent produces and persists it.

The `plans/<plan-id>-backlog.md` file is intended to be committed to git
as a human-readable record of planning decisions. The `.agent/state/plans/`
JSON files are gitignored runtime state.
