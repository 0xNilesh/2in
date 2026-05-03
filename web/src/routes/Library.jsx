// Library — every uploaded source + every tool-generated output that lives
// in /tmp/2in-uploads. Gallery view, grouped by date, filtered by kind.
//
// Each item: thumbnail/preview, size, mtime, kind chip, copy-URL, download,
// delete. Filter strip across the top: All · Image · Video · Audio · Other.

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader.jsx';
import { uploadApi, absolutize } from '../lib/api.js';
import { pushToast } from '../hooks/useToasts.js';

const KIND_LABEL = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  other: 'Other',
};

const KIND_COLOR = {
  image: 'var(--peach)',
  video: 'var(--mint)',
  audio: 'var(--amber)',
  other: 'var(--text-mute)',
};

export default function Library() {
  const [files, setFiles] = useState([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await uploadApi.list();
      setFiles(res.files ?? []);
      setTotalBytes(res.totalBytes ?? 0);
    } catch (err) {
      setError(err.message ?? 'load_failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => {
    const out = { all: files.length, image: 0, video: 0, audio: 0, other: 0 };
    for (const f of files) out[f.kind] = (out[f.kind] ?? 0) + 1;
    return out;
  }, [files]);

  const visible = useMemo(() => {
    return filter === 'all' ? files : files.filter((f) => f.kind === filter);
  }, [files, filter]);

  const groups = useMemo(() => groupByDay(visible), [visible]);

  const remove = async (f) => {
    try {
      await uploadApi.remove(f.name);
      setFiles((curr) => curr.filter((x) => x.name !== f.name));
      pushToast({ kind: 'success', title: 'Removed', body: f.name, ttlMs: 2000 });
    } catch (err) {
      pushToast({ kind: 'error', title: 'Remove failed', body: err.message ?? '', ttlMs: 3000 });
    }
  };

  const copyUrl = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      pushToast({ kind: 'success', title: 'URL copied', body: url, ttlMs: 1500 });
    } catch { /* ignore */ }
  };

  return (
    <>
      <PageHeader
        title="Library"
        sub={`Every upload + every tool output. ${files.length} ${files.length === 1 ? 'file' : 'files'} · ${formatBytes(totalBytes)}`}
      />
      <div className="scroll">
        <div className="page">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {[
              { id: 'all', label: 'All' },
              { id: 'image', label: 'Image' },
              { id: 'video', label: 'Video' },
              { id: 'audio', label: 'Audio' },
              { id: 'other', label: 'Other' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className="btn"
                onClick={() => setFilter(tab.id)}
                style={{
                  background: filter === tab.id ? 'var(--peach-10)' : 'transparent',
                  color: filter === tab.id ? 'var(--peach)' : 'var(--text-mute)',
                  border: filter === tab.id ? '1px solid var(--peach)' : '1px solid var(--border)',
                  padding: '6px 12px',
                  fontSize: 12,
                }}
              >
                {tab.label} <span style={{ marginLeft: 4, opacity: 0.65 }}>{counts[tab.id] ?? 0}</span>
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button
              type="button"
              className="btn"
              onClick={load}
              style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text-mute)' }}
              title="Refresh"
            >
              ↻ Refresh
            </button>
          </div>

          {loading ? <div className="card-sub">Loading…</div> : null}
          {error ? <div style={{ color: 'var(--red)' }}>{error}</div> : null}
          {!loading && visible.length === 0 ? (
            <div
              style={{
                marginTop: 24,
                padding: 32,
                background: 'var(--bg)',
                border: '1px dashed var(--border)',
                borderRadius: 10,
                fontSize: 13,
                color: 'var(--text-mute)',
                textAlign: 'center',
              }}
            >
              No {filter === 'all' ? 'files' : KIND_LABEL[filter]?.toLowerCase()} yet.
              {' '}Upload a file from any tool's <em>Try it</em> form, or run <code style={{ color: 'var(--peach)' }}>image.edit</code> / <code style={{ color: 'var(--peach)' }}>video.trim</code> from <a href="/tools" style={{ color: 'var(--peach)' }}>Tools</a>.
            </div>
          ) : null}

          {groups.map((group) => (
            <section key={group.day}>
              <div className="label-mono" style={{ margin: '18px 0 10px', color: 'var(--text-mute)' }}>
                {group.day} · {group.items.length}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                {group.items.map((f) => (
                  <FileCard key={f.name} file={f} onCopyUrl={copyUrl} onRemove={remove} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

function FileCard({ file, onCopyUrl, onRemove }) {
  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          height: 140,
          background: 'var(--bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {file.kind === 'image' ? (
          <img
            src={absolutize(file.url)}
            alt={file.name}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : file.kind === 'video' ? (
          <video
            src={absolutize(file.url)}
            preload="metadata"
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
            onMouseEnter={(e) => { e.currentTarget.play().catch(() => {}); }}
            onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
          />
        ) : file.kind === 'audio' ? (
          <div style={{ color: 'var(--amber)', fontSize: 28 }}>♪</div>
        ) : (
          <div style={{ color: 'var(--text-faint)', fontSize: 24 }}>◌</div>
        )}
        <span
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            background: 'rgba(0,0,0,0.6)',
            color: KIND_COLOR[file.kind],
            fontSize: 10,
            fontFamily: 'Geist Mono, monospace',
            padding: '2px 8px',
            borderRadius: 999,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {file.ext || file.kind}
        </span>
      </div>

      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          style={{
            fontSize: 11.5,
            fontFamily: 'Geist Mono, monospace',
            color: 'var(--text-2)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={file.name}
        >
          {file.name}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-faint)', display: 'flex', gap: 8 }}>
          <span>{formatBytes(file.sizeBytes)}</span>
          <span>·</span>
          <span>{when(file.mtime)}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <a
            className="btn"
            href={absolutize(file.url)}
            target="_blank"
            rel="noreferrer"
            style={{ padding: '4px 8px', fontSize: 10.5, flex: 1, textAlign: 'center' }}
          >
            Open
          </a>
          <a
            className="btn"
            href={absolutize(file.url)}
            download={file.name}
            style={{ padding: '4px 8px', fontSize: 10.5, flex: 1, textAlign: 'center' }}
          >
            Save
          </a>
          <button
            type="button"
            className="btn"
            onClick={() => onCopyUrl(absolutize(file.url))}
            style={{ padding: '4px 8px', fontSize: 10.5 }}
            title="Copy URL"
          >
            ⧉
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onRemove(file)}
            style={{ padding: '4px 8px', fontSize: 10.5, color: 'var(--red)' }}
            title="Delete"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function groupByDay(files) {
  const groups = new Map();
  for (const f of files) {
    const key = dayLabel(f.mtime);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  return Array.from(groups.entries()).map(([day, items]) => ({ day, items }));
}

function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const sameYesterday = d.toDateString() === yesterday.toDateString();
  if (sameDay) return 'Today';
  if (sameYesterday) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function when(ts) {
  if (!ts) return '';
  const d = Date.now() - ts;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

function formatBytes(n) {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
