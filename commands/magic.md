---
name: magic
description: Run the full 8-phase presto design flow (HOUDINI -> READ -> CONTEXT -> DIALS -> STACK -> BUILD -> POLISH -> AUDIT). Three modes: default conversational (one cold-start prompt), --surprise (zero prompts, autonomous wildcard seed), --guided (pause for approval at every phase boundary). Orthogonal modifiers: --nogen (skip MoodBoard), --gen[-N] (override mood image count 1-5, default 3), --useimg[-N] (let drafter embed N mood images, default 2 in autonomous). All three pass through to any /houdini invocation this command triggers.
argument-hint: "[intent] [--surprise | --guided] [--nogen | --gen[-N]] [--useimg[-N]]"
---

# /magic

Kick off the full presto workflow. Three skills (impeccable, design-taste-frontend, emil-design-eng) coordinate across 8 phases with a single owner per phase. Phase 0 (HOUDINI) is optional and only fires on cold-start briefs.

## Pre-run setup (every invocation, before flag parsing)

1. **Resolve project root.** Use Bash to run `pwd` and capture as `PROJECT_ROOT`. presto is per-project; all paths derive from the user's cwd, not the plugin install location.

2. **Lazy-init the working dirs.** Run `mkdir -p "$PROJECT_ROOT/seeds" "$PROJECT_ROOT/memory" "$PROJECT_ROOT/outputs"` (idempotent). On first run in a project, log "Created seeds/ + memory/ + outputs/ in <PROJECT_ROOT>".

3. **Generate `RUN_SLUG`.** Format `<brief-3-words-kebab-or-"auto">-YYYY-MM-DD-HHMM`. From `$ARGUMENTS` after flag-strip, take first 3 word-tokens, lowercase, replace non-alphanumeric with `-`, collapse repeats, trim. Fall back to `auto` if empty. Append `-$(date +%Y-%m-%d-%H%M)`.

4. **Pre-create the output dir.** Run `mkdir -p "$PROJECT_ROOT/outputs/$RUN_SLUG/seeds" "$PROJECT_ROOT/outputs/$RUN_SLUG/memory"`. Build phase writes production files into `$PROJECT_ROOT/outputs/$RUN_SLUG/` and Finalize moves the seeds + memory snapshots in.

5. **Pass into every Workflow call** in this command: include `"project_root": "<PROJECT_ROOT>", "run_slug": "<RUN_SLUG>"` in args. The workflow uses both to compute all paths.

## Behavior

1. Parse `$ARGUMENTS` for flags. Recognize `--surprise`, `--guided`, `--nohoudini`, `--use <slug>`, `--nogen`, `--gen[-N|=N| N]`, and `--useimg[-N|=N| N]`. Any flag may appear anywhere. Strip each (token + value + surrounding whitespace) and trim. The remaining text is the intent. The image flags (`--nogen` / `--gen` / `--useimg`) are orthogonal to mode flags and compose with either; when present they propagate verbatim to every `/houdini` invocation this command triggers. Capture extracted values into local variables: `skipImageGen` (bool), `moodCount` (int|null), `embedImages` (int|null), `useSlug` (string|null), `noHoudini` (bool).

2. If BOTH `--surprise` and `--guided` were set, log a one-line override note ("both --surprise and --guided passed; --surprise wins, ignoring --guided") and treat the invocation as `--surprise`. `--surprise` wins because it is the more decisive bypass. `--nogen` is orthogonal — it does not participate in this precedence and is honored regardless of which mode wins.

   **Mode-flag interactions:**
   - `--use <slug>` implies `--nohoudini` (you've named your seed; cold-start gate is moot). If both are explicit, no warning needed — they agree.
   - `--surprise` and `--use <slug>` are mutually exclusive: `--surprise` always generates a fresh seed via houdini; `--use` always reuses. If both passed, log "both --surprise and --use passed; --use wins, ignoring --surprise (re-use trumps re-generate)" and treat as `--use <slug>` (no houdini, no fresh generation).
   - `--surprise` and `--nohoudini` are mutually exclusive: `--surprise` MUST run houdini autonomous, `--nohoudini` MUST NOT. If both passed, log "both --surprise and --nohoudini passed; --surprise wins, ignoring --nohoudini" and treat as `--surprise`.

3. **`--use <slug>` resolution (runs before any other path).** When `useSlug` is non-null:
   a. Verify the source: `test -d "$PROJECT_ROOT/outputs/$useSlug/seeds"`. If missing, error: "no run found at outputs/<slug>/; available runs: $(ls $PROJECT_ROOT/outputs/ 2>/dev/null)" and stop.
   b. Check seeds/ state: count files (excluding .gitkeep) via `find "$PROJECT_ROOT/seeds" -maxdepth 1 -type f -not -name '.gitkeep' | wc -l`.
   c. If seeds/ is non-empty, AskUserQuestion: "seeds/ already has N file(s) (not empty). Use them ALONGSIDE the slug's seeds (merge)?"
      - Header: "seeds/ conflict"
      - Options:
        1. "Merge — keep current seeds AND copy from <slug>" — copy `outputs/<slug>/seeds/*` into `seeds/` without removing existing files (overwrite is OK for same-named files like mood-1.png, slug version wins).
        2. "Orphan — move current seeds to outputs/_orphans/<timestamp>/ then copy from <slug>" — `mkdir -p "$PROJECT_ROOT/outputs/_orphans/$(date +%Y-%m-%d-%H%M%S)/"; mv "$PROJECT_ROOT/seeds/"* "$_/"`, then copy from slug.
        3. "Abort — don't run" — stop without changes.
   d. If seeds/ is empty (only .gitkeep or nothing), copy from slug without prompting: `cp -r "$PROJECT_ROOT/outputs/$useSlug/seeds/"* "$PROJECT_ROOT/seeds/"`.
   e. Same for memory/: copy `outputs/$useSlug/memory/*` into `$PROJECT_ROOT/memory/`. If conflict, the same merge prompt's choice applies (no second ask).
   f. After resolution, treat the run as `--nohoudini` (seed is in place) and proceed to step 5 below.

4. **`--nohoudini` resolution (when --nohoudini is set without --use).** Verify `$PROJECT_ROOT/seeds/` has at least one non-.gitkeep file. If empty, error: "--nohoudini requires seeds/ to be non-empty. Either drop your seed resources into seeds/ first, or run /houdini to generate them, or pass --use <slug> to repopulate from a prior run." and stop. If non-empty, proceed to step 5 below.

5. **If `--surprise` (bypass path):**

   a. If the cleaned intent is empty, ask the user once via AskUserQuestion: "What should /magic --surprise build?" Stop until they answer, then continue with their reply as the intent.

   b. Invoke the houdini workflow directly:
      - Tool: Workflow
      - scriptPath: `workflows/houdini.js`
      - args: `{ "brief": "<cleaned intent>", "autonomous": true, "n_drafts": 1, "angle_override": "wildcard", "project_root": "<PROJECT_ROOT>", "run_slug": "<RUN_SLUG>" }`
      - If `--nogen` was passed, add `"skip_image_gen": true` to the args object so houdini skips the MoodBoard phase entirely.
      - If `--gen[-N]` was passed and its N is a positive integer, add `"mood_board_count": <N>` (workflow clamps to 1-5).
      - If `--useimg[-N]` was passed, add `"embed_images": <N>` (use 2 when bare; 0 explicitly disables; workflow clamps + auto-bumps as documented).

   c. When that workflow returns, it has already written `presto/memory/DESIGN_APPROACH.md`, `presto/seeds/starter.html`, and `presto/seeds/tokens.css`. Announce to the user in one line that the seed has landed, including the path to `starter.html`.

   d. Launch the magic workflow:
      - Tool: Workflow
      - scriptPath: `workflows/magic.js`
      - args: `{ "intent": "<cleaned intent>", "mode": "full", "project_root": "<PROJECT_ROOT>", "run_slug": "<RUN_SLUG>" }`

   e. Phase 0 will find `DESIGN_APPROACH.md` and skip. Phase 1 (READ) and forward proceed normally. Surface the final AUDIT gate result.

6. **If `--guided` (phase-by-phase approval path):**

   a. If the cleaned intent is empty, ask the user via AskUserQuestion for one short sentence describing what to build. Stop until they answer.

   b. Briefly tell the user this run will pause between every phase, costs n round-trips to the workflow tool, and is the slow-but-visible mode. If `--nogen` was passed, note that any `/houdini` cold-start invocation triggered during this run will skip MoodBoard image generation.

   c. For each phase in order — `Read`, `Context`, `Dials`, `Stack`, `Build`, `Polish`:
      - Launch the magic workflow:
        - Tool: Workflow
        - scriptPath: `workflows/magic.js`
        - args: `{ "intent": "<cleaned intent>", "mode": "phase-only", "skipTo": "<phase-name>", "project_root": "<PROJECT_ROOT>", "run_slug": "<RUN_SLUG>", "finalize": false }`
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
      - args: `{ "intent": "<cleaned intent>", "mode": "phase-only", "skipTo": "Audit", "project_root": "<PROJECT_ROOT>", "run_slug": "<RUN_SLUG>", "finalize": true }`
      - Show the gate result (`pass` or `fail`) and the audit summary. AUDIT is the gate, not a decision point, so there is no approval prompt before it — only after.

7. **Otherwise (default conversational path):**

   a. If the cleaned intent is empty, ask the user via AskUserQuestion for one short sentence describing what to build, and stop until they answer.

   b. Launch the magic workflow:
      - Tool: Workflow
      - scriptPath: `workflows/magic.js`
      - args: `{ "intent": "<cleaned intent>", "mode": "full", "project_root": "<PROJECT_ROOT>", "run_slug": "<RUN_SLUG>" }`

   c. If the workflow returns `{ halted_for_houdini: true, reason }`, catch the return and ask the user via AskUserQuestion:
      - Question: "Cold start detected. Run /houdini first?"
      - Context: include the `reason` field from the workflow return.
      - Options:
        - "Yes, run /houdini" — load the houdini skill for a guided seed.
        - "No, proceed without it" — skip Phase 0 and READ a blank slate.
        - "Customize args" — pass specific arguments to /houdini.

   d. **On "Yes":** Invoke `/houdini` (passing through whichever of `--nogen`, `--gen[-N]`, `--useimg[-N]` were set on this `/magic` invocation, verbatim, so houdini sees the same modifiers). The main loop loads `skills/houdini/SKILL.md`. Houdini's TUNE IN step will ask the user via AskUserQuestion which mode to run (Autonomous / Keywords / Guided). Let that conversation play out. When houdini completes its HAND-OFF (writes `DESIGN_APPROACH.md`), re-launch the magic workflow with the same `{ intent, mode: "full" }`. Phase 0 now finds the approach file and skips. Continue through AUDIT.

   e. **On "No":** Re-launch the magic workflow with `{ intent, mode: "full", startHook: "off" }`. Phase 0 is bypassed. READ proceeds without a seed. Quality may suffer; this is the user's choice.

   f. **On "Customize args":** Ask the user via AskUserQuestion for the houdini args they want (e.g. `--auto wildcard`, or a keyword list like `fintech, dark, terminal`). Invoke `/houdini` with the provided argument string. For each of `--nogen`, `--gen[-N]`, `--useimg[-N]` that was set on this `/magic` invocation and is NOT already present in the user-supplied string, append it verbatim. When houdini completes its hand-off, re-launch the magic workflow with `{ intent, mode: "full" }` as in case (d).

8. The workflow runs all phases linearly (in default, --use, --nohoudini, and --surprise modes), persists phase outputs to `$PROJECT_ROOT/memory/`, and surfaces the final AUDIT gate (`pass` or `fail`). On successful full-pipeline completion, the Finalize phase moves `$PROJECT_ROOT/seeds/*` and `$PROJECT_ROOT/memory/*` into `$PROJECT_ROOT/outputs/$RUN_SLUG/` and writes a `META.json` summarising the run. After Finalize, `seeds/` and `memory/` are empty (except for `.gitkeep`) — ready for the next project.

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
