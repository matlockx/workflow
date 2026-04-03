/**
 * Jira-Taskwarrior Workflow Backend
 * 
 * Implements the WorkflowBackend interface using:
 * - ACLI (Atlassian CLI) for Jira operations
 * - Taskwarrior for task/state management
 * - Bugwarrior for Jira → Taskwarrior sync (optional)
 * 
 * @module backends/jira-taskwarrior
 */

const { exec } = require('child_process')
const { promisify } = require('util')
const fs = require('fs')
const path = require('path')
const os = require('os')

const execAsync = promisify(exec)

// AIDEV-NOTE: shellEscape wraps values in single quotes and escapes internal
// single quotes using the POSIX 'end-quote, escaped-quote, re-quote' trick.
// This is critical for safely passing user-supplied strings (e.g. issue
// summaries) to child_process.exec without shell injection.
function shellEscape(value) {
  if (value === undefined || value === null) {
    return "''"
  }

  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

// ============================================
// JIRA-TASKWARRIOR BACKEND IMPLEMENTATION
// ============================================

class JiraTaskwarriorBackend {
  constructor(config = {}) {
    this.config = {
      // Jira configuration
      jiraSite: config.jiraSite || process.env.JIRA_SITE,
      jiraProject: config.jiraProject || process.env.JIRA_PROJECT,
      jiraEmail: config.jiraEmail || process.env.JIRA_EMAIL,
      
      // Taskwarrior configuration
      taskrcPath: config.taskrcPath || process.env.TASKRC || '~/.taskrc',
      taskDataLocation: config.taskDataLocation || process.env.TASKDATA || '~/.task',
      
      // Spec storage (simple specs/ dir in project root)
      specsDir: config.specsDir || './specs',
      repository: config.repository || 'default',
      
      // Bugwarrior (optional)
      useBugwarrior: config.useBugwarrior !== false,
      bugwarriorConfig: config.bugwarriorConfig || '~/.config/bugwarrior/bugwarrior.toml',
      
      ...config
    }

    this.config.taskrcPath = this._expandHomePath(this.config.taskrcPath)
    this.config.taskDataLocation = this._expandHomePath(this.config.taskDataLocation)
    this.config.specsDir = this._expandHomePath(this.config.specsDir)
    this.config.bugwarriorConfig = this._expandHomePath(this.config.bugwarriorConfig)
    
    // Validate required configuration
    this._validateConfig()
  }
  
  _validateConfig() {
    if (!this.config.jiraSite) {
      throw this._createError(
        'CONFIG_ERROR',
        'Jira site not configured. Set jiraSite in config or JIRA_SITE env var'
      )
    }
    
    if (!this.config.jiraProject) {
      throw this._createError(
        'CONFIG_ERROR',
        'Jira project not configured. Set jiraProject in config or JIRA_PROJECT env var'
      )
    }
  }

  _expandHomePath(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      return filePath
    }

    if (filePath === '~') {
      return process.env.HOME || filePath
    }

    if (filePath.startsWith('~/')) {
      return path.join(process.env.HOME || '~', filePath.slice(2))
    }

    return filePath
  }
  
  // ============================================
  // ACLI WRAPPER (Jira Operations)
  // ============================================
  
  /**
   * Execute ACLI command and return parsed JSON result
   */
  async _acli(args, options = {}) {
    try {
      // Check authentication first
      await this._checkAcliAuth()
      
      const cmd = `acli jira ${args} --json`
      const { stdout, stderr } = await execAsync(cmd, {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        ...options
      })
      
      if (stderr && !options.ignoreStderr) {
        console.warn('ACLI stderr:', stderr)
      }
      
      // Parse JSON output
      try {
        return JSON.parse(stdout)
      } catch (error) {
        // Some commands don't return JSON, return raw stdout
        return { raw: stdout }
      }
    } catch (error) {
      throw this._createError(
        'ACLI_ERROR',
        `ACLI command failed: ${error.message}`,
        'Check if acli is installed and authenticated',
        error
      )
    }
  }
  
  /**
   * Check if ACLI is authenticated
   */
  async _checkAcliAuth() {
    try {
      // AIDEV-NOTE: ACLI v1.3 uses plain-text auth status and different workitem verbs/flags than older wrappers.
      // Keep this check tolerant so the backend works across ACLI variants without forcing repo-wide command rewrites.
      const { stdout } = await execAsync('acli jira auth status')
      const isAuthenticated = stdout.includes('Authenticated')

      if (!isAuthenticated) {
        throw this._createError(
          'AUTH_ERROR',
          'ACLI not authenticated',
          'Run: acli jira auth login --web'
        )
      }
      
      return true
    } catch (error) {
      if (error.code === 'AUTH_ERROR') throw error
      
      throw this._createError(
        'AUTH_ERROR',
        'Failed to check ACLI authentication',
        'Ensure acli is installed: https://developer.atlassian.com/cloud/acli/',
        error
      )
    }
  }

  async _getProject(projectKey = this.config.jiraProject) {
    return this._acli(`project view --key ${shellEscape(projectKey)}`)
  }

  // AIDEV-NOTE: Returns the first unreleased, non-archived version from the
  // project's version list. ACLI uses this as the default fixVersion when
  // creating issues so work lands in the active sprint/release automatically.
  _getDefaultFixVersion(project) {
    const versions = Array.isArray(project?.versions) ? project.versions : []
    return versions.find(version => !version.released && !version.archived) || null
  }
  
  // ============================================
  // TASKWARRIOR WRAPPER (Task/State Management)
  // ============================================
  
  /**
   * Execute Taskwarrior command and return parsed JSON result
   */
  async _task(args, options = {}) {
    try {
      const cmd = `task ${args}`
      const { stdout, _stderr } = await execAsync(cmd, {
        env: {
          ...process.env,
          TASKRC: this.config.taskrcPath,
          TASKDATA: this.config.taskDataLocation
        },
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        ...options
      })
      
      // Taskwarrior writes some output to stderr even on success
      // Only throw if command actually failed
      
      return stdout.trim()
    } catch (error) {
      throw this._createError(
        'TASKWARRIOR_ERROR',
        `Taskwarrior command failed: ${error.message}`,
        'Check if taskwarrior is installed and configured',
        error
      )
    }
  }
  
  /**
   * Execute Taskwarrior export command and parse JSON
   */
  // AIDEV-NOTE: Taskwarrior 3.x emits a JSON array; older 2.x variants emit
  // one JSON object per line with no surrounding brackets.  We detect which
  // format we got by checking whether the output starts with '[' and fall back
  // to the newline-delimited parse path so both versions are supported.
  async _taskExport(filter) {
    try {
      const output = await this._task(`${filter} export`)
      
      if (!output || output.trim() === '') {
        return []
      }

      const trimmed = output.trim()

      if (trimmed.startsWith('[')) {
        const parsed = JSON.parse(trimmed)
        return Array.isArray(parsed) ? parsed : []
      }

      // Older Taskwarrior variants can emit newline-separated JSON objects.
      const lines = trimmed.split('\n').filter(line => line.trim())
      return lines.map(line => JSON.parse(line))
    } catch (error) {
      if (error.code === 'TASKWARRIOR_ERROR') throw error
      
      throw this._createError(
        'PARSE_ERROR',
        `Failed to parse Taskwarrior export: ${error.message}`,
        null,
        error
      )
    }
  }
  
  /**
   * Check Taskwarrior UDA configuration
   */
  async _checkTaskwarriorUDAs() {
    try {
      const output = await this._task('show')
      
      const requiredUDAs = ['jiraid', 'work_state', 'repository']
      const missingUDAs = []
      
      for (const uda of requiredUDAs) {
        if (!output.includes(`uda.${uda}.`)) {
          missingUDAs.push(uda)
        }
      }
      
      if (missingUDAs.length > 0) {
        throw this._createError(
          'CONFIG_ERROR',
          `Missing required Taskwarrior UDAs: ${missingUDAs.join(', ')}`,
          'Add UDAs to .taskrc - see backends/jira-taskwarrior/README.md'
        )
      }
      
      return true
    } catch (error) {
      if (error.code === 'CONFIG_ERROR') throw error
      throw this._createError(
        'TASKWARRIOR_ERROR',
        'Failed to check Taskwarrior configuration',
        null,
        error
      )
    }
  }
  
  /**
   * Update task with dual-field state (status + work_state UDA)
   * CRITICAL: Both fields must ALWAYS be updated together
   */
  async _updateTaskState(uuid, workState, status = null) {
    try {
      // If status provided, use it; otherwise infer from work_state
      const taskStatus = status || this._inferStatusFromWorkState(workState)
      
      // Update work_state UDA
      await this._task(`${uuid} modify work_state:${workState}`)
      
      // Update native status if needed
      if (taskStatus === 'completed') {
        await this._task(`${uuid} done`)
      } else if (taskStatus === 'deleted') {
        await this._task(`${uuid} delete`)
      }
      // For 'pending', no native status change needed (already pending)
      
      return true
    } catch (error) {
      throw this._createError(
        'STATE_UPDATE_ERROR',
        `Failed to update task state: ${error.message}`,
        null,
        error
      )
    }
  }
  
  /**
   * Infer Taskwarrior native status from work_state
   */
  _inferStatusFromWorkState(workState) {
    const mapping = {
      'new': 'pending',
      'draft': 'pending',
      'todo': 'pending',
      'inprogress': 'pending',
      'review': 'pending',
      'approved': 'completed',
      'rejected': 'pending',
      'done': 'completed'
    }
    
    return mapping[workState] || 'pending'
  }
  
  // ============================================
  // ISSUE MANAGEMENT (Jira via ACLI)
  // ============================================
  
  async listIssues(filter = {}) {
    try {
      // Build JQL query from filter
      const jqlParts = [`project = "${this.config.jiraProject}"`]
      
      if (filter.assignee) {
        jqlParts.push(`assignee = "${filter.assignee}"`)
      }
      
      if (filter.status) {
        jqlParts.push(`status = "${filter.status}"`)
      }
      
      if (filter.labels && filter.labels.length > 0) {
        const labelQuery = filter.labels.map(l => `labels = "${l}"`).join(' AND ')
        jqlParts.push(`(${labelQuery})`)
      }
      
      if (filter.search) {
        jqlParts.push(`(summary ~ "${filter.search}" OR description ~ "${filter.search}")`)
      }
      
      const jql = jqlParts.join(' AND ')
      const limit = filter.limit || 50
      const offset = filter.offset || 0
      
      // Execute search via ACLI
      const result = await this._acli(
        `workitem search --jql ${shellEscape(jql)} --limit ${limit + offset}`
      )
      
      // Parse issues from result
      const issues = result.issues || result.workItems || result.values || result || []
      const pagedIssues = Array.isArray(issues) ? issues.slice(offset, offset + limit) : []
      
      return pagedIssues.map(issue => this._normalizeJiraIssue(issue))
    } catch (error) {
      throw this._createError(
        'SEARCH_ERROR',
        `Failed to list issues: ${error.message}`,
        null,
        error
      )
    }
  }
  
  async getIssue(issueId) {
    try {
      const result = await this._acli(`workitem view ${shellEscape(issueId)}`)
      
      if (!result || !result.key) {
        throw this._createError(
          'NOT_FOUND',
          `Issue ${issueId} not found`
        )
      }
      
      return this._normalizeJiraIssue(result)
    } catch (error) {
      if (error.code === 'NOT_FOUND') throw error
      
      throw this._createError(
        'FETCH_ERROR',
        `Failed to get issue ${issueId}: ${error.message}`,
        null,
        error
      )
    }
  }
  
  async createIssue(issueData) {
    try {
      const project = await this._getProject(this.config.jiraProject)
      const adf = issueData.description ? this._markdownToADF(issueData.description) : undefined
      const payload = {
        projectKey: this.config.jiraProject,
        summary: issueData.summary,
        // AIDEV-NOTE: issueType 'epic' maps to Jira type 'Epic'; anything else
        // falls back to 'Story' so callers can pass interface-level type names.
        type: issueData.issueType === 'epic' ? 'Epic'
            : issueData.issueType === 'bug'  ? 'Bug'
            : issueData.type || 'Story'
      }

      if (adf) {
        payload.description = adf
      }

      if (issueData.assignee) {
        payload.assignee = issueData.assignee
      }

      if (issueData.labels && issueData.labels.length > 0) {
        payload.labels = issueData.labels
      }

      const defaultFixVersion = this._getDefaultFixVersion(project)
      if (defaultFixVersion) {
        payload.additionalAttributes = {
          fixVersions: [{ id: defaultFixVersion.id }]
        }
      }

      // AIDEV-NOTE: ACLI does not support large JSON payloads via CLI flags
      // directly.  We serialise the payload to a temp file and pass its path
      // via --from-json instead.  The finally block ensures cleanup even when
      // the ACLI call throws (e.g. auth failure, network error).
      const tempFile = path.join(os.tmpdir(), `opencode-jira-create-${Date.now()}.json`)
      fs.writeFileSync(tempFile, JSON.stringify(payload, null, 2))

      let result
      try {
        result = await this._acli(`workitem create --from-json ${shellEscape(tempFile)}`)
      } finally {
        try {
          fs.unlinkSync(tempFile)
        } catch (error) {
          // Best-effort cleanup only.
        }
      }
      
      return this._normalizeJiraIssue(result)
    } catch (error) {
      throw this._createError(
        'CREATE_ERROR',
        `Failed to create issue: ${error.message}`,
        null,
        error
      )
    }
  }

  async updateIssue(id, updates) {
    try {
      const payload = {}
      if (updates.summary) payload.summary = updates.summary
      if (updates.description) payload.description = this._markdownToADF(updates.description)
      if (updates.assignee) payload.assignee = updates.assignee
      if (updates.labels) payload.labels = updates.labels
      if (updates.priority) payload.priority = { name: updates.priority }
      if (updates.metadata) Object.assign(payload, updates.metadata)

      const tempFile = path.join(os.tmpdir(), `opencode-jira-update-${Date.now()}.json`)
      fs.writeFileSync(tempFile, JSON.stringify(payload, null, 2))

      try {
        await this._acli(`workitem update ${shellEscape(id)} --from-json ${shellEscape(tempFile)}`)
      } finally {
        try { fs.unlinkSync(tempFile) } catch (_) {}
      }

      return this.getIssue(id)
    } catch (error) {
      throw this._createError(
        'UPDATE_ERROR',
        `Failed to update issue ${id}: ${error.message}`,
        null,
        error
      )
    }
  }

  /**
   * Link a child issue to a Jira Epic.
   *
   * For classic Jira projects this sets customfield_10014 (Epic Link) on the
   * child story. For next-gen projects the parent field is used instead.
   * We attempt customfield_10014 first; if ACLI rejects it we fall back to
   * setting the `parent` field.
   *
   * @param {string} issueId - The child issue key (e.g. "PROJ-5")
   * @param {string} epicId  - The Epic issue key (e.g. "PROJ-2")
   * @returns {Object} Normalized child issue
   */
  async linkIssueToEpic(issueId, epicId) {
    // AIDEV-NOTE: Jira classic projects use customfield_10014 (Epic Link).
    // Next-gen / team-managed projects use the `parent` field instead.
    // We try classic first and fall back to next-gen on failure.
    const tempFile = path.join(os.tmpdir(), `opencode-jira-epic-link-${Date.now()}.json`)
    try {
      // Classic project Epic Link
      const payload = { customfield_10014: epicId }
      fs.writeFileSync(tempFile, JSON.stringify(payload, null, 2))
      try {
        await this._acli(`workitem update ${shellEscape(issueId)} --from-json ${shellEscape(tempFile)}`)
      } catch (classicErr) {
        // Fall back to next-gen parent field
        const fallbackPayload = { parent: { key: epicId } }
        fs.writeFileSync(tempFile, JSON.stringify(fallbackPayload, null, 2))
        await this._acli(`workitem update ${shellEscape(issueId)} --from-json ${shellEscape(tempFile)}`)
      }
      return this.getIssue(issueId)
    } catch (error) {
      throw this._createError(
        'LINK_ERROR',
        `Failed to link ${issueId} to Epic ${epicId}: ${error.message}`,
        'Check that the Epic exists and that your Jira project supports Epic Link',
        error
      )
    } finally {
      try { fs.unlinkSync(tempFile) } catch (_) {}
    }
  }
  
  /**
   * Normalize Jira issue to common Issue interface
   */
  _normalizeJiraIssue(jiraIssue) {
    return {
      id: jiraIssue.key,
      summary: jiraIssue.fields?.summary || '',
      description: this._adfToMarkdown(jiraIssue.fields?.description) || '',
      status: jiraIssue.fields?.status?.name || 'Unknown',
      assignee: jiraIssue.fields?.assignee?.displayName || null,
      labels: jiraIssue.fields?.labels || [],
      priority: jiraIssue.fields?.priority?.name || null,
      url: `https://${this.config.jiraSite}/browse/${jiraIssue.key}`,
      metadata: {
        type: jiraIssue.fields?.issuetype?.name,
        created: jiraIssue.fields?.created,
        updated: jiraIssue.fields?.updated,
        reporter: jiraIssue.fields?.reporter?.displayName
      }
    }
  }
  
  /**
   * Convert markdown to Atlassian Document Format (ADF)
   * Simplified conversion - handles basic text and paragraphs
   */
  _markdownToADF(markdown) {
    const lines = markdown.split('\n')
    const content = []
    
    for (const line of lines) {
      if (line.trim() === '') {
        continue
      }
      
      // Simple paragraph
      content.push({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: line
          }
        ]
      })
    }
    
    return {
      version: 1,
      type: 'doc',
      content
    }
  }
  
  /**
   * Convert Atlassian Document Format (ADF) to markdown
   * Simplified conversion - extracts text content
   */
  _adfToMarkdown(adf) {
    if (!adf || !adf.content) {
      return ''
    }
    
    const extractText = (node) => {
      if (node.type === 'text') {
        return node.text
      }
      
      if (node.content && Array.isArray(node.content)) {
        return node.content.map(extractText).join('')
      }
      
      return ''
    }
    
    return adf.content.map(extractText).join('\n\n')
  }
  
  // ============================================
  // TASK MANAGEMENT
  // ============================================
  
  // AIDEV-NOTE: createTasks now accepts an issueId directly (ADR-001 compliance).
  // The old spec pipeline (createSpec → approveSpec → createTasks(specId)) has
  // been removed. Tasks are created directly from the issue.
  async createTasks(issueId) {
    try {
      // Check if tasks already exist
      const existingTasks = await this._taskExport(`jiraid:${issueId} +impl`)
      
      if (existingTasks.length > 0) {
        throw this._createError(
          'ALREADY_EXISTS',
          `Tasks for issue ${issueId} already exist`
        )
      }
      
      // Generate default phases since there is no spec to parse
      const phases = [
        { number: '1', name: 'Implementation' },
        { number: '2', name: 'Testing' }
      ]
      
      const tasks = await this._generateTasksFromPhases(issueId, phases)
      
      return tasks
    } catch (error) {
      if (error.code === 'INVALID_STATE' || error.code === 'ALREADY_EXISTS') throw error
      
      throw this._createError(
        'CREATE_ERROR',
        `Failed to create tasks: ${error.message}`,
        null,
        error
      )
    }
  }
  
  /**
   * Generate tasks from a list of phases
   * Each phase gets a phase task plus 2-3 implementation sub-tasks
   */
  async _generateTasksFromPhases(issueId, phases) {
    const tasks = []
      // Create phase tasks
      for (const phase of phases) {
        const phaseSlug = this._slugify(phase.name)
        const phaseProject = `${issueId}.${phaseSlug}`
        
        // Create phase task
        await this._task(
          `add "Phase ${phase.number}: ${phase.name}" +impl +phase jiraid:${issueId} work_state:todo repository:${this.config.repository} project:${phaseProject}`
        )

        // AIDEV-NOTE: `task add` output does NOT include the UUID of the newly
        // created task (Taskwarrior 3.4 behaviour change from 2.x).  We resolve
        // the UUID by immediately exporting tasks that match the description we
        // just added.  The description is unique within the project+jiraid
        // scope, so the first match is authoritative.
        const phaseTasks = await this._taskExport(`jiraid:${issueId} +impl +phase project:${phaseProject}`)
        const phaseTask = phaseTasks.find(task => task.description === `Phase ${phase.number}: ${phase.name}`)

      if (!phaseTask?.uuid) {
        throw this._createError('PARSE_ERROR', 'Failed to resolve created phase task UUID')
      }

      const phaseUUID = phaseTask.uuid
      
      tasks.push({
        id: phaseTask.uuid,
        title: phaseTask.description,
        description: `Phase ${phase.number}: ${phase.name}`,
        state: phaseTask.work_state,
        issueId: issueId,
        isPhase: true,
        tags: phaseTask.tags || [],
        depends: [],
        createdAt: new Date(phaseTask.entry),
        metadata: {
          taskUUID: phaseTask.uuid,
          project: phaseTask.project,
          phase: phase.number
        }
      })
      
      // Create 2-3 implementation tasks per phase
      const numTasks = 2 + Math.floor(Math.random() * 2) // 2-3 tasks
      
      for (let i = 1; i <= numTasks; i++) {
          await this._task(
            `add "Implement task ${i} for ${phase.name}" +impl jiraid:${issueId} work_state:todo depends:${phaseUUID} repository:${this.config.repository} project:${phaseProject}`
          )

          // AIDEV-NOTE: Same UUID resolution pattern as phase task above —
          // `task add` does not echo the UUID, so we export and match by desc.
          const implTasks = await this._taskExport(`jiraid:${issueId} +impl project:${phaseProject}`)
          const implTask = implTasks.find(task => task.description === `Implement task ${i} for ${phase.name}`)

        if (!implTask?.uuid) {
          throw this._createError('PARSE_ERROR', 'Failed to resolve created implementation task UUID')
        }
        
        tasks.push({
          id: implTask.uuid,
          title: implTask.description,
          description: implTask.description,
          state: implTask.work_state,
          issueId: issueId,
          isPhase: false,
          tags: implTask.tags || [],
          depends: [phaseUUID],
          createdAt: new Date(implTask.entry),
          metadata: {
            taskUUID: implTask.uuid,
            project: implTask.project,
            phase: phase.number
          }
        })
      }
    }
    
    return tasks
  }
  
  async getTasks(filter = {}) {
    try {
      // Build Taskwarrior filter
      // AIDEV-NOTE: specId filter removed — tasks no longer reference a specId
      // (ADR-001: spec stage removed from pipeline).
      const filterParts = ['+impl']
      
      if (filter.issueId) {
        filterParts.push(`jiraid:${filter.issueId}`)
      }
      
      if (filter.state) {
        filterParts.push(`work_state:${filter.state}`)
      }
      
      if (filter.isPhase === true) {
        filterParts.push('+phase')
      } else if (filter.isPhase === false) {
        filterParts.push('-phase')
      }
      
      if (filter.tags && filter.tags.length > 0) {
        filter.tags.forEach(tag => {
          filterParts.push(`+${tag}`)
        })
      }
      
      const taskFilter = filterParts.join(' ')
      const taskData = await this._taskExport(taskFilter)
      
      return taskData.map(task => this._normalizeTaskwarriorTask(task))
    } catch (error) {
      throw this._createError(
        'FETCH_ERROR',
        `Failed to get tasks: ${error.message}`,
        null,
        error
      )
    }
  }
  
  async getTask(taskId) {
    try {
      const tasks = await this._taskExport(`uuid:${taskId}`)
      
      if (tasks.length === 0) {
        throw this._createError(
          'NOT_FOUND',
          `Task ${taskId} not found`
        )
      }
      
      return this._normalizeTaskwarriorTask(tasks[0])
    } catch (error) {
      if (error.code === 'NOT_FOUND') throw error
      
      throw this._createError(
        'FETCH_ERROR',
        `Failed to get task: ${error.message}`,
        null,
        error
      )
    }
  }
  
  async updateTaskState(taskId, state) {
    try {
      // Get current task
      const task = await this.getTask(taskId)
      
      // Validate transition
      if (!this.isValidTransition(task.state, state)) {
        throw this._createError(
          'INVALID_TRANSITION',
          `Cannot transition from ${task.state} to ${state}`
        )
      }
      
      // Update state
      await this._updateTaskState(taskId, state)
      
      // Return updated task
      return this.getTask(taskId)
    } catch (error) {
      if (error.code === 'INVALID_TRANSITION' || error.code === 'NOT_FOUND') throw error
      
      throw this._createError(
        'UPDATE_ERROR',
        `Failed to update task state: ${error.message}`,
        null,
        error
      )
    }
  }
  
  async updateTask(taskId, updates) {
    try {
      // AIDEV-NOTE: getTask is called to validate the task exists before modifying.
      // The returned value is intentionally unused — we only care about the side-effect
      // of throwing NOT_FOUND if the task does not exist.
      const _task = await this.getTask(taskId)
      
      const modifyParts = []
      
      if (updates.description) {
        modifyParts.push(`description:"${updates.description}"`)
      }
      
      if (updates.tags && Array.isArray(updates.tags)) {
        // Remove old tags, add new ones
        for (const tag of updates.tags) {
          modifyParts.push(`+${tag}`)
        }
      }
      
      if (modifyParts.length > 0) {
        await this._task(`${taskId} modify ${modifyParts.join(' ')}`)
      }
      
      // Return updated task
      return this.getTask(taskId)
    } catch (error) {
      throw this._createError(
        'UPDATE_ERROR',
        `Failed to update task: ${error.message}`,
        null,
        error
      )
    }
  }
  
  /**
   * Normalize Taskwarrior task to common Task interface
   */
  _normalizeTaskwarriorTask(taskData) {
    return {
      id: taskData.uuid,
      title: taskData.description,
      description: taskData.description,
      state: taskData.work_state || 'todo',
      issueId: taskData.jiraid,
      isPhase: taskData.tags && taskData.tags.includes('phase'),
      tags: taskData.tags || [],
      depends: taskData.depends || [],
      createdAt: new Date(taskData.entry),
      modifiedAt: taskData.modified ? new Date(taskData.modified) : null,
      metadata: {
        taskUUID: taskData.uuid,
        project: taskData.project,
        repository: taskData.repository,
        status: taskData.status,
        urgency: taskData.urgency
      }
    }
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
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50)
  }
  
}

module.exports = JiraTaskwarriorBackend
