#!/usr/bin/env node

/**
 * Integration tests for Beads backend
 *
 * Uses a real `bd init` workspace in a temp directory so all commands
 * execute against a live local Beads database with no external service.
 *
 * Covers the full workflow end-to-end:
 *   createIssue → createSpec → approveSpec → createTasks → updateTaskState
 *
 * Also covers error paths:
 *   NOT_FOUND, INVALID_STATE, INVALID_TRANSITION
 *
 * Run with: node backends/beads/integration-test.js
 *
 * AIDEV-NOTE: Requires `bd` CLI on PATH and a working Dolt installation.
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
const notesDir = path.join(tmpDir, 'notes')

fs.mkdirSync(workspaceDir, { recursive: true })
fs.mkdirSync(notesDir, { recursive: true })

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
    lmmNotesRoot: notesDir,
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
  // ----------------------------------------------------------
  console.log('\nScenario A: Full workflow — createIssue → createSpec → approveSpec → createTasks → updateTaskState')

  const backend = makeBackend()

  let createdIssue, spec, approvedSpec, tasks

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

  await test('A4: createSpec creates draft spec with correct issueId/filePath', async () => {
    spec = await backend.createSpec(createdIssue.id)
    assert(spec.id, 'Missing spec id')
    assert(spec.issueId === createdIssue.id, `Wrong issueId: ${spec.issueId}`)
    assert(spec.state === 'draft', `Wrong state: ${spec.state}`)
    assert(spec.filePath, 'Missing filePath')
    // Verify spec file was actually written to disk
    assert(fs.existsSync(spec.filePath), `Spec file not found on disk: ${spec.filePath}`)
  })

  await test('A5: getSpec retrieves the same spec', async () => {
    const fetched = await backend.getSpec(createdIssue.id)
    assert(fetched.id === spec.id, `Spec ID mismatch: ${fetched.id}`)
    assert(fetched.state === 'draft', `Expected draft, got: ${fetched.state}`)
    assert(fetched.issueId === createdIssue.id, `IssueId mismatch: ${fetched.issueId}`)
  })

  await test('A6: approveSpec transitions spec to approved', async () => {
    approvedSpec = await backend.approveSpec(spec.id)
    assert(approvedSpec.state === 'approved', `Expected approved, got: ${approvedSpec.state}`)
  })

  await test('A7: createTasks from approved spec returns phase + impl tasks', async () => {
    tasks = await backend.createTasks(spec.id)
    assert(Array.isArray(tasks), 'Expected array')
    assert(tasks.length >= 2, `Expected at least 2 tasks, got ${tasks.length}`)

    const phases = tasks.filter(t => t.isPhase)
    const impls  = tasks.filter(t => !t.isPhase)
    assert(phases.length >= 1, 'Expected at least one phase task')
    assert(impls.length  >= 1, 'Expected at least one impl task')
  })

  await test('A8: all created tasks have required interface fields', () => {
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

  await test('A9: getTasks by issueId returns all created tasks', async () => {
    const fetched = await backend.getTasks({ issueId: createdIssue.id })
    assert(Array.isArray(fetched), 'Expected array')
    // Must include at least all the impl tasks we created
    assert(
      fetched.length >= tasks.length,
      `Expected >= ${tasks.length} tasks, got ${fetched.length}`
    )
  })

  await test('A10: getTask returns a specific task', async () => {
    const implTask = tasks.find(t => !t.isPhase)
    assert(implTask, 'No impl task found')
    const fetched = await backend.getTask(implTask.id)
    assert(fetched.id === implTask.id, `ID mismatch: ${fetched.id}`)
    assert(fetched.state === 'todo', `Expected todo, got: ${fetched.state}`)
  })

  await test('A11: updateTaskState(todo → inprogress) succeeds', async () => {
    const implTask = tasks.find(t => !t.isPhase)
    const updated = await backend.updateTaskState(implTask.id, 'inprogress')
    assert(updated.state === 'inprogress', `Expected inprogress, got: ${updated.state}`)
  })

  await test('A12: updateTask updates description', async () => {
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

  await test('B3: getSpec for issue with no spec throws NOT_FOUND', async () => {
    // Create a fresh issue with no spec
    const freshIssue = await b2.createIssue({
      summary: 'Issue without spec',
      description: 'This issue has no spec yet'
    })
    try {
      await b2.getSpec(freshIssue.id)
      assert(false, 'Should have thrown')
    } catch (err) {
      assert(err.code === 'NOT_FOUND', `Expected NOT_FOUND, got: ${err.code}`)
    }
  })

  await test('B4: approveSpec on already-approved spec throws INVALID_TRANSITION', async () => {
    try {
      await b2.approveSpec(spec.id)
      assert(false, 'Should have thrown')
    } catch (err) {
      assert(
        err.code === 'INVALID_TRANSITION',
        `Expected INVALID_TRANSITION, got: ${err.code} — ${err.message}`
      )
    }
  })

  await test('B5: createTasks on already-have-tasks spec returns tasks (idempotent in Beads)', async () => {
    // Beads backend does not enforce ALREADY_EXISTS for createTasks
    // (each call creates more tasks). We just verify it doesn't throw.
    const moreTasks = await b2.createTasks(spec.id)
    assert(Array.isArray(moreTasks), 'Expected array')
  })

  await test('B6: updateTaskState with invalid transition throws INVALID_TRANSITION', async () => {
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
  // SCENARIO C: createTasks on unapproved spec
  // ----------------------------------------------------------
  console.log('\nScenario C: createTasks on unapproved spec')

  const b3 = makeBackend()

  let freshIssue2, draftSpec
  await test('C1: createIssue succeeds for fresh scenario', async () => {
    freshIssue2 = await b3.createIssue({
      summary: 'Unapproved spec test issue',
      description: 'Testing INVALID_STATE guard on createTasks'
    })
    assert(freshIssue2.id, 'Missing issue id')
  })

  await test('C2: createSpec creates draft spec', async () => {
    draftSpec = await b3.createSpec(freshIssue2.id)
    assert(draftSpec.state === 'draft', `Expected draft, got: ${draftSpec.state}`)
  })

  await test('C3: createTasks on unapproved spec throws INVALID_STATE', async () => {
    try {
      await b3.createTasks(draftSpec.id)
      assert(false, 'Should have thrown')
    } catch (err) {
      assert(err.code === 'INVALID_STATE', `Expected INVALID_STATE, got: ${err.code} — ${err.message}`)
    }
  })

  // ----------------------------------------------------------
  // SCENARIO D: rejectSpec → approveSpec flow
  // ----------------------------------------------------------
  console.log('\nScenario D: rejectSpec → approveSpec flow')

  const b4 = makeBackend()

  let issueD, specD
  await test('D1: createIssue + createSpec succeeds', async () => {
    issueD = await b4.createIssue({ summary: 'Reject-flow test', description: 'Testing reject → approve' })
    specD  = await b4.createSpec(issueD.id)
    assert(specD.state === 'draft')
  })

  await test('D2: rejectSpec transitions spec to rejected', async () => {
    const r = await b4.rejectSpec(specD.id, 'Needs more detail')
    assert(r.state === 'rejected', `Expected rejected, got: ${r.state}`)
  })

  // ----------------------------------------------------------
  // SCENARIO E: State machine contract
  // ----------------------------------------------------------
  console.log('\nScenario E: State machine contract')

  const b5 = makeBackend()

  await test('E1: getWorkStates() returns all 8 core states', () => {
    const states = b5.getWorkStates()
    const CORE = ['new','draft','todo','inprogress','review','approved','rejected','done']
    for (const s of CORE) {
      assert(states.includes(s), `Missing state: ${s}`)
    }
  })

  await test('E2: getValidTransitions(unknown) returns empty array, not an error', () => {
    const t = b5.getValidTransitions('__nonexistent__')
    assert(Array.isArray(t), 'Expected array')
    assert(t.length === 0, `Expected empty, got: ${t.join(', ')}`)
  })

  await test('E3: isValidTransition is consistent with getValidTransitions', () => {
    const states = b5.getWorkStates()
    for (const from of states) {
      const valid = b5.getValidTransitions(from)
      for (const to of valid) {
        assert(b5.isValidTransition(from, to), `isValidTransition(${from}, ${to}) should be true`)
      }
    }
  })

  await test('E4: done state has no valid transitions', () => {
    const t = b5.getValidTransitions('done')
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
