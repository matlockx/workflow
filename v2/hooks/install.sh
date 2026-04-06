#!/usr/bin/env bash
# Install git hooks for the v2 workflow framework.
#
# Usage:
#   ./hooks/install.sh          # Install from project root
#   ./hooks/install.sh --force  # Overwrite existing hooks
#
# AIDEV-NOTE: This script symlinks hooks into .git/hooks/ so they stay
# in sync with the repo. It does not modify global git config.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GIT_DIR="$(git rev-parse --git-dir 2>/dev/null)" || {
    echo "Error: not a git repository"
    exit 1
}

HOOKS_DIR="$GIT_DIR/hooks"
FORCE="${1:-}"

install_hook() {
    local hook_name="$1"
    local source="$SCRIPT_DIR/$hook_name"
    local target="$HOOKS_DIR/$hook_name"

    if [ ! -f "$source" ]; then
        echo "  Skip: $hook_name (not found in hooks/)"
        return
    fi

    if [ -e "$target" ] && [ "$FORCE" != "--force" ]; then
        echo "  Skip: $hook_name (already exists — use --force to overwrite)"
        return
    fi

    # Make source executable
    chmod +x "$source"

    # Symlink into .git/hooks/
    ln -sf "$source" "$target"
    echo "  ✓ Installed: $hook_name"
}

echo "Installing git hooks..."
echo ""

install_hook "pre-commit"
install_hook "commit-msg"

echo ""
echo "Done. Hooks are symlinked from hooks/ → .git/hooks/"
echo "To uninstall: rm .git/hooks/pre-commit .git/hooks/commit-msg"
