# Migration Guide: From Upstream OpenCode

This guide helps users migrate from the original [matlockx/opencode](https://github.com/matlockx/opencode) repository to this workflow-agnostic fork.

---

## Should You Migrate?

### Stay on Upstream If:
- ✅ You're happy with Jira + Taskwarrior + Bugwarrior workflow
- ✅ You're in a fintech/regulated environment aligned with SalaryHero's practices
- ✅ You don't need workflow flexibility
- ✅ You prefer the original Linux/Arch-oriented setup without additional abstraction

### Migrate to This Fork If:
- ✅ You want to use different workflow tools (Beads, GitHub Issues, custom)
- ✅ You're on macOS and need better support
- ✅ You want workflow flexibility (multiple backends)
- ✅ You're not in a fintech-specific environment
- ✅ You want a more generic, adaptable system

---

## What Changed?

### Breaking Changes

#### 1. Backend Abstraction Layer

**Before** (Upstream):
```bash
# Commands directly call taskwarrior, acli, etc.
/specjira IN-1373  # Hardcoded to Jira + Taskwarrior
```

**After** (This Fork):
```bash
# Commands use pluggable backends
/spec IN-1373      # Uses backend from opencode.json
```

**Migration**: Update `opencode.json` to specify backend (see below).

#### 2. Command Names

**Before** (Upstream):
- `/specjira` - Create spec from Jira issue

**After** (This Fork):
- `/spec` - Create spec from issue (backend-agnostic)
- `/specjira` - **Deprecated alias** (still works with warning)

**Migration**: Start using `/spec` instead of `/specjira`.

#### 3. Skills Organization

**Before** (Upstream):
- `/skills/taskwarrior/SKILL.md` - Taskwarrior-specific skill

**After** (This Fork):
- `/skills/workflow-backend/SKILL.md` - Generic backend skill
- `/backends/jira-taskwarrior/SKILL.md` - Taskwarrior-specific details

**Migration**: Update agent prompts and local habits to prefer `workflow-backend`; keep `taskwarrior` only for legacy Jira-Taskwarrior-specific references.

#### 4. Agent Names

**Before** (Upstream):
- `po-jira` agent - Creates Jira stories

**After** (This Fork):
- `po-issue` agent - Creates issues (backend-agnostic)

**Migration**: Agent names and prompts are now workflow-agnostic; update any local references from `po-jira` to `po-issue`.

### Non-Breaking Changes

#### 1. Spec Storage

**Simplified**: Specs now stored directly in `specs/` directory (configurable via `specsDir`).

**Benefit**: Simpler path structure, no external `$LLM_NOTES_ROOT` required.

#### 2. State Model

**Enhanced**: Core states standardized, backends can extend.

**Benefit**: Consistent vocabulary across different backends.

#### 3. macOS Support

**New**: First-class macOS support with Homebrew instructions.

**Benefit**: Easier setup on Mac.

---

## Migration Steps

**Good news**: no dedicated migration script is currently required. Existing specs stay in the same markdown format, and the `jira-taskwarrior` backend continues to use the same Taskwarrior data model. Migration is primarily a config and command-name update.

### Step 1: Backup Your Data

```bash
# Backup taskwarrior data
cp -r ~/.task ~/.task.backup

# Backup specs (if you have existing specs)
cp -r specs specs.backup

# Backup git history
cd /path/to/opencode
git bundle create opencode-backup.bundle --all
```

### Step 2: Update OpenCode

```bash
# Clone this fork
cd ~
git clone https://github.com/YOUR-USERNAME/opencode.git opencode-new

# Or update existing clone
cd /path/to/opencode
git remote add fork https://github.com/YOUR-USERNAME/opencode.git
git fetch fork
git checkout -b workflow-agnostic fork/main
```

### Step 3: Configure Backend

Create or update `.agent/config.json`:

```json
{
  "backend": {
    "type": "jira-taskwarrior",
    "config": {
      "jiraSite": "your-org.atlassian.net",
      "jiraProject": "PROJ",
      "jiraEmail": "you@example.com",
      "taskrcPath": "~/.taskrc",
      "taskDataLocation": "~/.task",
      "specsDir": "./specs"
    }
  }
}
```

**Important**: Backend config is in `.agent/config.json`, separate from `opencode.json`.

### Step 4: Test Your Workflow

Test the existing workflow still works:

```bash
# List Jira tasks (should work as before)
task +jira list

# Create a spec (use new generic command)
/spec JIRA-123

# Or use deprecated alias (will show warning)
/specjira JIRA-123
```

### Step 5: Update Your Scripts

If you have custom scripts or aliases:

**Before**:
```bash
alias spec='opencode run /specjira'
```

**After**:
```bash
alias spec='opencode run /spec'
```

### Step 6: Update Agent Prompts (If Customized)

If you've customized agent prompts, update references:

**Before**:
```markdown
You are creating a specification from a Jira issue...
Run: task jiraid:$ARGUMENTS +jira export
```

**After**:
```markdown
You are creating a specification from an issue...
Run: context.backend.getIssue($ARGUMENTS)
```

**Note**: Only needed if you've heavily customized agents.

---

## Compatibility Matrix

| Feature | Upstream | This Fork | Status |
|---------|----------|-----------|--------|
| Jira + Taskwarrior workflow | ✅ | ✅ | ✅ Fully compatible |
| `/specjira` command | ✅ | ⚠️ | ⚠️ Deprecated (still works) |
| `/spec` command | ❌ | ✅ | ✅ New generic command |
| Beads workflow | ❌ | ✅ | ✅ New in fork |
| macOS setup guide | ⚠️ | ✅ | ✅ Enhanced in fork |
| Linux (Arch) setup | ✅ | ✅ | ✅ Still supported |
| macOS setup | ⚠️ | ✅ | ✅ First-class in fork |
| Spec storage format | ✅ | ✅ | ✅ Unchanged |
| State model | ✅ | ✅ | ✅ Enhanced (backward compatible) |
| Skills structure | ✅ | ⚠️ | ⚠️ Reorganized |

**Legend**:
- ✅ Fully supported
- ⚠️ Supported with changes
- ❌ Not supported

---

## FAQ

### Q: Will my existing specs work?

**A**: Yes! Spec format is unchanged. They'll work with any backend.

### Q: Will my Taskwarrior data work?

**A**: Yes! The jira-taskwarrior backend uses the same data format.

### Q: Can I switch between upstream and fork?

**A**: Yes, but be cautious:
- Your specs will work in both
- Commands have different names (use `/specjira` in upstream)
- Configuration format differs (`opencode.json` has new fields in fork)

**Recommendation**: Pick one and stick with it.

### Q: What if I want to go back to upstream?

**A**: You can revert:

```bash
# Restore from backup
cd /path/to/opencode
git checkout original-branch

# Restore taskwarrior data (if needed)
rm -rf ~/.task
cp -r ~/.task.backup ~/.task
```

Your specs remain unchanged (they're just markdown files).

### Q: Will upstream features be ported to this fork?

**A**: No automatic syncing. This is an independent fork with different goals.

**If you need an upstream feature**: Open an issue and we'll consider porting it.

### Q: Can I contribute to both?

**A**: Yes! Contributions welcomed in both repos, but they serve different use cases.

---

## Troubleshooting

### Issue: `/spec` command not found

**Cause**: Using old command structure.

**Fix**: Update `opencode.json` to include workflow backend config (see Step 3).

### Issue: Backend not configured error

**Cause**: Missing `workflow.backend` in `opencode.json`.

**Fix**: Add backend configuration:

```json
{
  "workflow": {
    "backend": {
      "type": "jira-taskwarrior",
      "config": {}
    }
  }
}
```

### Issue: Spec files not found

**Cause**: `specsDir` not configured or pointing to wrong location.

**Fix**: Ensure `.agent/config.json` has `specsDir` configured:

```json
{
  "backend": {
    "type": "jira-taskwarrior",
    "config": {
      "specsDir": "./specs"
    }
  }
}
```

Then create the specs directory if needed:

```bash
mkdir -p specs
```

### Issue: Taskwarrior commands fail

**Cause**: Taskwarrior is not installed, the Taskwarrior config/data paths are wrong, or required UDAs are missing.

**Fix**: Update `opencode.json` to use the implemented backend config keys:

```json
{
  "workflow": {
    "backend": {
      "type": "jira-taskwarrior",
      "config": {
        "taskrcPath": "~/.taskrc",
        "taskDataLocation": "~/.task",
        "jiraSite": "your-org.atlassian.net",
        "jiraProject": "PROJ",
        "jiraEmail": "you@example.com"
      }
    }
  }
}
```

Then verify:

```bash
task --version
task show | grep "uda\."
```

If the UDAs are missing, add them using the setup in [`backends/jira-taskwarrior/README.md`](../backends/jira-taskwarrior/README.md).

### Issue: Deprecation warnings for `/specjira`

**Cause**: Using old command name.

**Fix**: Switch to `/spec`:

```bash
/spec JIRA-123  # Instead of /specjira JIRA-123
```

---

## Getting Help

### For Migration Issues

1. Check this migration guide
2. Review [CUSTOMIZATIONS.md](../CUSTOMIZATIONS.md) for design decisions
3. Check [workflow-backend-interface.md](architecture/workflow-backend-interface.md)
4. Open an issue in this repo

### For General OpenCode Issues

1. Check [README.md](../README.md)
2. Review setup guides:
   - [Mac Setup](setup/setup-mac.md)
   - [Jira-Taskwarrior Setup](../backends/jira-taskwarrior/README.md)
3. Check [TODO.md](../TODO.md) for known issues/roadmap

---

## Success Stories

Share your migration experience! Open a PR to add your story here.

---

## Next Steps

After successful migration:

1. ✅ Verify your workflow works with jira-taskwarrior backend
2. 📋 Explore other backends (Beads, custom)
3. 📋 Contribute backend implementations
4. 📋 Share feedback and improvements

Welcome to workflow-agnostic OpenCode! 🎉
