# presto

A Claude Code plugin that stacks three production-grade design skills (impeccable, design-taste-frontend, emil-design-eng) into one composable workflow. Run `/magic` to go end to end, run `/houdini` to fill the blank canvas with a real starter template, or invoke any of six standalone break-out commands for surgical control.

> **v0.1.7** — major resource-management refactor + flag expansion. Two new top-level dirs (`seeds/` active workspace, `outputs/<slug>/` per-run archive), four new flags (`--useimg`, `--gen`, `--use <slug>`, `--nohoudini`), houdini now auto-detects user-supplied resources in `seeds/` (BYO assets — no need to nanogen-generate everything), and embedded mood images are now preserved by `/magic` Build. presto is per-project: drop the plugin into any project and it creates the working dirs on first run. See [What's new in v0.1.7](#whats-new-in-v017) below.

---

## Table of contents

1. [What presto is](#what-presto-is)
2. [Why three skills, one workflow](#why-three-skills-one-workflow)
3. [Install](#install)
4. [Quick start](#quick-start)
5. [The /magic command](#the-magic-command)
6. [The /houdini creative partner](#the-houdini-creative-partner)
7. [Break-out commands](#break-out-commands)
8. [The eight phases](#the-eight-phases)
9. [Memory model](#memory-model)
10. [Hand-off artifacts](#hand-off-artifacts)
11. [Conflict resolution](#conflict-resolution)
12. [Repository layout](#repository-layout)
13. [The decks](#the-decks)
14. [Architecture notes](#architecture-notes)
15. [Plugin manifest](#plugin-manifest)
16. [Extending](#extending)
17. [Inspirations and credits](#inspirations-and-credits)
18. [What's new in v0.1.7](#whats-new-in-v017)

---

## What presto is

presto packages three independent design skills into one orchestrated flow:

- **impeccable** — project altitude. Loads `PRODUCT.md` / `DESIGN.md` context, picks brand-vs-product register, owns palette strategy and the AI slop test. 25 sub-commands available via passthrough.
- **design-taste-frontend** — page altitude. Sets the one-line Design Read, three dials (VARIANCE / MOTION / DENSITY), the stack pick (real design system if one fits), and the mechanical Pre-Flight Check matrix.
- **emil-design-eng** — component altitude. Animation Decision Framework, named easing curves, transform-origin awareness, asymmetric enter/exit timing, mandatory review-as-markdown-table format.

These three skills are independently excellent but each leaves a gap. impeccable doesn't dictate page-level grammar. taste doesn't drill into per-component motion. emil never operates above the component. presto sequences them so each owns the altitude where it is sharpest, with explicit conflict-resolution rules where they overlap.

presto adds a fourth skill of its own — **houdini** — to fill the one gap none of the three solve: the cold start. Every other phase refines, audits, or polishes an existing artifact; houdini is the only phase allowed to invent.

---

## Why three skills, one workflow

Each skill is rigorous, but each leaves a real gap that the others fill:

| | impeccable | design-taste-frontend | emil-design-eng |
|---|---|---|---|
| **Altitude** | project | page | component |
| **Owns** | register, palette strategy, lifecycle, slop test | Design Read, dials, stack, Pre-Flight matrix | animation decisions, easing, transform-origin, review table |
| **Strong at** | establishing context and tone for a whole product | matching a page brief to a known-good system | making interactions feel correct in aggregate |
| **Weak at** | per-page grammar and per-component polish | project-wide register and tokens | anything above the component |

When the three are composed, the gaps line up with the strengths of the others. The composition itself is presto.

---

## Install

```
/plugin marketplace add brianyu18/presto
/plugin install presto@presto
```

The plugin self-marketplaces, so the same repo serves both roles. After installation, restart Claude Code (or run `/plugin reload`) and the seven slash commands plus four skills appear in the palette. presto is self-contained — the three source skills are bundled inside `skills/` along with houdini.

---

## Quick start

**presto is per-project.** Drop into any project, run `/magic` or `/houdini`, and presto lazy-creates `seeds/`, `memory/`, and `outputs/` in the current working directory. No global state. Run it again in a different project and you get a fresh set of dirs there.

### Zero-prompt, max-surface validation run

The single command that exercises the most of presto in one shot:

```
/magic --surprise --useimg-2 --gen-4 "build a portfolio for a sound designer"
```

Lazy-init dirs → generate run slug → houdini autonomous (4 mood images) → drafter may embed up to 2 → magic Read..Build (preserves embeds) → Polish → Audit → Finalize moves seeds/ + memory/ into `outputs/<slug>/`. You get a clean working dir at the end and a permanent run archive.

### Common patterns

```
/magic --surprise <intent>                        # zero prompts, autonomous
/magic <intent>                                   # one prompt (cold-start gate), then autonomous
/magic --guided <intent>                          # pause for approval at every phase

/magic --nohoudini <intent>                       # I have my own seed in seeds/; skip cold-start
/magic --use <slug> <intent>                      # re-run on a prior outputs/<slug>/ archive

/houdini                                          # cold-start (asks mode), writes hand-off
/houdini --auto <intent>                          # autonomous, single wildcard draft
/houdini "fintech, dark, terminal"                # keywords mode, 3 drafts
/houdini --nogen <intent>                         # skip nanogen (text-only direction)

/design-audit src/components/Hero.tsx             # pre-flight + slop + emil review on existing code
```

### Image-side flags (orthogonal; compose with any mode)

| Flag | What | Default |
|---|---|---|
| `--nogen` | Skip the MoodBoard phase entirely (no nanogen calls) | off |
| `--gen[-N]` | Override mood-board image count (1–5) | 3 |
| `--useimg[-N]` | Let the drafter embed up to N mood images as `<img>` tags | autonomous→2, others→0 |

Three syntactic forms each: `--gen-4`, `--gen 4`, `--gen=4`. Bare `--useimg` defaults to 2; `--useimg-0` explicitly disables. Safety: workflow auto-bumps `--gen` if `--useimg N > 3` and `--gen` wasn't set; clamps `--useimg` to `--gen` with WARN if both are explicit and conflict; `--nogen` wins over `--useimg`.

### Bringing your own seed resources

presto's MoodBoard auto-detects user-supplied files in `seeds/`. Drop reference images, brand assets, or screenshots in `seeds/` *before* running `/houdini` or `/magic`. Anything that isn't a workflow-owned filename (`mood-1.png`–`mood-5.png`, `draft-1.html`–`draft-5.html`, `starter.html`, `tokens.css`) is treated as a primary visual reference. There is NO quantity cap.

Behavior when user resources are present:

| Flag combo | Behavior |
|---|---|
| User refs only (no `--gen`) | nanogen is skipped; refs become the mood board (describe extracts palette + tags) |
| User refs + `--gen-N` | Augment: refs are moods 1..K; nanogen generates N additional moods referencing your inputs |
| User refs + `--nogen` | refs-only describe; no generation |
| No user refs | Pure nanogen path (original behavior) |

Then run `/magic --nohoudini "redesign as a calmer dashboard"` to skip the cold-start gate entirely and have magic Build directly on your seed.

---

## The /magic command

`/magic` is the canonical composition. Nine phases in linear order, with one explicit owner per phase. Five invocation modes.

### Five modes

| Mode | Invocation | Prompts | Best for |
|---|---|---|---|
| `--surprise` | `/magic --surprise <intent>` | 0 prompts end to end | Speed; reacting to a finished design from a fresh start |
| default | `/magic <intent>` | 1 prompt (cold-start gate) | Balanced; confirm the seed, then run |
| `--guided` | `/magic --guided <intent>` | 7 prompts (1 gate + 6 phase approvals) | High-stakes; oversight at every phase |
| `--nohoudini` | `/magic --nohoudini <intent>` | 0 prompts | You've manually placed seed assets in `seeds/`; skip the cold-start gate |
| `--use <slug>` | `/magic --use <slug> <intent>` | 0–1 prompts (only on seed conflict) | Iterate on a prior `outputs/<slug>/` archive |

**Mutual exclusion rules:**
- `--use` beats `--surprise` (you've named a seed; don't generate a new one). Override logged.
- `--surprise` beats `--nohoudini` (surprise must run houdini). Override logged.
- `--use` implies `--nohoudini` (your seed is in place; cold-start gate is moot).
- `--surprise` and `--guided` together → `--surprise` wins (more decisive bypass). Override logged.

**Image-side flags** (`--nogen`, `--gen[-N]`, `--useimg[-N]`) are orthogonal to mode flags and compose with any of them; they propagate verbatim to every `/houdini` invocation this command triggers. See [Quick start](#quick-start) for the safety semantics.

**`--use <slug>` iteration prompt.** When `--use <slug>` is invoked over a non-empty `seeds/`, presto asks: Merge (keep current + copy slug) / Orphan (move current to `outputs/_orphans/<timestamp>/` then copy slug) / Abort. If `seeds/` is empty, no prompt.

### What happens in each mode

**`--surprise` (bypass).** The command parses `--surprise`, strips it from the intent, and directly invokes the houdini workflow with `{ autonomous: true, n_drafts: 1, angle_override: 'wildcard' }`. The houdini workflow generates a single wildcard draft and writes the three hand-off artifacts (`memory/DESIGN_APPROACH.md`, `seeds/starter.html`, `seeds/tokens.css`). The command then launches the magic workflow. Phase 0 finds the seed and skips, proceeding through phases 1 through 7 without interruption.

**Default conversational.** The command launches the magic workflow. Phase 0 detects cold-start (intent matches `/new|fresh|blank|redesign|rebrand|from scratch|cold start/i` AND `memory/DESIGN_APPROACH.md` is absent) and returns `{ halted_for_houdini: true }`. The command catches that return and uses `AskUserQuestion` to ask: Yes, run `/houdini` / No, proceed without it / Customize args. On Yes, `/houdini` is invoked conversationally; its TUNE IN step asks which mode. When houdini completes its hand-off, the command re-launches the magic workflow which now finds the seed and proceeds. On No, the command re-launches with `startHook: 'off'` and Read proceeds without a seed. On Customize, the command collects custom houdini args before invoking.

**`--guided`.** The command launches the magic workflow with `mode: 'phase-only'` and `skipTo: 'Read'`, getting just the Read output. It surfaces a digest of the output and asks Approve / Revise / Skip / Abort. On Approve, it launches the next phase. On Revise, it collects feedback text and re-launches the same phase with the feedback appended. On Skip, it moves on without applying. On Abort, it stops. Repeats for Context, Dials, Stack, Build, Polish. AUDIT runs at the end as the gate without a pre-pause.

---

## The /houdini creative partner

houdini exists because every other phase of `/magic` assumes a design direction already exists. For net-new work there is no direction yet, so the model falls back to training-data defaults — the exact failure all three skills warn about. houdini is the explicit step that produces direction *before* refinement begins.

Quoting impeccable.style: *"craft codes toward a concrete image, not an abstract brief; that is the step change."* houdini drafts real openable HTML — not descriptions of a design, actual files — then iterates with you until the blank canvas is filled.

### Three modes

| Mode | Trigger | Behavior |
|---|---|---|
| AUTONOMOUS | `/houdini --auto` or `/houdini --auto [safe\|contrarian\|wildcard]` | Zero questions, one draft, no PRESENT, no REFINE, immediate hand-off. Default angle: wildcard. |
| KEYWORDS | `/houdini "kw1, kw2, kw3"` (2-6 short tokens) | Parses keywords as Design Read seed, asks at most one disambiguation question on conflict, generates 3 drafts. PRESENT and REFINE run normally. |
| GUIDED | `/houdini [brief]` or empty | Full conversational 5-phase flow. Default. |

The skill detects mode from arg shape: `--auto` first, then the comma-list shape, else defaults to guided. When invoked without an explicit mode (just a sentence or empty), TUNE IN asks via `AskUserQuestion` at the start. Power-user shortcuts via args bypass the question.

**`--nogen` modifier.** Orthogonal to the three modes — composes with any of them (e.g. `/houdini --nogen`, `/houdini "fintech, dark" --nogen`, `/houdini --auto wildcard --nogen`). When present, the MoodBoard phase is skipped entirely; no images are generated and drafters proceed with brief + design_read alone. Use when you've hit Gemini's image-gen quota, want faster iteration (skip ~15s of mood-board generation), are exploring text-only direction, or are running cost-sensitive batches.

### Six phases

```
TUNE IN -> MOOD -> DRAFT -> PRESENT -> REFINE -> HAND-OFF
```

- **TUNE IN** — read the brief, scan existing context, form a Design Read hypothesis. Ask at most two questions, and only if genuinely ambiguous.
- **MOOD** (MoodBoard) — generate 3 inspiration images via nanogen, then describe each (palette + style tags). The output is a `visual_direction_summary` that anchors the drafters. Mood images are NOT embedded in HTML; they exist only as visual direction. Mode-aware: autonomous derives 3 prompts itself from brief + design_read; keywords mode uses the keywords as the primary signal; guided mode optionally accepts `args.visual_brief` collected during TUNE IN to seed the prompts. Skipped entirely when `--nogen` is set.
- **DRAFT** — fan out drafter agents in parallel (3 in guided/keywords mode, 1 in autonomous mode). Each writes a self-contained `seeds/draft-N.html` with a distinct creative angle: safe brand-default, anti-default contrarian, wildcard overcommit. Real OKLCH palette, real type system, real hero, real components. Drafters receive the `visual_direction_summary` from MOOD when available, otherwise fall back to text-only direction.
- **PRESENT** — show the drafts with one-line scene each. Pick one, or remix (e.g., "1's palette with 2's layout").
- **REFINE** — conversational loop. You say what should change; houdini edits the chosen draft in place and re-presents. Repeats until you say "this is the starting point."
- **HAND-OFF** — write `memory/DESIGN_APPROACH.md` (chosen direction, decisions, palette, type, dials inference, refs, anti-refs, what was rejected and why), `seeds/starter.html` (the final draft), and `seeds/tokens.css` (extracted custom-properties).

In autonomous mode, PRESENT and REFINE are skipped. The single draft auto-advances to HAND-OFF. The workflow itself writes the hand-off artifacts because there is no skill driving the conversation.

### Why a skill, not just a workflow

Workflows spawn autonomous subagents that cannot pause for `AskUserQuestion`. houdini's PRESENT and REFINE phases need conversation. So houdini is structured as a **skill** that owns the conversation in the main loop, calling a **workflow** only for the parallel DRAFT phase. This is why `presto/skills/houdini/SKILL.md` exists alongside `presto/workflows/houdini.js`.

---

## Break-out commands

The break-out commands are first-class. `/magic` is one composition; the others are independent primitives. Each runs standalone with no requirement that `/magic` has ever been invoked.

| Command | Consumes | Produces | Standalone use |
|---|---|---|---|
| `/houdini [args]` | the brief you pass | `memory/DESIGN_APPROACH.md`, `seeds/starter.html`, `seeds/tokens.css` | Cold-start a design |
| `/design-read` | the intent you pass | `memory/DESIGN_READ.md` | Written one-line Design Read + kind/audience/vibe |
| `/set-dials` | optional brief + overrides | `memory/DIALS.json` | Explicit VARIANCE/MOTION/DENSITY for any build |
| `/set-palette <family\|none\|from-seed>` | family-key, `none`, or `from-seed` | `memory/PALETTE.json` | Commit / replace / clear the palette lock |
| `/palette-status` | nothing (read-only) | stdout report | Inspect current palette state before a run |
| `/design-flow [feature]` | `memory/DESIGN_READ.md` + `memory/DIALS.json` (asks if absent) | code in your project | Build one feature without re-running the full flow |
| `/design-audit [target]` | the target file or directory | `memory/last-audit.json` (Pre-Flight + slop test + emil review) | Check existing code against the three skills' rules |
| `/design-review` | uncommitted + staged git diff | inline markdown table | Emil's eyes on a change before commit |
| `/imagen "<prompt>"` | a text prompt | one image file via nanogen | Generate a single reference image with anti-slop prompt patterns applied |
| `/imagen-edit <path> "<instruction>"` | an existing image + an instruction | a modified image file via nanogen | Warm a palette, swap an angle, change lighting without losing composition |

Each command is invokable directly. None requires `/magic`. None blocks waiting on another. The state in `memory/` is shared, so `DESIGN_READ.md` written by `/design-read` is consumed by `/design-flow` exactly as it is by `/magic`.

**The shape of presto is eight primitives plus one composition.** `/magic` chains the primitives in a known-good order with a cold-start guard and a final audit gate. The primitives themselves do not know `/magic` exists. presto degrades cleanly: even if `/magic` breaks, every break-out keeps working.

Plus `/impeccable [cmd]` as a passthrough to any of impeccable's 25 sub-commands (`craft`, `shape`, `polish`, `audit`, `harden`, etc.).

---

## The palette state machine

The single biggest source of design sameness across runs is palette drift toward whatever the model's training data says "premium" looks like. presto encodes a three-state machine — **EXPLORING**, **LOCKED**, **OVERRIDDEN** — so that early runs surface variance, mature projects enforce consistency, and one-off experiments don't damage either.

### The three states

| State | Trigger | What `/houdini` does | What `/magic` does |
|---|---|---|---|
| **EXPLORING** | no `memory/PALETTE.json` | Rotates through the 8 palette families. In `--auto`, deterministic rotation against the anti-list (last 5 chosen families in `memory/recent-palettes.json`). In multi-draft modes, each drafter picks a different family. | CONTEXT derives palette_strategy per-run. AUDIT does not run drift check. |
| **LOCKED** | `memory/PALETTE.json` exists | Drafters receive the locked OKLCH tokens verbatim and stay inside the family. Anti-list dormant. | CONTEXT treats the locked tokens as ground truth. AUDIT preflight enforces no drift: a `block`-severity finding if any built file redefines a locked role with a different OKLCH value. |
| **OVERRIDDEN** (per-run) | `--palette <family>` or `--palette none` on `/magic` or `/houdini` | Forces the named family (or clears the lock effect) for THIS run only. `memory/PALETTE.json` is NOT modified. | Same — override applies during this run; lock survives. |

### The eight palette families

Defined in `workflows/houdini.js → PALETTE_FAMILIES`:

| Key | Label | World |
|---|---|---|
| `industrial-mono` | Industrial monochrome | Grayscale ladder + one cold accent. NASA reports, hardware schematics. |
| `warm-editorial` | Warm editorial | Ink on warm paper, one spot color. Print magazines, 1930s playbills. |
| `electric-acid` | Electric / acid | Black ground + one over-saturated accent at gamut edge. Rave flyers. |
| `deep-jewel` | Deep jewel | 2-3 mid-deep jewel tones (emerald / sapphire / amethyst / garnet) at chroma 0.1-0.18. Aesop, A24. |
| `washed-pastel` | Washed pastel | High-lightness low-chroma pastels sharing space. Risograph zines. |
| `dichromatic-print` | Dichromatic print | Exactly two saturated inks at distant hues on cream. Constructivist posters. |
| `oxidized-metal` | Oxidized metal | Patina greens, aged brass, rust browns. Brutalist plazas. |
| `phosphor-terminal` | Phosphor terminal | CRT-black ground + single phosphor accent (amber / green / blue-white). DEC VT220. |

### What `--palette <value>` accepts

The flag lives on both `/magic` and `/houdini`. Five shapes — the first two are presets, the next two are power-user OKLCH, the last is plain English (the default for most people):

1. **A family key** — e.g. `--palette deep-jewel`. Forces that family for the run. If a lock is present, the override wins for this run; the lock file is untouched. If no lock is present, the override pins the run to that family AND appends to the recent-palettes ledger so future explore runs rotate around it.
2. **`none`** — `--palette none`. Explicitly clears any existing lock effect for this run only. The lock file is NOT deleted. Useful when you want to try one off-direction without losing the commitment.
3. **Inline custom palette, role-labeled** — `--palette "ink:oklch(20% 0.04 280),paper:oklch(96% 0.01 80),accent:oklch(64% 0.22 145)"`. Roles are arbitrary; values must be OKLCH literals. Quote the whole value so the shell doesn't split on commas.
4. **Inline custom palette, positional** — `--palette "oklch(18% 0.012 60),oklch(94% 0.020 78),oklch(56% 0.21 27)"`. Assigned to roles `ink, paper, accent, accent-2, mute, line` in order (max 6).
5. **Plain English** — `--palette "warm coral with complementing tones that evoke warmth"` or `--palette "Le Labo apothecary — cream paper, espresso ink, one olive accent"`. The workflow detects prose and runs a translator agent that maps the description into 3-6 OKLCH tokens using the brief + design read as context. The translator enforces the impeccable bans regardless of how the prose phrases them: AI-purple, beige+brass, pure black-on-white, and Inter-flavored neutrals are redirected to the nearest legitimate equivalent. The original prose AND the translator's one-line interpretation are both preserved in `DESIGN_APPROACH.md` so you can verify how your prose was read.

Examples — prose covers the common case:

```sh
/magic --surprise --palette "warm coral with complementing tones that evoke warmth" \
  build a landing page for a yoga studio

/houdini --auto --palette "muted forest green with cream and one rust accent"

/magic --palette "the colors of a Hayao Miyazaki sunset over Tokyo" \
  rebuild the hero
```

When any custom-shaped palette is supplied (shapes 3, 4, 5), the workflow records `family: "custom"` in the recent-palettes ledger and in any downstream `DESIGN_APPROACH.md`. There is no canonical "world brief" for a custom palette — the drafter reads the OKLCH values themselves (saturation, hue distance, contrast) and composes type, motion, and density to feel correct for those colors specifically.

To **lock** a custom palette permanently rather than passing it per-run, use one of:

- `/set-palette prose "warm coral with complementing tones"` — plain English.
- `/set-palette custom "ink:oklch(...),paper:oklch(...),accent:oklch(...)"` — inline OKLCH.
- `/set-palette --from ./brand/tokens.css` — load from a CSS or JSON file.
- `/set-palette from-seed` — pull from the latest `/houdini` run's `seeds/tokens.css`.

Anything that isn't one of the five shapes is rejected; the workflow logs a WARN and treats the flag as unset (no halt). Prose detection requires at least 6 characters and 4 word characters, so single typos like `--palette rgb` log a WARN rather than burning a translator call.

### Memory files

```
memory/
├── PALETTE.json            ← the lock. { family, tokens, locked_at, source, notes }. Absent = EXPLORING.
└── recent-palettes.json    ← the anti-list. { recent: [{ family, run_slug, via }, …] }. Up to 5 entries.
```

`PALETTE.json` is written by `/set-palette` or by manually editing the file. Once present, every `/magic` run reads it during CONTEXT.

`recent-palettes.json` is updated automatically on every autonomous `/houdini` HAND-OFF in explore mode. The skill SHOULD also append on guided/keywords HAND-OFF. The rotation algorithm prefers families not in the most recent entries; when all eight families have been used, the rotation resets.

### The typical lifecycle

```
1. /magic --surprise build a portfolio for a sound designer
     → EXPLORING. Houdini autonomous rotates to (e.g.) electric-acid. Run completes.
2. /palette-status
     → EXPLORING. Anti-list: [electric-acid].
3. /magic --surprise build a portfolio for a sound designer
     → EXPLORING. Rotation avoids electric-acid. Lands on (e.g.) deep-jewel.
4. /palette-status
     → EXPLORING. Anti-list: [deep-jewel, electric-acid].
5. (User likes deep-jewel.)
   /set-palette from-seed
     → LOCKED to deep-jewel with the tokens lifted from the latest seed.
6. /magic add a contact form
     → LOCKED. CONTEXT honors the lock; BUILD uses exact tokens; AUDIT checks drift.
7. (Want to try one off-direction without losing the lock.)
   /magic --palette electric-acid try the page in acid
     → OVERRIDDEN for this run. Lock file unchanged. AUDIT runs against the override.
```

---

## The nine phases

`/magic` runs phases 0 through 8 in order. Each phase has exactly one owner. Phase outputs are JSON, schema-validated, and persisted to `memory/` so subsequent phases (or new sessions) can read them.

| # | Phase | Owner | Reads from | Writes to | Output |
|---|---|---|---|---|---|
| 0 | HOUDINI | houdini skill (optional) | the intent + seeds/ scan | `memory/DESIGN_APPROACH.md`, `seeds/` | Cold-start gate: detect, recommend, delegate, OR skip |
| 1 | READ | design-taste-frontend | intent + DESIGN_APPROACH.md if present | `memory/DESIGN_READ.json` | `{ read, kind, audience, vibe, stack_hint }` |
| 2 | CONTEXT | impeccable | DESIGN_READ + project files | `memory/CONTEXT.json` | `{ register, palette_strategy, existing_tokens, scene_sentence }` |
| 3 | DIALS | design-taste-frontend | DESIGN_READ + CONTEXT | `memory/DIALS.json` | `{ variance, motion, density, reasoning }` |
| 4 | STACK | design-taste-frontend | prior phases | `memory/STACK.json` | `{ framework, ds_package, type_family, motion_lib, icons }` |
| 5 | BUILD | impeccable + design-taste-frontend | all prior phases + DESIGN_APPROACH `## Embedded mood images` | files in `outputs/<slug>/` + `memory/BUILD.json` | `{ files_written, notes }` |
| 6 | POLISH | emil-design-eng | BUILD output + DIALS | `memory/POLISH.json` | `{ animations[], review_table_md }` |
| 7 | AUDIT | all three (parallel) | everything | `memory/audit-*.json` and `memory/last-audit.json` | `{ preflight_pass, slop_pass, review_findings, gate }` |
| 8 | FINALIZE | finalize agent | `seeds/`, `memory/` | `outputs/<slug>/{seeds,memory}/`, `outputs/<slug>/META.json` | `{ moved_paths, output_dir, meta_path }` |

Phase 0 is the only one allowed to halt the workflow. Phase 7 is the only one that gates. Phase 8 fires only on full pipeline runs (skipped on break-out commands like `/design-read`, `/design-audit` that pass `finalize: false`). After Finalize, `seeds/` and `memory/` are empty (except `.gitkeep`); the run is fully archived under `outputs/<slug>/`.

**Image preservation chain.** When the houdini drafter embeds mood images (`<img src="mood-N.png">`) in autonomous mode or when `--useimg-N` is set, the Handoff phase writes their relative paths into a `## Embedded mood images` section in `DESIGN_APPROACH.md`. Build's IMAGE PRESERVATION RULE clause reads that section and treats those tags as intentional content during re-authoring — they survive the rewrite. Build reports preservation count in `BUILD.json` notes (e.g. "preserved 2 of 2 embedded mood images").

### Phase 7 (AUDIT) in detail

AUDIT runs three checks in parallel. The parallel barrier is justified because the gate needs all three results:

```
audit-preflight  (owner: design-taste-frontend)
  runs the ~55-checkbox Pre-Flight Check matrix from SKILL.md Section 14
  against the build. Returns preflight_pass + failing items as 'block' findings.

audit-slop  (owner: impeccable)
  runs the AI slop test (first-order + second-order) from impeccable's SKILL.md
  against the build. Returns slop_pass + flagged patterns.
  First-order = 'block', second-order = 'warn'.

audit-review  (owner: emil-design-eng)
  produces the mandatory review-as-markdown-table (Before | After | Why)
  against the Polish output. Returns review_findings keyed by severity.
```

The gate computation:

```js
const gate = audit.preflight_pass
          && audit.slop_pass
          && audit.review_findings.filter(f => f.severity === 'block').length === 0;
```

---

## Memory model

`<project>/memory/` (in the user's cwd, NOT inside the plugin) holds the persistent state shared between commands during an active run. Files are written by their owning phase or break-out command, read by anyone who needs them.

```
memory/                       ← active run state; emptied by Finalize on full magic runs
├── DESIGN_APPROACH.md        ← houdini HAND-OFF; chosen direction + ## Embedded mood images section
├── DESIGN_READ.json          ← phase 1 output
├── CONTEXT.json              ← phase 2 output
├── DIALS.json                ← phase 3 output
├── STACK.json                ← phase 4 output
├── POLISH.json               ← phase 6 output
├── BUILD.json                ← phase 5 output; includes preservation count
├── last-audit.json           ← phase 7 output; gate + all findings
├── audit-preflight.json      ← raw Pre-Flight result
├── audit-slop.json           ← raw slop test result
└── audit-review.json         ← raw emil review result
```

After a full `/magic` run, Phase 8 (Finalize) MOVES `memory/*` into `outputs/<slug>/memory/`. The active `memory/` ends empty (except `.gitkeep`), ready for the next run. Break-out commands that don't run to completion (like `/design-read`, `/design-audit`) leave `memory/` populated so you can compose with subsequent break-outs or a follow-up `/magic`.

Re-running a phase overwrites its file. Re-running `/magic` reads them back so the flow is incremental: if `DESIGN_READ.json` already exists, the Read agent uses it as input rather than re-deriving the read from the raw intent. This is what makes break-out commands compose without orchestration.

---

## Hand-off artifacts (seeds/) and the per-run archive (outputs/<slug>/)

`<project>/seeds/` is the single-purpose **active workspace**. It holds whatever's currently feeding a run — user-supplied refs you've dropped in, plus anything houdini writes:

```
seeds/                                ← active workspace; emptied by Finalize on full magic runs
├── [your-refs.png, brand.svg, ...]   ← USER-PROVIDED (any name, any quantity, picked up automatically)
├── mood-1.png … mood-N.png           ← nanogen-generated mood board (when MoodBoard runs)
├── draft-1.html … draft-K.html       ← houdini drafter outputs (K=1 autonomous, 3 keywords/guided)
├── starter.html                      ← the chosen + refined draft (hand-off for /magic Build)
└── tokens.css                        ← extracted :root custom properties (OKLCH palette, type, easing)
```

Each draft is a self-contained 200–400-line HTML file with real OKLCH palette, real type system, real hero, and real component scaffolding. Drafts are openable directly in a browser without a build step.

`<project>/outputs/<slug>/` is the **per-run archive**. After a full `/magic` run, Phase 8 (Finalize) moves `seeds/*` and `memory/*` into a fresh archive dir named with the slug:

```
outputs/
├── <brief-slug>-2026-05-31-1147/     ← one dir per completed /magic run
│   ├── seeds/                        ← snapshot of seeds/ that fed this build
│   ├── memory/                       ← snapshot of memory/ for this build
│   ├── [production files from BUILD] ← actual app/site files
│   └── META.json                     ← { slug, intent, completed_at, flags, audit_gate, ... }
├── <another-slug>-2026-05-31-1402/
└── _orphans/                         ← auto-created when --use over non-empty seeds/ chooses orphan
    └── 2026-05-31-1450/              ← timestamped move-aside of orphaned seeds
```

**Slug format**: `<brief-3-words-kebab-or-"auto">-YYYY-MM-DD-HHMM`. Examples: `dog-app-2026-05-31-1147`, `auto-2026-05-31-1147`, `fintech-dashboard-2026-05-31-1147`. Generated by the command layer (not the workflow — workflows can't use `Date.now()` because it breaks resume).

**To re-iterate on a prior run**: `/magic --use <slug> "<new tweak>"` — repopulates `seeds/` and `memory/` from `outputs/<slug>/`, then runs again. Result lands in a new `outputs/<new-slug>/`.

---

## Conflict resolution

When the three skills disagree, the workflow applies these rules:

| Disagreement | impeccable says | taste says | emil says | Resolution |
|---|---|---|---|---|
| Bounce in easing | No bounce. Exponential ease-out. | Silent on bounce shape. | Subtle 0.1-0.3 OK for playful or drag UI. | impeccable for standard UI; emil for drag-to-dismiss only |
| Eyebrow on every section | Banned as scaffolding | Max 1 per 3 sections, mechanical count | Silent | taste's count is the operational rule |
| Default sans font | Doesn't prescribe | Discourages Inter. Reach for Geist / Outfit / Satoshi. | Silent | taste; brief-aware |
| Animation altitude | Motion must be intentional | Picks the pattern (sticky stack, horizontal pan, scroll-pin) | Picks the curve, duration, transform-origin | taste owns pattern, emil owns values |
| Beige/cream backgrounds | Saturated AI default of 2026; banned | Premium-consumer beige+brass family banned | Silent | Both agree, enforce together |
| Marketing copy | No buzzwords. No em-dashes. | Copy self-audit. Cut AI cute-but-wrong phrases. | Silent | Both agree, enforce together |

These resolutions are baked into the agent prompts at the phase boundaries. The owning skill's rule wins by construction; no runtime decision is required.

---

## Repository layout

```
presto/
├── .claude-plugin/
│   ├── plugin.json              ← plugin metadata (Claude Code reads this)
│   └── marketplace.json         ← lets the repo serve as its own marketplace
├── README.md                    ← this file
├── commands/                    ← 7 slash commands, auto-discovered
│   ├── magic.md                 ← /magic [intent] [--surprise | --guided]
│   ├── houdini.md               ← /houdini [args] — delegates to the houdini skill
│   ├── design-read.md           ← phase 1 only
│   ├── set-dials.md             ← phase 3 only
│   ├── design-flow.md           ← phase 5 onward
│   ├── design-audit.md          ← phase 7 only
│   └── design-review.md         ← emil's review table on git diff
├── workflows/                   ← workflow scripts invoked by commands (not auto-registered)
│   ├── magic.js                 ← the 8-phase workflow
│   └── houdini.js               ← the parallel-drafter workflow (1 or 3 drafts)
├── skills/                      ← 4 skills, auto-discovered as <name>/SKILL.md
│   ├── impeccable/              ← bundled; project-level design skill
│   ├── design-taste-frontend/   ← bundled; page-level design skill
│   ├── emil-design-eng/         ← bundled; component-level craft skill
│   └── houdini/                 ← presto's own; creative partner orchestrator
├── memory/                      ← active-run state (see Memory model); emptied by Finalize
│   └── .gitkeep
├── seeds/                       ← active workspace (user refs + houdini outputs); emptied by Finalize
│   ├── .gitkeep
│   └── README.md
├── outputs/                     ← per-run archives; created lazily on first /magic completion
│   └── .gitkeep                 (not bundled with the plugin — created in user's project on first run)
├── shared/
│   ├── easing.css               ← emil's named easing curves as CSS custom properties
│   └── preflight.mjs            ← taste's Pre-Flight matrix runner (Node ESM)
└── decks/                       ← the four visual decks (see The decks)
    ├── index.html
    ├── deck-impeccable.html
    ├── deck-design-taste-frontend.html
    ├── deck-emil-design-eng.html
    └── deck-combined.html
```

All four skills are vendored inside `skills/` so the plugin is self-contained: no external skill paths to resolve, no install-time dependencies beyond Claude Code itself.

---

## The decks

Four self-contained HTML decks in `decks/`. Each is a vertical scroll-snap presentation built using the rules of the skill it documents:

- **`deck-impeccable.html`** — 11 slides on impeccable. Built per impeccable's own rules: OKLCH committed palette in terracotta, Fraunces + Inter Tight contrast pair, no eyebrow per section, no gradient text, no side-stripe accents.
- **`deck-design-taste-frontend.html`** — 11 slides on the taste skill. Built per its rules: stated Design Read up top, dials at 7/5/4, Geist (not Inter), monochrome + electric-blue palette explicitly rotating away from the banned beige+brass, max 1 eyebrow per 3 sections, every section a different layout family.
- **`deck-emil-design-eng.html`** — 12 slides on emil. Built per his patterns: live spring-physics mouse tracking, scale(0.97) on every :active, hold-to-delete via clip-path, popovers from origin, the mandatory review table.
- **`deck-combined.html`** — 14 slides on the synthesis. Three-altitude ownership diagram, the eight-phase pipeline, conflict-resolution matrix, the `/magic --surprise` pipeline visualization, the worked hero example annotated with skill ownership.

Open `decks/index.html` for the landing page.

---

## Architecture notes

A few intentional design decisions worth knowing about.

### Why skills and workflows are split

The workflow tool spawns autonomous subagents that cannot use `AskUserQuestion`. Conversation has to live in the main loop. So:

- **`/magic` is a pure workflow** because all eight phases are autonomous: each phase agent takes prior-phase output and produces the next phase's JSON without user input. (`--guided` works by re-launching the workflow once per phase from the command body in the main loop.)
- **`/houdini` is a skill that calls a workflow.** TUNE IN, PRESENT, and REFINE need conversation, so they run in the main loop. DRAFT is parallelizable and non-interactive, so it runs as a workflow that fans out drafter agents.
- **The `/magic` cold-start hook detects but does not invoke houdini.** Workflows pretending to be conversational always ends badly; explicit halt + recommend keeps each tool honest about what it can do.

### Why schema-validated phase handoff

Each phase returns a JSON object with a known shape (`DESIGN_READ_SCHEMA`, `CONTEXT_SCHEMA`, etc., defined at the top of `magic.js`). The workflow tool enforces the schema at the agent boundary. This means:

- A phase cannot silently produce malformed output.
- The next phase's prompt can include the prior output verbatim without dependency on string parsing.
- Memory files have predictable structure that break-out commands can rely on.

### Why AUDIT runs in parallel with a barrier

The AUDIT phase is the only place a `parallel()` barrier is justified in `magic.js`. The gate decision needs all three check results (preflight + slop + review) to be available before deciding pass/fail. If any one of them failed independently while the others were still running, the runner couldn't compute the gate cleanly. So all three fire concurrently, the runner awaits all of them, and the gate is computed once.

### Why phase outputs persist to memory

If a phase fails or is interrupted, the prior phases' outputs survive. Re-running `/magic` reads `memory/` first; phases whose output already exists can be skipped or used as input rather than re-derived. The same memory is what makes break-out commands compose: `/design-read` and `/magic` write the same `DESIGN_READ.md`, so a `/design-read` followed by `/design-flow hero` does not require `/magic` ever to be invoked.

---

## Plugin manifest

Two manifest files under `.claude-plugin/`:

**`.claude-plugin/plugin.json`** — plugin metadata. Claude Code's plugin loader auto-discovers commands from `commands/*.md`, skills from `skills/<name>/SKILL.md`, hooks from `hooks/`, and agents from `agents/`. The manifest only carries metadata.

```json
{
  "name": "presto",
  "version": "0.1.7",
  "description": "Three production-grade design skills (impeccable, design-taste-frontend, emil-design-eng) stacked into one composable workflow, plus a fourth (houdini) for the cold-start blank canvas.",
  "author": { "name": "Brian Yu" },
  "repository": "https://github.com/brianyu18/presto",
  "license": "MIT",
  "keywords": ["design", "frontend", "ui", "ux", "workflow", "multi-agent", "anti-slop"]
}
```

**`.claude-plugin/marketplace.json`** — lets the repo serve as its own marketplace, so it can be installed with `/plugin marketplace add brianyu18/presto`.

```json
{
  "name": "presto",
  "owner": { "name": "Brian Yu" },
  "metadata": { "version": "0.1.4", "description": "..." },
  "plugins": [
    { "name": "presto", "version": "0.1.4", "description": "...", "source": "./" }
  ]
}
```

All four skills (impeccable, design-taste-frontend, emil-design-eng, houdini) are bundled inside `skills/` so the plugin is self-contained. The three source skills are credited in [Inspirations and credits](#inspirations-and-credits); they are vendored under their respective licenses (Apache 2.0 for impeccable, original-source licenses for the others).

---

## Image generation (nanogen)

presto bundles the **nanogen** MCP server for Gemini image generation, vendored at `mcp-servers/nanogen/`. nanogen is a pure-stdlib Python MCP server wrapping Google's Gemini image API (`gemini-2.5-flash-image` by default, with `gemini-3-pro-image-preview` and the flash-3.1 family available). It is also published standalone at [https://github.com/brianyu18/nanogen](https://github.com/brianyu18/nanogen). Bundling it inside presto means design phases can generate, edit, and describe reference imagery without leaving the plugin.

### Setup

1. Set `GEMINI_API_KEY` in your shell environment. Get one at [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Restart Claude Code. The nanogen MCP server starts automatically with presto via `.mcp.json`.

A fallback key file at `~/.config/nanogen/key` is read if the env var is absent. Override with `NANOGEN_KEY_FILE`.

### Tools exposed

| Tool | Description |
|---|---|
| `generate` | Generate an image from a text prompt. Args: `prompt`, optional `aspect_ratio`, `output_path`, `model`. |
| `edit` | Edit an existing image using a text prompt. Args: `input_path`, `prompt`, optional `output_path`, `model`. |
| `describe` | Describe an image as structured JSON (description, OKLCH palette, style tags). Args: `input_path`. |
| `batch` | Run many `generate` requests through the rate-limited queue. Args: `requests[]`. |

Generated images are cached by `sha256(prompt + model + aspect)` at `NANOGEN_CACHE_DIR` (default `~/.cache/nanogen/`). Concurrent calls are serialized through an internal queue (default max 2) so the Gemini quota stays happy.

### Standalone use

presto ships `/imagen` and `/imagen-edit` commands as thin shortcuts around the nanogen MCP tools, so you can generate or remix imagery directly from the slash palette without writing tool-call boilerplate. Prompt patterns are documented in the `imagen-direction` skill at `skills/imagen-direction/SKILL.md` (anti-slop vocabulary, aspect-ratio cheat sheet, when to use generate vs edit vs describe vs batch, picsum fallback when the MCP server is unavailable).

### Cost model

Worth knowing before you run the full pipeline:

| Workload | Runs against |
|---|---|
| `/magic` phases 1-7 (Read, Context, Dials, Stack, Build, Polish, Audit) | Your Claude subscription |
| MoodBoard phase inside `/houdini` | Gemini image-gen quota (3 calls per houdini run) |
| `/imagen` and `/imagen-edit` standalone | Gemini image-gen quota (1 call each) |

When the image-gen quota is exhausted, `--nogen` is the graceful degradation path. The MoodBoard phase is skipped cleanly; the rest of the design pipeline runs unchanged with text-only direction.

---

## Extending

### Adding a new break-out command

1. Author `commands/<name>.md` with frontmatter (`name`, `description`, `argument-hint`).
2. In the body, decide whether the command launches the magic workflow with a `skipTo` or invokes its own small workflow.
3. Add the command entry to `plugin.json`'s `commands` array.
4. Document it in the README's break-outs table.

### Adding a mid-flow gate

Currently AUDIT is the only enforced gate. To add a mid-flow gate (e.g., Pre-Flight after BUILD, blocking POLISH on failure):

1. In `magic.js`, after the BUILD phase, add a conditional agent call that runs the Pre-Flight matrix against the build output.
2. Return early with `{ halted_at: 'mid-build-gate', findings }` if it fails.
3. Update the command body to surface the failure and prompt the user.

This is a deliberate non-default. If you are not hitting actual late-failure waste, the single AUDIT gate is enough.

### Adding a new skill

If you want to add a fourth source skill (e.g., for accessibility):

1. Add the skill to `plugin.json`'s `skills` array with its path.
2. Decide which phase it owns. If a new phase, add it to `magic.js`'s `meta.phases` and add the phase block.
3. Update the conflict-resolution table in this README.

---

## Inspirations and credits

- **impeccable** by [@yacineMTB / impeccable.style](https://impeccable.style). The project-level design skill, the absolute bans, the AI slop test, the brand-vs-product register split.
- **design-taste-frontend** (the "taste skill"). The Design Read format, the three dials, the brief-to-system map, the Pre-Flight Check matrix.
- **emil-design-eng** by Emil Kowalski ([animations.dev](https://animations.dev)). The Animation Decision Framework, the named easing curves, the mandatory review table format, the Sonner principles.
- **The cold-start framing** ("craft codes toward a concrete image, not an abstract brief; that is the step change") is lifted directly from impeccable.style/designing/#start. houdini exists to operationalize that insight.

presto itself is a composition. Every individual rule in this plugin comes from one of the three source skills. presto only sequences them, persists their outputs, and adds houdini as the cold-start layer.

---

## What's new in v0.1.7

The biggest single release since v0.1.0. Two bundles landed in one commit; the underlying model of presto changed.

### Resource management — seeds/outputs split

- **`seeds/` is single-purpose** active workspace (user refs + houdini outputs commingle here).
- **`outputs/<slug>/` is the per-run archive** (snapshot of seeds + memory + production files + META.json).
- **`<project>/seeds/` is YOUR project's seeds dir** (cwd-derived). presto lazy-creates seeds/, memory/, outputs/ on first run via `mkdir -p`.
- **Run slug format**: `<brief-3-words>-YYYY-MM-DD-HHMM`. Travels with the run through `/houdini`, `/magic`, and into the archive.
- **New Finalize phase** (phase 8) at the end of every full `/magic` run: moves `seeds/*` and `memory/*` into `outputs/<slug>/`, writes `META.json`. Working dirs end clean.
- **All workflow paths are now project-relative**. No more hardcoded `/Users/...` constants; the workflow takes `args.project_root` from the command layer.

### Flag expansion

| Flag | Effect |
|---|---|
| `--useimg[-N]` | Drafter MAY embed up to N mood images as `<img>` tags (relative paths, on-brand only). Default: autonomous→2, others→0. `--useimg-0` explicitly disables. |
| `--gen[-N]` | Override mood-board image count (1–5, default 3). Five ordered vantages: hero / lifestyle / detail / atmosphere / texture-fragment. |
| `--nohoudini` | Skip Phase 0 entirely; requires `seeds/` non-empty. |
| `--use <slug>` | Repopulate `seeds/` + `memory/` from `outputs/<slug>/`, then run. Implies `--nohoudini`. |

Three syntactic forms per numeric flag: `--gen-4`, `--gen 4`, `--gen=4`.

### Bring-your-own seed resources

houdini's MoodBoard now scans `seeds/` for user-provided files (anything not a workflow-owned filename) at run start. When user refs exist, nanogen is skipped by default — refs become the mood board (palette + style tags extracted via `nanogen describe`). Pass `--gen-N` to augment: refs are moods 1..K, nanogen generates N additional moods that reference the user inputs.

### Embed preservation chain through Build

When the drafter embeds mood images, the Handoff phase records their relative paths in a `## Embedded mood images` section in `DESIGN_APPROACH.md`. `/magic` Build's new IMAGE PRESERVATION RULE reads that section and treats those `<img>` tags as intentional content during re-authoring — they survive the rewrite. Build reports preservation count in `BUILD.json` notes.

### Workflow harness fix (load-bearing)

Claude Code v2.1.158's workflow loader rejected presto's `export default async function ...()` wrappers (the body is compiled in `vm.Script`, which doesn't support module-level `export`). Stripped the wrappers; body is now top-level procedural code per the v2.1.158 contract. Without this fix, the entire `/magic` and `/houdini` workflow surface was unrunnable.

---

## License

MIT.
