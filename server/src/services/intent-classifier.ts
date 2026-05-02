// First-pass router. One tight Qwen call, JSON-only, returns
//   { pattern, confidence }
// where pattern is one of the registered pattern ids and confidence is the
// model's self-rated 0..1.
//
// Cheap path before the heavier LLM router. The trade-off vs the bigger
// router is the prompt size: this one only ships pattern IDs + a short
// trigger hint per pattern, so Qwen has less to chew on and the JSON is
// shorter — which both makes the call faster (~1.5s) and reduces the
// chance of an unparseable reply.
//
// Fall-through behaviour: returns null if the call fails, the JSON is bad,
// or confidence is below the floor. The orchestrator's routePattern then
// tries the full LLM router, then the regex fallback.

import { compute } from './compute.js';
import { config } from '../config.js';

// Short trigger hints per pattern. Kept tiny on purpose — full descriptions
// live in PATTERNS for the heavier LLM router, but here we want minimal
// surface area for fast, reliable classification.
const PATTERN_HINTS: Record<string, string> = {
  'absorb':        'identity / preference / context statement about the user themselves',
  'answer':        'factual question or lookup ("tell me about X", "who is X", "what is X")',
  'daily-post':    'quick tweet or short post in user voice',
  'with-research': 'content about a specific topic or person that needs research',
  'weekly-plan':   'plan content / themes for the upcoming week',
  'weekly-review': 'review or score what happened this week (4-specialist swarm)',
  'audit-week':    'audit performance or recap recent work',
  'dm-reply':      'reply to a direct message / DM',
  'sponsor-reply': 'reply to a sponsor brief or brand deal',
  'visual-post':   'create or generate an image',
  'clip-shorts':   'extract clips or shorts from video / podcast',
};

const SYSTEM = `You classify the user's message into one of the available patterns. Reply with ONLY a JSON object — no prose, no markdown — in this shape:
  {"pattern": "<pattern-id>", "confidence": <0..1>}

Pattern catalog:
${Object.entries(PATTERN_HINTS).map(([id, hint]) => `  - ${id}: ${hint}`).join('\n')}

Confidence floor: be honest. If the message is ambiguous or doesn't fit a pattern cleanly, return confidence < 0.5 and pick the best fit anyway.

Important rules:
- Identity statements ("I'm X", "my audience is Y", "I post about Z", "remember this about me") → "absorb". The user is telling you facts about themselves; do NOT pick daily-post just because they mention "post".
- Factual questions ("tell me about", "who is", "what is", "explain") → "answer". Do NOT pick with-research unless the user explicitly asks for content production about a topic.
- Production verbs (draft, write, compose, generate) → daily-post or with-research.`;

export interface IntentResult {
  pattern: string;
  confidence: number;
  source: 'qwen-classifier';
}

// Cooldown if the call repeatedly fails (e.g. compute is in error). Lets
// the orchestrator's other layers run without queuing up dead calls.
let cooldownUntil = 0;
const COOLDOWN_MS = 30_000;

export async function classifyIntent(
  userText: string,
  opts: { minConfidence?: number; timeoutMs?: number } = {},
): Promise<IntentResult | null> {
  if (Date.now() < cooldownUntil) return null;
  if (!userText || userText.trim().length < 2) return null;

  const minConfidence = opts.minConfidence ?? 0.6;
  try {
    const j = await compute.completionRaw(
      {
        model: config.SPECIALIST_MODEL ?? config.DIRECTOR_MODEL,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userText.slice(0, 600) },
        ],
        temperature: 0.1,
        max_tokens: 80,
      },
      { timeoutMs: opts.timeoutMs ?? 4000 },
    ) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = (j.choices?.[0]?.message?.content ?? '').trim();
    const parsed = parseJsonObject(raw);
    if (!parsed?.pattern) return null;
    const pattern = String(parsed.pattern);
    const confidence = Number(parsed.confidence ?? 0);
    if (!PATTERN_HINTS[pattern]) return null;
    if (!Number.isFinite(confidence) || confidence < minConfidence) return null;
    return { pattern, confidence, source: 'qwen-classifier' };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[classifier] qwen call failed (${(err as Error).message}) — cooling down`);
    cooldownUntil = Date.now() + COOLDOWN_MS;
    return null;
  }
}

function parseJsonObject(text: string): { pattern?: string; confidence?: number } | null {
  // Strip markdown fences and code labels if present.
  const cleaned = text.replace(/^```\w*\s*|\s*```$/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}
