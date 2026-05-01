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
  probeMeta, fileSize,
  type Aspect,
} from '../media.js';
import { resolveToLocal, makeOutputPath } from '../../routes/upload.js';
import { compute } from '../compute.js';
import { config } from '../../config.js';
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

/** Image edit planning via 0G Qwen — uses the same Router/Advanced endpoint
 *  as the rest of compute (no broker SDK; that path reverts on Galileo).
 *
 *  Tries a multimodal payload first (Qwen-VL shape: `content: [{type:'text'},
 *  {type:'image_url'}]`). If the configured provider is text-only (current
 *  default Qwen-2.5-7B-Instruct), the call typically still returns a useful
 *  plan because the model treats the URL as referenced context. If the
 *  multimodal call fails outright we fall back to a text-only request that
 *  describes the edit in prose.
 *
 *  When 0G ships a true pixel-edit model the implementation here swaps
 *  without changing the tool contract. */
export const imageEdit: Tool = {
  name: 'image.edit',
  description: 'Natural-language image edit plan via Qwen on 0G. Returns the described result + the concrete edits the model proposes.',
  category: 'media',
  input: z.object({
    fileUrl: z.string().url(),
    instruction: z.string().min(1).max(500).describe('e.g., "color the lizard black", "add soft warm lighting"'),
  }),
  execute: async (input) => {
    const sysPrompt = `You are an expert photo editor. Given an instruction and a referenced image, produce: (1) a one-paragraph description of the edited result, (2) a numbered list of concrete edits applied. Be specific and visual.`;
    // Try multimodal first — works on Qwen-VL providers, ignored on text-only.
    const multimodalBody = {
      model: config.SPECIALIST_MODEL ?? config.DIRECTOR_MODEL,
      messages: [
        { role: 'system', content: sysPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Instruction: ${input.instruction}` },
            { type: 'image_url', image_url: { url: input.fileUrl } },
          ],
        },
      ],
      max_tokens: 500,
      temperature: 0.4,
    };
    try {
      const j = await compute.completionRaw(multimodalBody) as { choices?: Array<{ message?: { content?: string } }> };
      const plan = j.choices?.[0]?.message?.content ?? '';
      if (plan) return { plan, mode: 'multimodal', source: '0g-router' };
    } catch (err) {
      // Multimodal payload may have failed because the provider is text-only.
      // Fall through to the text-described variant below.
      // eslint-disable-next-line no-console
      console.warn(`[image.edit] multimodal call failed (${(err as Error).message}) — falling back to text-only`);
    }

    // Text-only fallback — passes the URL as a quoted reference. The model
    // can't *see* the image but typically still produces a sensible plan.
    const textBody = {
      model: config.SPECIALIST_MODEL ?? config.DIRECTOR_MODEL,
      messages: [
        { role: 'system', content: sysPrompt },
        {
          role: 'user',
          content: `Instruction: ${input.instruction}\n\nThe image is referenced at: ${input.fileUrl}\n\nWithout seeing it, propose what the edit would do based on the instruction alone, and what the result would visually look like.`,
        },
      ],
      max_tokens: 500,
      temperature: 0.4,
    };
    try {
      const j = await compute.completionRaw(textBody) as { choices?: Array<{ message?: { content?: string } }> };
      const plan = j.choices?.[0]?.message?.content ?? '';
      if (!plan) throw new Error('empty response from 0G');
      return { plan, mode: 'text-only', source: '0g-router', note: 'Provider is text-only; plan based on instruction without seeing pixels.' };
    } catch (err) {
      throw new ToolError(`image.edit failed: ${(err as Error).message}`);
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
