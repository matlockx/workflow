/**
 * Workflow State
 *
 * Provides persistence helpers for the /feature orchestration system.
 * Stores active work items and their stage/substage progress in
 * `.agent/state/workflow.json` inside the target project.
 *
 * Stage lifecycle:
 *   spec   (substages: drafting → requirements-review → design-review → approved)
 *   tasks  (substages: pending → created)
 *   implement (substages: in-phase → phase-review → phase-approved)
 *   review
 *   done
 *
 * @module lib/workflow-state
 */

// AIDEV-NOTE: This module is intentionally dependency-free. Use only Node.js
// built-ins (fs, path). It stores state alongside the file backend state but
// is backend-agnostic — it tracks the /feature command's own progress, not
// the backend's task states.

const fs = require('fs')
const path = require('path')

// ============================================
// CONSTANTS
// ============================================

const STAGES = ['spec', 'tasks', 'implement', 'review', 'done']

const SUBSTAGES = {
  spec: ['drafting', 'requirements-review', 'design-review', 'approved'],
  tasks: ['pending', 'created'],
  implement: ['in-phase', 'phase-review', 'phase-approved'],
  review: ['pending', 'done'],
  done: ['done']
}

// ============================================
// FILE HELPERS
// ============================================

/**
 * Get the path to workflow.json for the current project.
 * @param {string} [projectRoot] - Override for project root (default: cwd)
 * @returns {string}
 */
function workflowFilePath(projectRoot) {
  const root = projectRoot || process.cwd()
  return path.join(root, '.agent', 'state', 'workflow.json')
}

/**
 * Read and parse workflow.json. Returns empty state if missing.
 * @param {string} [projectRoot]
 * @returns {{ activeItems: WorkItem[], history: WorkItem[] }}
 */
function loadWorkflowState(projectRoot) {
  const filePath = workflowFilePath(projectRoot)
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { activeItems: [], history: [] }
    }
    throw err
  }
}

/**
 * Write workflow state to disk atomically (write-then-rename).
 * @param {{ activeItems: WorkItem[], history: WorkItem[] }} state
 * @param {string} [projectRoot]
 */
function saveWorkflowState(state, projectRoot) {
  const filePath = workflowFilePath(projectRoot)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, filePath)
}

// ============================================
// WORK ITEM CRUD
// ============================================

/**
 * Create a new work item and persist it.
 *
 * @param {{ issueId: string, type: 'feature'|'bug', title: string }} opts
 * @param {string} [projectRoot]
 * @returns {WorkItem}
 */
function createWorkItem({ issueId, type = 'feature', title }, projectRoot) {
  if (!issueId) throw new Error('issueId is required')
  if (!title) throw new Error('title is required')

  const state = loadWorkflowState(projectRoot)

  // Guard against duplicates
  if (state.activeItems.find(i => i.issueId === issueId)) {
    throw new Error(
      `Work item for ${issueId} already exists. Use /resume ${issueId} to continue.`
    )
  }

  const now = new Date().toISOString()
  const item = {
    issueId,
    type,
    title,
    stage: 'spec',
    substage: 'drafting',
    phase: null,
    taskIndex: 0,
    skipped: [],
    startedAt: now,
    lastUpdatedAt: now,
    completedAt: null
  }

  state.activeItems.push(item)
  saveWorkflowState(state, projectRoot)
  return item
}

/**
 * Retrieve a single active work item by issueId.
 *
 * @param {string} issueId
 * @param {string} [projectRoot]
 * @returns {WorkItem|null}
 */
function getActiveItem(issueId, projectRoot) {
  const state = loadWorkflowState(projectRoot)
  return state.activeItems.find(i => i.issueId === issueId) || null
}

/**
 * Retrieve all active work items.
 *
 * @param {string} [projectRoot]
 * @returns {WorkItem[]}
 */
function getAllActiveItems(projectRoot) {
  return loadWorkflowState(projectRoot).activeItems
}

/**
 * Update arbitrary fields on a work item and persist.
 *
 * @param {string} issueId
 * @param {Partial<WorkItem>} updates
 * @param {string} [projectRoot]
 * @returns {WorkItem}
 */
function updateWorkItem(issueId, updates, projectRoot) {
  const state = loadWorkflowState(projectRoot)
  const idx = state.activeItems.findIndex(i => i.issueId === issueId)

  if (idx === -1) {
    throw new Error(`No active work item for ${issueId}`)
  }

  state.activeItems[idx] = {
    ...state.activeItems[idx],
    ...updates,
    issueId, // never overwrite key
    lastUpdatedAt: new Date().toISOString()
  }

  saveWorkflowState(state, projectRoot)
  return state.activeItems[idx]
}

// ============================================
// STAGE TRANSITIONS
// ============================================

/**
 * Advance a work item to a new stage (and optional substage).
 * Validates that the target stage is reachable from the current one.
 *
 * @param {string} issueId
 * @param {string} stage   - Target stage
 * @param {string} [substage] - Target substage (defaults to first substage of stage)
 * @param {string} [projectRoot]
 * @returns {WorkItem}
 */
function updateStage(issueId, stage, substage, projectRoot) {
  if (!STAGES.includes(stage)) {
    throw new Error(`Unknown stage '${stage}'. Valid stages: ${STAGES.join(', ')}`)
  }

  const item = getActiveItem(issueId, projectRoot)
  if (!item) {
    throw new Error(`No active work item for ${issueId}`)
  }

  const currentIdx = STAGES.indexOf(item.stage)
  const targetIdx = STAGES.indexOf(stage)

  // Allow forward movement or same stage (substage change)
  if (targetIdx < currentIdx) {
    throw new Error(
      `Cannot move ${issueId} from stage '${item.stage}' back to '${stage}'`
    )
  }

  const validSubstages = SUBSTAGES[stage] || []
  const resolvedSubstage = substage || validSubstages[0] || null

  if (resolvedSubstage && !validSubstages.includes(resolvedSubstage)) {
    throw new Error(
      `Unknown substage '${resolvedSubstage}' for stage '${stage}'. ` +
      `Valid: ${validSubstages.join(', ')}`
    )
  }

  return updateWorkItem(issueId, { stage, substage: resolvedSubstage }, projectRoot)
}

/**
 * Advance a work item within its current stage to the next substage.
 * If already at the last substage, advances to the next stage.
 *
 * @param {string} issueId
 * @param {string} [projectRoot]
 * @returns {WorkItem}
 */
function advanceSubstage(issueId, projectRoot) {
  const item = getActiveItem(issueId, projectRoot)
  if (!item) throw new Error(`No active work item for ${issueId}`)

  const substages = SUBSTAGES[item.stage] || []
  const currentSubIdx = substages.indexOf(item.substage)

  if (currentSubIdx < substages.length - 1) {
    // Move to next substage within same stage
    const nextSubstage = substages[currentSubIdx + 1]
    return updateWorkItem(issueId, { substage: nextSubstage }, projectRoot)
  } else {
    // Advance to next stage
    const stageIdx = STAGES.indexOf(item.stage)
    if (stageIdx < STAGES.length - 1) {
      const nextStage = STAGES[stageIdx + 1]
      return updateStage(issueId, nextStage, null, projectRoot)
    }
    // Already at done
    return item
  }
}

// ============================================
// SKIP TRACKING
// ============================================

/**
 * Record a skipped step with an optional reason.
 *
 * @param {string} issueId
 * @param {string} step    - Human-readable step name
 * @param {string} [reason]
 * @param {string} [projectRoot]
 * @returns {WorkItem}
 */
function recordSkip(issueId, step, reason, projectRoot) {
  const item = getActiveItem(issueId, projectRoot)
  if (!item) throw new Error(`No active work item for ${issueId}`)

  const skipped = [
    ...(item.skipped || []),
    {
      step,
      reason: reason || null,
      skippedAt: new Date().toISOString(),
      stage: item.stage,
      substage: item.substage
    }
  ]

  return updateWorkItem(issueId, { skipped }, projectRoot)
}

// ============================================
// COMPLETION
// ============================================

/**
 * Mark a work item as done and move it to history.
 *
 * @param {string} issueId
 * @param {string} [projectRoot]
 * @returns {WorkItem} The completed item
 */
function completeWorkItem(issueId, projectRoot) {
  const state = loadWorkflowState(projectRoot)
  const idx = state.activeItems.findIndex(i => i.issueId === issueId)

  if (idx === -1) {
    throw new Error(`No active work item for ${issueId}`)
  }

  const item = {
    ...state.activeItems[idx],
    stage: 'done',
    substage: 'done',
    completedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString()
  }

  state.activeItems.splice(idx, 1)
  state.history = state.history || []
  state.history.push(item)

  saveWorkflowState(state, projectRoot)
  return item
}

// ============================================
// NEXT STEP RESOLUTION
// ============================================

/**
 * Determine the human-readable label for the next action to take.
 * Used to display progress to the user.
 *
 * @param {WorkItem} item
 * @returns {{ label: string, hint: string }}
 */
function getNextStep(item) {
  const { stage, substage } = item

  const steps = {
    spec: {
      'drafting':             { label: 'Draft spec',               hint: 'Write requirements and design sections' },
      'requirements-review':  { label: 'Review requirements',      hint: 'Confirm requirements are accurate and complete' },
      'design-review':        { label: 'Review design',            hint: 'Confirm the technical design is sound' },
      'approved':             { label: 'Spec approved',            hint: 'Ready to create implementation tasks' }
    },
    tasks: {
      'pending':  { label: 'Create tasks',    hint: 'Break down spec into implementation tasks' },
      'created':  { label: 'Tasks created',   hint: 'Ready to begin implementation' }
    },
    implement: {
      'in-phase':       { label: 'Implement tasks',     hint: 'Work through the current phase tasks' },
      'phase-review':   { label: 'Phase review',        hint: 'Run tests and review code before approving phase' },
      'phase-approved': { label: 'Phase approved',      hint: 'Advance to next phase or finish implementation' }
    },
    review: {
      'pending': { label: 'Final review',  hint: 'Create PR and complete code review' },
      'done':    { label: 'Review done',   hint: 'Ready to close the issue' }
    },
    done: {
      'done': { label: 'Done', hint: 'Work item is complete' }
    }
  }

  return (steps[stage] && steps[stage][substage]) ||
    { label: `${stage}/${substage}`, hint: 'Continue work' }
}

// ============================================
// STATUS FORMATTING
// ============================================

/**
 * Format a work item as a one-line summary for /status output.
 *
 * @param {WorkItem} item
 * @returns {string}
 */
function formatItemSummary(item) {
  const next = getNextStep(item)
  const skippedCount = (item.skipped || []).length
  const skippedNote = skippedCount > 0 ? ` (${skippedCount} skipped)` : ''
  const age = _relativeTime(item.startedAt)
  return `[${item.issueId}] ${item.title} — ${next.label}${skippedNote} (started ${age})`
}

/**
 * Format all skipped steps for a work item.
 *
 * @param {WorkItem} item
 * @returns {string}
 */
function formatSkips(item) {
  if (!item.skipped || item.skipped.length === 0) return ''
  return item.skipped.map(s => {
    const reason = s.reason ? `: ${s.reason}` : ''
    return `  - [SKIPPED] ${s.step}${reason} (${s.stage}/${s.substage})`
  }).join('\n')
}

/**
 * Simple relative time (e.g. "2 days ago").
 * @param {string} isoString
 * @returns {string}
 */
function _relativeTime(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 2)   return 'just now'
  if (diffMin < 60)  return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24)    return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  return `${diffD}d ago`
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Constants
  STAGES,
  SUBSTAGES,

  // File helpers
  workflowFilePath,
  loadWorkflowState,
  saveWorkflowState,

  // CRUD
  createWorkItem,
  getActiveItem,
  getAllActiveItems,
  updateWorkItem,

  // Stage transitions
  updateStage,
  advanceSubstage,

  // Skip tracking
  recordSkip,

  // Completion
  completeWorkItem,

  // Display helpers
  getNextStep,
  formatItemSummary,
  formatSkips
}
