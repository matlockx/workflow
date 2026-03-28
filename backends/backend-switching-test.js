#!/usr/bin/env node

/**
 * Backend switching / loader tests
 *
 * Verifies lib/backend-loader.js:
 *   - getBackend() loads the correct backend from opencode.json
 *   - getBackend(overrideType) respects the in-process override
 *   - parseBackendOverride() parses --backend=X and --backend X forms
 *   - validateBackendConfig() detects missing/invalid backends
 *   - listBackends() returns names of available backend directories
 *   - getBackendInfo() returns aggregate info
 *
 * Uses temp opencode.json files written to a temporary directory so the
 * real repo config is never touched and no live Jira/Beads service is needed.
 * The mock backend (zero external deps) is the target of all load tests.
 *
 * Run with: node backends/backend-switching-test.js
 *
 * AIDEV-NOTE: backend-loader.js uses process.cwd() for config lookup and
 * backend path resolution. We override process.cwd() via a lightweight shim
 * for the duration of each test that needs a specific cwd.
 */

const os = require('os')
const fs = require('fs')
const path = require('path')

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
// CWD SHIM
// ============================================

// AIDEV-NOTE: backend-loader.js calls process.cwd() directly, so we cannot
// inject it via arguments. Temporarily replace process.cwd with a shim that
// returns our temp directory, then restore it.

const originalCwd = process.cwd.bind(process)

function withCwd(dir, fn) {
  process.cwd = () => dir
  try {
    return fn()
  } finally {
    process.cwd = originalCwd
  }
}

async function withCwdAsync(dir, fn) {
  process.cwd = () => dir
  try {
    return await fn()
  } finally {
    process.cwd = originalCwd
  }
}

// ============================================
// TEMP DIRECTORY SETUP
// ============================================

// We need a temp directory that mirrors the real backends/ structure so that
// backend-loader can find 'mock' (and optionally 'beads', 'jira-taskwarrior').
// Rather than copying backends, we symlink or resolve the real repo root.

// Detect the real repo root (this script lives in backends/)
const repoRoot = path.resolve(__dirname, '..')

// Create a temp dir for per-test opencode.json files
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-backend-switching-'))

/**
 * Write a minimal opencode.json into a temp subdirectory and return that dir.
 * We symlink backends/ from repoRoot so the loader can resolve backend paths.
 */
function makeConfigDir(backendConfig) {
  const dir = fs.mkdtempSync(path.join(tmpDir, 'cfg-'))

  // Write opencode.json
  fs.writeFileSync(
    path.join(dir, 'opencode.json'),
    JSON.stringify({ workflow: { backend: backendConfig } }, null, 2)
  )

  // Symlink backends/ from real repo so backend paths resolve
  const backendsLink = path.join(dir, 'backends')
  if (!fs.existsSync(backendsLink)) {
    fs.symlinkSync(path.join(repoRoot, 'backends'), backendsLink)
  }

  return dir
}

// ============================================
// MODULE CACHE HELPERS
// ============================================

// backend-loader.js is cached after first require; we need a fresh load for
// each test that changes cwd, because loadBackendConfig() reads opencode.json
// at call time (not at require time). The module itself is stateless (no
// module-level side-effects that depend on cwd), so a single require is fine —
// each exported function re-reads opencode.json on every call.
const loader = require('../lib/backend-loader.js')
const {
  getBackend,
  listBackends,
  validateBackendConfig,
  getBackendInfo,
  loadBackendConfig,
  parseBackendOverride
} = loader

// ============================================
// TESTS
// ============================================

async function runTests() {
  console.log('\n========================================')
  console.log('Backend switching / loader tests')
  console.log('========================================')

  // ----------------------------------------------------------
  // SECTION 1: parseBackendOverride
  // ----------------------------------------------------------
  console.log('\n1. parseBackendOverride()')

  await test('1.1: --backend=mock extracts backendType and strips token', () => {
    const result = parseBackendOverride('--backend=mock some args')
    assert(result.backendType === 'mock', `Expected mock, got: ${result.backendType}`)
    assert(result.cleanedArguments === 'some args', `Unexpected cleaned: ${result.cleanedArguments}`)
  })

  await test('1.2: --backend mock (space-separated) works', () => {
    const result = parseBackendOverride('--backend mock some args')
    assert(result.backendType === 'mock', `Expected mock, got: ${result.backendType}`)
    assert(result.cleanedArguments === 'some args', `Unexpected cleaned: ${result.cleanedArguments}`)
  })

  await test('1.3: no --backend flag returns null backendType', () => {
    const result = parseBackendOverride('some args --other-flag')
    assert(result.backendType === null, `Expected null, got: ${result.backendType}`)
    assert(result.cleanedArguments === 'some args --other-flag',
      `Unexpected cleaned: ${result.cleanedArguments}`)
  })

  await test('1.4: empty string input returns null backendType and empty cleaned', () => {
    const result = parseBackendOverride('')
    assert(result.backendType === null, `Expected null, got: ${result.backendType}`)
    assert(result.cleanedArguments === '', `Expected empty, got: '${result.cleanedArguments}'`)
  })

  await test('1.5: --backend with no value throws an error', () => {
    let threw = false
    try {
      parseBackendOverride('--backend --other-flag')
    } catch (err) {
      threw = true
      assert(err.message.includes('Missing value'), `Wrong error message: ${err.message}`)
    }
    assert(threw, 'Expected an error for missing --backend value')
  })

  await test('1.6: --backend=beads at end of string works', () => {
    const result = parseBackendOverride('--backend=beads')
    assert(result.backendType === 'beads', `Expected beads, got: ${result.backendType}`)
    assert(result.cleanedArguments === '', `Expected empty, got: '${result.cleanedArguments}'`)
  })

  // ----------------------------------------------------------
  // SECTION 2: loadBackendConfig
  // ----------------------------------------------------------
  console.log('\n2. loadBackendConfig()')

  await test('2.1: loads mock backend config from opencode.json', () => {
    const dir = makeConfigDir({ type: 'mock', config: { foo: 'bar' } })
    const config = withCwd(dir, () => loadBackendConfig())
    assert(config.type === 'mock', `Expected mock, got: ${config.type}`)
    assert(config.config?.foo === 'bar', `Expected foo=bar, got: ${JSON.stringify(config.config)}`)
  })

  await test('2.2: throws when opencode.json is missing', () => {
    const emptyDir = fs.mkdtempSync(path.join(tmpDir, 'empty-'))
    let threw = false
    try {
      withCwd(emptyDir, () => loadBackendConfig())
    } catch (err) {
      threw = true
      assert(err.message.includes('opencode.json'), `Wrong error: ${err.message}`)
    }
    assert(threw, 'Expected error for missing opencode.json')
  })

  await test('2.3: throws when workflow.backend is missing from config', () => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'nobk-'))
    fs.writeFileSync(path.join(dir, 'opencode.json'), JSON.stringify({ other: true }))
    let threw = false
    try {
      withCwd(dir, () => loadBackendConfig())
    } catch (err) {
      threw = true
      assert(err.message.includes('workflow.backend'), `Wrong error: ${err.message}`)
    }
    assert(threw, 'Expected error for missing workflow.backend')
  })

  // ----------------------------------------------------------
  // SECTION 3: listBackends
  // ----------------------------------------------------------
  console.log('\n3. listBackends()')

  await test('3.1: returns array of backend names from repo root', () => {
    const backends = withCwd(repoRoot, () => listBackends())
    assert(Array.isArray(backends), 'Expected array')
    assert(backends.length >= 1, `Expected at least 1 backend, got ${backends.length}`)
  })

  await test('3.2: mock backend is listed', () => {
    const backends = withCwd(repoRoot, () => listBackends())
    assert(backends.includes('mock'), `Expected mock in: ${backends.join(', ')}`)
  })

  await test('3.3: beads backend is listed', () => {
    const backends = withCwd(repoRoot, () => listBackends())
    assert(backends.includes('beads'), `Expected beads in: ${backends.join(', ')}`)
  })

  await test('3.4: jira-taskwarrior backend is listed', () => {
    const backends = withCwd(repoRoot, () => listBackends())
    assert(backends.includes('jira-taskwarrior'), `Expected jira-taskwarrior in: ${backends.join(', ')}`)
  })

  await test('3.5: returns empty array when backends/ dir does not exist', () => {
    const emptyDir = fs.mkdtempSync(path.join(tmpDir, 'nobe-'))
    const backends = withCwd(emptyDir, () => listBackends())
    assert(Array.isArray(backends), 'Expected array')
    assert(backends.length === 0, `Expected empty, got: ${backends.join(', ')}`)
  })

  // ----------------------------------------------------------
  // SECTION 4: getBackend
  // ----------------------------------------------------------
  console.log('\n4. getBackend()')

  await test('4.1: loads mock backend configured in opencode.json', async () => {
    const dir = makeConfigDir({
      type: 'mock',
      config: { lmmNotesRoot: os.tmpdir() }
    })
    const backend = await withCwdAsync(dir, () => getBackend())
    assert(backend, 'Expected a backend instance')
    assert(typeof backend.listIssues === 'function', 'Expected listIssues method')
    assert(typeof backend.createSpec === 'function', 'Expected createSpec method')
  })

  await test('4.2: overrideType=mock loads mock regardless of config', async () => {
    // Config says beads, but override says mock
    const dir = makeConfigDir({
      type: 'beads',
      config: { workspaceDir: os.tmpdir() }
    })
    const backend = await withCwdAsync(dir, () => getBackend('mock'))
    assert(typeof backend.listIssues === 'function', 'Expected listIssues method')
  })

  await test('4.3: throws for non-existent backend type', () => {
    const dir = makeConfigDir({ type: 'nonexistent-backend-xyz' })
    let threw = false
    try {
      withCwd(dir, () => getBackend())
    } catch (err) {
      threw = true
      assert(
        err.message.includes('nonexistent-backend-xyz') || err.message.includes('not found'),
        `Wrong error message: ${err.message}`
      )
    }
    assert(threw, 'Expected error for non-existent backend')
  })

  await test('4.4: mock backend instance implements all required interface methods', async () => {
    const dir = makeConfigDir({ type: 'mock', config: { lmmNotesRoot: os.tmpdir() } })
    const backend = withCwd(dir, () => getBackend())

    const REQUIRED = [
      'listIssues', 'getIssue', 'createIssue', 'updateIssue',
      'createSpec', 'getSpec', 'approveSpec', 'rejectSpec',
      'createTasks', 'getTasks', 'getTask', 'updateTaskState', 'updateTask',
      'getWorkStates', 'getValidTransitions', 'isValidTransition'
    ]

    for (const method of REQUIRED) {
      assert(typeof backend[method] === 'function', `Missing method: ${method}`)
    }
  })

  // ----------------------------------------------------------
  // SECTION 5: validateBackendConfig
  // ----------------------------------------------------------
  console.log('\n5. validateBackendConfig()')

  await test('5.1: valid mock config returns {valid: true}', () => {
    const dir = makeConfigDir({ type: 'mock', config: { lmmNotesRoot: os.tmpdir() } })
    const result = withCwd(dir, () => validateBackendConfig())
    assert(result.valid === true, `Expected valid, errors: ${result.errors.join(', ')}`)
    assert(Array.isArray(result.errors), 'Expected errors array')
    assert(result.errors.length === 0, `Expected no errors, got: ${result.errors.join(', ')}`)
  })

  await test('5.2: non-existent backend returns {valid: false} with errors', () => {
    const dir = makeConfigDir({ type: 'ghost-backend-zzz' })
    const result = withCwd(dir, () => validateBackendConfig())
    assert(result.valid === false, 'Expected invalid')
    assert(result.errors.length > 0, 'Expected at least one error message')
  })

  await test('5.3: overrideType=mock validates successfully from any dir', () => {
    // Use a dir that points to ghost, but override to mock
    const dir = makeConfigDir({ type: 'ghost-backend-zzz' })
    const result = withCwd(dir, () => validateBackendConfig('mock'))
    assert(result.valid === true, `Expected valid for mock override, errors: ${result.errors.join(', ')}`)
  })

  await test('5.4: missing opencode.json returns {valid: false}', () => {
    const emptyDir = fs.mkdtempSync(path.join(tmpDir, 'val-empty-'))
    const result = withCwd(emptyDir, () => validateBackendConfig())
    assert(result.valid === false, 'Expected invalid')
    assert(result.errors.length > 0, 'Expected errors')
  })

  // ----------------------------------------------------------
  // SECTION 6: getBackendInfo
  // ----------------------------------------------------------
  console.log('\n6. getBackendInfo()')

  await test('6.1: returns configured type and available backends', () => {
    const dir = makeConfigDir({ type: 'mock', config: {} })
    const info = withCwd(dir, () => getBackendInfo())
    assert(info.configured === 'mock', `Expected mock, got: ${info.configured}`)
    assert(Array.isArray(info.available), 'Expected available array')
    assert(info.available.includes('mock'), 'Expected mock in available')
  })

  await test('6.2: valid field is true for valid mock config', () => {
    const dir = makeConfigDir({ type: 'mock', config: { lmmNotesRoot: os.tmpdir() } })
    const info = withCwd(dir, () => getBackendInfo())
    assert(info.valid === true, `Expected valid, got: ${info.valid}`)
  })

  await test('6.3: returns error message when opencode.json is missing', () => {
    const emptyDir = fs.mkdtempSync(path.join(tmpDir, 'info-empty-'))
    const info = withCwd(emptyDir, () => getBackendInfo())
    assert(info.configured === null, `Expected null, got: ${info.configured}`)
    assert(typeof info.error === 'string', 'Expected error string')
    assert(info.valid === false, 'Expected invalid')
  })

  // ----------------------------------------------------------
  // SECTION 7: End-to-end with real mock backend operations
  // ----------------------------------------------------------
  console.log('\n7. End-to-end: load mock backend and perform operations')

  await test('7.1: loaded mock backend can createIssue', async () => {
    const dir = makeConfigDir({ type: 'mock', config: { lmmNotesRoot: os.tmpdir() } })
    const backend = withCwd(dir, () => getBackend())
    const issue = await backend.createIssue({
      summary: 'Switching test issue',
      description: 'Created via backend-switching-test'
    })
    assert(issue.id, 'Missing issue id')
    assert(issue.summary === 'Switching test issue', `Wrong summary: ${issue.summary}`)
  })

  await test('7.2: loaded mock backend respects --backend=mock override via parseBackendOverride', async () => {
    const dir = makeConfigDir({ type: 'mock', config: { lmmNotesRoot: os.tmpdir() } })
    const { backendType } = parseBackendOverride('--backend=mock')
    const backend = withCwd(dir, () => getBackend(backendType))
    const states = backend.getWorkStates()
    assert(Array.isArray(states) && states.length > 0, 'Expected work states from mock backend')
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

  console.log('\n✅ All backend switching tests passed!\n')
}

// ============================================
// RUN + CLEANUP
// ============================================

runTests()
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
  .finally(() => {
    // Restore cwd shim (safety net, already restored per-test)
    process.cwd = originalCwd

    // Best-effort cleanup
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch (_) {}
  })
