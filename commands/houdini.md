---
name: houdini
description: "Creative partner for the blank page. Three modes: guided conversational flow (default), --auto for a zero-question solo run, or comma-separated keywords as a Design Read seed. Four orthogonal modifiers: --nogen (skip MoodBoard entirely), --gen[-N] (override mood image count, default 3, cap 5), --useimg[-N] (let drafter embed N mood images, default 2 in autonomous, off otherwise), --palette <family|none> (force a palette family for this run, or 'none' to ignore an existing lock). Drafts real starter HTML and hands off starter.html + DESIGN_APPROACH.md to /magic."
argument-hint: "[brief | --auto [safe|contrarian|wildcard] | \"kw1, kw2, kw3\"] [--nogen | --gen[-N]] [--useimg[-N]] [--palette <family|none>]"
---

# /houdini — fill the blank canvas

`/houdini` is the only phase in the presto plugin that's allowed to invent. Every other `/magic` phase refines, audits, or polishes an existing artifact. Houdini materializes direction as a concrete artifact — actual openable HTML drafts, not a brief — so the rest of the flow has something real to push on.

Inspired by impeccable.style/designing: "craft codes toward a concrete image, not an abstract brief; that is the step change."

## Pre-run setup (every invocation, before mode detection — DO THIS FIRST)

**THIS BLOCK IS A HARD GATE. Execute steps 1–3 via the Bash tool BEFORE invoking the houdini workflow. The workflow throws on startup if `project_root` is missing or empty. Do NOT guess the cwd, do NOT use a remembered path, do NOT use the presto plugin install location.**

### Step 1 — Capture the live cwd

Run this Bash command verbatim and capture stdout:

```sh
pwd
```

Assign the result to `PROJECT_ROOT`. It MUST be an absolute path. Echo back to the user: `presto: running in <PROJECT_ROOT>` so they can verify before the run kicks off. If `PROJECT_ROOT` does not match where the user expects to be working, STOP and ask before proceeding.

### Step 2 — Lazy-init working dirs

```sh
mkdir -p "$PROJECT_ROOT/seeds" "$PROJECT_ROOT/memory" "$PROJECT_ROOT/outputs"
```

On first run in a project, log "presto: created seeds/ + memory/ + outputs/ in `$PROJECT_ROOT`".

### Step 3 — Generate `RUN_SLUG`

Format: `<brief-3-words-kebab-or-"auto">-YYYY-MM-DD-HHMM`. Take the first 3 word-tokens of the brief (after stripping flags), lowercase, non-alphanumeric → `-`, collapse repeats, trim leading/trailing `-`. Fall back to `auto` for empty briefs or `--auto` invocations. Append `-$(date +%Y-%m-%d-%H%M)`. Capture as `RUN_SLUG`.

### Step 4 — Pass both into the workflow

Every Workflow tool invocation in this command MUST include the captured literal values in args:

```json
{ "project_root": "<PROJECT_ROOT value from step 1>",
  "run_slug": "<RUN_SLUG value from step 3>",
  ... }
```

If either is omitted or empty, the workflow throws on startup. No silent fallback.

## Mode detection

Load the houdini skill at `skills/houdini/SKILL.md` and follow its instructions. The skill detects mode from `$ARGUMENTS` (autonomous if it starts with `--auto`; keywords if it's a comma-separated short-token list; guided otherwise) and orchestrates accordingly.

## Modifier flags (orthogonal — compose with any mode)

**Parse order.** Before mode detection, scan `$ARGUMENTS` for the three modifiers below in this order, stripping each match (token + surrounding whitespace) as it is found. After all three have been processed, the residue is the brief (or empty in `--auto` / keyword modes).

### `--nogen`

Literal token. If present: set `skipImageGen = true` and pass `skip_image_gen: true` to the workflow. The MoodBoard phase is skipped entirely (no nanogen calls, no images written to seeds/) and drafters work from brief + design_read + creative directive alone. Use when Gemini quota is exhausted, when iterating fast (~15s saved), for text-only exploration, or cost-sensitive batch runs.

### `--gen[-N]` (alias: `--gen N`, `--gen=N`)

Optional N (integer). Overrides the number of mood-board images generated. Default 3, hard-capped at 5, floor 1. If present without an N, the default 3 is used (i.e. no-op, but legal). Pass `mood_board_count: <N>` to the workflow. If both `--nogen` and `--gen` are present, `--nogen` wins (nothing generated) and `--gen` is silently ignored.

Examples: `--gen-5`, `--gen 4`, `--gen=2`. `--gen-9` → clamped to 5 with a log line.

### `--palette <family|none|custom>` (alias: `--palette=<value>`, `--palette-<value>`)

Forces the OKLCH palette for this run. Composes with any mode (autonomous / keywords / guided) and with the other modifiers. Accepts four shapes:

**1. A family key.** One of the eight presets:

- `industrial-mono` — near-black on cool gray with one cold accent (~210-260 hue). Hardware schematics, NASA tech reports.
- `warm-editorial` — ink on warm paper at hue 70-90, one spot color. Print magazines, 1930s playbills.
- `electric-acid` — black background with one over-saturated accent at gamut edge. Rave flyers, FACT magazine.
- `deep-jewel` — 2-3 mid-deep jewel tones at chroma 0.1-0.18. Aesop, Le Labo, A24.
- `washed-pastel` — high-lightness low-chroma pastels sharing space. Risograph zines, Japanese stationery.
- `dichromatic-print` — exactly two saturated inks at distant hues on cream. Constructivist posters, Polish film bills.
- `oxidized-metal` — patina greens, aged brass, rust browns. Brutalist plazas, weathered marine signage.
- `phosphor-terminal` — CRT-black background, single phosphor accent (amber / P1 green / P3 white-blue). DEC VT220, oscilloscopes.

**2. The literal `none`.** Explicitly clear any existing `memory/PALETTE.json` lock effect for THIS run only (does not delete the file). Drafter falls back to explore-mode rotation. Useful when you want to try one off-direction without losing the lock.

**3. An inline custom palette — role:value pairs.** Format: `"role:oklch(...),role:oklch(...),..."`. Roles are arbitrary CSS custom-property names (leading `--` is stripped if present). Quote the whole flag value so the shell doesn't split on commas.

```
/houdini --auto --palette "ink:oklch(20% 0.04 280),paper:oklch(96% 0.01 80),accent:oklch(64% 0.22 145)"
```

The workflow synthesizes the family as `"custom"` and passes the tokens verbatim to every drafter. There is no canonical brief for a custom palette — the drafter reads the OKLCH values themselves (saturation, hue distance, contrast) and composes type, motion, and density to feel correct for those colors specifically.

**4. A bare positional OKLCH list.** Format: comma-separated OKLCH values, no role labels. The workflow assigns them to positional roles in order: `ink, paper, accent, accent-2, mute, line`. Useful for fast iteration when you just want to try a three-color palette.

```
/houdini --auto --palette "oklch(18% 0.012 60),oklch(94% 0.020 78),oklch(56% 0.21 27)"
```

Three values → `ink`, `paper`, `accent`. Four values → adds `accent-2`. Six is the max; extras are dropped.

**5. A natural-language description.** Format: any prose. The workflow detects that the value is neither a family key nor OKLCH-shaped, then invokes a translator agent that interprets the description into 3-6 OKLCH tokens using the brief and design read as context. The drafter receives the resolved tokens AND the translator's one-line interpretation, so you can verify how the prose was read.

```
/magic --surprise --palette "warm coral with complementing tones that evoke warmth"
/houdini --auto --palette "muted forest green with cream and one rust accent"
/houdini "fintech" --palette "the colors of a Hayao Miyazaki sunset over Tokyo"
/magic --surprise --palette "Le Labo apothecary — cream paper, espresso ink, one olive accent"
```

The translator enforces impeccable's bans regardless of how the prose phrases them: AI-purple, beige+brass, pure black-on-white, and Inter-flavored neutrals are redirected to the nearest legitimate equivalent and the substitution is called out in the interpretation. The resolved tokens flow downstream exactly like an inline custom palette — recorded in `DESIGN_APPROACH.md` with the original prose and the interpretation alongside.

Prose detection requires at least 6 characters and 4 word characters. Shorter strings ("rgb", "asdf") are rejected as invalid rather than translated. If the translator fails to produce ≥2 valid tokens, the run logs a WARN and falls back to lock-or-explore mode.

**Pass `palette: <value>` to the workflow as a string.** The workflow parses it into one of the four shapes. Parse order in this command: scan `$ARGUMENTS` for `--palette <value>` / `--palette=<value>` / `--palette-<value>` BEFORE mode detection. The `<value>` may contain quoted strings with commas and parentheses (e.g. `--palette "ink:oklch(...),paper:oklch(...)"`) — preserve the quoted region verbatim, then strip the matched tokens from args; capture the value (NOT lowercased — OKLCH literals are case-insensitive but role names may want camelCase or kebab-case).

If parsing fails (looks like a custom palette but no valid OKLCH values), the workflow logs a WARN and treats the flag as unset — the run continues in lock-or-explore mode rather than halting.

**Behavior matrix:**

| State | `--palette` set to | What happens |
|---|---|---|
| Lock present | unset | Drafter receives the locked tokens verbatim. Anti-list dormant. |
| Lock present | family name | Override: this run uses the named family. Lock file is NOT modified. |
| Lock present | `none` | Bypass: this run runs as if there were no lock. Anti-list re-engages. |
| Lock present | inline custom | Bypass with custom: this run uses the inline tokens. Lock file is NOT modified. |
| Lock present | prose | Bypass with translated tokens: prose → translator → tokens, used for this run. Lock file is NOT modified. |
| No lock | unset | Explore mode (rotation / multi-draft variance). |
| No lock | family name | This run uses the named family. Recent-palettes ledger updated. |
| No lock | `none` | No-op (nothing to bypass) — same as "no lock, unset". |
| No lock | inline custom | This run uses the inline tokens. `family` recorded as `"custom"` in the ledger. |
| No lock | prose | Translator interprets prose into tokens. `family` recorded as `"custom"` with the prose preserved in DESIGN_APPROACH.md. |

**Examples:**

```
/houdini --auto --palette industrial-mono              # autonomous wildcard, force industrial-mono
/houdini "fintech, dark" --palette electric-acid       # keywords mode, force acid palette
/houdini --auto --palette none                          # autonomous, bypass any existing lock
/houdini build a marketing page --palette deep-jewel    # guided, all 3 drafts use deep-jewel
/houdini --auto --palette "ink:oklch(20% 0.04 280),paper:oklch(96% 0.01 80),accent:oklch(64% 0.22 145)"
                                                       # autonomous, custom 3-token palette
/houdini --auto --palette "oklch(18% 0.012 60),oklch(94% 0.020 78),oklch(56% 0.21 27)"
                                                       # autonomous, positional 3-color palette
```

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
