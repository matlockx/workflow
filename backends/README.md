# Workflow Backends

This directory contains pluggable workflow backend implementations for OpenCode.

---

## What is a Backend?

A **backend** is a pluggable workflow engine that manages:
- **Issues** (user stories, bugs, epics)
- **Specs** (technical specifications)
- **Tasks** (granular implementation work)
- **State** (workflow state machines)

Backends allow OpenCode to work with different issue trackers and task management systems.

---

## Available Backends

### Production Backends

- **`jira-taskwarrior/`** - Jira (ACLI) + Taskwarrior + Bugwarrior
  - Status: ⬜ Planned (Phase 2)
  - Best for: Teams using Jira
  
- **`beads/`** - Steve Yegge's Beads task manager
  - Status: ⬜ Planned (Phase 4)
  - Best for: Lightweight, local-first workflows

### Development/Testing Backends

- **`mock/`** - In-memory JSON-based backend
  - Status: 🔄 In Development (Phase 1)
  - Best for: Testing, development, demos

---

## Backend Interface

All backends must implement the `WorkflowBackend` interface defined in `interface.ts`.

### Core Methods

```typescript
interface WorkflowBackend {
  // Issue Management
  listIssues(filter?: IssueFilter): Promise<Issue[]>
  getIssue(id: string): Promise<Issue>
  createIssue(data: IssueCreateData): Promise<Issue>
  updateIssue(id: string, updates: Partial<IssueCreateData>): Promise<Issue>
  
  // Spec Management
  createSpec(issueId: string): Promise<Spec>
  getSpec(issueId: string): Promise<Spec>
  approveSpec(specId: string): Promise<Spec>
  rejectSpec(specId: string, reason?: string): Promise<Spec>
  
  // Task Management
  createTasks(specId: string): Promise<Task[]>
  getTasks(filter?: TaskFilter): Promise<Task[]>
  getTask(taskId: string): Promise<Task>
  updateTaskState(taskId: string, state: WorkState): Promise<Task>
  updateTask(taskId: string, updates: Partial<Task>): Promise<Task>
  
  // State Machine
  getWorkStates(): WorkState[]
  getValidTransitions(from: WorkState): WorkState[]
  isValidTransition(from: WorkState, to: WorkState): boolean
}
```

See [`interface.ts`](interface.ts) for complete type definitions.

---

## Creating a Custom Backend

### Step 1: Create Directory

```bash
mkdir -p backends/my-backend
cd backends/my-backend
```

### Step 2: Implement Interface

Create `index.js` (or `index.ts`):

```javascript
// backends/my-backend/index.js

class MyBackend {
  constructor(config) {
    this.config = config
    // Initialize your backend
  }
  
  // Implement all interface methods
  async listIssues(filter = {}) {
    // Your implementation
  }
  
  async getIssue(id) {
    // Your implementation
  }
  
  // ... implement remaining methods
}

module.exports = MyBackend
```

### Step 3: Add Configuration Support

Document required config in `README.md`:

```markdown
## Configuration

Required `opencode.json` config:

\`\`\`json
{
  "workflow": {
    "backend": {
      "type": "my-backend",
      "config": {
        "apiUrl": "https://...",
        "apiKey": "...",
        "lmmNotesRoot": "$LLM_NOTES_ROOT"
      }
    }
  }
}
\`\`\`
```

### Step 4: Test Your Backend

Create tests:

```javascript
// backends/my-backend/test.js
const MyBackend = require('./index')

describe('MyBackend', () => {
  it('should list issues', async () => {
    const backend = new MyBackend(testConfig)
    const issues = await backend.listIssues()
    expect(Array.isArray(issues)).toBe(true)
  })
  
  // More tests...
})
```

### Step 5: Document Usage

Create `backends/my-backend/README.md` with:
- Installation instructions
- Configuration guide
- Usage examples
- Troubleshooting

---

## Backend Requirements

### Must Implement ✅

1. All methods in `WorkflowBackend` interface
2. Core work states (new, draft, todo, inprogress, review, approved, rejected, done)
3. Error handling (throw `BackendError` with codes)
4. Spec file management in `$LLM_NOTES_ROOT`
5. Linking between issues, specs, and tasks

### Should Implement 🔄

1. State validation (only allow valid transitions)
2. Idempotency (repeated calls safe)
3. Transaction semantics (rollback on failure)
4. Logging and observability
5. Configuration validation

### May Extend 📋

1. Additional work states
2. Additional metadata fields
3. Backend-specific query capabilities
4. Advanced features (webhooks, etc.)

---

## Directory Structure

```
backends/
├── README.md               # This file
├── interface.ts            # TypeScript interface definition
├── types.ts                # Shared type definitions
├── mock/                   # Mock backend (testing)
│   ├── README.md
│   └── index.js
├── jira-taskwarrior/       # Jira + Taskwarrior backend
│   ├── README.md
│   ├── index.js
│   └── SKILL.md
└── beads/                  # Beads backend
    ├── README.md
    └── index.js
```

---

## Backend Selection

Backends are configured in `opencode.json`:

```json
{
  "workflow": {
    "backend": {
      "type": "jira-taskwarrior",  // Backend to use
      "config": {
        // Backend-specific configuration
      }
    }
  }
}
```

Commands auto-detect the configured backend:

```bash
/spec ISSUE-123              # Uses configured backend
/spec ISSUE-123 --backend=beads  # Override backend
```

---

## State Machine

All backends must support these core states:

### Spec States

- `draft` - Work in progress
- `approved` - Ready for implementation
- `rejected` - Needs rework

### Task States

- `new` - Initial state
- `todo` - Ready to start
- `inprogress` - Being worked on
- `review` - Awaiting review
- `approved` - Review passed
- `rejected` - Needs rework
- `done` - Completed

Backends can add additional states as needed.

---

## Testing Backends

### Unit Tests

Test methods in isolation with mocks:

```javascript
describe('Backend Unit Tests', () => {
  it('validates state transitions', () => {
    const backend = new Backend(config)
    expect(backend.isValidTransition('draft', 'approved')).toBe(true)
    expect(backend.isValidTransition('draft', 'done')).toBe(false)
  })
})
```

### Integration Tests

Test against real backend (non-destructive):

```javascript
describe('Backend Integration Tests', () => {
  it('completes full workflow', async () => {
    const backend = new Backend(testConfig)
    
    const issue = await backend.createIssue({...})
    const spec = await backend.createSpec(issue.id)
    await backend.approveSpec(spec.id)
    const tasks = await backend.createTasks(spec.id)
    
    expect(tasks.length).toBeGreaterThan(0)
    
    // Cleanup
    await backend.deleteIssue(issue.id)
  })
})
```

### Contract Tests

Ensure interface compliance:

```javascript
const { testBackendContract } = require('../test-utils')

describe('Backend Contract', () => {
  testBackendContract(MyBackend, testConfig)
})
```

---

## Contributing

### Adding a New Backend

1. Create directory: `backends/your-backend/`
2. Implement `WorkflowBackend` interface
3. Add tests
4. Document configuration and usage
5. Update this README
6. Submit PR

### Improving Existing Backends

1. Check backend's README for contribution guidelines
2. Add tests for new features
3. Update documentation
4. Submit PR

---

## Resources

- [Workflow Backend Interface](../docs/architecture/workflow-backend-interface.md) - Complete specification
- [Adding Custom Backends](../docs/architecture/adding-backends.md) - Step-by-step guide
- [CUSTOMIZATIONS.md](../CUSTOMIZATIONS.md) - Design decisions

---

## Questions?

- Open an issue in this repo
- Check existing backend implementations for examples
- Review the interface specification
