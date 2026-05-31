---
name: houdini
description: "Creative partner for the blank page. Three modes: guided conversational flow (default), --auto for a zero-question solo run, or comma-separated keywords as a Design Read seed. Orthogonal --nogen modifier skips the MoodBoard image-gen phase (useful when Gemini quota is exhausted, when iterating fast, or for text-only design exploration). Drafts real starter HTML and hands off starter.html + DESIGN_APPROACH.md to /magic."
argument-hint: "[brief | --auto [safe|contrarian|wildcard] | \"kw1, kw2, kw3\"] [--nogen]"
---

# /houdini — fill the blank canvas

`/houdini` is the only phase in the presto plugin that's allowed to invent. Every other `/magic` phase refines, audits, or polishes an existing artifact. Houdini materializes direction as a concrete artifact — actual openable HTML drafts, not a brief — so the rest of the flow has something real to push on.

Inspired by impeccable.style/designing: "craft codes toward a concrete image, not an abstract brief; that is the step change."

Load the houdini skill at `skills/houdini/SKILL.md` and follow its instructions. The skill detects mode from `$ARGUMENTS` (autonomous if it starts with `--auto`; keywords if it's a comma-separated short-token list; guided otherwise) and orchestrates accordingly.

## --nogen modifier (orthogonal — composes with any mode)

Before mode detection, scan `$ARGUMENTS` for the literal token `--nogen`. If present:

1. Strip `--nogen` (and any surrounding whitespace) from `$ARGUMENTS` before parsing the rest.
2. Set a local `skipImageGen = true` flag.
3. Pass `skip_image_gen: true` into the houdini workflow args alongside everything else (brief, autonomous, keywords, angle_override, etc.).

This composes with every mode: `/houdini --auto --nogen`, `/houdini --auto wildcard --nogen`, `/houdini "minimal, swiss, editorial" --nogen`, and `/houdini a CRM for plumbers --nogen` are all valid. With `--nogen`, the MoodBoard phase is skipped entirely (no nanogen calls, no images written to seeds/) and drafters work from the brief + design_read + creative directive alone. Use it when the Gemini API quota is exhausted, when iterating fast (saves ~15s), for text-only exploration, or for cost-sensitive batch runs.

The brief, if provided, is `$ARGUMENTS` (with `--nogen` stripped if it was present).

If the stripped `$ARGUMENTS` is empty, the skill will prompt for one short sentence (project name, what it does, who it is for) before drafting.
