// Pattern orchestrator. Reads a pattern definition (Researcher → Writer → Editor
// → ...), invokes each step's agent via the compute service, runs each
// declared tool through the registry, streams everything to the bus, and
// chains step outputs as context for the next step.
//
// Pattern selection is LLM-driven: routePattern() calls Qwen with the user's
// goal + the pattern catalog, parses a JSON {pattern, reason} response.
// Falls back to keyword regex if the LLM output can't be parsed (network or
// rate-limit failure).

import { compute, type ChatMessage } from './compute.js';
import { systemPrompt, type AgentRole, type PromptContext } from './prompts.js';
import { emit, openBus } from './bus.js';
import { registry } from './tools/index.js';
import {
  encode as memEncode,
  retrieveAndAnnounce,
  recordEncode,
  type MemoryType,
  type MemoryEntry,
} from './memory.js';
import { classifyIntent } from './intent-classifier.js';
import crypto from 'node:crypto';

// Per-specialist memory routing. Each agent reads its assigned memory types
// before its LLM call and writes its outputs to its assigned write types.
// Specialists not in this map skip the memory step (defensive default).
export const SPECIALIST_MEMORY: Record<AgentRole, { reads: MemoryType[]; writes: MemoryType[] }> = {
  director:   { reads: [],                                              writes: [] },
  writer:     { reads: ['semantic', 'episodic', 'temporal'],            writes: ['episodic'] },
  researcher: { reads: ['episodic', 'temporal'],                        writes: ['semantic', 'episodic'] },
  editor:     { reads: ['procedural', 'semantic'],                      writes: ['procedural'] },
  strategist: { reads: ['temporal', 'episodic'],                        writes: ['temporal'] },
  companion:  { reads: ['relationship', 'semantic'],                    writes: ['semantic', 'relationship'] },
  voice:      { reads: ['semantic', 'episodic'],                        writes: ['episodic'] },
  visual:     { reads: ['semantic'],                                    writes: ['episodic'] },
  negotiator: { reads: ['relationship', 'procedural'],                  writes: ['relationship'] },
};

export interface PatternStep {
  idx: number;
  agent: AgentRole;
  label: string;
  tools?: Array<{ name: string; args: Record<string, unknown> }>;
  /** Override the agent's default system prompt for this step. Useful when
   *  the same specialist needs a different shape per pattern (e.g. Companion
   *  in absorb extracts facts; Companion in dm-reply chats normally). */
  systemOverride?: string;
}

export interface Pattern {
  id: string;
  title: string;
  description: string;
  steps: PatternStep[];
}

export const PATTERNS: Record<string, Pattern> = {
  'absorb': {
    id: 'absorb',
    title: 'absorb',
    description: 'Single Companion step. Use when the user shares personal context / identity / preferences ("I\'m a YC founder", "my audience is technical founders", "my tone is terse", "remember this about me"). Companion extracts facts and writes them to semantic + relationship memory so future drafts read them back. Do NOT use for content production.',
    steps: [
      {
        idx: 1, agent: 'companion', label: 'Extract facts to semantic + relationship memory',
        systemOverride: `You are an extractor. The user has shared facts about themselves (identity, role, audience, tone, preferences, what they post about, who they work with, etc.).

Your job: extract each distinct fact as a numbered list. ONE fact per line. Be terse and concrete. No prose, no questions, no follow-ups, no acknowledgments.

Format EXACTLY:
1. <fact 1>
2. <fact 2>
3. <fact 3>

Examples of good facts:
  - "5 years experience in web3"
  - "builds developer tools"
  - "posts about web3 events"
  - "audience: technical founders 25-40"
  - "tone: terse, contrarian, no hot takes"

Skip filler: greetings, hedges, generic statements ("I think", "I want to share").

Reply with ONLY the numbered list. Nothing else.`,
      },
    ],
  },
  'answer': {
    id: 'answer',
    title: 'answer',
    description: 'Single Researcher step. Use for pure Q&A — "tell me about X", "who is X", "what is X". Returns an informed answer using episodic/temporal memory + the model\'s own knowledge. Do NOT use when the user wants something written or produced — use daily-post for that.',
    steps: [
      {
        idx: 1, agent: 'researcher', label: 'Pull context + answer the question',
      },
    ],
  },
  'daily-post': {
    id: 'daily-post',
    title: 'daily-post',
    description: 'Quick draft → editor gate. For everyday posts, replies, captions.',
    steps: [
      {
        idx: 1, agent: 'writer', label: 'Draft in your voice',
        tools: [{ name: 'read_memory', args: { slice: 'voice', limit: 10 } }],
      },
      {
        idx: 2, agent: 'editor', label: 'Final pass',
        tools: [{ name: 'search_memory', args: { slice: 'rejection', query: 'pattern' } }],
      },
    ],
  },
  'with-research': {
    id: 'with-research',
    title: 'with-research',
    description: 'Researcher pulls facts → Writer drafts → Editor gates. For posts about specific topics, people, events.',
    steps: [
      {
        idx: 1, agent: 'researcher', label: 'Pull facts + audience overlap',
        tools: [{ name: 'search_memory', args: { slice: 'relationship', query: 'topic' } }],
      },
      {
        idx: 2, agent: 'writer', label: 'Draft in your voice',
        tools: [{ name: 'read_memory', args: { slice: 'voice', limit: 10 } }],
      },
      {
        idx: 3, agent: 'editor', label: 'Final pass',
        tools: [{ name: 'search_memory', args: { slice: 'rejection', query: 'pattern' } }],
      },
    ],
  },
  'weekly-plan': {
    id: 'weekly-plan',
    title: 'weekly-plan',
    description: 'Researcher pulls performance → Strategist plans themes → Companion logs the plan.',
    steps: [
      {
        idx: 1, agent: 'researcher', label: 'Pull last week performance',
        tools: [{ name: 'read_memory', args: { slice: 'performance', limit: 30 } }],
      },
      {
        idx: 2, agent: 'strategist', label: 'Pick this week themes + cadence',
        tools: [{ name: 'read_memory', args: { slice: 'preference', limit: 10 } }],
      },
      {
        idx: 3, agent: 'companion', label: 'Log plan to relationship_memory',
        tools: [{ name: 'write_memory', args: { slice: 'relationship', value: 'weekly plan' } }],
      },
    ],
  },
  'dm-reply': {
    id: 'dm-reply',
    title: 'dm-reply',
    description: 'Companion pulls who-this-is context → Writer drafts the reply → Editor checks tone.',
    steps: [
      {
        idx: 1, agent: 'companion', label: 'Pull context for this contact',
        tools: [{ name: 'search_memory', args: { slice: 'relationship', query: 'sender' } }],
      },
      {
        idx: 2, agent: 'writer', label: 'Draft reply',
        tools: [{ name: 'read_memory', args: { slice: 'voice', limit: 8 } }],
      },
      {
        idx: 3, agent: 'editor', label: 'Tone check',
        tools: [{ name: 'search_memory', args: { slice: 'rejection', query: 'tone' } }],
      },
    ],
  },
  'audit-week': {
    id: 'audit-week',
    title: 'audit-week',
    description: 'Researcher pulls perf → Strategist scores the week → Companion writes the reflection.',
    steps: [
      {
        idx: 1, agent: 'researcher', label: 'Aggregate week metrics',
        tools: [{ name: 'read_memory', args: { slice: 'performance', limit: 50 } }],
      },
      {
        idx: 2, agent: 'strategist', label: 'Score what worked / what drifted',
        tools: [{ name: 'read_memory', args: { slice: 'preference', limit: 10 } }],
      },
      {
        idx: 3, agent: 'companion', label: 'Reflection to journal',
        tools: [{ name: 'write_memory', args: { slice: 'relationship', value: 'weekly reflection' } }],
      },
    ],
  },
  'visual-post': {
    id: 'visual-post',
    title: 'visual-post',
    description: 'Visual generates image → Writer writes caption → Editor gates.',
    steps: [
      {
        idx: 1, agent: 'visual', label: 'Generate image prompt',
        tools: [{ name: 'gen_image', args: { prompt: 'placeholder', size: '1024x1024' } }],
      },
      {
        idx: 2, agent: 'writer', label: 'Caption in your voice',
        tools: [{ name: 'read_memory', args: { slice: 'voice', limit: 10 } }],
      },
      {
        idx: 3, agent: 'editor', label: 'Gate' },
    ],
  },
  'sponsor-reply': {
    id: 'sponsor-reply',
    title: 'sponsor-reply',
    description: 'Negotiator drafts deal-term reply → Editor reviews tone.',
    steps: [
      {
        idx: 1, agent: 'researcher', label: 'Pull prior deals with this brand',
        tools: [{ name: 'search_memory', args: { slice: 'relationship', query: 'sponsor' } }],
      },
      {
        idx: 2, agent: 'negotiator', label: 'Draft reply' },
      { idx: 3, agent: 'editor', label: 'Final pass' },
    ],
  },
  'weekly-review': {
    id: 'weekly-review',
    title: 'weekly-review',
    description: 'Four-specialist swarm review of the week. Strategist scores the cadence, Researcher pulls performance, Editor scans procedural rules, Companion checks relationships. Use for "weekly review", "how did this week go", "swarm review".',
    steps: [
      {
        idx: 1, agent: 'researcher', label: 'Pull recent performance from episodic',
      },
      {
        idx: 2, agent: 'strategist', label: 'Score cadence + temporal patterns',
      },
      {
        idx: 3, agent: 'editor', label: 'Cross-check procedural rules',
      },
      {
        idx: 4, agent: 'companion', label: 'Reflect on relationship updates',
      },
    ],
  },
  'clip-shorts': {
    id: 'clip-shorts',
    title: 'clip-shorts',
    description: 'Voice transcribes podcast → Researcher picks clips → Visual generates covers → Writer writes captions.',
    steps: [
      {
        idx: 1, agent: 'voice', label: 'Transcribe source audio',
        tools: [{ name: 'transcribe', args: { audioUrl: 'https://example.com/podcast/ep48.mp3' } }],
      },
      {
        idx: 2, agent: 'researcher', label: 'Pick high-leverage clips',
        tools: [{
          name: 'find_clips',
          args: { transcript: 'placeholder', n: 3 },
        }],
      },
      {
        idx: 3, agent: 'writer', label: 'Caption shorts',
        tools: [{ name: 'read_memory', args: { slice: 'voice', limit: 10 } }],
      },
    ],
  },
};

// === Pattern routing — LLM-driven with regex fallback ====================
const ROUTER_SYSTEM = `You are a routing planner. Given a user goal and the catalog of available patterns, pick exactly one pattern that fits best. Reply with ONLY a JSON object — no prose, no markdown — in this shape:
  {"pattern": "<pattern-id>", "reason": "<one short sentence>"}
If no pattern is a clean fit, default to "daily-post".`;

function regexFallback(userInput: string): string {
  const lower = userInput.toLowerCase();
  // Identity / preference statements — Companion absorbs to memory. Match
  // BEFORE the production-verb rules so "I post X" doesn't get pulled into
  // daily-post.
  if (/^(i'?m |i am |my (audience|tone|voice|style|niche|background|focus|goal|industry) |remember (this|that)|i (post|build|write|run|work) )/.test(lower)) return 'absorb';
  // Q&A / lookup queries — single Researcher answer, no Writer/Editor.
  if (/^(who is|what is|tell me about|explain|describe|when did|where (is|did)|why (is|do))/.test(lower)) return 'answer';
  if (/(weekly review|review the week|swarm review|how (did|was) (this |last )?week|review my week)/.test(lower)) return 'weekly-review';
  if (/(weekly plan|plan my|theme|cadence|schedule|roadmap)/.test(lower)) return 'weekly-plan';
  if (/(audit|recap|score|reflection)/.test(lower)) return 'audit-week';
  if (/(dm|reply|message|email|respond)/.test(lower)) return 'dm-reply';
  if (/(sponsor|brand|deal|paid|#ad|endorsement|negotiate)/.test(lower)) return 'sponsor-reply';
  if (/(image|cover|picture|art|visual|reel)/.test(lower)) return 'visual-post';
  if (/(clip|short|episode|podcast|trim|highlight|transcribe)/.test(lower)) return 'clip-shorts';
  // Production verbs → with-research (Researcher → Writer → Editor)
  if (/(draft|write|compose|generate|make me|create me|post about|tweet about)/.test(lower)) return 'with-research';
  // Default for ambiguous input — answer rather than over-produce.
  return 'answer';
}

export async function routePattern(userInput: string, _ctx: PromptContext): Promise<{ pattern: Pattern; source: 'qwen-classifier' | 'llm' | 'regex'; confidence?: number }> {
  // Layer 1 — tight Qwen classifier. JSON-only, ~1.5s, returns
  // {pattern, confidence}. Cheaper than the heavier LLM router below
  // because the prompt only carries pattern IDs + short hints, not full
  // descriptions. Returns null if confidence < 0.6 or if compute is in
  // cooldown after a recent failure.
  const intent = await classifyIntent(userInput);
  if (intent && PATTERNS[intent.pattern]) {
    // eslint-disable-next-line no-console
    console.info(`[router] qwen-classifier picked ${intent.pattern} (conf ${intent.confidence.toFixed(2)})`);
    return { pattern: PATTERNS[intent.pattern]!, source: 'qwen-classifier', confidence: intent.confidence };
  }

  // Layer 2 — LLM router (Qwen with the pattern catalog as system prompt).
  // More expensive but uses the chat compute we already have.
  const catalog = Object.values(PATTERNS)
    .map((p) => `  - ${p.id}: ${p.description}`)
    .join('\n');
  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: ROUTER_SYSTEM + '\n\nAvailable patterns:\n' + catalog },
      { role: 'user', content: `Goal: ${userInput}\n\nReturn JSON only.` },
    ];
    let buf = '';
    for await (const chunk of compute.chatStream(messages, { temperature: 0.2 })) {
      if ('delta' in chunk && chunk.delta) buf += chunk.delta;
      if ('done' in chunk && chunk.done) break;
    }
    const parsed = extractJson(buf);
    const id = parsed?.pattern;
    if (id && PATTERNS[id]) {
      return { pattern: PATTERNS[id]!, source: 'llm' };
    }
    // eslint-disable-next-line no-console
    console.warn(`[router] LLM returned unknown pattern id "${id}" — falling back to regex`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[router] LLM call failed (${(err as Error).message}) — falling back to regex`);
  }

  // Layer 3 — regex fallback (deterministic, no network).
  const fallbackId = regexFallback(userInput);
  return { pattern: PATTERNS[fallbackId]!, source: 'regex' };
}

function extractJson(text: string): { pattern?: string; reason?: string } | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Synchronous fallback (used when caller can't await the LLM router).
export function pickPattern(userInput: string): Pattern {
  return PATTERNS[regexFallback(userInput)]!;
}

export interface SpawnTaskInput {
  goal: string;
  pattern?: string;
  context: PromptContext;
}

export interface SpawnTaskResult {
  taskId: string;
  pattern: string;
  totalSteps: number;
}

export function spawnTask(input: SpawnTaskInput): SpawnTaskResult {
  const taskId = `task-${crypto.randomBytes(4).toString('hex')}`;
  // For the synchronous return we need the pattern id immediately. If the
  // caller passed an explicit pattern id, honor it; otherwise quick regex
  // fallback for the response payload, then re-route via LLM inside
  // runPattern (which can swap patterns mid-flight if needed — but for
  // simplicity we lock in the routed pattern at start).
  const initial = (input.pattern && PATTERNS[input.pattern]) || pickPattern(input.goal);

  openBus(taskId);

  void runPattern({ taskId, initial, input }).catch((err) => {
    emit(taskId, { type: 'task.error', id: taskId, message: err.message ?? 'orchestrator_failed' });
  });

  return { taskId, pattern: initial.id, totalSteps: initial.steps.length };
}

interface RunArgs {
  taskId: string;
  initial: Pattern;
  input: SpawnTaskInput;
}

async function runPattern({ taskId, initial, input }: RunArgs): Promise<void> {
  // If no explicit pattern was passed, run the LLM router to pick one.
  // This may swap from the regex initial if the LLM disagrees.
  let pattern = initial;
  if (!input.pattern) {
    const routed = await routePattern(input.goal, input.context);
    pattern = routed.pattern;
    // eslint-disable-next-line no-console
    console.info(`[router] picked ${pattern.id} via ${routed.source} for goal "${input.goal.slice(0, 60)}"`);
  }

  emit(taskId, {
    type: 'meta',
    task: {
      id: taskId,
      title: input.goal.slice(0, 80),
      pattern: pattern.id,
      status: 'running',
      totalSteps: pattern.steps.length,
    },
  });

  const stepOutputs: Array<{ agent: AgentRole; output: string }> = [];
  const startedAt = Date.now();
  const twinId = '42';
  // 0G provider caps at 10 req/min per API key. Pacing each LLM step at
  // ~7s keeps a 5-step task under the cap with room for the user's chat
  // turn that spawned it.
  const STEP_PACE_MS = 7_000;
  let lastLlmAt = 0;

  for (const step of pattern.steps) {
    emit(taskId, { type: 'step.start', idx: step.idx, agent: step.agent, label: step.label });

    for (const t of step.tools ?? []) {
      try {
        const out = await registry.execute(t.name, t.args, { twinId, taskId });
        emit(taskId, {
          type: 'step.tool',
          idx: step.idx,
          name: t.name,
          args: t.args,
          result: summarise(out.result),
        });
      } catch (err) {
        emit(taskId, {
          type: 'step.tool',
          idx: step.idx,
          name: t.name,
          args: t.args,
          result: `error: ${(err as Error).message}`,
        });
      }
    }

    // Memory read — fetch entries from this specialist's read types and
    // prepend them as a context message before the LLM call. No LLM cost.
    const memCfg = SPECIALIST_MEMORY[step.agent] ?? { reads: [], writes: [] };
    let memoryContext: MemoryEntry[] = [];
    if (memCfg.reads.length > 0) {
      try {
        memoryContext = await retrieveAndAnnounce({
          types: memCfg.reads,
          query: input.goal,
          limit: 8,
          twinId,
          agent: step.agent,
        });
        emit(taskId, {
          type: 'step.memory.read',
          idx: step.idx,
          agent: step.agent,
          types: memCfg.reads,
          count: memoryContext.length,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[orchestrator] memory.retrieve failed for ${step.agent}: ${(err as Error).message}`);
      }
    }

    if (lastLlmAt !== 0) {
      const elapsed = Date.now() - lastLlmAt;
      const wait = STEP_PACE_MS - elapsed;
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    lastLlmAt = Date.now();

    const messages = buildMessages(step.agent, input, stepOutputs, memoryContext, step.systemOverride);
    const stepStart = Date.now();
    let buffer = '';

    try {
      for await (const chunk of compute.chatStream(messages, {})) {
        if ('delta' in chunk && chunk.delta) {
          buffer += chunk.delta;
          emit(taskId, { type: 'step.token', idx: step.idx, delta: chunk.delta });
        }
        if ('done' in chunk && chunk.done) break;
      }
    } catch (err) {
      emit(taskId, { type: 'task.error', id: taskId, message: (err as Error).message });
      return;
    }

    const elapsed = formatElapsed(Date.now() - stepStart);
    const output = buffer.trim();
    emit(taskId, { type: 'step.done', idx: step.idx, output, elapsed });
    stepOutputs.push({ agent: step.agent, output });

    // Memory write. Two shapes:
    //   - absorb pattern → parse the Companion's numbered list, store each
    //     fact as its own entry across both write types (semantic + relationship)
    //   - other patterns → first-sentence summary, single entry to primary
    //     write type
    if (memCfg.writes.length > 0 && output.length > 8) {
      try {
        const facts = pattern.id === 'absorb' ? parseFactList(output) : null;
        if (facts && facts.length > 0) {
          // Absorb: write each fact as its own entry. Use semantic for tone/
          // identity facts and relationship for audience/people facts.
          let storedCount = 0;
          for (const fact of facts) {
            const writeType = pickAbsorbType(fact, memCfg.writes);
            const stored = await memEncode(
              { kind: 'specialist-output', text: fact, source: step.agent },
              { twinId, agent: step.agent, passthrough: { type: writeType } },
            );
            recordEncode(step.agent, stored);
            storedCount += stored.length;
          }
          emit(taskId, {
            type: 'step.memory.write',
            idx: step.idx,
            agent: step.agent,
            types: memCfg.writes,
            count: storedCount,
          });
        } else {
          const writeType = memCfg.writes[0]!;
          const summary = summariseForMemory(output, step.agent, input.goal);
          const stored = await memEncode(
            { kind: 'specialist-output', text: summary, source: step.agent },
            { twinId, agent: step.agent, passthrough: { type: writeType } },
          );
          recordEncode(step.agent, stored);
          emit(taskId, {
            type: 'step.memory.write',
            idx: step.idx,
            agent: step.agent,
            types: [writeType],
            count: stored.length,
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[orchestrator] memory.encode failed for ${step.agent}: ${(err as Error).message}`);
      }
    }
  }

  const finalOutput = stepOutputs.at(-1)?.output ?? '';
  const totalElapsed = formatElapsed(Date.now() - startedAt);
  emit(taskId, {
    type: 'task.done',
    id: taskId,
    status: 'awaiting-approval',
    finalOutput,
    cost: estimateCost(stepOutputs.length),
  });
  void totalElapsed;
}

function buildMessages(
  agent: AgentRole,
  input: SpawnTaskInput,
  prior: Array<{ agent: AgentRole; output: string }>,
  memoryCtx: MemoryEntry[] = [],
  systemOverride?: string,
): ChatMessage[] {
  const sys = systemOverride ?? systemPrompt(agent, input.context);
  const messages: ChatMessage[] = [{ role: 'system', content: sys }];
  messages.push({ role: 'user', content: `Goal: ${input.goal}` });

  if (memoryCtx.length > 0) {
    const grouped = memoryCtx.reduce<Record<string, MemoryEntry[]>>((acc, e) => {
      (acc[e.type] ??= []).push(e);
      return acc;
    }, {});
    const lines = Object.entries(grouped).map(([type, entries]) => {
      const items = entries.map((e, i) => `  ${i + 1}. ${e.text}`).join('\n');
      return `From your ${type} memory:\n${items}`;
    });
    messages.push({
      role: 'user',
      content: `Memory context (use this to inform your output, don't quote it back):\n\n${lines.join('\n\n')}`,
    });
  }

  if (prior.length > 0) {
    const ctx = prior
      .map((p) => `Previously, ${p.agent} produced:\n${p.output}`)
      .join('\n\n');
    messages.push({ role: 'user', content: ctx });
  }

  return messages;
}

// Parse the absorb pattern's expected output: a numbered list of facts.
// Tolerant — accepts "1.", "1)", "- ", "* " prefixes; ignores empty lines
// and lines that look like prose preambles (>240 chars, ?-ending, etc).
function parseFactList(output: string): string[] | null {
  const lines = output.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const facts: string[] = [];
  for (const line of lines) {
    const m = line.match(/^(?:\d+[.)]|[-*•])\s+(.{2,240})$/);
    if (!m) continue;
    const text = m[1]!.trim().replace(/[?]$/, '').replace(/^["']+|["']+$/g, '');
    if (!text) continue;
    facts.push(text);
  }
  return facts.length > 0 ? facts : null;
}

// Decide whether a fact looks like a person/audience claim (relationship)
// or a self/style/identity claim (semantic). Default: semantic.
function pickAbsorbType<T extends string>(fact: string, writes: T[]): T {
  const lower = fact.toLowerCase();
  if (writes.includes('relationship' as T)) {
    if (/\b(audience|community|followers|customers|clients|collaborator|partner|sponsor|mentor|team)\b/.test(lower)) {
      return 'relationship' as T;
    }
  }
  return (writes.includes('semantic' as T) ? 'semantic' : writes[0]!) as T;
}

// Cheap local summariser. Pulls the first sentence (or first ~140 chars)
// from a specialist's output and prefixes it with a "<agent>: <goal>" tag
// so the entry reads as a memory of *what was decided* rather than the
// raw text dump. Future: swap for a real LLM extraction call once we're
// off the 10 req/min ceiling.
function summariseForMemory(output: string, agent: string, goal: string): string {
  const firstLine = output.split(/\n/).map((s) => s.trim()).find((s) => s.length > 0) ?? output;
  const firstSentence = firstLine.split(/(?<=[.!?])\s+/)[0] ?? firstLine;
  const trimmed = firstSentence.length > 140
    ? firstSentence.slice(0, 137).trimEnd() + '…'
    : firstSentence;
  const goalTag = goal.length > 60 ? goal.slice(0, 57) + '…' : goal;
  return `${agent} on "${goalTag}": ${trimmed}`;
}

function summarise(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return value.length > 240 ? value.slice(0, 240) + '…' : value;
  if (typeof value !== 'object') return value;
  try {
    const json = JSON.stringify(value);
    if (json.length <= 600) return value;
    return { ...value as object, _truncated: true, _length: json.length };
  } catch {
    return String(value);
  }
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function estimateCost(steps: number): string {
  return `${(steps * 0.02).toFixed(2)} 0G`;
}
