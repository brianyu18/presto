---
name: design-read
description: Run phase 1 only — produce the one-line Design Read (kind, audience, vibe, stack hint).
argument-hint: "[intent]"
---

# /design-read

Phase 1 of the presto flow. Owner: design-taste-frontend.

Invoke the workflow:

- Tool: Workflow
- scriptPath: `workflows/magic.js`
- args: `{ "intent": "$ARGUMENTS", "mode": "phase-only", "skipTo": "Read" }`

## Output

Writes `presto/memory/DESIGN_READ.md` with:

```
{ read: string, kind, audience, vibe, stack_hint }
```

The Design Read is one sentence. It is the seed that every later phase reads back. If `$ARGUMENTS` is empty, prompt the user for the intent and stop.
