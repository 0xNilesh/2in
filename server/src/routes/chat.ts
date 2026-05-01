// Chat routes — director and direct-to-specialist.
//
//   GET  /api/chat/mode               { mode: 'mock' | 'real', reason }
//   POST /api/chat/director           SSE
//   POST /api/chat/specialist/:id     SSE
//
// Body:
//   { messages: [{role, content}], twin?: {name, twitterHandle?, walletAddress?}, model? }
//
// Response: SSE
//   event: token  data: { delta }
//   event: done   data: { finishReason }
//   event: error  data: { message }

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Readable } from 'node:stream';
import { z } from 'zod';
import { compute, type ChatMessage } from '../services/compute.js';
import { systemPrompt, type AgentRole } from '../services/prompts.js';
import { sseStream, setSseHeaders, type SseStream } from '../lib/sse.js';

const TwinCtx = z.object({
  name: z.string().optional(),
  twitterHandle: z.string().nullable().optional(),
  walletAddress: z.string().nullable().optional(),
}).optional();

const ChatBody = z.object({
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })).min(1),
  twin: TwinCtx,
  model: z.string().optional(),
});

const SPECIALISTS: AgentRole[] = ['writer', 'researcher', 'editor', 'strategist', 'companion', 'voice', 'visual', 'negotiator'];

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.get('/chat/mode', async () => ({
    mode: compute.mode.kind,
    reason: compute.mode.reason ?? null,
    model: compute.mode.model ?? null,
  }));

  app.post('/chat/director', async (req, reply) => {
    const body = ChatBody.parse(req.body);
    const messages = withSystem('director', body.messages, ctxFrom(body.twin));
    return streamChat(reply, messages, body.model);
  });

  app.post('/chat/specialist/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id as AgentRole;
    if (!SPECIALISTS.includes(id)) {
      throw app.httpErrors.badRequest(`Unknown specialist: ${id}`);
    }
    const body = ChatBody.parse(req.body);
    const messages = withSystem(id, body.messages, ctxFrom(body.twin));
    return streamChat(reply, messages, body.model);
  });
}

function ctxFrom(twin: z.infer<typeof TwinCtx>) {
  return {
    twinName: twin?.name ?? '2in',
    twitterHandle: twin?.twitterHandle ?? null,
    walletAddress: twin?.walletAddress ?? null,
  };
}

// Max prior turns we keep in context (excluding system + the new user msg).
// 7B models overfit to repeated patterns when they see >3 of the same shape;
// trim aggressively so a stale extension can't ossify the response.
const HISTORY_TURN_CAP = 6;

function withSystem(
  role: AgentRole,
  history: ChatMessage[],
  ctx: { twinName: string; twitterHandle?: string | null; walletAddress?: string | null },
): ChatMessage[] {
  const sys = systemPrompt(role, ctx);
  // Strip any client-supplied system message — the server controls the role.
  const filtered = history[0]?.role === 'system' ? history.slice(1) : history;
  // Keep only the most recent N messages to bound context size.
  const recent = filtered.slice(-HISTORY_TURN_CAP);
  return [{ role: 'system', content: sys }, ...recent];
}

function streamChat(
  reply: FastifyReply,
  messages: ChatMessage[],
  model?: string,
): Readable {
  setSseHeaders(reply);
  const sse = sseStream();
  void pump(sse, messages, model);
  return sse.stream;
}

async function pump(sse: SseStream, messages: ChatMessage[], model?: string): Promise<void> {
  try {
    for await (const chunk of compute.chatStream(messages, { model })) {
      if (sse.closed) return;
      if ('delta' in chunk && chunk.delta) {
        sse.send('token', { delta: chunk.delta });
      }
      if ('done' in chunk && chunk.done) {
        sse.send('done', { finishReason: chunk.finishReason ?? 'stop' });
        break;
      }
    }
  } catch (err) {
    sse.send('error', { message: (err as Error).message });
  } finally {
    sse.close();
  }
}

