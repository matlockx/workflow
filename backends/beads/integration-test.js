#!/usr/bin/env node

/**
 * Integration tests for Beads backend
 *
 * Uses a real `bd init` workspace in a temp directory so all commands
 * execute against a live local Beads database with no external service.
 *
 * Covers the full workflow end-to-end:
 *   createIssue → createTasks → updateTaskState
 *
 * Also covers error paths:
 *   NOT_FOUND, INVALID_TRANSITION
 *
 * Run with: node backends/beads/integration-test.js
 *
 * AIDEV-NOTE: ADR-001 removed the spec stage from the pipeline.
 * createTasks now takes an issueId directly (no createSpec/approveSpec gate).
 * Requires `bd` CLI on PATH and a working Dolt installation.
 * If `bd init` fails the test exits with a clear skip message rather than
 * failing, so CI on systems without Dolt is still green.
 */

const os = require('os')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

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

// ============================================
// SETUP
// ============================================

// Create isolated temp directory for this run
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-beads-integ-'))
const workspaceDir = path.join(tmpDir, 'workspace')

fs.mkdirSync(workspaceDir, { recursive: true })

// Attempt bd init — skip gracefully if unavailable
console.log('Setting up Beads workspace ...')
try {
  execSync('bd init --prefix=IT', { cwd: workspaceDir, stdio: 'pipe', timeout: 30000 })
  console.log('  ✓ bd init succeeded\n')
} catch (err) {
  console.log('\n⚠  Beads workspace init failed — skipping Beads integration tests.')
  console.log(`   (${err.message.split('\n')[0]})`)
  console.log('\nTo run these tests, install Beads (bd) and ensure a Dolt server is running.\n')
  process.exit(0)
}

const BeadsBackend = require('./index.js')

function makeBackend() {
  return new BeadsBackend({
    workspaceDir,
    repository: 'integration-test'
  })
}

// ============================================
// INTEGRATION TESTS
// ============================================

async function runIntegrationTests() {
  console.log('========================================')
  console.log('Integration tests: Beads backend')
  console.log('========================================')

  // ----------------------------------------------------------
  // SCENARIO A: Full happy-path workflow
  // AIDEV-NOTE: ADR-001 pipeline: createIssue → createTasks → updateTaskState
  // ----------------------------------------------------------
  console.log('\nScenario A: Full workflow — createIssue → createTasks → updateTaskState')

  const backend = makeBackend()

  let createdIssue, tasks

  await test('A1: createIssue returns normalized issue with id/summary', async () => {
    createdIssue = await backend.createIssue({
      summary: 'Beads integration test issue',
      description: 'Testing the full workflow with a real bd workspace',
      issueType: 'task',
      labels: ['integration']
    })
    assert(createdIssue.id, 'Missing issue id')
    assert(createdIssue.summary === 'Beads integration test issue', `Wrong summary: ${createdIssue.summary}`)
  })

  await test('A2: getIssue retrieves the created issue', async () => {
    const fetched = await backend.getIssue(createdIssue.id)
    assert(fetched.id === createdIssue.id, `ID mismatch: ${fetched.id}`)
    assert(fetched.summary === createdIssue.summary, `Summary mismatch: ${fetched.summary}`)
  })

  await test('A3: listIssues returns at least one issue', async () => {
    const issues = await backend.listIssues({})
    assert(Array.isArray(issues), 'Expected array')
    assert(issues.length >= 1, `Expected at least 1 issue, got ${issues.length}`)
  })

  await test('A4: createTasks from issue returns phase + impl tasks', async () => {
    tasks = await backend.createTasks(createdIssue.id)
    assert(Array.isArray(tasks), 'Expected array')
    assert(tasks.length >= 2, `Expected at least 2 tasks, got ${tasks.length}`)

    const phases = tasks.filter(t => t.isPhase)
    const impls  = tasks.filter(t => !t.isPhase)
    assert(phases.length >= 1, 'Expected at least one phase task')
    assert(impls.length  >= 1, 'Expected at least one impl task')
  })

  await test('A5: all created tasks have required interface fields', () => {
    for (const task of tasks) {
      assert(task.id,               `Task missing id`)
      assert(task.description,      `Task missing description (id=${task.id})`)
      assert(task.state,            `Task missing state (id=${task.id})`)
      assert(typeof task.isPhase === 'boolean', `isPhase must be boolean (id=${task.id})`)
      assert(Array.isArray(task.tags),    `tags must be array (id=${task.id})`)
      assert(Array.isArray(task.depends), `depends must be array (id=${task.id})`)
      assert(task.createdAt instanceof Date, `createdAt must be Date (id=${task.id})`)
    }
  })

  await test('A6: getTasks by issueId returns all created tasks', async () => {
    const fetched = await backend.getTasks({ issueId: createdIssue.id })
    assert(Array.isArray(fetched), 'Expected array')
    // Must include at least all the impl tasks we created
    assert(
      fetched.length >= tasks.length,
      `Expected >= ${tasks.length} tasks, got ${fetched.length}`
    )
  })

  await test('A7: getTask returns a specific task', async () => {
    const implTask = tasks.find(t => !t.isPhase)
    assert(implTask, 'No impl task found')
    const fetched = await backend.getTask(implTask.id)
    assert(fetched.id === implTask.id, `ID mismatch: ${fetched.id}`)
    assert(fetched.state === 'todo', `Expected todo, got: ${fetched.state}`)
  })

  await test('A8: updateTaskState(todo → inprogress) succeeds', async () => {
    const implTask = tasks.find(t => !t.isPhase)
    const updated = await backend.updateTaskState(implTask.id, 'inprogress')
    assert(updated.state === 'inprogress', `Expected inprogress, got: ${updated.state}`)
  })

  await test('A9: updateTask updates description', async () => {
    const implTask = tasks.find(t => !t.isPhase)
    const updated = await backend.updateTask(implTask.id, { description: 'Updated via integration test' })
    assert(typeof updated.description === 'string', 'Expected string description')
  })

  // ----------------------------------------------------------
  // SCENARIO B: Error paths
  // ----------------------------------------------------------
  console.log('\nScenario B: Error path tests')

  const b2 = makeBackend()

  await test('B1: getIssue with unknown id throws NOT_FOUND', async () => {
    try {
      await b2.getIssue('__nonexistent_99999__')
      assert(false, 'Should have thrown')
    } catch (err) {
      assert(err.code === 'NOT_FOUND', `Expected NOT_FOUND, got: ${err.code}`)
    }
  })

  await test('B2: getTask with unknown id throws NOT_FOUND', async () => {
    try {
      await b2.getTask('__nonexistent_task_99999__')
      assert(false, 'Should have thrown')
    } catch (err) {
      assert(err.code === 'NOT_FOUND', `Expected NOT_FOUND, got: ${err.code}`)
    }
  })

  await test('B3: createTasks with unknown issueId throws NOT_FOUND', async () => {
    try {
      await b2.createTasks('__nonexistent_issue_99999__')
      assert(false, 'Should have thrown')
    } catch (err) {
      assert(err.code === 'NOT_FOUND', `Expected NOT_FOUND, got: ${err.code}`)
    }
  })

  await test('B4: updateTaskState with invalid transition throws INVALID_TRANSITION', async () => {
    // A task in inprogress state cannot jump to 'new'
    const implTask = tasks.find(t => !t.isPhase)
    try {
      await b2.updateTaskState(implTask.id, 'new')
      assert(false, 'Should have thrown')
    } catch (err) {
      assert(
        err.code === 'INVALID_TRANSITION',
        `Expected INVALID_TRANSITION, got: ${err.code}`
      )
    }
  })

  // ----------------------------------------------------------
  // SCENARIO C: State machine contract
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

  await test('C2: getValidTransitions(unknown) returns empty array, not an error', () => {
    const t = b3.getValidTransitions('__nonexistent__')
    assert(Array.isArray(t), 'Expected array')
    assert(t.length === 0, `Expected empty, got: ${t.join(', ')}`)
  })

  await test('C3: isValidTransition is consistent with getValidTransitions', () => {
    const states = b3.getWorkStates()
    for (const from of states) {
      const valid = b3.getValidTransitions(from)
      for (const to of valid) {
        assert(b3.isValidTransition(from, to), `isValidTransition(${from}, ${to}) should be true`)
      }
    }
  })

  await test('C4: done state has no valid transitions', () => {
    const t = b3.getValidTransitions('done')
    assert(t.length === 0, `Expected 0, got: ${t.join(', ')}`)
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

  console.log('\n✅ All Beads integration tests passed!\n')
}

// ============================================
// RUN + CLEANUP
// ============================================

runIntegrationTests()
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
  .finally(() => {
    // Best-effort cleanup of temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch (_) {}
  })
