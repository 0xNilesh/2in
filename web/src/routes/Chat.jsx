// Chat with the user's twin (director) — multi-thread, real streaming.
//   /chat                       → redirects to the latest thread
//   /chat/:threadId             → renders that thread + live extension
//   ?task=<taskId> in URL       → WorkPane mounts at right (handled by AppShell)
//
// Each thread has a seed message list in data/threads.js. Messages the user
// sends *after* loading the thread live in component state (keyed by threadId
// in localStorage, so they survive page navigation within the session).

import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useSearchParams, Navigate, Link, useNavigate } from 'react-router-dom';
import { Composer } from '../components/Composer.jsx';
import { Message } from '../components/Message.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { useTwin } from '../hooks/useTwin.js';
import { useStreamingChat } from '../hooks/useStreamingChat.js';
import { useThreads, getThreadSync, deriveTitle } from '../hooks/useThreads.js';
import { getTwinId } from '../data/specialists.js';
import { useThreadSummary } from '../hooks/useThreadSummary.js';
import { ROUTES } from '../lib/routes.js';
import { taskApi, memoryApi, chatApi, toolsApi } from '../lib/api.js';
import { pushToast } from '../hooks/useToasts.js';

const EXT_KEY = '2in:thread-ext';

function readExt() {
  try {
    return JSON.parse(window.localStorage.getItem(EXT_KEY) ?? '{}');
  } catch {
    return {};
  }
}
function writeExt(all) {
  try { window.localStorage.setItem(EXT_KEY, JSON.stringify(all)); } catch {}
}

export default function Chat() {
  const { threadId } = useParams();
  const [twin] = useTwin();
  const nav = useNavigate();
  const [, setParams] = useSearchParams();
  const { threads, createThread, renameThread, touchThread } = useThreads();

  if (!threadId) {
    const fallback = threads[0]?.id;
    return fallback ? <Navigate to={ROUTES.chatThread(fallback)} replace /> : <Empty twin={twin} />;
  }

  const thread = threads.find((t) => t.id === threadId) ?? getThreadSync(threadId);
  if (!thread) {
    // ThreadId in URL but unknown — create a fresh one and redirect.
    const t = createThread();
    return <Navigate to={ROUTES.chatThread(t.id)} replace />;
  }

  const seed = { id: thread.id, title: thread.title, day: new Date(thread.createdAt ?? Date.now()).toDateString(), messages: [] };

  return (
    <ChatBody
      key={threadId}
      threadId={threadId}
      twin={twin}
      seed={seed}
      thread={thread}
      onRename={(t) => renameThread(threadId, t)}
      onTouch={() => touchThread(threadId)}
      onNewChat={() => {
        const t = createThread();
        nav(ROUTES.chatThread(t.id));
      }}
      openTask={(taskId) => setParams((p) => {
        const next = new URLSearchParams(p);
        next.set('task', taskId);
        return next;
      }, { replace: true })}
    />
  );
}

function readCorpus() {
  try { return JSON.parse(window.localStorage.getItem('2in:corpus:twitter') ?? 'null'); }
  catch { return null; }
}

const BANNER_THRESHOLD = 25; // demo dataset has 25 tweets; tune for archive uploads

function ChatBody({ threadId, twin, seed, thread, onRename, onTouch, onNewChat, openTask }) {
  const [extension, setExtension] = useState(() => readExt()[threadId] ?? []);
  const { send, isStreaming, partial, error, taskCue } = useStreamingChat({ target: 'director' });
  const scrollRef = useRef(null);
  const lastTaskCueRef = useRef(null);
  const pendingAttachmentsRef = useRef([]);
  const [mode, setMode] = useState(null);

  useEffect(() => {
    chatApi.mode().then(setMode).catch(() => setMode(null));
  }, []);

  // Persist extension to localStorage whenever it changes.
  useEffect(() => {
    const all = readExt();
    if (extension.length === 0) {
      delete all[threadId];
    } else {
      all[threadId] = extension;
    }
    writeExt(all);
  }, [extension, threadId]);

  // Snapshot the thread to 0G Storage. Debounced — every change to the
  // message list (user msg, director reply, taskRef append, work-pane
  // updates) restarts a 1.5 s timer; the actual upload only fires once
  // the conversation settles. This makes one settled snapshot per turn
  // instead of multiple racing partial ones, and guarantees the final
  // state captures the director's reply + the taskRef.
  //
  // Also flushes on unmount so navigating away from /chat doesn't lose
  // an in-flight snapshot.
  //
  // Bundles every referenced task's localStorage state ('2in:task:<id>')
  // alongside the messages so cross-device restore reconstructs the work
  // pane (Writer drafts, Researcher output, costs, tool calls) too —
  // not just the message stream.
  const latestExtensionRef = useRef(extension);
  useEffect(() => { latestExtensionRef.current = extension; }, [extension]);

  const fireSnapshot = (msgs) => {
    if (!msgs || msgs.length === 0) return;
    const tasks = {};
    for (const m of msgs) {
      const taskId = m?.body?.taskRef;
      if (!taskId) continue;
      try {
        const raw = window.localStorage.getItem(`2in:task:${taskId}`);
        if (raw) tasks[taskId] = JSON.parse(raw);
      } catch { /* skip unparseable */ }
    }
    const payload = {
      id: threadId,
      title: thread.title,
      createdAt: thread.createdAt,
      updatedAt: Date.now(),
      messages: msgs,
      tasks,
    };
    return fetch('/api/chat/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        twin: getTwinId(),
        threadId,
        thread: payload,
        msgCount: msgs.length,
      }),
    }).catch(() => { /* swallow — snapshot is best-effort */ });
  };

  useEffect(() => {
    if (extension.length === 0) return;
    const t = setTimeout(() => fireSnapshot(latestExtensionRef.current), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extension, threadId]);

  // On unmount (or thread change): if we have unsaved messages, flush
  // immediately so user navigation doesn't leak a partial snapshot.
  useEffect(() => {
    return () => {
      const latest = latestExtensionRef.current;
      if (latest && latest.length > 0) {
        // Fire-and-forget — keepalive lets the request survive page nav.
        try {
          const tasks = {};
          for (const m of latest) {
            const taskId = m?.body?.taskRef;
            if (!taskId) continue;
            try {
              const raw = window.localStorage.getItem(`2in:task:${taskId}`);
              if (raw) tasks[taskId] = JSON.parse(raw);
            } catch { /* skip */ }
          }
          fetch('/api/chat/snapshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body: JSON.stringify({
              twin: getTwinId(),
              threadId,
              thread: {
                id: threadId,
                title: thread.title,
                createdAt: thread.createdAt,
                updatedAt: Date.now(),
                messages: latest,
                tasks,
              },
              msgCount: latest.length,
            }),
          }).catch(() => {});
        } catch { /* ignore */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // Auto-scroll to the bottom on new content.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [extension, partial]);

  const allMessages = useMemo(() => [...seed.messages, ...extension], [seed.messages, extension]);

  // Long-thread summary cache. When the conversation grows past ~12 turns,
  // this hook computes a summary of the older portion (server-side via
  // /api/chat/summarize) and caches it in localStorage per thread. We send
  // the summary on every chat + spawn so early framing isn't lost when the
  // 10-message recent cap drops older turns.
  const apiMessages = useMemo(
    () => allMessages
      .filter((m) => m.kind === 'user' || (m.kind === 'agent' && m.from === 'director'))
      .map((m) => toApiMessage(m)),
    [allMessages],
  );
  const threadSummary = useThreadSummary(threadId, apiMessages);

  // When streaming finishes, commit the partial as a message AND — if the
  // user attached files — run the matched media tool unconditionally.
  // We don't wait for the dispatch-verb detector here because the
  // attachment + user instruction are sufficient signal on their own; an
  // attached image with "color the lizard white" should always edit, even
  // if the director's prose doesn't contain a pattern keyword.
  useEffect(() => {
    if (isStreaming) return;
    if (!partial) return;
    setExtension((ext) => [
      ...ext,
      {
        kind: 'agent',
        from: 'director',
        ts: nowTime(),
        body: { intro: [partial] },
      },
    ]);

    // Attachment-driven tool dispatch — runs once per send.
    const attachments = pendingAttachmentsRef.current ?? [];
    if (attachments.length > 0) {
      pendingAttachmentsRef.current = [];
      const goalMsg = [...allMessages].reverse().find((m) => m.kind === 'user');
      const goal = (goalMsg?.text && (Array.isArray(goalMsg.text) ? goalMsg.text.join(' ') : goalMsg.text)) ?? '';
      const toolName = detectMediaToolFromIntent(goal, attachments);
      if (toolName) {
        // Mark cue handler as "consumed" so the taskCue effect doesn't
        // also try to spawn a pattern for this turn.
        lastTaskCueRef.current = '__attachment-handled__';
        void runMediaTool(toolName, attachments[0], goal, setExtension);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  // If the streamed reply mentioned a known pattern, spawn the task
  // and append a TaskCard message that opens the work pane on click.
  // Also: if the director's reply names a media tool (image.edit / video.*)
  // AND we have attachments from the most recent send, run the tool directly
  // and append the result inline.
  useEffect(() => {
    if (!taskCue) return;
    if (lastTaskCueRef.current === taskCue) return;
    if (isStreaming) return;
    lastTaskCueRef.current = taskCue;

    // The attachment-finished branch above already consumed this turn;
    // skip pattern dispatch so we don't double-fire on the same send.
    if (taskCue === '__attachment-handled__') return;

    (async () => {
      try {
        const goalMsg = [...allMessages].reverse().find((m) => m.kind === 'user');
        const goal = (goalMsg?.text && (Array.isArray(goalMsg.text) ? goalMsg.text.join(' ') : goalMsg.text)) ?? 'unspecified';

        // Send the last few user+director turns so specialists can resolve
        // references like "in 200 words", "shorter", "more contrarian"
        // against the prior topic. Cap at 6 turns.
        const chatHistory = allMessages
          .filter((m) => m.kind === 'user' || (m.kind === 'agent' && m.from === 'director'))
          .slice(-6)
          .map((m) => toApiMessage(m));

        // Normal pattern dispatch (no attachment in this turn).
        const explicitPattern = taskCue === '__auto__' ? undefined : taskCue;
        const { taskId } = await taskApi.spawn(goal, twin, explicitPattern, chatHistory, threadSummary);
        setExtension((ext) => [
          ...ext,
          {
            kind: 'agent',
            from: 'director',
            ts: nowTime(),
            body: { taskRef: taskId },
            __live: true,
          },
        ]);
        openTask(taskId);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('spawn task failed', err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, taskCue]);

  const savePreference = async (text) => {
    try {
      const res = await memoryApi.write('preference', text, '42', 'chat correction');
      pushToast({
        kind: 'success',
        title: 'Saved to preference_memory',
        body: res.snapshot
          ? `Snapshot fired · updateMetadata(#${res.snapshot.tokenId}) · ${res.snapshot.delta}`
          : `${res.pendingWrites}/3 writes until next snapshot`,
      });
    } catch (err) {
      pushToast({ kind: 'error', title: 'Save failed', body: err.message ?? 'try again' });
    }
  };

  const handleSend = (text, attachments = []) => {
    // Auto-title the thread on its first user message.
    if (thread && (thread.title === 'New chat' || !thread.title)) {
      onRename?.(deriveTitle(text || (attachments[0]?.originalFilename ?? '')));
    } else {
      onTouch?.();
    }
    setExtension((ext) => [
      ...ext,
      {
        kind: 'user',
        text,
        attachments,
        ts: `${twin.name === '2in' ? '@you' : `@${twin.name}`} · ${nowTime()}`,
      },
    ]);
    // Build the history. When the user attached files, surface them in the
    // user turn so Qwen knows what's available. Director's system prompt
    // is augmented (server-side) to know the media tools.
    const attachLine = attachments.length
      ? `\n\n[attached: ${attachments.map((a) => `${a.kind ?? 'file'} ${a.url}`).join(', ')}]`
      : '';
    const history = [
      ...seed.messages
        .filter((m) => m.kind === 'user' || (m.kind === 'agent' && m.from === 'director'))
        .map((m) => toApiMessage(m)),
      ...extension
        .filter((m) => m.kind === 'user' || (m.kind === 'agent' && m.from === 'director'))
        .map((m) => toApiMessage(m)),
      { role: 'user', content: (text || '(no text — attachment only)') + attachLine },
    ];
    lastTaskCueRef.current = null;
    // Stash attachments so taskCue handler can pass them to the spawn.
    pendingAttachmentsRef.current = attachments;
    send(history, { twin, summary: threadSummary });
  };

  return (
    <>
      <header className="chat-head">
        <Avatar initial={twin.name?.[0]?.toUpperCase() ?? '2'} variant="dir" size="md" />
        <div className="meta">
          <div className="name">{twin.name} <span style={{ color: 'var(--text-faint)' }}>·</span> {seed.title}</div>
          <div className="sub">
            <ChatStatus mode={mode} isStreaming={isStreaming} />
          </div>
        </div>
        <div className="right" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            className="btn btn-ghost"
            onClick={() => setExtension([])}
            title="Wipe local conversation history for this thread (model bias reset)"
          >
            Clear
          </button>
          <button className="btn btn-ghost" onClick={onNewChat} title="Start a new chat">+ New chat</button>
          <button className="icon-btn" title="open in new">↗</button>
        </div>
      </header>

      <div className="scroll" ref={scrollRef}>
        <div className="stream">
          <div className="day">{seed.day}</div>
          {allMessages.length === 0 && !isStreaming ? (
            <EmptyThread twin={twin} />
          ) : null}
          {allMessages.map((m, i) => (
            <Message key={i} msg={m} onSavePreference={m.kind === 'user' ? savePreference : undefined} />
          ))}
          {isStreaming && partial ? (
            <Message
              msg={{
                kind: 'agent-live',
                from: 'director',
                ts: nowTime(),
                body: { text: [partial] },
              }}
            />
          ) : null}
          {error ? <ChatErrorBanner error={error} /> : null}
        </div>
      </div>

      <Composer
        placeholder={`Ask ${twin.name} anything…`}
        onSend={handleSend}
        disabled={isStreaming}
      />
    </>
  );
}

function Empty({ twin }) {
  return (
    <>
      <header className="chat-head">
        <div className="meta"><div className="name">No chat yet</div></div>
      </header>
      <div className="scroll">
        <div className="stream">
          <p style={{ color: 'var(--text-mute)' }}>
            Start a fresh thread with {twin.name}. <Link to={ROUTES.chat}>Go home →</Link>
          </p>
        </div>
      </div>
      <Composer placeholder={`Ask ${twin.name} anything…`} />
    </>
  );
}

function toApiMessage(m) {
  if (m.kind === 'user') {
    const text = Array.isArray(m.text) ? m.text.map((p) => (typeof p === 'string' ? p : p.strong ?? '')).join('') : m.text;
    return { role: 'user', content: String(text ?? '') };
  }
  // agent · director — flatten body parts
  const b = m.body ?? {};
  const parts = [];
  if (b.intro) parts.push(flatten(b.intro));
  if (b.text) parts.push(flatten(b.text));
  if (b.draft) parts.push(flatten(b.draft));
  if (b.hooks) parts.push(b.hooks.join('\n'));
  return { role: 'assistant', content: parts.join('\n').trim() || ' ' };
}

function flatten(parts) {
  if (typeof parts === 'string') return parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((p) => (typeof p === 'string' ? p : p.code ?? p.strong ?? p.ok ?? ''))
    .join('');
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function ChatErrorBanner({ error }) {
  const lower = String(error ?? '').toLowerCase();
  const reason = lower.includes('rate limit') || lower.includes('429')
    ? { tag: 'rate limited', hint: 'Provider caps at 10 req/min. Wait ~60s.' }
    : lower.includes('401') || lower.includes('unauthor') ? { tag: 'auth', hint: 'Check ZG_ROUTER_API_KEY.' }
    : lower.includes('502') || lower.includes('503') || lower.includes('504') ? { tag: 'provider down', hint: '0G provider is unreachable — try again in a moment.' }
    : lower.includes('cooldown') ? { tag: 'cooling down', hint: 'Compute is in cooldown after a recent failure.' }
    : { tag: 'compute error', hint: null };
  return (
    <div
      style={{
        padding: '8px 12px',
        background: 'rgba(255,80,80,0.06)',
        border: '1px solid rgba(255,80,80,0.32)',
        borderRadius: 8,
        color: 'var(--red)',
        fontSize: 12,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
    >
      <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10.5, padding: '1px 6px', background: 'rgba(255,80,80,0.12)', borderRadius: 4, whiteSpace: 'nowrap' }}>
        {reason.tag}
      </span>
      <div style={{ flex: 1, color: 'var(--text-2)', lineHeight: 1.5 }}>
        <div style={{ color: 'var(--red)' }}>{error}</div>
        {reason.hint ? <div style={{ color: 'var(--text-mute)', fontSize: 11, marginTop: 2 }}>{reason.hint}</div> : null}
      </div>
    </div>
  );
}

function EmptyThread({ twin }) {
  const suggestions = [
    { text: 'tell me about Sandeep Maheshwari', kind: 'Q&A' },
    { text: 'draft a tweet about morning rituals', kind: 'Content' },
    { text: 'give me my weekly review', kind: 'Swarm' },
    { text: 'attach an image and ask: color the lizard black', kind: 'Tool' },
  ];
  return (
    <div
      style={{
        marginTop: 40,
        padding: 24,
        background: 'var(--bg)',
        border: '1px dashed var(--border)',
        borderRadius: 12,
        textAlign: 'center',
        color: 'var(--text-mute)',
      }}
    >
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}>
        Fresh thread with {twin.name}.
      </div>
      <div style={{ fontSize: 11.5, marginBottom: 16 }}>
        Ask a question, request content, or attach a file to edit.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
        {suggestions.map((s) => (
          <span
            key={s.text}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              border: '1px solid var(--border)',
              borderRadius: 999,
              color: 'var(--text-mute)',
              fontFamily: 'Geist Mono, monospace',
            }}
          >
            <span style={{ color: 'var(--peach)' }}>{s.kind}</span>
            {' · '}
            {s.text}
          </span>
        ))}
      </div>
    </div>
  );
}

// Compact status pill: dot + short label, hover for details. Replaces the
// long "online · qwen/qwen-2.5-7b-instruct · 0G advanced · live" run-on.
function ChatStatus({ mode, isStreaming }) {
  const real = mode && mode.mode && mode.mode !== 'mock';
  const dot = isStreaming ? 'var(--peach)' : real ? 'var(--mint)' : 'var(--amber)';
  const label = isStreaming
    ? 'thinking…'
    : mode?.mode === 'router' ? '0G router · live'
    : mode?.mode === 'advanced' ? '0G advanced · live'
    : mode?.mode === 'broker' ? '0G broker · live'
    : 'mock';
  const tooltip = `${mode?.model ?? 'unknown model'}${mode?.reason ? ` · ${mode.reason}` : ''}`;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title={tooltip}>
      <span style={{ color: dot }}>●</span>
      <span>{label}</span>
      {mode?.model ? (
        <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>· {mode.model.split('/').pop()}</span>
      ) : null}
    </span>
  );
}

// Pick a media tool from the USER's instruction + attachment kind.
// Called only when attachments are present, BEFORE pattern dispatch, so an
// image-edit ask doesn't get sent through visual-post (which generates a
// brand-new image instead of editing the attached one).
function detectMediaToolFromIntent(userText = '', attachments = []) {
  const text = String(userText ?? '').toLowerCase();
  const kind = attachments[0]?.kind;

  // 1. Explicit tool name in the user's message wins.
  const known = [
    'image.edit', 'image.resize', 'image.crop', 'image.format', 'image.watermark',
    'video.trim', 'video.reframe', 'video.burn_caption', 'video.audio_enhance',
    'video.scene_cuts', 'video.gif', 'video.thumbnail', 'video.compress',
    'video.probe', 'video.summarize',
  ];
  for (const t of known) if (text.includes(t)) return t;

  // 2. Verb mapping keyed by attachment kind.
  if (kind === 'image') {
    if (/\b(resize|scale|smaller|bigger|width|height)\b/.test(text)) return 'image.resize';
    if (/\b(crop|trim away|cut out)\b/.test(text)) return 'image.crop';
    if (/\b(watermark|sign|brand it)\b/.test(text)) return 'image.watermark';
    if (/\b(convert to|format|to jpg|to png|to webp|to gif)\b/.test(text)) return 'image.format';
    // Default for any other "do something to this image" ask. image.edit
    // covers color/style/object edits via Qwen image-edit-2511 (or ffmpeg
    // filter fallback).
    return 'image.edit';
  }
  if (kind === 'video') {
    if (/\b(trim|cut|clip|shorten|first \d+ seconds|last \d+ seconds)\b/.test(text)) return 'video.trim';
    if (/\b(reframe|9:16|1:1|16:9|portrait|square|landscape|aspect ratio)\b/.test(text)) return 'video.reframe';
    if (/\b(caption|subtitle|burn|burn-in)\b/.test(text)) return 'video.burn_caption';
    if (/\b(denoise|enhance audio|clean audio|loudness|normali[sz]e)\b/.test(text)) return 'video.audio_enhance';
    if (/\b(gif|animate)\b/.test(text)) return 'video.gif';
    if (/\b(thumbnail|frame at|poster|cover)\b/.test(text)) return 'video.thumbnail';
    if (/\b(compress|smaller|shrink|reduce size)\b/.test(text)) return 'video.compress';
    if (/\b(scene|cuts|chapters|edits)\b/.test(text)) return 'video.scene_cuts';
    if (/\b(summari[sz]e|describe|what(?:'s| is) in|what does this)\b/.test(text)) return 'video.summarize';
    // Default for ambiguous video ask: probe gives a safe non-destructive
    // answer; user can pick a real tool from the result.
    return 'video.probe';
  }
  if (kind === 'audio') {
    // Only one audio-relevant tool today.
    return 'video.audio_enhance';
  }
  return null;
}

async function runMediaTool(toolName, attachment, goal, setExtension) {
  // Per-tool input shape — pick sensible defaults; advanced options later.
  const mk = (extra = {}) => ({ fileUrl: attachment.url, ...extra });
  const inputs = {
    'image.edit':       mk({ instruction: goal }),
    'image.resize':     mk({ width: 1080, format: 'jpg' }),
    'image.crop':       mk({ width: 1080, height: 1080, x: 0, y: 0, format: 'jpg' }),
    'image.format':     mk({ format: 'webp' }),
    'image.watermark':  mk({ text: '2in', position: 'br', format: 'jpg' }),
    'video.trim':       mk({ startSec: 0, endSec: 30 }),
    'video.reframe':    mk({ aspect: '9:16', mode: 'crop' }),
    'video.burn_caption': mk({ caption: goal.slice(0, 80), position: 'bottom' }),
    'video.audio_enhance': mk(),
    'video.scene_cuts': mk({ threshold: 0.35 }),
    'video.gif':        mk({ startSec: 0, durationSec: 3, width: 480, fps: 12 }),
    'video.thumbnail':  mk({ atSec: 1, width: 1280, format: 'jpg' }),
    'video.compress':   mk({ crf: 28, preset: 'medium' }),
    'video.probe':      mk(),
    'video.summarize':  mk(),
  };
  const input = inputs[toolName] ?? mk();

  // Pre-render an "agent" placeholder with a live spinner while the tool runs.
  const slot = `${nowTime()}-${Math.random().toString(36).slice(2, 6)}`;
  const startedAt = Date.now();
  setExtension((ext) => [
    ...ext,
    {
      kind: 'agent',
      from: 'director',
      ts: slot,
      body: { toolRunning: { tool: toolName, startedAt } },
      __pendingTool: toolName,
    },
  ]);

  try {
    const res = await toolsApi.invoke(toolName, input);
    const out = res?.result ?? res;
    setExtension((ext) =>
      ext.map((m) =>
        m.ts === slot && m.__pendingTool === toolName
          ? {
              kind: 'agent',
              from: 'director',
              ts: slot,
              body: { toolResult: { tool: toolName, input, output: out } },
            }
          : m
      )
    );
  } catch (err) {
    setExtension((ext) =>
      ext.map((m) =>
        m.ts === slot && m.__pendingTool === toolName
          ? {
              kind: 'agent',
              from: 'director',
              ts: slot,
              body: { intro: [`${toolName} failed: ${err.message ?? 'unknown error'}`] },
            }
          : m
      )
    );
  }
}
