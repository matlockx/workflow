# ADR-001: v2 Minimal Workflow Architecture

**Status**: accepted
**Date**: 2026-04-06
**Tags**: #architecture #agents #workflow #minimalism

## Context

Version 1 of the OpenCode workflow framework grew to 80+ files including 19 skills
(~12,400 LOC), 16 agent definitions, 13 commands, 3 backend implementations, a
Node.js runtime with Jest/ESLint/lefthook, JavaScript libraries (intent-router,
plan-state, backend-loader), and shell scripts for init/sync/update.

The complexity made the system hard to reason about:

- Agent roles overlapped (16 agents with unclear boundaries)
- Skills covered languages and tools not actively used (Swift, Rust, Kubernetes,
  Helm, ArgoCD, Kafka, etc.) while the primary language was Go
- The Node.js runtime added dependency management overhead for what is fundamentally
  a prompt-and-config framework
- Three backend implementations existed but only Beads was actively used
- Duplicated state across `.opencode/`, `.agent/`, and source directories caused confusion
- The workflow was solid (3-gate system) but buried under layers of indirection

The framework needed to be portable: copyable into both new repos and existing repos
that already have their own `AGENTS.md`.

## Decision

Rebuild as a minimal v2 in a subdirectory with these constraints:

### 4-agent model with explicit responsibilities

| Agent | Role | Does NOT do |
|-------|------|-------------|
| **Planner** | Intent detection, scope estimation, plan presentation | Write code, create tasks |
| **Designer** | Create Beads tasks (Jira-ready), write ADRs, update ADR index | Write application code |
| **Developer** | TDD implementation (tests first, then code), max 500 LOC | Create tasks, skip tests |
| **QA** | Run quality gates, loop back to responsible agent on failure | Fix code directly |

### Portable split: INSTRUCTIONS.md + AGENTS.md

- `.opencode/INSTRUCTIONS.md` contains the framework rules (agent model, quality gates,
  commit discipline, Beads backend). Identical across all repos. Never customized.
- `AGENTS.md` at project root is project-specific (build commands, structure, conventions).
  Ships as a minimal template for new repos. Existing repos keep theirs and add one
  `@.opencode/INSTRUCTIONS.md` reference.

### Skills as a knowledge wiki (4 skills only)

- `golang` — Go essentials (~500 LOC, trimmed from 1,456)
- `workflow` — Unified 3-gate system + Beads queries (merged from 3 v1 files)
- `tdd` — Go-focused test-driven development
- `quality-gates` — Gate definitions, 500 LOC rule, loop-back routing

### Quality gates as hard blocks

Every commit requires: Beads task with description, tests pass, lint passes,
ADR if architectural, diff under 500 LOC, conventional commit with task ID.
Enforced via git hooks (pre-commit + commit-msg shell scripts).

### No runtime dependencies beyond Go toolchain + Beads

No Node.js, no JavaScript libraries, no shell scripts for workflow orchestration.
The framework is pure markdown (agents, skills, commands, instructions) plus
shell-based git hooks for quality enforcement.

## Consequences

### Positive

- 21 files total (down from 80+), easy to audit and understand
- Clear agent boundaries prevent role confusion
- Portable: copy `.opencode/` + `opencode.json` + `hooks/` + `docs/adr/` to any repo
- ADR index serves as a searchable wiki for agents
- No dependency management overhead (no package.json, no node_modules)
- Quality gates are explicit and enforceable

### Negative

- Go-centric: adding another language requires a new skill file
- Less flexible than v1's plugin architecture for complex workflows
- No mock/test backend — requires Beads to be available
- Shell-based git hooks are simpler but lack lefthook's glob-based selective runs

### Neutral

- Skills are loaded on-demand by OpenCode's native skill tool (same as v1)
- Beads remains the sole backend (was already the only one actively used)
- ADR system is identical to v1's but with an explicit machine-readable index

## Notes

- v1 source: `/Users/martin/projects/opencode/` (this repo's root)
- v2 lives in `v2/` subdirectory during development
- The 4-agent loop-back model is inspired by v1's Gate 3 auto-loop but makes
  routing explicit (QA -> Developer for test failures, QA -> Designer for missing tasks)
