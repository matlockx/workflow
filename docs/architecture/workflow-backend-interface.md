# Workflow Backend Interface

This document defines the **WorkflowBackend** interface that all backend implementations must follow.

---

## Overview

The `WorkflowBackend` interface provides a unified API for interacting with different workflow engines (Jira, Beads, GitHub Issues, etc.). By implementing this interface, you can plug any workflow system into OpenCode.

**Purpose**:
- Decouple OpenCode commands from specific workflow tools
- Enable swappable backends (Jira ↔ Beads ↔ Custom)
- Standardize state management across workflows
- Provide consistent API for agents

**Responsibility Boundaries**:
- **Backend**: Manages issues, tasks, state transitions, persistence
- **Commands**: Orchestrate workflow, call backend methods
- **Agents**: Generate content, make decisions, call commands

---

## Core Concepts

### 1. Issues

**What**: High-level work items (user stories, bugs, epics)

**Source**: Created in your issue tracker (Jira, Beads, GitHub, etc.)

**Properties**:
- Unique identifier (key/ID)
- Summary/title
- Description (full requirements)
- Status (To Do, In Progress, Done, etc.)
- Metadata (assignee, labels, priority)

### 2. Specs

**What**: Technical specifications derived from issues

**Storage**: Markdown files in `specsDir` (default: `./specs`)

**Properties**:
- Linked to parent issue (via issue ID)
- Contains Requirements section (from issue)
- Contains Design section (agent-generated)
- Approval workflow (draft → approved)
- Version controlled (git)

### 3. Tasks

**What**: Granular implementation work items

**Source**: Generated from approved specs

**Properties**:
- Linked to parent spec/issue
- Organized into phases (optional)
- Dependencies between tasks
- Work state tracking (todo → inprogress → done)
- Implementation details

### 4. State Machine

**What**: Explicit state transitions for each entity type

**Core States** (all backends must support):
- `new`: Initial state
- `draft`: Work in progress
- `todo`: Ready to start
- `inprogress`: Being worked on
- `review`: Awaiting review
- `approved`: Accepted
- `rejected`: Needs rework
- `done`: Completed

**Backend-Specific States**: Backends can add additional states as needed.

---

## Interface Definition

### TypeScript/JavaScript Interface

```typescript
/**
 * WorkflowBackend Interface
 * 
 * All backend implementations must provide these methods.
 */
export interface WorkflowBackend {
  
  // ============================================
  // ISSUE MANAGEMENT
  // ============================================
  
  /**
   * List issues from the backend.
   * 
   * @param filter Optional filter criteria
   * @returns Array of issues
   */
  listIssues(filter?: IssueFilter): Promise<Issue[]>
  
  /**
   * Get a single issue by ID.
   * 
   * @param id Issue identifier (e.g., "JIRA-123", "beads:456")
   * @returns Issue object
   * @throws BackendError if issue not found
   */
  getIssue(id: string): Promise<Issue>
  
  /**
   * Create a new issue.
   * 
   * @param data Issue creation data
   * @returns Created issue with assigned ID
   */
  createIssue(data: IssueCreateData): Promise<Issue>
  
  /**
   * Update an existing issue.
   * 
   * @param id Issue identifier
   * @param updates Partial issue data to update
   * @returns Updated issue
   */
  updateIssue(id: string, updates: Partial<IssueCreateData>): Promise<Issue>
  
  // ============================================
  // SPEC MANAGEMENT
  // ============================================
  
  /**
   * Create a spec from an issue.
   * 
   * This method:
   * - Reads issue context from backend
   * - Creates spec markdown file in specsDir (default: ./specs)
   * - Creates spec task/entry in backend
   * - Links spec to issue
   * 
   * @param issueId Parent issue identifier
   * @returns Created spec with metadata
   */
  createSpec(issueId: string): Promise<Spec>
  
  /**
   * Get an existing spec.
   * 
   * @param issueId Issue identifier to find spec for
   * @returns Spec object with file path and metadata
   * @throws BackendError if spec not found
   */
  getSpec(issueId: string): Promise<Spec>
  
  /**
   * Approve a spec (transition from draft to approved).
   * 
   * @param specId Spec identifier
   * @returns Updated spec
   */
  approveSpec(specId: string): Promise<Spec>
  
  /**
   * Reject a spec (needs rework).
   * 
   * @param specId Spec identifier
   * @param reason Optional reason for rejection
   * @returns Updated spec
   */
  rejectSpec(specId: string, reason?: string): Promise<Spec>
  
  // ============================================
  // TASK MANAGEMENT
  // ============================================
  
  /**
   * Create implementation tasks from an approved spec.
   * 
   * This method:
   * - Reads and analyzes the spec file
   * - Breaks work into phases and tasks
   * - Creates tasks in backend
   * - Sets up dependencies
   * 
   * @param specId Spec identifier
   * @returns Array of created tasks (including phases)
   */
  createTasks(specId: string): Promise<Task[]>
  
  /**
   * Get tasks with optional filtering.
   * 
   * @param filter Optional filter criteria
   * @returns Array of tasks
   */
  getTasks(filter?: TaskFilter): Promise<Task[]>
  
  /**
   * Get a single task by ID.
   * 
   * @param taskId Task identifier
   * @returns Task object
   * @throws BackendError if task not found
   */
  getTask(taskId: string): Promise<Task>
  
  /**
   * Update task state.
   * 
   * @param taskId Task identifier
   * @param state New state
   * @returns Updated task
   */
  updateTaskState(taskId: string, state: WorkState): Promise<Task>
  
  /**
   * Update task properties.
   * 
   * @param taskId Task identifier
   * @param updates Partial task data to update
   * @returns Updated task
   */
  updateTask(taskId: string, updates: Partial<Task>): Promise<Task>
  
  // ============================================
  // STATE MACHINE
  // ============================================
  
  /**
   * Get all valid work states for this backend.
   * 
   * @returns Array of state names
   */
  getWorkStates(): WorkState[]
  
  /**
   * Get valid state transitions from a given state.
   * 
   * @param from Current state
   * @returns Array of valid next states
   */
  getValidTransitions(from: WorkState): WorkState[]
  
  /**
   * Validate if a state transition is allowed.
   * 
   * @param from Current state
   * @param to Desired state
   * @returns True if transition is valid
   */
  isValidTransition(from: WorkState, to: WorkState): boolean
}
```

---

## Data Types

### Issue

```typescript
interface Issue {
  id: string                  // Unique identifier (e.g., "JIRA-123")
  summary: string             // Short title
  description: string         // Full description/requirements
  status: string              // Current status (backend-specific)
  assignee?: string           // Assigned user
  labels: string[]            // Tags/labels
  priority?: string           // Priority level
  url?: string                // Link to issue in backend
  metadata: Record<string, any>  // Backend-specific metadata
}
```

### IssueFilter

```typescript
interface IssueFilter {
  assignee?: string           // Filter by assignee
  status?: string             // Filter by status
  labels?: string[]           // Filter by labels
  search?: string             // Text search in summary/description
  limit?: number              // Max results
  offset?: number             // Pagination offset
}
```

### IssueCreateData

```typescript
interface IssueCreateData {
  summary: string             // Required: Short title
  description: string         // Required: Full description
  issueType?: string          // Story, Bug, Task, etc. (backend-specific)
  project?: string            // Project/board identifier
  assignee?: string           // Assign to user
  labels?: string[]           // Tags/labels
  priority?: string           // Priority level
  metadata?: Record<string, any>  // Backend-specific fields
}
```

### Spec

```typescript
interface Spec {
  id: string                  // Unique identifier (often same as issue ID)
  issueId: string             // Parent issue ID
  filePath: string            // Path to spec markdown file
  state: SpecState            // draft, approved, rejected
  createdAt: Date             // When spec was created
  approvedAt?: Date           // When spec was approved
  metadata: Record<string, any>  // Backend-specific metadata
}
```

### SpecState

```typescript
type SpecState = 'draft' | 'approved' | 'rejected'
```

### Task

```typescript
interface Task {
  id: string                  // Unique identifier
  description: string         // Task title/description
  specId: string              // Parent spec ID
  issueId: string             // Root issue ID
  state: WorkState            // Current state
  tags: string[]              // Tags (e.g., +impl, +phase, +test)
  isPhase: boolean            // True if this is a phase container
  depends: string[]           // Task dependencies (IDs)
  createdAt: Date             // When task was created
  modifiedAt: Date            // Last modified timestamp
  metadata: Record<string, any>  // Backend-specific metadata
}
```

### TaskFilter

```typescript
interface TaskFilter {
  issueId?: string            // Filter by parent issue
  specId?: string             // Filter by parent spec
  state?: WorkState           // Filter by state
  tags?: string[]             // Filter by tags (AND logic)
  isPhase?: boolean           // Filter phases vs tasks
  status?: 'pending' | 'completed'  // Coarse status filter
  limit?: number              // Max results
  offset?: number             // Pagination offset
}
```

### WorkState

```typescript
type WorkState = 
  | 'new'                     // Initial state
  | 'draft'                   // Work in progress
  | 'todo'                    // Ready to start
  | 'inprogress'              // Being worked on
  | 'review'                  // Awaiting review
  | 'approved'                // Accepted
  | 'rejected'                // Needs rework
  | 'done'                    // Completed
  | string                    // Backend can add custom states
```

### BackendError

```typescript
interface BackendError extends Error {
  code: ErrorCode
  recovery?: string           // Suggested recovery action
  originalError?: Error       // Wrapped error
}

type ErrorCode = 
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'INVALID_TRANSITION'
  | 'BACKEND_UNAVAILABLE'
  | 'PERMISSION_DENIED'
  | 'VALIDATION_FAILED'
```

---

## Implementation Requirements

### Must Implement

All backends **must** implement:

1. ✅ All methods in the `WorkflowBackend` interface
2. ✅ Core work states (`new`, `draft`, `todo`, `inprogress`, `review`, `approved`, `rejected`, `done`)
3. ✅ Error handling (throw `BackendError` with appropriate codes)
4. ✅ Spec file management in `specsDir`
5. ✅ Linking between issues, specs, and tasks

### Should Implement

Backends **should** implement:

1. 🔄 State validation (only allow valid transitions)
2. 🔄 Idempotency (repeated calls with same input safe)
3. 🔄 Transaction semantics (rollback on partial failure)
4. 🔄 Logging and observability
5. 🔄 Configuration validation

### May Extend

Backends **may** extend:

1. 📋 Additional work states (beyond core set)
2. 📋 Additional metadata fields
3. 📋 Backend-specific query capabilities
4. 📋 Advanced features (webhooks, notifications, etc.)

---

## State Transition Rules

### Spec State Transitions

```
draft ──────────► approved
  │                   │
  │                   │
  └──────► rejected ──┘
           (loop back to draft for rework)
```

**Valid Transitions**:
- `draft` → `approved` (human approval)
- `draft` → `rejected` (needs rework)
- `rejected` → `draft` (rework complete, ready for re-review)
- `approved` → `rejected` (rare: spec needs major changes)

### Task State Transitions

```
new ───► todo ───► inprogress ───► done
                         │
                         ▼
                      review ───► approved ───► done
                         │
                         ▼
                    rejected ───► todo (rework)
```

**Valid Transitions**:
- `new` → `todo` (task ready to start)
- `todo` → `inprogress` (work started)
- `inprogress` → `review` (implementation complete, needs review)
- `inprogress` → `done` (simple tasks, no review needed)
- `review` → `approved` (review passed)
- `review` → `rejected` (review failed, needs rework)
- `rejected` → `todo` (ready to retry)
- `approved` → `done` (finalize)

### Phase State Transitions

```
new ───► todo ───► inprogress ───► review ───► approved
                         │             │
                         │             ▼
                         └────────► rejected ───► todo (rework)
```

Phases are containers for tasks. Phase state typically mirrors the aggregate state of contained tasks.

---

## Configuration

Each backend must support configuration via `.agent/config.json`:

```json
{
  "backend": {
    "type": "your-backend-name",
    "config": {
      // Backend-specific configuration
      "apiUrl": "https://...",
      "credentials": "...",
      "specsDir": "./specs"
      // ... other config
    }
  }
}
```

### Required Config Fields

All backends must support:

- `specsDir`: Path to spec storage directory (default: `./specs`)

### Backend-Specific Config

Backends may require additional fields (API keys, URLs, paths, etc.)

---

## Example Implementation Skeleton

```javascript
// backends/my-backend/index.js

class MyBackend {
  constructor(config) {
    this.config = config
    // Initialize backend connection
  }
  
  // ============================================
  // ISSUE MANAGEMENT
  // ============================================
  
  async listIssues(filter = {}) {
    // Query your backend for issues
    // Transform to Issue[] format
    // Return results
  }
  
  async getIssue(id) {
    // Fetch single issue
    // Transform to Issue format
    // Throw BackendError if not found
  }
  
  async createIssue(data) {
    // Create issue in backend
    // Return created Issue with ID
  }
  
  async updateIssue(id, updates) {
    // Update issue in backend
    // Return updated Issue
  }
  
  // ============================================
  // SPEC MANAGEMENT
  // ============================================
  
  async createSpec(issueId) {
    // 1. Get issue from backend
    const issue = await this.getIssue(issueId)
    
    // 2. Generate spec file path
    const specPath = this._getSpecPath(issueId, issue.summary)
    
    // 3. Create spec markdown file
    await this._writeSpecFile(specPath, issue)
    
    // 4. Create spec entry in backend
    const spec = await this._createSpecEntry(issueId, specPath)
    
    // 5. Link spec to issue
    await this._linkSpecToIssue(issueId, spec.id)
    
    return spec
  }
  
  async getSpec(issueId) {
    // Query backend for spec linked to issue
    // Return Spec object
  }
  
  async approveSpec(specId) {
    // Update spec state: draft → approved
    // Update timestamp
    // Return updated spec
  }
  
  async rejectSpec(specId, reason) {
    // Update spec state: draft/approved → rejected
    // Store rejection reason
    // Return updated spec
  }
  
  // ============================================
  // TASK MANAGEMENT
  // ============================================
  
  async createTasks(specId) {
    // 1. Get spec
    const spec = await this.getSpec(spec.issueId)
    
    // 2. Read spec file
    const specContent = await this._readSpecFile(spec.filePath)
    
    // 3. Parse spec and extract task breakdown
    const taskPlan = this._analyzeSpec(specContent)
    
    // 4. Create tasks in backend
    const tasks = []
    for (const taskDef of taskPlan) {
      const task = await this._createTask(taskDef)
      tasks.push(task)
    }
    
    // 5. Set up dependencies
    await this._setupDependencies(tasks, taskPlan)
    
    return tasks
  }
  
  async getTasks(filter = {}) {
    // Query backend for tasks
    // Apply filters
    // Return Task[]
  }
  
  async getTask(taskId) {
    // Fetch single task
    // Return Task
  }
  
  async updateTaskState(taskId, state) {
    // Validate transition
    const task = await this.getTask(taskId)
    if (!this.isValidTransition(task.state, state)) {
      throw new BackendError({
        code: 'INVALID_TRANSITION',
        message: `Cannot transition from ${task.state} to ${state}`
      })
    }
    
    // Update state in backend
    // Return updated task
  }
  
  async updateTask(taskId, updates) {
    // Update task in backend
    // Return updated task
  }
  
  // ============================================
  // STATE MACHINE
  // ============================================
  
  getWorkStates() {
    return [
      'new', 'draft', 'todo', 'inprogress',
      'review', 'approved', 'rejected', 'done',
      // Backend-specific states can be added here
    ]
  }
  
  getValidTransitions(from) {
    const transitions = {
      'new': ['todo', 'draft'],
      'draft': ['approved', 'rejected'],
      'todo': ['inprogress'],
      'inprogress': ['review', 'done'],
      'review': ['approved', 'rejected'],
      'approved': ['done'],
      'rejected': ['draft', 'todo'],
      'done': [],
    }
    return transitions[from] || []
  }
  
  isValidTransition(from, to) {
    return this.getValidTransitions(from).includes(to)
  }
  
  // ============================================
  // HELPER METHODS (Private)
  // ============================================
  
  _getSpecPath(issueId, summary) {
    // Generate portable spec path
    // Format: specsDir/<ISSUEKEY>__<slug>.md
  }
  
  _writeSpecFile(path, issue) {
    // Write markdown file with YAML frontmatter
  }
  
  _readSpecFile(path) {
    // Read and parse spec markdown
  }
  
  _createSpecEntry(issueId, specPath) {
    // Create spec entry in backend
  }
  
  _linkSpecToIssue(issueId, specId) {
    // Link spec to issue in backend
  }
  
  _analyzeSpec(specContent) {
    // Parse spec and generate task breakdown
  }
  
  _createTask(taskDef) {
    // Create single task in backend
  }
  
  _setupDependencies(tasks, taskPlan) {
    // Set up task dependencies in backend
  }
}

module.exports = MyBackend
```

---

## Testing Your Backend

### Unit Tests

Test individual methods in isolation:

```javascript
describe('MyBackend', () => {
  it('should list issues', async () => {
    const backend = new MyBackend(mockConfig)
    const issues = await backend.listIssues()
    expect(Array.isArray(issues)).toBe(true)
  })
  
  it('should validate state transitions', () => {
    const backend = new MyBackend(mockConfig)
    expect(backend.isValidTransition('draft', 'approved')).toBe(true)
    expect(backend.isValidTransition('draft', 'done')).toBe(false)
  })
})
```

### Integration Tests

Test against real backend (non-destructive):

```javascript
describe('MyBackend Integration', () => {
  it('should create issue -> spec -> tasks flow', async () => {
    const backend = new MyBackend(testConfig)
    
    // Create issue
    const issue = await backend.createIssue({
      summary: 'Test feature',
      description: 'Test description'
    })
    
    // Create spec
    const spec = await backend.createSpec(issue.id)
    expect(spec.state).toBe('draft')
    
    // Approve spec
    await backend.approveSpec(spec.id)
    
    // Create tasks
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
const { testBackendContract } = require('opencode-backend-test-utils')

describe('MyBackend Contract', () => {
  testBackendContract(MyBackend, testConfig)
})
```

---

## See Also

- [Adding Custom Backends](adding-backends.md) - Step-by-step guide
- [Jira-Taskwarrior Backend](../../backends/jira-taskwarrior/README.md) - Reference implementation
- [Beads Backend](../../backends/beads/README.md) - Alternative implementation
- [Backend Injection Diagrams](../BACKEND_INJECTION_DIAGRAMS.md) - Visual architecture

---

## Questions?

- Check existing backend implementations for examples
- See [CUSTOMIZATIONS.md](../../CUSTOMIZATIONS.md) for design decisions
- Open an issue if something is unclear
