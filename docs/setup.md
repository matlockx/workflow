## Technical Setup Guide

Opencode Agents × Jira (ACLI) × Bugwarrior × Taskwarrior × Portable Specs

This is a concrete, copy/pasteable setup that gets the whole flow working end-to-end.

---

# 0. Prereqs and conventions

### Assumptions

* You’re on macOS or Linux
* You already use Opencode
* Jira is Atlassian Cloud

### Directory convention (portable specs)

All devs must have *some* local checkout of `llm-notes`, but the location can differ.

Set this once in your shell profile (`~/.zshrc` on macOS by default, or `~/.bashrc` if you use bash):

```bash
export LLM_NOTES_ROOT="$HOME/Code/llm-notes"
```

(Each developer can set it to any path they want.)

---

# 1. Install tools

## 1.1 Taskwarrior

### macOS

```bash
brew install task
task --version
```

### Linux

```bash
# Arch
sudo pacman -S taskwarrior

# Debian/Ubuntu
sudo apt-get install taskwarrior

task --version
```

## 1.2 Bugwarrior

### macOS

```bash
python3 -m pip install --user bugwarrior jira
bugwarrior-pull --version
```

### Linux

```bash
# Arch
sudo pacman -S bugwarrior python-setuptools python-jira

# Debian/Ubuntu
python3 -m pip install --user bugwarrior jira

bugwarrior-pull --version
```

> If you use `uv tool`, ensure the tool environment includes `setuptools` because Bugwarrior dependencies may still expect it.

## 1.3 Jira CLI (ACLI)

Install per Atlassian docs, then verify:

```bash
acli --version
acli jira me
```

You want `acli jira me` to work before proceeding.

On macOS, prefer Atlassian's official install instructions and ensure the resulting binary is in your shell `PATH`.

---

# 2. Taskwarrior configuration

## 2.1 Add UDAs for this workflow

Edit `~/.taskrc` and add:

```ini
# --- Workflow UDAs ---
uda.work_state.type=string
uda.work_state.label=WorkState
uda.work_state.values=new,todo,draft,inprogress,approved,done,rejected
uda.work_state.default=new

uda.jira_assignee.type=string
uda.jira_assignee.label=Assignee
```

Reload shell or just keep going (Taskwarrior reads `.taskrc` each run).

---

# 3. Bugwarrior configuration (Jira → Taskwarrior sync)

Create config:

```bash
mkdir -p ~/.config/bugwarrior
nvim ~/.config/bugwarrior/bugwarrior.toml
```

Paste and adapt:

```toml
[general]
targets = ["jira"]

[jira]
service = "jira"
base_uri = "https://YOURCOMPANY.atlassian.net"
username = "you@company.com"

# Use a token/password provider; example using pass
password = "@oracle:eval:pass show jira"

# Keep the local task list sane
only_if_assigned = true
only_if_open = true

# Task fields
description_template = "{{key}} {{summary}}"
project_template = "{{project.key | lower}}"

# Jira → local tags
import_labels_as_tags = true
add_tags = ["jira"]

# Store Jira description as annotation (safer than overwriting description)
annotation_template = "{{description}}"

# Map assignee to Taskwarrior UDA
uda.jira_assignee = "{{ assignee.displayName | default('unassigned') }}"
```

### First pull

```bash
bugwarrior-pull
task +jira
```

You should now see tasks representing Jira issues assigned to you.

---

# 4. Opencode agents (the minimum viable set)

You’ll typically want 4 agents:

1. **PO-Issue Agent**: Creates issues via the configured backend
2. **Spec Agent**: Creates a local spec task + spec file + annotation
3. **Build Agent**: Executes implementation tasks (local only)
4. **Review Agent**: Collects context and queues human review

Below are the technical bits that matter for the “whole flow” to work.

---

## 4.1 PO-Issue Agent (ACLI + Jira wiki markup for Jira backends)

Key requirements:

* Jira description uses **Jira wiki markup**, not Markdown
* Agent confirms:

  * Jira project: `IN | IMP | DEVOPS`
  * Epic link (optional, never guessed)
* For Jira-backed workflows, agent uses `acli` to create the issue

Output format inside Jira description should be:

```text
h2. User Story
As a ...
I want ...
So that ...

h2. Acceptance Criteria
* Given ...
* When ...
* Then ...

h2. Remarks
* Assumptions: ...
* Constraints: ...
* Non-goals: ...
* Open questions: ...

h2. Attachments
* None
```

Labels to add:

* `agent-created`
* `needs-refinement`

---

## 4.2 Spec Agent (creates backend-tracked spec + file)

### What it does

Given an issue from the configured backend:

* Creates or resolves a backend-tracked spec entry
* Creates a spec file in `llm-notes`
* Stores or links the portable spec path through backend metadata

### Spec annotation format (portable)

**Never use absolute paths.** Use paths relative to `$LLM_NOTES_ROOT`.

Example annotation:

```text
Spec(repo=project1): project1/notes/specs/IN-1423__read-migration.md
```

### Spec file location

```text
$LLM_NOTES_ROOT/project1/notes/specs/IN-1423__read-migration.md
```

### Spec file naming

```text
<JIRAKEY>__<slug>.md
```

---

## 4.3 Human Spec Review (gate)

Workflow:

* Spec agent sets `work_state:draft` then `work_state:review`
* Human changes `work_state:approved` and marks spec task `done`

List specs needing review:

```bash
task +spec work_state:review
```

---

## 4.4 Build Agent (unblocked by spec)

Rule:

* Implementation tasks must depend on the spec task UUID

Example:

```bash
task add \
  "Implement read path behind feature flag" \
  project:project1.user-balance \
  +code \
  depends:<spec-uuid>
```

Then the build agent pulls:

```bash
task ready
```

and executes tasks that are unblocked.

---

## 4.5 Review Agent (queues human review)

When implementation is done:

* create a local review task:

  * `+review`
  * link to PR(s) via annotations

Example:

```bash
task add "REVIEW: IN-1423 read migration PR" +review project:review
task <id> annotate "PR: https://github.com/org/repo/pull/812"
```

List pending reviews:

```bash
task +review
```

---

# 5. Operational Commands (daily usage)

## Pull Jira → Taskwarrior

```bash
bugwarrior-pull
```

## See Jira tasks

```bash
task +jira
task +jira columns:id,description,jira_assignee
```

## Create spec (agent-driven)

If I want to write a spec, I query Taskwarrior for specs, check the JiraID, and start the flow.

```bash
task specs

/specjira IN-1423
```

## List spec reviews

```bash
task +spec work_state:review
```

## List executable work

```bash
task ready
```

## List reviews

```bash
task +review
```

---

# 6. A simple “make it real” checklist

✅ ACLI works: `acli jira me`
✅ Bugwarrior pulls: `bugwarrior-pull`
✅ Jira tasks appear: `task +jira`
✅ Assignee visible: `task +jira columns:id,description,jira_assignee`
✅ Spec tasks are local: `task +spec`
✅ Specs are portable: annotations are relative to `$LLM_NOTES_ROOT`
✅ Build tasks are gated: `depends:<spec-uuid>` so `task ready` enforces flow
