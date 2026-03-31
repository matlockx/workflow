#!/usr/bin/env bats
# Tests for workflow activation after opencode-init/sync
#
# AIDEV-NOTE: These tests verify that the minimum viable file set exists
# for an AI agent to pick up the five-gate workflow system. This is a
# fast file-level verification — not a full E2E agent test.
#
# Why this matters:
# - If opencode.json doesn't include workflow-first.md, the agent may skip gates
# - If the .opencode symlink is broken, commands/agents/skills won't be found
# - If config.json is malformed, backend operations fail
# - If AGENTS.md has wrong directory names, AI gets confused about structure

BATS_TEST_DIRNAME="$(cd "$(dirname "$BATS_TEST_FILENAME")" && pwd)"
OPENCODE_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"

# Use 'mock' backend for tests - requires no external tools
TEST_BACKEND="mock"

setup() {
  TEST_DIR="$(mktemp -d)"
  export TEST_DIR
  # Initialize fresh project
  "$OPENCODE_ROOT/bin/opencode-init" --backend="$TEST_BACKEND" "$TEST_DIR" > /dev/null 2>&1
}

teardown() {
  rm -rf "$TEST_DIR"
}

# =============================================================================
# Minimum Viable Workflow File Set
# =============================================================================

@test "workflow activation: opencode.json exists" {
  [ -f "$TEST_DIR/opencode.json" ]
}

@test "workflow activation: opencode.json includes AGENTS.md" {
  run grep -q '"AGENTS.md"' "$TEST_DIR/opencode.json"
  [ "$status" -eq 0 ]
}

@test "workflow activation: opencode.json includes workflow-first.md" {
  # CRITICAL: This is the root cause fix for "agent not following workflow"
  run grep -q 'workflow-first.md' "$TEST_DIR/opencode.json"
  [ "$status" -eq 0 ]
}

@test "workflow activation: AGENTS.md exists" {
  [ -f "$TEST_DIR/AGENTS.md" ]
}

@test "workflow activation: AGENTS.md contains golden rules" {
  run grep -q "golden rule" "$TEST_DIR/AGENTS.md"
  [ "$status" -eq 0 ]
}

# =============================================================================
# Symlink Resolution
# =============================================================================

@test "workflow activation: .opencode symlink exists" {
  [ -L "$TEST_DIR/.opencode" ]
}

@test "workflow activation: .opencode symlink points to .agent" {
  [ "$(readlink "$TEST_DIR/.opencode")" = ".agent" ]
}

@test "workflow activation: .opencode/commands/ reachable through symlink" {
  [ -d "$TEST_DIR/.opencode/commands" ]
}

@test "workflow activation: .opencode/agents/ reachable through symlink" {
  [ -d "$TEST_DIR/.opencode/agents" ]
}

@test "workflow activation: .opencode/skills/ reachable through symlink" {
  [ -d "$TEST_DIR/.opencode/skills" ]
}

# =============================================================================
# Config Validation
# =============================================================================

@test "workflow activation: config.json exists" {
  [ -f "$TEST_DIR/.agent/config.json" ]
}

@test "workflow activation: config.json is valid JSON" {
  # Use node to parse JSON - if it fails, JSON is invalid
  run node -e "JSON.parse(require('fs').readFileSync('$TEST_DIR/.agent/config.json', 'utf8'))"
  [ "$status" -eq 0 ]
}

@test "workflow activation: config.json has backend.type" {
  run node -e "
    const cfg = JSON.parse(require('fs').readFileSync('$TEST_DIR/.agent/config.json', 'utf8'));
    if (!cfg.backend || !cfg.backend.type) process.exit(1);
    console.log(cfg.backend.type);
  "
  [ "$status" -eq 0 ]
  [ "$output" = "$TEST_BACKEND" ]
}

# =============================================================================
# Core Workflow Files
# =============================================================================

@test "workflow activation: workflow-first.md agent exists" {
  [ -f "$TEST_DIR/.agent/agents/workflow-first.md" ]
}

@test "workflow activation: workflow-first.md contains five gates" {
  # The file should mention all five gates
  run grep -c "Gate [1-5]" "$TEST_DIR/.agent/agents/workflow-first.md"
  [ "$status" -eq 0 ]
  [ "$output" -ge 5 ]
}

@test "workflow activation: spec-reviewer.md exists (needed by Gate 4)" {
  [ -f "$TEST_DIR/.agent/agents/spec-reviewer.md" ]
}

@test "workflow activation: code-reviewer.md exists (needed by Gate 4)" {
  [ -f "$TEST_DIR/.agent/agents/code-reviewer.md" ]
}

@test "workflow activation: feature command exists" {
  [ -f "$TEST_DIR/.agent/commands/feature.md" ]
}

@test "workflow activation: implement command exists" {
  [ -f "$TEST_DIR/.agent/commands/implement.md" ]
}

@test "workflow activation: spec command exists" {
  [ -f "$TEST_DIR/.agent/commands/spec.md" ]
}

# =============================================================================
# Backend Loader
# =============================================================================

@test "workflow activation: backend-loader.js exists" {
  [ -f "$TEST_DIR/.agent/lib/backend-loader.js" ]
}

@test "workflow activation: mock backend index.js exists" {
  [ -f "$TEST_DIR/.agent/backends/$TEST_BACKEND/index.js" ]
}

@test "workflow activation: backend interface.ts exists" {
  [ -f "$TEST_DIR/.agent/backends/interface.ts" ]
}

# =============================================================================
# Skills
# =============================================================================

@test "workflow activation: workflow-backend skill exists" {
  [ -f "$TEST_DIR/.agent/skills/workflow-backend/SKILL.md" ]
}

@test "workflow activation: coding-standards skill exists" {
  [ -f "$TEST_DIR/.agent/skills/coding-standards/SKILL.md" ]
}

# =============================================================================
# AGENTS.md Content Validation
# =============================================================================

@test "workflow activation: AGENTS.md shows correct commands/ directory" {
  # Should say 'commands/' not 'command/'
  run grep -E "├── commands/" "$TEST_DIR/AGENTS.md"
  [ "$status" -eq 0 ]
}

@test "workflow activation: AGENTS.md shows correct agents/ directory" {
  # Should say 'agents/' not 'agent/'
  run grep -E "├── agents/" "$TEST_DIR/AGENTS.md"
  [ "$status" -eq 0 ]
}

# =============================================================================
# Post-Sync Validation
# =============================================================================

@test "workflow activation: sync preserves workflow activation" {
  # Run sync
  "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR" > /dev/null 2>&1
  
  # Re-verify critical files still exist
  [ -f "$TEST_DIR/opencode.json" ]
  [ -f "$TEST_DIR/AGENTS.md" ]
  [ -L "$TEST_DIR/.opencode" ]
  [ -f "$TEST_DIR/.agent/agents/workflow-first.md" ]
  [ -f "$TEST_DIR/.agent/config.json" ]
  
  # workflow-first.md still in instructions
  run grep -q 'workflow-first.md' "$TEST_DIR/opencode.json"
  [ "$status" -eq 0 ]
}

@test "workflow activation: sync adds missing workflow-first.md" {
  # Remove workflow-first.md
  rm "$TEST_DIR/.agent/agents/workflow-first.md"
  
  # Run sync
  "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR" > /dev/null 2>&1
  
  # Should be restored
  [ -f "$TEST_DIR/.agent/agents/workflow-first.md" ]
}

@test "workflow activation: symlink broken detection" {
  # Break the symlink
  rm "$TEST_DIR/.opencode"
  ln -s nonexistent "$TEST_DIR/.opencode"
  
  # Sync should still work (it repairs the symlink)
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Symlink should be fixed
  [ "$(readlink "$TEST_DIR/.opencode")" = ".agent" ]
}
