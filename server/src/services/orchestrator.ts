// Pattern orchestrator. Reads a JSON pattern definition (Scout → Quill →
// Mantle → ...), invokes each step's agent via the compute service, streams
// tokens to the bus, and chains step outputs as context for the next step.
//
// Pattern shape:
//   { id, title, steps: [{ idx, agent, label, toolHints? }] }
//
// Tools are not really invoked here yet — we surface "tool.call" events with
// plausible names per agent so the WorkPane shows tool composition. Real
// tool execution lands in Phase 2 alongside Storage.

import { compute, type ChatMessage } from './compute.js';
import { systemPrompt, type AgentRole, type PromptContext } from './prompts.js';
import { emit, openBus } from './bus.js';
import crypto from 'node:crypto';

export interface PatternStep {
  idx: number;
  agent: AgentRole;
  label: string;
  tools?: Array<{ name: string; args: string }>;
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
      { idx: 1, agent: 'scout', label: 'Pull recent themes',
        tools: [{ name: 'search_memory', args: 'slice=performance' }] },
      { idx: 2, agent: 'quill', label: 'Draft in your voice',
        tools: [{ name: 'read_memory', args: 'slice=voice · k=15' }] },
      { idx: 3, agent: 'mark', label: 'Final pass',
        tools: [{ name: 'search_memory', args: 'slice=rejection' }] },
    ],
  },
  'with-legal-review': {
    id: 'with-legal-review',
    title: 'with-legal-review',
    steps: [
      { idx: 1, agent: 'scout', label: 'Research the brand',
        tools: [{ name: 'search_memory', args: 'slice=relationship' }] },
      { idx: 2, agent: 'quill', label: 'Draft v1',
        tools: [{ name: 'read_memory', args: 'slice=voice · k=15' }] },
      { idx: 3, agent: 'mantle', label: 'Legal review',
        tools: [{ name: 'read_memory', args: 'contracts/' }] },
      { idx: 4, agent: 'quill', label: 'Revise on Mantle\'s notes' },
      { idx: 5, agent: 'mark', label: 'Final pass',
        tools: [{ name: 'search_memory', args: 'slice=rejection' }] },
    ],
  },
};

export function pickPattern(userInput: string): Pattern {
  const lower = userInput.toLowerCase();
  if (/(sponsor|brand|acme|deal|paid|#ad|endorsement)/.test(lower)) {
    return PATTERNS['with-legal-review']!;
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

  for (const step of pattern.steps) {
    emit(taskId, { type: 'step.start', idx: step.idx, agent: step.agent, label: step.label });

    // Surface tool calls (cosmetic for now — real wiring in Phase 2)
    for (const t of step.tools ?? []) {
      emit(taskId, {
        type: 'step.tool',
        idx: step.idx,
        name: t.name,
        args: t.args,
        result: mockToolResult(t.name),
      });
    }

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

function mockToolResult(tool: string): string {
  switch (tool) {
    case 'search_memory':
      return 'returned 12 relevant entries';
    case 'read_memory':
      return 'read 15 closest exemplars';
    default:
      return 'ok';
  }
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function estimateCost(steps: number): string {
  // Rough mock: ~0.02 0G per step
  return `${(steps * 0.02).toFixed(2)} 0G`;
}
