// SSE helper that returns a Node Readable stream Fastify will pipe to the
// response. Cleaner than reply.hijack() — no manual writeHead, no risk of
// Fastify thinking the handler is done before the stream finishes.
//
// Usage:
//   const sse = sseStream();
//   reply.type('text/event-stream').header('cache-control', 'no-cache')
//        .header('connection', 'keep-alive').header('x-accel-buffering', 'no');
//   void runner(sse);   // fire-and-forget; runner calls sse.send + sse.close
//   return reply.send(sse.stream);

import { Readable } from 'node:stream';

export interface SseStream {
  stream: Readable;
  send: (event: string, data: unknown) => void;
  close: () => void;
  closed: boolean;
}

export function sseStream(): SseStream {
  let closed = false;
  const stream = new Readable({ read() {} });

  // Heartbeat keeps proxies + browsers from killing the idle connection.
  const heartbeat = setInterval(() => {
    if (closed) return;
    stream.push(': hb\n\n');
  }, 15_000);
  // Don't keep the event loop alive on this timer.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (heartbeat as any).unref?.();

  const close = (): void => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    try { stream.push(null); } catch {}
  };

  const send = (event: string, data: unknown): void => {
    if (closed) return;
    try {
      stream.push(`event: ${event}\n`);
      stream.push(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      close();
    }
  };

  // If the consumer disconnects, stop generating.
  stream.on('close', close);

  // Initial open marker — flushes headers in some proxies.
  stream.push(': open\n\n');

  return {
    stream,
    send,
    close,
    get closed() { return closed; },
  };
}

// Convenience for Fastify reply: set the SSE headers on the reply.
import type { FastifyReply } from 'fastify';
export function setSseHeaders(reply: FastifyReply): void {
  reply
    .type('text/event-stream')
    .header('cache-control', 'no-cache, no-transform')
    .header('connection', 'keep-alive')
    .header('x-accel-buffering', 'no');
}
