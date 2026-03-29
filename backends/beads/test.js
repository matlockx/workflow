const assert = require('assert')
const BeadsBackend = require('./index')

function createBackend() {
  return new BeadsBackend({
    workspaceDir: '/tmp/workspace',
    beadsDir: '/tmp/workspace/.beads',
    homeDir: '/tmp/home',
    specsDir: '/tmp/specs',
    repository: 'opencode-test'
  })
}

async function run() {
  const backend = createBackend()

  backend._ensureWorkspace = async () => {}

  assert.strictEqual(backend._mapBeadsStatusToWorkState('open'), 'todo')
  assert.strictEqual(backend._mapBeadsStatusToWorkState('in_progress'), 'inprogress')
  assert.strictEqual(backend._mapBeadsStatusToWorkState('closed'), 'done')
  assert.strictEqual(backend._mapBeadsStatusToWorkState('open', 'review'), 'review')

  assert.strictEqual(backend._mapWorkStateToBeadsStatus('todo'), 'open')
  assert.strictEqual(backend._mapWorkStateToBeadsStatus('inprogress'), 'in_progress')
  assert.strictEqual(backend._mapWorkStateToBeadsStatus('done'), 'closed')

  const normalizedIssue = backend._normalizeIssue({
    id: 'bd-1',
    title: 'Test issue',
    description: 'desc',
    status: 'open',
    labels: ['impl'],
    priority: 1,
    issue_type: 'task',
    metadata: { issue_id: 'ISS-1' }
  })

  assert.strictEqual(normalizedIssue.id, 'bd-1')
  assert.strictEqual(normalizedIssue.summary, 'Test issue')
  assert.deepStrictEqual(normalizedIssue.labels, ['impl'])

  const normalizedTask = backend._normalizeTask({
    id: 'bd-2',
    title: 'Phase work',
    status: 'open',
    labels: ['impl', 'phase'],
    spec_id: 'SPEC-1',
    created_at: '2026-03-28T17:00:00Z',
    updated_at: '2026-03-28T17:05:00Z',
    metadata: {
      issue_id: 'ISS-1',
      opencode_kind: 'phase',
      opencode_state: 'review',
      depends: ['bd-1']
    }
  })

  assert.strictEqual(normalizedTask.id, 'bd-2')
  assert.strictEqual(normalizedTask.issueId, 'ISS-1')
  assert.strictEqual(normalizedTask.specId, 'SPEC-1')
  assert.strictEqual(normalizedTask.state, 'review')
  assert.strictEqual(normalizedTask.isPhase, true)
  assert.deepStrictEqual(normalizedTask.depends, ['bd-1'])

  assert.strictEqual(backend.isValidTransition('todo', 'inprogress'), true)
  assert.strictEqual(backend.isValidTransition('todo', 'done'), false)

  let capturedArgs = null
  backend._bdJson = async (args) => {
    capturedArgs = args
    return [{
      id: 'bd-3',
      title: 'Task',
      status: 'in_progress',
      created_at: '2026-03-28T17:00:00Z',
      updated_at: '2026-03-28T17:10:00Z',
      metadata: { issue_id: 'ISS-1', opencode_state: 'inprogress' },
      labels: ['impl']
    }]
  }
  backend.getTask = async () => ({
    id: 'bd-3',
    state: 'todo',
    metadata: { beadsMetadata: { issue_id: 'ISS-1' } }
  })

  const updated = await backend.updateTaskState('bd-3', 'inprogress')
  assert.deepStrictEqual(capturedArgs.slice(0, 4), ['update', 'bd-3', '--status', 'in_progress'])
  assert.strictEqual(updated.state, 'inprogress')

  console.log('All Beads backend tests passed')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
