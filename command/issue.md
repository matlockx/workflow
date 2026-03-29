---
description: Create a new issue and start writing a spec
agent: spec-mode
mode: plan
---

# Create issue and start spec

Create a new issue in the configured workflow backend and immediately begin the spec workflow.

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

4. **Store the issue ID and continue with spec workflow**
   - Set `issueId = issue.id`.
   - Report:
     ```
     Starting spec workflow for {issueId}...
     ```

5. **Continue with /spec workflow (steps 3-10)**
   - From here, follow the exact workflow defined in `/spec`:
     - Call `backend.getSpec(issueId)` to check for existing spec.
     - If no spec exists, call `backend.createSpec(issueId)`.
     - Write the spec document with Requirements and Design sections.
     - Follow step-by-step planning mode:
       - Draft Requirements first, pause for review.
       - Draft Design after approval, pause for review.
       - Mark spec as approved when user confirms.

## Example Session

```
User: /issue "Add rate limiting to API endpoints"