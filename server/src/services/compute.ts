// 0G Compute service. One async-generator interface — `chatStream(messages, opts)`
// — with three backends, tried in order:
//
//   router  → 0G Router OpenAI-compatible endpoint with Bearer API key.
//             Set ZG_ROUTER_API_KEY (get one at pc.testnet.0g.ai → API
//             Reference → Create API key). Preferred — simplest path.
//   broker  → @0glabs/0g-serving-broker, wallet-signs each call. Used only
//             if no Router key is set. The 2.0.0 SDK has known setup
//             ceremonies that may fail silently.
//   mock    → canned reply chunked on a 32ms cadence; same SSE shape.
//
// The frontend never knows which backend served — same wire format.

import { config } from '../config.js';
import { getBroker, isBrokerConfigured } from './broker.js';

import { resolveProviderUrl } from './provider-lookup.js';

function hasRouter(): boolean {
  return Boolean(config.ZG_ROUTER_API_KEY);
}

function isAdvanced(): boolean {
  return Boolean(config.ZG_PROVIDER_URL || config.ZG_PROVIDER_ADDRESS);
}

// Returns the FULL URL to POST to (router endpoint OR provider proxy path).
// Cached; in-memory.
let cachedAdvancedUrl: string | null = null;
async function inferenceUrl(): Promise<string> {
  if (config.ZG_PROVIDER_URL) {
    return `${config.ZG_PROVIDER_URL.replace(/\/$/, '')}/v1/proxy/chat/completions`;
  }
  if (config.ZG_PROVIDER_ADDRESS) {
    if (!cachedAdvancedUrl) {
      const base = await resolveProviderUrl(config.ZG_PROVIDER_ADDRESS);
      cachedAdvancedUrl = `${base}/v1/proxy/chat/completions`;
    }
    return cachedAdvancedUrl;
  }
  return config.ZG_ROUTER_URL;
}

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
  kind: 'router' | 'advanced' | 'broker' | 'mock';
  reason?: string;
  model?: string;
  endpoint?: string;
}

// How long we stay in fallback after a real-mode failure before retrying.
// Rate limits (429) typically reset within a minute; auth + network errors
// usually need more time but a 30s cooldown gives the user a fast recovery.
const REAL_MODE_COOLDOWN_MS = 30_000;

export class ComputeService {
  private brokerError: string | null = null;
  private brokerErrorAt: number | null = null;
  private routerError: string | null = null;
  private routerErrorAt: number | null = null;

  // Should the real path retry now (cooldown elapsed) or stay mock?
  private inCooldown(at: number | null): boolean {
    return at != null && Date.now() - at < REAL_MODE_COOLDOWN_MS;
  }

  private maybeClearRouter(): void {
    if (this.routerError && !this.inCooldown(this.routerErrorAt)) {
      this.routerError = null;
      this.routerErrorAt = null;
    }
  }

  private maybeClearBroker(): void {
    if (this.brokerError && !this.inCooldown(this.brokerErrorAt)) {
      this.brokerError = null;
      this.brokerErrorAt = null;
    }
  }

  get mode(): ComputeMode {
    this.maybeClearRouter();
    this.maybeClearBroker();

    if (hasRouter()) {
      if (this.routerError) {
        const remaining = Math.ceil((REAL_MODE_COOLDOWN_MS - (Date.now() - (this.routerErrorAt ?? 0))) / 1000);
        return {
          kind: 'mock',
          reason: `${isAdvanced() ? 'advanced' : 'router'} cooling down (${remaining}s) · ${this.routerError.slice(0, 80)}`,
        };
      }
      return {
        kind: isAdvanced() ? 'advanced' : 'router',
        model: config.DIRECTOR_MODEL,
        endpoint: config.ZG_PROVIDER_URL ?? config.ZG_PROVIDER_ADDRESS ?? config.ZG_ROUTER_URL,
      };
    }
    if (!isBrokerConfigured()) {
      return { kind: 'mock', reason: 'no ZG_ROUTER_API_KEY and no BROKER_PRIVATE_KEY set' };
    }
    if (this.brokerError) {
      return { kind: 'mock', reason: `broker unavailable: ${this.brokerError}` };
    }
    return { kind: 'broker' };
  }

  async listProviders(): Promise<unknown> {
    if (hasRouter()) {
      return { mode: 'router', endpoint: config.ZG_ROUTER_URL, model: config.DIRECTOR_MODEL };
    }
    if (!isBrokerConfigured()) {
      return { mode: 'mock', providers: [], reason: 'no ZG_ROUTER_API_KEY and no BROKER_PRIVATE_KEY set' };
    }
    try {
      const broker = await getBroker();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (broker as any)?.inference?.listService?.();
    } catch (err) {
      this.brokerError = (err as Error).message;
      this.brokerErrorAt = Date.now();
      return { mode: 'mock', providers: [], reason: this.brokerError };
    }
  }

  async *chatStream(
    messages: ChatMessage[],
    opts: ChatStreamOptions = {},
  ): AsyncGenerator<ChatStreamYield, void, void> {
    const m = this.mode;

    // Mock only runs when nothing real is configured. If a real path is
    // wired (router/broker), failures propagate as errors instead of
    // silently producing canned responses — the SSE client surfaces the
    // actual reason in an 'error' event so the UI shows truth.
    if (m.kind === 'mock') {
      const realConfigured = hasRouter() || isBrokerConfigured();
      if (realConfigured && (this.routerError || this.brokerError)) {
        throw new Error(this.routerError ?? this.brokerError ?? m.reason ?? 'compute unavailable');
      }
      yield* mockChatStream(messages, opts);
      return;
    }
    if (m.kind === 'router' || m.kind === 'advanced') {
      try {
        yield* this.routerChatStream(messages, opts);
        return;
      } catch (err) {
        this.routerError = (err as Error).message;
        this.routerErrorAt = Date.now();
        // eslint-disable-next-line no-console
        console.warn(`[compute] ${m.kind} call failed (${this.routerError})`);
        throw err;
      }
    }
    // broker path
    try {
      yield* this.realChatStream(messages, opts);
    } catch (err) {
      this.brokerError = (err as Error).message;
      this.brokerErrorAt = Date.now();
      // eslint-disable-next-line no-console
      console.warn(`[compute] broker call failed (${this.brokerError})`);
      throw err;
    }
  }

  // === router (Direct API mode) =====================================
  private async *routerChatStream(
    messages: ChatMessage[],
    opts: ChatStreamOptions,
  ): AsyncGenerator<ChatStreamYield, void, void> {
    const url = await inferenceUrl();
    const body = JSON.stringify({
      model: opts.model ?? config.DIRECTOR_MODEL,
      messages,
      temperature: opts.temperature ?? 0.7,
      stream: true,
    });
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.ZG_ROUTER_API_KEY}`,
    };

    // 429 backoff: provider caps at 10 req/min. On rate-limit, honor
    // Retry-After (or default 7s) and retry once. Anything else, throw.
    let res = await fetch(url, { method: 'POST', headers, body });
    if (res.status === 429) {
      const retryAfterHeader = res.headers.get('retry-after');
      const waitMs = retryAfterHeader
        ? Math.min(15_000, Math.max(1_000, Math.ceil(Number(retryAfterHeader) * 1000)))
        : 7_000;
      // eslint-disable-next-line no-console
      console.warn(`[compute] 429 — backing off ${waitMs}ms then retrying once`);
      await new Promise((r) => setTimeout(r, waitMs));
      res = await fetch(url, { method: 'POST', headers, body });
    }
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(`router ${res.status}: ${text.slice(0, 200)}`);
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const json: any = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content ?? '';
          if (delta) yield { delta };
        } catch {
          // skip malformed chunk
        }
      }
    }
    yield { done: true, finishReason: 'stop' };
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
