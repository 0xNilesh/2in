// Conversational onboarding interview. Feels like chatting with the
// director — one question at a time, with chip shortcuts where useful and
// natural progression instead of a wall of fields.
//
// Each turn = an assistant question + the user's answer (text or chip
// picks). Past turns scroll above; current question is the focal point.
// Submit at the end seeds memory via /api/persona/from-questionnaire,
// then renders a summary card.
//
// Question shape:
//   { id, ask, hint?, kind, options?, max?, optional?, placeholder? }
//
// kind = 'text' | 'longtext' | 'chips' | 'chips+custom' | 'radio' | 'idols'

import { useEffect, useRef, useState } from 'react';
import { personaApi } from '../lib/api.js';

// Single source of truth — re-order or rename here, the UI follows.
const QUESTIONS = [
  {
    id: 'role',
    ask: "Hey — let's get to know you a bit. What do you do?",
    hint: "One line. Role + what you build or write about.",
    kind: 'text',
    placeholder: "YC founder building developer tools",
  },
  {
    id: 'background',
    ask: "Quick context — how'd you get here? What's your background or formative experience?",
    hint: "A sentence or two. Optional but it helps your twin sound like you.",
    kind: 'longtext',
    optional: true,
    placeholder: "Spent 8 years at infra startups before going indie. Got tired of building for VPs and started writing for engineers like me.",
  },
  {
    id: 'audience',
    ask: "Who do you write for?",
    hint: "Be specific — '25-40 technical founders' beats 'tech people'.",
    kind: 'text',
    placeholder: "technical founders 25-40, mostly second-time builders",
  },
  {
    id: 'antiAudience',
    ask: "Who do you NOT want to attract?",
    hint: "Helps the Editor catch tone drift toward the wrong crowd.",
    kind: 'text',
    optional: true,
    placeholder: "growth-hackers, people who post hustle porn",
  },
  {
    id: 'themes',
    ask: "What topics do you cover most?",
    hint: "Pick what fits, add your own. These become recurring themes the Researcher pulls from.",
    kind: 'chips+custom',
    options: ['engineering culture', 'founder rituals', 'bootstrap economics', 'product design', 'AI / ML', 'web3', 'open source', 'leadership', 'parenting', 'health'],
    max: 8,
  },
  {
    id: 'tone',
    ask: "How would a friend describe your tone?",
    hint: "Pick up to 3.",
    kind: 'chips',
    options: ['terse', 'warm', 'contrarian', 'technical', 'playful', 'philosophical', 'no hot takes', 'candid', 'self-deprecating', 'observant'],
    max: 3,
  },
  {
    id: 'sentenceLength',
    ask: "Sentence length — what feels most like you?",
    kind: 'radio',
    options: [
      { id: 'short', label: 'Short. Punchy. One line each.' },
      { id: 'mixed', label: 'Mixed — short hooks, longer thoughts.' },
      { id: 'long', label: 'Longer — comfortable with full paragraphs.' },
    ],
  },
  {
    id: 'framing',
    ask: "When you write, do you lean more on stories or principles?",
    kind: 'radio',
    options: [
      { id: 'story', label: 'Stories — I open with a moment or anecdote.' },
      { id: 'principle', label: 'Principles — I open with the claim, then defend it.' },
      { id: 'both', label: 'Both — depends on the day.' },
    ],
  },
  {
    id: 'humor',
    ask: "What about humor?",
    kind: 'radio',
    options: [
      { id: 'dry', label: 'Dry — straight-faced, occasionally pointed.' },
      { id: 'playful', label: 'Playful — lightness, the occasional wink.' },
      { id: 'edgy', label: 'Edgy — sharp, willing to make people uncomfortable.' },
      { id: 'none', label: "Skip the humor — keep it serious." },
    ],
  },
  {
    id: 'avoid',
    ask: "What would you kill from your own drafts? Things you refuse to write.",
    hint: "Editor will gate against these.",
    kind: 'chips+custom',
    options: ['hot takes', 'jargon', 'superlatives', 'politics', 'hashtags', 'self-promotion', 'humblebrags', 'engagement bait'],
    max: 8,
  },
  {
    id: 'killWords',
    ask: "Any specific words or phrases you'd cut on sight?",
    hint: "Optional. Comma-separated. Things like 'literally', 'actually', 'unlock'.",
    kind: 'text',
    optional: true,
    placeholder: "literally, actually, unlock, leverage, robust",
  },
  {
    id: 'cadence',
    ask: "Posting cadence?",
    kind: 'radio',
    options: [
      { id: 'daily', label: 'Daily — every day or close.' },
      { id: 'weekly', label: 'Weekly — a few times a week.' },
      { id: 'when-inspired', label: 'When inspired — irregular, longer gaps.' },
    ],
  },
  {
    id: 'goals',
    ask: "Why are you posting? What's the goal?",
    kind: 'chips',
    options: ['grow audience', 'share knowledge', 'land deals', 'build in public', 'recruit', 'find collaborators', 'stay visible', 'force-think out loud'],
    max: 4,
  },
  {
    id: 'idols',
    ask: "Which creators' voice do you respect most? Name 2-5 — your twin will steal a little of their style.",
    hint: "Pick the suggested ones or type your own. We extract their style as anchors for your Writer.",
    kind: 'idols',
    options: ['Naval Ravikant', 'Paul Graham', 'Sam Altman', 'Andrej Karpathy', 'Patrick Collison', 'Shaan Puri', 'David Perell', 'Jack Altman'],
    max: 5,
  },
  {
    id: 'samples',
    ask: "Paste 1-3 of your own writing snippets that feel like 'you' — past tweets, an essay opening, a DM you nailed.",
    hint: "Optional but huge. These become voice anchors the Writer reads on every draft.",
    kind: 'samples',
    optional: true,
  },
  {
    id: 'currentObsession',
    ask: "What are you obsessed with right now? What can't you stop thinking about?",
    hint: "Helps Researcher prioritize relevant context.",
    kind: 'longtext',
    optional: true,
    placeholder: "Trying to figure out why so few founders write well — and whether tooling can help.",
  },
  {
    id: 'missing',
    ask: "What do you wish more people in your space were talking about?",
    hint: "Tells Strategist where the white space is.",
    kind: 'text',
    optional: true,
    placeholder: "the boring middle 18 months of building, post-launch.",
  },
  {
    id: 'helpMost',
    ask: "Last one — what do you want this twin to help you with most?",
    kind: 'longtext',
    optional: true,
    placeholder: "Drafting tweets in my voice, faster, without losing the contrarian edge.",
  },
];

const empty = (() => {
  const o = {};
  for (const q of QUESTIONS) {
    if (q.kind === 'chips' || q.kind === 'chips+custom') o[q.id] = [];
    else if (q.kind === 'idols') o[q.id] = [];
    else if (q.kind === 'samples') o[q.id] = ['', '', ''];
    else if (q.kind === 'radio') o[q.id] = q.options[0]?.id ?? '';
    else o[q.id] = '';
  }
  return o;
})();

export function Questionnaire({ initial, onChange, onComplete }) {
  const [answers, setAnswers] = useState(() => ({ ...empty, ...(initial?.answers ?? {}) }));
  // Restore the step the user was on so a reload doesn't bump them back to
  // question 1 even though their answers are still filled in.
  const initialStep = (() => {
    const s = Number(initial?.step ?? 0);
    if (!Number.isFinite(s) || s < 0) return 0;
    return Math.min(s, QUESTIONS.length - 1);
  })();
  const [step, setStep] = useState(initialStep);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(initial?.result ?? null);
  const scrollRef = useRef(null);

  // Auto-scroll the question column to bottom on step change so the new
  // question is in view.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [step]);

  const current = QUESTIONS[step];
  const total = QUESTIONS.length;

  // Single change-emit helper so any update (answer OR step) gets persisted
  // by the parent atomically as { answers, step }.
  const emit = (nextAnswers, nextStep) => {
    onChange?.({ answers: nextAnswers, step: nextStep });
  };

  const patch = (id, v) => {
    const nextAnswers = { ...answers, [id]: v };
    setAnswers(nextAnswers);
    emit(nextAnswers, step);
  };

  const next = () => {
    if (step < total - 1) {
      const nextStep = step + 1;
      setStep(nextStep);
      emit(answers, nextStep);
    }
  };
  const back = () => {
    if (step > 0) {
      const nextStep = step - 1;
      setStep(nextStep);
      emit(answers, nextStep);
    }
  };

  const isAnswered = (q, val) => {
    if (q.optional) return true;
    if (q.kind === 'chips' || q.kind === 'chips+custom' || q.kind === 'idols') return Array.isArray(val) && val.length > 0;
    if (q.kind === 'samples') return true; // optional anyway
    if (q.kind === 'radio') return Boolean(val);
    return Boolean(String(val ?? '').trim());
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      // Map this richer questionnaire onto the backend's expected shape.
      // Extra fields are folded into the `extra` free-text field so the
      // server seeds them as `semantic` notes.
      const samples = (answers.samples ?? []).map((s) => s.trim()).filter(Boolean);
      const killWords = String(answers.killWords ?? '').trim();
      const extras = [
        answers.background ? `background: ${answers.background}` : null,
        answers.antiAudience ? `not for: ${answers.antiAudience}` : null,
        answers.sentenceLength ? `sentence length: ${answers.sentenceLength}` : null,
        answers.framing ? `framing: ${answers.framing}` : null,
        answers.humor && answers.humor !== 'none' ? `humor: ${answers.humor}` : null,
        killWords ? `kill words: ${killWords}` : null,
        answers.currentObsession ? `obsessed with: ${answers.currentObsession}` : null,
        answers.missing ? `wishes more people talked about: ${answers.missing}` : null,
        answers.helpMost ? `wants twin to help with: ${answers.helpMost}` : null,
      ].filter(Boolean).join(' · ');

      const payload = {
        role: answers.role,
        audience: answers.audience,
        themes: answers.themes,
        tone: answers.tone,
        avoid: answers.avoid,
        cadence: answers.cadence,
        goals: answers.goals,
        idols: answers.idols,
        samples,
        extra: extras || undefined,
      };
      const res = await personaApi.fromQuestionnaire(payload, { tokenId: '42' });
      setResult(res);
      onComplete?.({ answers, result: res });
    } catch (err) {
      setError(err.message ?? 'Failed to submit');
    } finally {
      setBusy(false);
    }
  };

  if (result) return <SubmittedPanel result={result} />;

  // The conversation: render previous turns + current question.
  const turns = QUESTIONS.slice(0, step + 1);

  return (
    <div className="quest-conv" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingBottom: 8,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'Geist Mono, monospace' }}>
          {step + 1} / {total}
        </span>
        <div style={{ flex: 1, height: 3, background: 'var(--bg)', borderRadius: 999, overflow: 'hidden' }}>
          <div
            style={{
              width: `${((step + 1) / total) * 100}%`,
              height: '100%',
              background: 'var(--peach)',
              transition: 'width 200ms ease',
            }}
          />
        </div>
        {current?.optional ? (
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>optional · skippable</span>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        style={{
          maxHeight: 460,
          overflowY: 'auto',
          padding: '4px 4px 4px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {turns.map((q, i) => (
          <Turn
            key={q.id}
            q={q}
            value={answers[q.id]}
            isCurrent={i === step}
            onChange={(v) => patch(q.id, v)}
          />
        ))}
      </div>

      {error ? (
        <div style={{ color: 'var(--red)', fontSize: 12, padding: '6px 10px', background: 'rgba(255,80,80,0.06)', borderRadius: 6 }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
        <button
          type="button"
          className="btn"
          onClick={back}
          disabled={step === 0 || busy}
          style={{ opacity: step === 0 ? 0.5 : 1 }}
        >
          ← Back
        </button>
        <span style={{ flex: 1, fontSize: 11, color: 'var(--text-faint)' }}>
          {step === total - 1
            ? 'Last one — submit when ready.'
            : current?.optional
            ? 'Skip if you want, or jot a quick note.'
            : 'Take your time.'}
        </span>
        {step < total - 1 ? (
          <button
            type="button"
            className="btn btn-peach"
            onClick={next}
            disabled={!isAnswered(current, answers[current.id]) || busy}
            style={{ opacity: !isAnswered(current, answers[current.id]) ? 0.55 : 1 }}
          >
            Next →
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-peach"
            onClick={submit}
            disabled={!isAnswered(QUESTIONS[0], answers[QUESTIONS[0].id]) || !isAnswered(QUESTIONS[2], answers[QUESTIONS[2].id]) || busy}
          >
            {busy ? 'Seeding memory…' : 'Seed my twin →'}
          </button>
        )}
      </div>
    </div>
  );
}

// ===================================================================
// One conversation turn: assistant question + the user's input.
// ===================================================================

function Turn({ q, value, isCurrent, onChange }) {
  const collapsed = !isCurrent;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        opacity: collapsed ? 0.6 : 1,
        transition: 'opacity 200ms ease',
      }}
    >
      <AssistantBubble text={q.ask} hint={q.hint} />
      <UserInput q={q} value={value} onChange={onChange} disabled={collapsed} />
    </div>
  );
}

function AssistantBubble({ text, hint }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: 'var(--peach-10)',
          color: 'var(--peach)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 600,
          flexShrink: 0,
          marginTop: 2,
        }}
      >P</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>{text}</div>
        {hint ? (
          <div style={{ fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.5 }}>{hint}</div>
        ) : null}
      </div>
    </div>
  );
}

function UserInput({ q, value, onChange, disabled }) {
  switch (q.kind) {
    case 'text':
      return (
        <input
          className="onboard-input"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={q.placeholder ?? ''}
          disabled={disabled}
          style={{ marginLeft: 34, maxWidth: 380 }}
        />
      );
    case 'longtext':
      return (
        <textarea
          className="onboard-input"
          rows={2}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={q.placeholder ?? ''}
          disabled={disabled}
          style={{ marginLeft: 34, maxWidth: 520, padding: '8px 10px', resize: 'vertical' }}
        />
      );
    case 'chips':
      return (
        <ChipPicker
          options={q.options}
          selected={value ?? []}
          onChange={onChange}
          max={q.max}
          disabled={disabled}
          allowCustom={false}
        />
      );
    case 'chips+custom':
      return (
        <ChipPicker
          options={q.options}
          selected={value ?? []}
          onChange={onChange}
          max={q.max}
          disabled={disabled}
          allowCustom
        />
      );
    case 'radio':
      return (
        <div style={{ marginLeft: 34, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {q.options.map((opt) => (
            <label
              key={opt.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 8,
                border: `1px solid ${value === opt.id ? 'var(--peach)' : 'var(--border)'}`,
                background: value === opt.id ? 'var(--peach-10)' : 'transparent',
                cursor: disabled ? 'default' : 'pointer',
                fontSize: 12.5,
                color: value === opt.id ? 'var(--peach)' : 'var(--text-2)',
              }}
            >
              <input
                type="radio"
                name={q.id}
                checked={value === opt.id}
                onChange={() => !disabled && onChange(opt.id)}
                disabled={disabled}
                style={{ accentColor: 'var(--peach)' }}
              />
              {opt.label}
            </label>
          ))}
        </div>
      );
    case 'idols':
      return (
        <IdolPicker
          options={q.options}
          selected={value ?? []}
          onChange={onChange}
          max={q.max}
          disabled={disabled}
        />
      );
    case 'samples':
      return (
        <div style={{ marginLeft: 34, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <textarea
              key={i}
              className="onboard-input"
              rows={2}
              placeholder={i === 0 ? "e.g. 'The opposite of discipline isn't laziness. It's drift.'" : '(optional)'}
              value={value?.[i] ?? ''}
              disabled={disabled}
              onChange={(e) => {
                const next = [...(value ?? ['', '', ''])];
                next[i] = e.target.value;
                onChange(next);
              }}
              style={{ padding: '8px 10px', resize: 'vertical', fontSize: 13 }}
            />
          ))}
        </div>
      );
    default:
      return null;
  }
}

function ChipPicker({ options, selected, onChange, max = 99, disabled, allowCustom }) {
  const [draft, setDraft] = useState('');
  const toggle = (val) => {
    if (disabled) return;
    const has = selected.includes(val);
    if (has) onChange(selected.filter((s) => s !== val));
    else if (selected.length < max) onChange([...selected, val]);
  };
  const addCustom = () => {
    const v = draft.trim();
    if (!v || disabled) return;
    if (selected.includes(v) || selected.length >= max) return;
    onChange([...selected, v]);
    setDraft('');
  };
  return (
    <div style={{ marginLeft: 34, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() => toggle(opt)}
            style={{
              fontSize: 11.5,
              padding: '4px 10px',
              borderRadius: 999,
              border: `1px solid ${on ? 'var(--peach)' : 'var(--border)'}`,
              background: on ? 'var(--peach-10)' : 'transparent',
              color: on ? 'var(--peach)' : 'var(--text-mute)',
              cursor: disabled ? 'default' : 'pointer',
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
          onClick={() => toggle(custom)}
          disabled={disabled}
          style={{
            fontSize: 11.5,
            padding: '4px 10px',
            borderRadius: 999,
            border: '1px solid var(--peach)',
            background: 'var(--peach-10)',
            color: 'var(--peach)',
            cursor: disabled ? 'default' : 'pointer',
          }}
        >✓ {custom}</button>
      ))}
      {allowCustom ? (
        <input
          className="onboard-input"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          placeholder="+ add your own"
          style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 999, minWidth: 110, maxWidth: 180 }}
        />
      ) : null}
    </div>
  );
}

function IdolPicker({ options, selected, onChange, max, disabled }) {
  const [draft, setDraft] = useState('');
  const add = (v) => {
    const trimmed = String(v).trim();
    if (!trimmed || disabled) return;
    if (selected.includes(trimmed) || selected.length >= max) return;
    onChange([...selected, trimmed]);
    setDraft('');
  };
  const remove = (v) => {
    if (disabled) return;
    onChange(selected.filter((x) => x !== v));
  };
  const free = options.filter((o) => !selected.includes(o));
  return (
    <div style={{ marginLeft: 34, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                disabled={disabled}
                onClick={() => remove(s)}
                style={{ background: 'transparent', border: 0, color: 'var(--peach)', cursor: disabled ? 'default' : 'pointer', fontSize: 12, padding: '0 4px' }}
              >✕</button>
            </span>
          ))}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="onboard-input"
          value={draft}
          disabled={disabled || selected.length >= max}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft); } }}
          placeholder={selected.length >= max ? `max ${max} reached` : 'name a creator…'}
          style={{ flex: 1, padding: '8px 10px', fontSize: 13 }}
        />
        <button
          type="button"
          className="btn"
          onClick={() => add(draft)}
          disabled={disabled || !draft.trim() || selected.length >= max}
        >+ Add</button>
      </div>
      {free.length > 0 && selected.length < max ? (
        <div style={{ fontSize: 11, color: 'var(--text-faint)', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <span style={{ marginRight: 6 }}>tap to add:</span>
          {free.map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => add(s)}
              style={{ background: 'transparent', border: 0, color: 'var(--peach)', cursor: disabled ? 'default' : 'pointer', fontSize: 11, padding: 0, marginRight: 8 }}
            >+ {s}</button>
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
        gap: 10,
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
        <div style={{ fontSize: 11.5, color: 'var(--text-mute)' }}>
          Voice anchors: {result.idolPacks.map((p) => `${p.name} (${p.count} · ${p.source})`).join(' · ')}
          {' '}— {idolTotal} style traits stored as semantic memory
        </div>
      ) : null}
      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
        Click <strong>Continue →</strong> to name your twin.
      </div>
    </div>
  );
}
