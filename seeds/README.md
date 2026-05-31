# seeds/

Working directory for the `/houdini` design-partner skill. Everything here is a concrete artifact — actual openable HTML, not descriptions of HTML.

## Files

- **`draft-1.html`, `draft-2.html`, `draft-3.html`** — three concurrent draft proposals produced during houdini's DRAFT phase. Each is a self-contained 200-400 line HTML file with its own palette (OKLCH), type system, hero, and components. The three drafts are intentionally distinct: typically one safe brand-default, one anti-default contrarian, one wildcard overcommit.
- **`starter.html`** — the chosen draft after the user picks one in PRESENT and the REFINE loop converges. This is the hand-off artifact that `/magic`'s Stack and Build phases consume.
- **`tokens.css`** — the extracted `:root` custom properties from `starter.html` (palette, type families, easing curves, radii, spacing). Made available as a standalone file so other phases can import it without parsing the full HTML.

## Lifecycle

The directory is regenerated each `/houdini` run. The drafts and starter are overwritten — there is no history kept here. If you need to preserve a prior houdini result, copy `starter.html` and `tokens.css` elsewhere before re-running.

The companion hand-off doc lives at `presto/memory/DESIGN_APPROACH.md` and describes the chosen direction, rejected alternatives, refs, and anti-refs in prose.
