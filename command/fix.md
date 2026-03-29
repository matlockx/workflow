---
description: Alias for /feature --type=fix — drive a bug fix through the full lifecycle
agent: spec-mode
mode: plan
---

# /fix — Bug fix lifecycle alias

This command is a thin alias for `/feature` with `--type=fix` pre-set.
All orchestration logic lives in `command/feature.md`.

## Input

- `$ARGUMENTS`: issue ID, optionally with `--backend=<type>`
  - Examples: `ISSUE-5`, `IN-9821 --backend=jira-taskwarrior`

## Steps

1. **Parse arguments**

   ```js
   const { parseBackendOverride } = require('./lib/backend-loader.js')
   const { backendType, cleanedArguments } = parseBackendOverride($ARGUMENTS)
   ```

2. **Validate input**
   - If no issue ID is found in `cleanedArguments`, print usage and stop:
     ```
     Usage: /fix <issueId> [--backend=<type>]
     ```

3. **Delegate to /feature with type=fix**

   Invoke the full `/feature` workflow exactly as if the user had run:
   ```
   /feature <issueId> --type=fix [--backend=<type>]
   ```

   Follow every step in `command/feature.md` from Bootstrap onward,
   with `workType` pre-set to `'fix'`.

## Notes

- The `type` field is stored on the work item in `workflow.json` and shown in
  `/status` output so the user can distinguish fixes from features at a glance.
- Bug fix specs should emphasise **root cause analysis** and **regression test**
  sections rather than a full design document. When drafting the spec, keep the
  requirements section focused on reproducing the bug and the design section on
  the minimal fix.
