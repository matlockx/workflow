# macOS-Specific Quirks and Compatibility Notes

This document captures macOS-specific behaviors, compatibility notes, and quirks discovered during testing.

**Last Updated**: 2026-03-28

---

## Testing Summary

### Beads Backend ✅ Fully Tested

**Test Date**: 2026-03-28  
**Test Environment**:
- macOS 15.2.0 (darwin 25.2.0)
- Architecture: Apple Silicon (arm64 / M-series)
- Beads version: 0.62.0 (installed via Homebrew)
- Installation location: `/opt/homebrew/bin/bd`

**Workflow Tested**:
1. ✅ Beads workspace initialization
2. ✅ Backend loading and configuration
3. ✅ Issue creation
4. ✅ Spec creation and file generation
5. ✅ Spec approval
6. ✅ Task generation from spec
7. ✅ Task querying
8. ✅ Task state transitions

**Result**: All tests passed. Beads backend is fully functional on macOS.

**Quirks**: None detected. Beads works identically on macOS as on Linux.

### Jira-Taskwarrior Backend ⚠️ Not Tested

**Status**: Backend implementation complete, runtime testing deferred.

**Reason**: This test environment does not have the required tools installed:
- `task` (Taskwarrior) - not installed
- `acli` (Atlassian CLI) - not installed
- Jira Cloud access - not configured

**Confidence**: High - Backend uses standard shell commands and file operations. All path handling is portable. Mock tests pass.

**Recommendation**: Test in an environment with Taskwarrior and ACLI configured. See [Jira-Taskwarrior Setup Guide](../../backends/jira-taskwarrior/README.md).

---

## Architecture-Specific Notes

### Apple Silicon (M1/M2/M3) vs Intel

**Homebrew Location**:
- **Apple Silicon**: `/opt/homebrew/bin`
- **Intel**: `/usr/local/bin`

Both locations should be in your PATH. Add to `~/.zshrc` if needed:

```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
```

**Compatibility**: All tested tools work on both architectures when installed via Homebrew.

---

## Shell Compatibility

### zsh (Default Shell)

macOS Catalina (10.15) and later use **zsh** as the default shell.

**Profile File**: `~/.zshrc`

**Compatibility**: All OpenCode shell commands work in zsh without modification.

### bash (Optional)

bash is still available on macOS but requires explicit configuration.

**Profile File**: `~/.bash_profile` or `~/.bashrc`

**Compatibility**: All OpenCode shell commands work in bash.

**Switch to bash**:
```bash
chsh -s /bin/bash
```

---

## File System

### Case Sensitivity

**Default**: macOS file system (APFS) is **case-insensitive** by default.

**Impact**: 
- File names like `README.md` and `readme.md` are treated as the same file
- Git may show conflicts when cloning repos with case-only filename differences

**Recommendation**: Be consistent with file naming. Use lowercase for most files.

### Path Separators

**Separator**: `/` (same as Linux)

**Compatibility**: All OpenCode paths use `/` separator, fully compatible.

---

## Environment Variables

### $LLM_NOTES_ROOT

**Works**: ✅ Resolves correctly on macOS

**Test Results**:
```bash
export LLM_NOTES_ROOT="$HOME/Code/llm-notes"
echo $LLM_NOTES_ROOT
# Output: /Users/yourname/Code/llm-notes
```

**Compatibility**: Identical behavior to Linux.

### Tilde Expansion

**Works**: ✅ `~` expands to home directory in both zsh and bash

**Examples**:
- `~/.taskrc` → `/Users/yourname/.taskrc`
- `~/.config` → `/Users/yourname/.config`

---

## Command-Line Tools

### GNU vs BSD Utilities

macOS ships with **BSD** versions of Unix utilities, while Linux uses **GNU** versions.

| Command | macOS (BSD) | Linux (GNU) | OpenCode Usage |
|---------|-------------|-------------|----------------|
| `sed -i` | `sed -i ''` | `sed -i` | Not used ✅ |
| `grep -P` | Not available | Available | Not used ✅ |
| `readlink -f` | Not available | Available | Not used ✅ |
| `date -d` | `date -j -f` | `date -d` | Not used ✅ |
| `stat -c` | `stat -f` | `stat -c` | Not used ✅ |

**Good News**: OpenCode documentation avoids GNU-specific syntax, so all commands work on macOS without modification.

### Installing GNU Tools (Optional)

If you need GNU versions:

```bash
brew install coreutils findutils gnu-sed gnu-tar grep
```

GNU commands are prefixed with `g`:
- `gsed` instead of `sed`
- `ggrep` instead of `grep`
- `greadlink` instead of `readlink`

**Not needed for OpenCode**.

---

## Permissions

### Full Disk Access

Some operations may require granting terminal Full Disk Access:

1. Open **System Preferences** → **Security & Privacy** → **Privacy**
2. Select **Full Disk Access** in the left sidebar
3. Click the lock icon and authenticate
4. Add your terminal app (Terminal.app, iTerm2, etc.)

**Usually not needed for OpenCode**, but helpful if you encounter permission errors.

---

## Homebrew-Specific

### Installation Verification

Check Homebrew is working:

```bash
brew --version
# Output: Homebrew 4.x.x

brew doctor
# Should report: Your system is ready to brew.
```

### Common Issues

#### Issue: `brew` command not found

**Fix**:
```bash
# Add Homebrew to PATH (Apple Silicon)
echo 'export PATH="/opt/homebrew/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Or for Intel Macs
echo 'export PATH="/usr/local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

#### Issue: Permissions errors

**Fix**:
```bash
# Fix Homebrew permissions
sudo chown -R $(whoami) /opt/homebrew  # Apple Silicon
# Or
sudo chown -R $(whoami) /usr/local     # Intel
```

---

## Python and pip

### Python 3 on macOS

macOS ships with Python 2.7 (legacy) and may not include Python 3 by default.

**Install Python 3**:
```bash
brew install python3

# Verify
python3 --version
pip3 --version
```

**Aliases** (optional):
```bash
alias python=python3
alias pip=pip3
```

Add to `~/.zshrc` for persistence.

---

## Known Issues

### None

No macOS-specific issues found during testing (2026-03-28).

---

## Testing on Your macOS System

To verify OpenCode works on your Mac:

### Quick Test (Beads Backend)

```bash
# Install Beads
brew install beads

# Create test workspace
mkdir -p /tmp/opencode_test
cd /tmp/opencode_test

# Initialize Beads
bd init --quiet --stealth

# Test commands
bd create "Test Issue" --description "Testing on macOS" --json
bd list --json

# Cleanup
cd ~
rm -rf /tmp/opencode_test
```

### Full Test (Jira-Taskwarrior Backend)

Requires:
1. Install Taskwarrior: `brew install task`
2. Configure UDAs in `~/.taskrc` (see [setup guide](../../backends/jira-taskwarrior/README.md))
3. Install and authenticate ACLI
4. Configure `opencode.json` with jira-taskwarrior backend

Then follow the workflow:
1. Create issue via `/po-issue`
2. Create spec via `/spec`
3. Generate tasks via `/createtasks`
4. Implement via `/implement`

---

## Reporting Issues

If you encounter macOS-specific issues:

1. Check this document first
2. Review [macOS Setup Guide](setup-mac.md)
3. Check backend-specific README
4. Open an issue with:
   - macOS version (`sw_vers`)
   - Architecture (`uname -m`)
   - Shell (`echo $SHELL`)
   - Error message
   - Steps to reproduce

---

**Last Tested**: 2026-03-28  
**Next Review**: When new backends are added or macOS version changes significantly
