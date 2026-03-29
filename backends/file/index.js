/**
 * File Workflow Backend
 *
 * A zero-dependency, file-only implementation of the WorkflowBackend interface.
 * Stores all state in `.agent/state/` (gitignored) and specs in `specs/`
 * (committed to git for visibility).
 *
 * Issue IDs are sequential: ISSUE-1, ISSUE-2, etc.
 * No external tools or CLIs required.
 *
 * Directory layout (relative to project root):
 *
 *   specs/
 *     ISSUE-1.md          ← spec markdown, committed to git
 *   .agent/state/
 *     issues/
 *       ISSUE-1.json      ← issue metadata
 *     tasks/
 *       ISSUE-1/
 *         tasks.json      ← all tasks for this issue
 *     counter.json        ← sequential ID counter
 *
 * @module backends/file
 */

// AIDEV-NOTE: This backend is intentionally dependency-free. Use only
// Node.js built-ins (fs, path). No external packages.

const fs = require('fs')
const path = require('path')

// ============================================
// FILE BACKEND IMPLEMENTATION
// ============================================

class FileBackend {
  /**
   * @param {Object} config
   * @param {string} [config.stateDir]  Override for state directory (default: .agent/state)
   * @param {string} [config.specsDir]  Override for specs directory (default: specs)
   * @param {string} [config.projectRoot] Override for project root (default: cwd)
   */
  constructor(config = {}) {
    const projectRoot = config.projectRoot || process.cwd()
    this.stateDir = config.stateDir || path.join(projectRoot, '.agent', 'state')
    this.specsDir = config.specsDir || path.join(projectRoot, 'specs')

    this.issuesDir = path.join(this.stateDir, 'issues')
    this.tasksDir = path.join(this.stateDir, 'tasks')
    this.counterFile = path.join(this.stateDir, 'counter.json')

    // Ensure directory structure exists on first use
    this._ensureDirs()
  }

  // ============================================
  // DIRECTORY HELPERS
  // ============================================

  _ensureDirs() {
    for (const dir of [this.stateDir, this.issuesDir, this.tasksDir, this.specsDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    }
  }

  _readJson(filePath) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch (err) {
      if (err.code === 'ENOENT') return null
      throw err
    }
  }

  _writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
  }

  // ============================================
  // ID GENERATION
  // ============================================

  _nextIssueId() {
    const counter = this._readJson(this.counterFile) || { issue: 0 }
    counter.issue = (counter.issue || 0) + 1
    this._writeJson(this.counterFile, counter)
    return `ISSUE-${counter.issue}`
  }

  _nextTaskId(issueId) {
    const counter = this._readJson(this.counterFile) || {}
    const key = `task_${issueId}`
    counter[key] = (counter[key] || 0) + 1
    this._writeJson(this.counterFile, counter)
    return `${issueId}-T${counter[key]}`
  }

  // ============================================
  // ERROR HELPER
  // ============================================

  _error(code, message, recovery, originalError) {
    const err = new Error(message)
    err.code = code
    err.recovery = recovery
    err.originalError = originalError
    return err
  }

  // ============================================
  // ISSUE MANAGEMENT
  // ============================================

  async listIssues(filter = {}) {
    let issues = []

    if (!fs.existsSync(this.issuesDir)) return []

    for (const file of fs.readdirSync(this.issuesDir)) {
      if (!file.endsWith('.json')) continue
      const issue = this._readJson(path.join(this.issuesDir, file))
      if (issue) issues.push(issue)
    }

    // Apply filters
    if (filter.status) {
      issues = issues.filter(i => i.status === filter.status)
    }
    if (filter.assignee) {
      issues = issues.filter(i => i.assignee === filter.assignee)
    }
    if (filter.labels && filter.labels.length > 0) {
      issues = issues.filter(i =>
        filter.labels.every(label => (i.labels || []).includes(label))
      )
    }
    if (filter.search) {
      const q = filter.search.toLowerCase()
      issues = issues.filter(i =>
        i.summary.toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q)
      )
    }

    // Sort by numeric issue ID
    issues.sort((a, b) => {
      const na = parseInt(a.id.replace('ISSUE-', ''), 10) || 0
      const nb = parseInt(b.id.replace('ISSUE-', ''), 10) || 0
      return na - nb
    })

    const offset = filter.offset || 0
    const limit = filter.limit != null ? filter.limit : issues.length
    return issues.slice(offset, offset + limit)
  }

  async getIssue(id) {
    const filePath = path.join(this.issuesDir, `${id}.json`)
    const issue = this._readJson(filePath)
    if (!issue) {
      throw this._error('NOT_FOUND', `Issue ${id} not found`, 'Create the issue first with /issue')
    }
    return issue
  }

  async createIssue(data) {
    if (!data.summary) {
      throw this._error('VALIDATION_FAILED', 'Issue summary is required')
    }
    if (!data.description) {
      throw this._error('VALIDATION_FAILED', 'Issue description is required')
    }

    const id = this._nextIssueId()
    const issue = {
      id,
      summary: data.summary,
      description: data.description,
      status: data.status || 'open',
      assignee: data.assignee || null,
      labels: data.labels || [],
      priority: data.priority || null,
      url: null,
      createdAt: new Date().toISOString(),
      metadata: data.metadata || {}
    }

    this._writeJson(path.join(this.issuesDir, `${id}.json`), issue)
    return issue
  }

  async updateIssue(id, updates) {
    const issue = await this.getIssue(id)

    if (updates.summary != null) issue.summary = updates.summary
    if (updates.description != null) issue.description = updates.description
    if (updates.status != null) issue.status = updates.status
    if (updates.assignee !== undefined) issue.assignee = updates.assignee
    if (updates.labels != null) issue.labels = updates.labels
    if (updates.priority !== undefined) issue.priority = updates.priority
    if (updates.metadata != null) issue.metadata = { ...issue.metadata, ...updates.metadata }
    issue.updatedAt = new Date().toISOString()

    this._writeJson(path.join(this.issuesDir, `${id}.json`), issue)
    return issue
  }

  // ============================================
  // SPEC MANAGEMENT
  // ============================================

  async createSpec(issueId) {
    const issue = await this.getIssue(issueId)

    const specPath = path.join(this.specsDir, `${issueId}.md`)

    // Don't overwrite an existing spec
    if (fs.existsSync(specPath)) {
      throw this._error(
        'INVALID_STATE',
        `Spec for ${issueId} already exists at ${specPath}`,
        'Use getSpec to retrieve the existing spec'
      )
    }

    // Write stub spec file
    const now = new Date().toISOString().slice(0, 10)
    const content = `---
createdAt: ${now}
issueId: ${issueId}
state: draft
---

# ${issue.summary}

## Requirements

<!-- Describe what needs to be built and why -->

### Introduction

${issue.description}

### Out of scope

<!-- List what this feature will NOT address -->

### Stories

<!-- Add user stories with acceptance criteria:

### 1. Feature name

**Story:** AS A [role], I WANT [feature], SO THAT [benefit]

- **1.1. Acceptance criterion**
  - WHEN [trigger],
  - THEN the system SHALL [action]
-->

## Design

<!-- Describe the technical approach -->

### Overview

<!-- High-level approach and boundaries -->

### Files

#### New

<!-- List new files to create -->

#### Changed

<!-- List existing files to modify -->

### Testing strategy

<!-- Describe how the feature will be tested -->
`

    fs.mkdirSync(this.specsDir, { recursive: true })
    fs.writeFileSync(specPath, content, 'utf8')

    // Persist spec metadata
    const spec = {
      id: issueId,
      issueId,
      filePath: specPath,
      state: 'draft',
      createdAt: new Date().toISOString(),
      approvedAt: null,
      metadata: {}
    }

    // AIDEV-NOTE: spec metadata lives alongside the issue in state/issues/<id>.spec.json
    // to avoid a separate specs/ state directory
    this._writeJson(path.join(this.issuesDir, `${issueId}.spec.json`), spec)
    return spec
  }

  async getSpec(issueId) {
    const metaPath = path.join(this.issuesDir, `${issueId}.spec.json`)
    const spec = this._readJson(metaPath)

    if (!spec) {
      throw this._error(
        'NOT_FOUND',
        `Spec for issue ${issueId} not found`,
        `Run /spec ${issueId} to create one`
      )
    }

    return spec
  }

  async approveSpec(specId) {
    // specId is the issueId in this backend
    const spec = await this.getSpec(specId)

    if (spec.state !== 'draft' && spec.state !== 'rejected') {
      throw this._error(
        'INVALID_TRANSITION',
        `Cannot approve spec in state '${spec.state}'`
      )
    }

    spec.state = 'approved'
    spec.approvedAt = new Date().toISOString()

    // Also update the frontmatter in the spec file
    this._updateSpecFrontmatter(spec.filePath, { state: 'approved' })

    this._writeJson(path.join(this.issuesDir, `${specId}.spec.json`), spec)
    return spec
  }

  async rejectSpec(specId, reason) {
    const spec = await this.getSpec(specId)

    spec.state = 'rejected'
    if (reason) spec.metadata.rejectionReason = reason

    this._updateSpecFrontmatter(spec.filePath, { state: 'rejected' })

    this._writeJson(path.join(this.issuesDir, `${specId}.spec.json`), spec)
    return spec
  }

  /**
   * Update YAML frontmatter fields in a spec markdown file.
   * Only handles simple key: value lines (no nested objects).
   */
  _updateSpecFrontmatter(filePath, updates) {
    if (!fs.existsSync(filePath)) return

    let content = fs.readFileSync(filePath, 'utf8')

    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^(${key}:\\s*).*$`, 'm')
      if (regex.test(content)) {
        content = content.replace(regex, `$1${value}`)
      }
    }

    fs.writeFileSync(filePath, content, 'utf8')
  }

  // ============================================
  // TASK MANAGEMENT
  // ============================================

  _tasksFile(issueId) {
    return path.join(this.tasksDir, issueId, 'tasks.json')
  }

  _loadTasks(issueId) {
    return this._readJson(this._tasksFile(issueId)) || []
  }

  _saveTasks(issueId, tasks) {
    this._writeJson(this._tasksFile(issueId), tasks)
  }

  async createTasks(specId) {
    // specId == issueId in this backend
    const spec = await this.getSpec(specId)

    if (spec.state !== 'approved') {
      throw this._error(
        'INVALID_STATE',
        `Cannot create tasks from spec in state '${spec.state}'. Spec must be approved first.`,
        `Run /spec ${specId} and approve it first`
      )
    }

    // Check if tasks already exist
    const existing = this._loadTasks(specId)
    if (existing.length > 0) {
      throw this._error(
        'INVALID_STATE',
        `Tasks for ${specId} already exist (${existing.length} tasks). Delete them first to regenerate.`
      )
    }

    // Read spec content for context — the actual task decomposition is done
    // by the create-tasks agent (command layer). Here we just create a
    // placeholder phase so the backend has something to work with.
    // The real tasks are appended via updateTask / a separate import flow.
    // AIDEV-NOTE: The AI agent (create-tasks.md) calls this method and then
    // calls updateTask() to push its generated tasks into storage.

    const now = new Date().toISOString()
    const phaseId = this._nextTaskId(specId)

    const phase = {
      id: phaseId,
      description: `Implementation of ${specId}`,
      specId,
      issueId: specId,
      state: 'todo',
      tags: ['impl', 'phase'],
      isPhase: true,
      depends: [],
      createdAt: now,
      modifiedAt: now,
      metadata: {}
    }

    const tasks = [phase]
    this._saveTasks(specId, tasks)
    return tasks
  }

  async getTasks(filter = {}) {
    // If issueId is provided, load that issue's tasks only
    if (filter.issueId) {
      let tasks = this._loadTasks(filter.issueId)
      return this._applyTaskFilters(tasks, filter)
    }

    // Otherwise scan all issues
    let all = []
    if (fs.existsSync(this.tasksDir)) {
      for (const issueId of fs.readdirSync(this.tasksDir)) {
        const tasks = this._loadTasks(issueId)
        all = all.concat(tasks)
      }
    }

    return this._applyTaskFilters(all, filter)
  }

  _applyTaskFilters(tasks, filter) {
    if (filter.specId) {
      tasks = tasks.filter(t => t.specId === filter.specId)
    }
    if (filter.state) {
      tasks = tasks.filter(t => t.state === filter.state)
    }
    if (filter.tags && filter.tags.length > 0) {
      tasks = tasks.filter(t =>
        filter.tags.every(tag => (t.tags || []).includes(tag))
      )
    }
    if (filter.isPhase !== undefined) {
      tasks = tasks.filter(t => t.isPhase === filter.isPhase)
    }
    if (filter.status === 'pending') {
      const pending = ['new', 'todo', 'inprogress', 'review']
      tasks = tasks.filter(t => pending.includes(t.state))
    } else if (filter.status === 'completed') {
      const done = ['approved', 'done']
      tasks = tasks.filter(t => done.includes(t.state))
    }

    const offset = filter.offset || 0
    const limit = filter.limit != null ? filter.limit : tasks.length
    return tasks.slice(offset, offset + limit)
  }

  async getTask(taskId) {
    // taskId format: ISSUE-1-T2 — parse the issue prefix
    const issueId = this._issueIdFromTaskId(taskId)
    const tasks = this._loadTasks(issueId)
    const task = tasks.find(t => t.id === taskId)

    if (!task) {
      throw this._error('NOT_FOUND', `Task ${taskId} not found`)
    }

    return task
  }

  async updateTaskState(taskId, state) {
    const task = await this.getTask(taskId)

    if (!this.isValidTransition(task.state, state)) {
      throw this._error(
        'INVALID_TRANSITION',
        `Cannot transition task ${taskId} from '${task.state}' to '${state}'`
      )
    }

    task.state = state
    task.modifiedAt = new Date().toISOString()

    const issueId = this._issueIdFromTaskId(taskId)
    const tasks = this._loadTasks(issueId)
    const idx = tasks.findIndex(t => t.id === taskId)
    if (idx >= 0) tasks[idx] = task
    this._saveTasks(issueId, tasks)

    return task
  }

  async updateTask(taskId, updates) {
    const task = await this.getTask(taskId)

    if (updates.description != null) task.description = updates.description
    if (updates.tags != null) task.tags = updates.tags
    if (updates.depends != null) task.depends = updates.depends
    if (updates.metadata != null) task.metadata = { ...task.metadata, ...updates.metadata }
    task.modifiedAt = new Date().toISOString()

    const issueId = this._issueIdFromTaskId(taskId)
    const tasks = this._loadTasks(issueId)
    const idx = tasks.findIndex(t => t.id === taskId)
    if (idx >= 0) tasks[idx] = task
    this._saveTasks(issueId, tasks)

    return task
  }

  /**
   * Add a new task to an issue's task list.
   * Used by the create-tasks command after AI generates the task breakdown.
   *
   * @param {string} issueId
   * @param {Object} taskData - Partial task (id auto-assigned if missing)
   * @returns {Object} Created task
   */
  async addTask(issueId, taskData) {
    const tasks = this._loadTasks(issueId)
    const now = new Date().toISOString()

    const task = {
      id: taskData.id || this._nextTaskId(issueId),
      description: taskData.description || '',
      specId: taskData.specId || issueId,
      issueId,
      state: taskData.state || 'todo',
      tags: taskData.tags || [],
      isPhase: taskData.isPhase || false,
      depends: taskData.depends || [],
      createdAt: now,
      modifiedAt: now,
      metadata: taskData.metadata || {}
    }

    tasks.push(task)
    this._saveTasks(issueId, tasks)
    return task
  }

  /**
   * Parse the issue ID out of a task ID.
   * Task IDs look like: ISSUE-1-T3
   */
  _issueIdFromTaskId(taskId) {
    // Match ISSUE-<n> prefix
    const match = taskId.match(/^(ISSUE-\d+)/)
    if (!match) {
      throw this._error('NOT_FOUND', `Cannot determine issue ID from task ID '${taskId}'`)
    }
    return match[1]
  }

  // ============================================
  // STATE MACHINE
  // ============================================

  getWorkStates() {
    return ['new', 'draft', 'todo', 'inprogress', 'review', 'approved', 'rejected', 'done']
  }

  getValidTransitions(from) {
    const map = {
      new:        ['todo', 'draft'],
      draft:      ['approved', 'rejected'],
      todo:       ['inprogress'],
      inprogress: ['review', 'done'],
      review:     ['approved', 'rejected'],
      approved:   ['done'],
      rejected:   ['draft', 'todo'],
      done:       []
    }
    return map[from] || []
  }

  isValidTransition(from, to) {
    return this.getValidTransitions(from).includes(to)
  }
}

// ============================================
// EXPORTS
// ============================================

module.exports = FileBackend
