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
import { getThread, defaultDirectorThreadId, threads as seedThreads } from '../data/threads.js';
import { useTwin } from '../hooks/useTwin.js';
import { useStreamingChat } from '../hooks/useStreamingChat.js';
import { ROUTES } from '../lib/routes.js';
import { taskApi, finetuneApi, memoryApi, chatApi } from '../lib/api.js';
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

  if (!threadId) {
    const fallback = defaultDirectorThreadId();
    return fallback ? <Navigate to={ROUTES.chatThread(fallback)} replace /> : <Empty twin={twin} />;
  }

  const seed = getThread(threadId);
  if (!seed) return <Empty twin={twin} />;

  return (
    <ChatBody
      key={threadId}
      threadId={threadId}
      twin={twin}
      seed={seed}
      onNewChat={() => {
        const next = seedThreads.find((t) => t.participant === 'director' && t.id !== threadId);
        if (next) nav(ROUTES.chatThread(next.id));
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

function ChatBody({ threadId, twin, seed, onNewChat, openTask }) {
  const [extension, setExtension] = useState(() => readExt()[threadId] ?? []);
  const { send, isStreaming, partial, error, taskCue } = useStreamingChat({ target: 'director' });
  const scrollRef = useRef(null);
  const lastTaskCueRef = useRef(null);
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
  useEffect(() => {
    if (!taskCue) return;
    if (lastTaskCueRef.current === taskCue) return;
    if (isStreaming) return;
    lastTaskCueRef.current = taskCue;

    (async () => {
      try {
        const goalMsg = [...allMessages].reverse().find((m) => m.kind === 'user');
        const goal = (goalMsg?.text && (Array.isArray(goalMsg.text) ? goalMsg.text.join(' ') : goalMsg.text)) ?? 'unspecified';
        const { taskId } = await taskApi.spawn(goal, twin, taskCue);
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

  const handleSend = (text) => {
    setExtension((ext) => [
      ...ext,
      { kind: 'user', text, ts: `${twin.name === '2in' ? '@you' : `@${twin.name}`} · ${nowTime()}` },
    ]);
    // Build the history we send to the model from prior assistant + user
    // turns in this thread. Keep it lean — director needs the gist, not every
    // tool message from earlier tasks.
    const history = [
      ...seed.messages
        .filter((m) => m.kind === 'user' || (m.kind === 'agent' && m.from === 'director'))
        .map((m) => toApiMessage(m)),
      ...extension
        .filter((m) => m.kind === 'user' || (m.kind === 'agent' && m.from === 'director'))
        .map((m) => toApiMessage(m)),
      { role: 'user', content: text },
    ];
    lastTaskCueRef.current = null;
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
            <span style={{ color: isStreaming ? 'var(--peach)' : mode?.mode === 'real' ? 'var(--mint)' : 'var(--amber)' }}>●</span>{' '}
            {isStreaming
              ? 'thinking…'
              : mode?.mode === 'real'
                ? `${twin.status} · master twin · ${twin.model} · 0G compute · live`
                : `${twin.status} · master twin · ${twin.model} · mock${mode?.reason ? ` · ${mode.reason.slice(0, 60)}${mode.reason.length > 60 ? '…' : ''}` : ''}`}
          </div>
        </div>
        <div className="right" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
            <div style={{ padding: '8px 12px', color: 'var(--red)', fontSize: 12.5 }}>
              {error}
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
