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

- **Jira-Taskwarrior**: If using Jira + Taskwarrior + Bugwarrior → [Setup Guide](../../backends/jira-taskwarrior/README.md)
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

See: [Jira-Taskwarrior Setup Guide](../../backends/jira-taskwarrior/README.md)

#### Install Taskwarrior

Taskwarrior is a command-line task management tool:

```bash
# Install via Homebrew (recommended)
brew install task

# Verify installation
task --version
# Expected output: task 2.6.x or higher

# Configure User Defined Attributes (UDAs)
# Create or edit ~/.taskrc
cat >> ~/.taskrc << 'EOF'

# User Defined Attributes (UDAs) for OpenCode
uda.jiraid.type=string
uda.jiraid.label=Jira ID
uda.jiraid.values=

uda.work_state.type=string
uda.work_state.label=Work State
uda.work_state.values=new,draft,todo,inprogress,review,approved,rejected,done

uda.repository.type=string
uda.repository.label=Repository
uda.repository.values=
EOF

# Verify UDAs are configured
task show | grep "uda\."
# Should show the three UDAs above
```

#### Install Bugwarrior (Optional)

Bugwarrior syncs external issue trackers (like Jira) to Taskwarrior:

```bash
# Install via pip3
pip3 install bugwarrior

# Verify installation
bugwarrior-pull --version

# Create config directory
mkdir -p ~/.config/bugwarrior

# Create configuration file
cat > ~/.config/bugwarrior/bugwarrior.toml << 'EOF'
[general]
targets = my_jira

[my_jira]
service = jira
jira.base_uri = https://your-site.atlassian.net
jira.username = you@example.com
jira.password = YOUR_API_TOKEN
jira.query = assignee = currentUser() AND resolution = Unresolved
EOF

# Edit the config with your actual Jira details
# Then sync:
bugwarrior-pull
```

**Note**: Bugwarrior is optional. You can use OpenCode without it, but syncing Jira issues to Taskwarrior provides better integration.

#### Install Atlassian CLI (ACLI)

ACLI enables Jira operations from the command line:

```bash
# Option 1: Install via Homebrew (if available)
brew tap atlassian/tap
brew install atlassian-cli

# Option 2: Download from Atlassian
# Visit: https://developer.atlassian.com/cloud/acli/guides/install-acli/
# Download the macOS installer and follow instructions

# Verify installation
acli --version

# Authenticate with Jira
acli jira auth login --web
# This will open your browser for OAuth authentication

# Verify authentication
acli jira auth status

# Test with a simple query
acli jira workitem list --assignee me --max-results 5
```

**Troubleshooting ACLI**:
- If `brew install` fails, use the manual download method
- Make sure ACLI is in your PATH: `which acli`
- For auth issues, try: `acli jira auth login --web` again

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

## Shell Compatibility

### zsh (Recommended for macOS)

Modern macOS (Catalina 10.15+) uses **zsh** as the default shell. All commands in this guide work in both zsh and bash.

```bash
# Check your current shell
echo $SHELL
# Output: /bin/zsh (on modern macOS)

# Shell profile files:
# - zsh: ~/.zshrc
# - bash: ~/.bashrc or ~/.bash_profile
```

### Command Compatibility

All shell commands in OpenCode docs are tested on macOS and use portable syntax:

- ✅ **Environment variables**: `$HOME`, `$LLM_NOTES_ROOT` work in both shells
- ✅ **Tilde expansion**: `~/.config` works in both shells  
- ✅ **Here-docs**: `cat << EOF` syntax works in both shells
- ✅ **Command substitution**: `$(command)` works in both shells
- ✅ **Piping and redirection**: Standard bash syntax works in zsh

### GNU vs BSD Commands

macOS uses **BSD** versions of Unix commands, which differ slightly from **GNU** versions on Linux:

| Command | macOS (BSD) | Linux (GNU) | OpenCode Docs |
|---------|-------------|-------------|---------------|
| `sed -i` | `sed -i ''` | `sed -i` | ✅ Not used |
| `grep -P` | Not available | Available | ✅ Not used |
| `readlink -f` | Not available | Available | ✅ Not used |
| `date -d` | `date -j -f` | `date -d` | ✅ Not used |

**Good news**: OpenCode docs don't use GNU-specific syntax, so all commands work on macOS without modification.

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

# Add Homebrew bin to PATH (Apple Silicon commonly uses /opt/homebrew/bin)
echo 'export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"' >> ~/.zshrc
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
- [Jira-Taskwarrior Setup](../../backends/jira-taskwarrior/README.md)
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
