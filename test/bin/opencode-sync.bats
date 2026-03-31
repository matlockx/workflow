#!/usr/bin/env bats
# Tests for bin/opencode-sync
#
# AIDEV-NOTE: These tests verify that opencode-sync correctly syncs ALL agents,
# commands, and skills from the source repo into an initialized project.
# Each test creates a fresh temp dir with opencode-init, then runs opencode-sync.

# Get the directory where this test file lives
BATS_TEST_DIRNAME="$(cd "$(dirname "$BATS_TEST_FILENAME")" && pwd)"
OPENCODE_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"

# Use 'mock' backend for tests - it requires no external tools
TEST_BACKEND="mock"

setup() {
  # Create a temporary directory for each test
  TEST_DIR="$(mktemp -d)"
  export TEST_DIR
  
  # Initialize the project first (sync requires existing config)
  "$OPENCODE_ROOT/bin/opencode-init" --backend="$TEST_BACKEND" "$TEST_DIR" > /dev/null 2>&1
}

teardown() {
  # Clean up the temporary directory
  rm -rf "$TEST_DIR"
}

# =============================================================================
# Basic functionality tests
# =============================================================================

@test "opencode-sync --help shows usage" {
  run "$OPENCODE_ROOT/bin/opencode-sync" --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"Usage:"* ]]
}

@test "opencode-sync fails without .agent/config.json" {
  rm "$TEST_DIR/.agent/config.json"
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -ne 0 ]
  [[ "$output" == *"config.json"* ]]
}

@test "opencode-sync succeeds on initialized project" {
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]
}

# =============================================================================
# Agent sync tests (the main fix we implemented)
# =============================================================================

@test "opencode-sync syncs ALL agents from source" {
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Count agents in source
  source_count=$(ls -1 "$OPENCODE_ROOT/agent/"*.md 2>/dev/null | wc -l | tr -d ' ')
  # Count agents in target
  target_count=$(ls -1 "$TEST_DIR/.agent/agents/"*.md 2>/dev/null | wc -l | tr -d ' ')
  
  # After sync, target should have ALL agents from source
  [ "$source_count" -eq "$target_count" ]
}

@test "opencode-sync installs workflow-first.md" {
  # Remove workflow-first.md to simulate an old installation
  rm -f "$TEST_DIR/.agent/agents/workflow-first.md"
  
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # workflow-first.md should be installed
  [ -f "$TEST_DIR/.agent/agents/workflow-first.md" ]
}

@test "opencode-sync installs agents that were added after init" {
  # opencode-init only copies 7 core agents
  # opencode-sync should add all remaining agents
  
  # Count agents before sync (should be 7 from init)
  before_count=$(ls -1 "$TEST_DIR/.agent/agents/"*.md 2>/dev/null | wc -l | tr -d ' ')
  [ "$before_count" -eq 7 ]
  
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Count agents after sync (should be all 23)
  after_count=$(ls -1 "$TEST_DIR/.agent/agents/"*.md 2>/dev/null | wc -l | tr -d ' ')
  source_count=$(ls -1 "$OPENCODE_ROOT/agent/"*.md 2>/dev/null | wc -l | tr -d ' ')
  
  [ "$after_count" -eq "$source_count" ]
}

@test "opencode-sync removes stale agents" {
  # Create a fake stale agent
  echo "# Stale agent" > "$TEST_DIR/.agent/agents/stale-agent.md"
  
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Stale agent should be removed
  [ ! -f "$TEST_DIR/.agent/agents/stale-agent.md" ]
}

# =============================================================================
# Command sync tests
# =============================================================================

@test "opencode-sync syncs all commands" {
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Count commands in source and target
  source_count=$(ls -1 "$OPENCODE_ROOT/command/"*.md 2>/dev/null | wc -l | tr -d ' ')
  target_count=$(ls -1 "$TEST_DIR/.agent/commands/"*.md 2>/dev/null | wc -l | tr -d ' ')
  
  [ "$source_count" -eq "$target_count" ]
}

@test "opencode-sync removes stale commands" {
  # Create a fake stale command
  echo "# Stale command" > "$TEST_DIR/.agent/commands/stale-command.md"
  
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Stale command should be removed
  [ ! -f "$TEST_DIR/.agent/commands/stale-command.md" ]
}

# =============================================================================
# Skills sync tests
# =============================================================================

@test "opencode-sync syncs all skills" {
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Count skills in source and target
  source_count=$(ls -1d "$OPENCODE_ROOT/skills/"*/ 2>/dev/null | wc -l | tr -d ' ')
  target_count=$(ls -1d "$TEST_DIR/.agent/skills/"*/ 2>/dev/null | wc -l | tr -d ' ')
  
  [ "$source_count" -eq "$target_count" ]
}

# =============================================================================
# Preservation tests
# =============================================================================

@test "opencode-sync preserves .agent/config.json" {
  # Add custom content to config (must use valid backend type)
  echo '{"backend":{"type":"mock"},"custom":"value"}' > "$TEST_DIR/.agent/config.json"
  
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Custom content should be preserved
  run grep "custom" "$TEST_DIR/.agent/config.json"
  [ "$status" -eq 0 ]
}

@test "opencode-sync preserves .agent/state/ directory" {
  # Create state directory with content
  mkdir -p "$TEST_DIR/.agent/state"
  echo "test state" > "$TEST_DIR/.agent/state/test.txt"
  
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # State should be preserved
  [ -f "$TEST_DIR/.agent/state/test.txt" ]
}

@test "opencode-sync preserves AGENTS.md" {
  # Modify AGENTS.md
  echo "# Custom project context" > "$TEST_DIR/AGENTS.md"
  
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Custom content should be preserved
  run grep "Custom project context" "$TEST_DIR/AGENTS.md"
  [ "$status" -eq 0 ]
}

@test "opencode-sync preserves opencode.json" {
  # Modify opencode.json
  echo '{"custom":"config"}' > "$TEST_DIR/opencode.json"
  
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Custom content should be preserved
  run grep "custom" "$TEST_DIR/opencode.json"
  [ "$status" -eq 0 ]
}

@test "opencode-sync preserves specs/ directory" {
  # Create spec file
  echo "# Test spec" > "$TEST_DIR/specs/test-spec.md"
  
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Spec should be preserved
  [ -f "$TEST_DIR/specs/test-spec.md" ]
}

# =============================================================================
# Dry-run tests
# =============================================================================

@test "opencode-sync --dry-run makes no changes" {
  # Remove an agent to verify it doesn't get installed
  rm -f "$TEST_DIR/.agent/agents/workflow-first.md"
  
  run "$OPENCODE_ROOT/bin/opencode-sync" --dry-run "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Agent should NOT be installed (dry run)
  [ ! -f "$TEST_DIR/.agent/agents/workflow-first.md" ]
}

# =============================================================================
# Backend detection tests
# =============================================================================

@test "opencode-sync detects backend from config.json" {
  run "$OPENCODE_ROOT/bin/opencode-sync" --verbose "$TEST_DIR"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Backend: $TEST_BACKEND"* ]]
}

# =============================================================================
# Idempotency tests
# =============================================================================

@test "opencode-sync can run multiple times" {
  # First sync
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Second sync
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Third sync
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]
}

@test "opencode-sync produces consistent results" {
  # First sync
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]
  first_count=$(ls -1 "$TEST_DIR/.agent/agents/"*.md 2>/dev/null | wc -l | tr -d ' ')
  
  # Second sync
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]
  second_count=$(ls -1 "$TEST_DIR/.agent/agents/"*.md 2>/dev/null | wc -l | tr -d ' ')
  
  # Should have same number of agents
  [ "$first_count" -eq "$second_count" ]
}
