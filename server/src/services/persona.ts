// Persona extraction. Two passes against the user's tweet corpus:
//
//   1. statistical — features computed locally (avg length, capitalization,
//      punctuation patterns, posting cadence, top n-grams, engagement
//      quartiles). Cheap, deterministic, runs even in mock mode.
//
//   2. LLM synthesis — feed top-25 tweets to the director model and ask for
//      a 5-bullet voice profile, recurring themes, and avoidances. Mock
//      mode returns a deterministic canned profile so onboarding still has
//      "intelligence" without a Compute key.
//
// The result populates the typed memory slices:
//   voice_memory       ← raw corpus + voice profile
//   preference_memory  ← inferred do/don't
//   relationship_memory ← recurring themes
//   performance_memory ← engagement baselines

import { compute, type ChatMessage } from './compute.js';

export interface RawTweet {
  id: string;
  text: string;
  createdAt?: string | null;
  metrics?: {
    likes?: number;
    retweets?: number;
    replies?: number;
    impressions?: number;
  };
  lang?: string;
}

export interface StyleStats {
  count: number;
  avgLength: number;
  medianLength: number;
  lengthDistribution: { short: number; medium: number; long: number };
  caseStyle: 'lowercase' | 'sentence' | 'mixed';
  emojiRate: number;
  hashtagRate: number;
  mentionRate: number;
  emDashRate: number;
  questionRate: number;
  topBigrams: string[];
  postingTimes: { mostActiveHour: number; distribution: number[] };
}

export interface VoiceProfile {
  bullets: string[];
  themes: string[];
  avoidances: string[];
  signaturePhrases: string[];
  generatedBy: 'llm' | 'mock';
}

export interface PerformanceBaseline {
  avgLikes: number;
  topQuartileLikes: number;
  topTweets: Array<{ id: string; text: string; likes: number }>;
}

export interface PersonaResult {
  style: StyleStats;
  voice: VoiceProfile;
  performance: PerformanceBaseline;
  preferenceCandidates: string[];
  themes: string[];
  generatedAt: number;
}

// === entry point ====================================================
export async function extractPersona(tweets: RawTweet[], opts: { twinName?: string } = {}): Promise<PersonaResult> {
  const style = computeStyleStats(tweets);
  const performance = computePerformance(tweets);
  const voice = await synthesizeVoice(tweets, style, opts);
  const preferenceCandidates = derivePreferences(style, voice);
  return {
    style,
    voice,
    performance,
    preferenceCandidates,
    themes: voice.themes,
    generatedAt: Date.now(),
  };
}

// === statistical pass ==============================================
function computeStyleStats(tweets: RawTweet[]): StyleStats {
  if (tweets.length === 0) {
    return {
      count: 0,
      avgLength: 0,
      medianLength: 0,
      lengthDistribution: { short: 0, medium: 0, long: 0 },
      caseStyle: 'mixed',
      emojiRate: 0,
      hashtagRate: 0,
      mentionRate: 0,
      emDashRate: 0,
      questionRate: 0,
      topBigrams: [],
      postingTimes: { mostActiveHour: 9, distribution: new Array(24).fill(0) },
    };
  }

  const lens = tweets.map((t) => t.text.length).sort((a, b) => a - b);
  const avgLength = Math.round(lens.reduce((a, b) => a + b, 0) / lens.length);
  const medianLength = lens[Math.floor(lens.length / 2)] ?? 0;

  const lengthDistribution = {
    short: tweets.filter((t) => t.text.length < 100).length,
    medium: tweets.filter((t) => t.text.length >= 100 && t.text.length < 200).length,
    long: tweets.filter((t) => t.text.length >= 200).length,
  };

  const lower = tweets.filter((t) => t.text === t.text.toLowerCase()).length;
  const caseStyle: StyleStats['caseStyle'] =
    lower / tweets.length > 0.7 ? 'lowercase' : lower / tweets.length < 0.2 ? 'sentence' : 'mixed';

  const emojiRe = /\p{Extended_Pictographic}/u;
  const emojiRate = pct(tweets, (t) => emojiRe.test(t.text));
  const hashtagRate = pct(tweets, (t) => t.text.includes('#'));
  const mentionRate = pct(tweets, (t) => t.text.includes('@'));
  const emDashRate = pct(tweets, (t) => /—|–/.test(t.text));
  const questionRate = pct(tweets, (t) => /\?/.test(t.text));

  const distribution = new Array(24).fill(0);
  for (const t of tweets) {
    if (!t.createdAt) continue;
    const h = new Date(t.createdAt).getUTCHours();
    distribution[h] = (distribution[h] ?? 0) + 1;
  }
  const mostActiveHour = distribution.indexOf(Math.max(...distribution));

  return {
    count: tweets.length,
    avgLength,
    medianLength,
    lengthDistribution,
    caseStyle,
    emojiRate,
    hashtagRate,
    mentionRate,
    emDashRate,
    questionRate,
    topBigrams: topBigrams(tweets),
    postingTimes: { mostActiveHour, distribution },
  };
}

function pct(tweets: RawTweet[], pred: (t: RawTweet) => boolean): number {
  return Math.round((100 * tweets.filter(pred).length) / tweets.length);
}

function topBigrams(tweets: RawTweet[], n = 10): string[] {
  const counts = new Map<string, number>();
  const stop = new Set(['the', 'a', 'an', 'is', 'it', 'to', 'of', 'in', 'on', 'and', 'for', 'i', 'you', 'this', 'that', 'with']);
  for (const t of tweets) {
    const words = t.text
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[^\p{L}\s']/gu, ' ')
      .split(/\s+/)
      .filter((w) => w && !stop.has(w));
    for (let i = 0; i < words.length - 1; i++) {
      const bg = `${words[i]} ${words[i + 1]}`;
      counts.set(bg, (counts.get(bg) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([bg]) => bg);
}

// === performance baseline ==========================================
function computePerformance(tweets: RawTweet[]): PerformanceBaseline {
  if (tweets.length === 0) {
    return { avgLikes: 0, topQuartileLikes: 0, topTweets: [] };
  }
  const likes = tweets.map((t) => t.metrics?.likes ?? 0);
  const sorted = [...likes].sort((a, b) => a - b);
  const avgLikes = Math.round(likes.reduce((a, b) => a + b, 0) / likes.length);
  const topQuartileLikes = sorted[Math.floor(sorted.length * 0.75)] ?? 0;

  const topTweets = [...tweets]
    .sort((a, b) => (b.metrics?.likes ?? 0) - (a.metrics?.likes ?? 0))
    .slice(0, 3)
    .map((t) => ({ id: t.id, text: t.text, likes: t.metrics?.likes ?? 0 }));

  return { avgLikes, topQuartileLikes, topTweets };
}

// === LLM synthesis (with mock fallback) ============================
async function synthesizeVoice(
  tweets: RawTweet[],
  style: StyleStats,
  opts: { twinName?: string },
): Promise<VoiceProfile> {
  if (compute.mode.kind === 'mock' || tweets.length === 0) {
    return mockVoiceProfile(style);
  }
  const top = [...tweets]
    .sort((a, b) => (b.metrics?.likes ?? 0) - (a.metrics?.likes ?? 0))
    .slice(0, 25);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You analyze a creator\'s social media voice. Return a JSON object with keys: bullets (5 short voice descriptors), themes (5 recurring topics), avoidances (3 things they don\'t do), signaturePhrases (3-5 distinctive turns of phrase). Be terse — bullets are <12 words.',
    },
    {
      role: 'user',
      content:
        `Twin: ${opts.twinName ?? 'creator'}. Top tweets by engagement:\n\n` +
        top.map((t, i) => `${i + 1}. ${t.text}`).join('\n\n') +
        '\n\nReturn JSON only, no prose.',
    },
  ];

  let buf = '';
  try {
    for await (const chunk of compute.chatStream(messages, { temperature: 0.4 })) {
      if ('delta' in chunk && chunk.delta) buf += chunk.delta;
      if ('done' in chunk && chunk.done) break;
    }
    const json = extractJson(buf);
    if (!json) throw new Error('LLM returned no JSON');
    return {
      bullets: arr(json.bullets, 5),
      themes: arr(json.themes, 5),
      avoidances: arr(json.avoidances, 3),
      signaturePhrases: arr(json.signaturePhrases, 5),
      generatedBy: 'llm',
    };
  } catch {
    return mockVoiceProfile(style);
  }
}

function arr(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === 'string').slice(0, max);
}

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function mockVoiceProfile(style: StyleStats): VoiceProfile {
  return {
    bullets: [
      `Writes ${style.caseStyle === 'lowercase' ? 'in lowercase' : 'sentence-cased'}, terse — avg ${style.avgLength} chars`,
      style.emDashRate > 30 ? 'Heavy em-dash user; favours mid-sentence asides' : 'Punctuation is sparse and direct',
      style.questionRate > 30 ? 'Often opens with a question' : 'Prefers declarative statements',
      style.hashtagRate < 10 ? 'Avoids hashtags — feels organic, not promotional' : 'Uses hashtags strategically',
      'Recurring framing: founder/operator perspective on rituals + work',
    ],
    themes: ['founder rituals', 'burnout vs boredom', 'morning routines', 'shipping cadence', 'team building'],
    avoidances: ['superlatives', 'wholesome platitudes', 'corporate-speak'],
    signaturePhrases: ['the rituals you don\'t notice', 'founder mode', 'opposite of discipline'],
    generatedBy: 'mock',
  };
}

function derivePreferences(style: StyleStats, voice: VoiceProfile): string[] {
  const out: string[] = [];
  if (style.caseStyle === 'lowercase') out.push('default to lowercase');
  if (style.avgLength < 140) out.push(`keep drafts under ${style.avgLength + 40} chars`);
  if (style.emDashRate > 30) out.push('em-dashes welcome for asides');
  if (style.hashtagRate < 10) out.push('no hashtags unless explicitly required');
  if (style.questionRate > 30) out.push('consider opening with a question');
  for (const av of voice.avoidances.slice(0, 2)) out.push(`avoid ${av}`);
  return out;
}
