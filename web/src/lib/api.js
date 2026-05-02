// Tiny client for the @2in/server backend. Hits /api/* (Vite dev proxies to :3001).

const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

function url(path) {
  return `${BASE}${path}`;
}

async function unwrap(res) {
  let body;
  try { body = await res.json(); } catch { body = {}; }
  if (!res.ok) {
    const msg = body?.message ?? body?.error ?? `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export const twitterApi = {
  // Returns { url, state } so the caller can do window.location = url.
  authUrl: () => fetch(url('/api/twitter/auth-url')).then(unwrap),

  // Exchanges OAuth code for a Twitter access token + identity.
  exchange: (code, state) =>
    fetch(url('/api/twitter/exchange'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state }),
    }).then(unwrap),

  // Recent tweets for an authenticated user.
  tweets: (accessToken, userId, max = 20) =>
    fetch(url(`/api/twitter/tweets?userId=${encodeURIComponent(userId)}&max=${max}`), {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(unwrap),
};

export const healthApi = {
  ping: () => fetch(url('/api/health')).then(unwrap),
};

export const chatApi = {
  mode: () => fetch(url('/api/chat/mode')).then(unwrap),
};

export const taskApi = {
  patterns: () => fetch(url('/api/task/patterns')).then(unwrap),
  spawn: (goal, twin, pattern) =>
    fetch(url('/api/task'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, twin, pattern }),
    }).then(unwrap),
};

export const storageApi = {
  mode: () => fetch(url('/api/storage/mode')).then(unwrap),
  upload: (content, contentType = 'text') =>
    fetch(url('/api/storage/upload'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, contentType }),
    }).then(unwrap),
};

export const memoryApi = {
  // Per-type list. Type can be a new memory type or a legacy slice alias.
  list: (slice, twin = '42') =>
    fetch(url(`/api/memory/${slice}/list?twin=${encodeURIComponent(twin)}`)).then(unwrap),
  // Top-level summary across all 6 typed slices.
  listAll: (twin = '42') =>
    fetch(url(`/api/memory/list?twin=${encodeURIComponent(twin)}`)).then(unwrap),
  write: (slice, value, twin = '42', who) =>
    fetch(url(`/api/memory/${slice}/write`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twin, value, who }),
    }).then(unwrap),
  // LLM-driven extraction; returns the typed entries it stored.
  encode: (text, twin = '42', source = 'manual', agent) =>
    fetch(url('/api/memory/encode'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twin, text, source, agent }),
    }).then(unwrap),
  forget: (slice, id, twin = '42') =>
    fetch(url(`/api/memory/${slice}/${encodeURIComponent(id)}?twin=${encodeURIComponent(twin)}`), {
      method: 'DELETE',
    }).then(unwrap),
  root: (slice, twin = '42') =>
    fetch(url(`/api/memory/${slice}/root?twin=${encodeURIComponent(twin)}`)).then(unwrap),
  exportUrl: (twin = '42') => url(`/api/memory/export?twin=${encodeURIComponent(twin)}`),
};

export const personaApi = {
  extract: (tweets, twin) =>
    fetch(url('/api/persona/extract'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tweets, twin }),
    }).then(unwrap),
  fromQuestionnaire: (answers, twin) =>
    fetch(url('/api/persona/from-questionnaire'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers, twin }),
    }).then(unwrap),
};

export const finetuneApi = {
  mode: () => fetch(url('/api/finetune/mode')).then(unwrap),
  start: (specialistId, opts = {}) =>
    fetch(url('/api/finetune/start'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ specialistId, ...opts }),
    }).then(unwrap),
  get: (jobId) => fetch(url(`/api/finetune/jobs/${jobId}`)).then(unwrap),
  listForSpecialist: (id) =>
    fetch(url(`/api/finetune/specialists/${encodeURIComponent(id)}/jobs`)).then(unwrap),
};

export const chainApi = {
  mode: () => fetch(url('/api/chain/mode')).then(unwrap),
  twin: (tokenId) => fetch(url(`/api/chain/twin/${tokenId}`)).then(unwrap),
  delegate: (tokenId, delegate, txHash) =>
    fetch(url('/api/chain/delegate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenId, delegate, txHash }),
    }).then(unwrap),
};

export const feedbackApi = {
  approve: (taskId, body = {}) =>
    fetch(url(`/api/task/${encodeURIComponent(taskId)}/approve`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(unwrap),
  reject: (taskId, body) =>
    fetch(url(`/api/task/${encodeURIComponent(taskId)}/reject`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(unwrap),
  snapshots: (tokenId) =>
    fetch(url(`/api/chain/snapshots/${tokenId}`)).then(unwrap),
};

export const toolsApi = {
  list: () => fetch(url('/api/tools')).then(unwrap),
  get: (name) => fetch(url(`/api/tools/${encodeURIComponent(name)}`)).then(unwrap),
  invoke: (name, input, opts = {}) =>
    fetch(url(`/api/tools/${encodeURIComponent(name)}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, ...opts }),
    }).then(unwrap),
};

export const uploadApi = {
  /** Multipart upload — returns { url, mimeType, sizeBytes, filename }. */
  send: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(url('/api/upload'), { method: 'POST', body: fd }).then(unwrap);
  },
  list: () => fetch(url('/api/upload/list')).then(unwrap),
  remove: (filename) =>
    fetch(url(`/api/upload/file/${encodeURIComponent(filename)}`), { method: 'DELETE' }).then(unwrap),
};
