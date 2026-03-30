---
issueId: opencode-2rk
createdAt: 2026-03-30
work_state: approved
approvedAt: 2026-03-30T16:40:00Z
---

# Intelligent Workflow Guide

## Requirements

### Introduction

Enable users to describe work in natural language and have OpenCode automatically detect intent, suggest the appropriate workflow, and guide them through it with smart checkpoints and skip suggestions.

### Rationale

Currently, users must know which slash command to invoke (`/issue`, `/spec`, `/createtasks`, `/implement`) and manually orchestrate each step. This creates friction and requires users to understand the workflow system before they can use it effectively.

The intelligent workflow guide reduces this friction by:
- Auto-detecting intent from natural language ("add a login feature" → feature workflow)
- Guiding users through the workflow with summaries at each checkpoint
- Suggesting skipping steps when they don't add value (e.g., design review for a 20 LOC fix)
- Preserving user agency with approve/modify/skip options at meaningful checkpoints

### Out of scope

- Fully autonomous execution without any checkpoints (use `--yolo` flag for that)
- Integration with external AI services for intent detection (uses local pattern matching)
- Multi-language support (English only for patterns)

### Stories

#### 1. Natural language intent detection

**Story:** AS a developer, I WANT to describe what I want to accomplish in natural language, SO THAT I don't have to remember specific slash commands.

- **1.1. Feature detection**
  - _WHEN_ user says "add X", "create X", "implement X", or similar
  - _THEN_ the system _SHALL_ detect feature intent with ≥80% confidence

- **1.2. Fix detection**
  - _WHEN_ user says "fix X", "resolve bug", "debug X", or similar
  - _THEN_ the system _SHALL_ detect fix intent with ≥80% confidence

- **1.3. Review detection**
  - _WHEN_ user says "optimize X", "refactor X", "review code", or similar
  - _THEN_ the system _SHALL_ detect review intent with ≥80% confidence

- **1.4. Confidence-based routing**
  - _WHEN_ confidence is high (≥0.8), _THEN_ show plan and offer to start
  - _WHEN_ confidence is medium (0.5-0.8), _THEN_ show options for user to choose
  - _WHEN_ confidence is low (<0.5), _THEN_ ask clarifying questions

#### 2. Smart skip suggestions

**Story:** AS a developer, I WANT the workflow to suggest skipping unnecessary steps, SO THAT I don't waste time on ceremony for trivial changes.

- **2.1. Design review skip**
  - _WHEN_ estimated change is <50 LOC and affects ≤2 files
  - _THEN_ the system _SHALL_ suggest skipping design review

- **2.2. Spec skip for quick changes**
  - _WHEN_ change type is "quick" (rename, trivial fix)
  - _THEN_ the system _SHALL_ suggest skipping formal spec

- **2.3. User override**
  - _WHEN_ skip is suggested
  - _THEN_ the user _SHALL_ still have option to perform the step

#### 3. Checkpoint summaries

**Story:** AS a developer, I WANT concise summaries at each checkpoint, SO THAT I can make informed decisions without reading full documents.

- **3.1. Spec summary**
  - _WHEN_ spec phase completes
  - _THEN_ show: requirement count, estimated LOC, file count

- **3.2. Task summary**
  - _WHEN_ task breakdown completes
  - _THEN_ show: phase count, task count, phase names with task counts

- **3.3. Implementation summary**
  - _WHEN_ phase completes
  - _THEN_ show: tasks completed, files changed, test status

---

## Design

### Overview

The implementation consists of three new components:
1. `lib/intent-router.js` - Intent detection and skip suggestion logic
2. `command/workflow.md` - New `/workflow` command as guided entrypoint
3. `agent/workflow-guide.md` - Agent that intercepts natural language requests

### Files

| Action | Path | Description |
|--------|------|-------------|
| Create | `lib/intent-router.js` | Intent detection, skip suggestions, summaries |
| Create | `command/workflow.md` | Guided workflow command |
| Create | `agent/workflow-guide.md` | Agent for natural language detection |

### Component graph

```mermaid
graph TD
    A[User Input]:::external --> B[workflow-guide agent]:::new
    B --> C[intent-router.js]:::new
    C --> D{Confidence?}
    D -->|High| E[/workflow command]:::new
    D -->|Medium| F[Show Options]
    D -->|Low| G[Ask Questions]
    E --> H[/feature orchestrator]:::existing
    H --> I[spec-mode agent]:::existing
    H --> J[build agent]:::existing
    
    classDef new fill:#e6ffed,stroke:#34d058,color:#000;
    classDef existing fill:#fff5b1,stroke:#d4b106,color:#000;
    classDef external fill:#f0f0f0,stroke:#999,color:#000;
```

### Data models

#### Intent detection result

```typescript
interface IntentResult {
  command: string | null      // e.g., '/feature', '/plan'
  type: string | null         // e.g., 'feature', 'fix', 'review', 'quick'
  confidence: number          // 0.0 to 1.0
  reason: string              // Human-readable explanation
  matchedPattern?: string     // For debugging
}
```

#### Skip suggestion

```typescript
interface SkipSuggestion {
  suggest: boolean
  reason: string
  confidence: number
}
```

#### Workflow recommendation

```typescript
interface WorkflowRecommendation {
  workflow: string            // 'full', 'fix', 'review', 'quick', 'plan'
  steps: string[]             // Ordered list of steps
  suggestion: string          // Human-readable description
  canSkip: string[]           // Steps that can be skipped
}
```

### Intent patterns

| Intent Type | Example Patterns | Base Confidence |
|-------------|------------------|-----------------|
| feature | "add X", "create X", "implement X", "build X" | 0.85 |
| fix | "fix X", "resolve bug", "debug X", "repair X" | 0.85 |
| review | "optimize X", "refactor X", "review code", "clean up" | 0.80 |
| plan | "plan X", "brainstorm", "roadmap", "strategy" | 0.75 |
| quick | "just X", "quickly X", "rename X", "small change" | 0.70 |

### Skip thresholds (conservative)

| Step | Max LOC | Max Files | Notes |
|------|---------|-----------|-------|
| design-review | 50 | 2 | Only suggest for truly small changes |
| requirements-review | 30 | 1 | Only for trivial changes |
| spec | 20 | 1 | Only for quick tasks |

### Error handling

| Error | Response |
|-------|----------|
| Intent unclear | Ask clarifying questions |
| Backend unavailable | Show error, suggest checking config |
| No pattern match | Fall back to asking what type of work |

---

## Testing strategy

**Test files:**

```typescript
// test/lib/intent-router.test.js
describe('detectIntent', () => {
  test('detects feature intent from "add a login feature"')
  test('detects fix intent from "fix the password reset bug"')
  test('detects review intent from "optimize the database queries"')
  test('detects quick intent from "just rename the function"')
  test('returns explicit command for "/spec PROJ-123"')
  test('returns low confidence for ambiguous input')
})

describe('shouldSkipStep', () => {
  test('suggests skip for small changes under threshold')
  test('does not suggest skip for large changes')
  test('suggests skip for quick task type')
})

describe('generateCheckpointSummary', () => {
  test('generates spec summary with counts')
  test('generates task summary with phases')
})
```

**Running tests:**

```bash
yarn test test/lib/intent-router.test.js
```
