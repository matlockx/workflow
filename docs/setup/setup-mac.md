# macOS Setup Guide

Complete setup instructions for running OpenCode with workflow backends on macOS.

---

## Prerequisites

### System Requirements

- **macOS**: 10.15 (Catalina) or later
- **Shell**: zsh (default on modern macOS) or bash
- **Homebrew**: Package manager for macOS
- **Git**: Version control (pre-installed on macOS)

### Install Homebrew (if not installed)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Verify installation:

```bash
brew --version
```

---

## Step 1: Choose Your Backend

Pick your workflow backend:

- **Jira-Taskwarrior**: If using Jira + Taskwarrior + Bugwarrior → [Setup Guide](setup-jira-taskwarrior.md)
- **Beads**: If using Beads task manager → [Setup Guide](setup-beads.md)
- **Custom**: Roll your own → [Backend Interface Docs](../architecture/workflow-backend-interface.md)

---

## Step 2: Install OpenCode

### Clone the Repository

```bash
cd ~/Code  # or your preferred directory
git clone https://github.com/YOUR-USERNAME/opencode.git
cd opencode
```

### Install Dependencies (if any)

```bash
# If there's a package.json
npm install  # or yarn install

# If there's a requirements.txt (Python)
pip3 install -r requirements.txt
```

---

## Step 3: Configure Environment

### Set LLM Notes Root

This is where specs will be stored:

```bash
# Create directory
mkdir -p ~/Code/llm-notes

# Add to shell profile
echo 'export LLM_NOTES_ROOT="$HOME/Code/llm-notes"' >> ~/.zshrc

# Reload shell
source ~/.zshrc

# Verify
echo $LLM_NOTES_ROOT
# Output: /Users/yourname/Code/llm-notes
```

**Note**: You can use any directory you prefer. Each developer can have different paths.

### Create OpenCode Configuration

Create `opencode.json` in your project root:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "workflow": {
    "backend": {
      "type": "jira-taskwarrior",  // or "beads" or "custom"
      "config": {
        // Backend-specific config (see backend setup guide)
      }
    }
  },
  "provider": {
    // Your LLM provider config
  },
  "agent": {
    "general": {
      "model": "github-copilot/claude-sonnet-4.5"
    }
  }
}
```

---

## Step 4: Backend-Specific Setup

Now follow the setup guide for your chosen backend:

### For Jira-Taskwarrior Backend

See: [Jira-Taskwarrior Setup Guide](setup-jira-taskwarrior.md)

**Quick Summary**:
```bash
# Install tools
brew install task  # Taskwarrior
pip3 install bugwarrior  # Jira sync

# Install Atlassian CLI
# See: https://developer.atlassian.com/cloud/acli/guides/install-acli/

# Configure taskwarrior
# See full guide for .taskrc configuration
```

### For Beads Backend

See: [Beads Setup Guide](setup-beads.md)

**Quick Summary**:
```bash
# Install Beads (if available via brew)
brew install beads  # or follow Beads installation instructions

# Configure Beads
# See full guide for configuration
```

---

## Step 5: Verify Installation

### Test Basic Commands

```bash
# Check if commands are available
opencode --version

# Test backend connection
# (command depends on backend)
```

### Test Workflow

```bash
# Create a test issue (if using po-issue agent)
/po-issue "Test: Setup verification"

# Create a test spec
/spec TEST-123  # Replace with your test issue ID

# Verify spec file created
ls $LLM_NOTES_ROOT/*/notes/specs/
```

---

## Common macOS-Specific Issues

### Issue: Command not found (task, acli, etc.)

**Cause**: Tool not in PATH or not installed

**Fix**:
```bash
# Check if installed
which task
which acli

# If not found, install
brew install task  # For Taskwarrior

# Add Homebrew bin to PATH (if needed)
echo 'export PATH="/usr/local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Issue: Permission denied errors

**Cause**: macOS security restrictions

**Fix**:
```bash
# Grant permission to terminal
# System Preferences → Security & Privacy → Privacy → Full Disk Access
# Add Terminal.app or your terminal emulator

# Or use sudo for specific commands (not recommended)
```

### Issue: $LLM_NOTES_ROOT not found

**Cause**: Environment variable not set or not persisted

**Fix**:
```bash
# Check if set
echo $LLM_NOTES_ROOT

# If empty, add to shell profile
echo 'export LLM_NOTES_ROOT="$HOME/Code/llm-notes"' >> ~/.zshrc
source ~/.zshrc

# Verify again
echo $LLM_NOTES_ROOT
```

### Issue: Python pip3 not found

**Cause**: Python 3 not installed or not in PATH

**Fix**:
```bash
# Install Python 3 via Homebrew
brew install python3

# Verify
python3 --version
pip3 --version
```

### Issue: SSL certificate errors

**Cause**: Corporate proxy or outdated certificates

**Fix**:
```bash
# Update certificates
brew update
brew upgrade

# Or configure pip to trust your proxy
pip3 config set global.trusted-host "pypi.org files.pythonhosted.org"
```

---

## macOS-Specific Tips

### Use zsh (Recommended)

Modern macOS uses zsh as the default shell:

```bash
# Check your shell
echo $SHELL
# Output: /bin/zsh

# If using bash, consider switching
chsh -s /bin/zsh
```

**Why zsh?**: Better autocompletion, plugins, and default on macOS Catalina+.

### Use Homebrew for Everything

Prefer Homebrew over manual installs:

```bash
# Search for packages
brew search taskwarrior

# Get info
brew info task

# Install
brew install task
```

**Why?**: Easy updates, clean uninstalls, no system conflicts.

### Directory Structure

Recommended directory structure on Mac:

```
~/Code/
├── llm-notes/              # $LLM_NOTES_ROOT
│   ├── project1/
│   │   └── notes/
│   │       └── specs/
│   ├── project2/
│   │   └── notes/
│   │       └── specs/
│   └── ...
├── opencode/               # This repo
└── your-projects/          # Your actual codebases
    ├── project1/
    ├── project2/
    └── ...
```

### Use iTerm2 or Warp

Consider using a better terminal:

- **iTerm2**: [https://iterm2.com/](https://iterm2.com/)
- **Warp**: [https://www.warp.dev/](https://www.warp.dev/)

Both offer better macOS integration than default Terminal.app.

---

## Optional Enhancements

### 1. Install Oh My Zsh (Shell Enhancement)

```bash
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
```

Benefits: Themes, plugins, better git integration.

### 2. Setup Shell Aliases

Add to `~/.zshrc`:

```bash
# OpenCode aliases
alias oc='opencode'
alias spec='opencode run /spec'
alias tasks='opencode run /createtasks'
alias impl='opencode run /implement'

# Backend-specific aliases
alias tw='task'  # Taskwarrior shortcut
alias jira='acli jira'  # ACLI shortcut
```

Reload:
```bash
source ~/.zshrc
```

### 3. Setup Git for Specs

Initialize git in your llm-notes directory:

```bash
cd $LLM_NOTES_ROOT
git init
git add .
git commit -m "Initial commit: spec repository"

# Optional: push to remote
git remote add origin git@github.com:your-username/llm-notes.git
git push -u origin main
```

### 4. Install Visual Studio Code (Optional)

For editing specs and code:

```bash
brew install --cask visual-studio-code

# Add code command to PATH
# Open VS Code, press Cmd+Shift+P, type "shell command"
# Select: "Install 'code' command in PATH"

# Now you can open specs easily
code $LLM_NOTES_ROOT
```

---

## Next Steps

1. ✅ **Complete backend setup**: Follow your backend-specific guide
2. ✅ **Test workflow**: Create issue → spec → tasks → implement
3. ✅ **Customize**: Add your own scripts, aliases, and workflows
4. ✅ **Explore**: Try different backends, experiment with agents

---

## Resources

### macOS-Specific
- [Homebrew Documentation](https://docs.brew.sh/)
- [zsh Documentation](https://zsh.sourceforge.io/Doc/)
- [macOS Terminal User Guide](https://support.apple.com/guide/terminal/welcome/mac)

### OpenCode
- [Main README](../../README.md)
- [Backend Interface](../architecture/workflow-backend-interface.md)
- [Jira-Taskwarrior Setup](setup-jira-taskwarrior.md)
- [Beads Setup](setup-beads.md)
- [Migration Guide](../migration-from-upstream.md)

---

## Getting Help

### For macOS Issues

1. Check [Homebrew Troubleshooting](https://docs.brew.sh/Troubleshooting)
2. Check Apple Support docs
3. Search Stack Overflow for macOS-specific errors

### For OpenCode Issues

1. Check this guide
2. Review backend-specific setup guides
3. Check [CUSTOMIZATIONS.md](../../CUSTOMIZATIONS.md)
4. Open an issue in this repo

---

**Ready to start building with OpenCode on macOS!** 🚀
