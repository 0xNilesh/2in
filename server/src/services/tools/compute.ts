// Compute tools — backed by 0G Compute providers when broker is configured,
// else by deterministic mocks so the demo flows without funded wallets.
//
// All four tools are loosely typed against the broker SDK because its
// surface is in flux (see Phase 1 snapshot). On any broker error we surface
// a ToolError that the route layer turns into a clean HTTP response.
//
//   transcribe(audioUrl)      — Whisper
//   gen_image(prompt, size?)  — Z-Image
//   analyze_image(imageUrl)   — Qwen3 VL 30B
//   find_clips(transcript, n) — Qwen3.6-Plus structured output

import crypto from 'node:crypto';
import { z } from 'zod';
import { isBrokerConfigured, getBroker } from '../broker.js';
import { compute } from '../compute.js';
import { config } from '../../config.js';
import type { Tool } from './types.js';
import { ToolError } from './types.js';

// ── transcribe ──────────────────────────────────────────────────────────
export const transcribe: Tool = {
  name: 'transcribe',
  description: 'Transcribe audio (or audio track of a video) via Whisper. Returns text + segments.',
  category: 'compute',
  input: z.object({
    audioUrl: z.string().url(),
    language: z.string().optional(),
  }),
  execute: async (input) => {
    if (!isBrokerConfigured()) return mockTranscribe(input.audioUrl);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const broker = (await getBroker()) as any;
      const services: Array<{ provider: string; model: string; url?: string }> =
        await broker.inference.listService();
      const target = services.find((s) => /whisper/i.test(s.model));
      if (!target) return mockTranscribe(input.audioUrl, 'no whisper provider available');

      // Fetch the audio file into memory; broker requires multipart upload.
      const audioRes = await fetch(input.audioUrl);
      if (!audioRes.ok) throw new Error(`audio fetch ${audioRes.status}`);
      const buf = Buffer.from(await audioRes.arrayBuffer());

      const headers = await broker.inference.getRequestHeaders(target.provider, '');
      const form = new FormData();
      form.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'audio.mp3');
      form.append('model', target.model);
      if (input.language) form.append('language', input.language);

      const r = await fetch(`${target.url}/v1/audio/transcriptions`, {
        method: 'POST',
        headers,
        body: form,
      });
      const j: any = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? `whisper ${r.status}`);
      return {
        text: j.text ?? '',
        language: j.language,
        durationSec: j.duration,
        segments: j.segments,
        provider: target.provider,
        source: 'broker',
      };
    } catch (err) {
      throw new ToolError(`transcribe failed: ${(err as Error).message}`, err);
    }
  },
};

function mockTranscribe(url: string, why?: string) {
  const seed = crypto.createHash('sha256').update(url).digest('hex').slice(0, 8);
  return {
    text: 'I want to talk about something I\'ve been getting wrong for a year. I thought I was burned out — turns out, I was bored. Here\'s what changed.',
    language: 'en',
    durationSec: 28,
    segments: [
      { start: 0, end: 8, text: 'I want to talk about something I\'ve been getting wrong for a year.' },
      { start: 8, end: 18, text: 'I thought I was burned out — turns out, I was bored.' },
      { start: 18, end: 28, text: 'Here\'s what changed.' },
    ],
    provider: `mock-${seed}`,
    source: why ? `mock (${why})` : 'mock',
  };
}

// ── gen_image ───────────────────────────────────────────────────────────
export const genImage: Tool = {
  name: 'gen_image',
  description: 'Generate an image from a text prompt via Z-Image. Returns URL or base64.',
  category: 'compute',
  input: z.object({
    prompt: z.string().min(1),
    size: z.enum(['512x512', '1024x1024', '1792x1024', '1024x1792']).default('1024x1024'),
  }),
  execute: async (input) => {
    if (!isBrokerConfigured()) return mockGenImage(input.prompt, input.size);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const broker = (await getBroker()) as any;
      const services: Array<{ provider: string; model: string; url?: string }> =
        await broker.inference.listService();
      const target = services.find((s) => /z-?image|image|sd|flux/i.test(s.model));
      if (!target) return mockGenImage(input.prompt, input.size, 'no image provider available');

      const headers = await broker.inference.getRequestHeaders(
        target.provider,
        JSON.stringify({ prompt: input.prompt }),
      );
      const r = await fetch(`${target.url}/v1/images/generations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ model: target.model, prompt: input.prompt, size: input.size, n: 1 }),
      });
      const j: any = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? `image ${r.status}`);
      const url = j.data?.[0]?.url;
      const b64 = j.data?.[0]?.b64_json;
      return { url, b64, size: input.size, provider: target.provider, source: 'broker' };
    } catch (err) {
      throw new ToolError(`gen_image failed: ${(err as Error).message}`, err);
    }
  },
};

function mockGenImage(prompt: string, size: string, why?: string) {
  const seed = crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 12);
  const [w, h] = size.split('x');
  return {
    url: `https://placehold.co/${w}x${h}/0b0a0d/ff8a5b?text=${encodeURIComponent(prompt.slice(0, 24))}`,
    b64: null,
    size,
    seed,
    provider: 'mock-z-image',
    source: why ? `mock (${why})` : 'mock',
  };
}

// ── analyze_image ───────────────────────────────────────────────────────
export const analyzeImage: Tool = {
  name: 'analyze_image',
  description: 'Vision: describe an image. Returns text description + tags. Uses 0G Router (Qwen-VL when available).',
  category: 'compute',
  input: z.object({
    imageUrl: z.string().url(),
    question: z.string().optional(),
  }),
  execute: async (input) => {
    const question = input.question ?? 'Describe this image in 2 sentences. Then list 5 tags.';
    // Try multimodal first — if the configured provider is Qwen-VL it sees
    // the image; if it's text-only Qwen-2.5 the call may still succeed but
    // the model can't actually see pixels. We surface the URL either way.
    const multimodalBody = {
      model: config.SPECIALIST_MODEL ?? config.DIRECTOR_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: question },
            { type: 'image_url', image_url: { url: input.imageUrl } },
          ],
        },
      ],
      max_tokens: 400,
    };
    try {
      const j = await compute.completionRaw(multimodalBody) as { choices?: Array<{ message?: { content?: string } }> };
      const description = j.choices?.[0]?.message?.content ?? '';
      if (description) return { description, mode: 'multimodal', source: '0g-router' };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[analyze_image] multimodal failed (${(err as Error).message}) — falling back`);
    }

    // Text-only fallback — references the URL but doesn't load pixels.
    const textBody = {
      model: config.SPECIALIST_MODEL ?? config.DIRECTOR_MODEL,
      messages: [{
        role: 'user' as const,
        content: `${question}\n\nImage URL: ${input.imageUrl}\n\nWithout seeing the image, describe what one would expect based on common usage at that URL pattern.`,
      }],
      max_tokens: 400,
    };
    try {
      const j = await compute.completionRaw(textBody) as { choices?: Array<{ message?: { content?: string } }> };
      const description = j.choices?.[0]?.message?.content ?? '';
      if (!description) return mockAnalyzeImage(input.imageUrl, input.question);
      return { description, mode: 'text-only', source: '0g-router', note: 'Provider is text-only; description is inferred without seeing pixels.' };
    } catch (err) {
      throw new ToolError(`analyze_image failed: ${(err as Error).message}`, err);
    }
  },
};

function mockAnalyzeImage(url: string, question?: string, why?: string) {
  const seed = crypto.createHash('sha256').update(url).digest('hex').slice(0, 8);
  return {
    description:
      'A close-up photo, neutral lighting, single subject. Composition leans on negative space; mood is calm and considered.',
    tags: ['portrait', 'natural-light', 'minimal', 'editorial', 'warm'],
    question: question ?? null,
    seed,
    source: why ? `mock (${why})` : 'mock',
  };
}

// ── find_clips ──────────────────────────────────────────────────────────
export const findClips: Tool = {
  name: 'find_clips',
  description: 'Pick N high-leverage clips from a transcript. Returns spans with hooks + reasons.',
  category: 'compute',
  input: z.object({
    transcript: z.string().min(1),
    n: z.number().int().min(1).max(10).default(3),
    criteria: z.string().optional(),
  }),
  execute: async (input) => {
    if (!isBrokerConfigured()) return mockFindClips(input.transcript, input.n);
    try {
      const messages = [
        {
          role: 'system' as const,
          content:
            'You are a video editor. Given a transcript with [start-end] timestamps, pick the N most shareable spans. ' +
            'Reply with ONLY a JSON array — no prose. Each item: { start: number (seconds), end: number, hook: string, reason: string }.',
        },
        {
          role: 'user' as const,
          content: `criteria: ${input.criteria ?? 'shareable, hook-forward, self-contained'}\nN: ${input.n}\n\ntranscript:\n${input.transcript}`,
        },
      ];

      let buf = '';
      for await (const chunk of compute.chatStream(messages, { temperature: 0.3 })) {
        if ('delta' in chunk && chunk.delta) buf += chunk.delta;
        if ('done' in chunk && chunk.done) break;
      }
      const parsed = extractClips(buf);
      if (!parsed) throw new Error('LLM returned no parseable JSON');
      return { clips: parsed.slice(0, input.n), source: 'broker' };
    } catch (err) {
      throw new ToolError(`find_clips failed: ${(err as Error).message}`, err);
    }
  },
};

function extractClips(text: string): Array<{ start: number; end: number; hook: string; reason: string }> | null {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr)) return null;
    return arr
      .filter((c) => c && typeof c.start === 'number' && typeof c.end === 'number')
      .map((c) => ({
        start: c.start,
        end: c.end,
        hook: String(c.hook ?? ''),
        reason: String(c.reason ?? ''),
      }));
  } catch {
    return null;
  }
}

function mockFindClips(transcript: string, n: number) {
  // Pick N evenly-spaced spans from the transcript text length.
  const totalChars = transcript.length;
  const slice = Math.floor(totalChars / n);
  const clips = Array.from({ length: n }).map((_, i) => {
    const head = transcript.slice(i * slice, i * slice + 80).trim();
    return {
      start: Math.round(i * 10),
      end: Math.round(i * 10 + 8),
      hook: head.slice(0, 60) + (head.length > 60 ? '…' : ''),
      reason: 'high signal-to-noise; self-contained thought',
    };
  });
  return { clips, source: 'mock' };
}
