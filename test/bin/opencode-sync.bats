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

  # Count agents after sync (should be all from source)
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

@test "opencode-sync removes stale skills" {
  # Create a fake stale skill
  mkdir -p "$TEST_DIR/.agent/skills/stale-skill"
  echo "# Stale skill" > "$TEST_DIR/.agent/skills/stale-skill/SKILL.md"
  
  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Stale skill directory should be removed
  [ ! -d "$TEST_DIR/.agent/skills/stale-skill" ]
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

@test "opencode-sync does not touch user specs/ directory" {
  # Create a spec file manually (user-managed, not created by init)
  mkdir -p "$TEST_DIR/specs"
  echo "# Test spec" > "$TEST_DIR/specs/test-spec.md"

  run "$OPENCODE_ROOT/bin/opencode-sync" "$TEST_DIR"
  [ "$status" -eq 0 ]

  # User-created spec files should be untouched (sync never manages specs/)
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

# =============================================================================
# Force mode tests
# =============================================================================

@test "opencode-sync --force succeeds" {
  run "$OPENCODE_ROOT/bin/opencode-sync" --force "$TEST_DIR"
  [ "$status" -eq 0 ]
}

@test "opencode-sync --force creates .agent-backup/" {
  run "$OPENCODE_ROOT/bin/opencode-sync" --force "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Backup directory should exist
  [ -d "$TEST_DIR/.agent-backup" ]
}

@test "opencode-sync --force backup contains original config.json" {
  # Store original config content
  original_config=$(cat "$TEST_DIR/.agent/config.json")
  
  run "$OPENCODE_ROOT/bin/opencode-sync" --force "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Backup should contain original config
  [ -f "$TEST_DIR/.agent-backup/config.json" ]
  backup_config=$(cat "$TEST_DIR/.agent-backup/config.json")
  [ "$original_config" = "$backup_config" ]
}

@test "opencode-sync --force preserves config.json in .agent/" {
  # Add custom content to config (must use valid backend type)
  echo '{"backend":{"type":"mock"},"custom":"force-test"}' > "$TEST_DIR/.agent/config.json"
  
  run "$OPENCODE_ROOT/bin/opencode-sync" --force "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # config.json should still have custom content (restored from backup)
  run grep "force-test" "$TEST_DIR/.agent/config.json"
  [ "$status" -eq 0 ]
}

@test "opencode-sync --force preserves .agent/state/" {
  # Create state directory with content
  mkdir -p "$TEST_DIR/.agent/state"
  echo "force state test" > "$TEST_DIR/.agent/state/test.txt"
  
  run "$OPENCODE_ROOT/bin/opencode-sync" --force "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # State should be preserved (restored from backup)
  [ -f "$TEST_DIR/.agent/state/test.txt" ]
  run grep "force state test" "$TEST_DIR/.agent/state/test.txt"
  [ "$status" -eq 0 ]
}

@test "opencode-sync --force regenerates AGENTS.md" {
  # Modify AGENTS.md with custom content
  echo "# My custom AGENTS.md" > "$TEST_DIR/AGENTS.md"
  
  run "$OPENCODE_ROOT/bin/opencode-sync" --force "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # AGENTS.md should be regenerated (custom content overwritten)
  run grep "My custom AGENTS.md" "$TEST_DIR/AGENTS.md"
  [ "$status" -ne 0 ]
  
  # Should contain template content
  run grep "Golden Rule" "$TEST_DIR/AGENTS.md"
  [ "$status" -eq 0 ]
}

@test "opencode-sync --force regenerates opencode.json" {
  # Modify opencode.json with custom content
  echo '{"custom":"should-be-gone"}' > "$TEST_DIR/opencode.json"
  
  run "$OPENCODE_ROOT/bin/opencode-sync" --force "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Custom content should be overwritten
  run grep "should-be-gone" "$TEST_DIR/opencode.json"
  [ "$status" -ne 0 ]
  
  # Should contain canonical content
  run grep "opencode.ai/config.json" "$TEST_DIR/opencode.json"
  [ "$status" -eq 0 ]
}

@test "opencode-sync --force nukes old agents and rebuilds" {
  # Create a custom agent that should NOT survive force
  echo "# Custom agent" > "$TEST_DIR/.agent/agents/my-custom-agent.md"
  
  run "$OPENCODE_ROOT/bin/opencode-sync" --force "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Custom agent should be gone (nuked with .agent/, not restored)
  [ ! -f "$TEST_DIR/.agent/agents/my-custom-agent.md" ]
  
  # But all source agents should be present
  source_count=$(ls -1 "$OPENCODE_ROOT/agent/"*.md 2>/dev/null | wc -l | tr -d ' ')
  target_count=$(ls -1 "$TEST_DIR/.agent/agents/"*.md 2>/dev/null | wc -l | tr -d ' ')
  [ "$source_count" -eq "$target_count" ]
}

@test "opencode-sync --force replaces previous backup" {
  # First force run
  run "$OPENCODE_ROOT/bin/opencode-sync" --force "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Add a marker to the current .agent
  echo "marker" > "$TEST_DIR/.agent/force-marker.txt"
  
  # Second force run
  run "$OPENCODE_ROOT/bin/opencode-sync" --force "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # Backup should contain the marker from the second run's backup
  [ -f "$TEST_DIR/.agent-backup/force-marker.txt" ]
}

@test "opencode-sync --force --dry-run makes no changes" {
  # Modify AGENTS.md
  echo "# Custom content" > "$TEST_DIR/AGENTS.md"
  original_agents=$(cat "$TEST_DIR/AGENTS.md")
  
  run "$OPENCODE_ROOT/bin/opencode-sync" --force --dry-run "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # AGENTS.md should NOT be overwritten
  current_agents=$(cat "$TEST_DIR/AGENTS.md")
  [ "$original_agents" = "$current_agents" ]
  
  # No backup should exist
  [ ! -d "$TEST_DIR/.agent-backup" ]
}

@test "opencode-sync --force uses language from config.json" {
  # Set language in config.json
  echo '{"language":"go","backend":{"type":"mock"}}' > "$TEST_DIR/.agent/config.json"
  
  run "$OPENCODE_ROOT/bin/opencode-sync" --force "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # AGENTS.md should contain Go-specific commands
  run grep "go build" "$TEST_DIR/AGENTS.md"
  [ "$status" -eq 0 ]
  run grep "go test" "$TEST_DIR/AGENTS.md"
  [ "$status" -eq 0 ]
}

@test "opencode-sync --force with no language uses defaults" {
  # Config without language field
  echo '{"backend":{"type":"mock"}}' > "$TEST_DIR/.agent/config.json"
  
  run "$OPENCODE_ROOT/bin/opencode-sync" --force "$TEST_DIR"
  [ "$status" -eq 0 ]
  
  # AGENTS.md should contain default placeholder commands
  run grep "fill in your build command" "$TEST_DIR/AGENTS.md"
  [ "$status" -eq 0 ]
}

@test "opencode-sync --force shows in help" {
  run "$OPENCODE_ROOT/bin/opencode-sync" --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"--force"* ]]
}
