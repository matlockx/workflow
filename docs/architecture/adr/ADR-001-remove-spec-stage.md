# ADR-001: Remove Spec Stage — Three-Stage Pipeline (Tier 3 Rebuild)

**Date**: 2026-03-31  
**Status**: accepted  
**Deciders**: Martin (project owner)

---

## Context

OpenCode originally shipped with a five-stage pipeline:

```
issue → spec (draft/approve) → createtasks → implement → review
```

The "spec" stage added a mandatory markdown file (`specs/<ISSUE>__<title>.md`) as an
intermediate artifact that had to be approved before tasks could be created. This created
several friction points:

- The spec file was a local cursor file masquerading as backend state, violating the
  "backend is the source of truth" principle.
- `workflow-state.js` tracked spec state locally, creating divergence from the backend.
- `specsDir` was a required config key for all backends, coupling every backend to the
  spec concept even when the backend had no notion of specs.
- `interface.ts` defined spec management methods (`createSpec`, `getSpec`, `approveSpec`,
  `rejectSpec`) that backends were forced to implement even if unused.
- The spec approval gate slowed down simple tasks that didn't need a formal spec.
- AI agents can generate planning content inline during `/implement` — the spec file
  brought no additional value over a well-described issue.

## Decision

We remove the spec stage entirely and adopt a three-stage pipeline:

```
issue → tasks → implement → review
```

Concretely:
- Delete `specs/` directory, `lib/workflow-state.js`, `backends/interface.ts`,
  `command/spec.md`, and all spec-related agent files.
- Remove `specsDir` from all backend configs and the `WorkflowBackend` interface.
- Remove spec management methods from the interface; backends only manage issues and tasks.
- Collapse the gate system from five gates to three (intent → plan → ship).
- `YOLO` mode becomes a session CLI flag (`--yolo`), not persisted state.
- `/resume` re-runs `/feature` — backend task state tells the agent where to pick up.

## Consequences

### Positive
- Simpler mental model: one pipeline, three stages, all state in the backend.
- Faster iteration: no mandatory spec approval step for small/medium tasks.
- Cleaner backend interface: no spec methods, no `specsDir` config key.
- `workflow-state.js` eliminated; backend is the sole source of truth.
- 2,998 lines deleted, 350 added — significant complexity reduction.

### Negative / Trade-offs
- Projects that relied on spec files as formal review artifacts lose that gate.
  Mitigation: ADRs (this directory) and well-described issues serve that need.
- Existing backend implementations that implemented spec methods need cleanup.
  Mitigation: Done in commit `9d0fc7d` and follow-up `b040e5b`.

### Neutral
- The `+spec` Taskwarrior tag is preserved for backwards compatibility in
  jira-taskwarrior but is no longer created by default.
- The `workflow-backend` SKILL.md already described spec methods generically;
  those descriptions are updated to reflect the new interface.

## Alternatives Considered

| Option | Why rejected |
|--------|-------------|
| Keep spec stage, make it optional | Still couples all backends to the concept; doesn't fix the local-state problem |
| Move spec file into backend storage | Adds complexity with no benefit over a well-described issue |
| Keep `interface.ts`, remove spec methods | `interface.ts` as a separate file adds no value over the SKILL.md doc — deleted |

---

*Implemented in commits `9d0fc7d` (main Tier 3 rebuild, 23 files) and `b040e5b` (stale-ref cleanup).*
