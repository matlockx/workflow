# Agentic Workflow Framework

**OpenCode × Pluggable Workflow Backends**

A workflow-agnostic framework for agent-assisted software development that lets you use your preferred issue tracker, task manager, and workflow methodology.

---

## 🎯 What This Is

An **end-to-end, agent-assisted development workflow** that:

- ✅ **Works with your existing tools** (Jira, Beads, GitHub Issues, or custom)
- ✅ **Treats specs as first-class artifacts** (version controlled, reviewable)
- ✅ **Lets agents accelerate work** without removing human control
- ✅ **Works across multiple repos and developer machines**
- ✅ **Supports multiple workflows** via pluggable backends

Originally designed for fintech/regulated environments, now **fully workflow-agnostic**.

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────┐
│              OpenCode Commands                        │
│   /spec, /createtasks, /implement, /git, etc.       │
└────────────────────┬─────────────────────────────────┘
                     │
                     ↓
┌──────────────────────────────────────────────────────┐
│          Workflow Backend Interface                   │
│  (Unified API: issues, specs, tasks, state)          │
└────────────────────┬─────────────────────────────────┘
                     │
       ┌─────────────┼─────────────┐
       ↓             ↓             ↓
┌──────────────┐ ┌─────────┐ ┌──────────┐
│Jira-Task     │ │ Beads   │ │ Custom   │
│warrior       │ │ Backend │ │ Backends │
│Backend       │ │         │ │          │
└──────────────┘ └─────────┘ └──────────┘
```

**Core Principle**: Your workflow engine (Jira, Beads, etc.) handles state and tasks. OpenCode provides the agent layer and coordination.

---

## 🚀 Quick Start

### 1. Choose Your Backend

Pick a workflow backend that matches your tools:

- **`jira-taskwarrior`** - Jira (ACLI) + Taskwarrior + Bugwarrior (original workflow)
- **`beads`** - Steve Yegge's Beads task manager
- **`custom`** - Roll your own (implement the backend interface)

### 2. Install OpenCode

```bash
# Clone this repo
git clone https://github.com/your-username/opencode.git
cd opencode

# Install dependencies (if any)
# Follow setup guide for your chosen backend
```

### 3. Configure Your Backend

Create or update `opencode.json`:

```json
{
  "workflow": {
    "backend": {
      "type": "jira-taskwarrior",
      "config": {
        "jiraSite": "your-org.atlassian.net",
        "jiraProject": "PROJ",
        "jiraEmail": "you@example.com",
        "taskrcPath": "~/.taskrc",
        "taskDataLocation": "~/.task",
        "lmmNotesRoot": "$LLM_NOTES_ROOT",
        "repository": "your-repo"
      }
    }
  }
}
```

### 4. Follow Your Backend Setup Guide

- **Jira-Taskwarrior**: See [`backends/jira-taskwarrior/README.md`](backends/jira-taskwarrior/README.md)
- **Beads**: See [`docs/setup/setup-beads.md`](docs/setup/setup-beads.md)
- **Mac Users**: See [`docs/setup/setup-mac.md`](docs/setup/setup-mac.md) first

### 5. Backend Quickstarts

#### Jira-Taskwarrior Quickstart

```bash
# Verify Jira and Taskwarrior access
acli jira auth status
task --version

# Configure backend in opencode.json, then use the standard flow
/po-issue "Create a Jira-backed test issue"
/spec STAR-123
/createtasks STAR-123
/implement STAR-123
```

Use this backend when Jira is your source of truth and Taskwarrior is your local execution layer.

#### Beads Quickstart

```bash
# Initialize Beads in the repo root
bd init --stealth

# Create or pick an issue, then use the same OpenCode flow
bd create "Create a Beads-backed test issue" --type feature --json
/spec opencode-123 --backend=beads
/createtasks opencode-123 --backend=beads
/implement opencode-123 --backend=beads
```

Use this backend when you want a lightweight local-first workflow without Jira dependencies.

### 6. Troubleshooting Shortcuts

- **General setup**: [`docs/setup.md`](docs/setup.md)
- **macOS-specific quirks**: [`docs/setup/macos-quirks.md`](docs/setup/macos-quirks.md)
- **Jira-Taskwarrior backend setup/troubleshooting**: [`backends/jira-taskwarrior/README.md`](backends/jira-taskwarrior/README.md)
- **Beads setup**: [`docs/setup/setup-beads.md`](docs/setup/setup-beads.md)
- **Migration notes**: [`docs/migration-from-upstream.md`](docs/migration-from-upstream.md)

---

## 🔄 Typical Workflow

Regardless of your backend, the workflow follows the same pattern:

### 1. Create an Issue/Story

```bash
# Create high-quality user stories (agent-assisted)
/po-issue "Add semantic search to markets page"
```

The agent helps you craft proper user stories with acceptance criteria.

### 2. Draft a Spec

```bash
# Create a specification from an issue
/spec ISSUE-123
```

The agent:
- Pulls issue context from your backend
- Drafts a detailed spec (Requirements + Design)
- Stores it as a reviewable markdown file
- Links it back to your issue tracker

### 3. Review & Approve the Spec

```bash
# Review the spec file
cat $LLM_NOTES_ROOT/myrepo/notes/specs/ISSUE-123__feature-name.md

# If good, approve it (agent prompts you)
# Spec state: draft → approved
```

### 4. Generate Implementation Tasks

```bash
# Create granular implementation tasks from approved spec
/createtasks ISSUE-123
```

The agent:
- Analyzes your spec
- Breaks it into phases and tasks
- Creates tasks in your backend
- Sets up dependencies

### 5. Implement (Agent-Assisted)

```bash
# Start implementation (agent implements code)
/implement ISSUE-123
```

The agent:
- Reads specs and tasks
- Implements code following TDD
- Updates task states as work progresses
- Follows your coding standards

### 6. Review, Test, Commit

```bash
# Run tests
/test

# Review code
/codereview

# Commit changes
/git
```

### 7. Create PR

```bash
# Create pull request
/create-pr
```

---

## 🧩 Available Backends

### Jira-Taskwarrior (Original)

**Best for**: Teams already using Jira + Taskwarrior

**Tools**:
- Jira (via ACLI) for issue tracking
- Taskwarrior for local task execution
- Bugwarrior for syncing Jira → Taskwarrior

**Setup**: [`backends/jira-taskwarrior/README.md`](backends/jira-taskwarrior/README.md)

### Beads

**Best for**: Individuals or small teams wanting lightweight task management

**Tools**:
- Beads CLI/API for issues and tasks
- Local-first workflow

**Setup**: [`docs/setup/setup-beads.md`](docs/setup/setup-beads.md)

**Example config**:

```json
{
  "workflow": {
    "backend": {
      "type": "beads",
      "config": {
        "workspaceDir": "/absolute/path/to/repo",
        "beadsDir": "/absolute/path/to/repo/.beads",
        "lmmNotesRoot": "$LLM_NOTES_ROOT",
        "repository": "repo-name"
      }
    }
  }
}
```

**Example workflow**:

```bash
# Initialize Beads in your repo
bd init --stealth

# Create a Beads issue manually or through your preferred flow
bd create "Implement backend abstraction" \
  --type feature \
  --description "Make workflow commands backend-agnostic" \
  --json

# Use OpenCode against the Beads backend
/spec opencode-123 --backend=beads
/createtasks opencode-123 --backend=beads
/implement opencode-123 --backend=beads
```

**Notes**:

- Run Beads commands from the initialized workspace root.
- `bd ready --json` is the best ready-work signal for Beads.
- Specs remain portable markdown files under `$LLM_NOTES_ROOT`.

### Custom Backend

**Best for**: Teams with unique workflows or custom tools

**How**: Implement the `WorkflowBackend` interface

**Guide**: [`docs/architecture/adding-backends.md`](docs/architecture/adding-backends.md)

---

## 📋 Core Principles

### 1. Backend = Source of Truth

Your chosen backend (Jira, Beads, etc.) is authoritative for:
- Issues/stories
- Task state
- Ownership and priority

OpenCode coordinates but doesn't replace your workflow engine.

### 2. Specs = First-Class Artifacts

Specs are:
- Version controlled (markdown in git)
- Portable across machines (`$LLM_NOTES_ROOT`)
- Reviewable like code
- Backend-agnostic

### 3. Agents = Accelerators, Not Decision-Makers

Agents:
- ✅ Draft specs
- ✅ Generate implementation tasks
- ✅ Write code
- ✅ Run tests

Humans:
- ✅ Approve specs
- ✅ Review code
- ✅ Make architectural decisions

### 4. State Machines Are Explicit

Every backend implements clear state transitions:
- `new` → `draft` → `approved` (specs)
- `todo` → `inprogress` → `done` (tasks)
- `active` → `review` → `approved` (phases)

Backends can extend these states, but core states are standardized.

---

## 📚 Documentation

### Getting Started
- [Mac Setup Guide](docs/setup/setup-mac.md)
- [Jira-Taskwarrior Setup](backends/jira-taskwarrior/README.md)
- [Beads Setup](docs/setup/setup-beads.md)
- [Migration from Upstream](docs/migration-from-upstream.md)

### Architecture
- [Workflow Backend Interface](docs/architecture/workflow-backend-interface.md)
- [Adding Custom Backends](docs/architecture/adding-backends.md)
- [Backend Injection Diagrams](docs/BACKEND_INJECTION_DIAGRAMS.md)
- [Implementation Details](docs/implement-workflows.md)

### Customizations
- [Customization Log](CUSTOMIZATIONS.md) - Track of all changes in this fork
- [Task List](TODO.md) - Current development tasks

---

## 🔧 Project Status

**Current Phase**: Phase 0 - Foundation & Documentation

This is an **independent fork** focused on workflow flexibility. See [`CUSTOMIZATIONS.md`](CUSTOMIZATIONS.md) for the full story.

**Completed**:
- ✅ Architecture design
- ✅ Backend interface definition
- 🚧 Jira-Taskwarrior backend (in progress)
- 📋 Beads backend (planned)

See [`TODO.md`](TODO.md) for detailed progress.

---

## 🤝 Contributing

### For Users
- Report issues and bugs
- Request new backend implementations
- Share your workflow customizations

### For Developers
- Implement new backends (see [guide](docs/architecture/adding-backends.md))
- Improve existing backends
- Add tests and documentation

**Important**: This is an independent fork. Contributions here won't go to the upstream repository.

---

## 🙏 Acknowledgments

This project is a fork of the original OpenCode agentic workflow by [matlockx](https://github.com/matlockx/opencode), originally designed for fintech/regulated environments with Jira + Taskwarrior.

**Key Changes in This Fork**:
- Workflow-agnostic architecture (pluggable backends)
- macOS support
- Generic domain (not fintech-specific)
- Multiple backend support

See [`CUSTOMIZATIONS.md`](CUSTOMIZATIONS.md) for the full divergence history.

---

## 📄 License

MIT (same as upstream)

---

## 🗺️ What This Gives You

- **Clean separation**: Your workflow backend handles state, agents handle acceleration
- **Local-first specs**: Portable, version-controlled design artifacts
- **Explicit gates**: Clear approval points (spec review, code review)
- **Agent acceleration**: Without loss of human control
- **Full audit trail**: Every state change tracked
- **Workflow flexibility**: Use tools that fit your team

**Choose your backend. Start building.**
