/**
 * Beads Workflow Backend
 *
 * Implements the WorkflowBackend interface using the `bd` CLI.
 * This first implementation keeps state mapping conservative and uses
 * metadata to preserve OpenCode-specific workflow meaning where Beads
 * has no direct native equivalent.
 *
 * @module backends/beads
 */

const { promisify } = require('util')
const { execFile } = require('child_process')
const fs = require('fs').promises
const path = require('path')

const execFileAsync = promisify(execFile)

class BeadsBackend {
  constructor(config = {}) {
    const projectRoot = config.workspaceDir || process.cwd()
    this.config = {
      workspaceDir: projectRoot,
      beadsDir: config.beadsDir || process.env.BEADS_DIR,
      homeDir: config.homeDir || process.env.HOME,
      repository: config.repository || path.basename(projectRoot),
      defaultAssignee: config.defaultAssignee,
      ...config
    }

    this._validateConfig()
  }

  _validateConfig() {
    if (!this.config.workspaceDir) {
      throw this._createError('VALIDATION_FAILED', 'Beads workspaceDir is required')
    }
  }

  async _bd(args, options = {}) {
    try {
      const env = {
        ...process.env,
        ...(this.config.homeDir ? { HOME: this.config.homeDir } : {}),
        ...(this.config.beadsDir ? { BEADS_DIR: this.config.beadsDir } : {})
      }

      const finalArgs = [...args]
      if (options.json !== false && !finalArgs.includes('--json')) {
        finalArgs.push('--json')
      }

      const { stdout, stderr } = await execFileAsync('bd', finalArgs, {
        cwd: options.cwd || this.config.workspaceDir,
        env,
        maxBuffer: 10 * 1024 * 1024
      })

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim()
      }
    } catch (error) {
      // AIDEV-NOTE: Classify "not found" errors from bd CLI output so callers
      // receive NOT_FOUND instead of BACKEND_UNAVAILABLE. The bd CLI writes
      // "no issue found matching" to stderr/message when the item doesn't exist.
      const msg = (error.message || '').toLowerCase()
      if (msg.includes('no issue found matching') || msg.includes('no beads item found')) {
        throw this._createError(
          'NOT_FOUND',
          `Beads item not found: ${error.message}`,
          null,
          error
        )
      }
      throw this._createError(
        'BACKEND_UNAVAILABLE',
        `Beads command failed: ${error.message}`,
        'Ensure bd is installed and the Beads workspace is initialized',
        error
      )
    }
  }

  async _bdJson(args, options = {}) {
    const { stdout } = await this._bd(args, options)

    if (!stdout) {
      return null
    }

    try {
      return JSON.parse(stdout)
    } catch (error) {
      throw this._createError(
        'BACKEND_UNAVAILABLE',
        `Failed to parse Beads JSON output: ${error.message}`,
        null,
        error
      )
    }
  }

  _createError(code, message, recovery, originalError) {
    const error = new Error(message)
    error.code = code
    error.recovery = recovery
    error.originalError = originalError
    return error
  }

  _normalizeIssue(beadsIssue) {
    if (!beadsIssue) return null

    return {
      id: beadsIssue.id,
      summary: beadsIssue.title || '',
      description: beadsIssue.description || '',
      status: beadsIssue.status || 'open',
      assignee: beadsIssue.assignee,
      labels: beadsIssue.labels || [],
      priority: beadsIssue.priority !== undefined ? String(beadsIssue.priority) : undefined,
      url: undefined,
      metadata: {
        issueType: beadsIssue.issue_type,
        parent: beadsIssue.parent,
        dependencyCount: beadsIssue.dependency_count,
        dependentCount: beadsIssue.dependent_count,
        commentCount: beadsIssue.comment_count,
        beadsMetadata: beadsIssue.metadata || {},
        raw: beadsIssue
      }
    }
  }

  _normalizeTask(beadsIssue) {
    if (!beadsIssue) return null

    const beadsMetadata = beadsIssue.metadata || {}
    const mappedState = this._mapBeadsStatusToWorkState(
      beadsIssue.status,
      beadsMetadata.opencode_state
    )

    return {
      id: beadsIssue.id,
      description: beadsIssue.title || '',
      issueId: beadsMetadata.issue_id || '',
      state: mappedState,
      tags: beadsIssue.labels || [],
      isPhase: beadsMetadata.opencode_kind === 'phase',
      depends: Array.isArray(beadsMetadata.depends) ? beadsMetadata.depends : [],
      createdAt: beadsIssue.created_at ? new Date(beadsIssue.created_at) : new Date(),
      modifiedAt: beadsIssue.updated_at ? new Date(beadsIssue.updated_at) : new Date(),
      metadata: {
        beadsStatus: beadsIssue.status,
        parent: beadsIssue.parent,
        closeReason: beadsIssue.close_reason,
        beadsMetadata,
        raw: beadsIssue
      }
    }
  }

  _mapBeadsStatusToWorkState(status, explicitState) {
    if (explicitState) return explicitState

    switch (status) {
      case 'open':
        return 'todo'
      case 'in_progress':
      case 'hooked':
        return 'inprogress'
      case 'closed':
        return 'done'
      case 'blocked':
      case 'deferred':
      case 'pinned':
      default:
        return 'todo'
    }
  }

  _mapWorkStateToBeadsStatus(state) {
    switch (state) {
      case 'new':
      case 'draft':
      case 'todo':
      case 'review':
      case 'rejected':
      case 'approved':
        return 'open'
      case 'inprogress':
        return 'in_progress'
      case 'done':
        return 'closed'
      default:
        return 'open'
    }
  }

  _slugify(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50)
  }

  async _ensureWorkspace() {
    try {
      await fs.access(path.join(this.config.workspaceDir, '.beads'))
      await fs.access(path.join(this.config.workspaceDir, '.beads', 'metadata.json'))
    } catch (error) {
      throw this._createError(
        'BACKEND_UNAVAILABLE',
        'Beads workspace is not initialized in workspaceDir',
        'Run `bd init` in the configured Beads workspace before using this backend',
        error
      )
    }
  }

  async listIssues(filter = {}) {
    await this._ensureWorkspace()

    const args = ['list']
    if (filter.limit !== undefined) args.push('--limit', String(filter.limit))
    if (filter.status) args.push('--status', filter.status)
    if (filter.assignee) args.push('--assignee', filter.assignee)
    if (filter.search) args.push('--title', filter.search)
    if (filter.labels && filter.labels.length > 0) {
      for (const label of filter.labels) {
        args.push('--label', label)
      }
    }
    args.push('--all')

    const result = await this._bdJson(args)
    return Array.isArray(result) ? result.map(issue => this._normalizeIssue(issue)) : []
  }

  async getIssue(id) {
    await this._ensureWorkspace()
    const result = await this._bdJson(['show', id])
    const issue = Array.isArray(result) ? result[0] : result
    if (!issue) {
      throw this._createError('NOT_FOUND', `Issue ${id} not found`)
    }
    return this._normalizeIssue(issue)
  }

  async createIssue(data) {
    await this._ensureWorkspace()

    if (!data.summary) {
      throw this._createError('VALIDATION_FAILED', 'Issue summary is required')
    }
    if (!data.description) {
      throw this._createError('VALIDATION_FAILED', 'Issue description is required')
    }

    const args = [
      'create',
      data.summary,
      '--description', data.description,
      '--type', data.issueType || 'task'
    ]

    if (data.priority !== undefined) args.push('--priority', String(data.priority))
    if (data.assignee) args.push('--assignee', data.assignee)
    if (data.labels && data.labels.length > 0) args.push('--labels', data.labels.join(','))
    if (data.metadata) args.push('--metadata', JSON.stringify(data.metadata))

    const result = await this._bdJson(args)
    const issue = Array.isArray(result) ? result[0] : result
    return this._normalizeIssue(issue)
  }

  async updateIssue(id, updates) {
    await this._ensureWorkspace()

    const args = ['update', id]
    if (updates.summary) args.push('--title', updates.summary)
    if (updates.description) args.push('--description', updates.description)
    if (updates.status) args.push('--status', updates.status)
    if (updates.assignee !== undefined) args.push('--assignee', updates.assignee || '')
    if (updates.priority !== undefined) args.push('--priority', String(updates.priority))
    if (updates.labels) args.push('--set-labels', updates.labels.join(','))
    if (updates.metadata) args.push('--metadata', JSON.stringify(updates.metadata))

    const result = await this._bdJson(args)
    const issue = Array.isArray(result) ? result[0] : result
    return this._normalizeIssue(issue)
  }

  // AIDEV-NOTE: createTasks now accepts an issueId directly (ADR-001 compliance).
  // The old spec-based pipeline (createSpec → approveSpec → createTasks(specId))
  // has been removed. Tasks are created directly from the issue.
  async createTasks(issueId) {
    await this._ensureWorkspace()
    // AIDEV-NOTE: getIssue validates the issue exists (throws NOT_FOUND if absent).
    // The returned value is intentionally unused here.
    const _issue = await this.getIssue(issueId)

    const created = []
    const phase = await this.createIssue({
      summary: `Phase 1: ${issueId}`,
      description: `Implementation phase for ${issueId}`,
      issueType: 'task',
      labels: ['impl', 'phase'],
      metadata: {
        opencode_kind: 'phase',
        opencode_state: 'todo',
        issue_id: issueId,
        depends: []
      }
    })
    created.push(this._normalizeTask({
      ...phase.metadata.raw,
      id: phase.id,
      title: phase.summary,
      description: phase.description,
      status: 'open',
      labels: phase.labels,
      metadata: phase.metadata.beadsMetadata
    }))

    for (const title of ['Setup and preparation', 'Core implementation', 'Write tests']) {
      const task = await this.createIssue({
        summary: title,
        description: `${title} for ${issueId}`,
        issueType: 'task',
        labels: ['impl'],
        metadata: {
          opencode_kind: 'task',
          opencode_state: 'todo',
          issue_id: issueId,
          depends: [phase.id]
        }
      })

      await this._bd(['dep', 'add', task.id, phase.id], { json: false })

      created.push(this._normalizeTask({
        ...task.metadata.raw,
        id: task.id,
        title: task.summary,
        description: task.description,
        status: 'open',
        labels: task.labels,
        metadata: task.metadata.beadsMetadata
      }))
    }

    return created.filter(Boolean)
  }

  async getTasks(filter = {}) {
    await this._ensureWorkspace()

    const args = ['list', '--all']
    if (filter.limit !== undefined) args.push('--limit', String(filter.limit))
    if (filter.tags && filter.tags.length > 0) {
      for (const tag of filter.tags) {
        args.push('--label', tag)
      }
    }
    // AIDEV-NOTE: issueId is stored in JSON metadata (not a native column),
    // so we filter in memory. specId filtering is removed — tasks no longer
    // reference a specId (ADR-001: spec stage removed from pipeline).
    const result = await this._bdJson(args)
    let tasks = Array.isArray(result) ? result.map(issue => this._normalizeTask(issue)) : []

    if (filter.issueId) tasks = tasks.filter(task => task.issueId === filter.issueId)
    if (filter.state) tasks = tasks.filter(task => task.state === filter.state)
    if (filter.isPhase !== undefined) tasks = tasks.filter(task => task.isPhase === filter.isPhase)

    return tasks
  }

  async getTask(taskId) {
    await this._ensureWorkspace()
    const result = await this._bdJson(['show', taskId])
    const task = Array.isArray(result) ? result[0] : result
    if (!task) {
      throw this._createError('NOT_FOUND', `Task ${taskId} not found`)
    }
    return this._normalizeTask(task)
  }

  async updateTaskState(taskId, state) {
    await this._ensureWorkspace()
    const task = await this.getTask(taskId)

    if (!this.isValidTransition(task.state, state)) {
      throw this._createError('INVALID_TRANSITION', `Cannot transition from ${task.state} to ${state}`)
    }

    const beadsStatus = this._mapWorkStateToBeadsStatus(state)
    let result

    if (beadsStatus === 'closed') {
      result = await this._bdJson(['close', taskId, '--reason', `state:${state}`])
    } else {
      result = await this._bdJson([
        'update',
        taskId,
        '--status', beadsStatus,
        '--metadata', JSON.stringify({
          ...(task.metadata?.beadsMetadata || {}),
          opencode_state: state
        })
      ])
    }

    const updated = Array.isArray(result) ? result[0] : result
    return this._normalizeTask(updated)
  }

  async updateTask(taskId, updates) {
    await this._ensureWorkspace()
    const existing = await this.getTask(taskId)
    const mergedMetadata = {
      ...(existing.metadata?.beadsMetadata || {}),
      ...(updates.metadata || {})
    }

    const args = ['update', taskId]
    if (updates.description) args.push('--title', updates.description)
    if (updates.tags) args.push('--set-labels', updates.tags.join(','))
    if (updates.metadata) args.push('--metadata', JSON.stringify(mergedMetadata))

    const result = await this._bdJson(args)
    const updated = Array.isArray(result) ? result[0] : result
    return this._normalizeTask(updated)
  }

  async linkIssueToEpic(issueId, epicId) {
    // AIDEV-NOTE: Beads has no native Epic concept; Epic linking is metadata-only,
    // consistent with the file backend. Child gets metadata.epicId; Epic gets
    // metadata.childIssueIds updated. Both updates are best-effort.
    await this._ensureWorkspace()

    const child = await this.updateIssue(issueId, {
      metadata: { epicId }
    })

    // Best-effort: update Epic's childIssueIds list
    try {
      const epic = await this.getIssue(epicId)
      const existing = epic.metadata?.childIssueIds || []
      const childIssueIds = [...new Set([...existing, issueId])]
      await this.updateIssue(epicId, { metadata: { childIssueIds } })
    } catch (err) {
      // Non-fatal: Epic may not exist or update may fail
    }

    return child
  }

  getWorkStates() {
    return ['new', 'draft', 'todo', 'inprogress', 'review', 'approved', 'rejected', 'done']
  }

  getValidTransitions(from) {
    const transitions = {
      new: ['draft', 'todo'],
      draft: ['approved', 'rejected'],
      todo: ['inprogress'],
      inprogress: ['review', 'done'],
      review: ['approved', 'rejected', 'done'],
      approved: ['done'],
      rejected: ['draft', 'todo'],
      done: []
    }
    return transitions[from] || []
  }

  isValidTransition(from, to) {
    return this.getValidTransitions(from).includes(to)
  }
}

module.exports = BeadsBackend
