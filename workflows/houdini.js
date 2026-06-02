/**
 * /houdini-drafts — the parallel drafting tool used by the /houdini SKILL.
 *
 * SEPARATION OF CONCERNS
 *   The /houdini skill (skills/houdini/SKILL.md) owns the conversation: it
 *   tunes in, asks the user the few questions worth asking, presents drafts,
 *   runs the refine loop, and writes the hand-off files.
 *
 *   THIS WORKFLOW does ONE thing: given an already-formed Design Read +
 *   brief + constraints, it fans out N drafter agents in parallel. Each
 *   drafter writes a single self-contained HTML file to presto/seeds/
 *   and returns structured metadata describing what it made.
 *
 *   The skill calls this workflow once, between TUNE IN and PRESENT.
 *
 * ARGS CONTRACT (v2.2)
 *   { brief, design_read, constraints, n_drafts?, angles?,
 *     autonomous?: boolean,       // MODE 1 — single draft, no per-angle expansion
 *     keywords?: string[],        // MODE 2 — primary design signal for every drafter
 *     visual_brief?: string,      // MODE 3 (guided) — primary signal for mood board
 *     angle_override?: 'safe'|'contrarian'|'wildcard' }  // autonomous only
 *
 * MODES: autonomous forces n_drafts=1 + single angle from angle_override
 * (default 'wildcard'). keywords runs the 3-up flow with the keywords as a
 * primary signal equal in weight to the brief. guided is unchanged from v2.
 *
 * RETURN: { mode, directive, moodBoard, drafts: [...] }
 *
 * WHY DRAFTS, NOT DESCRIPTIONS
 *   The hardest moment in design work is the blank page. The fix, per
 *   impeccable.style/designing/#start, is to materialize direction as a
 *   concrete image before any further refinement happens. Every other /magic
 *   phase REFINES an existing artifact; houdini is the only phase allowed
 *   to INVENT, and the invention has to be a real, openable file — not an
 *   abstract write-up.
 *
 * ART-DIRECTION FIRST, THEN MOOD BOARD, THEN PARALLEL DRAFTING
 *   A short Brief phase produces a single "creative directive" per angle.
 *   A MoodBoard phase then renders 3 inspirational images via nanogen MCP —
 *   pure inspiration, never embedded into drafter HTML. Then the Draft
 *   phase fans out, writing draft-1.html, draft-2.html, draft-3.html with
 *   the mood board piped in as a visual anchor.
 *
 * CONDITIONAL HAND-OFF (autonomous only)
 *   In guided/keywords modes the /houdini SKILL drives the user through
 *   PRESENT → REFINE → HAND-OFF conversationally. In autonomous mode there
 *   is no skill loop — the workflow is running solo (typically via
 *   /magic --surprise). So a final Handoff phase fires ONLY when
 *   autonomous === true: it copies the lone draft to seeds/starter.html,
 *   extracts :root tokens to seeds/tokens.css, and writes
 *   memory/DESIGN_APPROACH.md (including the mood-board paths) so the
 *   /magic workflow's phase-0 cold-start detector sees a real approach on
 *   its next run and proceeds to Read.
 *
 * RULES BAKED INTO EVERY DRAFT
 *   - OKLCH for color only (no hex, no rgb).
 *   - impeccable bans: gradient text, side-stripe accents, glass surfaces
 *     by default, hero-metric template, identical card grids, eyebrow on
 *     every section, numbered-step scaffolding (01/02/03 by default).
 *   - design-taste-frontend bans: AI-purple, Inter as default sans,
 *     beige+brass premium-consumer family, centered hero over mesh.
 *   - emil-design-eng polish baked in: easing curves on :root,
 *     scale(0.97) on :active for every interactive control,
 *     prefers-reduced-motion respected.
 *
 * FORBIDDEN at module top-level: Date.now(), Math.random(), template
 * interpolation. `meta` is a pure literal.
 */

export const meta = {
  name: 'houdini-drafts',
  description: 'Generate drafted starter templates for the houdini skill. 3 concurrent drafts in guided/keyword modes; 1 draft in autonomous mode.',
  phases: [
    { title: 'Brief' },
    { title: 'MoodBoard' },
    { title: 'Draft' },
    { title: 'Handoff' },
  ],
};

// ---------- JSON Schemas (phase output contracts) ----------

const DIRECTIVE_SCHEMA = {
  type: 'object',
  required: ['creative_directive_for_each_angle', 'shared_constraints'],
  properties: {
    mode: {
      type: 'string',
      enum: ['autonomous', 'keywords', 'guided'],
      description: 'Which invocation mode the workflow is running in. Echoed from the caller so downstream tooling can branch.',
    },
    creative_directive_for_each_angle: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', description: 'One pointed creative directive per angle, in the same order as the angles array. Names a specific visual world, not a vague mood. In autonomous mode this array has exactly one entry.' },
    },
    shared_constraints: {
      type: 'array',
      items: { type: 'string', description: 'Constraints every drafter must respect (accessibility, regulated industry, audience reading-age, brand non-negotiables, etc.).' },
    },
  },
};

const MOOD_BOARD_SCHEMA = {
  type: 'object',
  required: ['mood_board', 'visual_direction_summary'],
  properties: {
    mood_board: {
      type: 'array',
      description: 'Up to 3 mood images. Empty if nanogen unavailable; the visual_direction_summary still carries the direction.',
      items: {
        type: 'object',
        required: ['path', 'prompt_used', 'description', 'palette_oklch', 'style_tags'],
        properties: {
          path: { type: 'string', description: 'Absolute path to the written PNG, or empty string if the image could not be generated.' },
          prompt_used: { type: 'string', description: 'The actual prompt sent to nanogen (1-3 sentences, anti-slop).' },
          description: { type: 'string', description: 'Structured description of the image — what is in it, the dominant move, why it anchors the direction.' },
          palette_oklch: {
            type: 'array',
            items: { type: 'string', description: 'oklch(...) value lifted from describe output, one entry per dominant color.' },
          },
          style_tags: {
            type: 'array',
            items: { type: 'string', description: 'Short structured tags from describe — e.g. "35mm grain", "harsh window light", "editorial off-center".' },
          },
        },
      },
    },
    visual_direction_summary: {
      type: 'string',
      description: '2-4 sentence prose summary of the visual direction the drafters should commit to. Must be useful even when mood_board is empty.',
    },
  },
};

const DRAFT_METADATA_SCHEMA = {
  type: 'object',
  required: ['name', 'angle', 'scene_sentence', 'palette_oklch', 'type_pair', 'motion_tone', 'references', 'anti_references', 'draft_file_path', 'summary_under_60_words', 'embedded_mood_images'],
  properties: {
    name: { type: 'string', description: 'Short evocative name for this draft, e.g. "Quiet Catalogue" or "Neon Brutalist".' },
    angle: { type: 'string', description: 'The starting angle this draft was asked to take (safe brand-default / anti-default contrarian / wildcard overcommit, or a custom angle passed by the skill).' },
    scene_sentence: { type: 'string', description: 'One sentence in the impeccable form: "Reading this as: <kind> for <audience>, with a <vibe> language, leaning toward <aesthetic family>."' },
    palette_oklch: {
      type: 'array',
      minItems: 3,
      maxItems: 6,
      items: {
        type: 'object',
        required: ['role', 'value'],
        properties: {
          role: { type: 'string', description: 'e.g. ink, paper, accent, accent-2, mute, line.' },
          value: { type: 'string', description: 'An oklch(...) string. No hex, no rgb.' },
        },
      },
    },
    type_pair: {
      type: 'object',
      required: ['display', 'text'],
      properties: {
        display: { type: 'string' },
        text: { type: 'string' },
        rationale: { type: 'string' },
      },
    },
    motion_tone: { type: 'string', description: 'e.g. "still and considered", "snappy micro-feedback only", "narrative scroll-driven".' },
    references: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: {
        type: 'object',
        required: ['url_or_name', 'why'],
        properties: {
          url_or_name: { type: 'string', description: 'Real URL if confident, otherwise the brand/site name.' },
          why: { type: 'string' },
        },
      },
    },
    anti_references: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        required: ['url_or_name', 'why'],
        properties: {
          url_or_name: { type: 'string' },
          why: { type: 'string' },
        },
      },
    },
    draft_file_path: { type: 'string', description: 'Absolute path to the written draft HTML file under presto/seeds/.' },
    summary_under_60_words: { type: 'string', maxLength: 480 },
    embedded_mood_images: {
      type: 'array',
      description: 'Relative paths (filename only, e.g. "mood-1.png") of mood images the drafter actually embedded as <img> tags in the HTML. MUST be exactly the set referenced in the markup — used by HAND-OFF to record preserved imagery in DESIGN_APPROACH.md. Empty array if no embeds.',
      items: { type: 'string', pattern: '^mood-[1-5]\\.png$' },
    },
  },
};

const HANDOFF_SCHEMA = {
  type: 'object',
  required: ['wrote_paths', 'notes'],
  properties: {
    wrote_paths: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', description: 'Absolute path of a file the hand-off agent wrote (starter.html, tokens.css, DESIGN_APPROACH.md).' },
    },
    notes: {
      type: 'string',
      description: 'Short free-form notes about what was extracted, any tokens that were normalised, and any caveats the next phase should know about.',
    },
  },
};

// ---------- Constants ----------

const DEFAULT_ANGLES = [
  'safe brand-default',
  'anti-default contrarian',
  'wildcard overcommit',
];

const ANGLE_OVERRIDE_MAP = {
  safe: 'safe brand-default',
  contrarian: 'anti-default contrarian',
  wildcard: 'wildcard overcommit',
};

// ---------- Palette family axis ----------
// Perpendicular to `angle`. Angle controls vibe/conviction; palette_family controls
// the OKLCH color world the drafter commits to. The two compose: angle=wildcard +
// palette_family=phosphor-terminal is a deliberately overcommitted phosphor-green
// world; angle=safe + palette_family=warm-editorial is a tasteful cream-and-ink page.
//
// Each entry is { key, label, brief, examples } where:
//   brief    — what the drafter must commit to (1-2 sentences, OKLCH-flavored)
//   examples — 2-3 OKLCH triplets that EXEMPLIFY the family without dictating it
const PALETTE_FAMILIES = {
  'industrial-mono': {
    key: 'industrial-mono',
    label: 'Industrial monochrome',
    brief: 'Near-black ink on cool gray paper with one cold accent. OKLCH grayscale ladder + a single saturated chroma at ~210-260 hue. The world is hardware schematics, engineering one-sheets, NASA technical reports.',
    examples: ['oklch(18% 0.005 240)', 'oklch(96% 0.004 240)', 'oklch(52% 0.18 230)'],
  },
  'warm-editorial': {
    key: 'warm-editorial',
    label: 'Warm editorial',
    brief: 'Ink on warm paper at hue 70-90, with one spot color (red, orange, or olive) as the single accent. The world is print magazines, 1930s playbills, Tufte first editions. Calm, generous gutters, type-led.',
    examples: ['oklch(22% 0.015 70)', 'oklch(94% 0.020 78)', 'oklch(56% 0.21 27)'],
  },
  'electric-acid': {
    key: 'electric-acid',
    label: 'Electric / acid',
    brief: 'Black or near-black background with one extremely saturated single accent at the edge of OKLCH gamut (electric lime ~140, sulfur yellow ~95, hot magenta ~340). No second accent. The world is rave flyers, deadmau5 stage design, FACT magazine.',
    examples: ['oklch(14% 0.01 0)', 'oklch(96% 0.02 100)', 'oklch(78% 0.32 142)'],
  },
  'deep-jewel': {
    key: 'deep-jewel',
    label: 'Deep jewel',
    brief: 'Mid-to-deep saturated palette built from 2-3 jewel tones (emerald ~150, sapphire ~250, amethyst ~310, garnet ~20) at chroma 0.1-0.18 against an ink or cream surface. The world is Aesop, Le Labo, Loewe, A24 horror posters.',
    examples: ['oklch(28% 0.10 150)', 'oklch(36% 0.14 310)', 'oklch(92% 0.02 80)'],
  },
  'washed-pastel': {
    key: 'washed-pastel',
    label: 'Washed pastel',
    brief: 'High-lightness low-chroma palette (L 88-96, C 0.02-0.06) where two or three pastels share gutter space without one dominating. Inks are warm grays, not black. The world is Risograph zines, Japanese stationery, Werkstätte, watercolor studies.',
    examples: ['oklch(92% 0.04 28)', 'oklch(91% 0.05 195)', 'oklch(42% 0.01 60)'],
  },
  'dichromatic-print': {
    key: 'dichromatic-print',
    label: 'Dichromatic print',
    brief: 'EXACTLY two saturated inks at distant hues (e.g. ultramarine + cadmium-red, viridian + vermillion) on uncoated cream or off-white. No third color. The world is Risograph two-color runs, Constructivist posters, Polish film bills.',
    examples: ['oklch(38% 0.20 250)', 'oklch(58% 0.22 30)', 'oklch(93% 0.02 80)'],
  },
  'oxidized-metal': {
    key: 'oxidized-metal',
    label: 'Oxidized metal',
    brief: 'Patina palette built from oxidized-copper greens (~165), aged-brass yellows (~85), and rust browns (~40), all at moderate chroma 0.06-0.12. The world is industrial reclamation, brutalist plazas, Tadao Ando concrete, weathered marine signage.',
    examples: ['oklch(58% 0.10 165)', 'oklch(72% 0.10 85)', 'oklch(32% 0.06 40)'],
  },
  'phosphor-terminal': {
    key: 'phosphor-terminal',
    label: 'Phosphor terminal',
    brief: 'Deep CRT-black background with a single phosphor accent (amber ~70, P1 green ~140, P3 white-blue ~210) used like a glowing trace. Often paired with a muted secondary scanline tint. The world is DEC VT220, ASR-33, oscilloscopes, early Bloomberg.',
    examples: ['oklch(12% 0.008 140)', 'oklch(82% 0.20 142)', 'oklch(28% 0.01 140)'],
  },
};

const PALETTE_FAMILY_KEYS = Object.keys(PALETTE_FAMILIES);

// Positional role order for bare-OKLCH-list custom palettes. When a user passes
// `--palette "oklch(..),oklch(..),oklch(..)"` without role labels, the values
// are assigned to these roles in order. Six entries — the typical max — extras
// truncate, shorts fall back to the family-default for the unfilled roles.
const POSITIONAL_ROLES = ['ink', 'paper', 'accent', 'accent-2', 'mute', 'line'];

// Deterministic pick from a list given a numeric seed (for reproducibility across
// rerun-from-cache). Date.now()/Math.random() are forbidden in the workflow body,
// so the seed has to come from elsewhere — we use a hash of the brief + run_slug.
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
}

// Split a string on a delimiter at the TOP LEVEL only — does not split inside
// matching parens. Needed so `oklch(56% 0.21 27)` survives comma-splitting in
// inline palette strings like `"ink:oklch(...),paper:oklch(...)"`.
function splitTopLevel(str, delim) {
  const parts = [];
  let depth = 0, buf = '';
  for (const ch of str) {
    if (ch === '(') { depth++; buf += ch; }
    else if (ch === ')') { depth = Math.max(0, depth - 1); buf += ch; }
    else if (ch === delim && depth === 0) { parts.push(buf); buf = ''; }
    else { buf += ch; }
  }
  if (buf.length > 0) parts.push(buf);
  return parts;
}

// Parse the --palette flag value into one of:
//   { kind: null }                                — flag was not passed
//   { kind: 'none' }                              — user passed `none`; bypass lock for this run
//   { kind: 'family', family }                    — one of the eight named families
//   { kind: 'custom', tokens }                    — inline role:value pairs OR positional OKLCH list
//   { kind: 'prose', text }                       — natural-language description; resolved by a translator agent later
//   { kind: 'invalid', input, hint }              — looked like SOMETHING but didn't parse cleanly enough
// Path-based loading (file → tokens) is NOT handled here — that's /set-palette's
// job (it has Read/Write tools and full file access semantics). The flag is for
// inline values only.
//
// Detection precedence: family key > "none" > inline OKLCH (role:value OR positional)
// > prose. Anything with at least a couple word characters and NO oklch(...) literal
// falls through to prose; the translator agent gets to interpret it. This is
// deliberately permissive — typo input ("indstrial-mno") routes to prose, where the
// translator may either rescue it (if context makes it obvious) or warn.
function parsePaletteArg(input) {
  if (input === undefined || input === null) return { kind: null };
  if (typeof input !== 'string') return { kind: null };
  const v = input.trim();
  if (v.length === 0) return { kind: null };

  if (v.toLowerCase() === 'none') return { kind: 'none' };
  if (PALETTE_FAMILY_KEYS.includes(v)) return { kind: 'family', family: v };

  const hasOklch = /oklch\s*\(/i.test(v);
  const hasColon = v.includes(':');

  // Inline role:value pairs. Detect by colon AND oklch presence. Example:
  //   "ink:oklch(18% 0.012 60),paper:oklch(94% 0.020 78),accent:oklch(56% 0.21 27)"
  if (hasColon && hasOklch) {
    const tokens = {};
    const parts = splitTopLevel(v, ',');
    for (const rawPart of parts) {
      const colonIdx = rawPart.indexOf(':');
      if (colonIdx < 0) continue;
      const role = rawPart.slice(0, colonIdx).trim().replace(/^--/, '');
      const value = rawPart.slice(colonIdx + 1).trim();
      if (role.length > 0 && /oklch\s*\(/i.test(value)) {
        tokens[role] = value;
      }
    }
    if (Object.keys(tokens).length > 0) return { kind: 'custom', tokens };
    return { kind: 'invalid', input: v, hint: 'looked like role:value pairs but no oklch(...) values parsed' };
  }

  // Bare positional list — N OKLCH values comma-separated, no roles. Assigns
  // them to POSITIONAL_ROLES in order. Example:
  //   "oklch(18% 0.012 60),oklch(94% 0.020 78),oklch(56% 0.21 27)"
  if (hasOklch) {
    const parts = splitTopLevel(v, ',').map((p) => p.trim()).filter((p) => p.length > 0);
    const tokens = {};
    for (let i = 0; i < parts.length && i < POSITIONAL_ROLES.length; i++) {
      if (/oklch\s*\(/i.test(parts[i])) tokens[POSITIONAL_ROLES[i]] = parts[i];
    }
    if (Object.keys(tokens).length > 0) return { kind: 'custom', tokens };
    return { kind: 'invalid', input: v, hint: 'looked like a positional OKLCH list but no oklch(...) values parsed' };
  }

  // Prose path. Anything with ≥6 characters AND ≥2 word characters AND no oklch(
  // is treated as a natural-language description. The translator agent will turn
  // it into OKLCH tokens later in the workflow body. Inputs shorter than that
  // are most likely typos or garbage and fall through to 'invalid'.
  const wordCharCount = (v.match(/[A-Za-z]/g) ?? []).length;
  if (v.length >= 6 && wordCharCount >= 4) {
    return { kind: 'prose', text: v };
  }

  return { kind: 'invalid', input: v, hint: 'not a family key, not "none", not OKLCH, and too short to be a prose description' };
}

// Path resolver. project_root is passed by the command markdown.
// HARD CONTRACT: project_root must be a non-empty absolute path. No silent fallback —
// a missing or empty project_root used to fall back to the presto repo, which caused
// runs invoked from other projects to write into presto/ instead of the user's cwd
// (v0.1.7 regression). Throw loudly so the bug is visible at workflow startup.
// Keep this a function declaration (hoisted) — the body above runs in source order
// and would TDZ-error against any top-level `const` referenced from inside the function.
function resolvePaths(projectRoot) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    throw new Error(
      'houdini.js resolvePaths: args.project_root is required (got "' + String(projectRoot) + '"). ' +
      'The command markdown must capture `pwd` via Bash and pass it as project_root in the Workflow args.'
    );
  }
  if (!projectRoot.startsWith('/')) {
    throw new Error(
      'houdini.js resolvePaths: args.project_root must be an absolute path (got "' + projectRoot + '").'
    );
  }
  const root = projectRoot;
  return {
    projectRoot: root,
    seedsDir: `${root}/seeds`,
    memoryDir: `${root}/memory`,
    starterPath: `${root}/seeds/starter.html`,
    tokensPath: `${root}/seeds/tokens.css`,
    designApproachPath: `${root}/memory/DESIGN_APPROACH.md`,
    palettePath: `${root}/memory/PALETTE.json`,
    recentPalettesPath: `${root}/memory/recent-palettes.json`,
  };
}

const DRAFT_RULES = [
  'OKLCH for all color values. No hex. No rgb. No hsl. Put colors on :root as custom properties (--ink, --paper, --accent, etc.).',
  'BANNED defaults (impeccable): gradient text on the hero headline; vertical side-stripe accent bars as a decorative motif; glass / frosted surfaces used by default; the hero-metric template ("10x faster, 99.9% uptime"); identical 3-up card grids as the only content rhythm; an eyebrow label on every section (max 1 per 3 sections); numbered 01 / 02 / 03 scaffolding as the default section header pattern.',
  'BANNED defaults (design-taste-frontend): AI-purple (the indigo-violet gradient family ~ oklch(0.55 0.20 280)); Inter as the default sans body; the beige + brass premium-consumer palette; a centered hero floating over a mesh gradient.',
  'emil polish, baked in: define easing tokens on :root — --ease-out: cubic-bezier(.16,1,.3,1); --ease-spring: cubic-bezier(.34,1.56,.64,1). Every interactive control (button, link-card, tab) gets transform: scale(0.97) on :active with transition: transform 120ms var(--ease-out). Wrap all motion in @media (prefers-reduced-motion: no-preference) or guard with the reduce query.',
  'Length: 220 to 380 lines total, including embedded <style>. No external CSS or JS.',
  'Real content. No lorem ipsum. The hero headline, sub, and CTA must read as if shipped. Pull names, numbers, and copy that fit the brief.',
  'Structure: <head> with viewport + title + a single <style> block; <body> with a real hero + 2 to 3 distinct sections (e.g. feature triad, manifesto column, gallery, pricing strip, FAQ, footer). The sections should NOT all be 3-up card grids; vary the rhythm.',
  'Self-contained: openable as a single file. System-font fallbacks acceptable; if you specify a Google font in CSS, include the @import at the top of the <style> block.',
  'Accessibility: real heading order (one h1, then h2s), buttons are <button>, links are <a>, contrast meets WCAG AA against the chosen --paper / --ink.',
  'Imagery policy (driven by EMBED PERMISSION line in your prompt — read it carefully): your prompt tells you EXACTLY how many mood images you may embed (zero or a positive integer N). When N=0, do NOT insert any <img> tag pointing at mood-K.png — period. When N>0, you MAY embed up to N of the available mood images as real app content IF they read as on-brand assets the user would expect inside the running product (e.g. stippled dog medallions in a dog field-guide app, lookbook plates in a fashion shop). Use RELATIVE paths only: <img src="mood-1.png" alt="..."> (no leading slash, no file://, no http). Draft, mood, and the eventual starter all sit in presto/seeds/, so relatives resolve. Embed SPARINGLY — palette/type/composition should still carry most of the world; embedding is for cases where the mood image IS the asset, not as decoration. Always: return the actual relative paths you embedded in the "embedded_mood_images" array of your JSON metadata (e.g. ["mood-1.png", "mood-3.png"]); empty array if you embedded none. If you need imagery beyond the mood board, use picsum.photos with a deterministic seed (https://picsum.photos/seed/draft-N-hero/1600/900) or commit to pure-CSS/typography/SVG. NEVER <img src="file:///absolute/path"> — relative paths only.',
];

// ---------- Workflow body ----------
// Top-level procedural body. The Workflow runtime injects { args, agent, phase,
// parallel, log } as globals — do NOT wrap in `export default async function`;
// Claude Code's workflow loader strips the meta export and compiles the
// remaining body in a vm context that does NOT support module-level exports.

  // Normalize args. Claude Code v2.1.158's Workflow harness delivers `args` as a
  // JSON-encoded STRING, not an object — even though the tool docs imply object.
  // Parse here to recover the object so ARGS.project_root etc. work. Accept either
  // shape in case a future harness flips back to native objects.
  let ARGS;
  if (typeof args === 'string') {
    try { ARGS = JSON.parse(args); }
    catch (e) {
      throw new Error(`houdini workflow: args arrived as a string but is not valid JSON. snippet=${String(args).slice(0, 400)}`);
    }
  } else if (args && typeof args === 'object') {
    ARGS = args;
  } else {
    throw new Error(`houdini workflow: args is neither object nor JSON string (got ${typeof args}).`);
  }

  // Resolve project-relative paths once per run. project_root is passed by the
  // command markdown. Throws if missing — no silent fallback.
  const PATHS = resolvePaths(ARGS.project_root);
  const SEEDS_DIR = PATHS.seedsDir;
  const STARTER_PATH = PATHS.starterPath;
  const TOKENS_PATH = PATHS.tokensPath;
  const DESIGN_APPROACH_PATH = PATHS.designApproachPath;
  log(`houdini: project_root=${PATHS.projectRoot} seeds_dir=${SEEDS_DIR}`);

  const brief = ARGS.brief ?? '';
  const designRead = ARGS.design_read ?? '';
  const constraints = ARGS.constraints ?? '';
  const visualBrief = typeof ARGS.visual_brief === 'string' ? ARGS.visual_brief : '';
  const autonomous = ARGS.autonomous === true;
  const skipImageGen = ARGS.skip_image_gen === true;
  const keywords = Array.isArray(ARGS.keywords) ? ARGS.keywords.filter((k) => typeof k === 'string' && k.trim().length > 0) : [];
  const hasKeywords = keywords.length > 0;
  const hasVisualBrief = visualBrief.trim().length > 0;

  // Resolve mode for downstream tooling (DESIGN_APPROACH.md, /magic).
  const mode = autonomous ? 'autonomous' : (hasKeywords ? 'keywords' : 'guided');

  // ---------- Flag resolution: mood_board_count + embed_images ----------
  // Tracks whether each was explicit so we know when to auto-bump vs warn.
  const moodCountExplicit = Number.isInteger(ARGS.mood_board_count);
  const embedExplicit = Number.isInteger(ARGS.embed_images);

  let moodCount = moodCountExplicit ? ARGS.mood_board_count : 3;
  if (moodCount < 1) moodCount = 1;
  if (moodCount > 5) {
    log(`WARN: --gen ${moodCount} exceeds cap of 5; clamping to 5.`);
    moodCount = 5;
  }

  // embed_images default: autonomous → 2, else → 0. Explicit value (incl. 0) wins.
  let embedCount = embedExplicit ? ARGS.embed_images : (autonomous ? 2 : 0);
  if (embedCount < 0) embedCount = 0;

  // Safety A: --nogen wins over --useimg.
  if (skipImageGen && embedCount > 0) {
    log(`WARN: --useimg ${embedCount} ignored because --nogen is set (no images to embed).`);
    embedCount = 0;
  }

  // Safety B: useimg > generated count.
  if (!skipImageGen && embedCount > moodCount) {
    if (!moodCountExplicit) {
      // Implicit underspec: silently auto-bump mood_board_count to match (capped at 5).
      const bumped = Math.min(5, embedCount);
      log(`note: --useimg ${embedCount} > default --gen 3; auto-bumping mood_board_count to ${bumped}.`);
      if (embedCount > 5) {
        log(`WARN: --useimg ${embedCount} exceeds cap of 5; clamping to 5.`);
        embedCount = 5;
      }
      moodCount = bumped;
    } else {
      // Both explicit and conflicting: clamp useimg + emit visible WARN.
      log(`WARN: --useimg ${embedCount} > --gen ${moodCount}; clamping useimg to ${moodCount}. (run continues)`);
      embedCount = moodCount;
    }
  }

  // n_drafts: autonomous mode forces 1; otherwise honor caller (default 3).
  const requestedN = Number.isInteger(ARGS.n_drafts) ? ARGS.n_drafts : 3;
  const nDrafts = autonomous ? 1 : requestedN;

  // Angle resolution.
  let angles;
  if (autonomous) {
    const overrideKey = typeof ARGS.angle_override === 'string' ? ARGS.angle_override : 'wildcard';
    const resolvedAngle = ANGLE_OVERRIDE_MAP[overrideKey] ?? ANGLE_OVERRIDE_MAP.wildcard;
    angles = [resolvedAngle];
  } else {
    const requestedAngles = Array.isArray(ARGS.angles) && ARGS.angles.length > 0
      ? ARGS.angles
      : DEFAULT_ANGLES;
    angles = [];
    for (let i = 0; i < nDrafts; i++) {
      angles.push(requestedAngles[i] ?? 'wildcard overcommit');
    }
  }

  const keywordsBlock = hasKeywords
    ? `Keywords (PRIMARY design signal, weight equal to the brief itself): ${JSON.stringify(keywords)}\n`
    : '';

  // ---------- Palette family resolution ----------
  // Three states the workflow respects:
  //   1. LOCKED   — memory/PALETTE.json present. Use lock.family verbatim. anti-list dormant.
  //   2. OVERRIDE — args.palette is a family-key string OR "none". "none" clears the lock
  //                 effect for this run only (does not delete the file); a family key
  //                 forces that family.
  //   3. EXPLORE  — no lock + no override. In autonomous mode, rotate deterministically
  //                 using the recent-palettes anti-list. In multi-draft modes, leave
  //                 paletteFamily=null so each drafter picks its own (variance preserved).
  //
  // The agent does the actual disk reads. We synthesise an INTENT block here that the
  // first agent call (the Brief directive) will respect, and we pre-load the lock/recent
  // via a small probe agent so the rest of the body can branch.
  const paletteArg = typeof ARGS.palette === 'string' ? ARGS.palette.trim() : '';
  const paletteParsed = parsePaletteArg(paletteArg);
  if (paletteParsed.kind === 'invalid') {
    log(`WARN: --palette "${paletteParsed.input}" did not parse — ${paletteParsed.hint}. Treating as unset; the run will fall back to lock-or-explore mode. Valid forms: a family key (${PALETTE_FAMILY_KEYS.join(' | ')}); the literal "none"; inline "role:oklch(...),role:oklch(...)"; a bare comma-separated OKLCH list (positional roles: ${POSITIONAL_ROLES.join(', ')}); or a natural-language description (e.g. "warm coral with complementing tones").`);
  }

  // Prose path. Translate the natural-language description into OKLCH tokens via a
  // small focused agent BEFORE state resolution. The translator gets the brief +
  // design read as context so it can interpret phrases like "complement the brand
  // accent" correctly. Output drops into the same custom-tokens slot as inline.
  let paletteProseText = null;
  let paletteProseInterpretation = null;
  let paletteOverrideCustomFromProse = null;
  if (paletteParsed.kind === 'prose') {
    paletteProseText = paletteParsed.text;
    log(`palette: --palette is prose ("${paletteProseText.slice(0, 80)}${paletteProseText.length > 80 ? '…' : ''}"); invoking translator.`);
    const translator = await agent(
      `OWNER: impeccable (OKLCH palette discipline).\n` +
      `\n` +
      `The user passed a natural-language description as their --palette value. Translate it into 3-6 OKLCH tokens that a frontend drafter can put directly on :root.\n` +
      `\n` +
      `Prose description: ${JSON.stringify(paletteProseText)}\n` +
      `Brief (for context, may be empty): ${JSON.stringify(brief)}\n` +
      `Design Read (for context, may be empty): ${JSON.stringify(designRead)}\n` +
      `\n` +
      `RULES.\n` +
      `1. OUTPUT FORMAT. Return JSON with two fields: { "tokens": { "<role>": "oklch(L% C H)", ... }, "interpretation": "<one short sentence explaining how you read the prose>" }.\n` +
      `2. ROLE NAMES. Use these canonical roles when applicable: ink (the dominant text color), paper (the dominant background), accent (the primary saturated accent), accent-2 (optional second accent), mute (a muted secondary text/border color), line (rule/divider color). You MAY add other roles if the prose explicitly names them (e.g. "danger:..., success:...").\n` +
      `3. OKLCH ONLY. Every value is an oklch(...) literal. L expressed as percentage (e.g. 56%). C as decimal 0–0.4. H in degrees 0–360. No hex, no rgb, no hsl.\n` +
      `4. CHROMA DISCIPLINE. Match the description's tone — "warm coral" implies moderate chroma 0.10–0.18, not 0.28; "muted forest" implies low chroma 0.04–0.08; "electric lime" implies near-gamut chroma 0.25+.\n` +
      `5. CONTRAST. ink-paper pair must clear WCAG AA against a normal-text body. If the prose names only an accent or only a background, derive the other anchors to clear AA.\n` +
      `6. ANTI-DEFAULTS. Banned by both impeccable and design-taste-frontend regardless of how the prose phrases it: AI-purple (indigo-violet gradient family centered ~280 hue); generic beige + brass premium-consumer family; pure #000 on pure #FFF (always warm-bias one of them); Inter-flavored neutrals when the prose calls for character. If the prose seems to ask for one of these, redirect to the nearest legitimate equivalent and call it out in interpretation.\n` +
      `7. INTERPRETATION. One sentence. Name what you anchored on. Examples: "Read this as warm-paper editorial with a coral spot color; anchored on a soft cream paper and warm-charcoal ink, with the coral at moderate chroma." OR "Read 'phosphor terminal' literally — black CRT background, single phosphor-amber accent."\n` +
      `\n` +
      `If the prose is too vague to translate (e.g. "make it nice"), STILL produce a token set — pick the most defensible interpretation given the brief and explain in interpretation that you guessed. Never refuse; the workflow needs tokens to proceed.\n` +
      `\n` +
      `Return ONLY the JSON object matching the schema.`,
      {
        schema: {
          type: 'object',
          required: ['tokens', 'interpretation'],
          properties: {
            tokens: {
              type: 'object',
              minProperties: 2,
              maxProperties: 8,
              additionalProperties: {
                type: 'string',
                pattern: '^oklch\\s*\\(',
              },
            },
            interpretation: { type: 'string', minLength: 8 },
          },
        },
        label: 'palette-translate',
        phase: 'Brief',
      }
    );
    if (translator && translator.tokens && Object.keys(translator.tokens).length >= 2) {
      paletteOverrideCustomFromProse = translator.tokens;
      paletteProseInterpretation = translator.interpretation;
      log(`palette: prose translated → ${Object.keys(translator.tokens).length} tokens (${Object.keys(translator.tokens).join(', ')}). interpretation: ${translator.interpretation}`);
    } else {
      log(`WARN: palette translator returned no usable tokens; treating --palette prose as unset for this run.`);
    }
  }

  const paletteOverrideClears = paletteParsed.kind === 'none';
  const paletteOverrideKey = paletteParsed.kind === 'family' ? paletteParsed.family : null;
  const paletteOverrideCustom = (paletteParsed.kind === 'custom' ? paletteParsed.tokens : null)
    ?? paletteOverrideCustomFromProse;

  // Probe disk for PALETTE.json + recent-palettes.json. One read-only agent, no schema —
  // returns parsed JSON or nulls.
  const paletteProbe = await agent(
    `Read-only probe. Do these two file reads and return a JSON object with the results.\n` +
    `\n` +
    `STEP 1. Use the Bash tool to check whether each file exists:\n` +
    `  test -f ${PATHS.palettePath} && echo lock-yes || echo lock-no\n` +
    `  test -f ${PATHS.recentPalettesPath} && echo recent-yes || echo recent-no\n` +
    `\n` +
    `STEP 2. If lock-yes, Read ${PATHS.palettePath} and parse its JSON. Capture the "family" field (string) and "tokens" field (object).\n` +
    `STEP 3. If recent-yes, Read ${PATHS.recentPalettesPath} and parse its JSON. Capture the "recent" array of { family } entries.\n` +
    `\n` +
    `Return EXACTLY this shape:\n` +
    `{ "lock": { "family": "<key>", "tokens": {...} } | null, "recent": ["<family-key>", ...] | [] }\n` +
    `\n` +
    `If a file does not exist or fails to parse, return null/[] for that field. Do not throw.`,
    {
      schema: {
        type: 'object',
        required: ['lock', 'recent'],
        properties: {
          lock: {
            type: ['object', 'null'],
            properties: {
              family: { type: 'string' },
              tokens: { type: 'object' },
            },
          },
          recent: { type: 'array', items: { type: 'string' } },
        },
      },
      label: 'palette-probe',
      phase: 'Brief',
    }
  );

  const lockedFamily = (paletteProbe?.lock?.family && PALETTE_FAMILY_KEYS.includes(paletteProbe.lock.family))
    ? paletteProbe.lock.family
    : null;
  const lockedTokens = (paletteProbe?.lock?.tokens && typeof paletteProbe.lock.tokens === 'object')
    ? paletteProbe.lock.tokens
    : null;
  const recentList = Array.isArray(paletteProbe?.recent)
    ? paletteProbe.recent.filter((k) => typeof k === 'string')
    : [];

  // Resolve effective palette state for THIS run.
  let paletteState; // 'locked' | 'override' | 'explore'
  let paletteFamily; // string key, 'custom', or null
  let paletteCustomTokens = null; // populated when family === 'custom' (override OR locked)

  if (paletteOverrideClears) {
    paletteState = 'override';
    paletteFamily = null;
    log(`palette: --palette none → cleared for this run (lock file untouched).`);
  } else if (paletteOverrideCustom) {
    paletteState = 'override';
    paletteFamily = 'custom';
    paletteCustomTokens = paletteOverrideCustom;
    const roleList = Object.keys(paletteOverrideCustom).join(', ');
    log(`palette: --palette custom (${Object.keys(paletteOverrideCustom).length} tokens: ${roleList}) → forced for this run (lock file untouched).`);
  } else if (paletteOverrideKey) {
    paletteState = 'override';
    paletteFamily = paletteOverrideKey;
    log(`palette: --palette ${paletteOverrideKey} → forced family for this run.`);
  } else if (lockedFamily) {
    paletteState = 'locked';
    paletteFamily = lockedFamily;
    // When the lock's family is 'custom' (or anything outside the eight known keys),
    // the lock's tokens are the only source of truth — there is no canonical brief.
    if (!PALETTE_FAMILIES[lockedFamily] && lockedTokens) {
      paletteCustomTokens = lockedTokens;
    }
    log(`palette: locked to ${lockedFamily} (from memory/PALETTE.json).`);
  } else {
    paletteState = 'explore';
    if (autonomous) {
      // Deterministic rotation: pick the first family NOT in recent. Seeded by hash of
      // brief + run_slug so reruns are stable. If every family is in recent (recent is
      // longer than the family set), reset and pick the oldest-rotation slot.
      const seed = djb2(String(brief) + '|' + (ARGS.run_slug ?? ''));
      const recentSet = new Set(recentList);
      const fresh = PALETTE_FAMILY_KEYS.filter((k) => !recentSet.has(k));
      const pool = fresh.length > 0 ? fresh : PALETTE_FAMILY_KEYS;
      paletteFamily = pool[seed % pool.length];
      log(`palette: explore mode autonomous → rotated to ${paletteFamily} (anti-list: [${recentList.join(', ')}]).`);
    } else {
      paletteFamily = null;
      log(`palette: explore mode multi-draft → no forced family; each drafter picks (anti-list: [${recentList.join(', ')}]).`);
    }
  }

  // Compose the palette block injected into every drafter and the brief director.
  // Different shape depending on state — locked is the strictest, explore is the loosest.
  const paletteBlock = (() => {
    // Helper: render a tokens-object as :root custom-property lines.
    const renderTokenLines = (tokens) => Object.entries(tokens)
      .map(([k, v]) => `    --${k}: ${v};`)
      .join('\n');
    // Helper: a generic "use these tokens" instruction for custom palettes (no canonical brief).
    const customSourceLine = (source) =>
      `  This is a CUSTOM palette (no canonical family brief). The OKLCH values below ARE the design language; build the page entirely within them. Compose the rest of the world (type, motion, density, composition) to feel correct for THIS palette specifically — read what the colors imply (saturation, hue distance, contrast) and let the design follow. Source: ${source}.`;

    // Custom palette, regardless of state (override or locked) — same shape, slightly different framing.
    if (paletteFamily === 'custom' && paletteCustomTokens) {
      const label = paletteState === 'locked' ? 'LOCKED (custom)' : 'OVERRIDE (custom)';
      let source;
      if (paletteState === 'locked') source = 'memory/PALETTE.json (locked)';
      else if (paletteProseText) source = `--palette prose: ${JSON.stringify(paletteProseText)} (translated)`;
      else source = '--palette inline override';
      const proseLine = paletteProseText && paletteProseInterpretation
        ? `  Translator interpretation: ${paletteProseInterpretation}\n`
        : '';
      return (
        `PALETTE — ${label}:\n` +
        customSourceLine(source) + `\n` +
        proseLine +
        `  REQUIRED :root tokens (use exactly these — do not substitute, do not reinterpret):\n` +
        renderTokenLines(paletteCustomTokens) + `\n` +
        (paletteState === 'locked'
          ? `  Drift is an AUDIT failure: do not redefine any of the above roles with a different OKLCH value.\n`
          : `  Override is per-run; the project's lock file (if any) is untouched.\n`)
      );
    }

    if (paletteState === 'locked' && lockedTokens) {
      return (
        `PALETTE — LOCKED (from memory/PALETTE.json, family="${paletteFamily}"):\n` +
        `  This project has committed to a palette. You MUST use these exact OKLCH tokens on :root and build the page entirely within this palette family. Do not invent additional accents. Do not substitute hex/rgb. Do not reinterpret.\n` +
        `  Locked :root tokens:\n` +
        renderTokenLines(lockedTokens) + `\n` +
        `  Family brief (for vibe alignment, not for token substitution): ${PALETTE_FAMILIES[paletteFamily]?.brief ?? ''}\n`
      );
    }
    if (paletteFamily && PALETTE_FAMILIES[paletteFamily]) {
      const fam = PALETTE_FAMILIES[paletteFamily];
      return (
        `PALETTE FAMILY — ${paletteFamily} (${fam.label}):\n` +
        `  Commit to this OKLCH world. ${fam.brief}\n` +
        `  Example OKLCH values (illustrative — do not copy verbatim, pick your own that LIVE in this family): ${fam.examples.join(', ')}\n` +
        (recentList.length > 0 ? `  ANTI-LIST (recently used in this project; DO NOT drift into them): [${recentList.join(', ')}]\n` : '')
      );
    }
    // explore + multi-draft: tell each drafter to pick a DIFFERENT family from the others
    const antiLine = recentList.length > 0
      ? `  ANTI-LIST (recently used in this project; avoid drifting into them): [${recentList.join(', ')}]\n`
      : '';
    const familyMenu = PALETTE_FAMILY_KEYS.map((k) => `    - ${k}: ${PALETTE_FAMILIES[k].label}`).join('\n');
    return (
      `PALETTE FAMILY — pick one (you are drafter N of ${nDrafts}; each drafter MUST pick a DIFFERENT family from these):\n` +
      familyMenu + `\n` +
      antiLine +
      `  Commit to one family and stay inside it. Drafters that drift toward the warm-paper-with-red-accent default will be rejected.\n`
    );
  })();

  // ---------- 1. BRIEF (art-direct the drafters) ----------
  phase('Brief');

  const briefHeader = autonomous
    ? `MODE: autonomous solo run. There is ONE drafter, not three. There is NO user iteration after this. Skip the per-angle expansion — produce a SINGLE creative directive for the one angle below, then commit.\n` +
      `Sole angle: ${JSON.stringify(angles[0])}\n`
    : `You are art-directing ${nDrafts} parallel drafters. They will each produce one starter HTML file in a different creative direction, then the user picks one.\n` +
      `Angles, in order: ${JSON.stringify(angles)}\n`;

  const briefDirectiveSpec = autonomous
    ? `  1. creative_directive_for_each_angle — an ARRAY OF EXACTLY ONE entry: a pointed directive that names a specific visual world the lone drafter must commit to. Because there is no user to choose, lean toward conviction, not safety.\n` +
      `  2. shared_constraints — non-negotiables the drafter respects.\n`
    : `  1. creative_directive_for_each_angle — one pointed directive per angle, IN THE SAME ORDER as angles above. Each directive must name a specific visual world the drafter should commit to (e.g. "Swiss editorial weekly with a single accent ink, body type set in a serif at 18px", not "modern and clean"). The directives must produce drafts that are aesthetic FAMILIES apart, not three flavours of one default.\n` +
      `  2. shared_constraints — non-negotiables every drafter respects (accessibility level, audience reading-age, regulated-industry trust signals, brand assets that must appear, etc.). Pull these from the Design Read and caller constraints; do not invent.\n`;

  const briefPrompt =
    `OWNER: impeccable (art direction discipline).\n` +
    briefHeader +
    `\n` +
    `Brief: ${JSON.stringify(brief)}\n` +
    `Design Read: ${JSON.stringify(designRead)}\n` +
    `Caller constraints: ${JSON.stringify(constraints)}\n` +
    keywordsBlock +
    `\n` +
    paletteBlock +
    `\n` +
    `Produce TWO things:\n` +
    briefDirectiveSpec +
    `  Also include mode: ${JSON.stringify(mode)}.\n` +
    (hasKeywords ? `  Every directive MUST treat the keywords as primary seed terms — they are NOT optional flavor; they carry weight equal to the brief.\n` : '') +
    (paletteFamily ? `  Every directive MUST honour the palette family above; do not silently drift into the warm-paper-with-red default.\n` : '  Every directive MUST name a specific palette family from the menu above; do not silently drift into the warm-paper-with-red default.\n') +
    `\n` +
    `Return ONLY the JSON object matching the schema.`;

  const directive = await agent(briefPrompt, { schema: DIRECTIVE_SCHEMA, label: 'directive', phase: 'Brief' });

  const perAngleDirectives = Array.isArray(directive?.creative_directive_for_each_angle)
    ? directive.creative_directive_for_each_angle
    : [];
  const sharedConstraints = Array.isArray(directive?.shared_constraints)
    ? directive.shared_constraints
    : [];

  // ---------- 2. MOOD BOARD (3 inspirational images via nanogen MCP) ----------
  phase('MoodBoard');

  const moodSignalBlock = autonomous
    ? `MODE SIGNAL: autonomous wildcard. There is no user visual_brief. Derive the three mood prompts yourself from the brief, design_read, and the sole angle/directive below. Lean into a singular, opinionated visual world — not safe defaults.\n`
    : hasKeywords
      ? `MODE SIGNAL: keywords. Treat these keywords as the PRIMARY signal driving the mood board: ${JSON.stringify(keywords)}. They carry weight equal to the brief; every mood image must legibly reflect them in palette, light, media, or composition.\n`
      : hasVisualBrief
        ? `MODE SIGNAL: guided with visual_brief. The user-supplied visual_brief is the DOMINANT signal — every mood image must be a faithful interpretation of it. visual_brief: ${JSON.stringify(visualBrief)}\n`
        : `MODE SIGNAL: guided (no visual_brief supplied). Derive the three mood prompts from the brief + design_read + directives below.\n`;

  const moodPrompt =
    `OWNER: imagen-direction + impeccable. Produce a mood board to anchor the drafters that run next. The mood board can come from THREE sources, in priority order: (1) user-provided resources already sitting in the seeds directory; (2) nanogen-generated images via the MCP; (3) prose-only fallback when neither is available.\n` +
    `\n` +
    moodSignalBlock +
    `\n` +
    `Brief: ${JSON.stringify(brief)}\n` +
    `Design Read: ${JSON.stringify(designRead)}\n` +
    `Caller constraints: ${JSON.stringify(constraints)}\n` +
    `Art-direction directives (one per angle): ${JSON.stringify(perAngleDirectives)}\n` +
    `Shared constraints: ${JSON.stringify(sharedConstraints)}\n` +
    `\n` +
    `Flags resolved by the workflow (do NOT override):\n` +
    `  mood_board_count requested: ${moodCount}\n` +
    `  mood_board_count was explicit (--gen): ${moodCountExplicit}\n` +
    `  skip_image_gen (--nogen): ${skipImageGen}\n` +
    `\n` +
    `STEP 0 — SEED SCAN (do this BEFORE any tool work).\n` +
    `Use Bash to list ${SEEDS_DIR}: \`ls -1 ${SEEDS_DIR} 2>/dev/null\`. From the output, identify USER-PROVIDED files: any file whose name does NOT match these workflow-owned patterns — mood-1.png through mood-5.png, draft-1.html through draft-5.html, starter.html, tokens.css. The remainder (e.g. brand-logo.svg, inspiration.jpg, screenshot-of-rival.png, ref-cover.png, refs/, brand/) are USER REFS. Any quantity is valid — do not cap or filter by count. If a refs/ or brand/ subdirectory exists, ls it too and include the image files inside.\n` +
    `\n` +
    `STEP 0b — DECIDE THE MOOD-BOARD STRATEGY based on what STEP 0 found and the flags above:\n` +
    `  A. NO user refs AND skip_image_gen=true → BAIL: return mood_board: [], visual_direction_summary derived from brief + directives alone. Skip steps 1-5.\n` +
    `  B. NO user refs AND skip_image_gen=false → PURE GENERATE: run nanogen steps 1-5 to produce ${moodCount} mood images (this is the original behavior).\n` +
    `  C. User refs PRESENT AND skip_image_gen=true → REFS ONLY: run STEP 4-describe on the user-ref files (no generate), compose visual_direction_summary from their describe output. Skip steps 1-3 (nothing to generate).\n` +
    `  D. User refs PRESENT AND skip_image_gen=false AND mood_board_count was NOT explicit → REPLACE (default): treat user refs as the mood board. Run STEP 4-describe on each user ref. Skip generation. visual_direction_summary draws from the describe output.\n` +
    `  E. User refs PRESENT AND mood_board_count WAS explicit (--gen-N passed) → AUGMENT: run STEP 4-describe on user refs (treat as moods 1..K where K = user-ref count), THEN run STEP 2-3-4-generate for ${moodCount} ADDITIONAL prompts that EXPLICITLY REFERENCE the user inputs (palette echo, composition echo, material echo). Final mood_board contains both: user refs first, generated last.\n` +
    `Log which path you took (A/B/C/D/E) as the first line of your output reasoning before the JSON.\n` +
    `\n` +
    `STEP 1. Load the nanogen tool schemas (only needed for paths B, C, D, E). Call ToolSearch with the query:\n` +
    `  "select:mcp__plugin_presto_nanogen__generate,mcp__plugin_presto_nanogen__describe"\n` +
    `You CANNOT invoke the tools until their schemas are loaded — calling without ToolSearch first will fail with InputValidationError.\n` +
    `\n` +
    `STEP 2. Author EXACTLY ${moodCount} prompt(s) spanning the FIRST ${moodCount} vantage(s) from this ordered list (do NOT skip earlier vantages — N=1 means only hero, N=5 means all five in order):\n` +
    `  (a) hero-mood — a dominant scene that establishes the world (aspect 16:9, output_path: ${SEEDS_DIR}/mood-1.png)\n` +
    `  (b) lifestyle-mood — the use context: someone or something using/inhabiting the product space (aspect 3:2, output_path: ${SEEDS_DIR}/mood-2.png)\n` +
    `  (c) detail-mood — close-up material, texture, or surface from the world (aspect 1:1, output_path: ${SEEDS_DIR}/mood-3.png)\n` +
    `  (d) atmosphere-mood — environment/negative-space wide shot conveying mood without showing the subject directly (aspect 16:9, output_path: ${SEEDS_DIR}/mood-4.png)\n` +
    `  (e) texture-fragment — extreme macro of a single material/surface motif used in the world (aspect 1:1, output_path: ${SEEDS_DIR}/mood-5.png)\n` +
    `\n` +
    `STEP 3. Each prompt is 1-3 sentences. NOT an essay. Structure: [media + light specifics]. [subject + composition + cropping]. [palette in OKLCH]. End with: "No text in image, no logos, no watermarks."\n` +
    `\n` +
    `ANTI-SLOP (enforced with force): BANNED anchor words — "epic", "cinematic", "dreamy", "vibrant", "stunning", "8k", "ultra-detailed", "hyperrealistic", "golden hour" (specify light direction instead), "bokeh" (unless lens-justified). BANNED compositions — centered subject, symmetric three-quarter portrait, hero object on clean gradient, floating product on white seamless. REQUIRED patterns — editorial off-center framing, harsh window light from a specified direction, specific media (35mm grain, scanned slide film, medium-format Portra 400, risograph two-color, cyanotype), edge-of-frame cropping, brand palette dominant and named in OKLCH.\n` +
    `\n` +
    `STEP 4. Image work — varies by path from STEP 0b:\n` +
    `  Paths B/E (generate): for each prompt authored in step 2, call mcp__plugin_presto_nanogen__generate with the prompt + aspect_ratio + output_path. Then call mcp__plugin_presto_nanogen__describe on the RETURNED path.\n` +
    `  Paths C/D (refs only / replace): for each user-ref file from STEP 0, call mcp__plugin_presto_nanogen__describe on it (no generate). The describe output supplies palette_oklch + style_tags. In the mood_board entry, set path = the user ref's absolute path, prompt_used = "user-provided reference: <filename>".\n` +
    `  Path E (augment): do BOTH — describe all user refs first (they become moods 1..K), then generate ${moodCount} additional and describe each (moods K+1..K+${moodCount}).\n` +
    `\n` +
    `STEP 5. Compose visual_direction_summary — 2-4 sentences of prose that captures the through-line of the FINAL mood board (whatever ended up in it): the world, the light, the material, the palette, the feeling. The drafters in the next phase will use this as their primary anchor. When user refs drove the board, name explicitly that the direction inherits from user-provided imagery.\n` +
    `\n` +
    `FALLBACK: if ToolSearch fails, if generate returns an error (no GEMINI_API_KEY, quota/rate-limit, MCP server unreachable, malformed response), or if describe fails — DO NOT block the workflow. Return mood_board as an empty array [] and put the entire direction into visual_direction_summary as a rich text-only description of what the mood board WOULD have shown (in vantage order: hero, lifestyle, detail, atmosphere, texture-fragment — only the first ${moodCount}). When user refs were present but describe failed, still list their filenames and a prose description of each based on the filename + brief alone. The drafters can work from prose alone.\n` +
    `\n` +
    `Return ONLY the JSON object matching the schema.`;

  let moodBoard;
  if (skipImageGen) {
    moodBoard = { mood_board: [], visual_direction_summary: '' };
    log('MoodBoard skipped via skip_image_gen flag. Drafters will rely on brief + design_read + directive alone.');
  } else {
    moodBoard = await agent(moodPrompt, { schema: MOOD_BOARD_SCHEMA, label: 'mood-board', phase: 'MoodBoard' });
  }

  const moodImages = Array.isArray(moodBoard?.mood_board) ? moodBoard.mood_board : [];
  const visualDirectionSummary = typeof moodBoard?.visual_direction_summary === 'string' ? moodBoard.visual_direction_summary : '';
  log(`houdini-drafts mood board: ${moodImages.length} image(s) generated. summary length=${visualDirectionSummary.length}.`);

  // ---------- 3. DRAFT (parallel HTML generation) ----------
  phase('Draft');

  const draftRulesBlock = DRAFT_RULES.map((r, i) => `  ${i + 1}. ${r}`).join('\n');

  const moodBoardForDrafterBlock = (() => {
    if (skipImageGen && moodImages.length === 0 && !visualDirectionSummary) {
      return `VISUAL DIRECTION: (no mood board this run — image generation was skipped via --nogen. Anchor your draft entirely in the brief, design_read, and your assigned creative directive below.)\n`;
    }
    // Effective embed cap = min(embedCount, actual generated count). Belt-and-suspenders
    // against post-MoodBoard partial failure (e.g. 5 requested, 3 succeeded → cap at 3).
    const effectiveEmbed = Math.min(embedCount, moodImages.length);
    const embedPermission = effectiveEmbed > 0
      ? `EMBED PERMISSION: you MAY embed UP TO ${effectiveEmbed} of these mood image(s) directly in the HTML if they read as on-brand assets the user would expect inside the running product (e.g. for a dog field-guide app, stippled dog medallions ARE the kind of imagery the app needs). Use RELATIVE paths only: <img src="mood-1.png" alt="..."> — draft, mood, and final starter all sit in presto/seeds/. Embed sparingly; the visual world should still come mostly through palette/type/composition. ${autonomous ? 'AUTONOMOUS mode — your draft becomes the starter directly, so embeds are preserved.' : `${mode.toUpperCase()} mode with explicit --useimg — the HAND-OFF will record your embedded paths in DESIGN_APPROACH.md so downstream /magic Build preserves them.`} After writing the draft, you MUST return the actual relative paths you embedded in the metadata field "embedded_mood_images" (e.g. ["mood-1.png", "mood-3.png"]) — empty array [] if you chose to embed none.`
      : `EMBED PERMISSION: do NOT embed any of these mood images. They are pure inspiration; translate to palette, type, composition, and copy only. Return "embedded_mood_images": [] in your metadata.`;
    const header = `VISUAL DIRECTION (anchor your draft in this mood):\n  ${embedPermission}\n`;
    const summaryLine = visualDirectionSummary
      ? `  Visual direction summary (DOMINANT signal): ${JSON.stringify(visualDirectionSummary)}\n`
      : `  Visual direction summary: (none provided — derive from brief + directive)\n`;
    if (moodImages.length === 0) {
      return header + summaryLine + `  Mood board: (no images — work from the summary above as prose-only direction)\n`;
    }
    const imageLines = moodImages.map((m, i) => {
      const path = typeof m?.path === 'string' ? m.path : '';
      const relPath = path ? path.split('/').pop() : '';
      const desc = typeof m?.description === 'string' ? m.description : '';
      const palette = Array.isArray(m?.palette_oklch) ? m.palette_oklch.join(', ') : '';
      const tags = Array.isArray(m?.style_tags) ? m.style_tags.join(', ') : '';
      return `  Mood ${i + 1}: ${path}${relPath ? `  (relative: ${relPath})` : ''}\n` +
             `    description: ${JSON.stringify(desc)}\n` +
             `    palette (OKLCH): ${palette}\n` +
             `    style tags: ${tags}\n`;
    }).join('');
    return header + summaryLine + imageLines;
  })();

  const draftSteps = angles.map((angle, i) => {
    const index = i + 1;
    const draftPath = `${SEEDS_DIR}/draft-${index}.html`;
    const angleDirective = perAngleDirectives[i] ?? `Take the "${angle}" angle. Pick a specific visual world and commit to it.`;

    const autonomousNote = autonomous
      ? `MODE: autonomous solo run. You are the ONLY drafter. There is no user iteration after this — your output becomes the starter directly. Lean into conviction; do not hedge between visual worlds.\n\n`
      : '';

    const keywordsDrafterBlock = hasKeywords
      ? (
          `Keywords (PRIMARY design signal): ${JSON.stringify(keywords)}\n` +
          `Interpret these keywords as the seed for the Design Read. Each keyword carries weight equal to the brief itself. They are not flavor — they are load-bearing seed terms that should be legible in the palette, typography, copy register, or composition of your draft.\n`
        )
      : '';

    return {
      name: `draft-${index}-${angle.replace(/\s+/g, '-')}`,
      prompt:
        `OWNER: design-taste-frontend + emil-design-eng. Consult both SKILL.md files for the bans below.\n` +
        `\n` +
        autonomousNote +
        `You are drafter ${index} of ${nDrafts}. Your job is to MATERIALIZE one starting point for this product as a real, openable HTML file.${autonomous ? '' : ` The user will pick one of the ${nDrafts} drafts and refine from there.`}\n` +
        `\n` +
        `Brief: ${JSON.stringify(brief)}\n` +
        `Design Read: ${JSON.stringify(designRead)}\n` +
        `Caller constraints: ${JSON.stringify(constraints)}\n` +
        `Shared constraints (from art direction): ${JSON.stringify(sharedConstraints)}\n` +
        keywordsDrafterBlock +
        `\n` +
        paletteBlock +
        `\n` +
        moodBoardForDrafterBlock +
        `\n` +
        `Your assigned angle: "${angle}"\n` +
        `Your creative directive (commit to this visual world): ${JSON.stringify(angleDirective)}\n` +
        `\n` +
        `STEP 1. Write a self-contained HTML file to:\n` +
        `  ${draftPath}\n` +
        `Use your Write tool. Overwrite if it exists.\n` +
        `\n` +
        `STRICT RULES every draft must follow:\n` +
        `${draftRulesBlock}\n` +
        `\n` +
        `STEP 2. After writing, return the JSON metadata object. draft_file_path MUST equal the exact path you wrote to (${draftPath}). scene_sentence must follow the impeccable form: "Reading this as: <kind> for <audience>, with a <vibe> language, leaning toward <aesthetic family>." summary_under_60_words must describe what a user would see when they open this file — the hero, the dominant move, the feeling — not a list of features. embedded_mood_images MUST be the array of relative paths (e.g. ["mood-1.png", "mood-3.png"]) that actually appear as <img src="..."> in the markup you wrote — exactly those, no more, no fewer; empty array [] if you embedded none.\n` +
        `\n` +
        `Return ONLY the JSON object matching the schema.`,
      schema: DRAFT_METADATA_SCHEMA,
      phase: 'Draft',
    };
  });

  // parallel() expects an array of THUNKS, not spec objects. Wrap each draftStep
  // into a thunk that invokes agent() with the step's prompt + schema + label/phase.
  const draftThunks = draftSteps.map((step) => () => agent(
    step.prompt,
    { schema: step.schema, label: step.name, phase: step.phase ?? 'Draft' }
  ));
  const draftsRaw = await parallel(draftThunks);
  const draftsArray = Array.isArray(draftsRaw) ? draftsRaw : [draftsRaw];
  const drafts = draftsArray.filter((d) => d && typeof d === 'object' && d.draft_file_path);

  log(`houdini-drafts produced ${drafts.length} of ${nDrafts} drafts. mode=${mode}.`);
  for (const d of drafts) {
    log(`  - ${d.name} (${d.angle}) → ${d.draft_file_path}`);
  }

  // ---------- 4. HANDOFF (autonomous only) ----------
  // In guided/keywords modes the /houdini SKILL drives PRESENT/REFINE/HAND-OFF
  // conversationally. In autonomous mode there is no skill loop, so the
  // workflow must finalize the hand-off artifacts itself so that the next
  // /magic run sees DESIGN_APPROACH.md and proceeds past the cold-start gate.
  if (autonomous) {
    phase('Handoff');

    const draft = drafts.find(Boolean);
    if (!draft) {
      log('Houdini autonomous: no draft produced; skipping hand-off.');
      return { mode, directive, moodBoard, drafts };
    }

    const paletteBullets = Array.isArray(draft.palette_oklch)
      ? draft.palette_oklch
          .map((p) => `- ${p?.role ?? 'role'}: ${p?.value ?? ''}`)
          .join('\n')
      : '';
    const referencesBullets = Array.isArray(draft.references)
      ? draft.references
          .map((r) => `- ${r?.url_or_name ?? ''} — ${r?.why ?? ''}`)
          .join('\n')
      : '';
    const antiReferencesBullets = Array.isArray(draft.anti_references)
      ? draft.anti_references
          .map((r) => `- ${r?.url_or_name ?? ''} — ${r?.why ?? ''}`)
          .join('\n')
      : '';
    const typeDisplay = draft.type_pair?.display ?? '';
    const typeText = draft.type_pair?.text ?? '';
    const typeRationale = draft.type_pair?.rationale ?? '';

    const moodBoardBullets = moodImages.length > 0
      ? moodImages.map((m, i) => {
          const path = typeof m?.path === 'string' ? m.path : '';
          const desc = typeof m?.description === 'string' ? m.description : '';
          return `- mood-${i + 1}: ${path} — ${desc}`;
        }).join('\n')
      : '- (no mood images generated — see Visual direction summary below)';

    // Embedded paths the drafter actually used — load-bearing for /magic Build preservation.
    const embeddedPaths = Array.isArray(draft?.embedded_mood_images)
      ? draft.embedded_mood_images.filter((p) => typeof p === 'string' && /^mood-[1-5]\.png$/.test(p))
      : [];
    const embeddedBullets = embeddedPaths.length > 0
      ? embeddedPaths.map((p) => `- ${p}`).join('\n')
      : '- (none — drafter chose not to embed any mood image; /magic Build is free to author imagery from scratch)';

    const handoffPrompt =
      `OWNER: houdini autonomous hand-off. You are NOT making creative decisions — you are persisting the lone autonomous draft as the project's starter so that the /magic workflow's next run sees a real DESIGN_APPROACH.md and proceeds past its cold-start gate.\n` +
      `\n` +
      `You have access to Read, Write, and Bash tools. Do these four steps in order. Do not skip any.\n` +
      `\n` +
      `STEP 1. Read the autonomous draft HTML at this exact path:\n` +
      `  ${draft.draft_file_path}\n` +
      `\n` +
      `STEP 2. Write an IDENTICAL copy of that file's contents to:\n` +
      `  ${STARTER_PATH}\n` +
      `Use the Write tool. Do not modify the markup. Overwrite if present.\n` +
      `\n` +
      `STEP 3. Extract every CSS custom property declared inside the :root { ... } block of the draft (lines of the form "--name: value;"). Write them as a standalone CSS file to:\n` +
      `  ${TOKENS_PATH}\n` +
      `The file structure must be exactly:\n` +
      `  :root {\n` +
      `    /* extracted by houdini autonomous handoff */\n` +
      `    --token-name: value;\n` +
      `    ...\n` +
      `  }\n` +
      `Preserve original order. Preserve exact value strings (OKLCH, cubic-bezier, etc.). Do not invent tokens. If the draft has multiple :root blocks, merge them in source order. If there are no :root custom properties at all, still write the file with just the comment inside.\n` +
      `\n` +
      `STEP 4. Write the design approach memo to:\n` +
      `  ${DESIGN_APPROACH_PATH}\n` +
      `with EXACTLY this Markdown structure (fill the bracketed values from the draft data below):\n` +
      `\n` +
      `# Design Approach\n` +
      `\n` +
      `## Mode — autonomous\n` +
      `Generated in autonomous mode, no user iteration. Angle: ${JSON.stringify(draft.angle ?? '')}.\n` +
      `\n` +
      `## Palette family — ${JSON.stringify(paletteFamily ?? 'unspecified')}\n` +
      `State: ${paletteState}. ${paletteState === 'locked' ? 'Locked from memory/PALETTE.json — drafter was required to honour the locked tokens.' : paletteState === 'override' ? `Forced via --palette ${JSON.stringify(paletteArg)} for this run.` : 'Explore mode — family chosen by deterministic rotation against the recent-palettes anti-list. Caller can lock via /set-palette to stop drift.'}\n` +
      (paletteFamily === 'custom' && paletteCustomTokens
        ? `\n### Custom palette tokens (verbatim)\n` +
          Object.entries(paletteCustomTokens).map(([k, v]) => `- --${k}: ${v}`).join('\n') + `\n` +
          `Source: ${paletteState === 'locked' ? 'memory/PALETTE.json' : (paletteProseText ? `--palette prose (translated): ${JSON.stringify(paletteProseText)}` : '--palette inline override')}.\n` +
          (paletteProseInterpretation ? `Translator interpretation: ${paletteProseInterpretation}\n` : '')
        : '') +
      `\n` +
      `## Scene sentence — ${JSON.stringify(draft.scene_sentence ?? '')}\n` +
      `\n` +
      `## Visual direction summary\n` +
      `${visualDirectionSummary || '(none captured)'}\n` +
      `\n` +
      `## Mood board\n` +
      `${moodBoardBullets}\n` +
      `\n` +
      `## Embedded mood images\n` +
      `These relative paths appear as <img src="..."> in starter.html and MUST be preserved by downstream /magic Build (do not strip; if rewriting the surface they live on, keep the <img> tag in place):\n` +
      `${embeddedBullets}\n` +
      `\n` +
      `## Palette (OKLCH)\n` +
      `${paletteBullets}\n` +
      `\n` +
      `## Type pairing\n` +
      `- Display: ${typeDisplay}\n` +
      `- Text: ${typeText}\n` +
      (typeRationale ? `- Rationale: ${typeRationale}\n` : '') +
      `\n` +
      `## Motion tone — ${JSON.stringify(draft.motion_tone ?? '')}\n` +
      `\n` +
      `## References\n` +
      `${referencesBullets}\n` +
      `\n` +
      `## Anti-references\n` +
      `${antiReferencesBullets}\n` +
      `\n` +
      `## Brief — ${JSON.stringify(brief)}\n` +
      `\n` +
      `## Hand-off artifacts\n` +
      `- presto/seeds/starter.html\n` +
      `- presto/seeds/tokens.css\n` +
      `- presto/memory/DESIGN_APPROACH.md\n` +
      `- presto/memory/recent-palettes.json (anti-list ledger; updated by STEP 5 below)\n` +
      `\n` +
      `STEP 5 — RECENT-PALETTES LEDGER (only when the run is in explore mode; skip otherwise).\n` +
      `Current palette state for THIS run: ${JSON.stringify(paletteState)}. Family used: ${JSON.stringify(paletteFamily)}.\n` +
      `If paletteState === "explore" AND paletteFamily is a non-empty string, update the anti-list so future explore runs rotate AWAY from this choice. Do these sub-steps:\n` +
      `  5a. Read ${PATHS.recentPalettesPath} if it exists; parse JSON; capture { recent: [...] }. If absent or malformed, treat as { recent: [] }.\n` +
      `  5b. Construct a new entry: { "family": ${JSON.stringify(paletteFamily)}, "run_slug": ${JSON.stringify(ARGS.run_slug ?? 'unnamed-run')}, "via": "houdini-autonomous" }.\n` +
      `  5c. Prepend the new entry to recent[]. Keep the first 5; drop the rest. Do NOT dedupe — the family may repeat over the project's lifetime; the rotation algorithm reads the most recent N regardless.\n` +
      `  5d. Write the updated JSON to ${PATHS.recentPalettesPath} using the Write tool. Pretty-print with 2-space indent.\n` +
      `If paletteState !== "explore" OR paletteFamily is empty, skip 5a-5d entirely and add a one-line note to your notes field: "skipped recent-palettes update (state=<state>, family=<family>)".\n` +
      `\n` +
      `STEP 6. Return the JSON object matching the schema: wrote_paths is the array of absolute paths you wrote this run (starter.html, tokens.css, DESIGN_APPROACH.md, and recent-palettes.json IF you wrote it), notes is a short string summarising what you extracted (e.g. how many tokens, palette state, any caveats).\n` +
      `\n` +
      `Return ONLY the JSON object.`;

    const handoff = await agent(handoffPrompt, {
      schema: HANDOFF_SCHEMA,
      label: 'handoff',
      phase: 'Handoff',
    });

    log(`houdini-drafts autonomous hand-off complete. wrote ${Array.isArray(handoff?.wrote_paths) ? handoff.wrote_paths.length : 0} files.`);

    return { mode, directive, moodBoard, drafts, handoff };
  }

  return { mode, directive, moodBoard, drafts };
