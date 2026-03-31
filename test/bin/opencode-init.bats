#!/usr/bin/env bats
# Tests for bin/opencode-init
#
# AIDEV-NOTE: These tests use a temporary directory to avoid polluting
# the real filesystem. Each test creates a fresh temp dir and cleans up.
# We use the 'mock' backend for testing as it requires no external tools.

# Get the directory where this test file lives
BATS_TEST_DIRNAME="$(cd "$(dirname "$BATS_TEST_FILENAME")" && pwd)"
OPENCODE_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"

# Use 'mock' backend for tests - it requires no external tools
TEST_BACKEND="mock"

setup() {
  # Create a temporary directory for each test
  TEST_DIR="$(mktemp -d)"
  export TEST_DIR
}

teardown() {
  # Clean up the temporary directory
  rm -rf "$TEST_DIR"
}

# =============================================================================
# Basic functionality tests
# =============================================================================

@test "opencode-init --help shows usage" {
  run "$OPENCODE_ROOT/bin/opencode-init" --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"Usage:"* ]]
  [[ "$output" == *"--backend"* ]]
}

@test "opencode-init defaults to beads backend when no --backend flag" {
  run "$OPENCODE_ROOT/bin/opencode-init" "$TEST_DIR"
  [ "$status" -eq 0 ]
  # Should default to beads backend
  run grep '"type"' "$TEST_DIR/.agent/config.json"
  [[ "$output" == *"beads"* ]]
}

@test "opencode-init fails with invalid backend" {
  run "$OPENCODE_ROOT/bin/opencode-init" --backend=nonexistent "$TEST_DIR"
  [ "$status" -ne 0 ]
  [[ "$output" == *"not found"* ]] || [[ "$output" == *"nonexistent"* ]]
}

# =============================================================================
# Mock backend tests (doesn't require external tools)
# =============================================================================

@test "opencode-init creates .agent directory with mock backend" {
  run "$OPENCODE_ROOT/bin/opencode-init" --backend="$TEST_BACKEND" "$TEST_DIR"
  [ "$status" -eq 0 ]
  [ -d "$TEST_DIR/.agent" ]
}

@test "opencode-init creates .opencode symlink pointing to .agent" {
  run "$OPENCODE_ROOT/bin/opencode-init" --backend="$TEST_BACKEND" "$TEST_DIR"
  [ "$status" -eq 0 ]
  [ -L "$TEST_DIR/.opencode" ]
  [ "$(readlink "$TEST_DIR/.opencode")" = ".agent" ]
}

@test "opencode-init creates .agent/config.json with backend type" {
  run "$OPENCODE_ROOT/bin/opencode-init" --backend="$TEST_BACKEND" "$TEST_DIR"
  [ "$status" -eq 0 ]
  [ -f "$TEST_DIR/.agent/config.json" ]
  run grep '"type"' "$TEST_DIR/.agent/config.json"
  [ "$status" -eq 0 ]
  [[ "$output" == *"$TEST_BACKEND"* ]]
}

@test "opencode-init creates opencode.json" {
  run "$OPENCODE_ROOT/bin/opencode-init" --backend="$TEST_BACKEND" "$TEST_DIR"
  [ "$status" -eq 0 ]
  [ -f "$TEST_DIR/opencode.json" ]
}

@test "opencode-init creates AGENTS.md" {
  run "$OPENCODE_ROOT/bin/opencode-init" --backend="$TEST_BACKEND" "$TEST_DIR"
  [ "$status" -eq 0 ]
  [ -f "$TEST_DIR/AGENTS.md" ]
}

@test "opencode-init creates specs/ directory" {
  run "$OPENCODE_ROOT/bin/opencode-init" --backend="$TEST_BACKEND" "$TEST_DIR"
  [ "$status" -eq 0 ]
  [ -d "$TEST_DIR/specs" ]
}

@test "opencode-init creates plans/ directory" {
  run "$OPENCODE_ROOT/bin/opencode-init" --backend="$TEST_BACKEND" "$TEST_DIR"
  [ "$status" -eq 0 ]
  [ -d "$TEST_DIR/plans" ]
}

# =============================================================================
# Commands tests
# =============================================================================

@test "opencode-init copies all commands to .agent/commands/" {
  run "$OPENCODE_ROOT/bin/opencode-init" --backend="$TEST_BACKEND" "$TEST_DIR"
  [ "$status" -eq 0 ]
  [ -d "$TEST_DIR/.agent/commands" ]
  
  # Check that key commands exist
  [ -f "$TEST_DIR/.agent/commands/spec.md" ]
  [ -f "$TEST_DIR/.agent/commands/implement.md" ]
  [ -f "$TEST_DIR/.agent/commands/feature.md" ]
  [ -f "$TEST_DIR/.agent/commands/plan.md" ]
}

@test "opencode-init copies correct number of commands" {
  run "$OPENCODE_ROOT/bin/opencode-init" --backend="$TEST_BACKEND" "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Count commands in source
  source_count=$(ls -1 "$OPENCODE_ROOT/command/"*.md 2>/dev/null | wc -l | tr -d ' ')
  # Count commands in target
  target_count=$(ls -1 "$TEST_DIR/.agent/commands/"*.md 2>/dev/null | wc -l | tr -d ' ')
  
  [ "$source_count" -eq "$target_count" ]
}

# =============================================================================
# Agents tests
# =============================================================================

@test "opencode-init copies core agents to .agent/agents/" {
  run "$OPENCODE_ROOT/bin/opencode-init" --backend="$TEST_BACKEND" "$TEST_DIR"
  [ "$status" -eq 0 ]
  [ -d "$TEST_DIR/.agent/agents" ]
  
  # Check core agents exist
  [ -f "$TEST_DIR/.agent/agents/spec-mode.md" ]
  [ -f "$TEST_DIR/.agent/agents/build.md" ]
  [ -f "$TEST_DIR/.agent/agents/create-tasks.md" ]
  [ -f "$TEST_DIR/.agent/agents/plan-mode.md" ]
  [ -f "$TEST_DIR/.agent/agents/workflow-first.md" ]
}

@test "opencode-init copies 10 core agents" {
  run "$OPENCODE_ROOT/bin/opencode-init" --backend="$TEST_BACKEND" "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Count agents in target (should be exactly 10 core agents)
  agent_count=$(ls -1 "$TEST_DIR/.agent/agents/"*.md 2>/dev/null | wc -l | tr -d ' ')
  [ "$agent_count" -eq 10 ]
}

# =============================================================================
# Skills tests
# =============================================================================

@test "opencode-init copies all skills to .agent/skills/" {
  run "$OPENCODE_ROOT/bin/opencode-init" --backend="$TEST_BACKEND" "$TEST_DIR"
  [ "$status" -eq 0 ]
  [ -d "$TEST_DIR/.agent/skills" ]
  
  # Check some key skills exist
  [ -d "$TEST_DIR/.agent/skills/workflow-backend" ]
  [ -f "$TEST_DIR/.agent/skills/workflow-backend/SKILL.md" ]
}

@test "opencode-init copies all skills from source" {
  run "$OPENCODE_ROOT/bin/opencode-init" --backend="$TEST_BACKEND" "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Count skills in source
  source_count=$(ls -1d "$OPENCODE_ROOT/skills/"*/ 2>/dev/null | wc -l | tr -d ' ')
  # Count skills in target
  target_count=$(ls -1d "$TEST_DIR/.agent/skills/"*/ 2>/dev/null | wc -l | tr -d ' ')
  
  [ "$source_count" -eq "$target_count" ]
}

# =============================================================================
# Backend tests
# =============================================================================

@test "opencode-init copies backend files to .agent/backends/" {
  run "$OPENCODE_ROOT/bin/opencode-init" --backend="$TEST_BACKEND" "$TEST_DIR"
  [ "$status" -eq 0 ]
  [ -d "$TEST_DIR/.agent/backends/$TEST_BACKEND" ]
  [ -f "$TEST_DIR/.agent/backends/$TEST_BACKEND/index.js" ]
  [ -f "$TEST_DIR/.agent/backends/interface.ts" ]
}

# =============================================================================
# Lib tests
# =============================================================================

@test "opencode-init copies lib files to .agent/lib/" {
  run "$OPENCODE_ROOT/bin/opencode-init" --backend="$TEST_BACKEND" "$TEST_DIR"
  [ "$status" -eq 0 ]
  [ -d "$TEST_DIR/.agent/lib" ]
  [ -f "$TEST_DIR/.agent/lib/backend-loader.js" ]
}

# =============================================================================
# Idempotency tests
# =============================================================================

@test "opencode-init prompts before overwriting (aborts when not confirmed)" {
  # First run
  run "$OPENCODE_ROOT/bin/opencode-init" --backend="$TEST_BACKEND" "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Second run - pipe 'n' to simulate declining overwrite
  run bash -c "echo 'n' | '$OPENCODE_ROOT/bin/opencode-init' --backend='$TEST_BACKEND' '$TEST_DIR'"
  [ "$status" -eq 0 ]  # Exits 0, but aborts
  [[ "$output" == *"already exists"* ]]
  [[ "$output" == *"Aborted"* ]]
}

@test "opencode-sync should be used for updates after init" {
  # First run opencode-init
  run "$OPENCODE_ROOT/bin/opencode-init" --backend="$TEST_BACKEND" "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Then opencode-sync should work
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]
}
