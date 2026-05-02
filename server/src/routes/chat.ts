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
  let sys = systemPrompt(role, ctx);
  // Strip any client-supplied system message — the server controls the role.
  const filtered = history[0]?.role === 'system' ? history.slice(1) : history;
  // Keep only the most recent N messages to bound context size.
  const recent = filtered.slice(-HISTORY_TURN_CAP);

  // Attachment-aware enrichment: if the latest user turn carries an
  // [attached: <kind> <url>] marker (frontend convention), tell the director
  // about the available media tools so it stops over-routing image edits to
  // the visual-post pattern (which generates a fresh image, not edits).
  if (role === 'director') {
    const last = recent[recent.length - 1];
    if (last?.role === 'user' && /\[attached:/i.test(last.content)) {
      sys += ATTACHMENT_GUIDANCE;
    }
  }

  return [{ role: 'system', content: sys }, ...recent];
}

const ATTACHMENT_GUIDANCE = `

ATTACHMENT MODE — the user has attached a file. The frontend will run the right tool automatically based on the user's instruction + attachment kind. Do NOT dispatch a pattern for media edits; patterns generate brand-new content (visual-post creates fresh images), they do NOT edit attached files.

Available media tools the runtime can invoke on the attachment:
  Image:
    image.edit         — pixel-true edit via Qwen image-edit-2511 (object-aware: "color the lizard black", "remove the background", "add warm lighting")
    image.resize       — width/height scaling
    image.crop         — fixed crop window
    image.format       — png ↔ jpg ↔ webp ↔ gif
    image.watermark    — overlay text watermark
  Video:
    video.trim         — cut to [start, end] window
    video.reframe      — 9:16 / 1:1 / 16:9 (crop or letterbox)
    video.burn_caption — drawtext overlay
    video.audio_enhance — denoise + EBU R128 loudness
    video.scene_cuts   — detect scene timestamps
    video.gif          — palette-optimised GIF export
    video.thumbnail    — frame capture at time T
    video.compress     — re-encode at lower bitrate
    video.summarize    — midpoint frame → Qwen-VL describe
  Audio:
    video.audio_enhance — also accepts standalone audio

How to respond when an attachment is present:
- Reply in 1 short sentence acknowledging what you'll do, e.g. "Got it — running image.edit with 'color the lizard white'."
- Do NOT mention dispatching to specialists or routing patterns.
- Do NOT simulate the result.
- Just confirm the action; the runtime takes it from there.`;

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

