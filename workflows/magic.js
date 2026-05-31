/**
 * /magic — the unified design workflow for the `presto` plugin.
 *
 * LINEAR 8-PHASE FLOW (Phase 0 is the optional Houdini cold-start)
 *   0. Houdini  (owner: /houdini SKILL — conversational, runs in main loop)
 *                                                — cold-start for net-new / redesign / blank-page work.
 *                                                  Houdini is a CREATIVE PARTNER skill that talks with the
 *                                                  user and drafts concrete HTML starters; workflows cannot
 *                                                  do back-and-forth conversation, so this phase only
 *                                                  DETECTS the cold-start situation and bails politely,
 *                                                  asking the user to run /houdini first. It does NOT try
 *                                                  to run houdini inline.
 *                                                  Skipped when a direction already exists.
 *   1. Read     (owner: design-taste-frontend)  — one-line Design Read + kind/audience/vibe.
 *   2. Context  (owner: impeccable)             — brand vs product register, palette strategy, tokens.
 *   3. Dials    (owner: design-taste-frontend)  — VARIANCE / MOTION / DENSITY 1-10.
 *   4. Stack    (owner: design-taste-frontend)  — framework + real design system + type/motion/icons.
 *   5. Build    (owner: impeccable + taste)     — author files; pipeline if multi-file.
 *   6. Polish   (owner: emil-design-eng)        — animation decisions, easing, transform-origin.
 *   7. Audit    (owner: ALL three, parallel)    — Pre-Flight matrix + AI slop test + emil review table.
 *
 * ARGS CONTRACT
 *   { intent: string, mode?: 'full' | string, skipTo?: <phase name>,
 *     startHook?: 'auto' | 'houdini' | 'off' }
 *
 *   startHook controls Phase 0:
 *     - 'auto'    (default) — run /houdini ONLY when the intent reads as net-new / redesign /
 *                             blank-page AND memory/DESIGN_APPROACH.md does not yet exist.
 *     - 'houdini' — run /houdini unconditionally before Read.
 *     - 'off'     — never run /houdini; jump straight to Read.
 *
 *   The output of the Houdini phase (or null when skipped) is threaded into the Read phase prompt
 *   so READ can pre-fill kind/audience/vibe from the chosen DESIGN_APPROACH.md instead of
 *   re-deriving them from the raw intent.
 *
 * BREAK-OUT COMMANDS
 *   Sibling commands (/design-read, /set-dials, /design-flow, /design-audit, /design-review)
 *   call this workflow with args.skipTo set to a phase name. Anything before that phase is
 *   loaded from presto/memory/ (DESIGN_READ.md, DIALS.json, last-audit.json) by the agent itself.
 *   skipTo and mode continue to operate on the original 7 phases only; Phase 0 is controlled
 *   exclusively by startHook.
 *
 * MEMORY PERSISTENCE
 *   The workflow engine has no filesystem access. Each phase agent is responsible for writing
 *   its own JSON output to presto/memory/<phase>.json using its Write tool, so subsequent
 *   sessions can re-hydrate context without re-running upstream phases.
 *
 * FORBIDDEN at module top-level: template interpolation, computed values, Date.now(), Math.random().
 * `meta` below is a pure literal.
 */

export const meta = {
  name: 'magic',
  description: 'Unified design workflow: Houdini (optional cold-start) → Read → Context → Dials → Stack → Build → Polish → Audit.',
  phases: [
    { title: 'Houdini', detail: 'cold-start when no DESIGN_APPROACH.md exists (optional)' },
    { title: 'Read' },
    { title: 'Context' },
    { title: 'Dials' },
    { title: 'Stack' },
    { title: 'Build' },
    { title: 'Polish' },
    { title: 'Audit' },
  ],
};

// ---------- JSON Schemas (phase output contracts) ----------

const DESIGN_READ_SCHEMA = {
  type: 'object',
  required: ['read', 'kind', 'audience', 'vibe', 'stack_hint'],
  properties: {
    read: { type: 'string', description: 'One-line Design Read summarising the brief.' },
    kind: { type: 'string', enum: ['landing', 'app', 'dashboard', 'portfolio', 'docs', 'marketing', 'component', 'other'] },
    audience: { type: 'string' },
    vibe: { type: 'string' },
    stack_hint: { type: 'string' },
  },
};

const CONTEXT_SCHEMA = {
  type: 'object',
  required: ['register', 'palette_strategy', 'existing_tokens', 'scene_sentence'],
  properties: {
    register: { type: 'string', enum: ['brand', 'product'] },
    palette_strategy: { type: 'string', description: 'OKLCH strategy: anchors, ramps, contrast targets.' },
    existing_tokens: { type: 'array', items: { type: 'string' } },
    scene_sentence: { type: 'string' },
  },
};

const DIALS_SCHEMA = {
  type: 'object',
  required: ['variance', 'motion', 'density', 'reasoning'],
  properties: {
    variance: { type: 'integer', minimum: 1, maximum: 10 },
    motion:   { type: 'integer', minimum: 1, maximum: 10 },
    density:  { type: 'integer', minimum: 1, maximum: 10 },
    reasoning: { type: 'string' },
  },
};

const STACK_SCHEMA = {
  type: 'object',
  required: ['framework', 'type_family', 'motion_lib', 'icons'],
  properties: {
    framework: { type: 'string' },
    ds_package: { type: 'string', description: 'e.g. fluent-ui, material, carbon, govuk-frontend, shadcn, tailwind.' },
    type_family: { type: 'string' },
    motion_lib: { type: 'string' },
    icons: { type: 'string' },
  },
};

const BUILD_SCHEMA = {
  type: 'object',
  required: ['files_written', 'notes'],
  properties: {
    files_written: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
};

const POLISH_SCHEMA = {
  type: 'object',
  required: ['animations', 'review_table_md'],
  properties: {
    animations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['element', 'easing', 'duration', 'purpose'],
        properties: {
          element: { type: 'string' },
          easing: { type: 'string' },
          duration: { type: 'string' },
          purpose: { type: 'string' },
        },
      },
    },
    review_table_md: { type: 'string', description: 'Markdown table: Before | After | Why.' },
  },
};

const AUDIT_SCHEMA = {
  type: 'object',
  required: ['preflight_pass', 'slop_pass', 'review_findings'],
  properties: {
    preflight_pass: { type: 'boolean' },
    slop_pass: { type: 'boolean' },
    review_findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'note'],
        properties: {
          severity: { type: 'string', enum: ['block', 'warn', 'info'] },
          note: { type: 'string' },
        },
      },
    },
  },
};

// ---------- Workflow body ----------

export default async function magic({ args, agent, phase, pipeline, parallel, workflow, log }) {
  const intent = args?.intent ?? '';
  const skipTo = args?.skipTo ?? null;
  const mode = args?.mode ?? 'full';
  const startHook = args?.startHook ?? 'auto';
  const skipImageGen = args?.skip_image_gen === true;
  const shouldRun = (name) => !skipTo || skipTo === name || phaseIndex(name) >= phaseIndex(skipTo);

  let houdini = null, read, context, dials, stack, build, polish, audit;

  // ---------- 0. HOUDINI (cold-start detection; delegates to /houdini SKILL) ----------
  // Workflows cannot have back-and-forth conversation with the user, but the houdini skill
  // requires it (drafts -> picks -> refine loop). So this phase only DETECTS the cold-start
  // situation and bails politely, asking the user to run /houdini first.
  phase('Houdini');
  if (startHook === 'off') {
    log('Houdini start-hook disabled (startHook=off); skipping Phase 0.');
  } else if (startHook === 'houdini') {
    const reason = 'startHook=houdini forced; /houdini is a conversational skill and cannot run inside this workflow.';
    log(`Cold start detected. Recommend running /houdini before /magic. Pausing this run; restart /magic after /houdini completes. (${reason})`);
    return { halted_for_houdini: true, reason, skip_image_gen: skipImageGen };
  } else {
    // startHook === 'auto' (default)
    const blankPageRegex = /new|fresh|blank|redesign|rebrand|from scratch|cold start/i;
    if (blankPageRegex.test(String(intent))) {
      const check = await agent(
        `Check whether the file /Users/brian/Desktop/claude-projects/presto/memory/DESIGN_APPROACH.md exists.\n` +
        `Use the Bash tool (e.g. \`test -f <path> && echo yes || echo no\`) or the Read tool to verify.\n` +
        `Return { "exists": true } if the file is present, otherwise { "exists": false }. Do not create the file.`,
        {
          schema: {
            type: 'object',
            required: ['exists'],
            properties: { exists: { type: 'boolean' } },
          },
          label: 'houdini-precheck',
          phase: 'Houdini',
        }
      );

      if (check && check.exists === false) {
        const reason = 'net-new/redesign intent detected and DESIGN_APPROACH.md missing; /houdini is a conversational skill and cannot run inside this workflow.';
        log(`Cold start detected. Recommend running /houdini before /magic. Pausing this run; restart /magic after /houdini completes. (${reason})`);
        return { halted_for_houdini: true, reason, skip_image_gen: skipImageGen };
      } else {
        log('Houdini skipped: DESIGN_APPROACH.md already exists.');
      }
    } else {
      log('Houdini skipped: intent does not read as net-new / redesign / blank-page.');
    }
  }

  // ---------- 1. READ ----------
  phase('Read');
  if (shouldRun('Read')) {
    read = await agent(
      `OWNER: design-taste-frontend. Consult SKILL.md "Design Read" section.\n` +
      `Intent: ${JSON.stringify(intent)}.\n` +
      `Houdini cold-start output (may be null if no /houdini ran — when present, pre-fill kind/audience/vibe/stack_hint from the chosen direction in DESIGN_APPROACH.md instead of re-deriving from the raw intent): ${JSON.stringify(houdini ?? null)}.\n` +
      `Produce the one-line Design Read plus kind / audience / vibe / stack_hint.\n` +
      `Write the JSON result to presto/memory/DESIGN_READ.json using your Write tool.`,
      { schema: DESIGN_READ_SCHEMA, label: 'read', phase: 'Read' }
    );
  }

  // ---------- 2. CONTEXT ----------
  phase('Context');
  if (shouldRun('Context')) {
    context = await agent(
      `OWNER: impeccable. Consult SKILL.md sections on PRODUCT.md/DESIGN.md context, brand-vs-product register, and the OKLCH palette strategy.\n` +
      `Prior Design Read: ${JSON.stringify(read ?? null)}.\n` +
      `Decide register (brand|product), define palette_strategy, list any existing_tokens you discovered, and write a one-sentence scene_sentence.\n` +
      `Write the JSON result to presto/memory/CONTEXT.json using your Write tool.`,
      { schema: CONTEXT_SCHEMA, label: 'context', phase: 'Context' }
    );
  }

  // ---------- 3. DIALS ----------
  phase('Dials');
  if (shouldRun('Dials')) {
    dials = await agent(
      `OWNER: design-taste-frontend. Consult SKILL.md "Three Dials" section (VARIANCE / MOTION / DENSITY, 1-10).\n` +
      `Design Read: ${JSON.stringify(read ?? null)}.\n` +
      `Context: ${JSON.stringify(context ?? null)}.\n` +
      `Pick integer values 1-10 for each dial and give one-paragraph reasoning.\n` +
      `Write the JSON result to presto/memory/DIALS.json using your Write tool.`,
      { schema: DIALS_SCHEMA, label: 'dials', phase: 'Dials' }
    );
  }

  // ---------- 4. STACK ----------
  phase('Stack');
  if (shouldRun('Stack')) {
    stack = await agent(
      `OWNER: design-taste-frontend. Consult SKILL.md "Real Design Systems" mapping (Fluent / Material / Carbon / govuk-frontend / shadcn / Tailwind).\n` +
      `Design Read: ${JSON.stringify(read ?? null)}. Dials: ${JSON.stringify(dials ?? null)}.\n` +
      `Pick framework, ds_package (a real design system), type_family, motion_lib, icons.\n` +
      `Write the JSON result to presto/memory/STACK.json using your Write tool.`,
      { schema: STACK_SCHEMA, label: 'stack', phase: 'Stack' }
    );
  }

  // ---------- 5. BUILD ----------
  phase('Build');
  if (shouldRun('Build')) {
    const buildBrief =
      `OWNERS: impeccable + design-taste-frontend (coordinated).\n` +
      `Intent: ${JSON.stringify(intent)}.\n` +
      `Context: ${JSON.stringify(context ?? null)}. Dials: ${JSON.stringify(dials ?? null)}. Stack: ${JSON.stringify(stack ?? null)}.\n` +
      `Author the files needed to realise this brief. Honour conflict-resolution rules from the deck:\n` +
      `  - eyebrows: taste's mechanical count is the operational rule.\n` +
      `  - sans defaults: avoid Inter unless explicitly justified.\n` +
      `  - animation altitude: taste picks the pattern (sticky stack, horizontal pan); emil picks values in next phase.\n` +
      `\n` +
      `Note: presto/memory/DESIGN_APPROACH.md (if present from a prior /houdini run) may reference mood-board images for palette and visual-direction guidance. Treat those as READ-ONLY context — do NOT call nanogen or any image-generation MCP here. BUILD does not generate images.\n` +
      `\n` +
      `Write list of files_written and brief notes to presto/memory/BUILD.json using your Write tool.`;

    build = await pipeline(
      [
        { name: 'scaffold', prompt: buildBrief + `\nSTEP: scaffold the markup and primary CSS. Use the Write tool.`, schema: BUILD_SCHEMA, phase: 'Build' },
        { name: 'wire',     prompt: buildBrief + `\nSTEP: wire interactions, data, and content. Use the Write tool.`, schema: BUILD_SCHEMA, phase: 'Build' },
      ],
      { label: 'build', merge: 'last' }
    );
  }

  // ---------- 6. POLISH ----------
  phase('Polish');
  if (shouldRun('Polish')) {
    polish = await agent(
      `OWNER: emil-design-eng. Consult SKILL.md "Animation Decision Framework" (4 questions), the 3 named easing curves, transform-origin awareness, scale(0.97) on every :active (never scale(0)), and asymmetric enter/exit timing.\n` +
      `Build output: ${JSON.stringify(build ?? null)}. Dials: ${JSON.stringify(dials ?? null)}.\n` +
      `For each interactive element, decide: easing curve, duration, transform-origin, purpose. Produce the MANDATORY review-as-markdown-table with Before | After | Why columns in review_table_md.\n` +
      `Write the JSON result to presto/memory/POLISH.json using your Write tool.`,
      { schema: POLISH_SCHEMA, label: 'polish', phase: 'Polish' }
    );
  }

  // ---------- 7. AUDIT (parallel — legitimate barrier; gate needs all three) ----------
  phase('Audit');
  if (shouldRun('Audit')) {
    const auditBundle = JSON.stringify({ read, context, dials, stack, build, polish });

    const [preflight, slop, review] = await parallel([
      agent(
        `OWNER: design-taste-frontend. Run the mechanical Pre-Flight Check matrix from SKILL.md Section 14 (~55 checkboxes) against the build.\n` +
        `Bundle: ${auditBundle}.\n` +
        `Return preflight_pass + any failing items as review_findings (severity: 'block' if it violates the matrix).\n` +
        `Write to presto/memory/audit-preflight.json.`,
        { schema: AUDIT_SCHEMA, label: 'audit-preflight', phase: 'Audit' }
      ),
      agent(
        `OWNER: impeccable. Run the AI slop test (first-order + second-order) from SKILL.md against the build.\n` +
        `Bundle: ${auditBundle}.\n` +
        `Return slop_pass and any flagged patterns as review_findings (severity: 'block' for first-order slop, 'warn' for second-order).\n` +
        `Write to presto/memory/audit-slop.json.`,
        { schema: AUDIT_SCHEMA, label: 'audit-slop', phase: 'Audit' }
      ),
      agent(
        `OWNER: emil-design-eng. Produce the mandatory review-as-markdown-table review against the polish output.\n` +
        `Bundle: ${auditBundle}.\n` +
        `Return review_findings keyed by severity; preflight_pass/slop_pass may be left true (other agents own them).\n` +
        `Write to presto/memory/audit-review.json.`,
        { schema: AUDIT_SCHEMA, label: 'audit-review', phase: 'Audit' }
      ),
    ]);

    audit = {
      preflight_pass: !!preflight?.preflight_pass,
      slop_pass: !!slop?.slop_pass,
      review_findings: [
        ...(preflight?.review_findings ?? []),
        ...(slop?.review_findings ?? []),
        ...(review?.review_findings ?? []),
      ],
    };

    const gate = audit.preflight_pass
      && audit.slop_pass
      && audit.review_findings.filter((f) => f.severity === 'block').length === 0;

    log(`Audit gate: ${gate ? 'PASS' : 'FAIL'}`);

    return { houdini, read, context, dials, stack, build, polish, audit, gate, skip_image_gen: skipImageGen };
  }

  return { houdini, read, context, dials, stack, build, polish, audit, gate: null, skip_image_gen: skipImageGen };
}

// ---------- helpers ----------

function phaseIndex(name) {
  const order = ['Read', 'Context', 'Dials', 'Stack', 'Build', 'Polish', 'Audit'];
  const i = order.indexOf(name);
  return i === -1 ? 0 : i;
}
