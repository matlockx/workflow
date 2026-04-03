/**
 * Plan State
 *
 * Persistence helpers for the /plan brainstorming/discovery system.
 * Each planning session is stored as a separate JSON file under:
 *
 *   .agent/state/plans/<plan-id>.json
 *
 * A plan record tracks:
 *   - The raw ideas collected during discovery
 *   - The proposed feature list after brainstorming
 *   - The user-prioritized backlog
 *   - Links to any issues created from the plan
 *   - The path to the exported markdown backlog file
 *
 * Plan lifecycle:
 *   discovery → brainstorm → prioritize → review → bulk-create → done
 *
 * @module lib/plan-state
 */

// AIDEV-NOTE: Dependency-free. Node.js built-ins only (fs, path, crypto).

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// ============================================
// CONSTANTS
// ============================================

const PLAN_STAGES = ['discovery', 'brainstorm', 'prioritize', 'review', 'bulk-create', 'done']

// ============================================
// FILE HELPERS
// ============================================

/**
 * Get the plans directory for the current project.
 * @param {string} [projectRoot]
 * @returns {string}
 */
function plansDir(projectRoot) {
  return path.join(projectRoot || process.cwd(), '.agent', 'state', 'plans')
}

/**
 * Get the file path for a specific plan.
 * @param {string} planId
 * @param {string} [projectRoot]
 * @returns {string}
 */
function planFilePath(planId, projectRoot) {
  return path.join(plansDir(projectRoot), `${planId}.json`)
}

/**
 * Read and parse a plan file. Returns null if missing.
 * @param {string} planId
 * @param {string} [projectRoot]
 * @returns {Plan|null}
 */
function readPlan(planId, projectRoot) {
  const filePath = planFilePath(planId, projectRoot)
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

/**
 * Write a plan to disk atomically.
 * @param {Plan} plan
 * @param {string} [projectRoot]
 */
function writePlan(plan, projectRoot) {
  const filePath = planFilePath(plan.id, projectRoot)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(plan, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, filePath)
}

// ============================================
// PLAN CRUD
// ============================================

/**
 * Generate a short plan ID: plan-<date>-<4 random hex chars>
 * e.g. plan-2024-01-15-a3f2
 * @returns {string}
 */
function generatePlanId() {
  const date = new Date().toISOString().slice(0, 10)
  const suffix = crypto.randomBytes(2).toString('hex')
  return `plan-${date}-${suffix}`
}

/**
 * Create a new plan record and persist it.
 *
 * @param {{ title: string, context?: string }} opts
 * @param {string} [projectRoot]
 * @returns {Plan}
 */
function createPlan({ title, context = '' }, projectRoot) {
  if (!title) throw new Error('Plan title is required')

  const now = new Date().toISOString()
  const plan = {
    id: generatePlanId(),
    title,
    context,                // User-supplied framing / background
    stage: 'discovery',

    // Discovery phase output
    clarifications: [],     // [{ question, answer }]

    // Brainstorm phase output
    proposals: [],          // [{ id, title, description, rationale, effort, priority }]

    // Prioritize phase output — ordered list of proposal IDs
    prioritizedOrder: [],

    // Review phase output — final backlog entries (may differ from proposals)
    backlog: [],            // [{ id, title, description, type, priority, labels }]

    // Bulk-create phase output
    epicId: null,           // Issue ID of the auto-created Epic (null if none or --no-epic)
    createdIssues: [],      // [{ backlogId, issueId, title }]

    // Exported markdown path (set after review phase)
    backlogFilePath: null,

    createdAt: now,
    lastUpdatedAt: now,
    completedAt: null
  }

  writePlan(plan, projectRoot)
  return plan
}

/**
 * Retrieve a plan by ID.
 * @param {string} planId
 * @param {string} [projectRoot]
 * @returns {Plan}
 */
function getPlan(planId, projectRoot) {
  const plan = readPlan(planId, projectRoot)
  if (!plan) throw new Error(`Plan ${planId} not found`)
  return plan
}

/**
 * List all plans, sorted newest-first.
 * @param {string} [projectRoot]
 * @returns {Plan[]}
 */
function listPlans(projectRoot) {
  const dir = plansDir(projectRoot)
  if (!fs.existsSync(dir)) return []

  const plans = []
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    try {
      plans.push(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')))
    } catch { /* skip corrupt files */ }
  }

  return plans.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

/**
 * Update arbitrary fields on a plan and persist.
 * @param {string} planId
 * @param {Partial<Plan>} updates
 * @param {string} [projectRoot]
 * @returns {Plan}
 */
function updatePlan(planId, updates, projectRoot) {
  const plan = getPlan(planId, projectRoot)
  const updated = {
    ...plan,
    ...updates,
    id: plan.id, // never overwrite
    lastUpdatedAt: new Date().toISOString()
  }
  writePlan(updated, projectRoot)
  return updated
}

// ============================================
// STAGE TRANSITIONS
// ============================================

/**
 * Advance a plan to the next stage.
 * @param {string} planId
 * @param {string} [projectRoot]
 * @returns {Plan}
 */
function advancePlanStage(planId, projectRoot) {
  const plan = getPlan(planId, projectRoot)
  const currentIdx = PLAN_STAGES.indexOf(plan.stage)

  if (currentIdx === -1) throw new Error(`Unknown stage: ${plan.stage}`)
  if (currentIdx === PLAN_STAGES.length - 1) return plan // already done

  const nextStage = PLAN_STAGES[currentIdx + 1]
  const updates = { stage: nextStage }

  if (nextStage === 'done') {
    updates.completedAt = new Date().toISOString()
  }

  return updatePlan(planId, updates, projectRoot)
}

/**
 * Set a plan's stage directly (e.g. to skip back for edits).
 * @param {string} planId
 * @param {string} stage
 * @param {string} [projectRoot]
 * @returns {Plan}
 */
function setPlanStage(planId, stage, projectRoot) {
  if (!PLAN_STAGES.includes(stage)) {
    throw new Error(`Unknown plan stage '${stage}'. Valid: ${PLAN_STAGES.join(', ')}`)
  }
  return updatePlan(planId, { stage }, projectRoot)
}

// ============================================
// DISCOVERY HELPERS
// ============================================

/**
 * Record a clarification Q&A pair.
 * @param {string} planId
 * @param {string} question
 * @param {string} answer
 * @param {string} [projectRoot]
 * @returns {Plan}
 */
function addClarification(planId, question, answer, projectRoot) {
  const plan = getPlan(planId, projectRoot)
  const clarifications = [...(plan.clarifications || []), { question, answer }]
  return updatePlan(planId, { clarifications }, projectRoot)
}

// ============================================
// BRAINSTORM HELPERS
// ============================================

/**
 * Set the full list of brainstormed proposals (replaces existing).
 *
 * @param {string} planId
 * @param {Array<{title: string, description: string, rationale: string, effort: string, priority: string}>} proposals
 * @param {string} [projectRoot]
 * @returns {Plan}
 */
function setProposals(planId, proposals, projectRoot) {
  // Assign stable IDs if missing
  const stamped = proposals.map((p, i) => ({
    id: p.id || `p${i + 1}`,
    title: p.title,
    description: p.description || '',
    rationale: p.rationale || '',
    effort: p.effort || 'medium',   // low | medium | high
    priority: p.priority || 'medium' // low | medium | high | critical
  }))
  return updatePlan(planId, { proposals: stamped }, projectRoot)
}

// ============================================
// PRIORITIZE HELPERS
// ============================================

/**
 * Save the user's prioritized ordering (array of proposal IDs).
 * @param {string} planId
 * @param {string[]} orderedIds
 * @param {string} [projectRoot]
 * @returns {Plan}
 */
function setPrioritizedOrder(planId, orderedIds, projectRoot) {
  return updatePlan(planId, { prioritizedOrder: orderedIds }, projectRoot)
}

// ============================================
// BACKLOG HELPERS
// ============================================

/**
 * Save the finalized backlog entries after review.
 *
 * @param {string} planId
 * @param {Array<{id, title, description, type, priority, labels}>} backlog
 * @param {string} [projectRoot]
 * @returns {Plan}
 */
function setBacklog(planId, backlog, projectRoot) {
  return updatePlan(planId, { backlog }, projectRoot)
}

/**
 * Record the path where the backlog markdown was exported.
 * @param {string} planId
 * @param {string} filePath
 * @param {string} [projectRoot]
 * @returns {Plan}
 */
function setBacklogFilePath(planId, filePath, projectRoot) {
  return updatePlan(planId, { backlogFilePath: filePath }, projectRoot)
}

// ============================================
// BULK-CREATE HELPERS
// ============================================

/**
 * Record that a backlog item was successfully created as an issue.
 * @param {string} planId
 * @param {string} backlogId
 * @param {string} issueId
 * @param {string} title
 * @param {string} [projectRoot]
 * @returns {Plan}
 */
function recordCreatedIssue(planId, backlogId, issueId, title, projectRoot) {
  const plan = getPlan(planId, projectRoot)
  const createdIssues = [
    ...(plan.createdIssues || []),
    { backlogId, issueId, title, createdAt: new Date().toISOString() }
  ]
  return updatePlan(planId, { createdIssues }, projectRoot)
}

/**
 * Record the Epic ID created for this plan (auto-created when backlog.length > 1).
 * @param {string} planId
 * @param {string} epicId  - The issue ID of the created Epic
 * @param {string} [projectRoot]
 * @returns {Plan}
 */
function setEpicId(planId, epicId, projectRoot) {
  return updatePlan(planId, { epicId }, projectRoot)
}

// ============================================
// BACKLOG MARKDOWN EXPORT
// ============================================

/**
 * Generate a markdown backlog document from a plan's finalized backlog.
 * Includes YAML frontmatter for machine readability.
 *
 * @param {Plan} plan
 * @returns {string} Markdown content
 */
function renderBacklogMarkdown(plan) {
  const now = new Date().toISOString().slice(0, 10)
  const backlog = plan.backlog || []

  // YAML frontmatter — all scalar values quoted to prevent YAML injection
  // AIDEV-NOTE: item properties use explicit per-property lines so embedded newlines
  // don't break YAML parsers; each line is joined with '\n' via the outer array join.
  const frontmatter = [
    '---',
    `planId: "${plan.id}"`,
    `title: "${plan.title.replace(/"/g, '\\"')}"`,
    `createdAt: "${now}"`,
    `stage: "${plan.stage}"`,
    `itemCount: ${backlog.length}`,
    ...(plan.epicId ? [`epicId: "${plan.epicId}"`] : []),
    `items:`,
    ...backlog.map(item => [
      `  - id: "${item.id}"`,
      `    title: "${item.title.replace(/"/g, '\\"')}"`,
      `    type: "${item.type || 'feature'}"`,
      `    priority: "${item.priority || 'medium'}"`,
    ].join('\n')),
    '---',
    ''
  ].join('\n')

  // Header
  const header = `# ${plan.title} — Backlog\n\n`

  // Context section
  const contextSection = plan.context
    ? `## Context\n\n${plan.context}\n\n`
    : ''

  // Backlog items
  const priorityOrder = ['critical', 'high', 'medium', 'low']
  const sorted = [...backlog].sort((a, b) => {
    const ai = priorityOrder.indexOf(a.priority || 'medium')
    const bi = priorityOrder.indexOf(b.priority || 'medium')
    return ai - bi
  })

  const items = sorted.map((item, i) => {
    const labels = item.labels && item.labels.length > 0
      ? `\n**Labels:** ${item.labels.join(', ')}`
      : ''
    return [
      `### ${i + 1}. ${item.title}`,
      '',
      `**Type:** ${item.type || 'feature'} | **Priority:** ${item.priority || 'medium'} | **Effort:** ${item.effort || 'medium'}`,
      labels,
      '',
      item.description || '',
      ''
    ].filter(l => l !== undefined).join('\n')
  }).join('\n')

  // Created issues section (if any)
  const epicLine = plan.epicId
    ? `- **${plan.epicId}** _(Epic)_: ${plan.title}\n`
    : ''
  const issuesSection = plan.createdIssues && plan.createdIssues.length > 0
    ? `\n## Created issues\n\n${epicLine}${plan.createdIssues.map(i =>
        `- **${i.issueId}**: ${i.title}`
      ).join('\n')}\n`
    : (epicLine ? `\n## Created issues\n\n${epicLine}` : '')

  return frontmatter + header + contextSection + '## Backlog\n\n' + items + issuesSection
}

// ============================================
// DISPLAY HELPERS
// ============================================

/**
 * Format a plan as a one-line summary.
 * @param {Plan} plan
 * @returns {string}
 */
function formatPlanSummary(plan) {
  const age = _relativeTime(plan.createdAt)
  const itemCount = (plan.backlog || plan.proposals || []).length
  const countNote = itemCount > 0 ? ` (${itemCount} items)` : ''
  return `[${plan.id}] ${plan.title} — ${plan.stage}${countNote} (${age})`
}

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
  PLAN_STAGES,

  // File helpers
  plansDir,
  planFilePath,

  // CRUD
  createPlan,
  getPlan,
  listPlans,
  updatePlan,

  // Stage management
  advancePlanStage,
  setPlanStage,

  // Phase helpers
  addClarification,
  setProposals,
  setPrioritizedOrder,
  setBacklog,
  setBacklogFilePath,
  recordCreatedIssue,
  setEpicId,

  // Export
  renderBacklogMarkdown,

  // Display
  formatPlanSummary
}
