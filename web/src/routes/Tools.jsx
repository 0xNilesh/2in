// Runner toolbox catalog — fetched live from /api/tools so it always
// reflects the actual registry. Each tool gets a "Try it" form generated
// from its JSON Schema; submit fires POST /api/tools/:name and shows the
// result inline with a media preview when the output looks like a URL.
//
// File upload: any field whose name matches *Url / *Urls / fileUrl(s)
// renders a file picker that uploads to /api/upload and fills the URL
// into the field.

import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader.jsx';
import { StatusPill } from '../components/StatusPill.jsx';
import { toolsApi, uploadApi } from '../lib/api.js';
import {
  MAINNET_REQUIRED_TOOLS,
  MAINNET_PENDING_TOOLS,
  mainnetModelFor,
} from '../data/mainnet-tools.js';

const CATEGORY_LABELS = {
  memory: 'Memory',
  storage: 'Storage',
  compute: 'Compute',
  workflow: 'Workflow',
  media: 'Media · video + image editing',
};

const CATEGORY_ORDER = ['media', 'compute', 'workflow', 'memory', 'storage'];

export default function Tools() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    toolsApi.list()
      .then((res) => {
        if (cancelled) return;
        // Append the mainnet-pending entries so they share the same
        // category-grouped layout as the live tools. Disabled rendering
        // is handled inside ToolCard.
        setTools([...(res.tools ?? []), ...MAINNET_PENDING_TOOLS]);
      })
      .catch((err) => { if (!cancelled) setError(err.message ?? 'fetch_failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const groups = useMemo(() => {
    const out = new Map();
    const f = filter.trim().toLowerCase();
    for (const t of tools) {
      if (f && !`${t.name} ${t.description}`.toLowerCase().includes(f)) continue;
      if (!out.has(t.category)) out.set(t.category, []);
      out.get(t.category).push(t);
    }
    return out;
  }, [tools, filter]);

  const orderedGroups = useMemo(() => {
    const present = Array.from(groups.entries());
    return present.sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a[0]); const bi = CATEGORY_ORDER.indexOf(b[0]);
      const aRank = ai < 0 ? 99 : ai; const bRank = bi < 0 ? 99 : bi;
      return aRank - bRank;
    });
  }, [groups]);

  return (
    <>
      <PageHeader
        title="Tools"
        sub={`${tools.length - MAINNET_PENDING_TOOLS.length} testnet-live · ${MAINNET_PENDING_TOOLS.length + MAINNET_REQUIRED_TOOLS.size} pending mainnet provider. Image + video run via bundled ffmpeg; chat tools route through 0G compute.`}
      />
      <div className="scroll">
        <div className="page">
          <div style={{ marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              placeholder="Filter tools…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: 'var(--bg)',
                border: '1px solid var(--border-strong)',
                borderRadius: 8,
                color: 'var(--text)',
                font: 'inherit',
                fontSize: 13,
                outline: 0,
              }}
            />
          </div>

          {loading ? <div className="card-sub">Loading registry…</div> : null}
          {error ? <div style={{ color: 'var(--red)' }}>{error}</div> : null}

          {orderedGroups.map(([category, group]) => (
            <section key={category}>
              <div className="label-mono" style={{ marginBottom: 10, marginTop: 14 }}>
                {CATEGORY_LABELS[category] ?? category} · {group.length}
              </div>
              <div className="grid">
                {group.map((t) => <ToolCard key={t.name} tool={t} />)}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

function ToolCard({ tool }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [values, setValues] = useState(() => initialValuesFromSchema(tool.input));
  const [startedAt, setStartedAt] = useState(null);

  // Two disabled states share the same look:
  //   - pending: the tool doesn't exist locally; it's a mainnet-only model
  //     we'd want to expose once the provider is wired
  //   - gated: the tool exists locally but its underlying 0G compute model
  //     isn't on testnet (vision, image-gen, whisper)
  const isPending = Boolean(tool._pending);
  const isGated = !isPending && MAINNET_REQUIRED_TOOLS.has(tool.name);
  const disabled = isPending || isGated;
  const mainnetModel = isPending ? tool._model : (isGated ? mainnetModelFor(tool.name) : null);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (disabled) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    setStartedAt(Date.now());
    try {
      const out = await toolsApi.invoke(tool.name, coerceValues(values, tool.input));
      setResult(out);
    } catch (er) {
      setErr(er.message ?? 'invoke_failed');
    } finally {
      setBusy(false);
      setStartedAt(null);
    }
  };

  return (
    <div
      className="card"
      style={{
        padding: 14,
        opacity: disabled ? 0.7 : 1,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <code style={{
          background: disabled ? 'rgba(255,255,255,0.04)' : 'var(--peach-10)',
          color: disabled ? 'var(--text-mute)' : 'var(--peach)',
          padding: '2px 8px', borderRadius: 6,
          fontFamily: 'Geist Mono, monospace', fontSize: 12.5, fontWeight: 500,
        }}>{tool.name}</code>
        {disabled
          ? <StatusPill color="amber">needs 0G mainnet · soon</StatusPill>
          : <StatusPill color="mint">live</StatusPill>}
      </div>

      <div className="card-sub" style={{ marginTop: 8 }}>{tool.description}</div>

      {mainnetModel ? (
        <div style={{
          marginTop: 8,
          fontSize: 11,
          color: 'var(--text-faint)',
          fontFamily: 'Geist Mono, monospace',
          lineHeight: 1.55,
        }}>
          model · <span style={{ color: 'var(--text-mute)' }}>{mainnetModel}</span>
          {tool._pricing ? <><br/>price · {tool._pricing}</> : null}
        </div>
      ) : null}

      <button
        type="button"
        className="btn"
        style={{
          marginTop: 10,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        title={disabled ? 'Coming on 0G mainnet — provider not yet on Galileo testnet' : ''}
      >
        {disabled ? 'Try (soon)' : (open ? '— Hide' : '＋ Try it')}
      </button>

      {open && !disabled ? (
        <form onSubmit={submit} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {fieldsFromSchema(tool.input).map((f) => (
            <Field
              key={f.name}
              field={f}
              value={values[f.name] ?? (f.isArray ? [] : '')}
              onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))}
            />
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="submit" className="btn btn-peach" disabled={busy}>
              {busy ? 'invoking…' : 'Run'}
            </button>
          </div>
          {busy ? <LoadingPanel toolName={tool.name} startedAt={startedAt} /> : null}
          {err ? (
            <div style={{ marginTop: 6, color: 'var(--red)', fontSize: 12 }}>{err}</div>
          ) : null}
          {result ? <ResultView result={result} /> : null}
        </form>
      ) : null}
    </div>
  );
}

function LoadingPanel({ toolName, startedAt }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, []);
  const elapsed = startedAt ? Math.round((Date.now() - startedAt) / 100) / 10 : 0;
  // Tool-specific hint about what's happening + how long it usually takes.
  const hint = (() => {
    if (toolName === 'image.edit') return 'Calling 0G qwen-image-edit-2511 — usually 20–60s';
    if (toolName === 'video.audio_enhance') return 'Running afftdn + EBU R128 — proportional to clip length';
    if (toolName === 'video.reframe' || toolName === 'video.compress') return 'Re-encoding via ffmpeg — proportional to clip length';
    if (toolName === 'video.scene_cuts') return 'Scanning frames for scene changes';
    if (toolName === 'video.summarize') return 'Extracting midpoint frame → Qwen-VL describe';
    if (toolName.startsWith('video.')) return 'Running ffmpeg — usually a few seconds';
    if (toolName.startsWith('image.')) return 'Running ffmpeg — typically <1s';
    if (toolName === 'transcribe') return 'Transcribing audio via Whisper';
    if (toolName === 'gen_image' || toolName === 'analyze_image') return 'Calling 0G compute';
    if (toolName === 'find_clips') return 'Asking Qwen to pick high-leverage spans';
    if (toolName.startsWith('search_') || toolName.startsWith('read_') || toolName.startsWith('write_')) return 'Hitting the in-memory KV — should be instant';
    return 'Running…';
  })();
  return (
    <div
      style={{
        marginTop: 10,
        padding: 12,
        background: 'var(--bg)',
        border: '1px solid var(--peach)',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <Spinner />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--peach)', fontFamily: 'Geist Mono, monospace' }}>
          {toolName} · {elapsed.toFixed(1)}s
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-mute)', marginTop: 2 }}>
          {hint}
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: 16,
        height: 16,
        border: '2px solid rgba(255,138,91,0.25)',
        borderTopColor: 'var(--peach)',
        borderRadius: '50%',
        animation: 'tools-spin 0.8s linear infinite',
        flexShrink: 0,
      }}
    >
      <style>{'@keyframes tools-spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  );
}

function ResultView({ result }) {
  const r = result?.result ?? result;
  const url = r?.outputUrl ?? r?.url ?? null;
  const kind = url ? guessMediaKind(url) : null;
  return (
    <div style={{ marginTop: 8 }}>
      {kind === 'video' ? (
        <video src={url} controls style={{ width: '100%', maxHeight: 320, borderRadius: 8, background: 'var(--bg)' }} />
      ) : kind === 'image' ? (
        <img src={url} alt="output" style={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 8, background: 'var(--bg)' }} />
      ) : kind === 'audio' ? (
        <audio src={url} controls style={{ width: '100%' }} />
      ) : null}
      <pre style={{
        marginTop: 8,
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 10,
        fontFamily: 'Geist Mono, monospace',
        fontSize: 11,
        color: 'var(--text-2)',
        maxHeight: 240,
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}>{JSON.stringify(result, null, 2)}</pre>
      {url ? (
        <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text-faint)' }}>
          <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--peach)' }}>
            ↗ open output
          </a>
        </div>
      ) : null}
    </div>
  );
}

function guessMediaKind(url) {
  const u = url.toLowerCase();
  if (/(\.mp4|\.mov|\.webm|\.mkv)(\?|#|$)/.test(u)) return 'video';
  if (/(\.png|\.jpg|\.jpeg|\.webp|\.gif|\.bmp|\.tiff)(\?|#|$)/.test(u)) return 'image';
  if (/(\.mp3|\.wav|\.m4a|\.ogg|\.flac)(\?|#|$)/.test(u)) return 'audio';
  return null;
}

function isFileField(name) {
  return /url(s)?$/i.test(name) || /^file/i.test(name);
}

function FilePicker({ onPicked, accept, multi }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const onChange = async (e) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBusy(true); setErr(null);
    try {
      const urls = [];
      for (const f of files) {
        const res = await uploadApi.send(f);
        urls.push(res.url);
      }
      onPicked(multi ? urls : urls[0]);
    } catch (e2) {
      setErr(e2.message ?? 'upload_failed');
    } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multi}
        disabled={busy}
        onChange={onChange}
        style={{ fontSize: 11, color: 'var(--text-mute)' }}
      />
      {busy ? <span style={{ fontSize: 11, color: 'var(--peach)' }}>uploading…</span> : null}
      {err ? <span style={{ fontSize: 11, color: 'var(--red)' }}>{err}</span> : null}
    </div>
  );
}

function Field({ field, value, onChange }) {
  if (field.enum) {
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-mute)' }}>
        <span>{field.name}{field.required ? ' *' : ''}</span>
        <select
          className="onboard-input"
          style={{ padding: '8px 10px', fontSize: 13 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {field.enum.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </label>
    );
  }

  if (isFileField(field.name)) {
    const isArray = field.isArray;
    const accept = field.name.toLowerCase().includes('audio') ? 'audio/*' : '*/*';
    const display = isArray
      ? (Array.isArray(value) ? value.join('\n') : value)
      : (value ?? '');
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-mute)' }}>
        <span>{field.name}{field.required ? ' *' : ''} <code style={{ color: 'var(--text-faint)', fontSize: 11 }}>{isArray ? 'url[]' : 'url'}</code></span>
        <FilePicker
          accept={accept}
          multi={isArray}
          onPicked={(urlOrUrls) => {
            if (isArray) {
              const existing = Array.isArray(value) ? value : (value ? String(value).split('\n').filter(Boolean) : []);
              const next = [...existing, ...urlOrUrls];
              onChange(next);
            } else {
              onChange(urlOrUrls);
            }
          }}
        />
        {isArray ? (
          <textarea
            rows={3}
            value={display}
            onChange={(e) => onChange(e.target.value.split('\n').filter(Boolean))}
            placeholder="One URL per line — or upload above"
            style={{
              padding: '8px 10px', fontSize: 11.5, fontFamily: 'Geist Mono, monospace',
              background: 'var(--bg)', border: '1px solid var(--border-strong)',
              borderRadius: 8, color: 'var(--text)', outline: 0,
            }}
          />
        ) : (
          <input
            value={display}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Pasted URL — or upload above"
            style={{
              padding: '8px 10px', fontSize: 11.5, fontFamily: 'Geist Mono, monospace',
              background: 'var(--bg)', border: '1px solid var(--border-strong)',
              borderRadius: 8, color: 'var(--text)', outline: 0,
            }}
          />
        )}
        {value && !isArray && guessMediaKind(value) === 'image' ? (
          <img src={value} alt="preview" style={{ marginTop: 6, maxHeight: 100, borderRadius: 6 }} />
        ) : null}
        {value && !isArray && guessMediaKind(value) === 'video' ? (
          <video src={value} controls style={{ marginTop: 6, maxHeight: 120, borderRadius: 6 }} />
        ) : null}
      </label>
    );
  }

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-mute)' }}>
      <span>{field.name}{field.required ? ' *' : ''} <code style={{ color: 'var(--text-faint)', fontSize: 11 }}>{field.type}</code></span>
      <input
        className="onboard-input"
        style={{ padding: '8px 10px', fontSize: 13 }}
        type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'}
        placeholder={field.description ?? field.name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

// Read JSON Schema (zod-to-json-schema output) and produce a flat field list.
function fieldsFromSchema(schema) {
  if (!schema || typeof schema !== 'object') return [];
  const def = schema.properties
    ? schema
    : schema.definitions
      ? schema.definitions[Object.keys(schema.definitions)[0]]
      : null;
  if (!def) return [];
  const props = def.properties ?? {};
  const required = new Set(def.required ?? []);
  return Object.entries(props).map(([name, prop]) => ({
    name,
    type: typeOf(prop),
    enum: prop.enum,
    description: prop.description,
    required: required.has(name),
    isArray: prop.type === 'array' || (Array.isArray(prop.type) && prop.type.includes('array')),
  }));
}

function typeOf(prop) {
  if (prop.enum) return 'enum';
  if (prop.type) return Array.isArray(prop.type) ? prop.type[0] : prop.type;
  return 'string';
}

function initialValuesFromSchema(schema) {
  const out = {};
  for (const f of fieldsFromSchema(schema)) {
    if (f.isArray) out[f.name] = [];
    else if (f.type === 'number' || f.type === 'integer') out[f.name] = '';
    else out[f.name] = '';
  }
  return out;
}

// Coerce form-string values into the right JSON types based on the schema.
function coerceValues(values, schema) {
  const fields = fieldsFromSchema(schema);
  const out = {};
  for (const f of fields) {
    const raw = values[f.name];
    if (raw === '' || raw == null) continue;
    if (f.isArray) {
      const arr = Array.isArray(raw) ? raw : String(raw).split('\n').map((s) => s.trim()).filter(Boolean);
      if (arr.length > 0) out[f.name] = arr;
    } else if (f.type === 'number' || f.type === 'integer') {
      const n = Number(raw);
      if (!Number.isNaN(n)) out[f.name] = n;
    } else if (f.type === 'boolean') {
      out[f.name] = raw === 'true' || raw === true;
    } else {
      out[f.name] = raw;
    }
  }
  return out;
}
