---
name: houdini
description: "Creative partner for the blank canvas. Three invocation modes: guided (conversational, default), autonomous (--auto, zero-question solo run), and keyword-seeded (comma-separated short tokens). Houdini proposes actual drafted starter templates, iterates with the user when interactive, and hands off a starter design + DESIGN_APPROACH.md to /magic's downstream phases."
user-invocable: true
argument-hint: "[brief | --auto [safe|contrarian|wildcard] | \"kw1, kw2, kw3\"]"
---

# Houdini — the creative partner for the blank canvas

Houdini is the creative partner who fills the blank canvas. Every other phase in /magic refines, audits, or polishes work that already exists. Houdini is the only phase allowed to invent. From impeccable.style: "craft codes toward a concrete image, not an abstract brief; that is the step change." Houdini's whole job is to convert a fuzzy brief into a concrete, openable artifact the user can react to. Refinement happens against pixels, not adjectives.

## When to use

Use houdini when:
- A net-new project with no design direction yet.
- A redesign where the existing direction should be thrown out.
- A blank repo, a rebrand, or a fresh marketing site.
- The user has a brief but no chosen aesthetic, palette, or type system.

Do NOT use houdini for:
- Polishing or auditing an existing page. Use /magic's Audit / Polish phases.
- Small refinements on an already-chosen direction. Edit directly.
- Pure copy or content work with no visual ask.

## Mode detection

Houdini supports three invocation modes. Detect the mode from the args BEFORE running TUNE IN; the rest of the skill branches off this decision.

**Detection sequence** (evaluate in order, take the first match):

1. **AUTONOMOUS** — args start with `--` or contain a literal `--auto` token. Optional angle suffix: `--auto safe`, `--auto contrarian`, `--auto wildcard`. Default angle when omitted is `wildcard`. Any leftover free text after stripping the flag becomes the brief.
2. **KEYWORDS** — args match a comma-separated list of short tokens. Loose detection regex: `^\s*[\w][\w \-]*(?:\s*,\s*[\w][\w \-]*){1,5}\s*$`. Each token must be < 30 chars; total tokens between 2 and 6; no sentence-shaped strings.
3. **GUIDED** — args are empty OR look sentence-shaped (a brief). This is the default and matches the original conversational v2 flow.

When args don't specify a mode (case 3), the skill asks the user which mode to use at the start of TUNE IN (see Phase 1, Step 0). The arg-based shortcuts (cases 1 and 2) skip that question entirely — they are the power-user bypass.

**Orthogonal modifiers.** Three flags are NOT modes — they are modifiers that compose with any of the three modes above and with each other. Strip them from args during detection so they do not interfere with mode classification, capture their values, then pass the resolved values to the workflow.

| Flag forms | Workflow arg | Default | Cap |
|---|---|---|---|
| `--nogen` | `skip_image_gen: true` | (off) | — |
| `--gen` / `--gen-N` / `--gen=N` / `--gen N` | `mood_board_count: N` | 3 | 1–5 |
| `--useimg` / `--useimg-N` / `--useimg=N` / `--useimg N` | `embed_images: N` | autonomous→2, others→0 | min(N, mood_board_count) |

**Safety semantics (the workflow enforces these — the skill just passes through the user's literal values):**

- `--nogen` wins over `--gen` and `--useimg`. If `--nogen` is present, the workflow sets `embed_images=0` regardless of what was passed.
- If both `--useimg N` and `--gen M` are explicit and `N > M`, the workflow clamps useimg to M and emits a top-of-log WARN. No re-entry — the run proceeds.
- If `--useimg N` is explicit but `--gen` was NOT given and `N > 3`, the workflow silently auto-bumps `mood_board_count` to `min(5, N)`.
- `--useimg-0` (explicit zero) forces no embed even in autonomous mode (overrides the autonomous default of 2).

**Example composed invocations:**

```
/houdini --nogen                                — guided default, no image gen
/houdini "fintech, dark" --nogen                — keywords mode, no image gen
/houdini --auto wildcard --nogen                — autonomous, no image gen
/houdini "fintech, dark" --useimg-2 --gen-4     — keywords, gen 4, embed up to 2
/houdini --auto --useimg-3 --gen-5              — autonomous, gen 5, embed up to 3
/houdini --auto --useimg-0                      — autonomous, FORCE no embed
/houdini a CRM for plumbers --useimg --gen      — guided, defaults (gen 3, embed 2)
```

**When to use each modifier:**

- `--nogen`: Gemini quota exhausted, fast iteration (~15s saved), text-only exploration, cost-sensitive batch runs.
- `--gen-N`: you want richer mood input (4-5 images) or a leaner one (1-2) than the default 3.
- `--useimg-N`: you want the drafter to actually USE mood images as app content (e.g. for a portfolio, gallery, or content-app that benefits from inline imagery). Always allowed in autonomous mode; explicit in keywords/guided.

**When to use each mode:**

- **AUTONOMOUS** — for solo runs where the user wants houdini to just go: no questions, no presentation, no refine loop. Best when the user trusts the wildcard instinct and would rather react to a single shipped seed than pick from options. The mode collapses all five phases into TUNE IN (inference only) -> DRAFT (one draft) -> HAND-OFF.
- **KEYWORDS** — for users who already know the vibe in shorthand ("brutalist, mono, archive") and want houdini to seed three drafts from those signals without a conversational intake. Keywords get classified into register / vibe / vertical / aesthetic_family / anti_reference / type_hint / color_hint / audience_hint, and only conflicting keywords (e.g., "minimalist" + "brutalist") trigger ONE disambiguation question.
- **GUIDED** — the default. For users with a fuzzy brief who want the full conversational five-phase flow: hypothesis, three drafts, present, refine, hand-off. Use when the direction is ambiguous enough that a conversation is more valuable than three guesses.

## The five phases

| Phase         | What happens                                                          | Tool the skill uses        | Produces                                       |
|---------------|------------------------------------------------------------------------|----------------------------|------------------------------------------------|
| TUNE IN       | Read the brief, scan context, form a Design Read hypothesis            | Read, Bash (ls), AskUserQuestion (only if ambiguous) | A one-line Design Read + constraints |
| DRAFT         | Fan out 3 concurrent drafter agents that each write a full HTML file   | Workflow (workflows/houdini.js) | seeds/draft-1.html, draft-2.html, draft-3.html |
| PRESENT       | Show the 3 options as a small comparison, ask the user to pick         | AskUserQuestion            | A chosen draft number (or a remix instruction) |
| REFINE LOOP   | Ask what should change, apply the change to the chosen file in place   | Edit                       | Refined draft file, loop until user confirms   |
| HAND-OFF      | Lock the starter, extract tokens, write DESIGN_APPROACH.md             | Write                      | seeds/starter.html, seeds/tokens.css, memory/DESIGN_APPROACH.md |

## How to run each phase

### Phase 1 — TUNE IN

### Step 0 — Resolve mode (ask if ambiguous)

Run the detection sequence from the "Mode detection" section above against the args. There are two outcomes:

A. ARGS ALREADY SPECIFY A MODE — proceed without asking. This is the power-user shortcut.
   - Args start with `--auto` or contain a literal `--auto` token → AUTONOMOUS, capture the angle suffix (default `wildcard`).
   - Args match the comma-separated short-token regex → KEYWORDS.

B. ARGS DO NOT SPECIFY A MODE — args are empty OR look sentence-shaped (a brief).
   - This is the case where /magic recommended you, or where the user typed /houdini with just a description.
   - Use AskUserQuestion to ask which mode:
     - Question: "Which houdini mode should I use?"
     - Header: "Houdini mode"
     - Options:
       1. Label: "Guided (conversational, recommended)", description: "I'll ask 1-2 questions, then draft 3 options for you to pick from. Best for genuine blank-page work."
       2. Label: "Autonomous (--auto)", description: "I'll go solo: one wildcard draft, no questions, immediate hand-off. Best when you want me to just commit."
       3. Label: "Keywords", description: "Tell me 2-6 keywords (e.g. 'fintech, dark, terminal') and I'll seed three drafts from them."
       (Plus "Other" auto-added.)
   - Honor the user's pick. If KEYWORDS, follow up with a free-text AskUserQuestion for the keyword list, then re-run detection with the new args so the rest of TUNE IN treats them as if they had been passed in originally.

Once the mode is resolved (either by args or by the question above), continue with Step 0.5.

### Step 0.5 — Scan the seed directory for user-provided resources

Before forming the Design Read, list `$PROJECT_ROOT/seeds/` via Bash: `ls -1 "$PROJECT_ROOT/seeds" 2>/dev/null`. Identify USER-PROVIDED files: any file whose name does NOT match the workflow-owned patterns `mood-[1-5].png`, `draft-[1-5].html`, `starter.html`, `tokens.css`, `.gitkeep`. The remainder are user refs (e.g. `inspiration.jpg`, `brand-cover.png`, `screenshot-of-rival.png`, `refs/`).

There is NO quantity cap on user refs — list everything that's there.

What to do with the findings:
- **None present** → proceed as usual; the MoodBoard workflow will generate from nanogen if not `--nogen`.
- **One or more present** → mention them in the Design Read hypothesis as anchoring inputs. They will be auto-picked up by the workflow's MoodBoard phase (which scans seed_dir itself and decides replace/augment based on flags). Tell the user briefly: "Found N user-provided seed resource(s); they'll anchor the mood board."

This scan runs in ALL modes (autonomous, keywords, guided). It is read-only and never blocks.

### Step 1 — Branch by mode

With the mode now known, branch into the mode-specific TUNE IN content below. The detected mode determines how the rest of TUNE IN runs.

**If AUTONOMOUS mode:**

1. Strip the `--auto` token (and any angle suffix) from the args. Whatever free text remains becomes the brief. If empty, the brief is the empty string.
2. Extract `chosen_angle` from the suffix: `safe`, `contrarian`, or `wildcard`. Default to `wildcard` when no suffix is given.
3. Run a quick `ls` on the project root via Bash and read any obviously relevant context files (`presto/memory/PRODUCT.md`, brand assets, existing CSS), but do NOT ask the user about them.
4. Form the Design Read hypothesis purely from inference. If the brief is radically ambiguous (e.g., empty), pick a sensible default — typically a landing page with a confident-bold vibe — and continue. Never ask.
5. Capture constraints from whatever you can read on disk. Do not solicit any.
6. Output passed to the workflow: `{ brief, design_read, constraints, autonomous: true, n_drafts: 1, angle_override: chosen_angle }`.

**If KEYWORDS mode:**

1. Parse the comma-separated tokens. Trim whitespace. Lowercase for classification, preserve original casing in memory.
2. Classify each token into one of: `register`, `vibe`, `vertical`, `aesthetic_family`, `anti_reference`, `type_hint`, `color_hint`, `audience_hint`. A token can carry more than one classification; record all of them.
3. Detect conflicts: e.g., "minimalist" + "brutalist", "playful" + "regulated", "warm-paper" + "neon-cyber". If two keywords meaningfully contradict, ask exactly ONE disambiguation question via AskUserQuestion that resolves the conflict (e.g., "Lean minimalist or brutalist? Pick one — they pull opposite directions."). Otherwise proceed directly.
4. Run `ls` and read `presto/memory/PRODUCT.md` if it exists, same as guided mode. Do not run a full conversational intake.
5. Form the Design Read hypothesis with the keywords as the dominant signal. Capture any inferable constraints.
6. Output passed to the workflow: `{ brief, design_read, constraints, keywords: [...classified tokens...] }`. Three drafts; all three angles still run, each drafter receives the classified keywords as a primary prompt input.

**If GUIDED mode (default):**

1. Read the brief the user gave with the /houdini invocation. If empty, ask one short question: "what are you designing?"
2. Run a quick `ls` on the project root via Bash to see what already exists. Note any existing CSS, brand assets, screenshots, or prior attempts.
3. If `presto/memory/PRODUCT.md` exists, read it for product context. If it doesn't, skip.
4. If `presto/memory/DESIGN_APPROACH.md` already exists, warn the user: houdini overwrites it. Ask before continuing.
5. If a logo, brand guideline file, or `brand/` directory exists, read what you can. Pull dominant hues and any required fonts into constraints.
6. Form a one-line Design Read hypothesis in this shape:
   > Reading this as: a `<page kind>` for `<audience>`, with a `<vibe>` language.
   Example: "Reading this as: a developer-tool landing page for backend engineers, with a confident-technical language."
7. Decide: am I confident enough to proceed? If yes, state the Design Read out loud and proceed. If genuinely unclear, ask 1 or at most 2 surgical questions via AskUserQuestion. Never dump a five-question intake. Acceptable question topics:
   - Page kind (landing / app shell / docs / portfolio / marketing site / dashboard).
   - Audience (developer / consumer / enterprise / artist / mixed).
   - Vibe ceiling (quiet-editorial / confident-bold / loud-experimental).
8. Capture constraints from the conversation: existing brand colors, mandatory fonts, accessibility floor (AA / AAA), dark/light, framework target (vanilla HTML / React / Astro / etc.), any hard "do not use" rules.

Output of this phase, held in your head and passed to the workflow: `{ brief, design_read, constraints }` (plus mode-specific fields). Do not write this to disk yet. Remember the `mode` value (`autonomous` | `keywords` | `guided`) — HAND-OFF will need it.

### Phase 2 — DRAFT

1. The command preamble has already created `$PROJECT_ROOT/seeds/` and resolved `$PROJECT_ROOT` + `$RUN_SLUG`. Take both as given.
2. Invoke the workflow at `presto/workflows/houdini.js` with mode-specific args. **Every invocation must include `project_root: "$PROJECT_ROOT"` and `run_slug: "$RUN_SLUG"`** alongside the mode-specific fields. The workflow uses both to compute all read/write paths (no hardcoded plugin paths).

   **AUTONOMOUS** — one draft, the chosen angle, no user in the loop:
   ```
   { brief, design_read, constraints, autonomous: true, n_drafts: 1, angle_override: chosen_angle,
     project_root, run_slug }
   ```
   The workflow generates exactly ONE draft at `$PROJECT_ROOT/seeds/draft-1.html` using `chosen_angle` (default `wildcard`).

   **KEYWORDS** — three drafts, keywords threaded into each drafter:
   ```
   { brief, design_read, constraints, keywords: [...], project_root, run_slug }
   ```
   Three drafts as usual. The workflow passes the classified keywords into each drafter's prompt as a primary signal alongside the angle.

   **GUIDED** — three drafts, original behavior:
   ```
   { brief, design_read, constraints, n_drafts: 3, project_root, run_slug }
   ```

   For any mode, also pass through the modifier flags if set: `skip_image_gen`, `mood_board_count`, `embed_images`.

3. In the multi-draft modes (KEYWORDS / GUIDED), the workflow fans out 3 drafter subagents concurrently. Each writes one self-contained HTML file: `presto/seeds/draft-1.html`, `draft-2.html`, `draft-3.html`. Each file is 200-400 lines, opens in a browser as-is, and contains a real palette in OKLCH, a real type system, a real hero, and 2-4 real component sections.
4. The three angles are fixed (and `angle_override` in autonomous mode picks one of them):
   - Draft 1 — safe brand-default. The expected, well-executed answer.
   - Draft 2 — anti-default contrarian. Inverts the obvious move (e.g. if it "should" be dark + neon, makes it warm paper + ink).
   - Draft 3 — wildcard overcommit. Pushes one dimension all the way (typography-as-art, monospace-everything, brutalist grid, etc.).
5. When the workflow returns, you have metadata for each draft: name, scene sentence, palette, type pairing, file path.
6. In multi-draft modes, tell the user: "3 drafts ready. Open them at `presto/seeds/draft-1.html`, `draft-2.html`, `draft-3.html`." In autonomous mode, skip the announcement and auto-advance straight to HAND-OFF.

### Phase 3 — PRESENT

**Skipped entirely in AUTONOMOUS mode.** Only one draft exists; the single file auto-advances to HAND-OFF without comparison or pick. KEYWORDS and GUIDED modes run PRESENT normally.

1. Print a compact comparison. One row per draft, columns:
   - `#` (1, 2, 3)
   - `name` (short, evocative; the drafter agent set this)
   - `scene sentence` (one line, describes the feeling, not the features)
   - `palette` (3-5 OKLCH values or hex equivalents inline)
   - `type` (display / body pair)
   - `file` (the path to open)
2. Example row:
   > `2 | Paper Lab | Like reading a hand-set zine that knows about computers | oklch(0.97 0.02 80) / oklch(0.18 0.02 280) / oklch(0.62 0.18 25) | Tiempos Headline / iA Writer Mono | presto/seeds/draft-2.html`
3. Ask via AskUserQuestion: "Which draft becomes the starting point?" Options: "Draft 1", "Draft 2", "Draft 3", "Remix".
4. If the user picks "Remix", ask one follow-up free-text question for the remix instruction (e.g. "1's palette with 2's layout"). Read both source drafts, write the combined version to `presto/seeds/draft-remix.html`, then re-present that as the chosen draft.
5. If the user replies with their own free-form direction instead of an option, follow it. They are always right about what they want.
6. Do not advance past PRESENT until you have a single chosen file path.

### Phase 4 — REFINE LOOP

**Skipped entirely in AUTONOMOUS mode.** There is no user to iterate with; the single draft proceeds untouched to HAND-OFF. KEYWORDS and GUIDED modes run REFINE LOOP normally.

1. With the chosen draft set, ask via free-form: "What should change before this becomes the starting point?"
2. Listen for one or more discrete change requests. Apply each via the Edit tool directly on the chosen draft file in `presto/seeds/`. Never rewrite the whole file unless the user asks for it.
3. After applying, print a one-line diff summary: "Bumped display to 88px, swapped accent to OKLCH(0.62 0.18 250), tightened section padding."
4. Ask: "Anything else, or is this the starting point?"
5. Loop. Track the count. If you hit 8 rounds, gently suggest one of:
   - Hand off now and let /magic's later phases keep refining.
   - Re-roll a fresh draft set with the latest learnings folded in.
6. Stop on any clear confirmation: "ship it", "this is good", "lock it in", "yes", "perfect", "hand off".

### Phase 5 — HAND-OFF

**Runs in all three modes.** The DESIGN_APPROACH.md it writes must always include a `## Mode` field with value `autonomous` | `keywords` | `guided` so /magic's downstream phases can tell how the seed was produced.

1. In autonomous mode, the "chosen draft" is the single generated `draft-1.html`. In keywords / guided modes, it is whichever draft the user picked (or the remix).
2. Copy the chosen, refined draft file to `presto/seeds/starter.html` via Write (reading the source first via Read).
3. Extract the `:root { ... }` block (custom properties) from the starter into `presto/seeds/tokens.css`. Preserve OKLCH values exactly. Group by role: color, type, space, motion, radius.
4. Write `presto/memory/DESIGN_APPROACH.md` with this exact section order:
   - `# Design Approach`
   - `## Mode` — one of `autonomous`, `keywords`, `guided`. In autonomous mode, append the note: "Generated in autonomous mode, no user iteration. Angle: <chosen_angle>." In keywords mode, list the classified keywords. In guided mode, just state the mode name.
   - `## Scene sentence` — the chosen draft's one-liner.
   - `## Direction name` — the chosen draft's short name.
   - `## Embedded mood images` — relative paths (e.g. `- mood-1.png`) of any mood images the chosen draft actually embedded as `<img>` tags in the markup. Pull from the draft's `embedded_mood_images` metadata field. If none were embedded, write `- (none — drafter chose not to embed any mood image; /magic Build is free to author imagery from scratch)`. Include a leading line: "These relative paths appear as <img src=\"...\"> in starter.html and MUST be preserved by downstream /magic Build (do not strip; if rewriting the surface they live on, keep the <img> tag in place)."
   - `## Palette (OKLCH)` — table of role -> OKLCH value -> hex fallback.
   - `## Type` — display family, body family, weights used, scale.
   - `## Dials` — inferred VARIANCE / MOTION / DENSITY values (0-100) with one-line justification each.
   - `## References` — 2-5 reference sites or designers that informed the direction.
   - `## Anti-references` — 2-5 things this direction is explicitly NOT.
   - `## Decisions` — bullet list of the meaningful choices made during refinement (autonomous mode: list the inference calls made instead).
   - `## Rejected alternatives` — the two unchosen drafts in keywords/guided modes, each with name + one-line "why not". In autonomous mode, list the two angles NOT chosen with a one-line "why not chosen for this run".
5. Confirm to the user: "Hand-off complete. starter.html, tokens.css, and DESIGN_APPROACH.md are written. /magic can now run on top."
6. Exit houdini.

## Example refine-loop transcript

Use this as a template for tone and pace:

> Houdini: What should change before this becomes the starting point?
> User: The display is too small and the green is too saturated.
> Houdini: (edits draft-2.html, bumps `--type-display` from 72px to 96px, drops accent chroma from 0.18 to 0.13.)
> Houdini: Bumped display to 96px; toned accent green from oklch(0.65 0.18 145) to oklch(0.65 0.13 145). Anything else, or is this the starting point?
> User: Lock it in.
> Houdini: (advances to HAND-OFF.)

Keep the loop short, descriptive, and concrete. Always name what changed in the diff summary.

## Palette family axis

Every draft now commits to one of eight named OKLCH palette **families**, perpendicular to the `angle` axis. `angle` controls vibe and conviction; `palette_family` controls the color world. The two compose freely: `angle=wildcard` + `palette_family=phosphor-terminal` is a deliberately overcommitted phosphor-green world; `angle=safe` + `palette_family=warm-editorial` is a tasteful cream-and-ink page.

The eight families, with brief descriptors (full briefs live in `workflows/houdini.js → PALETTE_FAMILIES`):

| Key | Label | World |
|---|---|---|
| `industrial-mono` | Industrial monochrome | Hardware schematics, NASA reports — grayscale ladder + one cold accent. |
| `warm-editorial` | Warm editorial | Print magazines, playbills — ink on warm paper with one spot color. |
| `electric-acid` | Electric / acid | Rave flyers, FACT magazine — black ground + one over-saturated accent. |
| `deep-jewel` | Deep jewel | Aesop, A24 — 2-3 mid-deep jewel tones at chroma 0.1-0.18. |
| `washed-pastel` | Washed pastel | Risograph zines, Japanese stationery — high-L low-C pastels sharing space. |
| `dichromatic-print` | Dichromatic print | Constructivist posters — exactly two saturated inks on cream. |
| `oxidized-metal` | Oxidized metal | Brutalist plazas — patina greens, aged brass, rust browns. |
| `phosphor-terminal` | Phosphor terminal | DEC VT220, oscilloscopes — CRT-black + single phosphor accent. |

### How the workflow resolves which family a run uses

Three states, in priority order (the workflow does this automatically; the skill does NOT have to compute it):

1. **OVERRIDE** — caller passed `--palette <value>`. Five shapes accepted:
   - `<family-key>` → use that family. If a lock exists, this OVERRIDES the lock for this run only; the file is not modified.
   - `none` → clear lock effect for this run only; explore-mode rotation re-engages.
   - Inline custom (`"ink:oklch(...),paper:oklch(...),..."` or `"oklch(...),oklch(...),..."` positional) → bypass any lock and force the inline tokens. The family is recorded as `"custom"`. There is no canonical brief — the drafter reads the OKLCH values themselves and composes type, motion, and density to feel correct for those colors specifically.
   - Prose (`"warm coral with complementing tones"`, `"muted forest with cream"`, `"Le Labo apothecary"`) → the workflow detects natural language and runs a translator agent that maps the prose into 3-6 OKLCH tokens, then proceeds as if the user had supplied them inline. The translator gets the brief + design read as context and enforces the impeccable bans regardless of how the prose phrases them. Both the original prose and the translator's one-line interpretation are preserved in `DESIGN_APPROACH.md`.
   - Anything else → parser logs a WARN and treats the flag as unset; run falls back to lock-or-explore.
2. **LOCKED** — `memory/PALETTE.json` exists. Drafter receives the locked tokens verbatim and must stay inside them. Anti-list dormant. This is the "project has committed" state. The lock's `family` field may be one of the eight known keys (full family brief is appended to the drafter's prompt) or `"custom"` (tokens are the only source of truth; drafter works from them alone).
3. **EXPLORE** — no override, no lock. Behavior depends on draft count:
   - Autonomous (1 draft) → workflow rotates deterministically against `memory/recent-palettes.json` (the anti-list of the last 5 chosen families). The rotation is seeded by hash of `brief + run_slug` so reruns are stable. Only the eight named families participate in rotation; `"custom"` entries are noted in the ledger but never auto-chosen.
   - Multi-draft (3 drafts) → each drafter picks a different family from the menu. The anti-list is passed as a "avoid drifting toward these" warning, not a hard exclusion.

### What the skill must do

- **Pass `palette` through verbatim** when the caller supplied `--palette`. The workflow does the lock-vs-override interpretation.
- **Do NOT pre-compute the palette family in the skill.** The workflow holds the authoritative resolution logic (lock probe + override merge + anti-list rotation). Pre-computing in the skill would create two sources of truth.
- **In HAND-OFF, surface the resolved family + state in `DESIGN_APPROACH.md`** via the `## Palette family — <key>` section. The autonomous-mode hand-off (in `workflows/houdini.js`) already writes this. If you are running the skill-driven HAND-OFF for guided/keywords mode, mirror the same field by reading what the drafter committed to and noting the state explicitly.

### Recent-palettes ledger

`memory/recent-palettes.json` is the anti-list. It's auto-updated by the autonomous hand-off only (rotation produces drift WITHOUT needing user input). For guided/keywords runs, the skill SHOULD append to this file on HAND-OFF — read the existing array, prepend `{ family: <chosen-key>, run_slug: $RUN_SLUG, via: "houdini-<mode>" }`, keep the first 5 entries, write back. This keeps the ledger meaningful across all modes.

### Locking, once you're sure

When the user picks a draft they want to live with for the project's lifetime, suggest `/set-palette from-seed` after HAND-OFF. This pulls the family + tokens out of the just-written `seeds/tokens.css` and writes `memory/PALETTE.json`. After that, every `/magic` run honors the lock and AUDIT enforces no drift.

## Rules every draft must honor

Each drafter agent already has these baked in, but verify on hand-off:

- Color in OKLCH. No raw HSL, no raw RGB as the source of truth.
- Banned defaults: AI-purple (the indigo-violet gradient hero), beige + brass "premium consumer", cream-by-default, generic glass-morphism.
- Hero discipline: one hero, one primary CTA, no eyebrow-then-headline-then-subhead-then-CTA stack of four.
- Max one eyebrow per three sections.
- No Inter as the default sans. Pick something with a point of view.
- Emil's easing curves baked in as custom properties:
  - `--ease-out: cubic-bezier(0.23, 1, 0.32, 1);`
  - `--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);`
  - `--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);`
- Every `:active` interactive element uses `transform: scale(0.97)` with a 120-160ms transition.
- `@media (prefers-reduced-motion: reduce)` block present and respected.
- No gradient text by default. No side stripes by default. No glass cards by default.

## Mode behavior cheat sheet

| Mode       | Trigger                                                    | TUNE IN                                              | DRAFT count | PRESENT  | REFINE   | HAND-OFF                              |
|------------|------------------------------------------------------------|------------------------------------------------------|-------------|----------|----------|---------------------------------------|
| AUTONOMOUS | args start with `--` or contain `--auto` token             | Inference only, no questions, extract chosen_angle   | 1           | skipped  | skipped  | runs; mode=`autonomous` + angle noted |
| KEYWORDS   | comma-separated short tokens (2-6, each < 30 chars)        | Parse + classify; one disambiguation question only if keywords conflict | 3 (keywords threaded into each drafter) | runs     | runs     | runs; mode=`keywords` + keywords listed |
| GUIDED     | empty args OR sentence-shaped brief (default)              | Full conversational hypothesis; up to 2 surgical questions | 3       | runs     | runs     | runs; mode=`guided`                   |

### Modifier: `--nogen` (skip_image_gen=true)

| Mode + `--nogen` | What changes vs the base mode                                                                                       |
|------------------|---------------------------------------------------------------------------------------------------------------------|
| AUTONOMOUS       | Same flow, MoodBoard phase skipped. Single drafter gets empty `visual_direction_summary` and `mood_board: []`.       |
| KEYWORDS         | Same flow, MoodBoard phase skipped. All three drafters get empty visual direction; keywords + design_read carry it.  |
| GUIDED           | Same flow, MoodBoard phase skipped. All three drafters get empty visual direction; brief + design_read carry it.     |

### Modifier: `--gen[-N]` (mood_board_count=N, default 3, cap 1-5)

| Mode + `--gen-N` | What changes vs the base mode                                                                                                |
|------------------|------------------------------------------------------------------------------------------------------------------------------|
| ALL modes        | MoodBoard authors EXACTLY N prompts across an ordered vantage list (hero / lifestyle / detail / atmosphere / texture-fragment, in that order). Writes `seeds/mood-1.png` through `seeds/mood-N.png`. N=1 keeps only hero; N=5 uses all five vantages. |

### Modifier: `--useimg[-N]` (embed_images=N, defaults: autonomous→2, others→0)

| Mode + `--useimg-N` | What changes vs the base mode                                                                                            |
|---------------------|--------------------------------------------------------------------------------------------------------------------------|
| ALL modes           | Drafter prompt receives explicit `EMBED PERMISSION: you may embed up to N mood images …`. Drafter MAY (not must) place `<img src="mood-K.png">` tags using relative paths. When the drafter does embed, the HAND-OFF phase writes the embedded relative paths into `## Embedded mood images` in `DESIGN_APPROACH.md` so downstream `/magic` Build preserves them. |
| AUTONOMOUS (default)| N=2 by default — autonomous mode is the only place useimg is implicit. Pass `--useimg-0` to force no embed.              |
| KEYWORDS / GUIDED   | N=0 by default — useimg must be explicit. Useful when the app is image-centric (gallery, portfolio, content app).        |

## Anti-patterns

Houdini must NOT:

- Produce an abstract written description of a direction in place of a concrete HTML draft. Code first, words after.
- Dump 5+ questions on the user during TUNE IN. Cap at 2.
- Refine forever. Cap at 8 rounds, then propose hand-off.
- Invent a direction with no scene sentence. The sentence is the contract.
- Skip references and anti-references in the hand-off doc.
- Ship cream, beige, or AI-purple as a default.
- Treat the workflow as a research step. The workflow makes artifacts, not memos.
- Edit files outside `presto/seeds/` and `presto/memory/` during refinement.

## Reading the dials from a chosen draft

When writing the `## Dials` section of DESIGN_APPROACH.md, infer 0-100 values from the chosen draft:

- VARIANCE — how much each section differs from the last. Read it from the draft. If all sections share padding, type scale, and color treatment, score low (20-40). If sections rotate between dark and light, change grid systems, and use distinct type treatments, score high (70-90).
- MOTION — total motion budget. Read CSS. If the draft only animates on hover and entrance, score low (20-40). If it has scroll-linked effects, marquee, parallax, or section-stitched timelines, score high (70-90).
- DENSITY — information per viewport. Count primary elements above the fold. Sparse hero with one headline and one CTA: 20-40. Packed dashboard or data-grid: 70-90.

Each dial gets a one-line justification. Example:
> VARIANCE: 65 — alternating dark/light sections with two distinct grid systems.

## Hand-off contract

Once houdini exits, /magic's Stack and Build phases can assume:

- `presto/seeds/starter.html` exists, opens in a browser, and represents the agreed starting point.
- `presto/seeds/tokens.css` exists and contains the custom-property tokens grouped by role.
- `presto/memory/DESIGN_APPROACH.md` exists and contains the scene sentence, palette, type, dials, references, anti-references, decisions, and rejected alternatives.
- The user has seen and confirmed the chosen direction.
- The draft files `draft-1.html`, `draft-2.html`, `draft-3.html` (and possibly `draft-remix.html`) remain in `presto/seeds/` as historical artifacts. Stack and Build should not modify them; they may read them.

Downstream phases refine against `starter.html`. Houdini does not run again unless the user explicitly restarts the blank-canvas flow.

## Notes for the agent running this skill

- You are the orchestrator. The workflow at `presto/workflows/houdini.js` is a tool; it does the parallel drafting, but you own the conversation.
- Bias toward action. The user opened houdini because they want artifacts to react to, not a meeting.
- Always cite paths the user can click. `presto/seeds/draft-2.html` is more useful than "the second one".
- If a step fails (workflow errors, file write fails), tell the user plainly what failed and ask how to proceed. Do not silently retry.
- Houdini ends cleanly. State "hand-off complete" and stop. Do not start running /magic on your own.
