---
name: imagen
description: Generate a single image via the nanogen MCP server using the Gemini image API. Wraps the imagen-direction skill's prompt-engineering guidance with a one-shot tool call.
argument-hint: "[prompt]"
---

Invokes `mcp__plugin_presto_nanogen__generate` with anti-slop prompt patterns from the `imagen-direction` skill. The goal is one good image in one shot — not a generic AI render, but something with intentional composition, palette, and subject framing.

## Behavior

1. **Parse the prompt.** Treat `$ARGUMENTS` as the freeform user prompt. If it is empty, ask the user once via `AskUserQuestion` for the prompt before continuing.

2. **Rewrite using imagen-direction rules.** Before calling the tool, rewrite the user's prompt to:
   - Strip AI-default phrasings ("stunning", "breathtaking", "highly detailed", "8k", "masterpiece").
   - Add explicit negative constraints: no faces unless asked, no embedded text unless asked, no watermarks, no extra hands/fingers.
   - Specify subject + composition + lighting + palette + medium concretely.
   - Pick a reasonable `aspect_ratio` (default `16:9`).

3. **Generate.** Call `mcp__plugin_presto_nanogen__generate` with:
   - `prompt`: the rewritten prompt
   - `aspect_ratio`: chosen ratio
   - `output_path`: `./generated-<unix-seconds>.png`
   - Get the unix seconds by running Bash: `date +%s`. Do NOT use any JS clock or random helpers — they are forbidden in workflow contexts.

4. **Report back.** Print:
   - The output file path
   - The rewritten prompt (so the user can iterate)
   - The aspect ratio used

## Aspect ratio overrides

The user can use these conventions in their prompt:
- `imagen square <prompt>` → `1:1`
- `imagen vertical <prompt>` or `imagen portrait <prompt>` → `9:16`
- `imagen tall <prompt>` → `3:4`
- `imagen wide <prompt>` (default) → `16:9`
- `imagen cinema <prompt>` → `16:9` with cinematic framing notes added to the rewrite

Strip the convention keyword from the prompt before sending it to the model.

## Example

User: `/imagen square a single ripe persimmon on raw linen, morning window light`

Rewritten: `Studio still life: one ripe persimmon on raw natural linen, soft directional morning window light from left, warm orange skin against cool grey-beige linen, shallow focus, medium-format film look. No text, no watermarks, no faces.`

Output: `./generated-1717200000.png` at `1:1`.
