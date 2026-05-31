---
name: imagen-edit
description: Edit an existing image via the nanogen MCP server. Use to iterate on an already-generated image (warmer palette, different angle, etc.) without losing composition.
argument-hint: "[input-path] [edit-instruction]"
---

Invokes `mcp__plugin_presto_nanogen__edit` to apply a targeted change to an existing PNG while preserving overall composition. Use this to iterate — change palette, lighting, background, or a single subject attribute — without regenerating from scratch.

## Behavior

1. **Parse arguments.** Split `$ARGUMENTS` into `[input_path, edit_instruction]`. The first token is the path; everything after is the edit instruction. If either is missing, ask via `AskUserQuestion` (one question for each missing field).

2. **Verify the input exists.** Run Bash `test -f "<input_path>"`. If the file does not exist, stop and surface a clear error: `Input image not found: <input_path>`.

3. **Determine output path.** Default to `<input-stem>-edited-<n>.png` where `<n>` is the smallest positive integer that does not collide with an existing file. Find this with Bash, e.g.:
   ```
   n=1; while [ -f "${stem}-edited-${n}.png" ]; do n=$((n+1)); done; echo "${stem}-edited-${n}.png"
   ```
   Do NOT use JS clock or random helpers — forbidden in workflow contexts.

4. **Call the edit tool.** Invoke `mcp__plugin_presto_nanogen__edit` with `input_path`, `prompt` (the edit instruction), and `output_path`.

5. **Report the new path** back to the user along with the instruction that was applied, so they can chain another `/imagen-edit` if needed.

## Examples

- `/imagen-edit hero.png shift to a cooler twilight palette`
- `/imagen-edit product.png remove the wood grain background, put on a soft grey paper texture`
- `/imagen-edit ./generated-1717200000.png raise the camera angle, show more of the table surface`

## Notes

- Editing preserves composition far better than re-prompting from scratch — prefer this over `/imagen` when iterating.
- Stack edits by feeding the previous output as the next input.
