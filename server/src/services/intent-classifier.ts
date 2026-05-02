// Zero-shot intent classifier — Hugging Face Inference API.
//
// Hits facebook/bart-large-mnli with the user's text + a list of candidate
// pattern intents. Returns the top label + confidence. Free tier works
// without an API key (rate-limited ~30 req/hr); set HF_INFERENCE_API_KEY
// (free account at huggingface.co) for proper limits.
//
// Used by orchestrator.routePattern as the FIRST-PASS router. If confidence
// is high enough we use the result directly. Otherwise we fall back to the
// existing LLM router (Qwen) and finally the regex.
//
// Latency: ~200-800ms on a warm BART. Cold start can be 10-20s; we timeout
// at 4s to keep the chat responsive — fallback handles it.

import { config } from '../config.js';

const HF_URL = 'https://api-inference.huggingface.co/models/facebook/bart-large-mnli';

// Pattern id → human-readable intent label. The classifier picks the
// label that best fits the user's text; we map back to the pattern id.
// Order doesn't matter for accuracy but keeping it grouped helps reading.
const INTENT_LABELS: Record<string, string> = {
  // Single-step
  absorb:         'sharing personal context, identity, or preferences about themselves',
  answer:         'asking a factual question or requesting information about something',
  // Production
  'daily-post':   'asking for a quick tweet or short post in their voice',
  'with-research':'asking for content about a specific topic, person, or event that needs research',
  'visual-post':  'asking to create or generate an image',
  'clip-shorts':  'asking to extract clips or shorts from a video or podcast',
  // Planning / review
  'weekly-plan':  'asking to plan content or themes for the upcoming week',
  'weekly-review':'asking to review or score what happened this week',
  'audit-week':   'asking to audit performance or recap recent work',
  // Replies
  'dm-reply':     'asking to reply to a direct message or DM',
  'sponsor-reply':'asking to reply to a sponsor brief or brand deal',
};

const PATTERN_IDS = Object.keys(INTENT_LABELS);
const LABELS = PATTERN_IDS.map((id) => INTENT_LABELS[id]!);
const LABEL_TO_PATTERN = Object.fromEntries(
  PATTERN_IDS.map((id) => [INTENT_LABELS[id]!, id] as const),
);

export interface IntentResult {
  pattern: string;
  confidence: number;
  source: 'hf';
  raw?: { labels: string[]; scores: number[] };
}

// Cold-start cache — once the model is warm on HF we tend to stay warm. If
// we see a 503 once we cool off the classifier for a while to avoid pinging
// in vain.
let cooldownUntil = 0;

export async function classifyIntent(userText: string, opts: { timeoutMs?: number; minConfidence?: number } = {}): Promise<IntentResult | null> {
  if (Date.now() < cooldownUntil) return null;
  if (!userText || userText.trim().length < 2) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 4000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.HF_INFERENCE_API_KEY) {
      headers.Authorization = `Bearer ${config.HF_INFERENCE_API_KEY}`;
    }
    const res = await fetch(HF_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        inputs: userText.slice(0, 500),
        parameters: {
          candidate_labels: LABELS,
          // multi_label false → softmax across labels (single best fit).
          multi_label: false,
        },
      }),
      signal: ctrl.signal,
    });
    if (res.status === 503) {
      // Model is loading. Cool down for 60s; the LLM router can handle this turn.
      cooldownUntil = Date.now() + 60_000;
      return null;
    }
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j = (await res.json()) as any;
    const labels: string[] = j?.labels ?? [];
    const scores: number[] = j?.scores ?? [];
    if (labels.length === 0) return null;
    const topLabel = labels[0]!;
    const topScore = scores[0] ?? 0;
    const pattern = LABEL_TO_PATTERN[topLabel];
    if (!pattern) return null;
    const minConfidence = opts.minConfidence ?? 0.55;
    if (topScore < minConfidence) return null;
    return {
      pattern,
      confidence: topScore,
      source: 'hf',
      raw: { labels, scores },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
