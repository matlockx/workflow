---
description: Create a spec from a Jira issue using Taskwarrior
agent: spec-mode
---

# Create spec from Jira issue

You are creating a specification from a Jira issue that has been synced to Taskwarrior via Bugwarrior.

## Steps

1. **Extract Jira ID from arguments**
   - The Jira ID is provided in $ARGUMENTS (e.g., "IN-1373")
   - Extract just the ID (e.g., "IN-1373")

2. **Query Taskwarrior for the Jira task**
   - Run: `task jiraid:$ARGUMENTS status:pending export`
   - This returns JSON with the full task data (excludes deleted/completed tasks)
   - Parse the JSON to extract:
     - `jiraid` - The Jira issue key
     - `jirasummary` - The Jira summary/title  
     - `jiradescription` - The full Jira description (primary context for spec)
     - `uuid` - The Taskwarrior UUID of the Jira task
     - `jiraurl` - Link to the Jira issue

3. **Validate task exists**
   - If no task found, inform user and suggest: `bugwarrior-pull`
   - Exit if task not found

4. **Determine spec file location**
   - Get current repo name: `git remote get-url origin` and extract repo name
   - If `$LLM_NOTES_ROOT` is set:
     - Use: `$LLM_NOTES_ROOT/<repo>/notes/specs/<JIRAKEY>__<slug>.md`
   - Otherwise:
     - Use: `notes/specs/<JIRAKEY>__<slug>.md` (relative to repo root)
   - Generate `<slug>` from `jirasummary`:
     - Lowercase
     - Replace spaces with dashes
     - Max 5 words
     - Example: "Implement User Balance Write" → "implement-user-balance-write"

5. **Create the spec file**
   - Use the spec-mode structure (Requirements, Design, Tasks)
   - Use `jiradescription` as the primary context
   - Follow step-by-step mode (Requirements → Design → Tasks)
   - Include YAML frontmatter with:
     - `createdAt: <ISO8601 date>`
     - `spec_state: draft`
     - `approvedAt: <ISO8601 date>` (only added when spec is approved in Step 8)
   - Title: Based on `jirasummary`

6. **Create Taskwarrior spec task**
   - Run: `task add "SPEC: <JIRAKEY> <summary>" +spec spec_state:draft depends:<jira-task-uuid>`
   - Capture the new spec task UUID from output
   - Annotate with portable spec path:
     - `task <spec-uuid> annotate "Spec(repo=<repo>): <repo>/notes/specs/<filename>"`

7. **Report back to user**
   - Spec file location (full path)
   - Taskwarrior spec task ID and UUID
   - Current spec_state (draft)
   - Jira URL for reference
   - Current section created (Requirements)
   - Next steps: "Please review the requirements above. Are they accurate and complete? Should I proceed to the Design section?"

8. **Finalize and approve spec (after all sections complete)**
   - **Trigger**: After all three sections (Requirements, Design, Tasks) are completed and user-approved
   - **Prompt user**: "The spec is now complete with all sections finalized. Would you like to mark this spec as approved? (This will change the spec_state from 'draft' to 'approved')"
   - **If user confirms YES**:
     - Update Taskwarrior: `task <spec-uuid> modify spec_state:approved`
     - Update spec file YAML frontmatter: Add `approvedAt: <ISO8601 timestamp>`
     - Annotate task: `task <spec-uuid> annotate "Approved on <ISO8601 date>"`
     - Report: "Spec approved! Updated Taskwarrior state and added approvedAt timestamp to spec file."
   - **If user declines NO**:
     - Keep spec in 'draft' state
     - Report: "Spec remains in 'draft' state. You can approve it later with: `task <spec-uuid> modify spec_state:approved`"

## Notes

- Use the `jiradescription` as-is (may contain Jira wiki markup like `&open;...&close;`)
- Follow step-by-step mode by default (pause after each section for approval)
- The spec task will block implementation tasks (via `depends:` in Taskwarrior)
- The portable annotation format allows the spec to be found from any machine with `$LLM_NOTES_ROOT` set

## Spec State Management

### States

- **draft**: Initial state for new specs or specs being modified
- **approved**: Spec has been finalized and approved for implementation

### State Transitions

- New specs start as `draft`
- Completed specs can be marked `approved` (adds `approvedAt` timestamp)
- Modified approved specs automatically revert to `draft` (removes `approvedAt` timestamp)

### Tracking

- State is tracked both in Taskwarrior (`spec_state` UDA) and spec file YAML frontmatter
- Approval creates an annotation in Taskwarrior for audit trail

### YAML Frontmatter Examples

**Draft state:**

```yaml
---
createdAt: 2025-12-14T10:30:00Z
spec_state: draft
---
```

**Approved state:**

```yaml
---
createdAt: 2025-12-14T10:30:00Z
spec_state: approved
approvedAt: 2025-12-14T14:45:00Z
---
```

**After modification (reverted):**

```yaml
---
createdAt: 2025-12-14T10:30:00Z
spec_state: draft
# approvedAt removed
---
```

### Editing Approved Specs

When a user requests changes to an approved spec:

1. Automatically detect `spec_state:approved` in YAML frontmatter
2. Ask user: "This spec is approved. Modifying it will revert to draft state. Continue?"
3. If user confirms:
   - Revert spec_state to `draft` in both Taskwarrior and spec file
   - Remove `approvedAt` from YAML frontmatter
   - Annotate task: `task <spec-uuid> annotate "Reverted to draft on <ISO8601 date> due to modifications"`
   - Notify user: "Spec has been reverted to 'draft' state due to modifications"
4. If user declines:
   - Cancel the modification
   - Keep spec in approved state

### Manual State Management

**Check current state:**

```bash
task <uuid> _get spec_state
```

**Approve manually:**

```bash
task <uuid> modify spec_state:approved
# Don't forget to update the spec file YAML frontmatter!
```

**Revert to draft:**

```bash
task <uuid> modify spec_state:draft
# Don't forget to remove approvedAt from spec file YAML frontmatter!
```
