// Runner toolbox catalog — fetched live from /api/tools so it always
// reflects the actual registry. Each tool gets a "Try it" form generated
// from its JSON Schema; submit fires POST /api/tools/:name and shows the
// result inline.

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader.jsx';
import { StatusPill } from '../components/StatusPill.jsx';
import { toolsApi } from '../lib/api.js';

const CATEGORY_LABELS = {
  memory: 'Memory',
  storage: 'Storage',
  compute: 'Compute',
  workflow: 'Workflow',
};

export default function Tools() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    toolsApi.list()
      .then((res) => { if (!cancelled) setTools(res.tools ?? []); })
      .catch((err) => { if (!cancelled) setError(err.message ?? 'fetch_failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const groups = useMemo(() => {
    const out = new Map();
    for (const t of tools) {
      if (!out.has(t.category)) out.set(t.category, []);
      out.get(t.category).push(t);
    }
    return out;
  }, [tools]);

  return (
    <>
      <PageHeader
        title="Tools"
        sub="Native primitives Runner composes per goal. Each is a typed function with a zod schema. Live registry."
      />
      <div className="scroll">
        <div className="page">
          {loading ? <div className="card-sub">Loading registry…</div> : null}
          {error ? <div style={{ color: 'var(--red)' }}>{error}</div> : null}

          {Array.from(groups.entries()).map(([category, group]) => (
            <section key={category}>
              <div className="label-mono" style={{ marginBottom: 10, marginTop: 10 }}>
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

  const submit = async (e) => {
    e?.preventDefault?.();
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const out = await toolsApi.invoke(tool.name, coerceValues(values, tool.input));
      setResult(out);
    } catch (er) {
      setErr(er.message ?? 'invoke_failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <code style={{
          background: 'var(--peach-10)', color: 'var(--peach)',
          padding: '2px 8px', borderRadius: 6,
          fontFamily: 'Geist Mono, monospace', fontSize: 12.5, fontWeight: 500,
        }}>{tool.name}</code>
        <StatusPill color="mint">live</StatusPill>
      </div>

      <div className="card-sub" style={{ marginTop: 8 }}>{tool.description}</div>

      <button
        type="button"
        className="btn"
        style={{ marginTop: 10 }}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? '— Hide' : '＋ Try it'}
      </button>

      {open ? (
        <form onSubmit={submit} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {fieldsFromSchema(tool.input).map((f) => (
            <Field
              key={f.name}
              field={f}
              value={values[f.name] ?? ''}
              onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))}
            />
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="submit" className="btn btn-peach" disabled={busy}>
              {busy ? 'invoking…' : 'Run'}
            </button>
          </div>
          {err ? (
            <div style={{ marginTop: 6, color: 'var(--red)', fontSize: 12 }}>{err}</div>
          ) : null}
          {result ? (
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
          ) : null}
        </form>
      ) : null}
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
  // zod-to-json-schema wraps the type behind a $ref + definitions block.
  // Resolve the first definition for properties + required.
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
    if (f.type === 'number' || f.type === 'integer') out[f.name] = '';
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
    if (f.type === 'number' || f.type === 'integer') {
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
