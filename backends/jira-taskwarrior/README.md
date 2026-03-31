# Jira-Taskwarrior Backend

Workflow backend that uses Jira (via ACLI) for issue tracking and Taskwarrior for task/state management.

## Overview

This backend implements the `WorkflowBackend` interface using:

- **ACLI (Atlassian CLI)**: Jira Cloud operations (create/search/edit issues)
- **Taskwarrior**: Local task management with User Defined Attributes (UDAs)
- **Bugwarrior** (optional): Syncs Jira issues to Taskwarrior

## Prerequisites

### 1. ACLI (Atlassian CLI)

Install ACLI:
```bash
# macOS
brew install atlassian-cli

# Or download from: https://developer.atlassian.com/cloud/acli/
```

Authenticate:
```bash
# Interactive OAuth (recommended)
acli jira auth login --web

# Or with API token
echo "$API_TOKEN" | acli jira auth login \
  --site "your-site.atlassian.net" \
  --email "you@example.com" \
  --token
```

Verify:
```bash
acli jira auth status
```

### 2. Taskwarrior

Install Taskwarrior:
```bash
# macOS
brew install task

# Linux
sudo apt install taskwarrior  # Debian/Ubuntu
sudo pacman -S task           # Arch
```

Configure UDAs in `~/.taskrc`:
```ini
# User Defined Attributes (UDAs)
uda.jiraid.type=string
uda.jiraid.label=Jira ID
uda.jiraid.values=

uda.work_state.type=string
uda.work_state.label=Work State
uda.work_state.values=new,draft,todo,inprogress,review,approved,rejected,done

uda.repository.type=string
uda.repository.label=Repository
uda.repository.values=
```

Verify:
```bash
task show | grep "uda\."
```

### 3. Bugwarrior (Optional)

Install Bugwarrior for automatic Jira → Taskwarrior sync:
```bash
pip install bugwarrior
```

Configure `~/.config/bugwarrior/bugwarrior.toml`:
```toml
[general]
targets = my_jira

[my_jira]
service = jira
jira.base_uri = https://your-site.atlassian.net
jira.username = you@example.com
jira.password = YOUR_API_TOKEN
jira.query = assignee = currentUser() AND resolution = Unresolved
```

Sync issues:
```bash
bugwarrior-pull
```

## Configuration

Add to your `opencode.json`:

```json
{
  "workflow": {
    "backend": {
      "type": "jira-taskwarrior",
      "config": {
        "jiraSite": "your-site.atlassian.net",
        "jiraProject": "PROJ",
        "jiraEmail": "you@example.com",
        "taskrcPath": "~/.taskrc",
        "taskDataLocation": "~/.task",
        "repository": "my-project",
        "useBugwarrior": true,
        "bugwarriorConfig": "~/.config/bugwarrior/bugwarrior.toml"
      }
    }
  }
}
```

Or use environment variables:

```bash
export JIRA_SITE="your-site.atlassian.net"
export JIRA_PROJECT="PROJ"
export JIRA_EMAIL="you@example.com"
```

## Usage

### Initialize Backend

```javascript
const JiraTaskwarriorBackend = require('./backends/jira-taskwarrior')

const backend = new JiraTaskwarriorBackend({
  jiraSite: 'your-site.atlassian.net',
  jiraProject: 'PROJ',
  repository: 'my-project'
})
```

### List Issues

```javascript
const issues = await backend.listIssues({
  status: 'In Progress',
  assignee: 'me@example.com',
  limit: 10
})

console.log(`Found ${issues.length} issues`)
```

### Create Spec

```javascript
// Create tasks from Jira issue
const tasks = await backend.createTasks('PROJ-123')

console.log(`Tasks created: ${tasks.length}`)
// Creates:
// - Phase tasks with +impl +phase tags
// - Implementation tasks with dependencies on phases
```

### Approve Spec

```javascript
const approved = await backend.approveSpec('SPEC-PROJ-123')

console.log(`Spec approved: ${approved.state}`)
// Updates Taskwarrior task: work_state:approved + status:completed
```

### Generate Tasks

```javascript
const tasks = await backend.createTasks('SPEC-PROJ-123')

console.log(`Created ${tasks.length} tasks`)
// Creates:
// - Phase tasks with +impl +phase tags
// - Implementation tasks with dependencies on phases
```

### Update Task State

```javascript
await backend.updateTaskState(taskUUID, 'inprogress')

// Updates BOTH:
// - work_state UDA: inprogress
// - Native status: pending (or completed for 'done'/'approved')
```

## Data Model

### Task Hierarchy

```
Jira Issue (PROJ-123)
  └─ jiraid:PROJ-123
     └─ Implementation (+impl)
        ├─ Phase 1 (+phase, work_state:todo → inprogress → review → approved)
        │  ├─ Task 1.1 (depends:phase1-uuid)
        │  ├─ Task 1.2 (depends:phase1-uuid + task1.1-uuid)
        │  └─ Task 1.3 (depends:phase1-uuid + task1.2-uuid)
        │
        └─ Phase 2 (+phase)
           ├─ Task 2.1 (depends:phase2-uuid)
           └─ Task 2.2 (depends:phase2-uuid)
```

### Taskwarrior Tags

| Tag | Purpose |
|-----|---------|
| `+jira` | Synced from Jira via Bugwarrior |
| `+spec` | Specification task |
| `+impl` | Implementation work (includes phases) |
| `+phase` | Phase container task |
| `+conditional` | Optional task (may be skipped) |

### UDAs (User Defined Attributes)

| UDA | Type | Purpose | Example |
|-----|------|---------|---------|
| `jiraid` | string | Links to Jira issue | `jiraid:PROJ-123` |
| `work_state` | string | Workflow state | `work_state:inprogress` |
| `repository` | string | Git repository name | `repository:account-api` |

### State Machine

```
new ────────► todo ────────► inprogress ────────► review ────────► approved ────────► done
  │             ▲                                    │                 │
  │             │                                    │                 │
  │             └────────────── rejected ────────────┴─────────────────┘
  │
  └─────────► draft ───────► approved (specs only)
                  │
                  └─────────► rejected
```

## Dual-Field State Management

**CRITICAL**: This backend maintains TWO state fields:

1. **Native Taskwarrior status**: `pending`, `completed`, `deleted`
2. **Custom work_state UDA**: `new`, `draft`, `todo`, `inprogress`, `review`, `approved`, `rejected`, `done`

Both fields must ALWAYS be updated together:

```bash
# ✅ CORRECT: Update both fields
task <uuid> modify work_state:inprogress   # Update UDA
task <uuid> start                          # Optional: mark started

task <uuid> done                           # Update native status
task <uuid> modify work_state:done         # Update UDA

# ❌ WRONG: Update only one field
task <uuid> done                           # Missing work_state update!
```

The backend's `_updateTaskState()` method handles this automatically.

## Query Patterns

### Find Spec for Issue

```bash
task jiraid:PROJ-123 +spec export
```

### Find Active Phase

```bash
# Resume in-progress phase
task jiraid:PROJ-123 +phase work_state:inprogress export

# Or find next pending phase
task jiraid:PROJ-123 +phase work_state:todo export
```

### Find Tasks in Phase

```bash
# Get phase UUID first
PHASE_UUID=$(task jiraid:PROJ-123 +phase work_state:inprogress export | jq -r '.[0].uuid')

# Find pending tasks in this phase
task jiraid:PROJ-123 +impl -phase status:pending depends:$PHASE_UUID export
```

### Check Dependencies

```bash
# Check if dependency is satisfied
task uuid:$DEP_UUID export | jq '.[0].status'
# "completed" or "deleted" = satisfied
# "pending" = not satisfied
```

## Error Handling

The backend throws `BackendError` with these codes:

| Code | Meaning | Recovery |
|------|---------|----------|
| `CONFIG_ERROR` | Missing/invalid configuration | Check opencode.json or env vars |
| `AUTH_ERROR` | ACLI not authenticated | Run: `acli jira auth login --web` |
| `ACLI_ERROR` | ACLI command failed | Check ACLI installation |
| `TASKWARRIOR_ERROR` | Taskwarrior command failed | Check Taskwarrior installation & UDAs |
| `NOT_FOUND` | Resource not found | Check if issue/spec/task exists |
| `ALREADY_EXISTS` | Resource already exists | Use existing resource |
| `INVALID_STATE` | Operation not allowed in current state | Check state machine transitions |
| `INVALID_TRANSITION` | Invalid state transition | Use valid transition |
| `PARSE_ERROR` | Failed to parse command output | Check command output format |

Example:

```javascript
try {
  await backend.createSpec('PROJ-123')
} catch (error) {
  if (error.code === 'ALREADY_EXISTS') {
    console.log('Spec already exists, fetching...')
    const spec = await backend.getSpec('PROJ-123')
  } else {
    console.error(`Error: ${error.message}`)
    if (error.recovery) {
      console.log(`Recovery: ${error.recovery}`)
    }
  }
}
```

## Troubleshooting

### ACLI Authentication Issues

```bash
# Check auth status
acli jira auth status

# Re-authenticate
acli jira auth login --web

# Switch accounts
acli jira auth switch --site your-site.atlassian.net
```

### Taskwarrior UDA Issues

```bash
# Verify UDAs are configured
task show | grep "uda\."

# If missing, add to ~/.taskrc (see Prerequisites)

# Re-import existing tasks
task rc.recurrence=off rc.verbose=nothing export | task import
```

### Task Dependency Issues

```bash
# Find broken dependencies
task status:pending export | jq -r '.[] | select(.depends | length > 0) | .uuid' | while read uuid; do
  task uuid:$uuid export | jq -r '.[] | .depends[]' | while read dep; do
    task uuid:$dep export > /dev/null 2>&1 || echo "Broken: $uuid depends on missing $dep"
  done
done

# Fix by removing broken dependency
task <uuid> modify depends:
```

## Migration from Original OpenCode

If you were using the original hardcoded Jira-Taskwarrior workflow:

1. **No code changes needed** - your existing Taskwarrior data works as-is
2. **Update config** - add backend configuration to `opencode.json`
3. **Commands work the same** - `/spec`, `/createtasks`, `/implement` use this backend
4. **Skills preserved** - taskwarrior and acli skills reference this backend

Your existing tasks, specs, and workflow state are fully compatible.

## Development

Run tests:
```bash
node backends/jira-taskwarrior/test.js
```

Note: Tests are mocked and don't require real Jira/Taskwarrior installations.

### Live Jira E2E Safety Rule

`jira-taskwarrior` can operate against a real Jira project and create live work items.

- Only run a live Jira end-to-end validation when the user explicitly asks for it.
- Always get an explicit confirmation immediately before executing the live run.
- Prefer an isolated Taskwarrior config/data directory and a disposable Jira project when validating.
- Clean up or cancel temporary Jira issues after the test if deletion is not permitted.

## License

MIT
