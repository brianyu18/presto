---
name: design-audit
description: Run AUDIT phase only — Pre-Flight matrix + AI slop test + emil review table, in parallel.
argument-hint: "[target]"
---

# /design-audit

Phase 7 of the presto flow. Owner: all three skills in parallel.

Invoke the workflow:

- Tool: Workflow
- scriptPath: `workflows/magic.js`
- args: `{ "intent": "$ARGUMENTS", "mode": "phase-only", "skipTo": "Audit" }`

## Behavior

`$ARGUMENTS` is the target — a directory, a file, or a URL. The workflow runs three checks concurrently:

1. **Pre-Flight Check** (taste) — mechanical matrix from Section 14 of design-taste-frontend.
2. **AI Slop Test** (impeccable) — first-order and second-order slop patterns.
3. **Review Table** (emil) — animations, easing, transform-origin, asymmetric timing.

## Output

Writes `presto/memory/last-audit.json`:

```json
{
  "preflight_pass": boolean,
  "slop_pass": boolean,
  "review_findings": [...],
  "gate": "pass" | "fail"
}
```

Prints the gate result and any failing checks inline.
