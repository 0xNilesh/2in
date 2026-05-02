// Personality questionnaire — 8 required + 2 optional questions. Submit
// → POST /api/persona/from-questionnaire → seeds memory with role / tone /
// audience / cadence / avoidances / goals / sample writing + idol traits.
//
// Used in onboarding step 1 alongside the X-archive ingest path. Gives
// users without a Twitter export a way to populate memory before their
// first chat — and crucially, idol-based voice traits give the Writer
// real style anchors without LoRA.
//
// Draft answers persisted to the parent's onboarding state under
// `questionnaire.answers` so refreshes don't blow away progress.

import { useState } from 'react';
import { personaApi } from '../lib/api.js';

const TONE_OPTIONS = [
  'terse', 'warm', 'contrarian', 'technical',
  'playful', 'philosophical', 'no hot takes', 'candid',
];
const AVOID_OPTIONS = [
  'hot takes', 'jargon', 'superlatives',
  'politics', 'hashtags', 'self-promotion',
];
const THEME_SUGGESTIONS = [
  'engineering culture', 'founder rituals', 'bootstrap economics',
  'product design', 'AI / ML', 'web3', 'open source',
  'leadership', 'parenting', 'health', 'creativity',
];
const GOAL_OPTIONS = [
  'grow audience', 'share knowledge', 'land deals',
  'build in public', 'recruit', 'find collaborators',
];
const IDOL_SUGGESTIONS = [
  'Naval Ravikant', 'Paul Graham', 'Sam Altman',
  'Andrej Karpathy', 'Patrick Collison', 'Shaan Puri',
  'David Perell', 'Jack Altman',
];

const empty = {
  role: '',
  audience: '',
  themes: [],
  tone: [],
  avoid: [],
  cadence: 'weekly',
  goals: [],
  idols: [],
  samples: ['', '', ''],
  extra: '',
};

export function Questionnaire({ initial, onChange, onComplete }) {
  const [answers, setAnswers] = useState(() => ({ ...empty, ...(initial?.answers ?? {}) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(initial?.result ?? null);

  const patch = (k, v) => {
    const next = { ...answers, [k]: v };
    setAnswers(next);
    onChange?.(next);
  };

  const toggleChip = (key, val, max = 99) => {
    const curr = answers[key] ?? [];
    const has = curr.includes(val);
    const next = has ? curr.filter((x) => x !== val) : (curr.length >= max ? curr : [...curr, val]);
    patch(key, next);
  };

  const addChip = (key, val, max = 99) => {
    const trimmed = String(val).trim();
    if (!trimmed) return;
    const curr = answers[key] ?? [];
    if (curr.includes(trimmed) || curr.length >= max) return;
    patch(key, [...curr, trimmed]);
  };

  const removeChip = (key, val) => {
    patch(key, (answers[key] ?? []).filter((x) => x !== val));
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    setError(null);
    setBusy(true);
    try {
      // Filter out empty sample slots before sending.
      const cleaned = {
        ...answers,
        samples: (answers.samples ?? []).map((s) => s.trim()).filter(Boolean),
        idols: (answers.idols ?? []).filter(Boolean),
      };
      const res = await personaApi.fromQuestionnaire(cleaned, { tokenId: '42' });
      setResult(res);
      onComplete?.({ answers: cleaned, result: res });
    } catch (err) {
      setError(err.message ?? 'Failed to submit');
    } finally {
      setBusy(false);
    }
  };

  const valid = answers.role.trim() && answers.audience.trim();

  if (result) {
    return <SubmittedPanel result={result} answers={answers} />;
  }

  return (
    <form onSubmit={submit} className="quest" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Field label="What do you do?" hint="One short sentence — role, what you build, what you're known for.">
        <input
          className="onboard-input"
          value={answers.role}
          onChange={(e) => patch('role', e.target.value)}
          placeholder="YC founder building developer tools"
          maxLength={200}
        />
      </Field>

      <Field label="Who do you write for?" hint="Your audience — be specific.">
        <input
          className="onboard-input"
          value={answers.audience}
          onChange={(e) => patch('audience', e.target.value)}
          placeholder="technical founders 25-40, mostly second-time builders"
          maxLength={200}
        />
      </Field>

      <Field label="Topics you cover" hint="Pick or add — these become your themes.">
        <ChipGroup
          options={THEME_SUGGESTIONS}
          selected={answers.themes}
          onToggle={(v) => toggleChip('themes', v, 8)}
          allowCustom
          onAddCustom={(v) => addChip('themes', v, 8)}
        />
      </Field>

      <Field label="Tone" hint="Pick up to 3.">
        <ChipGroup
          options={TONE_OPTIONS}
          selected={answers.tone}
          onToggle={(v) => toggleChip('tone', v, 3)}
        />
      </Field>

      <Field label="Things to avoid" hint="What you'd kill from your own drafts. Editor will gate these.">
        <ChipGroup
          options={AVOID_OPTIONS}
          selected={answers.avoid}
          onToggle={(v) => toggleChip('avoid', v, 8)}
          allowCustom
          onAddCustom={(v) => addChip('avoid', v, 8)}
        />
      </Field>

      <Field label="Posting cadence">
        <Radio
          name="cadence"
          value={answers.cadence}
          options={[
            { id: 'daily', label: 'Daily — every day or close' },
            { id: 'weekly', label: 'Weekly — a few times a week' },
            { id: 'when-inspired', label: 'When inspired — irregular' },
          ]}
          onChange={(v) => patch('cadence', v)}
        />
      </Field>

      <Field label="Goals" hint="Why are you doing this?">
        <ChipGroup
          options={GOAL_OPTIONS}
          selected={answers.goals}
          onToggle={(v) => toggleChip('goals', v, 4)}
        />
      </Field>

      <Field
        label="Inspirations · idols"
        hint="2-5 creators whose voice you respect — we extract their style as anchors for your Writer."
      >
        <IdolPicker
          selected={answers.idols}
          onAdd={(v) => addChip('idols', v, 5)}
          onRemove={(v) => removeChip('idols', v)}
          suggestions={IDOL_SUGGESTIONS}
        />
      </Field>

      <Field label="Sample writing" hint="Optional — paste 1-3 of your own snippets that sound like you.">
        {[0, 1, 2].map((i) => (
          <textarea
            key={i}
            className="onboard-input"
            rows={2}
            placeholder={i === 0 ? "e.g. 'The opposite of discipline isn't laziness. It's drift.'" : ''}
            value={answers.samples[i] ?? ''}
            onChange={(e) => {
              const next = [...answers.samples];
              next[i] = e.target.value;
              patch('samples', next);
            }}
            maxLength={500}
            style={{ marginTop: 6, padding: '8px 10px', resize: 'vertical' }}
          />
        ))}
      </Field>

      <Field label="Anything else?" hint="Optional — context, constraints, recent themes.">
        <textarea
          className="onboard-input"
          rows={2}
          value={answers.extra}
          onChange={(e) => patch('extra', e.target.value)}
          placeholder="Currently fundraising, no deal talk in public posts."
          maxLength={500}
          style={{ padding: '8px 10px', resize: 'vertical' }}
        />
      </Field>

      {error ? (
        <div style={{ color: 'var(--red)', fontSize: 12, padding: '6px 10px', background: 'rgba(255,80,80,0.06)', borderRadius: 6 }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
        <button
          type="submit"
          className="btn btn-peach"
          disabled={!valid || busy}
          style={{ opacity: !valid || busy ? 0.55 : 1 }}
        >
          {busy ? 'Seeding memory…' : 'Seed my twin →'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          {valid ? '~3s for whitelist idols, longer if any need Qwen extraction' : 'Fill role + audience to continue'}
        </span>
      </div>
    </form>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{label}</span>
        {hint ? <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

function ChipGroup({ options, selected, onToggle, allowCustom, onAddCustom }) {
  const [draft, setDraft] = useState('');
  const submit = (e) => {
    e?.preventDefault?.();
    if (!draft.trim()) return;
    onAddCustom?.(draft);
    setDraft('');
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            style={{
              fontSize: 11.5,
              padding: '4px 10px',
              borderRadius: 999,
              border: `1px solid ${on ? 'var(--peach)' : 'var(--border)'}`,
              background: on ? 'var(--peach-10)' : 'transparent',
              color: on ? 'var(--peach)' : 'var(--text-mute)',
              cursor: 'pointer',
            }}
          >
            {on ? '✓ ' : '+ '}{opt}
          </button>
        );
      })}
      {selected.filter((s) => !options.includes(s)).map((custom) => (
        <button
          key={`custom-${custom}`}
          type="button"
          onClick={() => onToggle(custom)}
          style={{
            fontSize: 11.5,
            padding: '4px 10px',
            borderRadius: 999,
            border: '1px solid var(--peach)',
            background: 'var(--peach-10)',
            color: 'var(--peach)',
            cursor: 'pointer',
          }}
        >✓ {custom}</button>
      ))}
      {allowCustom ? (
        <span onSubmit={submit} style={{ display: 'inline-flex', gap: 4 }}>
          <input
            className="onboard-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(e); } }}
            placeholder="+ add custom"
            style={{
              fontSize: 11.5,
              padding: '4px 10px',
              borderRadius: 999,
              minWidth: 110,
              maxWidth: 180,
            }}
          />
        </span>
      ) : null}
    </div>
  );
}

function Radio({ name, value, options, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {options.map((opt) => (
        <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, color: 'var(--text-2)' }}>
          <input
            type="radio"
            name={name}
            checked={value === opt.id}
            onChange={() => onChange(opt.id)}
            style={{ accentColor: 'var(--peach)' }}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

function IdolPicker({ selected, onAdd, onRemove, suggestions }) {
  const [draft, setDraft] = useState('');
  const submit = () => {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft('');
  };
  const free = suggestions.filter((s) => !selected.includes(s));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="onboard-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          placeholder="Naval Ravikant"
          style={{ flex: 1, padding: '8px 10px', fontSize: 13 }}
        />
        <button type="button" className="btn" onClick={submit} disabled={!draft.trim() || selected.length >= 5}>
          + Add
        </button>
      </div>
      {selected.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {selected.map((s) => (
            <span
              key={s}
              style={{
                fontSize: 11.5,
                padding: '4px 4px 4px 10px',
                borderRadius: 999,
                background: 'var(--peach-10)',
                color: 'var(--peach)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {s}
              <button
                type="button"
                onClick={() => onRemove(s)}
                style={{ background: 'transparent', border: 0, color: 'var(--peach)', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}
              >✕</button>
            </span>
          ))}
        </div>
      ) : null}
      {free.length > 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          Suggestions:{' '}
          {free.slice(0, 6).map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => onAdd(s)}
              disabled={selected.length >= 5}
              style={{ background: 'transparent', border: 0, color: 'var(--peach)', cursor: 'pointer', fontSize: 11, padding: 0, marginRight: 8 }}
            >+ {s}{i < Math.min(5, free.length - 1) ? '' : ''}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SubmittedPanel({ result }) {
  const total = Object.values(result.seeded ?? {}).reduce((a, b) => a + b, 0);
  const idolTotal = (result.idolPacks ?? []).reduce((a, p) => a + p.count, 0);
  return (
    <div
      style={{
        padding: 16,
        background: 'var(--bg)',
        border: '1px solid var(--mint)',
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 13, color: 'var(--mint)' }}>
        ✓ Memory seeded · {total} entries
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {Object.entries(result.seeded ?? {}).map(([type, n]) => n > 0 ? (
          <span key={type} style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--border)', color: 'var(--text-2)', fontFamily: 'Geist Mono, monospace' }}>
            {type} · {n}
          </span>
        ) : null)}
      </div>
      {(result.idolPacks ?? []).length > 0 ? (
        <div style={{ fontSize: 11.5, color: 'var(--text-mute)', marginTop: 4 }}>
          Idol traits: {result.idolPacks.map((p) => `${p.name} (${p.count} · ${p.source})`).join(' · ')}
          {' '}— {idolTotal} style anchors stored as semantic memory
        </div>
      ) : null}
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
        Click <strong>Continue →</strong> to name your twin.
      </div>
    </div>
  );
}
