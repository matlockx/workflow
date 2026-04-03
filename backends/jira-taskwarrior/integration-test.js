#!/usr/bin/env node

/**
 * Integration tests for Jira-Taskwarrior backend
 *
 * Exercises the full workflow end-to-end using mocked exec and fs operations:
 *   createIssue → createTasks → updateTaskState
 *
 * Complements test.js (unit tests) by focusing on:
 *   - Cross-method workflow continuity (state threads through calls)
 *   - Error paths at each workflow stage
 *   - State-machine enforcement across the full issue lifecycle
 *
 * Run with: node backends/jira-taskwarrior/integration-test.js
 *
 * AIDEV-NOTE: ADR-001 removed the spec stage from the pipeline.
 * Tests previously covering createSpec/approveSpec/spec-based createTasks
 * are replaced by direct createTasks(issueId) tests.
 *
 * AIDEV-NOTE: Mocks are applied BEFORE require('./index.js') to intercept
 * the module-level `exec` reference captured by promisify(exec).
 */

// ============================================
// MOCK SETUP — must happen before require
// ============================================

const originalExec = require('child_process').exec

// ---- In-memory task store ----
let taskStore = {}         // uuid → task object
let taskAddCounter = 0

// Deterministic UUIDs for integration scenario
const UUID = {
  phase1:  'integ-ph1--0001-0000-000000000001',
  task1_1: 'integ-t11--0002-0000-000000000002',
  task1_2: 'integ-t12--0003-0000-000000000003',
  phase2:  'integ-ph2--0004-0000-000000000004',
  task2_1: 'integ-t21--0005-0000-000000000005',
  task2_2: 'integ-t22--0006-0000-000000000006'
}
const UUID_SEQ = Object.values(UUID)

// ---- Issue data used by ACLI mocks ----
const ISSUE_CREATED = {
  key: 'INT-001',
  fields: {
    summary: 'Integration test issue',
    description: { content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Full workflow test' }] }] },
    status: { name: 'To Do' },
    assignee: null,
    labels: ['integration'],
    priority: { name: 'Medium' },
    issuetype: { name: 'Story' },
    created: '2026-03-01T10:00:00.000Z',
    updated: '2026-03-28T14:00:00.000Z',
    reporter: { displayName: 'Tester' }
  }
}

// ---- Mock exec ----
require('child_process').exec = (cmd, options, callback) => {
  if (typeof options === 'function') { callback = options }

  setImmediate(() => {
    let stdout = ''
    try {
      // Auth
      if (cmd.includes('auth status')) {
        stdout = '✓ Authenticated\n  Site: test.atlassian.net\n'

      // workitem search
      } else if (cmd.includes('workitem search')) {
        stdout = JSON.stringify({ issues: [ISSUE_CREATED] })

      // workitem view
      } else if (cmd.includes('workitem view')) {
        stdout = JSON.stringify(ISSUE_CREATED)

      // workitem create
      } else if (cmd.includes('workitem create')) {
        stdout = JSON.stringify(ISSUE_CREATED)

      // project view
      } else if (cmd.includes('project view')) {
        stdout = JSON.stringify({ key: 'INT', versions: [] })

      // task show (UDA check)
      } else if (cmd.includes('task show')) {
        stdout = `
uda.jiraid.type=string
uda.jiraid.label=Jira ID
uda.work_state.type=string
uda.work_state.label=Work State
uda.repository.type=string
uda.repository.label=Repository
`
      // task add — store task, return deterministic UUID
      } else if (cmd.includes('task add')) {
        const uuid = UUID_SEQ[taskAddCounter++] || `fallback-uuid-${taskAddCounter}`

        // Parse description from first quoted string
        const descMatch = cmd.match(/"([^"]+)"/)
        const description = descMatch ? descMatch[1] : 'Task'

        // Parse attributes
        const jiraid  = (cmd.match(/jiraid:(\S+)/)  || [])[1] || null
        const work_state = (cmd.match(/work_state:(\S+)/)  || [])[1] || 'todo'
        const project = (cmd.match(/project:(\S+)/) || [])[1] || null
        const repository = (cmd.match(/repository:(\S+)/) || [])[1] || null
        const depends = (cmd.match(/depends:(\S+)/) || [])[1] || null

        const tags = []
        if (cmd.includes('+impl'))  tags.push('impl')
        if (cmd.includes('+phase')) tags.push('phase')

        taskStore[uuid] = {
          uuid,
          description,
          status: 'pending',
          work_state,
          jiraid,
          project,
          repository,
          tags,
          depends: depends ? [depends] : [],
          entry: new Date().toISOString()
        }

        stdout = `Created task ${taskAddCounter} with uuid ${uuid}\n`

      // task <uuid> modify work_state:<state>
      } else if (cmd.match(/task (\S+) modify work_state:(\w+)/)) {
        const [, uuid, state] = cmd.match(/task (\S+) modify work_state:(\w+)/)
        if (taskStore[uuid]) taskStore[uuid].work_state = state
        stdout = 'Modified 1 task.\n'

      // task <uuid> done
      } else if (cmd.match(/task (\S+) done/)) {
        const [, uuid] = cmd.match(/task (\S+) done/)
        if (taskStore[uuid]) taskStore[uuid].status = 'completed'
        stdout = 'Completed task 1.\n'

      // task <uuid> annotate
      } else if (cmd.match(/task (\S+) annotate/)) {
        stdout = 'Annotated task.\n'

      // task <filter> export — generic filter matcher
      } else if (cmd.includes(' export')) {
        // Build result from taskStore matching the filter
        const results = _matchTasksForExport(cmd)
        if (results.length === 0) {
          stdout = ''
        } else if (results.length === 1) {
          stdout = JSON.stringify(results[0])
        } else {
          stdout = JSON.stringify(results)
        }

      } else {
        stdout = ''
      }

      callback(null, { stdout, stderr: '' })
    } catch (err) {
      callback(err)
    }
  })
}

/**
 * Match tasks from taskStore for a Taskwarrior `export` command.
 * Handles the key filter patterns used by the backend:
 *   jiraid:X +impl / uuid:X / jiraid:X +impl +phase project:P
 *
 * AIDEV-NOTE: This intentionally mirrors only the filter patterns the backend
 * actually emits — not the full Taskwarrior filter grammar.
 */
function _matchTasksForExport(cmd) {
  // Strip trailing "export"
  const filter = cmd.replace(/^task\s+/, '').replace(/\s+export$/, '').trim()
  const tasks = Object.values(taskStore)

  // uuid:X
  const uuidMatch = filter.match(/^uuid:(\S+)$/)
  if (uuidMatch) {
    return tasks.filter(t => t.uuid === uuidMatch[1])
  }

  // Evaluate tag/attribute constraints
  const mustHaveTags    = (filter.match(/\+(\w+)/g) || []).map(t => t.slice(1))
  const mustNotHaveTags = (filter.match(/-(\w+)/g)  || []).map(t => t.slice(1))
  const jiraidMatch     = filter.match(/jiraid:(\S+)/)
  const projectMatch    = filter.match(/project:(\S+)/)
  const work_stateMatch = filter.match(/work_state:(\S+)/)
  const uuidInlineMatch = filter.match(/uuid:(\S+)/)

  return tasks.filter(t => {
    if (jiraidMatch     && t.jiraid     !== jiraidMatch[1])     return false
    if (projectMatch    && t.project    !== projectMatch[1])    return false
    if (work_stateMatch && t.work_state !== work_stateMatch[1]) return false
    if (uuidInlineMatch && t.uuid       !== uuidInlineMatch[1]) return false
    for (const tag of mustHaveTags)    if (!t.tags.includes(tag))  return false
    for (const tag of mustNotHaveTags) if (t.tags.includes(tag))   return false
    return true
  })
}

// ---- Load backend AFTER mocks are in place ----
const JiraTaskwarriorBackend = require('./index.js')

// ============================================
// TEST HELPERS
// ============================================

let passed = 0
let failed = 0
const failures = []

async function test(name, fn) {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (err) {
    console.log(`  ✗ ${name}: ${err.message}`)
    failures.push({ name, error: err })
    failed++
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed')
}

function makeBackend() {
  return new JiraTaskwarriorBackend({
    jiraSite: 'test.atlassian.net',
    jiraProject: 'INT',
    jiraEmail: 'tester@example.com',
    repository: 'integration'
  })
}

// ============================================
// INTEGRATION TESTS
// ============================================

async function runIntegrationTests() {
  console.log('\n========================================')
  console.log('Integration tests: Jira-Taskwarrior backend')
  console.log('========================================')

  // ----------------------------------------------------------
  // SCENARIO A: Full happy-path workflow
  // AIDEV-NOTE: ADR-001 pipeline: createIssue → createTasks(issueId) → updateTaskState
  // ----------------------------------------------------------
  console.log('\nScenario A: Full workflow — createIssue → createTasks → updateTaskState')

  const backend = makeBackend()

  // Reset store for clean run
  taskStore = {}
  taskAddCounter = 0

  let createdIssue, tasks

  await test('A1: createIssue returns normalized issue with id/summary', async () => {
    createdIssue = await backend.createIssue({
      summary: 'Integration test issue',
      description: 'Full workflow test'
    })
    assert(createdIssue.id, 'Missing issue id')
    assert(createdIssue.summary, 'Missing issue summary')
    assert(typeof createdIssue.url === 'string', 'Missing issue url')
  })

  await test('A2: createTasks from issue returns at least 2 tasks (phases + impl)', async () => {
    tasks = await backend.createTasks(ISSUE_CREATED.key)
    assert(Array.isArray(tasks), 'Expected array')
    assert(tasks.length >= 2, `Expected at least 2 tasks, got ${tasks.length}`)

    const phases = tasks.filter(t => t.isPhase)
    const impls  = tasks.filter(t => !t.isPhase)
    assert(phases.length >= 1, 'Expected at least one phase task')
    assert(impls.length  >= 1, 'Expected at least one impl task')
  })

  await test('A3: all created tasks have required fields', () => {
    for (const task of tasks) {
      assert(task.id,      `Task missing id`)
      assert(task.description, `Task missing description (id=${task.id})`)
      assert(task.state,   `Task missing state (id=${task.id})`)
      assert(task.issueId === ISSUE_CREATED.key, `Task issueId mismatch (id=${task.id})`)
    }
  })

  await test('A4: getTasks by issueId returns all created tasks', async () => {
    const fetched = await backend.getTasks({ issueId: ISSUE_CREATED.key })
    assert(fetched.length >= tasks.length,
      `Expected >= ${tasks.length} tasks, got ${fetched.length}`)
  })

  await test('A5: getTask returns a specific task by UUID', async () => {
    const implTask = tasks.find(t => !t.isPhase)
    assert(implTask, 'No impl task found')
    const fetched = await backend.getTask(implTask.id)
    assert(fetched.id === implTask.id, `ID mismatch: ${fetched.id}`)
    assert(fetched.state === 'todo', `Expected todo, got: ${fetched.state}`)
  })

  await test('A6: updateTaskState(todo → inprogress) succeeds', async () => {
    const implTask = tasks.find(t => !t.isPhase)
    const updated = await backend.updateTaskState(implTask.id, 'inprogress')
    assert(updated.state === 'inprogress', `Expected inprogress, got: ${updated.state}`)
  })

  await test('A7: updateTaskState(inprogress → review) succeeds', async () => {
    const implTask = tasks.find(t => !t.isPhase)
    const updated = await backend.updateTaskState(implTask.id, 'review')
    assert(updated.state === 'review', `Expected review, got: ${updated.state}`)
  })

  // ----------------------------------------------------------
  // SCENARIO B: Error paths
  // ----------------------------------------------------------
  console.log('\nScenario B: Error path tests')

  // Fresh backend; tasks already exist in store from Scenario A
  const b2 = makeBackend()

  await test('B1: createTasks when tasks already exist throws ALREADY_EXISTS', async () => {
    try {
      await b2.createTasks(ISSUE_CREATED.key)
      assert(false, 'Should have thrown')
    } catch (err) {
      assert(err.code === 'ALREADY_EXISTS', `Expected ALREADY_EXISTS, got: ${err.code}`)
    }
  })

  await test('B2: getTask with unknown UUID throws NOT_FOUND', async () => {
    try {
      await b2.getTask('00000000-dead-beef-0000-000000000000')
      assert(false, 'Should have thrown')
    } catch (err) {
      assert(err.code === 'NOT_FOUND', `Expected NOT_FOUND, got: ${err.code}`)
    }
  })

  await test('B3: updateTaskState with invalid transition throws INVALID_TRANSITION', async () => {
    const implTask = tasks.find(t => !t.isPhase)
    // task is currently in 'review'; skip straight to 'done' is invalid per state machine
    // but review → done is NOT in the machine; review can go approved or rejected only
    try {
      await b2.updateTaskState(implTask.id, 'done')
      assert(false, 'Should have thrown')
    } catch (err) {
      assert(err.code === 'INVALID_TRANSITION', `Expected INVALID_TRANSITION, got: ${err.code}`)
    }
  })

  // ----------------------------------------------------------
  // SCENARIO C: State machine validation
  // ----------------------------------------------------------
  console.log('\nScenario C: State machine contract')

  const b3 = makeBackend()

  await test('C1: getWorkStates() returns all 8 core states', () => {
    const states = b3.getWorkStates()
    const CORE = ['new','draft','todo','inprogress','review','approved','rejected','done']
    for (const s of CORE) {
      assert(states.includes(s), `Missing state: ${s}`)
    }
  })

  await test('C2: valid transitions are symmetric with isValidTransition', () => {
    const states = b3.getWorkStates()
    for (const from of states) {
      const valid = b3.getValidTransitions(from)
      for (const to of valid) {
        assert(b3.isValidTransition(from, to), `isValidTransition(${from}, ${to}) should be true`)
      }
    }
  })

  await test('C3: done state has no valid transitions', () => {
    const transitions = b3.getValidTransitions('done')
    assert(transitions.length === 0, `Expected 0 transitions from done, got: ${transitions.join(', ')}`)
  })

  // ----------------------------------------------------------
  // RESULTS
  // ----------------------------------------------------------
  console.log(`\n----------------------------------------`)
  console.log(`Results: ${passed} passed, ${failed} failed`)

  if (failures.length > 0) {
    console.log('\nFailed tests:')
    for (const { name, error } of failures) {
      console.log(`  ✗ ${name}`)
      console.log(`    ${error.message}`)
    }
    console.log('')
    process.exit(1)
  }

  console.log('\n✅ All integration tests passed!\n')
}

// ============================================
// RUN + RESTORE
// ============================================

runIntegrationTests()
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
  .finally(() => {
    // Restore real exec
    require('child_process').exec = originalExec
  })
