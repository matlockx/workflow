# AGENTS.md - OpenCode Workflow Framework

## The Golden Rule

When unsure about implementation details, ALWAYS ask the developer.

---

## Non-negotiable golden rules

| #:  | AI _may_ do                                                                                                                                                                        | AI _must NOT_ do                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-0 | Whenever unsure about something that's related to the project, ask the developer for clarification before making changes.                                                          | ❌ Write changes or use tools when you are not sure about something project specific, or if you don't have context for a particular feature/decision. |
| G-1 | Add/update **`AIDEV-NOTE:` anchor comments** near non-trivial edited code.                                                                                                         | ❌ Delete or mangle existing `AIDEV-` comments.                                                                                                       |
| G-2 | Follow lint/style configs (`pyproject.toml`, `.prettierrc`, `.pre-commit-config.yaml`). Use the project's configured linter, if available, instead of manually re-formatting code. | ❌ Re-format code to any other style.                                                                                                                 |
| G-3 | For changes >300 LOC or >3 files, **ask for confirmation**.                                                                                                                        | ❌ Refactor large modules without human guidance.                                                                                                     |
| G-4 | Stay within the current task context. Inform the dev if it'd be better to start afresh.                                                                                            | ❌ Continue work from a prior prompt after "new task" – start a fresh session.                                                                        |
| G-5 | **Update README/docs** whenever you change behavior, add features, or modify CLI flags.                                                                                            | ❌ Leave documentation out of sync with code changes.                                                                                                 |
| G-6 | **Every code change MUST include tests.** Write tests first (TDD), or add tests alongside implementation. No test = no commit.                                                    | ❌ Commit code changes without corresponding test coverage. This is enforced by pre-commit hooks and cannot be bypassed.                              |

---

## Documentation Requirements

**Every code change that affects user-facing behavior must include documentation updates.**

### What requires doc updates

- New commands, flags, or CLI options → update README usage section
- Changed behavior or defaults → update relevant README sections
- New files/directories added to the project structure → update directory layout in README
- New configuration options → update config examples in README
- Bug fixes that change observable behavior → note in changelog if present

### Documentation files to check

- `README.md` — primary user-facing documentation
- `AGENTS.md` — AI assistant context (this file, update if workflow changes)
- Inline `AIDEV-NOTE:` comments — update when associated code changes
- `backends/*/README.md` — backend-specific documentation

### Commit discipline for docs

When committing changes, docs should be part of the **same commit** as the code change, not a follow-up. This keeps the repo in a consistent state at every commit.

---

## Build & Test Commands

- **Build:** `yarn build`
- **Lint:** `yarn lint`
- **Test:** `yarn test`
- **Run a single test file:** `yarn jest <path_to_test_file>`
- **Run BATS tests:** `bats test/bin/*.bats`

### Pre-commit Hooks (Enforced)

This repo uses [lefthook](https://github.com/evilmartians/lefthook) for pre-commit hooks. These hooks **cannot be bypassed** by the AI -- they run at the git level before any commit succeeds.

**What runs on every commit:**
- `yarn lint` -- ESLint checks
- `yarn test` -- Jest unit tests

**What runs when relevant files change:**
- `bats test/bin/*.bats` -- BATS integration tests (when bin/, command/, agent/, lib/, or test/bin/ files are staged)

**Setup:** Run `lefthook install` after cloning (or `yarn prepare` which does this automatically).

**NEVER use `--no-verify`** to skip these hooks. If tests fail, fix them before committing.

---

## Code Style and Patterns

### Anchor comments

Add specially formatted comments throughout the codebase, where appropriate, for yourself as inline knowledge that can be easily \`grep\`ped for.

### Guidelines

- Use \`AIDEV-NOTE:\`, \`AIDEV-TODO:\`, or \`AIDEV-QUESTION:\` (all-caps prefix) for comments aimed at AI and developers.
- **Important:** Before scanning files, always first try to **grep for existing anchors** \`AIDEV-\*\` in relevant subdirectories.
- **Update relevant anchors** when modifying associated code.
- **Do not remove \`AIDEV-NOTE\`s** without explicit human instruction.
- Make sure to add relevant anchor comments, whenever a file or piece of code is:
  - too complex, or
  - very important, or
  - confusing, or
  - could have a bug

---

## Commit discipline

You will receive a prompt to execute a task. Once the task is finished provide a git commit message example AND WAIT FOR INPUT before doing anything else. Never start a new task without being prompted.

- **Clear commit messages**: Explain the _why_; link to issues/ADRs if architectural.
- **Review AI-generated code**: Never merge code you don't understand.
- NEVER push or do any actions on the remote branch.

### Architecture Decision Records (ADRs)

ADRs capture significant architectural choices so future contributors understand *why* the system is shaped the way it is.

**Write an ADR when** the change involves any of:
- A new architectural pattern or cross-cutting design decision
- A significant deletion or replacement of a system component
- A behavioral change that future contributors would otherwise have to reverse-engineer

**Skip the ADR** only for purely mechanical changes (renaming, formatting, dependency bumps, doc-only edits, bug fixes with no design trade-off).

**ADR location**: `docs/architecture/adr/ADR-NNN-<slug>.md`  
**Template**: `docs/architecture/adr/TEMPLATE.md`

ADRs must be committed in the **same commit** as the code they document.

---

## Domain Glossary (learn these!)

- **Agent**: AI entity with memory, tools, and defined behavior
- **Backend**: Pluggable workflow engine (Jira, Beads, custom, etc.)
- **Issue**: High-level work item (user story, bug, epic) from your workflow backend
- **Task**: Granular implementation work item tracked by your backend
- **Phase**: Container for related tasks (sequential execution)
- **Work State**: Fine-grained state tracking (draft, todo, inprogress, review, approved, etc.)
- **Session**: Conversation context with memory
- **Entry**: Single interaction within a session

---

## Backend-First Query Rule (CRITICAL)

**When users ask about tasks, issues, or workflow state, ALWAYS query the configured backend — not local files or git history.**

### What this means

| Query type | DO this | DON'T do this |
|-----------|---------|---------------|
| "What was the last task?" | Query backend: `bd list --json --all --limit 1` | Read `feature-progress.json` or `git log` |
| "Show open issues" | Query backend: `bd list --json` | Assume from local files |
| "What's in progress?" | Query backend for task states | Guess based on file timestamps |

### How to query the backend

1. **Read `.agent/config.json`** to determine `backend.type`
2. **Use the backend's CLI** (see `agent/workflow-queries.md` for command reference)
3. **If backend CLI fails**, tell the user — don't silently fall back to git

### Why this matters

- **Tasks and issues live in the backend**, not in local state files
- **Git history** shows commits, not workflow tasks
- Silent fallbacks cause user confusion when answers don't match their actual workflow state

### Error handling

If the backend CLI fails (e.g., `bd` unavailable in sandbox mode):

```
⚠ Backend query failed: <error>

The workflow backend (beads) is not accessible. This may be due to:
- Sandbox permissions (bd needs access to .beads/ directory)
- Missing credentials or configuration

I can show git history instead, but this won't reflect your actual task state.
Would you like me to: [show git history] [help configure backend]?
```

---

## Directory-Specific AGENTS.md Files

- **Always check for `AGENTS.md` files in specific directories** before working on code within them. These files contain targeted context.
- If a directory's `AGENTS.md` is outdated or incorrect, **update it**.
- If you make significant changes to a directory's structure, patterns, or critical implementation details, **document these in its `AGENTS.md`**.
- If a directory lacks a `AGENTS.md` but contains complex logic or patterns worth documenting for AI/humans, **suggest creating one**.

---

## Meta: Guidelines for updating AGENTS.md files

### Elements that would be helpful to add

1. **Decision flowchart**: A simple decision tree for "when to use X vs Y" for key architectural choices would guide my recommendations.
2. **Reference links**: Links to key files or implementation examples that demonstrate best practices.
3. **Domain-specific terminology**: A small glossary of project-specific terms would help me understand domain language correctly.
4. **Versioning conventions**: How the project handles versioning, both for APIs and internal components.

### Format preferences

1. **Consistent syntax highlighting**: Ensure all code blocks have proper language tags (`python`, `bash`, etc.).
2. **Hierarchical organization**: Consider using hierarchical numbering for subsections to make referencing easier.
3. **Tabular format for key facts**: The tables are very helpful - more structured data in tabular format would be valuable.
4. **Keywords or tags**: Adding semantic markers (like `#performance` or `#security`) to certain sections would help me quickly locate relevant guidance.

This principle emphasizes human oversight for critical aspects like architecture, testing, and domain-specific decisions, ensuring AI assists rather than fully dictates development.

---

## Files to NOT modify

These files control which files should be ignored by AI tools and indexing systems:

- @.agentignore : Specifies files that should be ignored by the Cursor IDE, including:
  - Build and distribution directories
  - Environment and configuration files
  - Large data files (parquet, arrow, pickle, etc.)
  - Generated documentation
  - Package-manager files (lock files)
  - Logs and cache directories
  - IDE and editor files
  - Compiled binaries and media files

- @.agentindexignore : Controls which files are excluded from indexing to improve performance, including:
  - All files in `.agentignore`
  - Files that may contain sensitive information
  - Large JSON data files
  - Generated TypeSpec outputs
  - Memory-store migration files
  - Docker templates and configuration files

**Never modify these ignore files** without explicit permission, as they're carefully configured to optimize IDE performance while ensuring all relevant code is properly indexed.

**When adding new files or directories**, check these ignore patterns to ensure your files will be properly included in the IDE's indexing and AI assistance features.

---

## AI Assistant Workflow: Step-by-Step Methodology

When responding to user instructions, the AI assistant (Opencode, Claude, Cursor, GPT, etc.) should follow this process to ensure clarity, correctness, and maintainability:

0. **Gate 1 — Intent Acknowledgment**: Before any task execution, detect the user's intent and present a structured acknowledgment. Wait for explicit confirmation before proceeding. See `agent/workflow-first.md` for the full three-gate system and templates.

1. **Consult Relevant Guidance**: When the user gives an instruction, consult the relevant instructions from `AGENTS.md` files (both root and directory-specific) for the request.
2. **Clarify Ambiguities**: Based on what you could gather, see if there's any need for clarifications. If so, ask the user targeted questions before proceeding.
3. **Break Down & Plan**: Break down the task at hand and chalk out a rough plan for carrying it out, referencing project conventions and best practices.
4. **Trivial Tasks**: If the plan/request is trivial, go ahead and get started immediately.
5. **Non-Trivial Tasks**: Otherwise, present the plan to the user for review and iterate based on their feedback. Then apply Gate 2 (implementation confirmation) and Gate 3 (ship: build + tests + commit + task closure) per `agent/workflow-first.md`.
6. **Track Progress**: Use a to-do list (internally, or optionally in a `TODOS.md` file) to keep track of your progress on multi-step or complex tasks.
7. **If Stuck, Re-plan**: If you get stuck or blocked, return to step 3 to re-evaluate and adjust your plan.
8. **Update Documentation**: Once the user's request is fulfilled, update relevant anchor comments (`AIDEV-NOTE`, etc.) and `AGENTS.md` files in the files and directories you touched.
9. **User Review**: After completing the task, ask the user to review what you've done, and repeat the process as needed.
10. **Session Boundaries**: If the user's request isn't directly related to the current context and can be safely started in a fresh session, suggest starting from scratch to avoid context confusion.

---

## What AI Must NEVER Do

1. **Never modify test files** - Tests encode human intent
2. **Never change API contracts** - Breaks real applications
3. **Never alter migration files** - Data loss risk
4. **Never commit secrets** - Use environment variables
5. **Never assume business logic** - Always ask
6. **Never remove AIDEV- comments** - They're there for a reason
7. **Never run live Jira end-to-end tests by default** - Only execute live `jira-taskwarrior` E2E against a real Jira project when the user explicitly asks for it and explicitly confirms again immediately before execution

Remember: We optimize for maintainability over cleverness.  
When in doubt, choose the boring solution.
