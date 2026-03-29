---
description: "[DEPRECATED] Create a spec from a Jira issue - use /spec instead"
agent: spec-mode
---

# ⚠️ DEPRECATED: /specjira

**This command is deprecated. Please use `/spec <issue_id>` instead.**

The `/spec` command now works with any configured workflow backend (Jira, Beads, custom, etc.), not just Jira + Taskwarrior.

## Migration Guide

### Before (deprecated):
```
/specjira IN-1373
```

### After (recommended):
```
/spec IN-1373
```

Both commands work the same way, but `/spec` is backend-agnostic and future-proof.

---

## Forwarding to /spec

This command automatically forwards to `/spec` with the same arguments.

**User instruction**: Proceeding with `/spec $ARGUMENTS`

**Action**: Execute the `/spec` command with the provided arguments.

---

## Why was this deprecated?

1. **Backend flexibility**: The original `/specjira` was hardcoded to Jira + Taskwarrior. The new `/spec` works with any backend.

2. **Cleaner commands**: Generic commands (`/spec`, `/createtasks`, `/implement`) are easier to remember than backend-specific variants.

3. **Future-proofing**: As new backends are added (Beads, Linear, GitHub Issues), you won't need new commands - `/spec` works with all of them.

## When will this be removed?

This deprecated alias will be maintained for **backward compatibility** but may be removed in a future major version. Please migrate to `/spec` at your earliest convenience.

## Configuration

Make sure your `.agent/config.json` has a workflow backend configured:

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

See `backends/README.md` for configuration details.
