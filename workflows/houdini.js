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
  required: ['name', 'angle', 'scene_sentence', 'palette_oklch', 'type_pair', 'motion_tone', 'references', 'anti_references', 'draft_file_path', 'summary_under_60_words'],
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

const SEEDS_DIR = '/Users/brian/Desktop/claude-projects/presto/seeds';
const STARTER_PATH = '/Users/brian/Desktop/claude-projects/presto/seeds/starter.html';
const TOKENS_PATH = '/Users/brian/Desktop/claude-projects/presto/seeds/tokens.css';
const DESIGN_APPROACH_PATH = '/Users/brian/Desktop/claude-projects/presto/memory/DESIGN_APPROACH.md';

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
  'Imagery policy: do NOT embed mood-board images in your HTML. The mood board you receive is pure inspiration — translate it into palette, type, composition, and copy. If your draft genuinely needs imagery, use picsum.photos with a deterministic seed (e.g. https://picsum.photos/seed/draft-N-hero/1600/900) or commit to a pure-CSS/typography solution. Never insert <img src="file://..."> pointing at the mood-board paths.',
];

// ---------- Workflow body ----------

export default async function houdiniDrafts({ args, agent, phase, parallel, log }) {
  const brief = args?.brief ?? '';
  const designRead = args?.design_read ?? '';
  const constraints = args?.constraints ?? '';
  const visualBrief = typeof args?.visual_brief === 'string' ? args.visual_brief : '';
  const autonomous = args?.autonomous === true;
  const skipImageGen = args?.skip_image_gen === true;
  const keywords = Array.isArray(args?.keywords) ? args.keywords.filter((k) => typeof k === 'string' && k.trim().length > 0) : [];
  const hasKeywords = keywords.length > 0;
  const hasVisualBrief = visualBrief.trim().length > 0;

  // Resolve mode for downstream tooling (DESIGN_APPROACH.md, /magic).
  const mode = autonomous ? 'autonomous' : (hasKeywords ? 'keywords' : 'guided');

  // n_drafts: autonomous mode forces 1; otherwise honor caller (default 3).
  const requestedN = Number.isInteger(args?.n_drafts) ? args.n_drafts : 3;
  const nDrafts = autonomous ? 1 : requestedN;

  // Angle resolution.
  let angles;
  if (autonomous) {
    const overrideKey = typeof args?.angle_override === 'string' ? args.angle_override : 'wildcard';
    const resolvedAngle = ANGLE_OVERRIDE_MAP[overrideKey] ?? ANGLE_OVERRIDE_MAP.wildcard;
    angles = [resolvedAngle];
  } else {
    const requestedAngles = Array.isArray(args?.angles) && args.angles.length > 0
      ? args.angles
      : DEFAULT_ANGLES;
    angles = [];
    for (let i = 0; i < nDrafts; i++) {
      angles.push(requestedAngles[i] ?? 'wildcard overcommit');
    }
  }

  const keywordsBlock = hasKeywords
    ? `Keywords (PRIMARY design signal, weight equal to the brief itself): ${JSON.stringify(keywords)}\n`
    : '';

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
    `Produce TWO things:\n` +
    briefDirectiveSpec +
    `  Also include mode: ${JSON.stringify(mode)}.\n` +
    (hasKeywords ? `  Every directive MUST treat the keywords as primary seed terms — they are NOT optional flavor; they carry weight equal to the brief.\n` : '') +
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
    `OWNER: imagen-direction + impeccable. Produce a 3-image mood board to anchor the drafters that run next. These images are PURE INSPIRATION — they are NEVER embedded into the draft HTML. They exist so the drafters can read a concrete visual world and translate it into palette, typography, composition, and copy.\n` +
    `\n` +
    moodSignalBlock +
    `\n` +
    `Brief: ${JSON.stringify(brief)}\n` +
    `Design Read: ${JSON.stringify(designRead)}\n` +
    `Caller constraints: ${JSON.stringify(constraints)}\n` +
    `Art-direction directives (one per angle): ${JSON.stringify(perAngleDirectives)}\n` +
    `Shared constraints: ${JSON.stringify(sharedConstraints)}\n` +
    `\n` +
    `STEP 1. Load the nanogen tool schemas. Call ToolSearch with the query:\n` +
    `  "select:mcp__plugin_presto_nanogen__generate,mcp__plugin_presto_nanogen__describe"\n` +
    `You CANNOT invoke the tools until their schemas are loaded — calling without ToolSearch first will fail with InputValidationError.\n` +
    `\n` +
    `STEP 2. Author EXACTLY 3 prompts spanning three distinct vantage points on the SAME visual world:\n` +
    `  (a) hero-mood — a dominant scene that establishes the world (16:9, output_path: ${SEEDS_DIR}/mood-1.png)\n` +
    `  (b) lifestyle-mood — the use context: someone or something using/inhabiting the product space (3:2, output_path: ${SEEDS_DIR}/mood-2.png)\n` +
    `  (c) detail-mood — close-up material, texture, or surface (1:1, output_path: ${SEEDS_DIR}/mood-3.png)\n` +
    `\n` +
    `STEP 3. Each prompt is 1-3 sentences. NOT an essay. Structure: [media + light specifics]. [subject + composition + cropping]. [palette in OKLCH]. End with: "No text in image, no logos, no watermarks."\n` +
    `\n` +
    `ANTI-SLOP (enforced with force): BANNED anchor words — "epic", "cinematic", "dreamy", "vibrant", "stunning", "8k", "ultra-detailed", "hyperrealistic", "golden hour" (specify light direction instead), "bokeh" (unless lens-justified). BANNED compositions — centered subject, symmetric three-quarter portrait, hero object on clean gradient, floating product on white seamless. REQUIRED patterns — editorial off-center framing, harsh window light from a specified direction, specific media (35mm grain, scanned slide film, medium-format Portra 400, risograph two-color, cyanotype), edge-of-frame cropping, brand palette dominant and named in OKLCH.\n` +
    `\n` +
    `STEP 4. For each of the 3 prompts: call mcp__plugin_presto_nanogen__generate with the prompt + aspect_ratio + output_path. Then call mcp__plugin_presto_nanogen__describe on the returned path to extract structured palette_oklch values and style_tags. Use the path RETURNED by the tool, not the path you requested.\n` +
    `\n` +
    `STEP 5. Compose visual_direction_summary — 2-4 sentences of prose that captures the through-line of the three images: the world, the light, the material, the palette, the feeling. The drafters in the next phase will use this as their primary anchor.\n` +
    `\n` +
    `FALLBACK: if ToolSearch fails, if generate returns an error (no GEMINI_API_KEY, quota/rate-limit, MCP server unreachable, malformed response), or if describe fails — DO NOT block the workflow. Return mood_board as an empty array [] and put the entire direction into visual_direction_summary as a rich text-only description of what the three mood images WOULD have shown (hero-mood, lifestyle-mood, detail-mood). The drafters can work from prose alone.\n` +
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
    const header = `VISUAL DIRECTION (anchor your draft in this mood — do NOT embed these images in HTML; they are pure inspiration):\n`;
    const summaryLine = visualDirectionSummary
      ? `  Visual direction summary (DOMINANT signal): ${JSON.stringify(visualDirectionSummary)}\n`
      : `  Visual direction summary: (none provided — derive from brief + directive)\n`;
    if (moodImages.length === 0) {
      return header + summaryLine + `  Mood board: (no images — work from the summary above as prose-only direction)\n`;
    }
    const imageLines = moodImages.map((m, i) => {
      const path = typeof m?.path === 'string' ? m.path : '';
      const desc = typeof m?.description === 'string' ? m.description : '';
      const palette = Array.isArray(m?.palette_oklch) ? m.palette_oklch.join(', ') : '';
      const tags = Array.isArray(m?.style_tags) ? m.style_tags.join(', ') : '';
      return `  Mood ${i + 1}: ${path}\n` +
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
        `STEP 2. After writing, return the JSON metadata object. draft_file_path MUST equal the exact path you wrote to (${draftPath}). scene_sentence must follow the impeccable form: "Reading this as: <kind> for <audience>, with a <vibe> language, leaning toward <aesthetic family>." summary_under_60_words must describe what a user would see when they open this file — the hero, the dominant move, the feeling — not a list of features.\n` +
        `\n` +
        `Return ONLY the JSON object matching the schema.`,
      schema: DRAFT_METADATA_SCHEMA,
      phase: 'Draft',
    };
  });

  const draftsRaw = await parallel(draftSteps, { label: 'drafts', merge: 'all' });
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
      `## Scene sentence — ${JSON.stringify(draft.scene_sentence ?? '')}\n` +
      `\n` +
      `## Visual direction summary\n` +
      `${visualDirectionSummary || '(none captured)'}\n` +
      `\n` +
      `## Mood board\n` +
      `${moodBoardBullets}\n` +
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
      `\n` +
      `STEP 5. Return the JSON object matching the schema: wrote_paths is the array of the three absolute paths you wrote (starter.html, tokens.css, DESIGN_APPROACH.md), notes is a short string summarising what you extracted (e.g. how many tokens, any caveats).\n` +
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
}
