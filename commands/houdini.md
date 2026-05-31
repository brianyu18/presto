---
name: houdini
description: "Creative partner for the blank page. Three modes: guided conversational flow (default), --auto for a zero-question solo run, or comma-separated keywords as a Design Read seed. Drafts real starter HTML and hands off starter.html + DESIGN_APPROACH.md to /magic."
argument-hint: "[brief | --auto [safe|contrarian|wildcard] | \"kw1, kw2, kw3\"]"
---

# /houdini — fill the blank canvas

`/houdini` is the only phase in the presto plugin that's allowed to invent. Every other `/magic` phase refines, audits, or polishes an existing artifact. Houdini materializes direction as a concrete artifact — actual openable HTML drafts, not a brief — so the rest of the flow has something real to push on.

Inspired by impeccable.style/designing: "craft codes toward a concrete image, not an abstract brief; that is the step change."

Load the houdini skill at `skills/houdini/SKILL.md` and follow its instructions. The skill detects mode from `$ARGUMENTS` (autonomous if it starts with `--auto`; keywords if it's a comma-separated short-token list; guided otherwise) and orchestrates accordingly.

The brief, if provided, is `$ARGUMENTS`.

If `$ARGUMENTS` is empty, the skill will prompt for one short sentence (project name, what it does, who it is for) before drafting.
