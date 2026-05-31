#!/usr/bin/env python3
"""nanogen - stdlib-only MCP server wrapping Google's Gemini image generation API.

Implements JSON-RPC 2.0 over stdio. No pip dependencies.

Tools:
  - generate: text -> image
  - edit:     image + text -> image
  - describe: image -> structured description
  - batch:    multiple generate requests through rate-limited queue

Env vars:
  GEMINI_API_KEY     - required, the Gemini API key
  NANOGEN_KEY_FILE   - optional, path to file containing key (default ~/.config/nanogen/key)
  NANOGEN_CACHE_DIR  - optional, cache dir (default ~/.cache/nanogen)
  NANOGEN_MAX_CONCURRENT - optional, max concurrent API calls (default 2)
  NANOGEN_TIMEOUT    - optional, HTTPS timeout seconds (default 120)
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import struct
import sys
import threading
import traceback
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from queue import Queue
from typing import Any

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VERSION = "0.1.0"
SERVER_NAME = "nanogen"
PROTOCOL_VERSION = "2024-11-05"

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image"
VISION_MODEL = "gemini-2.5-flash"

ALLOWED_IMAGE_MODELS = {
    "gemini-2.5-flash-image",
    "gemini-3-pro-image-preview",
    "gemini-3-pro-image",
    "gemini-3.1-flash-image-preview",
    "gemini-3.1-flash-image",
}

ALLOWED_ASPECTS = {"1:1", "16:9", "9:16", "4:3", "3:4", "4:5", "3:2", "2:3"}
DEFAULT_ASPECT = "16:9"

# Embed base64 in MCP response only if under this size.
MAX_INLINE_BASE64_BYTES = 256 * 1024  # 256 KB

DEFAULT_TIMEOUT = int(os.environ.get("NANOGEN_TIMEOUT", "120"))
DEFAULT_MAX_CONCURRENT = int(os.environ.get("NANOGEN_MAX_CONCURRENT", "2"))


# ---------------------------------------------------------------------------
# Logging - MUST go to stderr (stdout is the JSON-RPC transport)
# ---------------------------------------------------------------------------

def log(msg: str) -> None:
    print(f"[nanogen] {msg}", file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# Key + paths
# ---------------------------------------------------------------------------

def get_api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if key:
        return key
    key_file = os.environ.get("NANOGEN_KEY_FILE", "").strip()
    if not key_file:
        key_file = str(Path.home() / ".config" / "nanogen" / "key")
    try:
        with open(key_file, "r", encoding="utf-8") as f:
            return f.read().strip()
    except FileNotFoundError:
        raise RuntimeError(
            "GEMINI_API_KEY not set and no key file found.\n"
            "Either:\n"
            "  1. export GEMINI_API_KEY=your_key_here\n"
            f"  2. write your key to {key_file}\n"
            "Get a key at https://aistudio.google.com/apikey"
        )
    except OSError as e:
        raise RuntimeError(f"Failed to read key file {key_file}: {e}")


def get_cache_dir() -> Path:
    cache = os.environ.get("NANOGEN_CACHE_DIR", "").strip()
    if not cache:
        cache = str(Path.home() / ".cache" / "nanogen")
    p = Path(cache)
    p.mkdir(parents=True, exist_ok=True)
    return p


# ---------------------------------------------------------------------------
# PNG dimension probe (stdlib only, no Pillow)
# ---------------------------------------------------------------------------

def png_dimensions(data: bytes) -> tuple[int, int] | None:
    """Read width, height from PNG header. Returns None on failure."""
    if len(data) < 24:
        return None
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    # IHDR chunk: 4 bytes length, 4 bytes 'IHDR', 4 bytes width, 4 bytes height
    try:
        width = struct.unpack(">I", data[16:20])[0]
        height = struct.unpack(">I", data[20:24])[0]
        return (width, height)
    except struct.error:
        return None


def detect_mime(data: bytes) -> str:
    """Detect mime type from magic bytes. Defaults to image/png."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/png"


# ---------------------------------------------------------------------------
# HTTPS to Gemini
# ---------------------------------------------------------------------------

def gemini_request(model: str, body: dict, api_key: str, timeout: int = DEFAULT_TIMEOUT) -> dict:
    """POST to Gemini generateContent. Returns parsed JSON or raises RuntimeError."""
    url = f"{GEMINI_BASE}/{urllib.parse.quote(model)}:generateContent?key={urllib.parse.quote(api_key)}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "User-Agent": f"nanogen/{VERSION}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            err_body = e.read().decode("utf-8", errors="replace")
        except Exception:
            err_body = ""
        raise RuntimeError(f"Gemini API HTTP {e.code}: {err_body[:1000]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Gemini API network error: {e.reason}")
    except (TimeoutError, OSError) as e:
        raise RuntimeError(f"Gemini API timeout/IO error: {e}")
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Gemini API returned non-JSON: {e}")


def extract_image_from_response(resp: dict) -> tuple[bytes, str]:
    """Pull the first inline_data image part from a generateContent response.

    Returns (image_bytes, mime_type). Raises RuntimeError if no image present,
    surfacing any text response (e.g. content-policy refusal) in the error.
    """
    candidates = resp.get("candidates") or []
    if not candidates:
        # Gemini sometimes surfaces a top-level blockReason / promptFeedback
        feedback = resp.get("promptFeedback") or {}
        block = feedback.get("blockReason") or "no candidates returned"
        raise RuntimeError(f"Gemini returned no candidates: {block}")

    cand = candidates[0]
    content = cand.get("content") or {}
    parts = content.get("parts") or []

    text_chunks: list[str] = []
    for part in parts:
        inline = part.get("inline_data") or part.get("inlineData")
        if inline:
            data_b64 = inline.get("data") or ""
            mime = inline.get("mime_type") or inline.get("mimeType") or "image/png"
            try:
                return base64.b64decode(data_b64), mime
            except Exception as e:
                raise RuntimeError(f"Failed to decode image base64: {e}")
        if "text" in part:
            text_chunks.append(part["text"])

    finish = cand.get("finishReason", "")
    msg = "Gemini returned no image"
    if finish:
        msg += f" (finishReason={finish})"
    if text_chunks:
        joined = " ".join(text_chunks).strip()
        msg += f": {joined[:500]}"
    raise RuntimeError(msg)


# ---------------------------------------------------------------------------
# Rate-limited queue
# ---------------------------------------------------------------------------

class RateLimiter:
    """Bounded-semaphore wrapper. Each call holds one slot."""

    def __init__(self, max_concurrent: int):
        self._sem = threading.BoundedSemaphore(max_concurrent)

    def run(self, fn, *args, **kwargs):
        self._sem.acquire()
        try:
            return fn(*args, **kwargs)
        finally:
            self._sem.release()


RATE_LIMITER = RateLimiter(DEFAULT_MAX_CONCURRENT)


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

def cache_key(prompt: str, model: str, aspect: str) -> str:
    h = hashlib.sha256()
    h.update(prompt.encode("utf-8"))
    h.update(b"\x00")
    h.update(model.encode("utf-8"))
    h.update(b"\x00")
    h.update(aspect.encode("utf-8"))
    return h.hexdigest()


def cache_paths(key: str) -> tuple[Path, Path]:
    d = get_cache_dir()
    return (d / f"{key}.png", d / f"{key}.meta.json")


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

def _build_image_body(prompt: str, aspect: str, image_inline: dict | None = None) -> dict:
    parts: list[dict] = []
    if image_inline:
        parts.append({"inline_data": image_inline})
    parts.append({"text": prompt})
    body: dict = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {"aspectRatio": aspect},
        },
    }
    return body


def tool_generate(args: dict) -> dict:
    prompt = (args.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("prompt is required")

    aspect = args.get("aspect_ratio") or DEFAULT_ASPECT
    if aspect not in ALLOWED_ASPECTS:
        raise ValueError(f"aspect_ratio must be one of {sorted(ALLOWED_ASPECTS)}")

    model = args.get("model") or DEFAULT_IMAGE_MODEL
    if model not in ALLOWED_IMAGE_MODELS:
        raise ValueError(f"model must be one of {sorted(ALLOWED_IMAGE_MODELS)}")

    output_path = args.get("output_path")
    key = cache_key(prompt, model, aspect)
    cache_png, cache_meta = cache_paths(key)

    cached = False
    img_bytes: bytes | None = None

    if cache_png.exists():
        try:
            img_bytes = cache_png.read_bytes()
            cached = True
        except OSError:
            img_bytes = None
            cached = False

    if img_bytes is None:
        api_key = get_api_key()
        body = _build_image_body(prompt, aspect)
        resp = RATE_LIMITER.run(gemini_request, model, body, api_key)
        img_bytes, _mime = extract_image_from_response(resp)
        # Write cache
        try:
            cache_png.write_bytes(img_bytes)
            meta = {
                "prompt": prompt,
                "model": model,
                "aspect_ratio": aspect,
                "bytes": len(img_bytes),
            }
            cache_meta.write_text(json.dumps(meta, indent=2), encoding="utf-8")
        except OSError as e:
            log(f"warn: failed to write cache: {e}")

    # Determine output_path
    if output_path:
        out = Path(output_path).expanduser()
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(img_bytes)
        final_path = str(out)
    else:
        final_path = str(cache_png)

    dims = png_dimensions(img_bytes)
    result: dict = {
        "path": final_path,
        "model_used": model,
        "cached": cached,
        "bytes": len(img_bytes),
    }
    if dims:
        result["dimensions"] = {"width": dims[0], "height": dims[1]}

    if len(img_bytes) < MAX_INLINE_BASE64_BYTES:
        result["base64"] = base64.b64encode(img_bytes).decode("ascii")

    return result


def tool_edit(args: dict) -> dict:
    input_path = args.get("input_path")
    prompt = (args.get("prompt") or "").strip()
    if not input_path:
        raise ValueError("input_path is required")
    if not prompt:
        raise ValueError("prompt is required")

    model = args.get("model") or DEFAULT_IMAGE_MODEL
    if model not in ALLOWED_IMAGE_MODELS:
        raise ValueError(f"model must be one of {sorted(ALLOWED_IMAGE_MODELS)}")

    in_path = Path(input_path).expanduser()
    if not in_path.exists():
        raise ValueError(f"input_path not found: {in_path}")
    src = in_path.read_bytes()
    mime = detect_mime(src)

    inline = {
        "mime_type": mime,
        "data": base64.b64encode(src).decode("ascii"),
    }
    # edits don't take aspect — Gemini preserves source aspect by default
    body: dict = {
        "contents": [{"parts": [{"inline_data": inline}, {"text": prompt}]}],
        "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
    }

    api_key = get_api_key()
    resp = RATE_LIMITER.run(gemini_request, model, body, api_key)
    img_bytes, _mime = extract_image_from_response(resp)

    output_path = args.get("output_path")
    if output_path:
        out = Path(output_path).expanduser()
    else:
        # Default: write next to input as <name>.edited.png
        out = in_path.with_suffix("")
        out = out.parent / f"{out.name}.edited.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(img_bytes)

    dims = png_dimensions(img_bytes)
    result: dict = {
        "path": str(out),
        "model_used": model,
        "bytes": len(img_bytes),
    }
    if dims:
        result["dimensions"] = {"width": dims[0], "height": dims[1]}

    if len(img_bytes) < MAX_INLINE_BASE64_BYTES:
        result["base64"] = base64.b64encode(img_bytes).decode("ascii")

    return result


DESCRIBE_SCHEMA = {
    "type": "object",
    "properties": {
        "description": {"type": "string"},
        "palette_oklch": {
            "type": "array",
            "items": {"type": "string"},
        },
        "style_tags": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["description"],
}


def tool_describe(args: dict) -> dict:
    input_path = args.get("input_path")
    if not input_path:
        raise ValueError("input_path is required")
    in_path = Path(input_path).expanduser()
    if not in_path.exists():
        raise ValueError(f"input_path not found: {in_path}")
    src = in_path.read_bytes()
    mime = detect_mime(src)

    inline = {
        "mime_type": mime,
        "data": base64.b64encode(src).decode("ascii"),
    }
    instruction = (
        "Describe this image precisely. Return JSON with: "
        "(1) description: one to three sentences, factual and visual; "
        "(2) palette_oklch: 3-6 representative colors as OKLCH strings "
        "like 'oklch(72% 0.15 250)'; "
        "(3) style_tags: 3-8 short tags like 'minimal', 'editorial', 'isometric', 'noir'. "
        "Be specific. No marketing fluff."
    )

    body: dict = {
        "contents": [{"parts": [{"inline_data": inline}, {"text": instruction}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": DESCRIBE_SCHEMA,
        },
    }

    api_key = get_api_key()
    resp = RATE_LIMITER.run(gemini_request, VISION_MODEL, body, api_key)

    candidates = resp.get("candidates") or []
    if not candidates:
        feedback = resp.get("promptFeedback") or {}
        block = feedback.get("blockReason") or "no candidates"
        raise RuntimeError(f"Gemini returned no candidates: {block}")
    parts = (candidates[0].get("content") or {}).get("parts") or []
    text = ""
    for part in parts:
        if "text" in part:
            text += part["text"]
    text = text.strip()
    if not text:
        raise RuntimeError("Gemini describe returned empty response")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Gemini describe returned non-JSON: {e}: {text[:300]}")
    return parsed


def tool_batch(args: dict) -> list[dict]:
    requests = args.get("requests")
    if not isinstance(requests, list) or not requests:
        raise ValueError("requests must be a non-empty list")

    results: list[dict | None] = [None] * len(requests)
    threads: list[threading.Thread] = []

    def worker(idx: int, req: dict) -> None:
        try:
            if not isinstance(req, dict):
                results[idx] = {"error": "request entry must be an object"}
                return
            results[idx] = tool_generate(req)
        except Exception as e:
            results[idx] = {"error": str(e)}

    for i, req in enumerate(requests):
        t = threading.Thread(target=worker, args=(i, req), daemon=True)
        t.start()
        threads.append(t)

    for t in threads:
        t.join()

    # Replace any unset (shouldn't happen) with errors
    return [r if r is not None else {"error": "no result"} for r in results]


# ---------------------------------------------------------------------------
# Tool schemas (advertised via tools/list)
# ---------------------------------------------------------------------------

TOOL_SCHEMAS = [
    {
        "name": "generate",
        "description": (
            "Generate an image from a text prompt using Google's Gemini image models. "
            "Caches by sha256(prompt+model+aspect)."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "Text prompt describing the desired image."},
                "aspect_ratio": {
                    "type": "string",
                    "enum": sorted(ALLOWED_ASPECTS),
                    "description": f"Aspect ratio. Default {DEFAULT_ASPECT}.",
                },
                "output_path": {
                    "type": "string",
                    "description": "Absolute path to write the PNG. If omitted, writes to cache dir.",
                },
                "model": {
                    "type": "string",
                    "enum": sorted(ALLOWED_IMAGE_MODELS),
                    "description": f"Gemini image model. Default {DEFAULT_IMAGE_MODEL}.",
                },
            },
            "required": ["prompt"],
        },
    },
    {
        "name": "edit",
        "description": (
            "Edit an existing image using a text prompt. Gemini natively supports "
            "image-to-image editing — describe the change you want."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "input_path": {"type": "string", "description": "Absolute path to source image."},
                "prompt": {"type": "string", "description": "Edit instruction."},
                "output_path": {
                    "type": "string",
                    "description": "Absolute path to write the edited PNG. Defaults to <input>.edited.png.",
                },
                "model": {
                    "type": "string",
                    "enum": sorted(ALLOWED_IMAGE_MODELS),
                    "description": f"Gemini model. Default {DEFAULT_IMAGE_MODEL}.",
                },
            },
            "required": ["input_path", "prompt"],
        },
    },
    {
        "name": "describe",
        "description": (
            "Describe an image — returns structured JSON with description, "
            "palette_oklch, and style_tags. Useful for on-brand checks."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "input_path": {"type": "string", "description": "Absolute path to image."},
            },
            "required": ["input_path"],
        },
    },
    {
        "name": "batch",
        "description": (
            "Run multiple generate requests through the rate-limited queue. "
            "Per-entry errors are returned inline; other entries continue."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "requests": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "prompt": {"type": "string"},
                            "aspect_ratio": {"type": "string", "enum": sorted(ALLOWED_ASPECTS)},
                            "output_path": {"type": "string"},
                            "model": {"type": "string", "enum": sorted(ALLOWED_IMAGE_MODELS)},
                        },
                        "required": ["prompt"],
                    },
                    "minItems": 1,
                },
            },
            "required": ["requests"],
        },
    },
]


# ---------------------------------------------------------------------------
# JSON-RPC server loop
# ---------------------------------------------------------------------------

def make_content_for_image_result(res: dict) -> list[dict]:
    """Turn a generate/edit result into MCP content blocks."""
    content: list[dict] = []
    path = res.get("path", "")
    dims = res.get("dimensions")
    extra = ""
    if dims:
        extra = f" ({dims.get('width')}x{dims.get('height')})"
    cached = " [cached]" if res.get("cached") else ""
    content.append({"type": "text", "text": f"{path}{extra}{cached}"})
    b64 = res.get("base64")
    if b64:
        content.append({"type": "image", "data": b64, "mimeType": "image/png"})
    # Drop the heavy base64 from JSON dump to keep things readable
    payload = {k: v for k, v in res.items() if k != "base64"}
    content.append({"type": "text", "text": json.dumps(payload, indent=2)})
    return content


def make_content_for_json_result(obj: Any) -> list[dict]:
    return [{"type": "text", "text": json.dumps(obj, indent=2)}]


def handle_initialize(_params: dict) -> dict:
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": {"tools": {}},
        "serverInfo": {"name": SERVER_NAME, "version": VERSION},
    }


def handle_tools_list(_params: dict) -> dict:
    return {"tools": TOOL_SCHEMAS}


def handle_tools_call(params: dict) -> dict:
    name = params.get("name")
    args = params.get("arguments") or {}
    if not isinstance(args, dict):
        raise ValueError("arguments must be an object")

    if name == "generate":
        res = tool_generate(args)
        return {"content": make_content_for_image_result(res)}
    if name == "edit":
        res = tool_edit(args)
        return {"content": make_content_for_image_result(res)}
    if name == "describe":
        res = tool_describe(args)
        return {"content": make_content_for_json_result(res)}
    if name == "batch":
        res = tool_batch(args)
        return {"content": make_content_for_json_result(res)}

    raise ValueError(f"unknown tool: {name}")


def send(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def send_result(req_id: Any, result: dict) -> None:
    send({"jsonrpc": "2.0", "id": req_id, "result": result})


def send_error(req_id: Any, code: int, message: str, data: Any = None) -> None:
    err: dict = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    send({"jsonrpc": "2.0", "id": req_id, "error": err})


def dispatch(req: dict) -> None:
    req_id = req.get("id")
    method = req.get("method")
    params = req.get("params") or {}

    # Notifications (no id) — don't send a response
    is_notification = "id" not in req

    try:
        if method == "initialize":
            result = handle_initialize(params)
        elif method == "initialized" or method == "notifications/initialized":
            return  # notification, nothing to do
        elif method == "ping":
            result = {}
        elif method == "tools/list":
            result = handle_tools_list(params)
        elif method == "tools/call":
            result = handle_tools_call(params)
        elif method == "shutdown":
            result = {}
        else:
            if is_notification:
                return
            send_error(req_id, -32601, f"method not found: {method}")
            return
    except ValueError as e:
        if is_notification:
            return
        send_error(req_id, -32602, str(e))
        return
    except Exception as e:
        log(f"error in {method}: {e}")
        log(traceback.format_exc())
        if is_notification:
            return
        # tools/call: surface as tool error in MCP-friendly way
        if method == "tools/call":
            send_result(req_id, {
                "content": [{"type": "text", "text": f"error: {e}"}],
                "isError": True,
            })
        else:
            send_error(req_id, -32603, f"internal error: {e}")
        return

    if not is_notification:
        send_result(req_id, result)


def main() -> int:
    log(f"starting (version {VERSION}, max_concurrent={DEFAULT_MAX_CONCURRENT})")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            send_error(None, -32700, f"parse error: {e}")
            continue
        if isinstance(req, list):
            # Batch JSON-RPC — process each independently
            for item in req:
                if isinstance(item, dict):
                    dispatch(item)
        elif isinstance(req, dict):
            dispatch(req)
        else:
            send_error(None, -32600, "invalid request")
    log("stdin closed, exiting")
    return 0


if __name__ == "__main__":
    sys.exit(main())
