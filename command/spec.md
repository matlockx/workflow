---
description: Create a spec from an issue using the configured workflow backend
agent: spec-mode
---

# Create spec from issue

You are creating a specification from an issue tracked in the configured workflow backend.

## Prerequisites

Before running this command, ensure:
- The workflow backend is properly configured in `opencode.json`
- The issue exists in the backend and is accessible
- `$LLM_NOTES_ROOT` environment variable is set (for portable spec storage)

## Steps

### 1. Load workflow backend

- Use the backend loader: `require('./lib/backend-loader.js').getBackend()`
- This reads the backend configuration from `opencode.json` and initializes the appropriate backend
- Handle errors if backend is not configured or unavailable

### 2. Extract issue ID from arguments

- The issue ID is provided in `$ARGUMENTS` (e.g., "IN-1373", "beads:123")
- Extract the full ID including any backend prefix
- Store as `issueId` for backend queries

### 3. Query backend for issue details

- Call: `backend.getIssue(issueId)`
- This returns an Issue object with:
  - `id` - The issue identifier
  - `summary` - Short title
  - `description` - Full description (primary context for spec)
  - `status` - Current status in backend
  - `url` - Link to the issue (if available)
  - `labels` - Tags/categories
  - `metadata` - Backend-specific metadata

### 4. Validate issue exists

- If `backend.getIssue()` throws a NOT_FOUND error:
  - Inform user that issue was not found
  - Suggest backend-specific sync commands if applicable
  - For jira-taskwarrior: suggest `bugwarrior-pull`
  - Exit if issue not found

### 5. Determine spec file location

- Get current repo name: `git remote get-url origin` and extract repo name
- If `$LLM_NOTES_ROOT` is set:
  - Use: `$LLM_NOTES_ROOT/<repo>/notes/specs/<ISSUE_ID>__<slug>.md`
- Otherwise:
  - Use: `notes/specs/<ISSUE_ID>__<slug>.md` (relative to repo root)
- Generate `<slug>` from issue `summary`:
  - Lowercase
  - Replace spaces with dashes
  - Remove special characters
  - Max 5 words
  - Example: "Implement User Balance Write" → "implement-user-balance-write"

### 6. Create the spec file

- Use the spec-mode structure (Requirements, Design, Tasks)
- Use issue `description` as the primary context
- Follow step-by-step mode (Requirements → Design)
- Include YAML frontmatter with:
  - `issueId: <issue_id>`
  - `createdAt: <ISO8601 date>`
  - `work_state: draft`
  - `approvedAt: <ISO8601 date>` (only added when spec is approved in Step 8)
- Title: Based on issue `summary`
- If issue `url` is available, include it as a reference in the spec

### 7. Register spec in backend

After creating the spec file, register it in the backend system:

**Option A: If backend tracks specs separately (like jira-taskwarrior)**
- Create a spec entry in the backend to track the spec lifecycle
- For jira-taskwarrior, this creates a Taskwarrior task with:
  - Description: `SPEC: <issueId> <summary>`
  - Tags: `+spec`
  - State: `work_state:draft`
  - Link to parent issue
  - Annotation with portable spec path

**Option B: If backend doesn't track specs separately (like mock)**
- Skip backend registration
- Spec file is self-contained with state in YAML frontmatter

**Implementation:**
```javascript
// Check if backend supports spec tracking
if (typeof backend.createSpec === 'function') {
  try {
    // Some backends have automatic createSpec, but we've already created the file
    // So we may need to call a different method, or manually register
    // For now, defer to backend-specific implementation
  } catch (error) {
    // If backend doesn't support spec tracking, that's OK
    // Spec file is self-contained
  }
}
```

### 8. Report back to user

Inform the user of:
- Spec file location (full path)
- Issue ID and link (if available)
- Current work_state (draft)
- Current section created (Requirements)
- Next steps: "Please review the requirements above. Are they accurate and complete? Should I proceed to the Design section?"

### 9. Finalize and approve spec (after Design is complete and approved)

**Trigger**: After Design section is completed and user-approved

**Prompt user**: "The spec is now complete with Requirements and Design. Would you like to mark this spec as approved? (This will change the work_state from 'draft' to 'approved')"

**If user confirms YES**:

1. Update spec file YAML frontmatter:
   - Set `work_state: approved`
   - Add `approvedAt: <ISO8601 timestamp>`

2. Update backend (if supported):
   - Call `backend.approveSpec(issueId)` to update backend state
   - For jira-taskwarrior: Updates Taskwarrior task to `work_state:approved`
   - Handle gracefully if backend doesn't support spec state tracking

3. Report success:
   ```
   Spec approved!
   
   Next steps:
   1. Review the approved spec
   2. Create implementation tasks: /createtasks <ISSUE_ID>
   
   The /createtasks command will parse the implementation plan from the Design section 
   and create granular tasks with proper dependencies.
   ```

**If user declines NO**:
- Keep spec in 'draft' state
- Report: "Spec remains in 'draft' state. You can approve it later by re-running this command and approving, or manually updating the state."

## Notes

- The backend abstracts away the specific tools (Jira, Taskwarrior, Beads, etc.)
- Issue descriptions may contain backend-specific markup (Jira wiki markup, Markdown, etc.)
- Follow step-by-step mode by default (pause after each section for approval)
- Spec can be created and approved independently of issue status in the backend
- The portable spec storage in `$LLM_NOTES_ROOT` ensures specs work across machines and backends

## Spec State Management

### States

- **draft**: Initial state for new specs or specs being modified
- **approved**: Spec has been finalized and approved for implementation
- **rejected**: Spec needs rework (optional, backend-specific)

### State Transitions

- New specs start as `draft`
- Completed specs can be marked `approved` (adds `approvedAt` timestamp)
- Modified approved specs should revert to `draft` (removes `approvedAt` timestamp)

### Tracking

- **Spec file**: State tracked in YAML frontmatter (`work_state` and `approvedAt`)
- **Backend**: State tracked via backend API (if supported)
  - jira-taskwarrior: Taskwarrior task with `work_state` UDA
  - mock backend: No separate tracking (file is source of truth)
  - beads: Custom state tracking (TBD)

### YAML Frontmatter Examples

**Draft state:**

```yaml
---
issueId: IN-1373
createdAt: 2025-12-14T10:30:00Z
work_state: draft
---
```

**Approved state:**

```yaml
---
issueId: IN-1373
createdAt: 2025-12-14T10:30:00Z
work_state: approved
approvedAt: 2025-12-14T14:45:00Z
---
```

**After modification (reverted):**

```yaml
---
issueId: IN-1373
createdAt: 2025-12-14T10:30:00Z
work_state: draft
# approvedAt removed
---
```

### Editing Approved Specs

When a user requests changes to an approved spec:

1. Automatically detect `work_state: approved` in YAML frontmatter
2. Ask user: "This spec is approved. Modifying it will revert to draft state. Continue?"
3. If user confirms:
   - Revert work_state to `draft` in spec file
   - Remove `approvedAt` from YAML frontmatter
   - Call `backend.rejectSpec(issueId, "Reverted due to user modifications")` if backend supports it
   - Notify user: "Spec has been reverted to 'draft' state due to modifications"
4. If user declines:
   - Cancel the modification
   - Keep spec in approved state

## Backend-Specific Behaviors

### jira-taskwarrior backend

- Issues come from Jira (synced via Bugwarrior)
- Specs tracked as Taskwarrior tasks with `+spec` tag
- State synchronized between spec file and Taskwarrior `work_state` UDA
- Annotations added for audit trail

### mock backend

- Issues stored in memory
- No separate spec tracking (spec file is source of truth)
- State only in YAML frontmatter

### beads backend (future)

- Issues are Beads items
- Specs may be stored as Beads attachments or separate items
- State tracking TBD

## Error Handling

Handle backend errors gracefully:

- **NOT_FOUND**: Issue doesn't exist → suggest sync/pull
- **BACKEND_UNAVAILABLE**: Backend unreachable → suggest checking configuration
- **PERMISSION_DENIED**: No access → suggest checking credentials
- **ALREADY_EXISTS**: Spec already exists → offer to open existing spec

## Backward Compatibility

This command replaces the legacy `/specjira` command. Users can:
- Use `/spec <issue_id>` for any backend
- Optionally use `/specjira <issue_id>` (deprecated alias with warning)
- Manually specify backend: `/spec --backend jira-taskwarrior <issue_id>` (future enhancement)
