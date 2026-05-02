// Idol voice trait extractor + cache.
//
// Given a creator name (e.g. "Naval Ravikant"), returns a list of short
// voice/style trait strings the Writer can use as anchors. Two paths:
//
//   1. Whitelist — popular creators have hand-curated trait packs so we
//      skip Qwen entirely and avoid hallucination. Instant, free.
//   2. Qwen — for any other name, one JSON-only completion call returns
//      5-7 trait strings. Cached in-memory so repeats are free.
//
// Each trait is short (<80 chars), specific, and writable as a semantic
// memory entry tagged with `meta: { from: '<idol>' }`. Use them as
// few-shot anchors in the Writer's system prompt for style mimicry
// without LoRA.

import { compute } from './compute.js';
import { config } from '../config.js';

export interface IdolPack {
  name: string;
  source: 'whitelist' | 'qwen' | 'mock';
  traits: string[];
}

// Hand-curated voice traits for popular creators. Skips Qwen entirely.
// Keep traits short (<80 chars) + style-focused, not topic-focused.
const WHITELIST: Record<string, string[]> = {
  'naval ravikant': [
    'short declarative sentences, 1-2 lines max',
    'opens with a contradiction or counter-intuitive claim',
    'avoids hashtags and emojis entirely',
    'prefers timeless principles over current events',
    'frames advice as "X, not Y" — comparative framing',
    'occasional aphorisms that read like proverbs',
    'never uses superlatives or hedging language',
  ],
  'paul graham': [
    'long-form essays in plain conversational English',
    'opens with a personal anecdote or observation',
    'uses precise concrete examples instead of jargon',
    'questions assumptions explicitly ("but is that true?")',
    'measured pace — no urgency, no hype',
    'comfortable with footnotes and asides',
    'rarely uses lists; prose-heavy structure',
  ],
  'pg': [
    'long-form essays in plain conversational English',
    'opens with a personal anecdote or observation',
    'uses precise concrete examples instead of jargon',
    'questions assumptions explicitly ("but is that true?")',
    'measured pace — no urgency, no hype',
    'comfortable with footnotes and asides',
    'rarely uses lists; prose-heavy structure',
  ],
  'sam altman': [
    'short pragmatic posts, builder-tone',
    'comfortable announcing things bluntly',
    'minimal punctuation, low-key authority',
    'optimistic about technology, not preachy',
    'rarely defensive — states position, moves on',
    'mixes product updates with broader thinking',
  ],
  'elon musk': [
    'extremely terse, often one-liners',
    'uses memes and emoji punctuation',
    'self-referential humor, occasionally combative',
    'replies more than original posts',
    'numbers + concrete claims over qualitative',
    'casual capitalization, lowercase-first vibes',
  ],
  'andrej karpathy': [
    'technical clarity with friendly tone',
    'explains complex ideas via analogies',
    'plain code references, no marketing language',
    'comfortable with uncertainty — "I think", "probably"',
    'occasionally lists numbered points for structure',
    'rarely uses superlatives; honest about limitations',
  ],
  'jack altman': [
    'punchy founder advice, 1-3 lines',
    'frames things as "the lesson is..." or "what works..."',
    'mixes founder mode with personal observations',
    'avoids corporate-speak and platitudes',
    'directly addresses the reader — second person',
  ],
  'patrick collison': [
    'precise, almost academic phrasing',
    'comfortable with long sentences and complex clauses',
    'cites sources or mentions specific people/works',
    'questions framings rather than answering them',
    'reserved tone — measured, never breathless',
  ],
  'shaan puri': [
    'punchy, conversational, builder-energy',
    'uses lists + numbered observations frequently',
    'breaks the 4th wall — "you know what...", "here\'s the thing"',
    'mixes humor with hard-won lessons',
    'short paragraphs, lots of line breaks',
  ],
  'david perell': [
    'meta-commentary about writing + creators',
    'uses "Notice that..." or "Here\'s what\'s interesting:"',
    'frequently cites historical writers + frameworks',
    'longer threads, often 5-10 tweets',
    'mixes the personal with the pedagogical',
  ],
};

const cache = new Map<string, IdolPack>();

const SYSTEM = `You analyze the writing voice + style of public creators. Reply with ONLY a JSON array of 5-7 short trait strings (each ≤80 chars). Focus on STYLE, not topics. Examples of good traits:
  "short declarative sentences, 1-2 lines max"
  "opens with a contradiction or counter-intuitive claim"
  "avoids hashtags and emojis entirely"
Bad traits (do NOT include):
  "talks about startups" (topic, not style)
  "is famous for tweets" (meta, not style)
Reply with JSON array only — no prose, no markdown.`;

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ').replace(/^@/, '');
}

export async function getIdolTraits(name: string): Promise<IdolPack> {
  const key = normalizeName(name);
  if (!key) return { name, source: 'mock', traits: [] };

  const cached = cache.get(key);
  if (cached) return cached;

  // 1. Whitelist hit — instant, no LLM call.
  const whitelisted = WHITELIST[key];
  if (whitelisted) {
    const pack: IdolPack = { name, source: 'whitelist', traits: whitelisted };
    cache.set(key, pack);
    return pack;
  }

  // 2. Qwen extraction. JSON-only, 5-7 traits.
  if (compute.mode.kind === 'mock') {
    const pack: IdolPack = { name, source: 'mock', traits: mockTraits(name) };
    cache.set(key, pack);
    return pack;
  }

  try {
    const j = await compute.completionRaw(
      {
        model: config.SPECIALIST_MODEL ?? config.DIRECTOR_MODEL,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Creator: ${name}` },
        ],
        temperature: 0.3,
        max_tokens: 250,
      },
      { timeoutMs: 6000 },
    ) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = (j.choices?.[0]?.message?.content ?? '').trim();
    const parsed = parseJsonArray(raw);
    if (parsed && parsed.length > 0) {
      const traits = parsed
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim().slice(0, 80))
        .filter((s) => s.length > 4)
        .slice(0, 7);
      if (traits.length > 0) {
        const pack: IdolPack = { name, source: 'qwen', traits };
        cache.set(key, pack);
        return pack;
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[idols] qwen extraction for "${name}" failed: ${(err as Error).message}`);
  }

  // 3. Mock fallback — reasonable defaults so onboarding never hard-fails.
  const pack: IdolPack = { name, source: 'mock', traits: mockTraits(name) };
  cache.set(key, pack);
  return pack;
}

function parseJsonArray(text: string): unknown[] | null {
  const cleaned = text.replace(/^```\w*\s*|\s*```$/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function mockTraits(name: string): string[] {
  return [
    `${name}: terse, declarative voice`,
    'avoids superlatives and hedging',
    'opens with a concrete observation',
    'mixes personal experience with broader claims',
    'short paragraphs, plain English',
  ];
}

/** For tests / debug only. */
export function clearIdolCache(): void {
  cache.clear();
}

export function listWhitelist(): string[] {
  return Object.keys(WHITELIST);
}
