---
description: Guided workflow - describe what you want in natural language, and I'll orchestrate the right commands with smart checkpoints
agent: spec-mode
mode: plan
---

# /workflow — Intelligent Workflow Guide

Takes natural language input and guides you through the appropriate workflow with
smart skip suggestions and checkpoint summaries. This is the recommended entry
point for all work items.

## Input

- `$ARGUMENTS`: Natural language description of what you want to accomplish
  - Example: `/workflow Add OAuth login with Google and GitHub`
  - Example: `/workflow Review and optimize the API response times`
  - Example: `/workflow Fix the bug where users can't reset passwords`
  - Optional flags:
    - `--yolo`: Skip all approval gates, execute end-to-end
    - `--quick`: Use minimal workflow (skip spec if possible)
    - `--backend=<type>`: Override configured backend

---

## Bootstrap

1. **Parse input and detect intent**

   ```js
   const { detectIntent, getWorkflowRecommendation } = require('./lib/intent-router.js')
   const { parseBackendOverride } = require('./lib/backend-loader.js')

   const { backendType, cleanedArguments } = parseBackendOverride($ARGUMENTS)
   const tokens = cleanedArguments.trim().split(/\s+/).filter(Boolean)

   // Extract flags
   const yoloMode = tokens.some(t => t === '--yolo')
   const quickMode = tokens.some(t => t === '--quick')

   // Get the natural language description
   const description = tokens.filter(t => !t.startsWith('--')).join(' ')

   // Detect intent
   const intent = detectIntent(description)
   const recommendation = getWorkflowRecommendation(intent)
   ```

2. **If no description provided**, ask for one:
   ```
   What would you like to accomplish?

   Examples:
   • "Add a login feature with OAuth"
   • "Fix the broken payment flow"
   • "Review and optimize database queries"
   • "Plan the Q3 roadmap"
   ```

3. **Load the backend**
   ```js
   const { getBackend } = require('./lib/backend-loader.js')
   const backend = getBackend(backendType)
   ```
   If initialization fails, show the error and stop.

---

## Intent Confirmation

4. **Show detected intent and workflow plan**

   Based on `intent.confidence`:

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
   [4] Quick change (just implement)

   Which workflow fits your needs? [1-4]
   ```

   **Low confidence (<0.5):**
   ```
   I need a bit more context to set up the right workflow.

   Could you tell me:
   • Is this a new feature, bug fix, or improvement?
   • Roughly how big is this change?
   • Are there any existing issues or specs?
   ```

---

## Workflow Execution

5. **On [s]tart: Create issue and begin workflow**

   ```js
   // Create issue in backend
   const issue = await backend.createIssue({
     summary: extractSummary(description),  // First sentence or first 100 chars
     description: description,
     issueType: intent.type === 'fix' ? 'bug' : 'feature'
   })

   console.log(`Created issue ${issue.id}: ${issue.summary}`)
   ```

6. **Delegate to /feature orchestrator**

   ```js
   const wf = require('./lib/workflow-state.js')

   // Create work item with detected type
   const item = wf.createWorkItem({
     issueId: issue.id,
     type: intent.type,
     title: issue.summary,
     yolo: yoloMode,
     skipSuggestions: true,  // Enable smart skip prompts
   })

   // Fall through to /feature workflow
   // (continue with /feature steps from spec stage)
   ```

---

## Enhanced Checkpoints (Smart Skip)

At each pause point in the /feature workflow, this command adds smart skip
suggestions using `lib/intent-router.js`.

### Before Requirements Review

```js
const { shouldSkipStep, generateCheckpointSummary, formatCheckpointPrompt } =
  require('./lib/intent-router.js')

// Estimate change size from spec content
const context = {
  estimatedLOC: estimateLOCFromSpec(spec),
  fileCount: estimateFilesFromSpec(spec),
  type: item.type
}

const skipSuggestion = shouldSkipStep('requirements-review', context)
const summary = generateCheckpointSummary('spec', {
  requirementsCount: countRequirements(spec),
  estimatedLOC: context.estimatedLOC,
  fileCount: context.fileCount
})

console.log(summary)
console.log('')
console.log(formatCheckpointPrompt('requirements-review', {
  skipSuggested: skipSuggestion.suggest,
  skipReason: skipSuggestion.reason
}))
```

Output example:
```
━━━ Spec Summary ━━━
• 3 requirements defined
• Estimated: ~45 LOC across 2 files

⚡ Suggestion: Skip this step? Small change (~45 LOC, 2 files)

[c]ontinue to Design  [s]kip  [m]odify  [d]etails  [q]uit
```

### Before Design Review

Similar pattern with `shouldSkipStep('design-review', context)`.

For small changes, suggest:
```
⚡ Suggestion: Skip design review? (~30 LOC, straightforward implementation)
```

### Before Task Creation

Show task preview:
```
━━━ Task Breakdown Preview ━━━
Based on the spec, I'll create:

Phase 1: Setup
  • Task 1.1: Add OAuth dependencies
  • Task 1.2: Create auth configuration

Phase 2: Implementation
  • Task 2.1: Implement Google OAuth flow
  • Task 2.2: Implement GitHub OAuth flow
  • Task 2.3: Add user session handling

Phase 3: Testing
  • Task 3.1: Add OAuth integration tests

[c]ontinue  [m]odify breakdown  [d]etails  [q]uit
```

### Before Each Phase

```
━━━ Phase 2: Implementation ━━━
• 3 tasks ready
• Estimated: ~80 LOC

Dependencies satisfied:
  ✓ Task 1.1: Add OAuth dependencies
  ✓ Task 1.2: Create auth configuration

[c]ontinue  [d]etails  [q]uit
```

---

## Modify Mode

7. **On [m]odify at any checkpoint:**

   ```
   What would you like to change?

   [1] Edit the description/requirements
   [2] Change the scope (add/remove items)
   [3] Change the workflow (skip/add steps)
   [4] Start over with different approach

   Or type your modification directly.
   ```

   Apply changes and return to the same checkpoint.

---

## Quick Mode (--quick)

When `--quick` flag is passed or workflow is 'quick':

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

---

## YOLO Mode (--yolo)

When `--yolo` flag is passed:

1. Auto-approve all checkpoints
2. Auto-accept all skip suggestions for small changes
3. Fix test failures automatically
4. Only stop on unrecoverable errors

Print at start:
```
⚡ YOLO mode enabled — executing end-to-end without approval gates.
   Will stop only on errors that require human decision.
```

---

## Error Handling

| Situation | Action |
|-----------|--------|
| Intent unclear | Ask clarifying questions |
| Backend unavailable | Show error, suggest checking config |
| Issue creation fails | Show error, offer to retry or use local-only |
| User types unknown option | Show available options |

---

## Example Sessions

### Example 1: Feature Request

```
User: /workflow add a dark mode toggle to the settings page

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

### Example 2: Small Fix

```
User: /workflow fix the typo in the login button

Agent: ━━━ Workflow Plan ━━━
       I'll treat this as: quick

       Quick change - skip spec and task breakdown

       Steps:
         1. Implement
         2. Review

       ⚡ This is a trivial change. I'll go straight to implementation.

       [s]tart  [f]ull workflow instead  [q]uit

User: s

Agent: Quick mode: Implementing fix...

       Found the typo in src/components/LoginButton.tsx:23
       Changing "Sing In" → "Sign In"

       [a]pply  [r]eview diff  [q]uit
```

### Example 3: Ambiguous Request

```
User: /workflow make the app better

Agent: I need a bit more context to set up the right workflow.

       "Make the app better" could mean many things:
       • Performance optimization
       • UI/UX improvements
       • Code quality/refactoring
       • Bug fixes
       • New features

       Could you be more specific about what you'd like to improve?

User: optimize the database queries, they're slow

Agent: ━━━ Workflow Plan ━━━
       I'll treat this as: review

       Code review workflow - analyze first, then create optimization tasks

       Steps:
         1. Create issue
         2. Analyze current queries
         3. Identify optimization opportunities
         4. Create tasks
         5. Implement optimizations
         6. Review & benchmark

       [s]tart  [c]ustomize  [q]uit
```

---

## AIDEV-NOTE: Design Philosophy

This command is the user-friendly front door to OpenCode workflows. Key principles:

1. **Natural language first** — Users describe what they want, not which command to run
2. **Smart defaults** — Auto-detect intent and suggest appropriate workflow
3. **Escape hatches** — Always offer [c]ustomize and [m]odify options
4. **Progressive disclosure** — Show summary first, details on request
5. **Skip when sensible** — Don't force heavy process on trivial changes
6. **Preserve agency** — User approves at meaningful checkpoints, not every micro-step

The intent router in `lib/intent-router.js` is deliberately conservative to avoid
misrouting. When confidence is low, it asks rather than guesses.

## AIDEV-NOTE: Integration with /feature

This command wraps /feature but adds:
- Intent detection layer
- Enhanced checkpoint summaries
- Smart skip suggestions
- Modify mode at each checkpoint

Once the workflow starts, it delegates to /feature's stage machine but intercepts
pause points to add the enhanced UX.
