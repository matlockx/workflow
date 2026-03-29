# Mock Backend

A simple in-memory workflow backend for testing and development.

---

## Purpose

The mock backend provides a minimal implementation of the `WorkflowBackend` interface that:
- Stores all data in memory (no persistence)
- Useful for testing, demos, and development
- Validates the backend interface design
- Serves as a reference implementation

**Do NOT use in production** - all data is lost when process exits.

---

## Features

✅ Full `WorkflowBackend` interface implementation
✅ In-memory storage (no external dependencies)
✅ State validation and transitions
✅ Spec file management
✅ Simple, readable code (good for learning)

❌ No persistence (data lost on restart)
❌ No concurrency control
❌ No authentication
❌ Not suitable for production

---

## Configuration

Add to `opencode.json`:

```json
{
  "workflow": {
    "backend": {
      "type": "mock",
      "config": {
        "specsDir": "./specs",
        "autoGenerateSpecs": true,
        "initialIssues": [
          {
            "id": "MOCK-1",
            "summary": "Example issue",
            "description": "This is a sample issue for testing"
          }
        ]
      }
    }
  }
}
```

### Configuration Options

- **`specsDir`** (optional, default: `./specs`): Path to spec storage directory
- **`autoGenerateSpecs`** (optional, default: `true`): Auto-generate spec content
- **`initialIssues`** (optional): Pre-populate with sample issues

---

## Usage

### Basic Usage

```javascript
const MockBackend = require('./backends/mock')

const backend = new MockBackend({
  specsDir: './specs',
  autoGenerateSpecs: true
})

// Create an issue
const issue = await backend.createIssue({
  summary: 'Add dark mode',
  description: 'Users want a dark mode option'
})

// Create a spec
const spec = await backend.createSpec(issue.id)

// Approve the spec
await backend.approveSpec(spec.id)

// Create tasks
const tasks = await backend.createTasks(spec.id)

console.log(`Created ${tasks.length} tasks`)
```

### With OpenCode Commands

Once configured in `opencode.json`, use standard commands:

```bash
# Create issue
/po-issue "Add user authentication"

# Create spec
/spec MOCK-1

# Create tasks
/createtasks MOCK-1

# Implement
/implement MOCK-1
```

---

## Data Storage

All data stored in memory:

```
MockBackend instance
  ├── issues: Map<string, Issue>
  ├── specs: Map<string, Spec>
  └── tasks: Map<string, Task>
```

**Note**: Data is lost when process exits. For persistence, use a real backend like `jira-taskwarrior` or `beads`.

---

## State Machine

### Spec States

```
draft ──────► approved
  │              │
  └────► rejected ┘
         (loop back)
```

### Task States

```
new ──► todo ──► inprogress ──► review ──► approved ──► done
                                   │
                                   └────► rejected ──► todo
```

---

## Testing

The mock backend is perfect for testing:

```javascript
const MockBackend = require('./backends/mock')

describe('Workflow Tests', () => {
  let backend
  
  beforeEach(() => {
    backend = new MockBackend({
      specsDir: './test-specs'
    })
  })
  
  it('creates issue -> spec -> tasks flow', async () => {
    const issue = await backend.createIssue({
      summary: 'Test feature',
      description: 'Test description'
    })
    
    const spec = await backend.createSpec(issue.id)
    expect(spec.state).toBe('draft')
    
    await backend.approveSpec(spec.id)
    
    const tasks = await backend.createTasks(spec.id)
    expect(tasks.length).toBeGreaterThan(0)
  })
  
  it('validates state transitions', () => {
    expect(backend.isValidTransition('draft', 'approved')).toBe(true)
    expect(backend.isValidTransition('draft', 'done')).toBe(false)
  })
})
```

---

## Implementation Notes

### Auto-Generated Specs

When `autoGenerateSpecs: true`, specs are auto-generated with placeholder content:

```markdown
---
createdAt: 2026-03-28T12:00:00Z
work_state: draft
---

# [Issue Summary]

## Requirements

### User Story 1
**Story**: [Auto-generated from issue description]
**Acceptance Criteria**:
- Placeholder criteria

## Design

### Components
- Placeholder component

### Files
#### New
- `src/placeholder.ts`

### Testing Strategy
- Unit tests
- Integration tests
```

For real projects, use agents to generate proper specs.

---

## Limitations

1. **No Persistence**: All data lost on restart
2. **No Concurrency**: Single-threaded, no locking
3. **No Authentication**: No user management
4. **Simple IDs**: Sequential numeric IDs (MOCK-1, MOCK-2, etc.)
5. **No External Integration**: No Jira, GitHub, etc.

For production use, implement a real backend or use existing ones (`jira-taskwarrior`, `beads`).

---

## See Also

- [Backend Interface](../interface.ts) - Full interface specification
- [Workflow Backend Interface Docs](../../docs/architecture/workflow-backend-interface.md)
- [Jira-Taskwarrior Backend](../jira-taskwarrior/README.md) - Production backend example

---

## Contributing

The mock backend is intentionally simple for reference and testing. Keep it that way!

If adding features:
1. Keep it simple and readable
2. Don't add external dependencies
3. Update tests
4. Update this README
