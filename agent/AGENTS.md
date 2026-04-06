# AGENTS.md — agent/

This directory contains **AI agent persona definitions** for the OpenCode workflow system.

## What agents are

An agent file defines a focused AI persona — its role, capabilities, operating rules, and
hard constraints. When OpenCode invokes a command or the user activates an agent, the agent
file is injected as the AI's system-level context for that task.

Agents are **not** slash commands. A command (in `command/`) orchestrates a workflow; an agent
provides the mindset, boundaries, and tools the AI uses while executing that workflow.

## How agents are distributed

`opencode-init` copies a **subset** of core agents into `.agent/agents/` in the downstream project:

```
create-tasks.md    plan-mode.md    build.md
test-agent.md      code-reviewer.md   workflow-first.md   research-agent.md
```

`opencode-sync` then syncs **all** `agent/*.md` files to `.agent/agents/` on every update,
so downstream projects automatically get new and updated agents.

**Language-specific agents** (`debugger-go.md`, `debugger-rust.md`) are **only copied by
`opencode-init`** when `--lang=go` or `--lang=rust` is specified. `opencode-sync` syncs them
to any project that already has them installed.

Agents are copied **verbatim** — no `sed` substitution is applied. All content must be valid
as-is for any downstream project.

## Frontmatter schema

Every agent file **must** have YAML frontmatter. Recognized fields:

| Field         | Required | Values / Notes |
|---------------|----------|----------------|
| `name`        | Yes      | Unique kebab-case identifier (e.g. `build`, `debugger-go`). Used by commands in the `agent:` field. |
| `description` | Yes      | 1–2 sentence summary shown in the agent picker and used for activation heuristics. Be specific — vague descriptions cause wrong agent selection. |
| `mode`        | No       | `primary` (full control), `subagent` (called by another agent/command). Default: `primary`. |
| `temperature` | No       | Float 0.0–1.0. Lower = more deterministic. Use `0.1`–`0.2` for subagents doing analysis or classification. |
| `permissions` | No       | Map of tool names to `allow`/`deny`/`true`/`false`. Subagents should deny write/edit/patch unless required. |

Example:

```yaml
---
name: my-agent
description: "Does X for Y purpose. Use when Z."
mode: subagent
temperature: 0.1
permissions:
  read: allow
  bash: allow
  write: deny
  edit: deny
---
```

## Required sections

Every agent file should have (in order):

1. **Frontmatter** — `name`, `description`, and any `mode`/`permissions` needed
2. **Role statement** — One paragraph: who the agent is and what it does
3. **Boundaries** — Three-tier constraints (see format below)
4. **Commands** *(if the agent runs shell commands)* — Exact commands or AGENTS.md pointer
5. **Core behavior** — Detailed instructions, checklists, output formats
6. **`AIDEV-NOTE:` comments** — Near non-obvious design decisions

## Boundaries format

Every agent **must** include a `## Boundaries` section. This is the most important section
for preventing the agent from doing surprising things at the edges of its role.

```markdown
## Boundaries

- ✅ Always: [2–3 things this agent always does, specific to its role]
- ⚠️ Ask first: [1–2 situations where it must pause and get human input]
- 🚫 Never: [2–3 hard constraints — irreversible or high-risk actions]
```

Guidelines:
- **Always** items should be concrete actions, not vague virtues ("always run tests" not "always be careful")
- **Ask first** items should describe the ambiguity, not just say "when unsure"
- **Never** items should be truly non-negotiable (secrets, destructive ops, out-of-scope changes)

## Commands section — generic vs. language-specific

Agents in this repo are distributed to projects in **any language**. Use the hybrid approach:

**Generic agents** — pointer to AGENTS.md:
```markdown
## Commands

Read the **`Build & Test Commands`** section in the project root `AGENTS.md` before running
any build, test, or lint commands. Use the exact commands specified there.
```

**Language-specific agents** (`debugger-go.md`, `debugger-rust.md`) — concrete commands are
acceptable because these agents are only installed on matching projects:
```markdown
## Commands
\```bash
go test -race ./...
RUST_BACKTRACE=1 cargo run
\```
```

## Naming conventions

| Type | Naming pattern | Example |
|------|---------------|---------|
| Core workflow agents | `<role>.md` | `build.md`, `plan-mode.md` |
| Debugger agents | `debugger-<lang>.md` | `debugger-go.md` |
| Reviewer agents | `<scope>-<role>.md` | `pr-code-reviewer.md` |
| Subagents | `<task>-agent.md` | `test-agent.md` |
| Documentation agents | `<format>-documenter.md` | `openapi-documenter.md` |

## Adding a new agent

1. Create `agent/<name>.md` with complete frontmatter (`name:` is required)
2. Follow the required-sections order above
3. Add a `## Boundaries` section — do not skip this
4. If the agent is language-specific, add it to the appropriate array in `bin/opencode-init`:
   ```bash
   GO_AGENTS=("debugger-go" "your-new-go-agent")
   ```
5. If it's a core agent, add a `cp` line in the "Copy core agents" section of `opencode-init`
6. Update this file if the agent introduces a new pattern or naming convention

## What NOT to put in agent files

- **Backend-specific CLI commands** in generic agents (use AGENTS.md pointer instead)
- **Hardcoded branch names** like `develop` or `master` (use dynamic detection)
- **Stack-specific assumptions** in generic agents (e.g. `yarn`, `jest`, `CLAUDE.md`)
- **Placeholder sections** like "Add your project-specific checks here" — either fill them in or remove them
- **Credentials or secrets** of any kind
