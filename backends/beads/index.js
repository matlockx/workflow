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
      specsDir: config.specsDir || path.join(projectRoot, 'specs'),
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
        specId: beadsIssue.spec_id,
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
      beadsMetadata.opencode_state,
      beadsMetadata.opencode_kind === 'spec'
    )

    return {
      id: beadsIssue.id,
      description: beadsIssue.title || '',
      specId: beadsIssue.spec_id || beadsMetadata.spec_id || '',
      issueId: beadsMetadata.issue_id || '',
      state: mappedState,
      tags: beadsIssue.labels || [],
      isPhase: beadsMetadata.opencode_kind === 'phase',
      depends: Array.isArray(beadsMetadata.depends) ? beadsMetadata.depends : [],
      createdAt: beadsIssue.created_at ? new Date(beadsIssue.created_at) : new Date(),
      modifiedAt: beadsIssue.updated_at ? new Date(beadsIssue.updated_at) : new Date(),
      metadata: {
        beadsStatus: beadsIssue.status,
        specId: beadsIssue.spec_id,
        parent: beadsIssue.parent,
        closeReason: beadsIssue.close_reason,
        beadsMetadata,
        raw: beadsIssue
      }
    }
  }

  _mapBeadsStatusToWorkState(status, explicitState, isSpec = false) {
    if (explicitState) return explicitState

    if (isSpec) {
      if (status === 'closed') return 'approved'
      return 'draft'
    }

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

  _mapWorkStateToBeadsStatus(state, isSpec = false) {
    if (isSpec) {
      return state === 'approved' ? 'closed' : 'open'
    }

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

  _buildSpecPath(issue) {
    const fileName = `${issue.id}__${this._slugify(issue.summary)}.md`
    return path.join(this.config.specsDir, fileName)
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

  async createSpec(issueId) {
    await this._ensureWorkspace()
    const issue = await this.getIssue(issueId)

    const specPath = this._buildSpecPath(issue)
    await fs.mkdir(path.dirname(specPath), { recursive: true })

    const createdAt = new Date()
    const content = `---
issueId: ${issue.id}
createdAt: ${createdAt.toISOString()}
work_state: draft
---

# ${issue.summary}

## Requirements

${issue.description || '(Fill in requirements)'}

## Design

(Fill in design)
`

    await fs.writeFile(specPath, content, 'utf8')

    const specIssue = await this.createIssue({
      summary: `SPEC: ${issue.id} ${issue.summary}`,
      description: `Spec tracking issue for ${issue.id}`,
      issueType: 'task',
      labels: ['spec'],
      metadata: {
        opencode_kind: 'spec',
        opencode_state: 'draft',
        issue_id: issue.id,
        spec_path: specPath
      }
    })

    return {
      id: specIssue.id,
      issueId: issue.id,
      filePath: specPath,
      state: 'draft',
      createdAt,
      metadata: {
        trackingIssueId: specIssue.id,
        beadsMetadata: specIssue.metadata
      }
    }
  }

  async getSpec(issueId) {
    await this._ensureWorkspace()
    const issues = await this.listIssues({ labels: ['spec'] })
    const specIssue = issues.find(issue => issue.metadata?.beadsMetadata?.issue_id === issueId)

    if (!specIssue) {
      throw this._createError('NOT_FOUND', `Spec for issue ${issueId} not found`)
    }

    const state = this._mapBeadsStatusToWorkState(
      specIssue.status,
      specIssue.metadata?.beadsMetadata?.opencode_state,
      true
    )

    return {
      id: specIssue.id,
      issueId,
      filePath: specIssue.metadata?.beadsMetadata?.spec_path,
      state: state === 'approved' ? 'approved' : state === 'rejected' ? 'rejected' : 'draft',
      createdAt: specIssue.metadata?.raw?.created_at
        ? new Date(specIssue.metadata.raw.created_at)
        : new Date(),
      approvedAt: specIssue.metadata?.raw?.closed_at
        ? new Date(specIssue.metadata.raw.closed_at)
        : undefined,
      metadata: {
        trackingIssueId: specIssue.id,
        beadsMetadata: specIssue.metadata?.beadsMetadata || {}
      }
    }
  }

  async approveSpec(specId) {
    await this._ensureWorkspace()
    const existing = await this.getTask(specId)

    // AIDEV-NOTE: Validate the current state before approving. The beads
    // backend stores opencode_state in metadata; check that explicitly.
    const currentState = existing.metadata?.beadsMetadata?.opencode_state || existing.state
    if (currentState === 'approved') {
      throw this._createError(
        'INVALID_TRANSITION',
        `Cannot approve spec in state ${currentState}`
      )
    }

    const updated = await this._bdJson([
      'update',
      specId,
      '--metadata',
      JSON.stringify({
        ...(existing.metadata?.beadsMetadata || {}),
        opencode_state: 'approved'
      })
    ])
    await this._bdJson(['close', specId, '--reason', 'spec approved'])

    const issue = Array.isArray(updated) ? updated[0] : updated
    const refreshed = await this.getSpec(
      issue.metadata?.issue_id ||
      issue.metadata?.beadsMetadata?.issue_id ||
      existing.issueId
    )
    return refreshed
  }

  async rejectSpec(specId, reason) {
    await this._ensureWorkspace()
    const existing = await this.getTask(specId)
    const result = await this._bdJson([
      'update',
      specId,
      '--status', 'open',
      '--metadata',
      JSON.stringify({
        ...(existing.metadata?.beadsMetadata || {}),
        opencode_state: 'rejected',
        rejection_reason: reason || 'Rejected'
      })
    ])
    const issue = Array.isArray(result) ? result[0] : result
    return {
      id: issue.id,
      issueId: issue.metadata?.issue_id || existing.issueId || '',
      filePath: issue.metadata?.spec_path || existing.metadata?.beadsMetadata?.spec_path,
      state: 'rejected',
      createdAt: issue.created_at ? new Date(issue.created_at) : new Date(),
      metadata: { trackingIssueId: issue.id, beadsMetadata: issue.metadata || {} }
    }
  }

  async createTasks(specId) {
    await this._ensureWorkspace()
    const spec = await this.getTask(specId).catch(() => null)
    const specIssueId = spec?.metadata?.beadsMetadata?.issue_id

    if (!specIssueId) {
      throw this._createError('INVALID_STATE', 'Spec issue not found or not mappable for task creation')
    }

    // AIDEV-NOTE: Check spec is approved before creating tasks, matching the
    // interface contract (throws INVALID_STATE if spec not in approved state).
    const specState = spec?.metadata?.beadsMetadata?.opencode_state || spec?.state
    if (specState !== 'approved') {
      throw this._createError(
        'INVALID_STATE',
        `Cannot create tasks from spec in state '${specState}'. Spec must be approved first.`
      )
    }

    const created = []
    const phase = await this.createIssue({
      summary: `Phase 1: ${specIssueId}`,
      description: `Implementation phase for ${specIssueId}`,
      issueType: 'task',
      labels: ['impl', 'phase'],
      metadata: {
        opencode_kind: 'phase',
        opencode_state: 'todo',
        issue_id: specIssueId,
        spec_id: specId,
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
      const issue = await this.createIssue({
        summary: title,
        description: `${title} for ${specIssueId}`,
        issueType: 'task',
        labels: ['impl'],
        metadata: {
          opencode_kind: 'task',
          opencode_state: 'todo',
          issue_id: specIssueId,
          spec_id: specId,
          depends: [phase.id]
        }
      })

      await this._bd(['dep', 'add', issue.id, phase.id], { json: false })

      created.push(this._normalizeTask({
        ...issue.metadata.raw,
        id: issue.id,
        title: issue.summary,
        description: issue.description,
        status: 'open',
        labels: issue.labels,
        metadata: issue.metadata.beadsMetadata
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
    // AIDEV-NOTE: specId is stored in JSON metadata (not native spec_id field),
    // so we filter in memory rather than using --spec which applies to the native
    // spec_id column. Same pattern as issueId filtering below.

    const result = await this._bdJson(args)
    let tasks = Array.isArray(result) ? result.map(issue => this._normalizeTask(issue)) : []

    if (filter.specId) tasks = tasks.filter(task => task.specId === filter.specId)
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
