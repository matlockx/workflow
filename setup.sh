#!/usr/bin/env bash
# AIDEV-NOTE: Setup script for installing the v2 workflow framework into any repo.
# Copies the portable framework, prompts for project-specific customization,
# and installs git hooks. Idempotent — safe to re-run.
#
# Usage:
#   ./setup.sh /path/to/target/repo
#   ./setup.sh .                        # Current directory
#   ./setup.sh --help
set -euo pipefail

# --- Configuration ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
V2_DIR="$SCRIPT_DIR"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}→${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }
fail()  { echo -e "${RED}✗${NC} $1"; exit 1; }
header(){ echo -e "\n${BOLD}$1${NC}"; }

# --- Help ---
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" || -z "${1:-}" ]]; then
    echo "Usage: $0 <target-directory>"
    echo ""
    echo "Install the v2 OpenCode workflow framework into a repository."
    echo ""
    echo "What gets copied:"
    echo "  .opencode/          Agents, commands, skills, instructions, config"
    echo "  opencode.json       OpenCode configuration"
    echo "  AGENTS.md           Project-specific template (or reference added)"
    echo "  docs/adr/           ADR system (template + index)"
    echo "  hooks/              Git pre-commit + commit-msg hooks"
    echo ""
    echo "Options:"
    echo "  --help, -h          Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 /path/to/my-project"
    echo "  $0 ."
    exit 0
fi

TARGET="${1}"
TARGET="$(cd "$TARGET" 2>/dev/null && pwd)" || fail "Directory not found: $1"

# --- Validation ---
if [ ! -d "$TARGET" ]; then
    fail "Not a directory: $TARGET"
fi

if [ ! -d "$TARGET/.git" ]; then
    warn "$TARGET is not a git repository"
    read -rp "Continue anyway? [y/N] " confirm
    [[ "$confirm" =~ ^[Yy] ]] || exit 0
fi

header "Installing v2 workflow framework into: $TARGET"

# --- Helper: copy with backup ---
copy_safe() {
    local src="$1"
    local dst="$2"

    if [ -e "$dst" ]; then
        # File exists — check if identical
        if diff -q "$src" "$dst" &>/dev/null; then
            ok "$(basename "$dst") (already up to date)"
            return
        fi
        warn "$(basename "$dst") exists and differs — backing up to $(basename "$dst").bak"
        cp "$dst" "$dst.bak"
    fi

    cp "$src" "$dst"
    ok "$(basename "$dst")"
}

# --- Helper: copy directory recursively ---
copy_dir_safe() {
    local src_dir="$1"
    local dst_dir="$2"
    local label="$3"

    mkdir -p "$dst_dir"

    local count=0
    while IFS= read -r -d '' src_file; do
        local rel="${src_file#$src_dir/}"
        local dst_file="$dst_dir/$rel"
        mkdir -p "$(dirname "$dst_file")"

        if [ -e "$dst_file" ] && diff -q "$src_file" "$dst_file" &>/dev/null; then
            continue
        fi

        if [ -e "$dst_file" ]; then
            cp "$dst_file" "$dst_file.bak"
        fi

        cp "$src_file" "$dst_file"
        # Preserve executable bit for hooks
        if [ -x "$src_file" ]; then
            chmod +x "$dst_file"
        fi
        count=$((count + 1))
    done < <(find "$src_dir" -type f -not -name '.DS_Store' -print0)

    if [ "$count" -eq 0 ]; then
        ok "$label (already up to date)"
    else
        ok "$label ($count files)"
    fi
}

# --- Step 1: Copy .opencode/ ---
header "Step 1: Framework core (.opencode/)"

# Create structure
mkdir -p "$TARGET/.opencode/agents"
mkdir -p "$TARGET/.opencode/commands"
mkdir -p "$TARGET/.opencode/skills/golang"
mkdir -p "$TARGET/.opencode/skills/quality-gates"
mkdir -p "$TARGET/.opencode/skills/tdd"
mkdir -p "$TARGET/.opencode/skills/workflow"

# Copy INSTRUCTIONS.md
copy_safe "$V2_DIR/.opencode/INSTRUCTIONS.md" "$TARGET/.opencode/INSTRUCTIONS.md"

# Copy config
copy_safe "$V2_DIR/.opencode/config.json" "$TARGET/.opencode/config.json"

# Copy agents
copy_dir_safe "$V2_DIR/.opencode/agents" "$TARGET/.opencode/agents" "Agents"

# Copy commands
copy_dir_safe "$V2_DIR/.opencode/commands" "$TARGET/.opencode/commands" "Commands"

# Copy skills
copy_dir_safe "$V2_DIR/.opencode/skills" "$TARGET/.opencode/skills" "Skills"

# --- Step 2: opencode.json ---
header "Step 2: OpenCode config (opencode.json)"

if [ -e "$TARGET/opencode.json" ]; then
    # Check if it already has our instructions entries
    if grep -q '.opencode/INSTRUCTIONS.md' "$TARGET/opencode.json" 2>/dev/null; then
        ok "opencode.json (already configured)"
    else
        warn "opencode.json exists but doesn't reference INSTRUCTIONS.md"
        echo "  Add these to your 'instructions' array:"
        echo "    \".opencode/INSTRUCTIONS.md\""
        echo "    \"docs/adr/INDEX.md\""
    fi
else
    copy_safe "$V2_DIR/opencode.json" "$TARGET/opencode.json"
fi

# --- Step 3: AGENTS.md ---
header "Step 3: Project config (AGENTS.md)"

if [ -e "$TARGET/AGENTS.md" ]; then
    # Existing AGENTS.md — add reference if not already present
    if grep -q '@.opencode/INSTRUCTIONS.md' "$TARGET/AGENTS.md" 2>/dev/null; then
        ok "AGENTS.md (already references framework)"
    else
        warn "Existing AGENTS.md found — adding framework reference at the top"
        # Prepend the reference line
        TMPFILE=$(mktemp)
        {
            echo "<!-- Load the portable workflow framework -->"
            echo "@.opencode/INSTRUCTIONS.md"
            echo ""
            cat "$TARGET/AGENTS.md"
        } > "$TMPFILE"
        cp "$TARGET/AGENTS.md" "$TARGET/AGENTS.md.bak"
        mv "$TMPFILE" "$TARGET/AGENTS.md"
        ok "AGENTS.md (reference added, backup at AGENTS.md.bak)"
    fi
else
    copy_safe "$V2_DIR/AGENTS.md" "$TARGET/AGENTS.md"
    warn "AGENTS.md is a template — edit it with your project's build commands and conventions"
fi

# --- Step 4: ADR system ---
header "Step 4: ADR system (docs/adr/)"

mkdir -p "$TARGET/docs/adr"
copy_safe "$V2_DIR/docs/adr/TEMPLATE.md" "$TARGET/docs/adr/TEMPLATE.md"
copy_safe "$V2_DIR/docs/adr/INDEX.md" "$TARGET/docs/adr/INDEX.md"

# Don't copy ADR-001 — it's specific to the v2 framework itself
info "Skipping ADR-001 (v2-specific — create your own ADRs with the template)"

# --- Step 5: Git hooks ---
header "Step 5: Git hooks (hooks/)"

mkdir -p "$TARGET/hooks"
copy_dir_safe "$V2_DIR/hooks" "$TARGET/hooks" "Hooks"

# Make hooks executable
chmod +x "$TARGET/hooks/"* 2>/dev/null || true

# Install hooks if this is a git repo
if [ -d "$TARGET/.git" ]; then
    info "Installing git hooks..."
    (cd "$TARGET" && ./hooks/install.sh)
else
    warn "Not a git repo — run './hooks/install.sh' after 'git init'"
fi

# --- Step 6: Summary ---
header "Setup complete!"
echo ""
echo "Files installed:"
echo "  .opencode/INSTRUCTIONS.md     Portable workflow framework (don't edit)"
echo "  .opencode/config.json         Beads backend config"
echo "  .opencode/agents/             4 agents: planner, designer, developer, qa"
echo "  .opencode/commands/           4 commands: plan, implement, review, status"
echo "  .opencode/skills/             4 skills: golang, tdd, workflow, quality-gates"
echo "  opencode.json                 OpenCode configuration"
echo "  AGENTS.md                     Project-specific config (customize this!)"
echo "  docs/adr/                     ADR system (template + index)"
echo "  hooks/                        Git pre-commit + commit-msg hooks"
echo ""

# Remind about customization
if [ -e "$TARGET/AGENTS.md" ]; then
    header "Next steps:"
    echo ""
    echo "  1. Edit ${BOLD}AGENTS.md${NC} with your project's:"
    echo "     - Build & test commands"
    echo "     - Project conventions"
    echo "     - Directory structure"
    echo "     - Domain glossary"
    echo ""
    echo "  2. Verify hooks work: ${BOLD}cd $TARGET && git commit --allow-empty -m 'test'${NC}"
    echo "     (should fail — no task ID)"
    echo ""
    echo "  3. Start working: ${BOLD}/plan your first feature${NC}"
fi
