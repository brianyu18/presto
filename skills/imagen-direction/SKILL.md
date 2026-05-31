---
name: imagen-direction
description: Use whenever a design needs real imagery (hero, product, lifestyle, texture, background). Teaches anti-slop prompt patterns, aspect ratios per slot, when to call nanogen's generate vs edit vs describe vs batch, and how to wire returned paths into HTML/JSX. Pairs with the nanogen MCP (or falls back to picsum/TODO when not available).
---

# imagen-direction

Art direction layer for AI image generation inside presto. The nanogen MCP is the engine. This skill is the taste.

## When to invoke

Invoke this skill any time a design needs a real raster image and one of these is true:

- A net-new hero is required and no asset has been supplied.
- A redesign target has placeholder images, stock-photo holes, or obvious AI slop that needs replacing.
- The `/houdini` DRAFT phase is generating multiple concept directions and each needs distinctive imagery.
- The `/magic` BUILD phase is wiring final imagery into the user's project.
- An existing HTML or JSX file references `<img>` with a placeholder src (picsum, unsplash random, a TODO comment, a 1x1 transparent gif, or a missing file).
- A section gets added during `/design-flow` and the layout has a visible image slot.

If the answer to "would a designer reach for stock or shoot something here?" is yes, this skill applies.

## When NOT to invoke

Do not invoke for:

- Icons. Use `lucide`, `phosphor`, or `radix-icons` from the project's icon library.
- Logos. Hand-build with type and shape primitives, or use `Simple Icons` for known brands.
- Product screenshots. Capture the real app with `/browse` or ask the user for a screen recording.
- Decorative SVG (blobs, grids, noise textures). Author inline as SVG or CSS.
- Cases where the brand brief already provides a photography library, CDN, or DAM. Use what they gave you.
- Marketing copy headers that look like images but are actually styled text.

When in doubt, ask: is this a raster photograph or photorealistic illustration? If no, skip nanogen.

## Tool selection cheat sheet

The nanogen MCP exposes four tools. Pick by intent.

- `mcp__plugin_presto_nanogen__generate` — one new image from a prompt. Default tool for any net-new asset.
- `mcp__plugin_presto_nanogen__edit` — modify an existing image. Preserves composition. Use for "same photo, warmer palette", "same scene, different camera angle", "remove the text overlay", "make the subject hold a different object".
- `mcp__plugin_presto_nanogen__describe` — vision read on an image. Returns description, OKLCH palette, style tags. Use when judging "is this on-brand?" or when you need to feed an image's mood into a sibling prompt.
- `mcp__plugin_presto_nanogen__batch` — two or more generate calls funneled through the rate-limit queue. Always prefer batch when a draft needs more than one image. It is meaningfully faster than serial generate calls and respects quota.

Rule of thumb: if you are about to call generate twice in a row, stop and call batch instead.

## Anti-slop prompt patterns

The real leverage of this skill. The default Gemini output for a thin prompt looks like every other AI image on the internet. Avoid that family.

Banned defaults. Never include these words or phrases in a prompt unless the user explicitly asked for them:

- "cinematic"
- "epic"
- "dreamy"
- "vibrant"
- "stunning"
- "8k", "ultra-detailed", "hyperrealistic"
- "bokeh" (use it sparingly and only with a real lens reason)
- "golden hour" (overused; specify the actual light direction instead)
- "centered subject" or any composition described as centered

Banned compositional defaults:

- Subject centered in frame.
- Symmetric three-quarter portrait.
- Single hero object on a clean gradient background.
- Floating product on white seamless.

Anchors that work. Reach for these instead:

- Style: "editorial", "documentary", "studio still life", "natural product photography", "architectural detail", "reportage", "process photography", "scanned archive".
- Light: "harsh window light from frame-left, deep shadow on right", "blue-hour spill from a single street lamp", "overcast north-facing skylight", "raking late-afternoon sun across a textured wall", "single soft-box camera-left, no fill".
- Media: "medium-format 35mm grain", "scanned slide film", "shot on Mamiya 7", "Portra 400", "Tri-X push-processed", "early digital CCD look".
- Composition: "off-center, subject in left third", "subject cropping out of frame top-right", "extreme low angle", "overhead flat-lay with negative space upper half", "shoulder of subject framing foreground".
- Subject specifics: "hands working", "edge of object cropping out of frame", "back of subject's head toward camera", "the object mid-motion, slight blur".
- Constraints: "no faces", "no text or logos in image", "no people", "single light source", "muted palette only", "no saturated reds".

Brand palette enforcement. Always name the palette explicitly in the prompt using OKLCH or named colors. Example: "palette restricted to muted terracotta (oklch 0.62 0.09 45), slate grey (oklch 0.45 0.02 250), warm off-white (oklch 0.94 0.01 80)". Gemini respects these constraints surprisingly well when they are at the top of the prompt.

Prompt structure that works:

```
[Style anchor]. [Subject + composition]. [Light]. [Media]. [Palette].
[Constraints]. [Aspect ratio reminder if needed].
```

Example, good:

```
Documentary still life. A worn leather notebook open on a stone counter,
edge of frame cutting through pages on the right. Harsh north-window
light from frame-left, deep shadow under the spine. Medium-format film,
visible grain, Portra 400. Palette restricted to warm off-white,
ink-blue, and faded ochre. No text in image, no hands, no people.
```

Example, slop:

```
A beautiful leather notebook, cinematic, 8k, golden hour, bokeh,
stunning detail, vibrant colors.
```

## Aspect ratio per slot

Pick the ratio from the layout, not from a default. Get it right the first time. Re-generating to change aspect wastes quota.

- Hero, full-bleed cinematic: `16:9` (most layouts) or letterbox crop a `16:9` for cinemascope feel.
- Hero, split layout (image one side, text the other): `4:3` or `3:2`.
- Hero, mobile-first or app-store style: `9:16`.
- Product card grid: `4:5` (the Instagram-portrait ratio reads as premium).
- Lifestyle / editorial inline: `3:2`.
- Pull-quote portrait or testimonial: `3:4`.
- Texture, pattern, or ambient background: `1:1` for tiling, `16:9` for full-bleed.
- Banner strip between sections: `16:9` cropped tall in CSS, or `21:9` if nanogen exposes it (currently round to `16:9`).

If unsure, choose `3:2`. It is the most editorial-feeling ratio and survives most crops.

## Wiring returned paths into code

The generate tool returns `{ path, dimensions, model_used, cached, base64? }`. The `path` is an absolute filesystem path. Use it directly.

For raw HTML:

```html
<img
  src="/absolute/path/from/nanogen.png"
  alt="Worn leather notebook on stone counter under north window light"
  width="1600"
  height="900"
  loading="lazy"
/>
```

Always set explicit width and height from the returned `dimensions` to prevent CLS.

For Next.js / React with the Image component:

```jsx
import Image from "next/image";
import hero from "@/public/generated/hero.png";

<Image
  src={hero}
  alt="Worn leather notebook on stone counter under north window light"
  priority
/>;
```

If the file lives outside `public/`, copy or symlink it during BUILD. Do not reference `~/.cache/nanogen` paths from a deployable project.

Alt text rule: describe what the image shows, not what the design intends. "Worn leather notebook on stone counter" is correct. "Hero image conveying craft" is wrong.

## Iteration patterns

Start cheap, escalate on quality.

1. First pass: `model: 'gemini-2.5-flash-image'`. Fast, cheap, good enough for 80% of slots.
2. If the output is for a hero or a marquee product card and the first pass lacks fidelity, regenerate with `model: 'gemini-3-pro-image'`. Reserve this for the one or two highest-stakes images per design.
3. "Regenerate but warmer" or "same scene, different angle": use `edit` with the previous output as input. This preserves composition and only shifts what you ask. Calling `generate` again rolls the dice on a totally new image.
4. "Is this on-brand?": call `describe` on the candidate, then compare the returned `palette_oklch` and `style_tags` against the brief. If the palette drifts more than ~0.05 in L or C from the target tokens, regenerate with the palette named more aggressively in the prompt.
5. Two-pass refinement for heroes: generate at flash, run describe on the result, feed the describe output back into a sharpened prompt for the pro pass.

## When to skip generation entirely

Fall back gracefully when nanogen is not usable.

- No `GEMINI_API_KEY` in env and no `~/.config/nanogen/key` file. The generate tool will error. Fall back to a seeded picsum URL:

  ```html
  <!-- TODO: real image. nanogen unavailable (no GEMINI_API_KEY). -->
  <img
    src="https://picsum.photos/seed/notebook-hero/1600/900"
    alt="Placeholder for hero image"
    width="1600"
    height="900"
  />
  ```

  Seed the URL with a stable token derived from the slot name so repeated builds get the same placeholder.

- Quota or rate-limit error from Gemini. Same fallback. Log the error in a comment so the human can see why.
- The brand brief explicitly supplies imagery (DAM URL, Figma file with photo nodes, attached asset zip). Use the supplied assets and skip generation. Do not generate "in the style of" the supplied images unless asked.
- The slot is small enough that a CSS gradient or SVG pattern reads better than a photograph (under ~120px on the longest side, typically). Author the SVG inline.

## Composition with other presto phases

This skill plugs into the presto pipeline at specific points.

- `/houdini` DRAFT phase. Each drafter agent runs in parallel and produces a distinct concept direction. Each draft typically needs a hero plus one or two section images. That is 3 to 6 images per draft cycle. Always use `batch` here. Pass all the prompts in one call so the rate-limit queue serializes them server-side. Per drafter, vary the style anchor and palette so the drafts feel meaningfully different, not like recolors of one image.
- `/magic` BUILD phase. The BUILD agent generates the final, production-quality imagery into the user's project. Use `gemini-3-pro-image` for the one or two hero shots, flash for the rest. Write outputs into the project's `public/generated/` or equivalent, not into the nanogen cache.
- `/design-flow [feature]`. A single section is being revised. Regenerate only that section's imagery. Use `edit` if the existing image is close, `generate` if the direction changed.
- `/design-audit`. Read existing imagery in the project with `describe`. Compare returned palette and style tags against the brand brief. Flag any image whose OKLCH drift or style tags miss the brief. Recommend specific regenerate or edit calls in the audit report.

## Quick reference

- Default model: `gemini-2.5-flash-image`.
- Default aspect: pick from layout; if forced, `3:2`.
- Default tool for 2+ images: `batch`.
- Default fallback when key is missing: seeded `picsum.photos` with TODO comment.
- Always set explicit width and height on `<img>`.
- Always name the palette in the prompt.
- Never ship "cinematic, 8k, bokeh, golden hour" as a prompt.
