---
name: palette-status
description: "Read-only inspection of the project's palette state. Reports lock state (exploring / locked / locked-with-active-override), the family + token count if locked, the recent-palettes anti-list if any, and what the next /houdini run will do. Writes nothing."
argument-hint: ""
---

# /palette-status — inspect the current palette state

A pure read. Tells you what the next `/houdini` or `/magic` invocation will do without running anything. Useful before a `/magic --surprise` to know whether you'll get rotation or a lock.

## What it reports

Capture `$PROJECT_ROOT` via `pwd`. Then check three files and synthesize a single status block.

### Step 1 — check the lock

```sh
test -f "$PROJECT_ROOT/memory/PALETTE.json" && echo lock-yes || echo lock-no
```

If `lock-yes`: Read the file. Capture `family`, count entries in `tokens`, read `locked_at`, `source`, `notes`.

### Step 2 — check the anti-list

```sh
test -f "$PROJECT_ROOT/memory/recent-palettes.json" && echo recent-yes || echo recent-no
```

If `recent-yes`: Read the file. Capture the `recent` array (up to 5 entries: `family`, `run_slug`, `via`).

### Step 3 — check seeds/tokens.css

```sh
test -f "$PROJECT_ROOT/seeds/tokens.css" && echo seed-yes || echo seed-no
```

If `seed-yes`: grep `--ink`, `--paper`, `--accent` OKLCH literals out of `:root`. Capture the first three found.

### Step 4 — print the status

Format the output as a single markdown block. The shape depends on lock state:

**Locked:**

```
State           : LOCKED
Family          : <family-key> (<friendly label from PALETTE_FAMILIES>)
Tokens          : <N> tokens — <ink-value>, <paper-value>, <accent-value> [+ N more]
Locked at       : <iso timestamp>
Source          : <source field>
Notes           : <notes field, or "—">

Behaviour next run:
  /houdini  → drafters receive the locked tokens verbatim. Anti-list dormant.
  /magic    → CONTEXT phase reads the lock; AUDIT runs the drift check.
  Override  → /houdini --palette none  or  /magic --palette none  bypasses for one run.
  Replace   → /set-palette <other-family>  replaces the lock.
  Clear     → /set-palette none  removes the lock entirely.
```

**Exploring (no lock):**

```
State           : EXPLORING (no lock)

Recent palettes (anti-list, last <N> of 5 retained):
  1. <family-key>  ← <run_slug>  (via <source>)
  2. ...
(no recent palettes recorded yet)

Seed tokens (from seeds/tokens.css, if a /houdini run has landed):
  --ink:    <value>
  --paper:  <value>
  --accent: <value>
(no seed yet — run /houdini)

Behaviour next run:
  /houdini --auto  → deterministic rotation away from the anti-list.
  /houdini (multi-draft)  → each drafter picks a distinct family from the menu.
  /magic --surprise  → autonomous houdini with rotation, then full magic flow.
  Lock now  → /set-palette from-seed (if a seed exists)  or  /set-palette <family>.
```

**Locked + active override on this command line is N/A** (this command never accepts a `--palette` flag — its job is to report state, not change it). If the user wants to see what an override WOULD do, run `/palette-status` first, then run the actual `/houdini` or `/magic` with the override.

## Examples

After a fresh `/magic --surprise` run in an empty project:

```
State           : EXPLORING (no lock)
Recent palettes (anti-list, last 1 of 5 retained):
  1. warm-editorial  ← presto-page-2026-06-01-0034  (via houdini-autonomous)
Seed tokens:
  --ink:    oklch(18% 0.012 60)
  --paper:  oklch(94% 0.020 78)
  --accent: oklch(56% 0.21 27)
Behaviour next run:
  /houdini --auto  → deterministic rotation away from the anti-list.
  ...
```

After `/set-palette from-seed`:

```
State           : LOCKED
Family          : warm-editorial (Warm editorial)
Tokens          : 6 tokens — oklch(18% 0.012 60), oklch(94% 0.020 78), oklch(56% 0.21 27) + 3 more
Locked at       : 2026-06-01T00:42:11Z
Source          : set-palette | from-seed (run_slug=presto-page-2026-06-01-0034)
Notes           : —
...
```

## Anti-patterns

- Don't write or modify any file. This command is strictly read-only. If a user wants to change state, route them to `/set-palette` or one of the run commands.
- Don't editorialize. Report state factually; do not suggest "you should lock now" unless the user explicitly asks.
