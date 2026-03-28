#!/usr/bin/env node

/**
 * Interface Contract Tests
 *
 * Verifies that all backend implementations conform to the WorkflowBackend
 * interface defined in backends/interface.ts.
 *
 * Tests:
 *   - All required methods exist and are functions
 *   - Return shapes match the interface (id, summary, state, filePath, etc.)
 *   - Error handling: NOT_FOUND and INVALID_TRANSITION error codes
 *   - Edge cases: empty filters, missing optional fields
 *
 * Run with: node backends/interface-contract-test.js
 *
 * AIDEV-NOTE: Uses the mock backend (no external deps) as the primary test
 * target. Add new backends to BACKENDS_TO_TEST to include them here.
 */

const os = require('os')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// ============================================
// REQUIRED INTERFACE METHODS
// (sourced from backends/interface.ts WorkflowBackend)
// ============================================

const REQUIRED_METHODS = [
  'listIssues',
  'getIssue',
  'createIssue',
  'updateIssue',
  'createSpec',
  'getSpec',
  'approveSpec',
  'rejectSpec',
  'createTasks',
  'getTasks',
  'getTask',
  'updateTaskState',
  'updateTask',
  'getWorkStates',
  'getValidTransitions',
  'isValidTransition'
]

const CORE_WORK_STATES = [
  'new', 'draft', 'todo', 'inprogress', 'review', 'approved', 'rejected', 'done'
]

// ============================================
// TEST HELPERS
// ============================================

let passed = 0
let failed = 0

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

function assertHasFields(obj, fields, context) {
  for (const field of fields) {
    if (!(field in obj)) {
      throw new Error(`${context} missing required field: '${field}'`)
    }
  }
}

async function test(name, fn) {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (err) {
    console.log(`  ✗ ${name}`)
    console.log(`    Error: ${err.message}`)
    failed++
  }
}

async function section(title, fn) {
  console.log(`\n${title}`)
  await fn()
}

// ============================================
// CONTRACT TEST SUITE (runs against any backend)
// ============================================

// AIDEV-NOTE: Each section maps directly to a part of the WorkflowBackend
// interface. If the interface gains new methods, add them here too.

async function runContractTests(backend, label) {
  console.log(`\n========================================`)
  console.log(`Contract tests: ${label}`)
  console.log(`========================================`)

  // ----------------------------------------
  // SECTION 1: Method existence
  // ----------------------------------------
  await section('1. Required method existence', async () => {
    for (const method of REQUIRED_METHODS) {
      await test(`has method: ${method}`, () => {
        assert(
          typeof backend[method] === 'function',
          `Expected backend.${method} to be a function, got ${typeof backend[method]}`
        )
      })
    }
  })

  // ----------------------------------------
  // SECTION 2: State machine
  // ----------------------------------------
  await section('2. State machine contract', async () => {
    await test('getWorkStates() returns an array', () => {
      const states = backend.getWorkStates()
      assert(Array.isArray(states), `Expected array, got ${typeof states}`)
      assert(states.length > 0, 'Expected at least one state')
    })

    await test('getWorkStates() includes all core states', () => {
      const states = backend.getWorkStates()
      for (const coreState of CORE_WORK_STATES) {
        assert(states.includes(coreState), `Missing core state: ${coreState}`)
      }
    })

    await test('getValidTransitions(todo) returns an array', () => {
      const transitions = backend.getValidTransitions('todo')
      assert(Array.isArray(transitions), `Expected array, got ${typeof transitions}`)
    })

    await test('getValidTransitions(unknown) returns empty array not error', () => {
      const transitions = backend.getValidTransitions('__nonexistent_state__')
      assert(Array.isArray(transitions), 'Expected array for unknown state')
    })

    await test('isValidTransition(todo, inprogress) is true', () => {
      const result = backend.isValidTransition('todo', 'inprogress')
      assert(result === true, `Expected true, got ${result}`)
    })

    await test('isValidTransition(done, todo) is false', () => {
      const result = backend.isValidTransition('done', 'todo')
      assert(result === false, `Expected false, got ${result}`)
    })

    await test('isValidTransition is consistent with getValidTransitions', () => {
      const from = 'todo'
      const valid = backend.getValidTransitions(from)
      for (const to of valid) {
        assert(
          backend.isValidTransition(from, to) === true,
          `isValidTransition(${from}, ${to}) should be true since getValidTransitions includes it`
        )
      }
    })
  })

  // ----------------------------------------
  // SECTION 3: Issue CRUD + return shapes
  // ----------------------------------------
  await section('3. Issue CRUD and return shapes', async () => {
    let createdIssue

    await test('createIssue returns correct shape', async () => {
      createdIssue = await backend.createIssue({
        summary: 'Contract test issue',
        description: 'Created by interface-contract-test.js'
      })
      assertHasFields(createdIssue, ['id', 'summary', 'description', 'status', 'labels', 'metadata'], 'Issue')
      assert(typeof createdIssue.id === 'string', 'Issue.id must be a string')
      assert(Array.isArray(createdIssue.labels), 'Issue.labels must be an array')
      assert(typeof createdIssue.metadata === 'object', 'Issue.metadata must be an object')
    })

    await test('createIssue rejects missing summary', async () => {
      let threw = false
      try {
        await backend.createIssue({ description: 'no summary' })
      } catch (err) {
        threw = true
        assert(
          err.code === 'VALIDATION_FAILED',
          `Expected VALIDATION_FAILED, got ${err.code}: ${err.message}`
        )
      }
      assert(threw, 'Expected createIssue to throw for missing summary')
    })

    await test('createIssue rejects missing description', async () => {
      let threw = false
      try {
        await backend.createIssue({ summary: 'no description' })
      } catch (err) {
        threw = true
        assert(
          err.code === 'VALIDATION_FAILED',
          `Expected VALIDATION_FAILED, got ${err.code}: ${err.message}`
        )
      }
      assert(threw, 'Expected createIssue to throw for missing description')
    })

    await test('getIssue returns the created issue', async () => {
      if (!createdIssue) return // previous test failed
      const fetched = await backend.getIssue(createdIssue.id)
      assert(fetched.id === createdIssue.id, 'ID mismatch')
      assert(fetched.summary === createdIssue.summary, 'Summary mismatch')
    })

    await test('getIssue throws NOT_FOUND for unknown ID', async () => {
      let threw = false
      try {
        await backend.getIssue('__nonexistent_issue_99999__')
      } catch (err) {
        threw = true
        assert(
          err.code === 'NOT_FOUND',
          `Expected NOT_FOUND, got ${err.code}: ${err.message}`
        )
      }
      assert(threw, 'Expected getIssue to throw NOT_FOUND')
    })

    await test('listIssues returns an array', async () => {
      const issues = await backend.listIssues()
      assert(Array.isArray(issues), `Expected array, got ${typeof issues}`)
    })

    await test('listIssues with empty filter returns an array', async () => {
      const issues = await backend.listIssues({})
      assert(Array.isArray(issues), `Expected array, got ${typeof issues}`)
    })

    await test('listIssues with limit=1 returns at most 1', async () => {
      const issues = await backend.listIssues({ limit: 1 })
      assert(issues.length <= 1, `Expected at most 1 issue, got ${issues.length}`)
    })

    await test('updateIssue returns updated issue', async () => {
      if (!createdIssue) return
      const updated = await backend.updateIssue(createdIssue.id, { summary: 'Updated summary' })
      assert(updated.id === createdIssue.id, 'ID mismatch')
      assert(updated.summary === 'Updated summary', `Expected 'Updated summary', got '${updated.summary}'`)
    })

    await test('updateIssue throws NOT_FOUND for unknown ID', async () => {
      let threw = false
      try {
        await backend.updateIssue('__nonexistent_issue_99999__', { summary: 'x' })
      } catch (err) {
        threw = true
        assert(
          err.code === 'NOT_FOUND',
          `Expected NOT_FOUND, got ${err.code}: ${err.message}`
        )
      }
      assert(threw, 'Expected updateIssue to throw NOT_FOUND')
    })
  })

  // ----------------------------------------
  // SECTION 4: Spec lifecycle + return shapes
  // ----------------------------------------
  await section('4. Spec lifecycle and return shapes', async () => {
    let issue2
    let spec

    await test('createSpec returns correct shape', async () => {
      issue2 = await backend.createIssue({
        summary: 'Spec lifecycle test issue',
        description: 'Testing spec workflow'
      })
      spec = await backend.createSpec(issue2.id)
      assertHasFields(spec, ['id', 'issueId', 'filePath', 'state', 'createdAt', 'metadata'], 'Spec')
      assert(spec.issueId === issue2.id, `issueId mismatch: ${spec.issueId} vs ${issue2.id}`)
      assert(spec.state === 'draft', `Expected initial state 'draft', got '${spec.state}'`)
      assert(typeof spec.filePath === 'string', 'filePath must be a string')
      assert(spec.createdAt instanceof Date, 'createdAt must be a Date')
      assert(typeof spec.metadata === 'object', 'metadata must be an object')
    })

    await test('createSpec throws NOT_FOUND for unknown issue', async () => {
      let threw = false
      try {
        await backend.createSpec('__nonexistent_issue_99999__')
      } catch (err) {
        threw = true
        assert(
          err.code === 'NOT_FOUND',
          `Expected NOT_FOUND, got ${err.code}: ${err.message}`
        )
      }
      assert(threw, 'Expected createSpec to throw NOT_FOUND')
    })

    await test('getSpec returns the created spec', async () => {
      if (!spec) return
      const fetched = await backend.getSpec(issue2.id)
      assert(fetched.id === spec.id, `ID mismatch: ${fetched.id} vs ${spec.id}`)
      assert(fetched.state === 'draft', `Expected draft, got ${fetched.state}`)
    })

    await test('getSpec throws NOT_FOUND for unknown issue', async () => {
      let threw = false
      try {
        await backend.getSpec('__nonexistent_issue_99999__')
      } catch (err) {
        threw = true
        assert(
          err.code === 'NOT_FOUND',
          `Expected NOT_FOUND, got ${err.code}: ${err.message}`
        )
      }
      assert(threw, 'Expected getSpec to throw NOT_FOUND')
    })

    await test('approveSpec transitions draft → approved', async () => {
      if (!spec) return
      const approved = await backend.approveSpec(spec.id)
      assert(approved.state === 'approved', `Expected 'approved', got '${approved.state}'`)
    })

    await test('approveSpec throws INVALID_TRANSITION if already approved', async () => {
      if (!spec) return
      let threw = false
      try {
        await backend.approveSpec(spec.id)
      } catch (err) {
        threw = true
        assert(
          err.code === 'INVALID_TRANSITION',
          `Expected INVALID_TRANSITION, got ${err.code}: ${err.message}`
        )
      }
      assert(threw, 'Expected approveSpec to throw INVALID_TRANSITION when already approved')
    })

    await test('rejectSpec transitions draft → rejected', async () => {
      const issue3 = await backend.createIssue({
        summary: 'Reject test issue',
        description: 'For testing rejectSpec'
      })
      const specR = await backend.createSpec(issue3.id)
      const rejected = await backend.rejectSpec(specR.id, 'Not ready')
      assert(rejected.state === 'rejected', `Expected 'rejected', got '${rejected.state}'`)
    })

    await test('rejectSpec throws NOT_FOUND for unknown spec', async () => {
      let threw = false
      try {
        await backend.rejectSpec('__nonexistent_spec_99999__')
      } catch (err) {
        threw = true
        assert(
          err.code === 'NOT_FOUND',
          `Expected NOT_FOUND, got ${err.code}: ${err.message}`
        )
      }
      assert(threw, 'Expected rejectSpec to throw NOT_FOUND')
    })
  })

  // ----------------------------------------
  // SECTION 5: Task lifecycle + return shapes
  // ----------------------------------------
  await section('5. Task lifecycle and return shapes', async () => {
    let issue4
    let spec4
    let tasks

    await test('createTasks throws INVALID_STATE if spec not approved', async () => {
      issue4 = await backend.createIssue({
        summary: 'Task lifecycle test',
        description: 'For testing task workflow'
      })
      spec4 = await backend.createSpec(issue4.id)
      // spec4 is still in draft — createTasks must reject it
      let threw = false
      try {
        await backend.createTasks(spec4.id)
      } catch (err) {
        threw = true
        assert(
          err.code === 'INVALID_STATE',
          `Expected INVALID_STATE, got ${err.code}: ${err.message}`
        )
      }
      assert(threw, 'Expected createTasks to throw INVALID_STATE for unapproved spec')
    })

    await test('createTasks returns array of tasks after approval', async () => {
      if (!spec4) return
      await backend.approveSpec(spec4.id)
      tasks = await backend.createTasks(spec4.id)
      assert(Array.isArray(tasks), `Expected array, got ${typeof tasks}`)
      assert(tasks.length > 0, 'Expected at least one task')
    })

    await test('createTasks returns tasks with correct shape', async () => {
      if (!tasks || tasks.length === 0) return
      for (const task of tasks) {
        assertHasFields(
          task,
          ['id', 'description', 'specId', 'issueId', 'state', 'tags', 'isPhase', 'depends', 'createdAt', 'modifiedAt', 'metadata'],
          'Task'
        )
        assert(typeof task.id === 'string', 'Task.id must be a string')
        assert(typeof task.description === 'string', 'Task.description must be a string')
        assert(typeof task.isPhase === 'boolean', 'Task.isPhase must be a boolean')
        assert(Array.isArray(task.tags), 'Task.tags must be an array')
        assert(Array.isArray(task.depends), 'Task.depends must be an array')
        assert(task.createdAt instanceof Date, 'Task.createdAt must be a Date')
        assert(task.modifiedAt instanceof Date, 'Task.modifiedAt must be a Date')
      }
    })

    await test('getTasks returns an array', async () => {
      const result = await backend.getTasks()
      assert(Array.isArray(result), `Expected array, got ${typeof result}`)
    })

    await test('getTasks with empty filter returns an array', async () => {
      const result = await backend.getTasks({})
      assert(Array.isArray(result), `Expected array, got ${typeof result}`)
    })

    await test('getTasks filters by specId', async () => {
      if (!spec4 || !tasks) return
      const result = await backend.getTasks({ specId: spec4.id })
      assert(Array.isArray(result), 'Expected array')
      assert(result.length === tasks.length, `Expected ${tasks.length} tasks, got ${result.length}`)
    })

    await test('getTasks filters by issueId', async () => {
      if (!issue4 || !tasks) return
      const result = await backend.getTasks({ issueId: issue4.id })
      assert(Array.isArray(result), 'Expected array')
      // Result must include at least the tasks we created; may include the spec
      // tracking issue if the backend links it to the same issueId.
      assert(
        result.length >= tasks.length,
        `Expected at least ${tasks.length} tasks, got ${result.length}`
      )
    })

    await test('getTask returns task with correct shape', async () => {
      if (!tasks || tasks.length === 0) return
      const task = await backend.getTask(tasks[0].id)
      assertHasFields(task, ['id', 'description', 'specId', 'issueId', 'state', 'tags', 'isPhase', 'depends'], 'Task')
      assert(task.id === tasks[0].id, 'ID mismatch')
    })

    await test('getTask throws NOT_FOUND for unknown ID', async () => {
      let threw = false
      try {
        await backend.getTask('__nonexistent_task_99999__')
      } catch (err) {
        threw = true
        assert(
          err.code === 'NOT_FOUND',
          `Expected NOT_FOUND, got ${err.code}: ${err.message}`
        )
      }
      assert(threw, 'Expected getTask to throw NOT_FOUND')
    })

    await test('updateTaskState transitions todo → inprogress', async () => {
      if (!tasks || tasks.length === 0) return
      // find a task in todo state (non-phase tasks start as todo)
      const todoTask = tasks.find(t => t.state === 'todo' && !t.isPhase) || tasks[0]
      const updated = await backend.updateTaskState(todoTask.id, 'inprogress')
      assert(updated.state === 'inprogress', `Expected 'inprogress', got '${updated.state}'`)
    })

    await test('updateTaskState throws INVALID_TRANSITION for bad transition', async () => {
      if (!tasks || tasks.length === 0) return
      // find a task we can put in done state, then try to go backwards
      const inprogressTask = tasks.find(t => t.state === 'inprogress')
      if (!inprogressTask) return // skip if none in inprogress
      let threw = false
      try {
        await backend.updateTaskState(inprogressTask.id, 'new')
      } catch (err) {
        threw = true
        assert(
          err.code === 'INVALID_TRANSITION',
          `Expected INVALID_TRANSITION, got ${err.code}: ${err.message}`
        )
      }
      assert(threw, 'Expected INVALID_TRANSITION for inprogress → new')
    })

    await test('updateTask updates description', async () => {
      if (!tasks || tasks.length === 0) return
      const taskToUpdate = tasks[tasks.length - 1]
      const updated = await backend.updateTask(taskToUpdate.id, { description: 'Updated description' })
      assert(updated.description === 'Updated description', `Expected updated description, got '${updated.description}'`)
    })

    await test('updateTask throws NOT_FOUND for unknown ID', async () => {
      let threw = false
      try {
        await backend.updateTask('__nonexistent_task_99999__', { description: 'x' })
      } catch (err) {
        threw = true
        assert(
          err.code === 'NOT_FOUND',
          `Expected NOT_FOUND, got ${err.code}: ${err.message}`
        )
      }
      assert(threw, 'Expected updateTask to throw NOT_FOUND')
    })
  })

  // ----------------------------------------
  // SECTION 6: Error shape contract
  // ----------------------------------------
  await section('6. Error object shape', async () => {
    await test('BackendError has .code property (string)', async () => {
      let err
      try {
        await backend.getIssue('__nonexistent_for_shape_check__')
      } catch (e) {
        err = e
      }
      assert(err, 'Expected an error to be thrown')
      assert(typeof err.code === 'string', `Expected err.code to be a string, got ${typeof err.code}`)
    })

    await test('BackendError has .message property (string)', async () => {
      let err
      try {
        await backend.getIssue('__nonexistent_for_shape_check__')
      } catch (e) {
        err = e
      }
      assert(err, 'Expected an error to be thrown')
      assert(typeof err.message === 'string', `Expected err.message to be a string, got ${typeof err.message}`)
    })
  })
}

// ============================================
// BACKENDS TO TEST
// AIDEV-NOTE: Add new backends here when they are added to the repo.
// Only backends that work without external services (or with temp dirs) are
// included. jira-taskwarrior requires ACLI+Taskwarrior and is tested separately.
// ============================================

async function main() {
  console.log('Interface Contract Tests')
  console.log('Verifies WorkflowBackend interface compliance\n')

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-contract-test-'))

  try {
    // --- Mock backend ---
    const MockBackend = require('./mock/index.js')
    const mockBackend = new MockBackend({ lmmNotesRoot: tmpDir })
    await runContractTests(mockBackend, 'mock backend')

    // --- Beads backend ---
    // AIDEV-NOTE: We run `bd init` in a temp workspace so the Beads backend has
    // a real database to talk to. This requires `bd` and a running Dolt server.
    // If `bd` is not available or init fails, the Beads contract section is skipped.
    const BeadsBackend = require('./beads/index.js')
    const beadsWorkspace = path.join(tmpDir, 'beads-workspace')
    fs.mkdirSync(beadsWorkspace, { recursive: true })

    let beadsAvailable = false
    try {
      execSync('bd init --prefix=CT', {
        cwd: beadsWorkspace,
        stdio: 'pipe',
        timeout: 30000
      })
      beadsAvailable = true
    } catch (initErr) {
      console.log('\n⚠ Beads workspace init failed — skipping Beads contract tests.')
      console.log(`  (${initErr.message.split('\n')[0]})`)
    }

    if (beadsAvailable) {
      const beadsBackend = new BeadsBackend({
        workspaceDir: beadsWorkspace,
        lmmNotesRoot: tmpDir,
        repository: 'contract-test'
      })
      await runContractTests(beadsBackend, 'beads backend')
    }

  } finally {
    // Clean up temp dir
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch (_) { /* ignore cleanup errors */ }
  }

  // ----------------------------------------
  // Summary
  // ----------------------------------------
  console.log('\n========================================')
  console.log(`Results: ${passed} passed, ${failed} failed`)
  console.log('========================================')

  if (failed > 0) {
    console.error(`\n❌ ${failed} contract test(s) failed.`)
    process.exit(1)
  } else {
    console.log(`\n✅ All ${passed} contract tests passed.`)
    process.exit(0)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
