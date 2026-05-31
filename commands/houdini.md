---
name: houdini
description: "Creative partner for the blank page. Three modes: guided conversational flow (default), --auto for a zero-question solo run, or comma-separated keywords as a Design Read seed. Three orthogonal modifiers: --nogen (skip MoodBoard entirely), --gen[-N] (override mood image count, default 3, cap 5), --useimg[-N] (let drafter embed N mood images, default 2 in autonomous, off otherwise). Drafts real starter HTML and hands off starter.html + DESIGN_APPROACH.md to /magic."
argument-hint: "[brief | --auto [safe|contrarian|wildcard] | \"kw1, kw2, kw3\"] [--nogen | --gen[-N]] [--useimg[-N]]"
---

# /houdini — fill the blank canvas

`/houdini` is the only phase in the presto plugin that's allowed to invent. Every other `/magic` phase refines, audits, or polishes an existing artifact. Houdini materializes direction as a concrete artifact — actual openable HTML drafts, not a brief — so the rest of the flow has something real to push on.

Inspired by impeccable.style/designing: "craft codes toward a concrete image, not an abstract brief; that is the step change."

## Pre-run setup (every invocation, before mode detection)

1. **Resolve project root.** Use Bash to run `pwd` and capture the absolute path as `PROJECT_ROOT`. presto is intended to be used inside a user's project — paths must derive from the user's cwd, not the plugin install location.

2. **Lazy-init the working dirs.** Run `mkdir -p "$PROJECT_ROOT/seeds" "$PROJECT_ROOT/memory" "$PROJECT_ROOT/outputs"` (idempotent). On first run in a project, log a one-liner like "Created seeds/ + memory/ + outputs/ in <PROJECT_ROOT>" so the user knows the project was just provisioned.

3. **Generate a run slug.** The slug names this houdini run's output and travels with it through any later `/magic` invocation. Format: `<brief-3-words-kebab-or-"auto">-YYYY-MM-DD-HHMM`.
   - If `$ARGUMENTS` (after stripping flags) contains a brief, take its first 3 word-tokens, lowercase, replace non-alphanumeric with `-`, collapse `-+` to single, trim leading/trailing `-`. Fall back to `auto` if the slug is empty.
   - For `--auto` or empty-brief invocations, use `auto`.
   - Append a timestamp via Bash: `date +%Y-%m-%d-%H%M`.
   - Example: `dog-app-2026-05-31-1147`, `auto-2026-05-31-1147`, `fintech-dashboard-2026-05-31-1147`.
   - Capture as `RUN_SLUG`.

4. **Pass both into the workflow.** Every Workflow tool invocation in this command must include `"project_root": "<PROJECT_ROOT>", "run_slug": "<RUN_SLUG>"` in args alongside the brief, autonomous flag, keywords, etc.

## Mode detection

Load the houdini skill at `skills/houdini/SKILL.md` and follow its instructions. The skill detects mode from `$ARGUMENTS` (autonomous if it starts with `--auto`; keywords if it's a comma-separated short-token list; guided otherwise) and orchestrates accordingly.

## Modifier flags (orthogonal — compose with any mode)

**Parse order.** Before mode detection, scan `$ARGUMENTS` for the three modifiers below in this order, stripping each match (token + surrounding whitespace) as it is found. After all three have been processed, the residue is the brief (or empty in `--auto` / keyword modes).

### `--nogen`

Literal token. If present: set `skipImageGen = true` and pass `skip_image_gen: true` to the workflow. The MoodBoard phase is skipped entirely (no nanogen calls, no images written to seeds/) and drafters work from brief + design_read + creative directive alone. Use when Gemini quota is exhausted, when iterating fast (~15s saved), for text-only exploration, or cost-sensitive batch runs.

### `--gen[-N]` (alias: `--gen N`, `--gen=N`)

Optional N (integer). Overrides the number of mood-board images generated. Default 3, hard-capped at 5, floor 1. If present without an N, the default 3 is used (i.e. no-op, but legal). Pass `mood_board_count: <N>` to the workflow. If both `--nogen` and `--gen` are present, `--nogen` wins (nothing generated) and `--gen` is silently ignored.

Examples: `--gen-5`, `--gen 4`, `--gen=2`. `--gen-9` → clamped to 5 with a log line.

### `--useimg[-N]` (alias: `--useimg N`, `--useimg=N`)

Optional N (integer ≥ 0). Tells the drafter it MAY embed up to N mood images as real `<img>` tags in the HTML output (relative paths, on-brand only). Default behavior:

- bare `--useimg` → embed up to 2
- `--useimg-0` → force NO embed (overrides autonomous mode's default permission)
- AUTONOMOUS mode without `--useimg` → embed up to 2 (existing default)
- KEYWORDS / GUIDED mode without `--useimg` → embed 0 (existing default)

Safety:
- If `--useimg` > generated mood-board count AND `--gen` was also explicit → clamp `useimg` to `gen` and emit a top-of-log WARN. The run proceeds; the warning is informational, not a halt.
- If `--useimg` > 3 (the default mood-board count) and `--gen` was NOT explicit → auto-bump `mood_board_count` to match useimg (capped at 5). Silent.
- If `--nogen` is present, useimg is silently set to 0.

Pass `embed_images: <effective N>` to the workflow.

Examples: `--useimg`, `--useimg-3`, `--useimg 0`, `--useimg=4 --gen-5`.

### Composition examples

```
/houdini --auto --nogen                       # autonomous, no images at all
/houdini --auto wildcard --useimg-3 --gen-5   # autonomous, gen 5 mood images, embed up to 3
/houdini "minimal, swiss, editorial" --useimg-2 --gen-4   # keywords mode, embed 2 of 4
/houdini a CRM for plumbers --useimg --gen    # guided, embed up to 2 of 3 (defaults)
/houdini --auto --useimg-0                    # autonomous, force NO embed
```

The brief, if provided, is `$ARGUMENTS` with all three modifier flags stripped.

If the stripped `$ARGUMENTS` is empty, the skill will prompt for one short sentence (project name, what it does, who it is for) before drafting.
