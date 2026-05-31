---
name: design-flow
description: Skip READ/CONTEXT/DIALS/STACK if memory has them, jump straight to BUILD for a specific feature.
argument-hint: "[feature]"
---

# /design-flow

Resume the presto flow at BUILD. Owner: impeccable + taste, coordinated.

Invoke the workflow:

- Tool: Workflow
- scriptPath: `workflows/magic.js`
- args: `{ "intent": "$ARGUMENTS", "mode": "full", "skipTo": "Build" }`

## Behavior

The workflow checks `presto/memory/` for `DESIGN_READ.md`, `CONTEXT.json`, `DIALS.json`, and `STACK.json`. If all four exist, BUILD runs immediately against `$ARGUMENTS` as the feature target. If any are missing, the workflow runs the missing phases first, then BUILD.

After BUILD, POLISH (emil) and AUDIT (all three) run as in `/magic`.

## Output

- `presto/memory/last-build.json` with `{ files_written: string[], notes }`
- Continues to POLISH and AUDIT, persisting their outputs.
