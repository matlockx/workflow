---
description: Create a spec from an issue using the configured workflow backend
agent: spec-mode
mode: plan
---

# Create spec from issue

Create or continue a specification for an issue tracked in the configured workflow backend.

## Steps

1. **Load and validate the backend**
   - Parse raw arguments with `require('./lib/backend-loader.js').parseBackendOverride($ARGUMENTS)`.
   - If a `--backend` override is provided, use it.
   - Load the backend with `require('./lib/backend-loader.js').getBackend(backendType)`.
   - If backend initialization fails, stop and show the error.
   - If the backend is missing or misconfigured, tell the user to check `opencode.json`.

2. **Extract the issue ID**
   - Read the full issue identifier from the cleaned arguments returned by `parseBackendOverride()`.
   - Keep backend-specific prefixes if present (examples: `IN-1373`, `MOCK-1`, `beads:123`).
   - Store it as `issueId`.

3. **Fetch issue context**
   - Call `backend.getIssue(issueId)`.
   - Use the returned `summary`, `description`, `status`, `labels`, and optional `url` as planning context.
   - If the issue is not found:
     - Tell the user the issue could not be found.
     - If the configured backend is `jira-taskwarrior`, suggest `bugwarrior-pull`.
     - Stop.

4. **Resolve or create the backend-tracked spec**
   - First try `backend.getSpec(issueId)`.
   - If a spec already exists:
     - Use the existing spec file at `spec.filePath`.
     - Preserve its current lifecycle state unless the user approves a change.
   - If no spec exists:
     - Call `backend.createSpec(issueId)`.
     - Use the returned `spec.id` and `spec.filePath` as the canonical spec record.
     - Treat the backend-created file as a scaffold that you can replace with richer content.

5. **Prepare the spec document**
   - Write the spec to `spec.filePath`.
   - Use the spec-mode structure with only:
     - `Requirements`
     - `Design`
   - Do not include implementation tasks in the spec; those are created later by `/createtasks`.
   - Use YAML frontmatter that matches the portable format used in this repo:
     - `issueId: <issueId>`
     - `createdAt: <ISO8601>`
     - `work_state: draft`
     - `approvedAt: <ISO8601>` only after approval
   - Base the title on `issue.summary`.
   - If `issue.url` exists, include it in the document for reference.

6. **Follow step-by-step planning mode**
   - Start by drafting only the `Requirements` section.
   - Use `issue.description` as the primary source of truth.
   - Leave `Design` as a placeholder until requirements are reviewed.
   - After writing requirements, pause and ask exactly:
     - `Please review the requirements above. Are they accurate and complete? Should I proceed to the Design section?`

7. **Complete the design after approval**
   - Once the user approves the requirements, fill in the `Design` section.
   - Keep the design practical and implementation-oriented.
   - After writing design, pause and ask exactly:
     - `Please review the design above. Is it accurate and complete? Should I mark the spec as approved?`

8. **Approve the spec when the user confirms**
   - If the user approves the completed spec:
     - Update the YAML frontmatter to:
       - `work_state: approved`
       - `approvedAt: <ISO8601 timestamp>`
     - Call `backend.approveSpec(spec.id)`.
   - If approval fails, tell the user the backend update failed and keep the file consistent with the actual backend state.

9. **Handle edits to approved specs safely**
   - If an existing spec is already approved and the user wants to change it:
     - Warn: `This spec is approved. Modifying it will revert it to draft state. Continue?`
   - If the user confirms:
     - Update the file frontmatter back to `work_state: draft`.
     - Remove `approvedAt`.
     - If the backend supports rejection/rework flow, call `backend.rejectSpec(spec.id, 'Reverted due to spec edits')`.
   - If the user declines, stop without editing the spec.

10. **Report back clearly**
   - Report:
     - issue ID
     - spec ID
     - spec path
     - current state
     - issue URL if available
   - When a new draft is created, end with the requirements review prompt.
   - When a spec is approved, point the user to `/createtasks <issueId>`.

## AIDEV-NOTE: backend-tracked spec lifecycle

- Prefer `backend.getSpec()` / `backend.createSpec()` so the backend remains the source of truth for whether a spec exists.
- Use `spec.id` when calling `backend.approveSpec()` or `backend.rejectSpec()`.
- The markdown file is the editable artifact, but backend lifecycle state must stay in sync with the file frontmatter.
- Support optional command-time override via `--backend=<type>` without changing repo config.

## Notes

- The backend abstracts the underlying workflow tools.
- Preserve portable spec storage through the backend-provided `spec.filePath`.
- Issue descriptions may contain backend-specific markup; keep the meaning, not the formatting quirks.
- This command replaces the legacy `/specjira` flow.
