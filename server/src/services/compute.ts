// 0G Compute service. One async-generator interface — `chatStream(messages, opts)`
// — with two backends:
//
//   real  → @0glabs/0g-serving-broker (Router mode), wallet signs each call
//   mock  → canned reply chunked on a 30ms cadence; same SSE shape
//
// The frontend never knows which backend it's talking to. Both stream tokens
// over SSE so the demo works whether or not BROKER_PRIVATE_KEY is set.
//
// Note: the broker SDK's surface has been churning rapidly (see Phase 1
// snapshot). We isolate it behind this one file so future API drift only
// touches `realChatStream`.

import { config } from '../config.js';
import { getBroker, isBrokerConfigured } from './broker.js';

export type ChatRole = 'system' | 'user' | 'assistant';
export interface ChatMessage {
  role: ChatRole;
  content: string;
}
export interface ChatStreamOptions {
  model?: string;
  temperature?: number;
}
export interface ChatStreamChunk {
  delta: string;
  done?: false;
}
export interface ChatStreamFinal {
  delta?: string;
  done: true;
  finishReason?: string;
}
export type ChatStreamYield = ChatStreamChunk | ChatStreamFinal;

export interface ComputeMode {
  kind: 'real' | 'mock';
  reason?: string;
}

export class ComputeService {
  // Sticky failure marker — once broker init blows up, stop retrying it
  // every request and report mock with the actual error message.
  private brokerError: string | null = null;

  get mode(): ComputeMode {
    if (!isBrokerConfigured()) {
      return { kind: 'mock', reason: 'BROKER_PRIVATE_KEY not set' };
    }
    if (this.brokerError) {
      return { kind: 'mock', reason: `broker unavailable: ${this.brokerError}` };
    }
    return { kind: 'real' };
  }

  async listProviders(): Promise<unknown> {
    if (this.mode.kind === 'mock') {
      return { mode: 'mock', providers: [], reason: this.mode.reason };
    }
    try {
      const broker = await getBroker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (broker as any)?.inference?.listService?.();
    } catch (err) {
      this.brokerError = (err as Error).message;
      return { mode: 'mock', providers: [], reason: this.brokerError };
    }
  }

  async *chatStream(
    messages: ChatMessage[],
    opts: ChatStreamOptions = {},
  ): AsyncGenerator<ChatStreamYield, void, void> {
    // Mock path covers: no broker key, broker init previously failed, or
    // explicit mock mode.
    if (this.mode.kind === 'mock') {
      yield* mockChatStream(messages, opts);
      return;
    }
    // Real path — but if broker init / provider lookup throws, mark the
    // sticky error and fall back to mock so the user actually sees a reply
    // instead of an SSE error event sitting forever.
    try {
      yield* this.realChatStream(messages, opts);
    } catch (err) {
      this.brokerError = (err as Error).message;
      // eslint-disable-next-line no-console
      console.warn(`[compute] broker call failed (${this.brokerError}) — falling back to mock`);
      yield* mockChatStream(messages, opts);
    }
  }

  private async *realChatStream(
    messages: ChatMessage[],
    opts: ChatStreamOptions,
  ): AsyncGenerator<ChatStreamYield, void, void> {
    const broker = await getBroker();
    if (!broker) throw new Error('broker not initialised');
    // Loose typing on purpose — see initBroker comment.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = broker as any;
    const services = (await b.inference.listService()) as Array<{
      provider: string;
      model: string;
      url?: string;
    }>;
    const target = services.find(
      (s) => s.model === (opts.model ?? config.DIRECTOR_MODEL),
    );
    if (!target) {
      throw new Error(
        `No provider serves model "${opts.model ?? config.DIRECTOR_MODEL}". Available: ${services
          .map((s) => s.model)
          .join(', ')}`,
      );
    }

    // Authenticate — the broker SDK signs the request and returns headers we
    // POST to the provider's OpenAI-compatible /chat/completions endpoint.
    const headers = await b.inference.getRequestHeaders(
      target.provider,
      JSON.stringify(messages),
    );
    const url = `${target.url}/v1/chat/completions`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        model: target.model,
        messages,
        temperature: opts.temperature ?? 0.7,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(`Broker call failed (${res.status}): ${text}`);
    }

    const decoder = new TextDecoder();
    const reader = res.body.getReader();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') {
          yield { done: true, finishReason: 'stop' };
          return;
        }
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content ?? '';
          if (delta) yield { delta };
        } catch {
          // ignore malformed chunk
        }
      }
    }
    yield { done: true, finishReason: 'stop' };
  }
}

// === mock backend ====================================================
async function* mockChatStream(
  messages: ChatMessage[],
  opts: ChatStreamOptions,
): AsyncGenerator<ChatStreamYield, void, void> {
  const userText = lastUserText(messages);
  const text = mockReplyFor(userText, opts.model ?? config.DIRECTOR_MODEL);
  // Tokenize roughly by word + punctuation so the stream feels natural.
  const tokens = text.split(/(\s+)/).filter(Boolean);
  const perTokenMs = 32;
  for (const tok of tokens) {
    await new Promise((r) => setTimeout(r, perTokenMs));
    yield { delta: tok };
  }
  yield { done: true, finishReason: 'stop' };
}

function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return messages[i]!.content;
  }
  return '';
}

function mockReplyFor(input: string, model: string): string {
  const lower = input.toLowerCase();
  // Detect intent and produce a director-shaped response.
  if (/(draft|tweet|sponsor|acme|brand)/.test(lower)) {
    return [
      "Got it — that involves brand language so I'll route through ",
      "**with-legal-review** across Scout, Quill, Mantle, and Mark. ",
      "Spawning the task now — open the work pane on the right to watch ",
      "each specialist as they go.",
    ].join('');
  }
  if (/(hook|podcast|episode|cold open|script)/.test(lower)) {
    return [
      "Routing through **content-draft** — Scout pulls themes, Quill drafts ",
      "in your voice, Mark gates against rejection_memory. Task is live in ",
      "the work pane.",
    ].join('');
  }
  if (/(memory|preference|forget|remember)/.test(lower)) {
    return [
      "Updating preference_memory with that. Future drafts will pull this ",
      "from your warm slice automatically — no need to repeat it.",
    ].join('');
  }
  if (/(hi|hello|hey|sup)/.test(lower)) {
    return [
      "Hey — I'm your director. Tell me what you want shipped and I'll ",
      "pick the right specialists. Try: \"draft a tweet about a recent post\".",
    ].join('');
  }
  // Generic acknowledgement
  return [
    `Working on it — model **${model}** mock response. `,
    "In real mode I would dispatch the right pattern; in mock mode you're ",
    "seeing the streaming UX without burning 0G credits. Set ",
    "`BROKER_PRIVATE_KEY` in `server/.env` to flip to real inference.",
  ].join('');
}

export const compute = new ComputeService();
