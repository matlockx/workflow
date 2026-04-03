#!/usr/bin/env node

/**
 * Mock tests for Jira-Taskwarrior backend
 * 
 * These tests use mocked ACLI and Taskwarrior commands
 * to validate the backend logic without requiring actual installations.
 * 
 * Run with: node backends/jira-taskwarrior/test.js
 *
 * AIDEV-NOTE: ADR-001 removed the spec stage. Tests 3-6 previously tested
 * createSpec/getSpec/approveSpec and spec-based createTasks. They are now
 * replaced with a direct createTasks(issueId) test flow.
 */

// ============================================
// MOCK SETUP (MUST BE BEFORE REQUIRE)
// ============================================

// Store original exec
const originalExec = require('child_process').exec

// Mock command outputs
const mockOutputs = {
  // ACLI outputs
  'acli jira auth status': `✓ Authenticated\n  Site: example.atlassian.net\n  Email: test@example.com\n  Authentication Type: oauth\n`,
  'acli jira workitem search': JSON.stringify({
    issues: [
      {
        key: 'PROJ-123',
        fields: {
          summary: 'Implement user authentication',
          description: { content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Add login functionality' }] }] },
          status: { name: 'To Do' },
          assignee: { displayName: 'John Doe' },
          labels: ['backend', 'security'],
          priority: { name: 'High' },
          issuetype: { name: 'Story' },
          created: '2026-03-01T10:00:00.000Z',
          updated: '2026-03-28T14:00:00.000Z',
          reporter: { displayName: 'Jane Smith' }
        }
      }
    ]
  }),
  'acli jira workitem view': JSON.stringify({
    key: 'PROJ-123',
    fields: {
      summary: 'Implement user authentication',
      description: { content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Add login functionality' }] }] },
      status: { name: 'To Do' },
      assignee: { displayName: 'John Doe' },
      labels: ['backend', 'security'],
      priority: { name: 'High' },
      issuetype: { name: 'Story' },
      created: '2026-03-01T10:00:00.000Z',
      updated: '2026-03-28T14:00:00.000Z',
      reporter: { displayName: 'Jane Smith' }
    }
  }),
  'acli jira workitem create': JSON.stringify({
    key: 'PROJ-124',
    fields: {
      summary: 'New issue',
      description: { content: [] },
      status: { name: 'To Do' },
      assignee: null,
      labels: [],
      priority: { name: 'Medium' },
      issuetype: { name: 'Story' }
    }
  }),
  
  // Taskwarrior outputs
  'task show': `
uda.jiraid.type=string
uda.jiraid.label=Jira ID
uda.work_state.type=string
uda.work_state.label=Work State
uda.repository.type=string
uda.repository.label=Repository
  `,
  
  // Task export - no impl tasks exist yet
  'task jiraid:PROJ-123 +impl export': '',
  
  // Task export - phase and impl tasks
  'task jiraid:PROJ-123 +impl export (after create)': [
    {
      uuid: 'aaa-111-222-333-444',
      description: 'Phase 1: Implementation',
      status: 'pending',
      work_state: 'todo',
      jiraid: 'PROJ-123',
      repository: 'default',
      project: 'PROJ-123.implementation',
      tags: ['impl', 'phase'],
      entry: '2026-03-28T14:15:00Z',
      depends: []
    },
    {
      uuid: 'bbb-111-aaa-bbb-ccc',
      description: 'Implement task 1 for Implementation',
      status: 'pending',
      work_state: 'todo',
      jiraid: 'PROJ-123',
      repository: 'default',
      project: 'PROJ-123.implementation',
      tags: ['impl'],
      entry: '2026-03-28T14:15:01Z',
      depends: ['aaa-111-222-333-444']
    },
    {
      uuid: 'aaa-222-333-444-555',
      description: 'Phase 2: Testing',
      status: 'pending',
      work_state: 'todo',
      jiraid: 'PROJ-123',
      repository: 'default',
      project: 'PROJ-123.testing',
      tags: ['impl', 'phase'],
      entry: '2026-03-28T14:15:02Z',
      depends: []
    }
  ].map(t => JSON.stringify(t)).join('\n'),
  
  // Individual task queries
  'task uuid:aaa-111-222-333-444 export': JSON.stringify({
    uuid: 'aaa-111-222-333-444',
    description: 'Phase 1: Implementation',
    status: 'pending',
    work_state: 'todo',
    jiraid: 'PROJ-123',
    repository: 'default',
    project: 'PROJ-123.implementation',
    tags: ['impl', 'phase'],
    entry: '2026-03-28T14:15:00Z',
    depends: []
  }),
  
  'task uuid:bbb-111-aaa-bbb-ccc export': JSON.stringify({
    uuid: 'bbb-111-aaa-bbb-ccc',
    description: 'Implement task 1 for Implementation',
    status: 'pending',
    work_state: 'todo',
    jiraid: 'PROJ-123',
    repository: 'default',
    project: 'PROJ-123.implementation',
    tags: ['impl'],
    entry: '2026-03-28T14:15:01Z',
    depends: ['aaa-111-222-333-444']
  }),
  
  'task uuid:bbb-111-aaa-bbb-ccc export (after state update)': JSON.stringify({
    uuid: 'bbb-111-aaa-bbb-ccc',
    description: 'Implement task 1 for Implementation',
    status: 'pending',
    work_state: 'inprogress',
    jiraid: 'PROJ-123',
    repository: 'default',
    project: 'PROJ-123.implementation',
    tags: ['impl'],
    entry: '2026-03-28T14:15:01Z',
    modified: '2026-03-28T14:20:00Z',
    depends: ['aaa-111-222-333-444']
  })
}

// Track task creation sequence
// AIDEV-NOTE: No spec UUID needed — ADR-001 removed spec tasks.
let taskAddCounter = 0
const taskUUIDs = [
  'aaa-111-222-333-444',  // phase 1
  'bbb-111-aaa-bbb-ccc',  // task 1.1
  'bbb-111-ccc-ddd-eee',  // task 1.2
  'aaa-222-333-444-555',  // phase 2
  'bbb-222-aaa-bbb-ccc',  // task 2.1
  'bbb-222-ccc-ddd-eee'   // task 2.2
]

// Track state changes
const taskStates = {}


// Mock exec
require('child_process').exec = (cmd, options, callback) => {
  // Handle callback variants
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  
  // Simulate async execution
  setImmediate(() => {
    try {
      let stdout = ''
      let stderr = ''
      
      // Match command to mock output
      if (cmd.includes('task add')) console.log('Mock exec (task add):', cmd) // Debug
      
      if (cmd.includes('auth status')) {
        stdout = mockOutputs['acli jira auth status']
      } else if (cmd.includes('workitem search')) {
        stdout = mockOutputs['acli jira workitem search']
      } else if (cmd.includes('workitem view')) {
        stdout = mockOutputs['acli jira workitem view']
      } else if (cmd.includes('workitem create')) {
        stdout = mockOutputs['acli jira workitem create']
      } else if (cmd.includes('task show')) {
        stdout = mockOutputs['task show']
      } else if (cmd.includes('task add')) {
        // Generate UUID for new task
        const uuid = taskUUIDs[taskAddCounter++] || `generated-uuid-${Date.now()}`
        stdout = `Created task ${taskAddCounter} with uuid ${uuid}\n`
        console.log('  -> Returning UUID:', uuid) // Debug
        
        // Initialize state and extract task details from command
        const description = cmd.match(/"([^"]+)"/)?.[1] || 'Task'
        const tags = []
        if (cmd.includes('+impl')) tags.push('impl')
        if (cmd.includes('+phase')) tags.push('phase')
        
        const jiraid = cmd.match(/jiraid:(\S+)/)?.[1]
        const work_state = cmd.match(/work_state:(\S+)/)?.[1] || 'todo'
        const repository = cmd.match(/repository:(\S+)/)?.[1]
        const project = cmd.match(/project:(\S+)/)?.[1]
        const depends = cmd.match(/depends:(\S+)/)?.[1]
        
        taskStates[uuid] = {
          uuid,
          description,
          status: 'pending',
          work_state,
          jiraid,
          repository,
          project,
          tags,
          depends: depends ? [depends] : [],
          entry: new Date().toISOString()
        }
      } else if (cmd.match(/task uuid:([a-f0-9-]+) export$/)) {
        // Generic UUID export - check if task exists in taskStates
        const match = cmd.match(/task uuid:([a-f0-9-]+) export$/)
        const uuid = match[1]
        
        if (taskStates[uuid]) {
          stdout = JSON.stringify(taskStates[uuid])
        } else if (mockOutputs[`task uuid:${uuid} export`]) {
          stdout = mockOutputs[`task uuid:${uuid} export`]
        } else {
          stdout = ''
        }
      } else if (cmd.match(/task (.+) modify work_state:(\w+)/)) {
        // State update
        const match = cmd.match(/task (.+) modify work_state:(\w+)/)
        const uuid = match[1]
        const newState = match[2]
        
        if (taskStates[uuid]) {
          taskStates[uuid].work_state = newState
        }
        
        stdout = 'Modified 1 task\n'
      } else if (cmd.match(/task (.+) done/)) {
        // Mark completed
        const match = cmd.match(/task (.+) done/)
        const uuid = match[1]
        
        if (taskStates[uuid]) {
          taskStates[uuid].status = 'completed'
        }
        
        stdout = `Completed task 1\n`
      } else if (cmd.includes('task uuid:bbb-111-aaa-bbb-ccc export')) {
        // Task export
        const data = JSON.parse(mockOutputs['task uuid:bbb-111-aaa-bbb-ccc export'])
        data.status = taskStates['bbb-111-aaa-bbb-ccc']?.status || data.status
        data.work_state = taskStates['bbb-111-aaa-bbb-ccc']?.work_state || data.work_state
        stdout = JSON.stringify(data)
      } else if (cmd.includes('task uuid:aaa-111-222-333-444 export')) {
        stdout = mockOutputs['task uuid:aaa-111-222-333-444 export']
      } else if (cmd.includes('task jiraid:PROJ-123 +impl export')) {
        // Check if tasks have been created
        if (taskStates['aaa-111-222-333-444']) {
          stdout = mockOutputs['task jiraid:PROJ-123 +impl export (after create)']
        } else {
          stdout = ''
        }
      } else {
        // Unknown command - empty output
        stdout = ''
      }
      
      callback(null, { stdout, stderr })
    } catch (error) {
      callback(error)
    }
  })
}

// NOW load the backend (after mocks are in place)
const JiraTaskwarriorBackend = require('./index.js')

// ============================================
// TESTS
// ============================================

async function runTests() {
  console.log('🧪 Testing Jira-Taskwarrior Backend\n')
  
  const backend = new JiraTaskwarriorBackend({
    jiraSite: 'test-site.atlassian.net',
    jiraProject: 'PROJ',
    jiraEmail: 'test@example.com',
    repository: 'default'
  })
  
  try {
    // Test 1: List issues
    console.log('✓ Test 1: List issues from Jira')
    const issues = await backend.listIssues({ limit: 10 })
    console.log(`  Found ${issues.length} issues`)
    if (issues.length === 0) throw new Error('Expected some issues')
    if (!issues[0].id) throw new Error('Issue missing ID')
    console.log(`  First issue: ${issues[0].id} - ${issues[0].summary}`)
    
    // Test 2: Get specific issue
    console.log('✓ Test 2: Get specific issue')
    const issue = await backend.getIssue('PROJ-123')
    console.log(`  Retrieved issue: ${issue.id}`)
    if (issue.id !== 'PROJ-123') throw new Error('Wrong issue ID')
    if (!issue.summary) throw new Error('Issue missing summary')
    
    // Test 3: Create tasks directly from issue (ADR-001: no spec gate)
    console.log('✓ Test 3: Create tasks directly from issue')
    const tasks = await backend.createTasks('PROJ-123')
    console.log(`  Created ${tasks.length} tasks`)
    if (tasks.length === 0) throw new Error('Expected some tasks')
    
    const phaseTasks = tasks.filter(t => t.isPhase)
    const implTasks = tasks.filter(t => !t.isPhase)
    console.log(`  Phases: ${phaseTasks.length}, Implementation tasks: ${implTasks.length}`)
    
    // Test 4: Get tasks
    console.log('✓ Test 4: Get tasks by filter')
    const allTasks = await backend.getTasks({ issueId: 'PROJ-123' })
    console.log(`  Retrieved ${allTasks.length} tasks`)
    if (allTasks.length !== tasks.length) throw new Error('Task count mismatch')
    
    // Test 5: Get specific task
    console.log('✓ Test 5: Get specific task')
    const task = await backend.getTask('bbb-111-aaa-bbb-ccc')
    console.log(`  Retrieved task: ${task.description}`)
    if (task.id !== 'bbb-111-aaa-bbb-ccc') throw new Error('Wrong task ID')
    if (task.state !== 'todo') throw new Error('Task should be in todo state')
    
    // Test 6: Update task state
    console.log('✓ Test 6: Update task state')
    const updatedTask = await backend.updateTaskState('bbb-111-aaa-bbb-ccc', 'inprogress')
    console.log(`  Task state: ${updatedTask.state}`)
    if (updatedTask.state !== 'inprogress') throw new Error('Task should be inprogress')
    
    // Test 7: Get work states
    console.log('✓ Test 7: Get work states')
    const states = backend.getWorkStates()
    console.log(`  Available states: ${states.join(', ')}`)
    if (states.length === 0) throw new Error('Expected work states')
    if (!states.includes('todo')) throw new Error('Missing todo state')
    if (!states.includes('inprogress')) throw new Error('Missing inprogress state')
    
    // Test 8: Validate state transitions
    console.log('✓ Test 8: Validate state transitions')
    const canTransition = backend.isValidTransition('todo', 'inprogress')
    console.log(`  Can transition todo → inprogress: ${canTransition}`)
    if (!canTransition) throw new Error('Expected valid transition')
    
    const invalidTransition = backend.isValidTransition('todo', 'done')
    console.log(`  Can transition todo → done: ${invalidTransition}`)
    if (invalidTransition) throw new Error('Expected invalid transition')
    
    // Test 9: Error handling - invalid state transition
    console.log('✓ Test 9: Error handling - invalid state transition')
    try {
      await backend.updateTaskState('bbb-111-aaa-bbb-ccc', 'done')
      throw new Error('Expected error for invalid transition')
    } catch (error) {
      if (error.code !== 'INVALID_TRANSITION') throw error
      console.log(`  Correctly threw error: ${error.message}`)
    }
    
    // Test 10: ADF conversion
    console.log('✓ Test 10: ADF conversion')
    const adf = backend._markdownToADF('Hello\nWorld')
    console.log(`  Converted to ADF: ${JSON.stringify(adf).substring(0, 50)}...`)
    if (!adf.content) throw new Error('ADF missing content')
    
    const markdown = backend._adfToMarkdown(adf)
    console.log(`  Converted back to markdown: ${markdown}`)
    if (!markdown.includes('Hello')) throw new Error('Markdown conversion failed')
    
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
  console.log('Jira-Taskwarrior backend is working correctly.')
  
  // Restore original functions
  require('child_process').exec = originalExec
  
  process.exit(0)
}).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
