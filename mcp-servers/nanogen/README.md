# nanogen

A tiny, dependency-free MCP server that wraps Google's Gemini image generation API.

Pure Python 3 standard library. No `pip install` required.

## What it is

`nanogen` is a stdio Model Context Protocol server that exposes Google's Gemini
image models (Gemini 2.5 Flash Image, Gemini 3 Pro Image, Gemini 3.1 Flash Image,
etc.) as four small tools any MCP-compatible client (Claude Code, Claude Desktop,
Cursor, Zed, etc.) can call:

- `generate` — text → image
- `edit` — image + text → image
- `describe` — image → structured JSON (description, palette, style tags)
- `batch` — many `generate` calls through a rate-limited queue

It is intentionally ~600 lines of Python with zero pip dependencies. Drop the
file anywhere, point your MCP client at it, ship.

## Install

```bash
git clone https://github.com/brianyu18/nanogen.git
cd nanogen
# That's it. No build step, no pip install.
python3 server.py   # will sit waiting for JSON-RPC on stdin
```

Requires Python 3.10+ (only for the modern type-hint syntax; behaviour is stdlib-only).

## Environment

| Variable | Required | Default | Notes |
|---|---|---|---|
| `GEMINI_API_KEY` | yes\* | — | Your Gemini API key |
| `NANOGEN_KEY_FILE` | no | `~/.config/nanogen/key` | Fallback file if env var missing |
| `NANOGEN_CACHE_DIR` | no | `~/.cache/nanogen/` | Where generated PNGs are cached |
| `NANOGEN_MAX_CONCURRENT` | no | `2` | Max in-flight Gemini calls |
| `NANOGEN_TIMEOUT` | no | `120` | HTTPS timeout in seconds |

\* Either the env var or the key file must be present. Get a key at
<https://aistudio.google.com/apikey>.

## Tools

### `generate`

Generate a new image from a prompt.

```json
{
  "prompt": "A minimalist editorial poster, oklch warm neutrals, generous whitespace",
  "aspect_ratio": "16:9",
  "output_path": "/tmp/poster.png",
  "model": "gemini-2.5-flash-image"
}
```

Returns:

```json
{
  "path": "/tmp/poster.png",
  "dimensions": {"width": 1344, "height": 768},
  "model_used": "gemini-2.5-flash-image",
  "cached": false,
  "bytes": 187432,
  "base64": "iVBORw0KGgo..."
}
```

`base64` is only included when the PNG is under 256 KB so MCP responses stay
manageable. `cached: true` means the result came from disk; same prompt + model
+ aspect always hits the cache.

Supported aspects: `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `4:5`, `3:2`, `2:3`.

Supported models:

- `gemini-2.5-flash-image` (default, cheapest, fastest)
- `gemini-3-pro-image-preview`
- `gemini-3-pro-image`
- `gemini-3.1-flash-image-preview`
- `gemini-3.1-flash-image`

### `edit`

Edit an existing image with a text instruction. Gemini's image models natively
support image-to-image editing; describe the change you want.

```json
{
  "input_path": "/tmp/poster.png",
  "prompt": "Make the background a deep navy and add a small sun in the top right",
  "output_path": "/tmp/poster-v2.png"
}
```

If `output_path` is omitted the result is written next to the source as
`<name>.edited.png`.

### `describe`

Ask Gemini Vision for a structured description of an image. Useful for
"is this on-brand?" or "what palette does this use?" review loops.

```json
{ "input_path": "/tmp/poster.png" }
```

Returns:

```json
{
  "description": "An editorial poster with a large serif headline on a warm cream ground...",
  "palette_oklch": [
    "oklch(96% 0.02 80)",
    "oklch(30% 0.05 50)",
    "oklch(72% 0.15 35)"
  ],
  "style_tags": ["editorial", "minimal", "warm", "serif", "print"]
}
```

### `batch`

Run many `generate` calls through the rate-limited queue. Per-entry failures
are returned in place; sibling entries keep going.

```json
{
  "requests": [
    {"prompt": "logo concept A", "aspect_ratio": "1:1"},
    {"prompt": "logo concept B", "aspect_ratio": "1:1"},
    {"prompt": "logo concept C", "aspect_ratio": "1:1"}
  ]
}
```

Returns an array of results in the same order. Entries that failed contain
only `{ "error": "..." }`.

## Cache

Generated images are written to `$NANOGEN_CACHE_DIR` (default `~/.cache/nanogen/`)
keyed by `sha256(prompt + model + aspect_ratio)`. Each entry has:

- `<hash>.png` — the raw image bytes
- `<hash>.meta.json` — `{ prompt, model, aspect_ratio, bytes }`

Delete the directory at any time to evict everything. Cache hits skip the
network entirely and return instantly.

## Rate limits

Concurrent calls to Gemini are serialised through a bounded semaphore. By
default at most 2 calls are in flight; tune with `NANOGEN_MAX_CONCURRENT`.
This applies to `generate`, `edit`, and `describe`, and is enforced even
when `batch` fans out internally.

## Adding to Claude Code

Drop the following into your `~/.claude.json` (or project-local `.mcp.json`):

```json
{
  "mcpServers": {
    "nanogen": {
      "command": "python3",
      "args": ["/absolute/path/to/nanogen/server.py"],
      "env": {
        "GEMINI_API_KEY": "your_key_here"
      }
    }
  }
}
```

Then in Claude Code:

```
Use nanogen to generate a 16:9 hero image of a misty Pacific Northwest forest at dawn.
```

See `examples/.mcp.json` for a copy-pasteable config.

## License

MIT. See LICENSE.
