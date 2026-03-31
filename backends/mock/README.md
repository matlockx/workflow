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

- **`initialIssues`** (optional): Pre-populate with sample issues

---

## Usage

### Basic Usage

```javascript
const MockBackend = require('./backends/mock')

const backend = new MockBackend({})

// Create an issue
const issue = await backend.createIssue({
  summary: 'Add dark mode',
  description: 'Users want a dark mode option'
})

// Create tasks directly from the issue
const tasks = await backend.createTasks(issue.id)

console.log(`Created ${tasks.length} tasks`)
```

### With OpenCode Commands

Once configured in `opencode.json`, use standard commands:

```bash
# Create issue
/issue "Add user authentication"

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
  └── tasks: Map<string, Task>
```

**Note**: Data is lost when process exits. For persistence, use a real backend like `jira-taskwarrior` or `beads`.

---

## State Machine

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
    backend = new MockBackend({})
  })

  it('creates issue -> tasks flow', async () => {
    const issue = await backend.createIssue({
      summary: 'Test feature',
      description: 'Test description'
    })

    const tasks = await backend.createTasks(issue.id)
    expect(tasks.length).toBeGreaterThan(0)
  })

  it('validates state transitions', () => {
    expect(backend.isValidTransition('todo', 'inprogress')).toBe(true)
    expect(backend.isValidTransition('todo', 'done')).toBe(false)
  })
})
```

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

- [Workflow Backend Skill](../../skills/workflow-backend/SKILL.md) - Interface contract and orchestration patterns
- [Jira-Taskwarrior Backend](../jira-taskwarrior/README.md) - Production backend example

---

## Contributing

The mock backend is intentionally simple for reference and testing. Keep it that way!

If adding features:
1. Keep it simple and readable
2. Don't add external dependencies
3. Update tests
4. Update this README
