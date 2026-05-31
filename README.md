# presto

A Claude Code plugin that stacks three production-grade design skills (impeccable, design-taste-frontend, emil-design-eng) into one composable workflow. Run `/magic` to go end to end, run `/houdini` to fill the blank canvas with a real starter template, or invoke any of six standalone break-out commands for surgical control.

---

## Table of contents

1. [What presto is](#what-presto-is)
2. [Why three skills, one workflow](#why-three-skills-one-workflow)
3. [Quick start](#quick-start)
4. [The /magic command](#the-magic-command)
5. [The /houdini creative partner](#the-houdini-creative-partner)
6. [Break-out commands](#break-out-commands)
7. [The eight phases](#the-eight-phases)
8. [Memory model](#memory-model)
9. [Hand-off artifacts](#hand-off-artifacts)
10. [Conflict resolution](#conflict-resolution)
11. [Repository layout](#repository-layout)
12. [The decks](#the-decks)
13. [Architecture notes](#architecture-notes)
14. [Plugin manifest](#plugin-manifest)
15. [Extending](#extending)
16. [Inspirations and credits](#inspirations-and-credits)

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

## Quick start

Net-new project, fastest path from blank brief to a finished starter design:

```
/magic --surprise build a portfolio for a sound designer
```

Zero prompts. presto runs houdini autonomously in wildcard mode, lands a starter HTML template plus tokens plus a written DESIGN_APPROACH.md, then runs the full eight-phase magic flow with audit at the end. You see the result when it is finished.

Net-new with oversight:

```
/magic build a portfolio for a sound designer
```

One prompt up front (cold-start gate: run houdini first?), then continues autonomously. Best balance of speed and visibility.

Net-new with full oversight:

```
/magic --guided build a portfolio for a sound designer
```

Pauses between every phase for Approve / Revise / Skip / Abort. Slower, but maximum control.

Cold start alone, without invoking magic:

```
/houdini
```

Asks which mode (autonomous, keywords, guided), runs the picked mode, writes hand-off artifacts, exits.

Audit existing code:

```
/design-audit src/components/Hero.tsx
```

Runs Pre-Flight matrix, slop test, and emil review against the target. No new code produced.

---

## The /magic command

`/magic` is the canonical composition. Eight phases in linear order, with one explicit owner per phase. Three invocation modes.

### Three modes

| Mode | Invocation | Prompts | Best for |
|---|---|---|---|
| `--surprise` | `/magic --surprise <intent>` | 0 prompts end to end | Speed; reacting to a finished design |
| default | `/magic <intent>` | 1 prompt (cold-start gate) | Balanced; confirm the seed, then run |
| `--guided` | `/magic --guided <intent>` | 7 prompts (1 gate + 6 phase approvals) | High-stakes; oversight at every phase |

If both `--surprise` and `--guided` are passed, `--surprise` wins (it is the more decisive bypass) and the override is logged.

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

### Five phases

```
TUNE IN -> DRAFT -> PRESENT -> REFINE -> HAND-OFF
```

- **TUNE IN** — read the brief, scan existing context, form a Design Read hypothesis. Ask at most two questions, and only if genuinely ambiguous.
- **DRAFT** — fan out drafter agents in parallel (3 in guided/keywords mode, 1 in autonomous mode). Each writes a self-contained `seeds/draft-N.html` with a distinct creative angle: safe brand-default, anti-default contrarian, wildcard overcommit. Real OKLCH palette, real type system, real hero, real components.
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
| `/design-flow [feature]` | `memory/DESIGN_READ.md` + `memory/DIALS.json` (asks if absent) | code in your project | Build one feature without re-running the full flow |
| `/design-audit [target]` | the target file or directory | `memory/last-audit.json` (Pre-Flight + slop test + emil review) | Check existing code against the three skills' rules |
| `/design-review` | uncommitted + staged git diff | inline markdown table | Emil's eyes on a change before commit |

Each command is invokable directly. None requires `/magic`. None blocks waiting on another. The state in `memory/` is shared, so `DESIGN_READ.md` written by `/design-read` is consumed by `/design-flow` exactly as it is by `/magic`.

**The shape of presto is six primitives plus one composition.** `/magic` chains the primitives in a known-good order with a cold-start guard and a final audit gate. The primitives themselves do not know `/magic` exists. presto degrades cleanly: even if `/magic` breaks, every break-out keeps working.

Plus `/impeccable [cmd]` as a passthrough to any of impeccable's 25 sub-commands (`craft`, `shape`, `polish`, `audit`, `harden`, etc.).

---

## The eight phases

`/magic` runs phases 0 through 7 in order. Each phase has exactly one owner. Phase outputs are JSON, schema-validated, and persisted to `memory/` so subsequent phases (or new sessions) can read them.

| # | Phase | Owner | Reads from | Writes to | Output |
|---|---|---|---|---|---|
| 0 | HOUDINI | houdini skill (optional) | the intent | `memory/DESIGN_APPROACH.md`, `seeds/` | Cold-start gate: detect, recommend, delegate, OR skip |
| 1 | READ | design-taste-frontend | intent + DESIGN_APPROACH.md if present | `memory/DESIGN_READ.md` | `{ read, kind, audience, vibe, stack_hint }` |
| 2 | CONTEXT | impeccable | DESIGN_READ + project files | `memory/CONTEXT.json` | `{ register, palette_strategy, existing_tokens, scene_sentence }` |
| 3 | DIALS | design-taste-frontend | DESIGN_READ + CONTEXT | `memory/DIALS.json` | `{ variance, motion, density, reasoning }` |
| 4 | STACK | design-taste-frontend | prior phases | `memory/STACK.json` | `{ framework, ds_package, type_family, motion_lib, icons }` |
| 5 | BUILD | impeccable + design-taste-frontend | all prior phases | files in your project + `memory/last-build.json` | `{ files_written, notes }` |
| 6 | POLISH | emil-design-eng | BUILD output + DIALS | `memory/POLISH.json` | `{ animations[], review_table_md }` |
| 7 | AUDIT | all three (parallel) | everything | `memory/audit-*.json` and `memory/last-audit.json` | `{ preflight_pass, slop_pass, review_findings, gate }` |

Phase 0 is the only one allowed to halt the workflow. Phase 7 is the only one that gates: it returns `pass` only if Pre-Flight passes AND slop test passes AND zero `block`-severity findings appear in emil's review. `warn`-severity findings surface but do not fail the gate.

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

`presto/memory/` holds the persistent state shared between commands. Files are written by their owning phase or break-out command, read by anyone who needs them.

```
memory/
├── DESIGN_APPROACH.md   ← houdini HAND-OFF; the chosen direction and what was rejected
├── DESIGN_READ.md       ← phase 1 output; the one-line Design Read + kind/audience/vibe
├── CONTEXT.json         ← phase 2 output; register, palette strategy, existing tokens
├── DIALS.json           ← phase 3 output; VARIANCE/MOTION/DENSITY values + reasoning
├── STACK.json           ← phase 4 output; framework, design-system, type, motion lib, icons
├── POLISH.json          ← phase 6 output; per-element animation decisions + review table
├── last-build.json      ← phase 5 output; what files were written this run
├── last-audit.json      ← phase 7 output; gate + all findings
├── audit-preflight.json ← raw Pre-Flight result
├── audit-slop.json      ← raw slop test result
└── audit-review.json    ← raw emil review result
```

Re-running a phase overwrites its file. Re-running `/magic` reads them back so the flow is incremental: if `DESIGN_READ.md` already exists, the Read agent uses it as input rather than re-deriving the read from the raw intent. This is what makes break-out commands compose without orchestration.

---

## Hand-off artifacts

`presto/seeds/` holds the design artifacts produced by houdini:

```
seeds/
├── draft-1.html         ← drafter 1 output (guided/keywords mode), or the sole draft (autonomous)
├── draft-2.html         ← drafter 2 output (guided/keywords mode only)
├── draft-3.html         ← drafter 3 output (guided/keywords mode only)
├── starter.html         ← the chosen + refined draft, hand-off artifact for /magic Build
└── tokens.css           ← extracted :root custom properties (palette in OKLCH, type, easing, radii)
```

Each draft is a self-contained 200-400-line HTML file with real OKLCH palette, real type system, real hero, and real component scaffolding. The drafts are openable directly in a browser without a build step.

After PRESENT and REFINE (or after autonomous HAND-OFF), `starter.html` is the chosen draft and `tokens.css` is the extracted token system. `/magic`'s STACK and BUILD phases consume these as the seed.

The directory is regenerated each houdini run. Old drafts are overwritten.

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
├── plugin.json                  ← manifest: 4 skills, 7 commands, 2 workflows
├── README.md                    ← this file
├── commands/                    ← 7 slash commands
│   ├── magic.md                 ← /magic [intent] [--surprise | --guided]
│   ├── houdini.md               ← /houdini [args] — delegates to the houdini skill
│   ├── design-read.md           ← phase 1 only
│   ├── set-dials.md             ← phase 3 only
│   ├── design-flow.md           ← phase 5 onward
│   ├── design-audit.md          ← phase 7 only
│   └── design-review.md         ← emil's review table on git diff
├── workflows/
│   ├── magic.js                 ← the 8-phase workflow
│   └── houdini.js               ← the parallel-drafter workflow (1 or 3 drafts)
├── skills/
│   └── houdini/
│       └── SKILL.md             ← creative partner conversational orchestrator
├── memory/                      ← persistent state (see Memory model)
│   └── .gitkeep
├── seeds/                       ← houdini design artifacts (see Hand-off artifacts)
│   ├── .gitkeep
│   └── README.md
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

The three source skills (impeccable, design-taste-frontend, emil-design-eng) are referenced by `plugin.json` from their original install locations under `claude-sync/skills/`. presto does not copy them; it composes them.

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

`plugin.json` declares four skills, seven commands, and two workflows:

```json
{
  "name": "presto",
  "version": "0.1.0",
  "skills": [
    { "name": "impeccable",             "path": "../../claude-sync/skills/impeccable" },
    { "name": "design-taste-frontend",  "path": "../../claude-sync/skills/design-taste-frontend" },
    { "name": "emil-design-eng",        "path": "../../claude-sync/skills/emil-design-eng" },
    { "name": "houdini",                "path": "skills/houdini/SKILL.md" }
  ],
  "commands": [
    { "name": "magic" }, { "name": "houdini" },
    { "name": "design-read" }, { "name": "set-dials" },
    { "name": "design-flow" }, { "name": "design-audit" },
    { "name": "design-review" }
  ],
  "workflows": [
    { "name": "magic" },
    { "name": "houdini" }
  ],
  "memory": "memory/"
}
```

The three source skills are referenced by relative path from their original install locations under `claude-sync/skills/`. If your layout differs, edit the `path` fields. The houdini skill ships inside the plugin.

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

## License

MIT.
