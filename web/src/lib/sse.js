// Tiny SSE consumer. Two modes:
//
//   sseGet(url)             — for GET endpoints; uses the EventSource browser API
//   ssePost(url, body)      — for POST endpoints (EventSource only does GET);
//                              uses fetch + ReadableStream + manual line parsing
//
// Both return an object: { onEvent, close }. Cancel by calling close().
// onEvent(name, handler) — register a callback per event name.

export function ssePost(url, body, init = {}) {
  const ctrl = new AbortController();
  const handlers = new Map();
  let closed = false;

  const promise = (async () => {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...init.headers },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (err) {
      if (closed) return;
      handlers.get('error')?.({ message: err.message ?? 'fetch_failed' });
      handlers.get('close')?.();
      return;
    }
    if (!res.ok || !res.body) {
      let detail = '';
      try { detail = (await res.json()).message ?? ''; } catch {}
      handlers.get('error')?.({ message: detail || `HTTP ${res.status}` });
      handlers.get('close')?.();
      return;
    }
    await consume(res.body, handlers, () => closed);
    handlers.get('close')?.();
  })();

  return {
    onEvent(name, handler) {
      handlers.set(name, handler);
    },
    close() {
      closed = true;
      ctrl.abort();
    },
    done: promise,
  };
}

export function sseGet(url) {
  const handlers = new Map();
  const ctrl = new AbortController();
  let closed = false;

  const promise = (async () => {
    let res;
    try {
      res = await fetch(url, { signal: ctrl.signal });
    } catch (err) {
      if (closed) return;
      handlers.get('error')?.({ message: err.message ?? 'fetch_failed' });
      handlers.get('close')?.();
      return;
    }
    if (!res.ok || !res.body) {
      handlers.get('error')?.({ message: `HTTP ${res.status}` });
      handlers.get('close')?.();
      return;
    }
    await consume(res.body, handlers, () => closed);
    handlers.get('close')?.();
  })();

  return {
    onEvent(name, handler) { handlers.set(name, handler); },
    close() { closed = true; ctrl.abort(); },
    done: promise,
  };
}

async function consume(body, handlers, isClosed) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let evName = 'message';
  let dataBuf = [];

  while (true) {
    if (isClosed()) {
      try { await reader.cancel(); } catch {}
      return;
    }
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nlIdx;
    while ((nlIdx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nlIdx);
      buffer = buffer.slice(nlIdx + 1);

      if (line === '') {
        if (dataBuf.length) {
          const dataStr = dataBuf.join('\n');
          let data;
          try { data = JSON.parse(dataStr); } catch { data = dataStr; }
          handlers.get(evName)?.(data);
        }
        evName = 'message';
        dataBuf = [];
        continue;
      }
      if (line.startsWith(':')) continue; // comment / heartbeat
      if (line.startsWith('event:')) {
        evName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataBuf.push(line.slice(5).trim());
      }
    }
  }
}
