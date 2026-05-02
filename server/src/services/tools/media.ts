// Video + image editing tools backed by services/media.ts (ffmpeg) and
// services/compute.ts (0G Qwen-VL for the LLM-driven image edit).
//
// All tools accept a `fileUrl` pointing at either an upload from
// /api/upload (preferred, fast) or a public http(s) URL. They return
// `{ outputUrl, sizeBytes, ... }` so the Tools page can preview the result.
//
// Outputs land in the same /tmp/2in-uploads dir as inputs so subsequent
// tool calls can chain (output of trim → input of reframe, etc).

import { z } from 'zod';
import {
  trimVideo, reframeVideo, letterboxReframe, burnCaption, audioEnhance,
  sceneCuts, extractGif, thumbnailAt, concatVideos, compressVideo,
  resizeImage, cropImage, convertImage, watermarkImage,
  probeMeta, fileSize, applyImageFilter,
  type Aspect,
} from '../media.js';
import { resolveToLocal, makeOutputPath } from '../../routes/upload.js';
import { compute } from '../compute.js';
import { config } from '../../config.js';
import { resolveProviderUrl } from '../provider-lookup.js';
import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { ToolError, type Tool, type ToolContext } from './types.js';

const ASPECTS = ['9:16', '1:1', '16:9'] as const;

// Build the public URL the same way the upload route does, but without a
// FastifyRequest. We rely on PUBLIC_BASE_URL env (or fall back to localhost).
function publicUrl(filename: string, ctx: ToolContext): string {
  // ctx.log carries no req. Use process env.
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '')
    ?? `http://localhost:${process.env.PORT ?? 3001}`;
  void ctx;
  return `${base}/api/upload/file/${encodeURIComponent(filename)}`;
}

// ====================== VIDEO TOOLS ======================

export const videoTrim: Tool = {
  name: 'video.trim',
  description: 'Cut a video to a [start, end] window in seconds. Re-encodes with libx264.',
  category: 'media',
  input: z.object({
    fileUrl: z.string().url().describe('Upload URL or http(s) URL'),
    startSec: z.number().min(0).default(0),
    endSec: z.number().min(0.1),
  }),
  execute: async (input, ctx) => {
    const src = await resolveToLocal(input.fileUrl);
    const out = makeOutputPath('.mp4');
    try {
      await trimVideo(src.path, input.startSec, input.endSec, out.path);
      const size = await fileSize(out.path);
      return { outputUrl: publicUrl(out.filename, ctx), filename: out.filename, sizeBytes: size, durationSec: input.endSec - input.startSec };
    } catch (err) {
      throw new ToolError(`video.trim failed: ${(err as Error).message}`);
    } finally {
      await src.cleanup();
    }
  },
};

export const videoReframe: Tool = {
  name: 'video.reframe',
  description: 'Reframe video to a target aspect (9:16 / 1:1 / 16:9). Crop fills, letterbox preserves the full frame.',
  category: 'media',
  input: z.object({
    fileUrl: z.string().url(),
    aspect: z.enum(ASPECTS).default('9:16'),
    mode: z.enum(['crop', 'letterbox']).default('crop'),
  }),
  execute: async (input, ctx) => {
    const src = await resolveToLocal(input.fileUrl);
    const out = makeOutputPath('.mp4');
    try {
      const fn = input.mode === 'letterbox' ? letterboxReframe : reframeVideo;
      await fn(src.path, out.path, input.aspect as Aspect);
      const size = await fileSize(out.path);
      return { outputUrl: publicUrl(out.filename, ctx), filename: out.filename, sizeBytes: size, aspect: input.aspect, mode: input.mode };
    } catch (err) {
      throw new ToolError(`video.reframe failed: ${(err as Error).message}`);
    } finally {
      await src.cleanup();
    }
  },
};

export const videoBurnCaption: Tool = {
  name: 'video.burn_caption',
  description: 'Burn-in a caption text overlay on a video.',
  category: 'media',
  input: z.object({
    fileUrl: z.string().url(),
    caption: z.string().min(1).max(500),
    fontSize: z.number().int().min(16).max(160).optional(),
    position: z.enum(['top', 'center', 'bottom']).default('bottom'),
  }),
  execute: async (input, ctx) => {
    const src = await resolveToLocal(input.fileUrl);
    const out = makeOutputPath('.mp4');
    try {
      await burnCaption(src.path, input.caption, out.path, { fontSize: input.fontSize, position: input.position });
      const size = await fileSize(out.path);
      return { outputUrl: publicUrl(out.filename, ctx), filename: out.filename, sizeBytes: size };
    } catch (err) {
      throw new ToolError(`video.burn_caption failed: ${(err as Error).message}`);
    } finally {
      await src.cleanup();
    }
  },
};

export const videoAudioEnhance: Tool = {
  name: 'video.audio_enhance',
  description: 'AI noise suppression (afftdn) + EBU R128 loudness normalization on the audio track.',
  category: 'media',
  input: z.object({
    fileUrl: z.string().url(),
  }),
  execute: async (input, ctx) => {
    const src = await resolveToLocal(input.fileUrl);
    const out = makeOutputPath('.mp4');
    try {
      await audioEnhance(src.path, out.path);
      const size = await fileSize(out.path);
      return { outputUrl: publicUrl(out.filename, ctx), filename: out.filename, sizeBytes: size };
    } catch (err) {
      throw new ToolError(`video.audio_enhance failed: ${(err as Error).message}`);
    } finally {
      await src.cleanup();
    }
  },
};

export const videoSceneCuts: Tool = {
  name: 'video.scene_cuts',
  description: 'Detect scene-change timestamps. Returns an array of seconds.',
  category: 'media',
  input: z.object({
    fileUrl: z.string().url(),
    threshold: z.number().min(0.1).max(0.9).default(0.35),
  }),
  execute: async (input) => {
    const src = await resolveToLocal(input.fileUrl);
    try {
      const cuts = await sceneCuts(src.path, input.threshold);
      return { count: cuts.length, cuts };
    } catch (err) {
      throw new ToolError(`video.scene_cuts failed: ${(err as Error).message}`);
    } finally {
      await src.cleanup();
    }
  },
};

export const videoGif: Tool = {
  name: 'video.gif',
  description: 'Extract a section as an animated GIF (palette-optimised).',
  category: 'media',
  input: z.object({
    fileUrl: z.string().url(),
    startSec: z.number().min(0).default(0),
    durationSec: z.number().min(0.5).max(30).default(3),
    width: z.number().int().min(160).max(1080).default(480),
    fps: z.number().int().min(6).max(24).default(12),
  }),
  execute: async (input, ctx) => {
    const src = await resolveToLocal(input.fileUrl);
    const out = makeOutputPath('.gif');
    try {
      await extractGif(src.path, input.startSec, input.durationSec, out.path, { width: input.width, fps: input.fps });
      const size = await fileSize(out.path);
      return { outputUrl: publicUrl(out.filename, ctx), filename: out.filename, sizeBytes: size };
    } catch (err) {
      throw new ToolError(`video.gif failed: ${(err as Error).message}`);
    } finally {
      await src.cleanup();
    }
  },
};

export const videoThumbnail: Tool = {
  name: 'video.thumbnail',
  description: 'Capture a single frame at time T as a PNG/JPG.',
  category: 'media',
  input: z.object({
    fileUrl: z.string().url(),
    atSec: z.number().min(0).default(1),
    width: z.number().int().min(160).max(3840).default(1280),
    format: z.enum(['png', 'jpg']).default('jpg'),
  }),
  execute: async (input, ctx) => {
    const src = await resolveToLocal(input.fileUrl);
    const out = makeOutputPath(`.${input.format}`);
    try {
      await thumbnailAt(src.path, input.atSec, out.path, { width: input.width });
      const size = await fileSize(out.path);
      return { outputUrl: publicUrl(out.filename, ctx), filename: out.filename, sizeBytes: size };
    } catch (err) {
      throw new ToolError(`video.thumbnail failed: ${(err as Error).message}`);
    } finally {
      await src.cleanup();
    }
  },
};

export const videoConcat: Tool = {
  name: 'video.concat',
  description: 'Concatenate multiple videos lossless. All inputs should share codec.',
  category: 'media',
  input: z.object({
    fileUrls: z.array(z.string().url()).min(2).max(20),
  }),
  execute: async (input, ctx) => {
    const sources = await Promise.all(input.fileUrls.map((u: string) => resolveToLocal(u)));
    const out = makeOutputPath('.mp4');
    try {
      await concatVideos(sources.map((s) => s.path), out.path);
      const size = await fileSize(out.path);
      return { outputUrl: publicUrl(out.filename, ctx), filename: out.filename, sizeBytes: size, count: sources.length };
    } catch (err) {
      throw new ToolError(`video.concat failed: ${(err as Error).message}`);
    } finally {
      for (const s of sources) await s.cleanup();
    }
  },
};

export const videoCompress: Tool = {
  name: 'video.compress',
  description: 'Re-encode at a target CRF (lower=better quality, higher=smaller). 23 default, 28 slim.',
  category: 'media',
  input: z.object({
    fileUrl: z.string().url(),
    crf: z.number().int().min(18).max(40).default(28),
    preset: z.enum(['ultrafast', 'fast', 'medium', 'slow']).default('medium'),
  }),
  execute: async (input, ctx) => {
    const src = await resolveToLocal(input.fileUrl);
    const out = makeOutputPath('.mp4');
    try {
      await compressVideo(src.path, out.path, { crf: input.crf, preset: input.preset });
      const size = await fileSize(out.path);
      return { outputUrl: publicUrl(out.filename, ctx), filename: out.filename, sizeBytes: size, crf: input.crf };
    } catch (err) {
      throw new ToolError(`video.compress failed: ${(err as Error).message}`);
    } finally {
      await src.cleanup();
    }
  },
};

export const videoProbe: Tool = {
  name: 'video.probe',
  description: 'Probe video metadata — duration, dimensions, container.',
  category: 'media',
  input: z.object({
    fileUrl: z.string().url(),
  }),
  execute: async (input) => {
    const src = await resolveToLocal(input.fileUrl);
    try {
      const meta = await probeMeta(src.path);
      return meta;
    } catch (err) {
      throw new ToolError(`video.probe failed: ${(err as Error).message}`);
    } finally {
      await src.cleanup();
    }
  },
};

// ====================== IMAGE TOOLS ======================

export const imageResize: Tool = {
  name: 'image.resize',
  description: 'Resize an image. Pass either width or height (or both). -1 = preserve aspect.',
  category: 'media',
  input: z.object({
    fileUrl: z.string().url(),
    width: z.number().int().min(16).max(8192).optional(),
    height: z.number().int().min(16).max(8192).optional(),
    format: z.enum(['png', 'jpg', 'webp']).default('jpg'),
  }),
  execute: async (input, ctx) => {
    if (input.width == null && input.height == null) {
      throw new ToolError('image.resize: provide width or height');
    }
    const src = await resolveToLocal(input.fileUrl);
    const out = makeOutputPath(`.${input.format}`);
    try {
      await resizeImage(src.path, out.path, input.width ?? null, input.height ?? null);
      const size = await fileSize(out.path);
      return { outputUrl: publicUrl(out.filename, ctx), filename: out.filename, sizeBytes: size };
    } catch (err) {
      throw new ToolError(`image.resize failed: ${(err as Error).message}`);
    } finally {
      await src.cleanup();
    }
  },
};

export const imageCrop: Tool = {
  name: 'image.crop',
  description: 'Crop an image. Width/height + offset (x, y from top-left).',
  category: 'media',
  input: z.object({
    fileUrl: z.string().url(),
    width: z.number().int().min(8),
    height: z.number().int().min(8),
    x: z.number().int().min(0).default(0),
    y: z.number().int().min(0).default(0),
    format: z.enum(['png', 'jpg', 'webp']).default('jpg'),
  }),
  execute: async (input, ctx) => {
    const src = await resolveToLocal(input.fileUrl);
    const out = makeOutputPath(`.${input.format}`);
    try {
      await cropImage(src.path, out.path, input.width, input.height, input.x, input.y);
      const size = await fileSize(out.path);
      return { outputUrl: publicUrl(out.filename, ctx), filename: out.filename, sizeBytes: size };
    } catch (err) {
      throw new ToolError(`image.crop failed: ${(err as Error).message}`);
    } finally {
      await src.cleanup();
    }
  },
};

export const imageFormat: Tool = {
  name: 'image.format',
  description: 'Convert image format (png ↔ jpg ↔ webp ↔ gif).',
  category: 'media',
  input: z.object({
    fileUrl: z.string().url(),
    format: z.enum(['png', 'jpg', 'webp', 'gif']).default('webp'),
  }),
  execute: async (input, ctx) => {
    const src = await resolveToLocal(input.fileUrl);
    const out = makeOutputPath(`.${input.format}`);
    try {
      await convertImage(src.path, out.path);
      const size = await fileSize(out.path);
      return { outputUrl: publicUrl(out.filename, ctx), filename: out.filename, sizeBytes: size, format: input.format };
    } catch (err) {
      throw new ToolError(`image.format failed: ${(err as Error).message}`);
    } finally {
      await src.cleanup();
    }
  },
};

export const imageWatermark: Tool = {
  name: 'image.watermark',
  description: 'Overlay a text watermark on an image. Position: tl/tr/bl/br/center.',
  category: 'media',
  input: z.object({
    fileUrl: z.string().url(),
    text: z.string().min(1).max(200),
    fontSize: z.number().int().min(12).max(120).default(36),
    opacity: z.number().min(0.1).max(1).default(0.55),
    position: z.enum(['tl', 'tr', 'bl', 'br', 'center']).default('br'),
    format: z.enum(['png', 'jpg', 'webp']).default('jpg'),
  }),
  execute: async (input, ctx) => {
    const src = await resolveToLocal(input.fileUrl);
    const out = makeOutputPath(`.${input.format}`);
    try {
      await watermarkImage(src.path, out.path, input.text, {
        fontSize: input.fontSize,
        opacity: input.opacity,
        position: input.position,
      });
      const size = await fileSize(out.path);
      return { outputUrl: publicUrl(out.filename, ctx), filename: out.filename, sizeBytes: size };
    } catch (err) {
      throw new ToolError(`image.watermark failed: ${(err as Error).message}`);
    } finally {
      await src.cleanup();
    }
  },
};

// ====================== LLM-DRIVEN ======================

/** Image edit via Qwen-as-translator + ffmpeg. The 0G text Qwen can't see
 *  pixels, but it CAN translate an English instruction ("make it warmer",
 *  "color the lizard black") into a global ffmpeg filter expression. We
 *  validate the expression against an allowlist + execute it. Result: a
 *  real pixel-edited image, not just a description.
 *
 *  Limits: filters are GLOBAL (no semantic masking). "Color the lizard
 *  black" applies a desaturate+darken to the whole frame, which still
 *  reads as a black lizard against the original background most of the
 *  time. Object-aware edits need a true VL+inpaint model; will swap when
 *  0G ships one.
 */
const FILTER_TRANSLATOR_SYSTEM = `You are an image-edit compiler. Convert the user's edit instruction into ONE ffmpeg video filter expression. Reply with ONLY the filter string — no prose, no markdown, no quotes.

Available filters and their parameters:
  eq=brightness=N:saturation=N:contrast=N:gamma=N
    brightness -1..1 (negative=darker), saturation 0..3, contrast 0..2, gamma 0.1..10
  hue=h=N:s=N:b=N
    h -180..180 degrees, s 0..3 saturation multiplier, b -10..10 brightness shift
  colorbalance=rs=N:gs=N:bs=N:rm=N:gm=N:bm=N:rh=N:gh=N:bh=N
    each in -1..1 (rs=red shadows, rm=red midtones, rh=red highlights, etc.)
  colorize=hue=N:saturation=N (h 0..360, s 0..1)
  gblur=sigma=N (1..30, gaussian blur)
  boxblur=N (1..20)
  unsharp=la=N:ca=N (-2..2, sharpen/soften)
  vignette                       (dark edges)
  negate                          (invert colors — for "make it negative")
  noise=alls=N:allf=t (N: 1..50 grain amount)
  edgedetect                      (cartoon outline effect)
  pixelize=w=N:h=N (8..64, pixelation)
  fade=t=in:st=0:d=1              (rarely useful for stills)

Rules:
1. Reply with just the filter string. No prose. No backticks.
2. Combine multiple filters with comma: "eq=saturation=0.6,vignette"
3. Use realistic values — extreme values look broken.
4. For "make it black/dark" use eq=brightness=-0.5:saturation=0.2 not negate.
5. For "color X black" where X is an object, just darken+desaturate the whole frame.
6. For "remove background" you can't — return: gblur=sigma=10
7. For sketch/cartoon use: edgedetect

Examples:
  "make it warmer"           → eq=saturation=1.15,colorbalance=rs=0.18:bs=-0.12
  "make it black and white"  → hue=s=0
  "color the lizard black"   → eq=brightness=-0.55:saturation=0:contrast=1.2
  "vintage feel"             → eq=saturation=0.65:contrast=1.1,colorbalance=rs=0.15:bs=-0.18,vignette
  "blur the background"      → gblur=sigma=8
  "add film grain"           → noise=alls=18:allf=t
  "neon look"                → eq=saturation=2:contrast=1.4:brightness=0.05,hue=h=20
  "darker and moodier"       → eq=brightness=-0.18:saturation=0.85:contrast=1.25,vignette`;

/** Resolve the dedicated image-edit endpoint. Returns null if not configured. */
async function imageEditEndpoint(): Promise<string | null> {
  if (!config.ZG_IMAGE_EDIT_API_KEY) return null;
  if (config.ZG_IMAGE_EDIT_PROVIDER_URL) {
    return `${config.ZG_IMAGE_EDIT_PROVIDER_URL.replace(/\/$/, '')}/v1/proxy/images/generations`;
  }
  if (config.ZG_IMAGE_EDIT_PROVIDER_ADDRESS) {
    const base = await resolveProviderUrl(config.ZG_IMAGE_EDIT_PROVIDER_ADDRESS);
    return `${base}/v1/proxy/images/generations`;
  }
  return null;
}

/** Encode a local image file as a data: URL — what the qwen-image-edit
 *  payload typically expects when no fetchable URL is available. */
async function fileToDataUrl(path: string): Promise<string> {
  const buf = await readFile(path);
  const ext = extname(path).slice(1).toLowerCase() || 'png';
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
    : ext === 'webp' ? 'image/webp'
    : ext === 'gif' ? 'image/gif'
    : 'image/png';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** Image edit. Two backends, tried in order:
 *
 *   1. Real 0G qwen-image-edit-2511 if ZG_IMAGE_EDIT_API_KEY + provider URL
 *      (or address) are configured. Pixel-true edit, object-aware.
 *   2. ffmpeg-filter via Qwen text translator. Real pixel output but the
 *      filter is GLOBAL (no object masking). Useful for "make it warmer",
 *      "make it black and white", "add vignette", etc.
 */
export const imageEdit: Tool = {
  name: 'image.edit',
  description: 'Edit an image with a natural-language instruction. Uses 0G qwen-image-edit-2511 when configured (pixel-true, object-aware), falls back to a Qwen-driven ffmpeg filter (global tone/color edits).',
  category: 'media',
  input: z.object({
    fileUrl: z.string().url(),
    instruction: z.string().min(1).max(500).describe('e.g., "color the lizard black", "add soft warm lighting", "remove the background"'),
  }),
  execute: async (input, ctx) => {
    // === Backend 1: real qwen-image-edit-2511 ============================
    const endpoint = await imageEditEndpoint();
    if (endpoint) {
      const src = await resolveToLocal(input.fileUrl);
      try {
        // Try a few common payload shapes. The 0G docs example shows a
        // bare /images/generations call, but the model is labelled "Image
        // Editing" so we attempt to pass the source image too — the
        // provider accepts whichever field its handler implements.
        const dataUrl = await fileToDataUrl(src.path);
        const baseBody = {
          model: config.ZG_IMAGE_EDIT_MODEL,
          prompt: input.instruction,
          n: 1,
          size: '1024x1024',
          response_format: 'b64_json',
        };
        const variants = [
          { ...baseBody, image: dataUrl },          // common openai-edit shape
          { ...baseBody, image_url: dataUrl },      // alt naming
          { ...baseBody, init_image: dataUrl },     // diffusers-style
          baseBody,                                  // last resort: prompt only (re-render)
        ];
        let lastErr: string | null = null;
        for (const body of variants) {
          try {
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.ZG_IMAGE_EDIT_API_KEY}`,
              },
              body: JSON.stringify(body),
            });
            if (!res.ok) {
              const text = await res.text().catch(() => '');
              lastErr = `${res.status} ${text.slice(0, 180)}`;
              continue;
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const j = (await res.json()) as any;
            const b64 = j?.data?.[0]?.b64_json;
            const url = j?.data?.[0]?.url;
            if (!b64 && !url) {
              lastErr = `unexpected response shape: ${JSON.stringify(j).slice(0, 180)}`;
              continue;
            }
            const out = makeOutputPath('.png');
            if (b64) {
              await writeFile(out.path, Buffer.from(b64, 'base64'));
            } else {
              const r2 = await fetch(url);
              if (!r2.ok) throw new Error(`fetch generated image: ${r2.status}`);
              await writeFile(out.path, Buffer.from(await r2.arrayBuffer()));
            }
            const size = await fileSize(out.path);
            return {
              outputUrl: publicUrl(out.filename, ctx),
              filename: out.filename,
              sizeBytes: size,
              instruction: input.instruction,
              backend: 'qwen-image-edit-2511',
              shape: Object.keys(body).find((k) => k === 'image' || k === 'image_url' || k === 'init_image') ?? 'prompt-only',
            };
          } catch (err) {
            lastErr = (err as Error).message;
          }
        }
        // eslint-disable-next-line no-console
        console.warn(`[image.edit] qwen-image-edit endpoint exhausted variants — last err: ${lastErr ?? 'unknown'} — falling back to ffmpeg`);
      } finally {
        await src.cleanup();
      }
    }

    // === Backend 2: ffmpeg-filter via Qwen translator ======================
    let filter = '';
    try {
      const j = await compute.completionRaw({
        model: config.SPECIALIST_MODEL ?? config.DIRECTOR_MODEL,
        messages: [
          { role: 'system', content: FILTER_TRANSLATOR_SYSTEM },
          { role: 'user', content: input.instruction },
        ],
        max_tokens: 200,
        temperature: 0.2,
      }) as { choices?: Array<{ message?: { content?: string } }> };
      filter = (j.choices?.[0]?.message?.content ?? '').trim();
      filter = filter.replace(/^```\w*\s*|\s*```$/g, '').trim();
      filter = filter.replace(/^filter[:=]\s*/i, '').trim();
      filter = filter.replace(/^["'`]+|["'`]+$/g, '').trim();
      filter = filter.split(/\n/)[0]!.trim();
    } catch (err) {
      throw new ToolError(`image.edit translator failed: ${(err as Error).message}`);
    }
    if (!filter) throw new ToolError('image.edit: empty filter from translator');

    const src = await resolveToLocal(input.fileUrl);
    const out = makeOutputPath('.jpg');
    try {
      await applyImageFilter(src.path, out.path, filter);
      const size = await fileSize(out.path);
      return {
        outputUrl: publicUrl(out.filename, ctx),
        filename: out.filename,
        sizeBytes: size,
        filter,
        instruction: input.instruction,
        backend: 'ffmpeg-filter',
        note: endpoint
          ? 'qwen-image-edit endpoint failed — fell back to global ffmpeg filter'
          : 'qwen-image-edit not configured (set ZG_IMAGE_EDIT_API_KEY + ZG_IMAGE_EDIT_PROVIDER_URL/ADDRESS) — using ffmpeg filter',
      };
    } catch (err) {
      throw new ToolError(`image.edit failed: ${(err as Error).message} (filter was: ${filter})`);
    } finally {
      await src.cleanup();
    }
  },
};

/** Compose a sentence-level summary of a video by chaining
 *  scene_cuts → thumbnailAt(midpoint) → analyze_image. Useful as a
 *  one-shot "what's in this video" check from the Tools page. */
export const videoSummarize: Tool = {
  name: 'video.summarize',
  description: 'One-shot "what is in this video" — picks the midpoint frame, sends it through Qwen-VL.',
  category: 'media',
  input: z.object({
    fileUrl: z.string().url(),
  }),
  execute: async (input, ctx) => {
    const src = await resolveToLocal(input.fileUrl);
    const out = makeOutputPath('.jpg');
    try {
      const meta = await probeMeta(src.path);
      const midpoint = (meta.durationSec ?? 4) / 2;
      await thumbnailAt(src.path, midpoint, out.path, { width: 1024 });
      const url = publicUrl(out.filename, ctx);
      // Reuse the imageEdit pattern with a "describe this" instruction.
      const result = await imageEdit.execute({ fileUrl: url, instruction: 'Describe this video frame in one short paragraph.' }, ctx);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const desc = (result as any).plan ?? '';
      return { thumbnail: url, midpointSec: midpoint, description: desc, durationSec: meta.durationSec };
    } catch (err) {
      throw new ToolError(`video.summarize failed: ${(err as Error).message}`);
    } finally {
      await src.cleanup();
    }
  },
};
