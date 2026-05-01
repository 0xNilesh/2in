// Persona extraction route — accepts a corpus of tweets, returns a
// structured persona (style stats + LLM voice profile + performance baseline
// + preference candidates). Results are also seeded into the typed memory
// slices on the server side so the Memory page surfaces them immediately.
//
//   POST /api/persona/extract
//     body: { tweets: RawTweet[], twin?: { tokenId?, name? } }
//     → { persona, seeded: { voiceCount, preferenceCount, themeCount } }

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { extractPersona, type RawTweet } from '../services/persona.js';
import { storage } from '../services/storage.js';
import crypto from 'node:crypto';

const RawTweetSchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: z.string().nullable().optional(),
  metrics: z.object({
    likes: z.number().optional(),
    retweets: z.number().optional(),
    replies: z.number().optional(),
    impressions: z.number().optional(),
  }).optional(),
  lang: z.string().optional(),
});

const ExtractBody = z.object({
  tweets: z.array(RawTweetSchema).min(1),
  twin: z.object({
    tokenId: z.string().optional(),
    name: z.string().optional(),
  }).optional(),
});

export async function personaRoutes(app: FastifyInstance): Promise<void> {
  app.post('/persona/extract', async (req) => {
    const body = ExtractBody.parse(req.body);
    const twinId = body.twin?.tokenId ?? '42';
    const persona = await extractPersona(body.tweets as RawTweet[], { twinName: body.twin?.name });

    // Seed the typed slices. We push compact JSON entries; the Memory page
    // already knows how to render { who, text } shapes.
    const tasks: Promise<unknown>[] = [];

    // voice — top tweets become voice exemplars
    for (const tw of persona.performance.topTweets) {
      tasks.push(storage.writeKv(
        `twin:${twinId}:slice:voice`,
        `tw-${tw.id}`,
        JSON.stringify({ who: 'twitter', text: tw.text, likes: tw.likes, ts: Date.now() }),
      ));
    }
    // voice — also store the synthesized profile bullets for transparency
    for (const b of persona.voice.bullets) {
      tasks.push(storage.writeKv(
        `twin:${twinId}:slice:voice`,
        `vb-${crypto.randomBytes(4).toString('hex')}`,
        JSON.stringify({ who: 'voice profile', text: b, ts: Date.now() }),
      ));
    }
    // preference — derived candidates
    for (const p of persona.preferenceCandidates) {
      tasks.push(storage.writeKv(
        `twin:${twinId}:slice:preference`,
        `p-${crypto.randomBytes(4).toString('hex')}`,
        JSON.stringify({ who: 'inferred · onboarding', text: p, ts: Date.now() }),
      ));
    }
    // relationship — recurring themes
    for (const th of persona.themes) {
      tasks.push(storage.writeKv(
        `twin:${twinId}:slice:relationship`,
        `th-${crypto.randomBytes(4).toString('hex')}`,
        JSON.stringify({ who: 'theme', text: th, ts: Date.now() }),
      ));
    }
    // performance — top-N + baselines
    tasks.push(storage.writeKv(
      `twin:${twinId}:slice:performance`,
      `baseline-${Date.now()}`,
      JSON.stringify({
        who: 'baseline',
        text: `avg likes ${persona.performance.avgLikes} · top quartile ${persona.performance.topQuartileLikes}`,
        ts: Date.now(),
      }),
    ));

    await Promise.all(tasks);

    return {
      persona,
      seeded: {
        voiceCount: persona.performance.topTweets.length + persona.voice.bullets.length,
        preferenceCount: persona.preferenceCandidates.length,
        themeCount: persona.themes.length,
      },
    };
  });
}
