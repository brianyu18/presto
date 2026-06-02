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
 *   loaded from ${PATHS.memoryDir}/ (DESIGN_READ.md, DIALS.json, last-audit.json) by the agent itself.
 *   skipTo and mode continue to operate on the original 7 phases only; Phase 0 is controlled
 *   exclusively by startHook.
 *
 * MEMORY PERSISTENCE
 *   The workflow engine has no filesystem access. Each phase agent is responsible for writing
 *   its own JSON output to ${PATHS.memoryDir}/<phase>.json using its Write tool, so subsequent
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
    { title: 'Finalize', detail: 'move seeds/ + memory/ into outputs/<slug>/; fires only on full pipeline runs' },
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

const FINALIZATION_SCHEMA = {
  type: 'object',
  required: ['moved_paths', 'output_dir', 'meta_path'],
  properties: {
    moved_paths: {
      type: 'array',
      items: { type: 'string' },
      description: 'Absolute paths moved from seeds/ and memory/ into the run output dir.',
    },
    output_dir: { type: 'string', description: 'Absolute path to outputs/<run_slug>/' },
    meta_path: { type: 'string', description: 'Absolute path to the written META.json file.' },
    notes: { type: 'string' },
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
// Top-level procedural body. The Workflow runtime injects { args, agent, phase,
// pipeline, parallel, workflow, log } as globals — do NOT wrap in `export default
// async function`; Claude Code's workflow loader strips the meta export and
// compiles the remaining body in a vm context that does NOT support module-level
// exports. See the o0() loader in claude-code internals for the contract.

  // Normalize args. Claude Code v2.1.158's Workflow harness delivers `args` as a
  // JSON-encoded STRING, not an object — even though the tool docs say "pass as a
  // JSON value". We parse here to recover the object so ARGS.project_root etc. work.
  // Both shapes are accepted in case a future version flips this back to native objects.
  const RAW_ARGS = args;
  let ARGS;
  if (typeof RAW_ARGS === 'string') {
    try {
      ARGS = JSON.parse(RAW_ARGS);
    } catch (e) {
      throw new Error(
        `magic workflow: args arrived as a string but is not valid JSON. snippet=${String(RAW_ARGS).slice(0, 400)}`
      );
    }
  } else if (RAW_ARGS && typeof RAW_ARGS === 'object') {
    ARGS = RAW_ARGS;
  } else {
    throw new Error(`magic workflow: args is neither object nor JSON string (got ${typeof RAW_ARGS}).`);
  }

  const intent = ARGS.intent ?? '';
  const skipTo = ARGS.skipTo ?? null;
  const mode = ARGS.mode ?? 'full';
  const startHook = ARGS.startHook ?? 'auto';
  const skipImageGen = ARGS.skip_image_gen === true;
  const shouldRun = (name) => !skipTo || skipTo === name || phaseIndex(name) >= phaseIndex(skipTo);

  // Resolve project-relative paths once per run.
  const PATHS = resolvePaths(ARGS.project_root, ARGS.run_slug);
  log(`magic: project_root=${PATHS.projectRoot} run_slug=${PATHS.runSlug}`);
  log(`magic: writing to seeds=${PATHS.seedsDir} memory=${PATHS.memoryDir} output=${PATHS.outputDir}`);

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
        `Check whether the file ${PATHS.designApproachPath} exists.\n` +
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
      `Write the JSON result to ${PATHS.memoryDir}/DESIGN_READ.json using your Write tool.`,
      { schema: DESIGN_READ_SCHEMA, label: 'read', phase: 'Read' }
    );
  }

  // ---------- 2. CONTEXT ----------
  phase('Context');
  if (shouldRun('Context')) {
    context = await agent(
      `OWNER: impeccable. Consult SKILL.md sections on PRODUCT.md/DESIGN.md context, brand-vs-product register, and the OKLCH palette strategy.\n` +
      `Prior Design Read: ${JSON.stringify(read ?? null)}.\n` +
      `\n` +
      `PALETTE-LOCK CHECK (load-bearing). Before composing palette_strategy:\n` +
      `  1. Use the Bash tool to check whether ${PATHS.memoryDir}/PALETTE.json exists: \`test -f ${PATHS.memoryDir}/PALETTE.json && echo yes || echo no\`.\n` +
      `  2. If "yes": Read the file. Parse its JSON. It will contain { "family": "<key>", "tokens": { "<role>": "<oklch(...) value>", ... }, "locked_at": "...", "source": "..." }. Treat the locked tokens as GROUND TRUTH for this project's palette. Your palette_strategy MUST anchor on those exact OKLCH values — anchors, ramps, and contrast targets are derived from them, NOT invented. existing_tokens MUST include the locked token names. State in scene_sentence that the palette is locked to family "<key>".\n` +
      `  3. If "no": proceed normally — derive palette_strategy from the Design Read and any DESIGN_APPROACH.md present (which may suggest a family but is not binding).\n` +
      `\n` +
      `Decide register (brand|product), define palette_strategy, list any existing_tokens you discovered, and write a one-sentence scene_sentence.\n` +
      `Write the JSON result to ${PATHS.memoryDir}/CONTEXT.json using your Write tool.`,
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
      `Write the JSON result to ${PATHS.memoryDir}/DIALS.json using your Write tool.`,
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
      `Write the JSON result to ${PATHS.memoryDir}/STACK.json using your Write tool.`,
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
      `OUTPUT DIRECTORY (write all production files here as absolute paths): ${PATHS.outputDir}\n` +
      `The directory has been pre-created by the command. Do not write production files anywhere else (not project root, not seeds/, not memory/).\n` +
      `Author the files needed to realise this brief. Honour conflict-resolution rules from the deck:\n` +
      `  - eyebrows: taste's mechanical count is the operational rule.\n` +
      `  - sans defaults: avoid Inter unless explicitly justified.\n` +
      `  - animation altitude: taste picks the pattern (sticky stack, horizontal pan); emil picks values in next phase.\n` +
      `\n` +
      `Note: ${PATHS.memoryDir}/DESIGN_APPROACH.md (if present from a prior /houdini run) may reference mood-board images for palette and visual-direction guidance. Treat those as READ-ONLY context — do NOT call nanogen or any image-generation MCP here. BUILD does not generate images.\n` +
      `\n` +
      `IMAGE PRESERVATION RULE (load-bearing): before authoring any HTML, READ ${PATHS.memoryDir}/DESIGN_APPROACH.md if it exists. Look for a "## Embedded mood images" section. The relative paths listed there (e.g. "mood-1.png", "mood-3.png") are <img> tags the upstream houdini drafter PUT IN starter.html on purpose. They are intentional app content, NOT decorative scaffolding. When you re-author the markup, you MUST preserve those <img src="..."> tags — keep them in semantically appropriate locations (hero, gallery, feature card, wherever they originally lived in starter.html). You may improve their surrounding markup, but you may NOT delete the <img> tags or change their src attributes. If the section is absent, empty, or says "(none — …)", you are free to author imagery from scratch (still no nanogen). To know what surface each <img> came from, READ ${PATHS.seedsDir}/starter.html before rewriting.\n` +
      `\n` +
      `Write list of files_written and brief notes to ${PATHS.memoryDir}/BUILD.json using your Write tool. In notes, explicitly state how many embedded mood images were preserved (e.g. "preserved 2 of 2 embedded mood images" or "no embedded images to preserve").`;

    // Build is two sequential agents (scaffold first, then wire over the scaffold).
    // The original spec-object pipeline() API is gone; use two awaited agent() calls.
    const scaffold = await agent(
      buildBrief + `\nSTEP: scaffold the markup and primary CSS. Use the Write tool.`,
      { schema: BUILD_SCHEMA, label: 'build-scaffold', phase: 'Build' }
    );
    const wire = await agent(
      buildBrief + `\nSTEP: wire interactions, data, and content on top of the scaffold (which has already been written). Use the Write tool. Scaffold output: ${JSON.stringify(scaffold)}.`,
      { schema: BUILD_SCHEMA, label: 'build-wire', phase: 'Build' }
    );
    build = wire; // final state of files
  }

  // ---------- 6. POLISH ----------
  phase('Polish');
  if (shouldRun('Polish')) {
    polish = await agent(
      `OWNER: emil-design-eng. Consult SKILL.md "Animation Decision Framework" (4 questions), the 3 named easing curves, transform-origin awareness, scale(0.97) on every :active (never scale(0)), and asymmetric enter/exit timing.\n` +
      `Build output: ${JSON.stringify(build ?? null)}. Dials: ${JSON.stringify(dials ?? null)}.\n` +
      `For each interactive element, decide: easing curve, duration, transform-origin, purpose. Produce the MANDATORY review-as-markdown-table with Before | After | Why columns in review_table_md.\n` +
      `Write the JSON result to ${PATHS.memoryDir}/POLISH.json using your Write tool.`,
      { schema: POLISH_SCHEMA, label: 'polish', phase: 'Polish' }
    );
  }

  // ---------- 7. AUDIT (parallel — legitimate barrier; gate needs all three) ----------
  phase('Audit');
  if (shouldRun('Audit')) {
    const auditBundle = JSON.stringify({ read, context, dials, stack, build, polish });

    // parallel() expects an array of THUNKS (() => Promise), not already-invoked promises.
    // Wrap each agent() call in an arrow that returns the promise on demand.
    const [preflight, slop, review] = await parallel([
      () => agent(
        `OWNER: design-taste-frontend. Run the mechanical Pre-Flight Check matrix from SKILL.md Section 14 (~55 checkboxes) against the build.\n` +
        `Bundle: ${auditBundle}.\n` +
        `\n` +
        `PALETTE-DRIFT CHECK (load-bearing addition to the matrix):\n` +
        `  1. Use Bash to check whether ${PATHS.memoryDir}/PALETTE.json exists: \`test -f ${PATHS.memoryDir}/PALETTE.json && echo yes || echo no\`.\n` +
        `  2. If "no": skip this check — the project is in explore mode, no lock to drift from.\n` +
        `  3. If "yes": Read the lock file. Extract its "tokens" object (the locked OKLCH role→value map) and "family" key.\n` +
        `  4. For each production file listed in build.files_written that is HTML or CSS: Read it. Inspect every OKLCH color literal you find. For each locked token role, verify the file uses the locked value (allow ±0.5% on L/C, ±2° on H to tolerate rounding). The file MAY introduce additional accents NOT in the lock, but it MUST NOT redefine a locked role with a different value.\n` +
        `  5. Drift findings:\n` +
        `     - A locked role redefined with a non-matching OKLCH value → severity 'block', note "palette-drift: --<role> was locked to <value> but file <path> sets it to <other-value>".\n` +
        `     - Hex or rgb colors used where the locked palette would suffice → severity 'warn', note "palette-drift: hex/rgb literal in <path> bypasses locked tokens".\n` +
        `     - No drift detected → no finding (the check is silent on success).\n` +
        `  6. If drift findings include any 'block' severity, set preflight_pass = false regardless of the rest of the matrix.\n` +
        `\n` +
        `Return preflight_pass + any failing items as review_findings (severity: 'block' if it violates the matrix OR drift-blocks).\n` +
        `Write to ${PATHS.memoryDir}/audit-preflight.json.`,
        { schema: AUDIT_SCHEMA, label: 'audit-preflight', phase: 'Audit' }
      ),
      () => agent(
        `OWNER: impeccable. Run the AI slop test (first-order + second-order) from SKILL.md against the build.\n` +
        `Bundle: ${auditBundle}.\n` +
        `Return slop_pass and any flagged patterns as review_findings (severity: 'block' for first-order slop, 'warn' for second-order).\n` +
        `Write to ${PATHS.memoryDir}/audit-slop.json.`,
        { schema: AUDIT_SCHEMA, label: 'audit-slop', phase: 'Audit' }
      ),
      () => agent(
        `OWNER: emil-design-eng. Produce the mandatory review-as-markdown-table review against the polish output.\n` +
        `Bundle: ${auditBundle}.\n` +
        `Return review_findings keyed by severity; preflight_pass/slop_pass may be left true (other agents own them).\n` +
        `Write to ${PATHS.memoryDir}/audit-review.json.`,
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

    // ---------- 8. FINALIZE ----------
    // Move seeds/* and memory/* into outputs/<slug>/ and write META.json. Fires only
    // when the full pipeline ran (mode='full', no skipTo, not opt-out via args.finalize=false).
    // Break-out commands (/design-read, /design-audit, etc.) suppress this by setting
    // skipTo or finalize=false so partial runs don't archive prematurely.
    const shouldFinalize = (ARGS.finalize !== false) && mode === 'full' && !skipTo;
    let finalization = null;
    if (shouldFinalize) {
      phase('Finalize');
      const flagSummary = {
        skip_image_gen: skipImageGen,
        mood_board_count: ARGS.mood_board_count ?? null,
        embed_images: ARGS.embed_images ?? null,
        nohoudini: ARGS.nohoudini === true,
        use_slug: typeof ARGS.use_slug === 'string' ? ARGS.use_slug : null,
      };
      const finalizePrompt =
        `OWNER: magic finalization. You are NOT making creative decisions — you are PERSISTING this run's working artifacts into the run's permanent output directory so the next run starts with a clean seeds/ workspace.\n` +
        `\n` +
        `You have access to Bash and Write tools. Do these steps in order; do NOT skip any.\n` +
        `\n` +
        `STEP 1. Verify the output directory exists (it should have been pre-created by the command): \`mkdir -p ${PATHS.outputDir}/seeds ${PATHS.outputDir}/memory\` — this is idempotent and safe to run.\n` +
        `\n` +
        `STEP 2. Move all contents of ${PATHS.seedsDir}/ into ${PATHS.outputDir}/seeds/. Use Bash:\n` +
        `  shopt -s dotglob nullglob 2>/dev/null; if compgen -G "${PATHS.seedsDir}/*" >/dev/null; then mv "${PATHS.seedsDir}"/* "${PATHS.outputDir}/seeds/"; fi\n` +
        `Or equivalent. Skip files that are dotfiles meant to stay (.gitkeep). If a .gitkeep was in seeds/, leave it; move everything else.\n` +
        `\n` +
        `STEP 3. Move all contents of ${PATHS.memoryDir}/ into ${PATHS.outputDir}/memory/ the same way. Leave .gitkeep in place.\n` +
        `\n` +
        `STEP 4. Write a JSON META file at ${PATHS.metaPath} with this exact structure (no nesting beyond what's shown):\n` +
        `  {\n` +
        `    "slug": ${JSON.stringify(PATHS.runSlug)},\n` +
        `    "intent": ${JSON.stringify(intent)},\n` +
        `    "completed_at": "<ISO 8601 timestamp from \`date -u +%Y-%m-%dT%H:%M:%SZ\`>",\n` +
        `    "mode": ${JSON.stringify(mode)},\n` +
        `    "flags": ${JSON.stringify(flagSummary)},\n` +
        `    "audit_gate": ${JSON.stringify(gate ? 'pass' : 'fail')},\n` +
        `    "production_dir": ${JSON.stringify(PATHS.outputDir)},\n` +
        `    "seeds_dir": ${JSON.stringify(PATHS.outputDir + '/seeds')},\n` +
        `    "memory_dir": ${JSON.stringify(PATHS.outputDir + '/memory')}\n` +
        `  }\n` +
        `Capture the ISO timestamp via Bash before writing. Use the Write tool to create the file.\n` +
        `\n` +
        `STEP 5. Return JSON: moved_paths (array of absolute paths of every file moved, both seeds and memory), output_dir (${JSON.stringify(PATHS.outputDir)}), meta_path (${JSON.stringify(PATHS.metaPath)}), notes (one short line: "moved N files from seeds/ + M files from memory/ into <slug>/" or any caveats).`;
      finalization = await agent(finalizePrompt, { schema: FINALIZATION_SCHEMA, label: 'finalize', phase: 'Finalize' });
    } else {
      log(`Finalize skipped (mode=${mode}, skipTo=${skipTo ?? 'null'}, finalize=${ARGS.finalize ?? 'default'}). seeds/ and memory/ left in place.`);
    }

    return { houdini, read, context, dials, stack, build, polish, audit, gate, finalization, skip_image_gen: skipImageGen };
  }

  return { houdini, read, context, dials, stack, build, polish, audit, gate: null, skip_image_gen: skipImageGen };

// ---------- helpers ----------
// All helpers are hoisted function declarations so the body above can call them
// regardless of source-order. Avoid using top-level `const` for anything the body
// reads at execution time — `const` is NOT hoisted; TDZ errors result.

function phaseIndex(name) {
  const order = ['Read', 'Context', 'Dials', 'Stack', 'Build', 'Polish', 'Audit'];
  const i = order.indexOf(name);
  return i === -1 ? 0 : i;
}

// Path resolver. project_root is passed by the command markdown.
// HARD CONTRACT: project_root must be a non-empty absolute path. No silent fallback —
// a missing or empty project_root used to fall back to the presto repo, which caused
// runs invoked from other projects to write into presto/ instead of the user's cwd
// (v0.1.7 regression). Throw loudly so the bug is visible at workflow startup.
function resolvePaths(projectRoot, runSlug) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    throw new Error(
      'resolvePaths: args.project_root is required (got "' + String(projectRoot) + '"). ' +
      'The command markdown must capture `pwd` via Bash and pass it as project_root in the Workflow args. ' +
      'Without this, the workflow has no way to know the user\'s cwd and would silently write to the wrong directory.'
    );
  }
  if (!projectRoot.startsWith('/')) {
    throw new Error(
      'resolvePaths: args.project_root must be an absolute path (got "' + projectRoot + '"). ' +
      'Use `pwd` (absolute) not a relative path.'
    );
  }
  const root = projectRoot;
  const slug = (typeof runSlug === 'string' && runSlug.length > 0) ? runSlug : 'unnamed-run';
  return {
    projectRoot: root,
    runSlug: slug,
    seedsDir: `${root}/seeds`,
    memoryDir: `${root}/memory`,
    outputsDir: `${root}/outputs`,
    outputDir: `${root}/outputs/${slug}`,
    designApproachPath: `${root}/memory/DESIGN_APPROACH.md`,
    starterPath: `${root}/seeds/starter.html`,
    metaPath: `${root}/outputs/${slug}/META.json`,
  };
}
