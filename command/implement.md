---
description: Implement tasks from an approved Jira spec
agent: build
---

# Implement Jira tasks

Execute implementation tasks for a Jira issue using its approved specification.

## Input

- **$ARGUMENTS**: Jira ID (e.g., "IMP-7070")

## Steps

1. **Extract Jira ID from arguments**
   - The Jira ID is provided in $ARGUMENTS (e.g., "IMP-7070")
   - Extract just the ID

2. **Find the SPEC task and validate approval**
   - Run: `task jiraid:$ARGUMENTS +spec export`
   - Parse JSON to extract:
     - `uuid` - The spec task UUID
     - `spec_state` - Current approval state
   - If no spec task found: Exit with error "No spec task found for <JIRAKEY>. Create one with: specjira <JIRAKEY>"
   - If `spec_state` != "approved": Exit with error "Spec is not approved (current state: <state>). Please approve the spec before implementing."

3. **Fetch all phase tasks**
   - Run: `task jiraid:$ARGUMENTS +phase status:pending export`
   - Parse JSON to get ordered list of phases
   - Sort phases by task ID number (lowest to highest)
   - If no phases found: Exit with error "No implementation phases found for <JIRAKEY>. Run: createtasks <JIRAKEY>"

4. **Find the current active phase**
   - Iterate through phases in order (sorted by task ID)
   - For each phase, check if it has any pending implementation tasks:
     - Run: `task jiraid:$ARGUMENTS +impl -phase status:pending depends:<phase-uuid> export`
   - The first phase with pending tasks is the "active phase"
   - If all phases have no pending tasks:
     - Check if all phases are completed
     - If yes: Report success "✅ All implementation tasks completed for <JIRAKEY>!"
     - Exit gracefully

5. **Fetch implementation tasks for the active phase**
   - Run: `task jiraid:$ARGUMENTS +impl -phase status:pending depends:<phase-uuid> export`
   - Parse JSON to get all implementation tasks in this phase
   - Sort tasks by task ID number (lowest to highest)
   - Exclude any tasks that still have `+phase` tag (safety check)

6. **Identify the first READY task**
   - A task is READY when all its dependencies are completed
   - For each task in sorted order:
     - Get the task's `depends` field (array of UUIDs)
     - For each dependency UUID:
       - Run: `task uuid:<dep-uuid> export`
       - Check if status is "completed" or "deleted"
     - If ALL dependencies are completed/deleted, the task is READY
   - Select the first READY task
   - If no READY tasks found:
     - Report: "⚠️  No tasks are ready to implement in phase '<phase-name>'. Check dependencies:"
     - Show: `task jiraid:<JIRAKEY> +impl depends.any: list`
     - Exit gracefully

7. **Extract spec file path from task**
   - First, check task annotations for pattern: `Spec: <path>`
   - If not found in annotations, parse task description for line starting with "Spec: <path>"
   - Extract the spec file path
   - If spec path not found: Exit with error "No spec file found in task annotations or description for task <task-id>"

8. **Determine full spec path and read spec**
   - If spec has already been cached in this session:
     - Use cached spec content
     - Skip to step 9
   - Otherwise, resolve spec path:
     - If `$LLM_NOTES_ROOT` is set:
       - Use: `$LLM_NOTES_ROOT/<spec-path>`
     - Otherwise:
       - Use: `<spec-path>` (relative to current directory or git root)
   - Verify file exists
   - If not found: Exit with error "Spec file not found: <full-path>"
   - Read the full spec file content
   - Cache the spec content for this session (store in memory/context)

9. **Present task to user**
   - Display a formatted summary:

     ```
     ═══════════════════════════════════════════════════════
     📋 Next Task to Implement
     ═══════════════════════════════════════════════════════
     
     Jira:     <JIRAKEY>
     Phase:    <phase-name>
     Task ID:  <task-id>
     
     Title:    <task-description-first-line>
     
     Description:
     <task-full-description>
     
     Acceptance Criteria:
     <extracted-acceptance-criteria>
     
     Estimated Effort: <effort-estimate>
     
     Spec: <spec-file-path>
     
     Dependencies: <list-of-completed-dependencies or "None">
     ═══════════════════════════════════════════════════════
     ```

   - Ask: "Ready to implement this task? (yes/no)"
   - Wait for user confirmation
   - If user declines: Exit gracefully with message "Task implementation cancelled. Resume with: /implement <JIRAKEY>"

10. **Implement the task**
    - Provide the build agent with:
      - **Full spec content** (Requirements and Design sections)
      - **Task description** with acceptance criteria
      - **Estimated effort** (to scope work appropriately)
      - **Context**: This is task <n> of <total> in phase "<phase-name>"
    
    - Implementation guidance:
      - If task description contains "test" or "Write tests":
        - Follow TDD approach
        - Create test files in appropriate test directory
        - Use testing framework specified in spec
      - If task is implementation:
        - Follow design patterns from spec
        - Reference component descriptions
        - Follow acceptance criteria strictly
      - Consider estimated effort to avoid over-engineering
    
    - Error handling:
      - If any error occurs during implementation:
        - Stop immediately
        - Report full error details with stack trace
        - Show files that were created/modified
        - Suggest debugging steps
        - Exit with error status

11. **Report completion**
    - Show a detailed summary of changes:

      ```
      ═══════════════════════════════════════════════════════
      ✅ Task Implementation Complete
      ═══════════════════════════════════════════════════════
      
      Changes made:
      <list-of-files-created>
      <list-of-files-modified>
      <list-of-files-deleted>
      
      Summary:
      <brief-description-of-what-was-implemented>
      
      ═══════════════════════════════════════════════════════
      Next Steps:
      ═══════════════════════════════════════════════════════
      
      1. Review the changes above
      2. Run tests: /test
      3. Verify acceptance criteria are met
      
      Task info: task <task-uuid> info
      ═══════════════════════════════════════════════════════
      ```

    - Ask: "Mark this task as completed? (yes/no)"

12. **Mark task as done (if confirmed)**
    - If user confirms YES:
      - Run: `task <task-uuid> done`
      - Capture output
      - Report: "✅ Task marked as completed"
    - If user declines NO:
      - Report: "Task remains pending. Mark it done later with: task <task-uuid> done"
      - Exit gracefully

13. **Check for next task in current phase**
    - Re-run step 5-6 to find the next READY task in the current phase
    - If next READY task found in current phase:
      - Display brief summary:
        ```
        ───────────────────────────────────────────────────────
        Next ready task in this phase:
        
        Task ID:  <task-id>
        Title:    <task-description-first-line>
        Estimated: <effort>
        ───────────────────────────────────────────────────────
        ```
      - Ask: "Continue with next task? (yes/no)"
      - If YES: Return to step 7 (use cached spec if available)
      - If NO: Exit with message "Session paused. Resume with: /implement <JIRAKEY>"
    
    - If no more READY tasks in current phase:
      - Proceed to step 14

14. **Handle phase completion and transition**
    - Check if all implementation tasks in current phase are completed:
      - Run: `task jiraid:$ARGUMENTS +impl -phase status:pending depends:<current-phase-uuid> export`
      - If count is 0, all tasks in this phase are done
    
    - If phase is complete:
      - Report: "✅ All tasks in phase '<phase-name>' are complete!"
      - Mark phase task as done: `task <phase-uuid> done`
      - Report: "✅ Phase '<phase-name>' marked as completed"
      
      - Return to step 4 to find next active phase
      - If next phase found:
        - Display:
          ```
          ═══════════════════════════════════════════════════════
          Moving to next phase: <next-phase-name>
          ═══════════════════════════════════════════════════════
          ```
        - Ask: "Continue with next phase? (yes/no)"
        - If YES: Continue to step 5 with new phase
        - If NO: Exit with message "Session paused. Resume with: /implement <JIRAKEY>"
      
      - If no more phases (all complete):
        - Report final success:
          ```
          ═══════════════════════════════════════════════════════
          🎉 ALL IMPLEMENTATION COMPLETE! 🎉
          ═══════════════════════════════════════════════════════
          
          Jira:     <JIRAKEY>
          Status:   All phases and tasks completed
          
          Next steps:
          1. Review all changes
          2. Run full test suite: /test
          3. Create PR (if applicable)
          4. Update Jira ticket status
          
          View completed tasks:
          task jiraid:<JIRAKEY> +impl status:completed list
          ═══════════════════════════════════════════════════════
          ```
        - Exit successfully
    
    - If phase is not complete (has tasks waiting on dependencies):
      - Report:
        ```
        ⚠️  No more ready tasks in current phase.
        
        Remaining tasks are blocked by dependencies.
        Check task status: task jiraid:<JIRAKEY> +impl status:pending list
        ```
      - Exit gracefully

## Error Handling

### Spec not found
```
❌ Error: No spec task found for <JIRAKEY>

Create a spec first:
  /specjira <JIRAKEY>
```

### Spec not approved
```
❌ Error: Spec must be approved before implementation

Current state: <state>

To approve:
  task jiraid:<JIRAKEY> +spec modify spec_state:approved
```

### No implementation tasks
```
❌ Error: No implementation tasks found for <JIRAKEY>

Create implementation tasks:
  /createtasks <JIRAKEY>
```

### No READY tasks
```
⚠️  No tasks are ready to implement

Some tasks may be blocked by dependencies.
Check dependencies:
  task jiraid:<JIRAKEY> +impl depends.any: list
```

### Spec file missing
```
❌ Error: Spec file not found

Expected: <full-path>

Check spec task annotation:
  task jiraid:<JIRAKEY> +spec _annotations
```

### Implementation error
```
❌ Implementation Error

<full-error-message>
<stack-trace>

Files affected:
  <list-of-files>

Debugging suggestions:
  1. Check error message above
  2. Review spec: <spec-path>
  3. Check task description: task <task-uuid> info
  4. Review recent changes: git status
```

### Taskwarrior errors
```
❌ Taskwarrior Error

Command: <command>
Error: <error-message>

Context: <what-we-were-trying-to-do>
```

## Notes

- **Sequential execution**: Tasks are processed in dependency order within phases, sorted by task ID number
- **Phase-driven**: Phases group related work and enforce ordering. Phases are auto-completed when all child tasks finish.
- **Human checkpoints**: Wait for confirmation after each task completion and before continuing to next task/phase
- **Spec-driven**: All implementation references the approved spec. Spec is cached within a session for efficiency.
- **Spec caching**: The spec file is read once per session and cached. Each task prompt still receives the full spec content.
- **No automatic testing**: Human reviews implementation and runs `/test` command separately
- **State tracking**: Uses Taskwarrior task status (`pending`, `completed`) to track progress
- **Dependency resolution**: Only tasks with ALL dependencies completed are considered READY
- **Error recovery**: Any implementation error stops execution immediately and reports details
- **Resume capability**: User can exit at any time and resume later with `/implement <JIRAKEY>`

## Example Usage

### Starting implementation

```bash
/implement IMP-7070
```

### Example session flow

```
Agent: 
✓ Found spec task (approved)
✓ Active phase: Testing (TDD approach)
✓ Next task: Write tests for getUserByIds with flag enabled

═══════════════════════════════════════════════════════
📋 Next Task to Implement
═══════════════════════════════════════════════════════

Jira:     IMP-7070
Phase:    Testing (TDD approach)
Task ID:  42

Title:    Write tests for getUserByIds with flag enabled

Description:
Add test cases in src/test/repositories/userRepository.test.ts to verify:
- Query targets user_identity and employment tables when ENABLE_READ_USER_FROM_NEW_TABLE=true
- Uses LEFT JOIN on user_uid between tables
- Filters by legacy_user_id IN (userIds)
- Returns empty array when no users found
- Mock config.user_migration.enableReadUserFromNewTable = true

Acceptance Criteria:
Tests verify correct table selection and JOIN structure with feature flag enabled

Estimated Effort: 2-3 hours

Spec: notes/specs/IMP-7070__account-api-userrepository.md

Dependencies: None
═══════════════════════════════════════════════════════

Ready to implement this task? (yes/no)

User: yes

Agent:
[Reads spec, implements tests, creates files]

═══════════════════════════════════════════════════════
✅ Task Implementation Complete
═══════════════════════════════════════════════════════

Changes made:
Created:
  - src/test/repositories/userRepository.test.ts

Modified:
  - None

Summary:
Added test suite for getUserByIds with 5 test cases covering:
- Feature flag enabled query structure
- Table selection (user_identity + employment)
- LEFT JOIN on user_uid
- Filtering by legacy_user_id
- Empty array handling

═══════════════════════════════════════════════════════
Next Steps:
═══════════════════════════════════════════════════════

1. Review the changes above
2. Run tests: /test
3. Verify acceptance criteria are met

Task info: task d939a0c0-178b-4a0f-a540-d9325fca7d0f info
═══════════════════════════════════════════════════════

Mark this task as completed? (yes/no)

User: yes

Agent:
✅ Task marked as completed

───────────────────────────────────────────────────────
Next ready task in this phase:

Task ID:  43
Title:    Write tests for getUserByIds column mapping
Estimated: 1-2 hours
───────────────────────────────────────────────────────

Continue with next task? (yes/no)

User: no

Agent:
Session paused. Resume with: /implement IMP-7070
```

### Resuming later

```bash
/implement IMP-7070
```

Agent will pick up where you left off, finding the next READY task.

## Task Ordering Logic

Tasks are ordered by:
1. **Phase order**: Lower task ID phases come first
2. **Within phase**: Lower task ID implementation tasks come first
3. **Dependency check**: Only READY tasks (all deps completed) are eligible

Example task sequence for IMP-7070:
```
Phase 39: Testing (TDD approach)
  → Task 42: Write tests for getUserByIds with flag enabled
  → Task 43: Write tests for getUserByIds column mapping
  → Task 44: Write tests for getUserForAudienceGroupWithSiteByIds...
  → Task 45: Write tests for getUserForAudienceGroupWithSiteByIds column mapping...

Phase 40: Core implementation
  → Task 46: Implement feature flag support in getUserByIds (depends on 42, 43)
  → Task 47: Implement feature flag support in getUserForAudienceGroupWithSiteByIds (depends on 44, 45)

Phase 41: Integration & validation
  → Task 48: Manual testing of audit log API endpoint (depends on 46, 47)
  → Task 49: Manual testing of PDPA user list API endpoint (depends on 46, 47)
```

## Spec Caching Behavior

- **First task**: Spec file is read and cached in session context
- **Subsequent tasks**: Cached spec is reused (no re-read from disk)
- **Each task prompt**: Full spec content is included in the implementation prompt
- **Session boundary**: If user exits and resumes later, spec will be re-read (new session)
- **Why cache?**: Efficiency - avoid redundant file I/O within a session
- **Why include in every prompt?**: Context - each task needs full spec understanding

## AIDEV-NOTE: Command Integration

This command is designed to work seamlessly with the existing workflow:

1. **Before**: `/specjira IMP-7070` creates the spec (Requirements + Design)
2. **Before**: `/createtasks IMP-7070` generates implementation tasks from spec
3. **During**: `/implement IMP-7070` executes tasks sequentially (THIS COMMAND)
4. **During**: `/test` validates each task (human-driven)
5. **After**: `/git` commits changes with proper commit message
6. **After**: Create PR when all tasks complete

The build agent has access to the full spec content and task details to implement correctly.
