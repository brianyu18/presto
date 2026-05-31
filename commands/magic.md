---
name: magic
description: Run the full 8-phase presto design flow (HOUDINI -> READ -> CONTEXT -> DIALS -> STACK -> BUILD -> POLISH -> AUDIT). Three modes: default conversational (one cold-start prompt), --surprise (zero prompts, autonomous wildcard seed), --guided (pause for approval at every phase boundary). Add --nogen to skip MoodBoard image generation in any /houdini invocation triggered by this command.
argument-hint: "[intent] [--surprise | --guided] [--nogen]"
---

# /magic

Kick off the full presto workflow. Three skills (impeccable, design-taste-frontend, emil-design-eng) coordinate across 8 phases with a single owner per phase. Phase 0 (HOUDINI) is optional and only fires on cold-start briefs.

## Behavior

1. Parse `$ARGUMENTS` for flags. Recognize `--surprise`, `--guided`, and `--nogen`. Any flag may appear anywhere in the string. Strip whichever flags are present and trim surrounding whitespace. The remaining text is the intent. `--nogen` is orthogonal to `--surprise`/`--guided` and composes with either (or with the default conversational path); when present, it propagates to every `/houdini` invocation this command triggers so the MoodBoard image-generation phase is skipped.

2. If BOTH `--surprise` and `--guided` were set, log a one-line override note ("both --surprise and --guided passed; --surprise wins, ignoring --guided") and treat the invocation as `--surprise`. `--surprise` wins because it is the more decisive bypass. `--nogen` is orthogonal — it does not participate in this precedence and is honored regardless of which mode wins.

3. **If `--surprise` (bypass path):**

   a. If the cleaned intent is empty, ask the user once via AskUserQuestion: "What should /magic --surprise build?" Stop until they answer, then continue with their reply as the intent.

   b. Invoke the houdini workflow directly:
      - Tool: Workflow
      - scriptPath: `workflows/houdini.js`
      - args: `{ "brief": "<cleaned intent>", "autonomous": true, "n_drafts": 1, "angle_override": "wildcard" }`
      - If `--nogen` was passed, add `"skip_image_gen": true` to the args object so houdini skips the MoodBoard phase entirely.

   c. When that workflow returns, it has already written `presto/memory/DESIGN_APPROACH.md`, `presto/seeds/starter.html`, and `presto/seeds/tokens.css`. Announce to the user in one line that the seed has landed, including the path to `starter.html`.

   d. Launch the magic workflow:
      - Tool: Workflow
      - scriptPath: `workflows/magic.js`
      - args: `{ "intent": "<cleaned intent>", "mode": "full" }`

   e. Phase 0 will find `DESIGN_APPROACH.md` and skip. Phase 1 (READ) and forward proceed normally. Surface the final AUDIT gate result.

4. **If `--guided` (phase-by-phase approval path):**

   a. If the cleaned intent is empty, ask the user via AskUserQuestion for one short sentence describing what to build. Stop until they answer.

   b. Briefly tell the user this run will pause between every phase, costs n round-trips to the workflow tool, and is the slow-but-visible mode. If `--nogen` was passed, note that any `/houdini` cold-start invocation triggered during this run will skip MoodBoard image generation.

   c. For each phase in order — `Read`, `Context`, `Dials`, `Stack`, `Build`, `Polish`:
      - Launch the magic workflow:
        - Tool: Workflow
        - scriptPath: `workflows/magic.js`
        - args: `{ "intent": "<cleaned intent>", "mode": "phase-only", "skipTo": "<phase-name>" }`
      - When it returns, read the phase output from `presto/memory/` and show the user a tight summary: the phase JSON if small, otherwise a 3-5 line digest of the key decisions.
      - AskUserQuestion:
        - Question: "Phase <N> — <phase-name> — approve and continue?"
        - Header: "<phase-name> approval"
        - Options:
          1. "Approve and continue" — proceed to the next phase.
          2. "Revise this phase" — follow up with a second AskUserQuestion for free-text feedback, then re-launch THIS phase with the feedback in a new `args.feedback` field (the workflow appends it to the phase prompt). Loop back to the summary + approval step.
          3. "Skip this phase" — move on without applying. Surface a warning that downstream phases will have to infer this phase's contribution. Do not write the skipped phase's memory file.
          4. "Abort" — stop the run. Return what was produced so far (list the memory files written to date).

   d. After `Polish` is approved or skipped, run the AUDIT phase once with no pause beforehand:
      - Tool: Workflow
      - scriptPath: `workflows/magic.js`
      - args: `{ "intent": "<cleaned intent>", "mode": "phase-only", "skipTo": "Audit" }`
      - Show the gate result (`pass` or `fail`) and the audit summary. AUDIT is the gate, not a decision point, so there is no approval prompt before it — only after.

5. **Otherwise (default conversational path):**

   a. If the cleaned intent is empty, ask the user via AskUserQuestion for one short sentence describing what to build, and stop until they answer.

   b. Launch the magic workflow:
      - Tool: Workflow
      - scriptPath: `workflows/magic.js`
      - args: `{ "intent": "<cleaned intent>", "mode": "full" }`

   c. If the workflow returns `{ halted_for_houdini: true, reason }`, catch the return and ask the user via AskUserQuestion:
      - Question: "Cold start detected. Run /houdini first?"
      - Context: include the `reason` field from the workflow return.
      - Options:
        - "Yes, run /houdini" — load the houdini skill for a guided seed.
        - "No, proceed without it" — skip Phase 0 and READ a blank slate.
        - "Customize args" — pass specific arguments to /houdini.

   d. **On "Yes":** Invoke `/houdini` (passing `--nogen` along if it was set on this `/magic` invocation, so the MoodBoard phase is skipped). The main loop loads `skills/houdini/SKILL.md`. Houdini's TUNE IN step will ask the user via AskUserQuestion which mode to run (Autonomous / Keywords / Guided). Let that conversation play out. When houdini completes its HAND-OFF (writes `DESIGN_APPROACH.md`), re-launch the magic workflow with the same `{ intent, mode: "full" }`. Phase 0 now finds the approach file and skips. Continue through AUDIT.

   e. **On "No":** Re-launch the magic workflow with `{ intent, mode: "full", startHook: "off" }`. Phase 0 is bypassed. READ proceeds without a seed. Quality may suffer; this is the user's choice.

   f. **On "Customize args":** Ask the user via AskUserQuestion for the houdini args they want (e.g. `--auto wildcard`, or a keyword list like `fintech, dark, terminal`). Invoke `/houdini` with the provided argument string (append `--nogen` to that string if it was set on this `/magic` invocation and the user did not already include it). When houdini completes its hand-off, re-launch the magic workflow with `{ intent, mode: "full" }` as in case (d).

6. The workflow runs all phases linearly (in default and --surprise modes), persists phase outputs to `presto/memory/`, and surfaces the final AUDIT gate (`pass` or `fail`).

## --surprise

The `--surprise` flag skips both confirmation prompts (the cold-start gate and the houdini mode question). It autonomously generates a single wildcard draft, writes the hand-off files, then runs the full magic flow. Net: blank brief to AUDIT in one command, zero prompts.

## --guided

The `--guided` flag pauses between every phase for approval. After each of Read, Context, Dials, Stack, Build, Polish the command surfaces the phase output and asks Approve / Revise / Skip / Abort. AUDIT runs at the end without a pre-pause because it is the gate. Guided runs are slower (n round-trips to the workflow tool, one per phase) in exchange for maximum visibility and per-phase control. Use it when you want oversight without dropping down to the standalone break-out commands.

## Break-out alternatives

If you only want one phase, use the dedicated command instead of `/magic`:

- `/design-read` — phase 1 only (taste owner)
- `/set-dials` — phase 3 only (taste owner, accepts overrides)
- `/design-flow [feature]` — skip 1-4 if memory has them, jump to BUILD
- `/design-audit [target]` — phase 7 only, all three skills in parallel
- `/design-review` — emil's review table on the current git diff

## Phase ownership (reference)

| # | Phase    | Owner                       |
|---|----------|-----------------------------|
| 0 | HOUDINI  | /houdini skill (optional)   |
| 1 | READ     | taste                       |
| 2 | CONTEXT  | impeccable                  |
| 3 | DIALS    | taste                       |
| 4 | STACK    | taste                       |
| 5 | BUILD    | impeccable + taste          |
| 6 | POLISH   | emil                        |
| 7 | AUDIT    | all three                   |
