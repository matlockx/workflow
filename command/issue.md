---
description: Create a new issue and hand off to /createtasks
agent: build
---

# Create issue

Create a new issue in the configured workflow backend and immediately hand off to the `/createtasks` workflow.

## Input

- `$ARGUMENTS`: Issue description in natural language
  - Example: `/issue "Add OAuth2 authentication with Google and GitHub"`
  - Optional flags: `--type=feature|bug|task` (default: feature)

## Steps

1. **Load and validate the backend**
   - Parse arguments with `require('./lib/backend-loader.js').parseBackendOverride($ARGUMENTS)`.
   - If a `--backend` override is provided, use it.
   - Load the backend with `require('./lib/backend-loader.js').getBackend(backendType)`.
   - If backend initialization fails, stop and show the error.
   - If the backend is missing or misconfigured, tell the user to check `opencode.json`.

2. **Extract issue details from description**
   - Parse the cleaned arguments to extract the issue description.
   - If description is enclosed in quotes, extract the quoted content.
   - Parse optional `--type=X` flag (feature, bug, task). Default to "feature".
   - If description is long (>100 characters):
     - Use the first sentence as `summary`.
     - Use the full text as `description`.
   - Otherwise:
     - Use the full text as both `summary` and `description`.

3. **Create the issue in the backend**
   - Call `backend.createIssue({ summary, description, issueType })`.
   - Report to the user:
     ```
     Created issue {issue.id}: {issue.summary}
     ```
   - If creation fails:
     - Show the error message.
     - Suggest checking backend configuration or connectivity.
     - Stop.

4. **Hand off to /createtasks**
   - Set `issueId = issue.id`.
   - Report:
     ```
     Issue {issueId} created. Starting task creation...
     ```
   - Follow the complete `/createtasks` workflow for `issueId`.
   - This will prompt the user to describe the implementation tasks,
     create them in the backend, and display the task list.

## Example Session

```
User: /issue "Add rate limiting to API endpoints"