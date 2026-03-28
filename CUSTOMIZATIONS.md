# Customization Log

This document tracks all significant changes, decisions, and customizations made to this fork of OpenCode.

---

## [2026-03-28] - Initial Fork: Workflow-Agnostic Transformation

**Decision**: Fork from `matlockx/opencode` to create a workflow-agnostic version

**Motivation**:
- Original repo is tightly coupled to Jira + Taskwarrior + Bugwarrior workflow
- Designed for fintech/regulated environments (SalaryHero-specific)
- Linux-focused (Arch Linux, pacman)
- Need flexibility to use different workflows (Beads, custom tools, etc.)
- Need macOS support as primary development platform

**Changes**:
1. **Architecture**: Introducing pluggable backend system
   - Backends implement `WorkflowBackend` interface
   - Support multiple workflows: jira-taskwarrior, Beads, custom
   - Commands remain workflow-agnostic

2. **Command Structure**:
   - `/specjira` → `/spec` (backend-agnostic)
   - `/specjira` kept as deprecated alias
   - Commands use backend interface instead of direct tool calls
   - Backend selection via `opencode.json` config

3. **Documentation**:
   - macOS-first documentation
   - Removed SalaryHero/fintech-specific references
   - Added backend implementation guides
   - Created migration guide for upstream users

4. **Backward Compatibility**:
   - Original jira-taskwarrior workflow preserved as first backend
   - Existing users can continue with minimal changes
   - Deprecated commands show warnings but still work

**Impact**:
- Breaking: Original workflow moved to `backends/jira-taskwarrior/`
- Breaking: Skills reorganized (taskwarrior → workflow-backend)
- Non-breaking: Existing commands work via adapter layer
- New: Support for alternative workflows (Beads, custom)

**Migration**:
- See `docs/migration-from-upstream.md` for detailed migration guide
- For jira-taskwarrior users: Update `opencode.json` config
- For new users: Choose your backend in setup

---

## Design Decisions

### Backend Abstraction Strategy: Conservative Refactoring

**Choice**: Add abstraction layer, keep existing functionality working

**Rationale**:
- Minimize risk of breaking existing workflows
- Allow gradual migration to new architecture
- Preserve battle-tested logic in jira-taskwarrior backend
- Enable parallel development of new backends

**Alternatives Considered**:
- Complete rewrite (rejected: too risky)
- Tool-level abstraction only (rejected: not flexible enough)

---

### Spec Storage: Backend-Agnostic Portable Files

**Choice**: Keep specs in `$LLM_NOTES_ROOT`, managed by backend

**Rationale**:
- Specs are valuable artifacts, should be portable
- Different backends can use same spec format
- Enables cross-team collaboration (different workflows, same specs)
- Version control friendly (markdown in git)

**Implementation**:
- `$LLM_NOTES_ROOT/<repo>/notes/specs/<ISSUEKEY>__<slug>.md`
- YAML frontmatter for metadata
- Backends store spec path in task metadata (links, not ownership)

---

### State Model: Standardized Minimal Set

**Choice**: Define core states, backends can extend

**Core States**:
- `new`: Initial state (synced/created)
- `draft`: Work in progress
- `todo`: Ready to start
- `inprogress`: Being worked on
- `review`: Awaiting review
- `approved`: Accepted
- `rejected`: Needs rework
- `done`: Completed

**Rationale**:
- Common vocabulary across backends
- Allows backend-specific extensions
- Enables workflow interoperability
- Maps cleanly to most issue trackers

---

### Command Naming: Auto-Detection with Override

**Choice**: Generic commands (`/spec`) with optional `--backend` flag

**Implementation**:
```bash
/spec ISSUE-123                    # Uses backend from opencode.json
/spec ISSUE-123 --backend=beads   # Override backend
/specjira ISSUE-123                # Deprecated alias (still works)
```

**Rationale**:
- Clean UX (no need to remember backend-specific commands)
- Explicit override when needed (testing, multiple backends)
- Backward compatibility via aliases
- Clear deprecation path

---

### Backend Configuration: Detailed JSON Config

**Choice**: Structured config in `opencode.json`

**Format**:
```json
{
  "workflow": {
    "backend": {
      "type": "jira-taskwarrior",
      "config": {
        "jiraUrl": "https://your-org.atlassian.net",
        "taskwarriorPath": "task",
        "lmmNotesRoot": "$LLM_NOTES_ROOT"
      }
    }
  }
}
```

**Rationale**:
- Follows existing provider pattern in opencode.json
- Backend-specific configuration isolated
- Easy to validate and document
- Supports multiple backend instances (future)

---

## Future Work

### Planned Backends
- ✅ `jira-taskwarrior` (Phase 2)
- 🚧 `beads` (Phase 4)
- 📋 `github-issues` (future)
- 📋 `linear` (future)
- 📋 `file-based` (simple JSON/markdown backend)

### Potential Enhancements
- Multi-backend support (work with multiple workflows simultaneously)
- Backend migration tools (move issues between backends)
- Workflow templates (predefined backend configurations)
- Backend marketplace/registry

---

## Notes for AI Assistants

When working on this codebase:

1. **Always check this file first** to understand customization decisions
2. **Update this file** when making architectural changes
3. **Reference phase numbers** from TODO.md in commit messages
4. **Preserve backward compatibility** unless explicitly breaking
5. **Document breaking changes** with migration instructions
6. **Test both backends** (jira-taskwarrior and beads) when modifying core

---

## Upstream Divergence

**Original Repository**: `matlockx/opencode` (https://github.com/matlockx/opencode)

**Divergence Date**: 2026-03-28

**Sync Strategy**: No upstream syncing (independent fork)

**Key Differences**:
- Backend abstraction layer (upstream: hardcoded jira-taskwarrior)
- macOS support (upstream: Linux-focused)
- Generic workflow (upstream: fintech-specific)
- Multiple backends (upstream: single workflow)

**Why Independent Fork**:
- Architectural changes too significant for upstream contribution
- Different target audience (general dev vs fintech/regulated)
- Different priorities (flexibility vs domain specificity)

---

## Change History

| Date | Phase | Description |
|------|-------|-------------|
| 2026-03-28 | Phase 0 | Initial fork, foundation documentation created |

