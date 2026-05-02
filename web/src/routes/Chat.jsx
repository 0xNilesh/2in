// Chat with the user's twin (director) — multi-thread, real streaming.
//   /chat                       → redirects to the latest thread
//   /chat/:threadId             → renders that thread + live extension
//   ?task=<taskId> in URL       → WorkPane mounts at right (handled by AppShell)
//
// Each thread has a seed message list in data/threads.js. Messages the user
// sends *after* loading the thread live in component state (keyed by threadId
// in localStorage, so they survive page navigation within the session).

import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useSearchParams, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { Composer } from '../components/Composer.jsx';
import { Message } from '../components/Message.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { useTwin } from '../hooks/useTwin.js';
import { useStreamingChat } from '../hooks/useStreamingChat.js';
import { useThreads, getThreadSync, deriveTitle } from '../hooks/useThreads.js';
import { ROUTES } from '../lib/routes.js';
import { taskApi, finetuneApi, memoryApi, chatApi, toolsApi } from '../lib/api.js';
import { specialists as rosterSpecialists } from '../data/specialists.js';
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
  const nav = useNavigate();
  const loc = useLocation();
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

  // Auto-scroll to the bottom on new content.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [extension, partial]);

  const allMessages = useMemo(() => [...seed.messages, ...extension], [seed.messages, extension]);

  // When streaming finishes, commit the partial as a message.
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
    // Clear the partial cache by sending a new empty stream is overkill;
    // instead the next send() resets it. But to avoid double-commit we use
    // a guard: clear local copy of partial via a ref.
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

    (async () => {
      try {
        const goalMsg = [...allMessages].reverse().find((m) => m.kind === 'user');
        const goal = (goalMsg?.text && (Array.isArray(goalMsg.text) ? goalMsg.text.join(' ') : goalMsg.text)) ?? 'unspecified';
        const attachments = pendingAttachmentsRef.current ?? [];
        pendingAttachmentsRef.current = [];

        // Check if director named a media tool we can invoke directly.
        const toolName = detectMediaTool(taskCue, partial, attachments);
        if (toolName && attachments.length > 0) {
          await runMediaTool(toolName, attachments[0], goal, setExtension);
          return;
        }

        // Else: normal pattern dispatch.
        const explicitPattern = taskCue === '__auto__' ? undefined : taskCue;
        const { taskId } = await taskApi.spawn(goal, twin, explicitPattern);
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
        console.error('spawn task / tool run failed', err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, taskCue]);

  // Director fine-tune banner — surface when the corpus crosses threshold
  // and the writer specialist (Quill) has no adapter yet. Dismissible.
  const corpus = readCorpus();
  const corpusSize = corpus?.tweets?.length ?? 0;
  const quill = rosterSpecialists.find((s) => s.id === 'quill');
  const adapterMissing = !quill?.adapterURI;
  const dismissedKey = '2in:banner:dismissed:quill';
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    try { return Boolean(window.localStorage.getItem(dismissedKey)); }
    catch { return false; }
  });
  const showBanner = corpusSize >= BANNER_THRESHOLD && adapterMissing && !bannerDismissed;
  const dismissBanner = () => {
    try { window.localStorage.setItem(dismissedKey, '1'); } catch {}
    setBannerDismissed(true);
  };
  const trainQuill = async () => {
    try {
      const job = await finetuneApi.start('quill', {
        baseModel: 'Qwen2.5-0.5B-Instruct',
        datasetUri: corpus?.rootHash ?? '0g://corpus/twitter',
      });
      // Replace ?task with ?finetune so the FineTunePane mounts.
      nav(`${loc.pathname}?finetune=${encodeURIComponent(job.id)}`, { replace: true });
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err.message ?? 'training_start_failed');
    }
  };

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
    send(history, { twin });
  };

  return (
    <>
      <header className="chat-head">
        <Avatar initial={twin.name?.[0]?.toUpperCase() ?? '2'} variant="dir" size="md" />
        <div className="meta">
          <div className="name">
            {twin.name} <span style={{ color: 'var(--text-faint)' }}>·</span> {seed.title}
          </div>
          <div className="sub">
            <span style={{ color: isStreaming ? 'var(--peach)' : mode && mode.mode !== 'mock' ? 'var(--mint)' : 'var(--amber)' }}>●</span>{' '}
            {isStreaming
              ? 'thinking…'
              : mode?.mode === 'router'
                ? `${twin.status} · ${mode.model ?? twin.model} · 0G router · live`
                : mode?.mode === 'advanced'
                  ? `${twin.status} · ${mode.model ?? twin.model} · 0G advanced · live`
                  : mode?.mode === 'broker'
                    ? `${twin.status} · ${mode.model ?? twin.model} · 0G broker · live`
                    : `${twin.status} · ${mode?.model ?? twin.model} · mock${mode?.reason ? ` · ${mode.reason.slice(0, 60)}${mode.reason.length > 60 ? '…' : ''}` : ''}`}
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
          {showBanner ? (
            <div
              style={{
                padding: '14px 16px',
                background: 'var(--peach-04)',
                border: '1px solid var(--peach)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: 'Geist Mono, monospace',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--peach)',
                  }}
                >
                  {twin.name} · suggestion
                </div>
                <div style={{ marginTop: 6, color: 'var(--text)', fontSize: 14 }}>
                  Quill is ready to be trained on {corpusSize} new tweets.
                  Train now to lock in your voice as a LoRA adapter.
                </div>
                <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--text-mute)' }}>
                  cost · 0.5 0G  ·  ~30 min  ·  Qwen2.5-0.5B-Instruct base
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-peach" onClick={trainQuill}>Train Quill →</button>
                <button className="btn btn-ghost" onClick={dismissBanner}>Later</button>
              </div>
            </div>
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
          {error ? (
            <div
              style={{
                padding: '12px 14px',
                background: 'rgba(255,80,80,0.06)',
                border: '1px solid rgba(255,80,80,0.32)',
                borderRadius: 10,
                color: 'var(--red)',
                fontSize: 12.5,
                lineHeight: 1.5,
              }}
            >
              <strong>0G compute call failed.</strong> {error}
              {error.toLowerCase().includes('rate limit') ? (
                <div style={{ marginTop: 6, color: 'var(--text-mute)' }}>
                  The provider caps you at 10 req/min. Wait ~60s and retry.
                </div>
              ) : null}
            </div>
          ) : null}
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

// Detect a media tool name in the director's reply. Tries explicit names
// first, then falls back to verb-based heuristics keyed off the attachment
// kind (image vs video vs audio).
function detectMediaTool(_cue, replyText = '', attachments = []) {
  const text = String(replyText ?? '').toLowerCase();
  const known = [
    'image.edit', 'image.resize', 'image.crop', 'image.format', 'image.watermark',
    'video.trim', 'video.reframe', 'video.burn_caption', 'video.audio_enhance',
    'video.scene_cuts', 'video.gif', 'video.thumbnail', 'video.compress',
    'video.probe', 'video.summarize',
  ];
  for (const t of known) if (text.includes(t)) return t;

  // Verb fallback — only if attachment kind matches.
  const kind = attachments[0]?.kind;
  if (kind === 'image') {
    if (/\b(edit|color|colour|recolor|paint|change|make it|turn it|black and white|grayscale|invert|warmer|cooler|brighter|darker|saturate|desaturate)\b/.test(text)) return 'image.edit';
    if (/\b(resize|scale)\b/.test(text)) return 'image.resize';
    if (/\b(crop|trim)\b/.test(text)) return 'image.crop';
    if (/\b(watermark|sign|brand)\b/.test(text)) return 'image.watermark';
    if (/\b(convert|format|jpg|png|webp)\b/.test(text)) return 'image.format';
  }
  if (kind === 'video') {
    if (/\b(trim|cut|clip|shorten)\b/.test(text)) return 'video.trim';
    if (/\b(reframe|9:16|1:1|portrait|square|landscape|aspect)\b/.test(text)) return 'video.reframe';
    if (/\b(caption|subtitle|burn)\b/.test(text)) return 'video.burn_caption';
    if (/\b(denoise|enhance audio|loudness|normali[sz]e)\b/.test(text)) return 'video.audio_enhance';
    if (/\b(gif)\b/.test(text)) return 'video.gif';
    if (/\b(thumbnail|frame|poster)\b/.test(text)) return 'video.thumbnail';
    if (/\b(compress|smaller|shrink)\b/.test(text)) return 'video.compress';
    if (/\b(scene|cuts|chapter)\b/.test(text)) return 'video.scene_cuts';
    if (/\b(summari[sz]e|describe|what.*in)\b/.test(text)) return 'video.summarize';
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

  // Pre-render an "agent" placeholder while the tool runs.
  const slot = nowTime();
  setExtension((ext) => [
    ...ext,
    {
      kind: 'agent',
      from: 'director',
      ts: slot,
      body: { intro: [`Running ${toolName} on your attachment…`] },
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
              body: {
                intro: [`Done — ${toolName}`],
                toolResult: { tool: toolName, input, output: out },
              },
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
