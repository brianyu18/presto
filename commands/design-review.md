---
name: design-review
description: Run emil's review table on the current git diff. Prints markdown table, writes nothing.
---

# /design-review

Phase 6 (POLISH) sub-check only. Owner: emil-design-eng.

Invoke the workflow:

- Tool: Workflow
- scriptPath: `workflows/magic.js`
- args: `{ "mode": "phase-only", "skipTo": "Polish", "reviewDiff": true }`

## Behavior

1. Read the current git diff (`git diff` against the working tree, plus staged).
2. For every animation, transition, or transform in the diff, run emil's 4-question Animation Decision Framework.
3. Emit a markdown table with columns: **Element | Before | After | Why**.

## Output

Prints the markdown table to the chat. Does not write to `presto/memory/`. Does not modify files.

If the diff has no UI changes, prints a one-line "no animation changes detected" and exits.
