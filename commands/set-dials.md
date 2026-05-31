---
name: set-dials
description: Run phase 3 only — set VARIANCE, MOTION, DENSITY dials (1-10). Accepts overrides.
argument-hint: "[variance=N motion=N density=N]"
---

# /set-dials

Phase 3 of the presto flow. Owner: design-taste-frontend.

Invoke the workflow:

- Tool: Workflow
- scriptPath: `workflows/magic.js`
- args: `{ "intent": "$ARGUMENTS", "skipTo": "Dials" }`

## Overrides

The user may pass conversational overrides such as `variance=8 motion=3 density=6` or plain English ("turn motion down, push density up"). Pass them through verbatim in `args.intent` — the workflow parses them inside the DIALS phase.

## Output

Writes `presto/memory/DIALS.json`:

```json
{ "variance": 1-10, "motion": 1-10, "density": 1-10, "reasoning": "..." }
```

DIALS read from earlier phase outputs (`DESIGN_READ.md`) if they exist; otherwise the workflow runs READ first.
