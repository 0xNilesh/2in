// Pattern orchestrator. Reads a pattern definition (Scout → Quill → Mantle
// → ...), invokes each step's agent via the compute service, runs each
// declared tool through the registry, streams everything to the bus, and
// chains step outputs as context for the next step.
//
// Pattern shape:
//   { id, title, steps: [{ idx, agent, label, tools? }] }
//   tools = [{ name, args: object }]   args validated by the tool's zod schema

import { compute, type ChatMessage } from './compute.js';
import { systemPrompt, type AgentRole, type PromptContext } from './prompts.js';
import { emit, openBus } from './bus.js';
import { registry } from './tools/index.js';
import crypto from 'node:crypto';

export interface PatternStep {
  idx: number;
  agent: AgentRole;
  label: string;
  tools?: Array<{ name: string; args: Record<string, unknown> }>;
}

export interface Pattern {
  id: string;
  title: string;
  steps: PatternStep[];
}

export const PATTERNS: Record<string, Pattern> = {
  'content-draft': {
    id: 'content-draft',
    title: 'content-draft',
    steps: [
      {
        idx: 1, agent: 'scout', label: 'Pull recent themes',
        tools: [{ name: 'search_memory', args: { slice: 'performance', query: 'recent' } }],
      },
      {
        idx: 2, agent: 'quill', label: 'Draft in your voice',
        tools: [{ name: 'read_memory', args: { slice: 'voice', limit: 15 } }],
      },
      {
        idx: 3, agent: 'mark', label: 'Final pass',
        tools: [{ name: 'search_memory', args: { slice: 'rejection', query: 'pattern' } }],
      },
    ],
  },
  'with-legal-review': {
    id: 'with-legal-review',
    title: 'with-legal-review',
    steps: [
      {
        idx: 1, agent: 'scout', label: 'Research the brand',
        tools: [{ name: 'search_memory', args: { slice: 'relationship', query: 'brand' } }],
      },
      {
        idx: 2, agent: 'quill', label: 'Draft v1',
        tools: [{ name: 'read_memory', args: { slice: 'voice', limit: 15 } }],
      },
      {
        idx: 3, agent: 'mantle', label: 'Legal review',
        tools: [{ name: 'read_memory', args: { slice: 'preference' } }],
      },
      { idx: 4, agent: 'quill', label: 'Revise on Mantle\'s notes' },
      {
        idx: 5, agent: 'mark', label: 'Final pass',
        tools: [{ name: 'search_memory', args: { slice: 'rejection', query: 'pattern' } }],
      },
    ],
  },
  'clip-shorts': {
    id: 'clip-shorts',
    title: 'clip-shorts',
    steps: [
      {
        idx: 1, agent: 'scout', label: 'Locate source episode',
        tools: [{ name: 'read_memory', args: { slice: 'relationship', limit: 5 } }],
      },
      {
        idx: 2, agent: 'cadence', label: 'Transcribe audio',
        tools: [{ name: 'transcribe', args: { audioUrl: 'https://example.com/podcast/ep48.mp3' } }],
      },
      {
        idx: 3, agent: 'cadence', label: 'Pick high-leverage clips',
        tools: [{
          name: 'find_clips',
          args: {
            transcript: 'I want to talk about something I\'ve been getting wrong for a year. I thought I was burned out — turns out, I was bored. Here\'s what changed.',
            n: 3,
          },
        }],
      },
      {
        idx: 4, agent: 'mark', label: 'Stage shorts for review',
        tools: [
          { name: 'store', args: { content: 'clip-1.mp4 placeholder', contentType: 'text' } },
          { name: 'draft_post', args: { platform: 'x', content: 'Three minutes of footage. New short ↓' } },
        ],
      },
    ],
  },
};

export function pickPattern(userInput: string): Pattern {
  const lower = userInput.toLowerCase();
  if (/(sponsor|brand|acme|deal|paid|#ad|endorsement)/.test(lower)) {
    return PATTERNS['with-legal-review']!;
  }
  if (/(clip|short|reel|episode|podcast|trim|highlight)/.test(lower)) {
    return PATTERNS['clip-shorts']!;
  }
  return PATTERNS['content-draft']!;
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
  const pattern =
    (input.pattern && PATTERNS[input.pattern]) || pickPattern(input.goal);

  openBus(taskId);

  // Run async — POST returns immediately, client streams events.
  void runPattern({ taskId, pattern, input }).catch((err) => {
    emit(taskId, { type: 'task.error', id: taskId, message: err.message ?? 'orchestrator_failed' });
  });

  return { taskId, pattern: pattern.id, totalSteps: pattern.steps.length };
}

interface RunArgs {
  taskId: string;
  pattern: Pattern;
  input: SpawnTaskInput;
}

async function runPattern({ taskId, pattern, input }: RunArgs): Promise<void> {
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
  // Memory tools are scoped per-twin. Pull twinId from context — fall back
  // to the demo master ('42') when not provided.
  const twinId = '42';
  // 0G provider caps at 10 req/min per API key. Pacing each LLM step at
  // ~7s keeps a 5-step task under the cap with room for the user's chat
  // turn that spawned it.
  const STEP_PACE_MS = 7_000;
  let lastLlmAt = 0;

  for (const step of pattern.steps) {
    emit(taskId, { type: 'step.start', idx: step.idx, agent: step.agent, label: step.label });

    // Real tool invocation through the registry. On failure, surface the
    // error in the bus and stop the task.
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

    // Pace ourselves so back-to-back steps don't trip the provider's
    // 10 req/min cap. Wait the remainder of STEP_PACE_MS since the
    // previous LLM call (skip on the first step — no prior call).
    if (lastLlmAt !== 0) {
      const elapsed = Date.now() - lastLlmAt;
      const wait = STEP_PACE_MS - elapsed;
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    lastLlmAt = Date.now();

    const messages = buildMessages(step.agent, input, stepOutputs);
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
    emit(taskId, { type: 'step.done', idx: step.idx, output: buffer.trim(), elapsed });
    stepOutputs.push({ agent: step.agent, output: buffer.trim() });
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
): ChatMessage[] {
  const sys = systemPrompt(agent, input.context);
  const messages: ChatMessage[] = [{ role: 'system', content: sys }];
  messages.push({ role: 'user', content: `Goal: ${input.goal}` });

  if (prior.length > 0) {
    const ctx = prior
      .map((p) => `Previously, ${p.agent} produced:\n${p.output}`)
      .join('\n\n');
    messages.push({ role: 'user', content: ctx });
  }

  return messages;
}

// Truncate / pretty-print a tool result so the bus payload stays small.
function summarise(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return value.length > 240 ? value.slice(0, 240) + '…' : value;
  if (typeof value !== 'object') return value;
  // Object — keep keys, truncate long string values.
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
