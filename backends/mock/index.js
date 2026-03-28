/**
 * Mock Workflow Backend
 * 
 * A simple in-memory implementation of the WorkflowBackend interface.
 * Useful for testing, development, and as a reference implementation.
 * 
 * WARNING: All data is stored in memory and lost when process exits.
 * Do NOT use in production.
 * 
 * @module backends/mock
 */

const fs = require('fs').promises
const path = require('path')

// ============================================
// MOCK BACKEND IMPLEMENTATION
// ============================================

class MockBackend {
  constructor(config = {}) {
    this.config = {
      lmmNotesRoot: config.lmmNotesRoot || process.env.LLM_NOTES_ROOT || './notes',
      autoGenerateSpecs: config.autoGenerateSpecs !== false,
      initialIssues: config.initialIssues || [],
      ...config
    }
    
    // In-memory storage
    this.issues = new Map()
    this.specs = new Map()
    this.tasks = new Map()
    
    // Counters for ID generation
    this.issueCounter = 1
    this.specCounter = 1
    this.taskCounter = 1
    
    // Initialize with sample data if provided
    this._initialize()
  }
  
  // ============================================
  // INITIALIZATION
  // ============================================
  
  _initialize() {
    // Add initial issues if provided
    for (const issueData of this.config.initialIssues) {
      const issue = {
        id: issueData.id || `MOCK-${this.issueCounter++}`,
        summary: issueData.summary,
        description: issueData.description,
        status: issueData.status || 'To Do',
        assignee: issueData.assignee,
        labels: issueData.labels || [],
        priority: issueData.priority,
        url: issueData.url,
        metadata: issueData.metadata || {}
      }
      this.issues.set(issue.id, issue)
    }
  }
  
  // ============================================
  // ISSUE MANAGEMENT
  // ============================================
  
  async listIssues(filter = {}) {
    let issues = Array.from(this.issues.values())
    
    // Apply filters
    if (filter.assignee) {
      issues = issues.filter(i => i.assignee === filter.assignee)
    }
    
    if (filter.status) {
      issues = issues.filter(i => i.status === filter.status)
    }
    
    if (filter.labels && filter.labels.length > 0) {
      issues = issues.filter(i =>
        filter.labels.every(label => i.labels.includes(label))
      )
    }
    
    if (filter.search) {
      const search = filter.search.toLowerCase()
      issues = issues.filter(i =>
        i.summary.toLowerCase().includes(search) ||
        i.description.toLowerCase().includes(search)
      )
    }
    
    // Apply pagination
    const offset = filter.offset || 0
    const limit = filter.limit || issues.length
    
    return issues.slice(offset, offset + limit)
  }
  
  async getIssue(id) {
    const issue = this.issues.get(id)
    if (!issue) {
      throw this._createError('NOT_FOUND', `Issue ${id} not found`)
    }
    return issue
  }
  
  async createIssue(data) {
    // Validate required fields
    if (!data.summary) {
      throw this._createError('VALIDATION_FAILED', 'Issue summary is required')
    }
    if (!data.description) {
      throw this._createError('VALIDATION_FAILED', 'Issue description is required')
    }
    
    const issue = {
      id: `MOCK-${this.issueCounter++}`,
      summary: data.summary,
      description: data.description,
      status: data.status || 'To Do',
      assignee: data.assignee,
      labels: data.labels || [],
      priority: data.priority,
      url: data.url,
      metadata: data.metadata || {}
    }
    
    this.issues.set(issue.id, issue)
    return issue
  }
  
  async updateIssue(id, updates) {
    const issue = await this.getIssue(id)
    
    // Apply updates
    if (updates.summary) issue.summary = updates.summary
    if (updates.description) issue.description = updates.description
    if (updates.status) issue.status = updates.status
    if (updates.assignee !== undefined) issue.assignee = updates.assignee
    if (updates.labels) issue.labels = updates.labels
    if (updates.priority !== undefined) issue.priority = updates.priority
    if (updates.metadata) issue.metadata = { ...issue.metadata, ...updates.metadata }
    
    this.issues.set(id, issue)
    return issue
  }
  
  // ============================================
  // SPEC MANAGEMENT
  // ============================================
  
  async createSpec(issueId) {
    // Get parent issue
    const issue = await this.getIssue(issueId)
    
    // Generate spec ID and file path
    const specId = `SPEC-${issueId}`
    const slug = this._slugify(issue.summary)
    const fileName = `${issueId}__${slug}.md`
    
    // Determine repository name (mock: use 'default')
    const repo = 'default'
    const specDir = path.join(this.config.lmmNotesRoot, repo, 'notes', 'specs')
    const specPath = path.join(specDir, fileName)
    
    // Create spec directory if needed
    await fs.mkdir(specDir, { recursive: true })
    
    // Generate spec content
    const content = this._generateSpecContent(issue)
    
    // Write spec file
    await fs.writeFile(specPath, content, 'utf8')
    
    // Create spec entry
    const spec = {
      id: specId,
      issueId: issueId,
      filePath: specPath,
      state: 'draft',
      createdAt: new Date(),
      metadata: {}
    }
    
    this.specs.set(specId, spec)
    return spec
  }
  
  async getSpec(issueId) {
    const specId = `SPEC-${issueId}`
    const spec = this.specs.get(specId)
    
    if (!spec) {
      throw this._createError('NOT_FOUND', `Spec for issue ${issueId} not found`)
    }
    
    return spec
  }
  
  async approveSpec(specId) {
    const spec = this.specs.get(specId)
    
    if (!spec) {
      throw this._createError('NOT_FOUND', `Spec ${specId} not found`)
    }
    
    // Validate transition
    if (spec.state !== 'draft' && spec.state !== 'rejected') {
      throw this._createError(
        'INVALID_TRANSITION',
        `Cannot approve spec in state ${spec.state}`
      )
    }
    
    spec.state = 'approved'
    spec.approvedAt = new Date()
    
    this.specs.set(specId, spec)
    return spec
  }
  
  async rejectSpec(specId, reason) {
    const spec = this.specs.get(specId)
    
    if (!spec) {
      throw this._createError('NOT_FOUND', `Spec ${specId} not found`)
    }
    
    spec.state = 'rejected'
    if (reason) {
      spec.metadata.rejectionReason = reason
    }
    
    this.specs.set(specId, spec)
    return spec
  }
  
  // ============================================
  // TASK MANAGEMENT
  // ============================================
  
  async createTasks(specId) {
    const spec = this.specs.get(specId)
    
    if (!spec) {
      throw this._createError('NOT_FOUND', `Spec ${specId} not found`)
    }
    
    if (spec.state !== 'approved') {
      throw this._createError(
        'INVALID_STATE',
        `Cannot create tasks from spec in state ${spec.state}. Spec must be approved first.`
      )
    }
    
    // Read and parse spec file
    const specContent = await fs.readFile(spec.filePath, 'utf8')
    
    // Generate tasks from spec (simplified)
    const tasks = this._generateTasksFromSpec(spec, specContent)
    
    // Store tasks
    for (const task of tasks) {
      this.tasks.set(task.id, task)
    }
    
    return tasks
  }
  
  async getTasks(filter = {}) {
    let tasks = Array.from(this.tasks.values())
    
    // Apply filters
    if (filter.issueId) {
      tasks = tasks.filter(t => t.issueId === filter.issueId)
    }
    
    if (filter.specId) {
      tasks = tasks.filter(t => t.specId === filter.specId)
    }
    
    if (filter.state) {
      tasks = tasks.filter(t => t.state === filter.state)
    }
    
    if (filter.tags && filter.tags.length > 0) {
      tasks = tasks.filter(t =>
        filter.tags.every(tag => t.tags.includes(tag))
      )
    }
    
    if (filter.isPhase !== undefined) {
      tasks = tasks.filter(t => t.isPhase === filter.isPhase)
    }
    
    if (filter.status) {
      const pending = ['new', 'todo', 'inprogress', 'review']
      const completed = ['approved', 'done']
      
      if (filter.status === 'pending') {
        tasks = tasks.filter(t => pending.includes(t.state))
      } else if (filter.status === 'completed') {
        tasks = tasks.filter(t => completed.includes(t.state))
      }
    }
    
    // Apply pagination
    const offset = filter.offset || 0
    const limit = filter.limit || tasks.length
    
    return tasks.slice(offset, offset + limit)
  }
  
  async getTask(taskId) {
    const task = this.tasks.get(taskId)
    
    if (!task) {
      throw this._createError('NOT_FOUND', `Task ${taskId} not found`)
    }
    
    return task
  }
  
  async updateTaskState(taskId, state) {
    const task = await this.getTask(taskId)
    
    // Validate transition
    if (!this.isValidTransition(task.state, state)) {
      throw this._createError(
        'INVALID_TRANSITION',
        `Cannot transition from ${task.state} to ${state}`
      )
    }
    
    task.state = state
    task.modifiedAt = new Date()
    
    this.tasks.set(taskId, task)
    return task
  }
  
  async updateTask(taskId, updates) {
    const task = await this.getTask(taskId)
    
    // Apply updates
    if (updates.description) task.description = updates.description
    if (updates.tags) task.tags = updates.tags
    if (updates.depends) task.depends = updates.depends
    if (updates.metadata) task.metadata = { ...task.metadata, ...updates.metadata }
    
    task.modifiedAt = new Date()
    
    this.tasks.set(taskId, task)
    return task
  }
  
  // ============================================
  // STATE MACHINE
  // ============================================
  
  getWorkStates() {
    return [
      'new',
      'draft',
      'todo',
      'inprogress',
      'review',
      'approved',
      'rejected',
      'done'
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
      'done': []
    }
    
    return transitions[from] || []
  }
  
  isValidTransition(from, to) {
    return this.getValidTransitions(from).includes(to)
  }
  
  // ============================================
  // HELPER METHODS
  // ============================================
  
  _createError(code, message, recovery, originalError) {
    const error = new Error(message)
    error.code = code
    error.recovery = recovery
    error.originalError = originalError
    return error
  }
  
  _slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50)
  }
  
  _generateSpecContent(issue) {
    const now = new Date().toISOString()
    
    return `---
createdAt: ${now}
work_state: draft
---

# ${issue.summary}

## Requirements

### User Story 1

**Story**: ${issue.description}

**Acceptance Criteria**:
- Functionality works as described
- Code is tested
- Documentation is updated

## Design

### Components

- Main component for feature implementation

### Files

#### New
- \`src/${this._slugify(issue.summary)}.ts\` - Main implementation

#### Modified
- (To be determined during implementation)

### Testing Strategy

- Unit tests for core functionality
- Integration tests for workflow
- E2E tests for user-facing features

### Implementation Notes

(Auto-generated spec from mock backend. Update as needed.)
`
  }
  
  _generateTasksFromSpec(spec, specContent) {
    const tasks = []
    
    // Create a phase task
    const phaseTask = {
      id: `TASK-${this.taskCounter++}`,
      description: `Phase 1: Implement ${spec.issueId}`,
      specId: spec.id,
      issueId: spec.issueId,
      state: 'todo',
      tags: ['impl', 'phase'],
      isPhase: true,
      depends: [],
      createdAt: new Date(),
      modifiedAt: new Date(),
      metadata: {}
    }
    
    tasks.push(phaseTask)
    
    // Create implementation tasks
    const implTasks = [
      { description: 'Setup and preparation', depends: [phaseTask.id] },
      { description: 'Core implementation', depends: [phaseTask.id] },
      { description: 'Write tests', depends: [phaseTask.id] },
      { description: 'Documentation', depends: [phaseTask.id] }
    ]
    
    for (const taskDef of implTasks) {
      const task = {
        id: `TASK-${this.taskCounter++}`,
        description: taskDef.description,
        specId: spec.id,
        issueId: spec.issueId,
        state: 'todo',
        tags: ['impl'],
        isPhase: false,
        depends: taskDef.depends,
        createdAt: new Date(),
        modifiedAt: new Date(),
        metadata: {}
      }
      
      tasks.push(task)
    }
    
    return tasks
  }
}

// ============================================
// EXPORTS
// ============================================

module.exports = MockBackend
