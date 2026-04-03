---
description: Alias for /feature --type=fix — drive a bug fix through the full lifecycle
agent: build
---

# /fix — Bug fix lifecycle alias

This command is a thin alias for `/feature` with `--type=fix` pre-set.
All orchestration logic lives in `command/feature.md`.

## Input

- `$ARGUMENTS`: issue ID, optionally with `--backend=<type>` or `--yolo`
  - Examples: `ISSUE-5`, `IN-9821 --backend=jira-taskwarrior`, `ISSUE-5 --yolo`

## Steps

1. **Parse arguments**

   ```js
   const { parseBackendOverride } = require('./lib/backend-loader.js')
   const { backendType, cleanedArguments } = parseBackendOverride($ARGUMENTS)
   ```

2. **Validate input**
   - If no issue ID is found in `cleanedArguments`, print usage and stop:
     ```
     Usage: /fix <issueId> [--backend=<type>] [--yolo]
     ```

3. **Delegate to /feature with type=fix**

   Invoke the full `/feature` workflow exactly as if the user had run:
   ```
   /feature <issueId> --type=fix [--backend=<type>] [--yolo]
   ```

   Follow every step in `command/feature.md` from Bootstrap onward,
   with `workType` pre-set to `'fix'`. Pass through the `--yolo` flag
   if present.

## Notes

- The `type` field is stored on the work item in `feature-progress.json` and shown in
  `/status` output so the user can distinguish fixes from features at a glance.
- Bug fix tasks should emphasise **root cause analysis** and **regression test**
  sections. Keep the implementation focused on the minimal fix with a corresponding
  regression test that would have caught the bug.
