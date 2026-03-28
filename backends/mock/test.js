#!/usr/bin/env node

/**
 * Simple test file for mock backend validation
 * Run with: node backends/mock/test.js
 */

const MockBackend = require('./index.js')

async function runTests() {
  console.log('🧪 Testing Mock Backend Implementation\n')

  const backend = new MockBackend({
    projectKey: 'TEST',
    autoGenerateSpecs: true,
    autoGenerateTasks: true,
    initialIssues: [
      {
        summary: 'Implement user authentication',
        description: 'Add login and signup functionality',
        status: 'To Do',
        labels: ['feature', 'security'],
        priority: 'High'
      },
      {
        summary: 'Fix pagination bug',
        description: 'Pagination breaks on last page',
        status: 'In Progress',
        labels: ['bug'],
        priority: 'Medium'
      },
      {
        summary: 'Add dark mode',
        description: 'Implement dark mode theme',
        status: 'To Do',
        labels: ['feature', 'ui'],
        priority: 'Low'
      }
    ]
  })

  try {
    // Test 1: List issues
    console.log('✓ Test 1: List issues')
    const issues = await backend.listIssues({ limit: 5 })
    console.log(`  Found ${issues.length} issues`)
    if (issues.length === 0) throw new Error('Expected some issues')

    // Test 2: Get specific issue
    console.log('✓ Test 2: Get specific issue')
    const issue = await backend.getIssue(issues[0].id)
    console.log(`  Retrieved issue: ${issue.id} - ${issue.summary}`)
    if (!issue) throw new Error('Expected to retrieve issue')

    // Test 3: Create spec
    console.log('✓ Test 3: Create spec')
    const spec = await backend.createSpec(issue.id)
    console.log(`  Created spec: ${spec.id}`)
    if (!spec.id) throw new Error('Expected spec ID')

    // Test 4: Get spec
    console.log('✓ Test 4: Get spec')
    const retrievedSpec = await backend.getSpec(issue.id)
    console.log(`  Retrieved spec: ${retrievedSpec.id} (state: ${retrievedSpec.state})`)
    if (retrievedSpec.id !== spec.id) throw new Error('Spec ID mismatch')
    if (retrievedSpec.state !== 'draft') throw new Error('Expected draft state')

    // Test 5: Approve spec
    console.log('✓ Test 5: Approve spec')
    const approvedSpec = await backend.approveSpec(spec.id)
    console.log(`  Spec state: ${approvedSpec.state}`)
    if (approvedSpec.state !== 'approved') throw new Error('Expected approved state')

    // Test 6: Create tasks
    console.log('✓ Test 6: Create tasks')
    const tasks = await backend.createTasks(spec.id)
    console.log(`  Created ${tasks.length} tasks`)
    if (tasks.length === 0) throw new Error('Expected some tasks')

    // Test 7: Get tasks
    console.log('✓ Test 7: Get tasks')
    const allTasks = await backend.getTasks({ specId: spec.id })
    console.log(`  Retrieved ${allTasks.length} tasks`)
    if (allTasks.length !== tasks.length) throw new Error(`Expected ${tasks.length} tasks`)

    // Test 8: Update task state
    console.log('✓ Test 8: Update task state')
    const updatedTask = await backend.updateTaskState(tasks[0].id, 'inprogress')
    console.log(`  Task state: ${updatedTask.state}`)
    if (updatedTask.state !== 'inprogress') throw new Error('Expected inprogress state')

    // Test 9: Get work states
    console.log('✓ Test 9: Get work states')
    const states = await backend.getWorkStates()
    console.log(`  Available states: ${states.map(s => s.name).join(', ')}`)
    if (states.length === 0) throw new Error('Expected work states')

    // Test 10: Validate state transitions
    console.log('✓ Test 10: Validate state transitions')
    const canTransition = await backend.isValidTransition('todo', 'inprogress')
    console.log(`  Can transition todo → inprogress: ${canTransition}`)
    if (!canTransition) throw new Error('Expected valid transition')

    const invalidTransition = await backend.isValidTransition('todo', 'done')
    console.log(`  Can transition todo → done: ${invalidTransition}`)
    if (invalidTransition) throw new Error('Expected invalid transition')

    // Test 11: Error handling - invalid issue key
    console.log('✓ Test 11: Error handling - invalid issue key')
    try {
      await backend.getIssue('INVALID-999')
      throw new Error('Expected error for invalid issue key')
    } catch (error) {
      if (error.code !== 'NOT_FOUND') throw error
      console.log(`  Correctly threw error: ${error.message}`)
    }

    // Test 12: Error handling - invalid state transition
    console.log('✓ Test 12: Error handling - invalid state transition')
    try {
      // Try to transition from inprogress to draft (invalid)
      await backend.updateTaskState(tasks[0].id, 'draft')
      throw new Error('Expected error for invalid state transition')
    } catch (error) {
      if (error.code !== 'INVALID_TRANSITION') throw error
      console.log(`  Correctly threw error: ${error.message}`)
    }

    console.log('\n✅ All tests passed!\n')
    return true
  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// Run tests
runTests().then(() => {
  console.log('Mock backend is working correctly.')
  process.exit(0)
}).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
