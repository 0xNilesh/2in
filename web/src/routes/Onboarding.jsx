// Five-step onboarding wizard.
//
//   0 connect — Privy login (wallet / email). Mandatory.
//   1 ingest  — Pick a social platform. Five shown (X, IG, TikTok, YouTube,
//               LinkedIn) — only X is enabled this version; others are coming
//               soon. The X card has two paths:
//                 (a) drop your tweets.js (from your Twitter archive download)
//                 (b) one-click "Use demo tweets" — pre-loaded sample so judges
//                     can experience the full flow on the deployed URL.
//               At least one platform must be connected to advance.
//   2 name    — what to call the director twin (writes to localStorage)
//   3 mint    — reveal sequence (mocked; backed by 0G in production)
//   4 ready   — done; lands user in /chat
//
// Onboarding state is persisted in sessionStorage so reloads don't blow it away.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../lib/routes.js';
import { useTwin } from '../hooks/useTwin.js';
import { useAuth } from '../hooks/useAuth.js';
import { useOnboardingState } from '../hooks/useOnboardingState.js';
import { tweetsFromFile, TweetsJsParseError } from '../lib/twitter-archive.js';
import { demoTweets, demoTwitterAccount } from '../data/demo-tweets.js';
import { StatusPill } from '../components/StatusPill.jsx';
import { SocialIcon } from '../components/SocialIcon.jsx';
import { personaApi, storageApi } from '../lib/api.js';
import { Questionnaire } from '../components/Questionnaire.jsx';
import { useMintRoster } from '../hooks/useMintRoster.js';
import { isChainConfigured } from '../lib/chain.js';
import { useViemWalletClient } from '../lib/privy-signer.js';

const STEPS = ['connect', 'ingest', 'name', 'mint', 'ready'];

export default function Onboarding() {
  const [state, update, reset] = useOnboardingState();
  const [, setTwin] = useTwin();
  const auth = useAuth();
  const nav = useNavigate();

  const next = () => update({ step: Math.min(state.step + 1, STEPS.length - 1) });
  const back = () => update({ step: Math.max(state.step - 1, 0) });

  const finish = () => {
    setTwin({
      name: state.twinName.trim() || '2in',
      twitterHandle: state.twitter?.handle ?? null,
      walletAddress: auth.address ?? null,
    });
    reset();
    nav(ROUTES.chat);
  };

  const canContinue = (() => {
    if (state.step === 0) return auth.authenticated;
    // step 1: either a social platform is connected OR the questionnaire was submitted
    if (state.step === 1) return Boolean(state.twitter?.handle) || Boolean(state.questionnaire?.completed);
    if (state.step === 2) return Boolean(state.twinName.trim());
    return true;
  })();

  return (
    <div className="onboard">
      <nav className="onboard-nav">
        <div className="brand">2<em>in</em></div>
        <a className="skip" onClick={() => nav(ROUTES.chat)} style={{ cursor: 'pointer' }}>
          Skip · land in chat →
        </a>
      </nav>

      <div className="onboard-progress">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`onboard-dot${i < state.step ? ' done' : ''}${i === state.step ? ' current' : ''}`}
          />
        ))}
      </div>

      <div className="onboard-card">
        {state.step === 0 && <Connect auth={auth} />}
        {state.step === 1 && <Ingest state={state} update={update} />}
        {state.step === 2 && (
          <Name
            twinName={state.twinName}
            setTwinName={(v) => update({ twinName: v })}
            twitter={state.twitter}
          />
        )}
        {state.step === 3 && (
          <Mint
            twinName={state.twinName}
            twitter={state.twitter}
            walletAddress={auth.address}
          />
        )}
        {state.step === 4 && <Ready twinName={state.twinName} />}

        <div className="onboard-actions">
          {state.step > 0 && state.step < STEPS.length - 1 ? (
            <button className="btn-secondary" onClick={back}>← Back</button>
          ) : <span />}

          {state.step < STEPS.length - 1 ? (
            <button
              className="btn-cta"
              onClick={next}
              disabled={!canContinue}
              style={{
                opacity: canContinue ? 1 : 0.5,
                pointerEvents: canContinue ? 'auto' : 'none',
              }}
            >
              Continue →
            </button>
          ) : (
            <button className="btn-cta" onClick={finish}>
              Land in chat with {state.twinName || '2in'} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Connect({ auth }) {
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
  return (
    <>
      <div className="onboard-eyebrow">step 1 of 5</div>
      <h2 className="onboard-title">Connect your wallet.</h2>
      <p className="onboard-sub">
        We mint your twin under your wallet. You own every iNFT we create —
        transfer them, delegate them, retire them whenever you want.
      </p>

      {!auth.configured ? (
        <div className="onboard-form">
          <div className="oauth-btn" style={{ borderColor: 'var(--amber)', cursor: 'default' }}>
            <span className="ic">!</span>
            <span style={{ flex: 1, textAlign: 'left' }}>
              <div>Privy not configured</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                Set <code>VITE_PRIVY_APP_ID</code> in <code>web/.env</code> and restart.
              </div>
            </span>
          </div>
        </div>
      ) : auth.authenticated ? (
        <div className="onboard-form">
          <div className="oauth-btn" style={{ borderColor: 'var(--mint)', cursor: 'default' }}>
            <span className="ic">⛓</span>
            <span style={{ flex: 1, textAlign: 'left' }}>
              <div>Connected · {short(auth.address)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                Privy {auth.user?.email?.address ? `· ${auth.user.email.address}` : ''}
              </div>
            </span>
            <StatusPill color="mint">connected</StatusPill>
          </div>
          <button className="btn-secondary" onClick={auth.logout} style={{ alignSelf: 'flex-start' }}>
            Disconnect
          </button>
        </div>
      ) : (
        <div className="onboard-form">
          <button className="oauth-btn" onClick={auth.login}>
            <span className="ic">⛓</span>
            <span style={{ flex: 1, textAlign: 'left' }}>
              <div>Connect with Privy</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                Wallet · email · embedded wallets for non-crypto users
              </div>
            </span>
            <span style={{ fontSize: 11, color: 'var(--peach)' }}>connect</span>
          </button>
        </div>
      )}
    </>
  );
}

const PLATFORMS = [
  { id: 'x',  name: 'X (Twitter)',  iconClass: 'x',  sub: 'tweets feed the Writer',          enabled: true  },
  { id: 'ig', name: 'Instagram',    iconClass: 'ig', sub: 'captions feed the Writer',        enabled: false },
  { id: 'tt', name: 'TikTok',       iconClass: 'tt', sub: 'video transcripts feed the Voice', enabled: false },
  { id: 'yt', name: 'YouTube',      iconClass: 'yt', sub: 'transcripts feed the Voice',      enabled: false },
  { id: 'li', name: 'LinkedIn',     iconClass: 'li', sub: 'long-form feeds the Writer',      enabled: false },
];

function Ingest({ state, update }) {
  const [expanded, setExpanded] = useState(() => {
    if (state.twitter?.handle || state.questionnaire?.completed) return null;
    return 'questionnaire';
  });
  const t = state.twitter;
  const connected = Boolean(t?.handle);
  const questionnaireDone = Boolean(state.questionnaire?.completed);

  return (
    <>
      <div className="onboard-eyebrow">step 2 of 5</div>
      <h2 className="onboard-title">Show us your voice.</h2>
      <p className="onboard-sub">
        Pick the path that's quickest for you — fill the personality questionnaire
        OR drop your X archive. Either populates your twin's memory before the
        first chat. Read-only. We never publish.
      </p>

      {/* Questionnaire — recommended primary path. */}
      <div
        className={`social-card${questionnaireDone ? ' connected' : ''}${expanded === 'questionnaire' ? ' expanded' : ''}`}
        onClick={questionnaireDone || expanded === 'questionnaire' ? undefined : () => setExpanded('questionnaire')}
        style={{ marginBottom: 12 }}
      >
        <div className="social-card-head">
          <div className="social-icon" style={{ background: 'var(--peach-10)', color: 'var(--peach)' }}>✦</div>
          <div className="social-meta">
            <div className="social-name">
              {questionnaireDone ? 'Questionnaire complete' : 'Quick questionnaire'}
            </div>
            <div className="social-sub">
              {questionnaireDone
                ? `seeded ${Object.values(state.questionnaire.result?.seeded ?? {}).reduce((a, b) => a + b, 0)} entries · `
                  + `${(state.questionnaire.result?.idolPacks ?? []).length} idol packs`
                : '~3 min · 8 questions + your idols → seeds memory across all 6 types'}
            </div>
          </div>
          {questionnaireDone ? (
            <span className="social-pill connected">connected</span>
          ) : (
            <span className="social-pill" style={{ background: 'var(--peach-10)', color: 'var(--peach)' }}>recommended</span>
          )}
        </div>

        {expanded === 'questionnaire' && !questionnaireDone ? (
          <div className="social-card-body" style={{ paddingTop: 0 }}>
            <Questionnaire
              initial={state.questionnaire ?? undefined}
              onChange={(answers) => update({
                questionnaire: { ...(state.questionnaire ?? {}), answers, completed: false },
              })}
              onComplete={({ answers, result }) => update({
                questionnaire: { answers, result, completed: true },
              })}
            />
          </div>
        ) : null}
      </div>

      <div className="social-grid">
        {PLATFORMS.map((p) => {
          const isConnected = p.id === 'x' && connected;
          const isExpanded = expanded === p.id;
          if (p.id === 'x') {
            return (
              <div
                key={p.id}
                className={`social-card${isConnected ? ' connected' : ''}${isExpanded ? ' expanded' : ''}`}
                onClick={isConnected || isExpanded ? undefined : () => setExpanded(p.id)}
              >
                <div className="social-card-head">
                  <div className={`social-icon ${p.iconClass}`}><SocialIcon platform={p.id} size={18} /></div>
                  <div className="social-meta">
                    <div className="social-name">{isConnected ? `@${t.handle}` : p.name}</div>
                    <div className="social-sub">
                      {isConnected
                        ? `${t.tweets?.length ?? 0} tweets pulled · trains Writer`
                        : p.sub}
                    </div>
                  </div>
                  {isConnected ? (
                    <span className="social-pill connected">connected</span>
                  ) : (
                    <span className="social-pill required">required</span>
                  )}
                </div>

                {isExpanded && !isConnected ? (
                  <XConnectBody update={update} />
                ) : null}
              </div>
            );
          }
          return (
            <div key={p.id} className="social-card disabled">
              <div className={`social-icon ${p.iconClass}`}><SocialIcon platform={p.id} size={18} /></div>
              <div className="social-meta">
                <div className="social-name">{p.name}</div>
                <div className="social-sub">{p.sub}</div>
              </div>
              <span className="social-pill coming">coming soon</span>
            </div>
          );
        })}
      </div>

      {connected && t.tweets?.length ? <PersonaPreview t={t} /> : null}
    </>
  );
}

function XConnectBody({ update }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const ingestTweets = async (tweets, source) => {
    const handle =
      source === 'demo' ? demoTwitterAccount.handle : 'your-archive';
    const account =
      source === 'demo'
        ? demoTwitterAccount
        : { handle, name: handle, userId: '0', stats: { tweetCount: tweets.length } };

    // Initial state — show what we have immediately while persona extraction
    // and storage upload run in the background.
    update({
      twitter: {
        ...account,
        tweets,
        source,
        persona: null,
        corpus: null,
        analyzing: true,
      },
    });

    try {
      window.localStorage.setItem(
        '2in:corpus:twitter',
        JSON.stringify({ handle, tweets, source }),
      );
    } catch {}

    // Upload corpus + extract persona in parallel — both call the server.
    const [corpusRes, personaRes] = await Promise.allSettled([
      storageApi.upload(JSON.stringify({ handle, tweets, source })),
      personaApi.extract(tweets, { name: handle }),
    ]);

    update({
      twitter: {
        ...account,
        tweets,
        source,
        analyzing: false,
        corpus: corpusRes.status === 'fulfilled' ? corpusRes.value : null,
        persona: personaRes.status === 'fulfilled' ? personaRes.value.persona : null,
        personaError: personaRes.status === 'rejected' ? personaRes.reason?.message : null,
      },
    });
  };

  const handleFile = async (file) => {
    setError(null);
    setBusy(true);
    try {
      const tweets = await tweetsFromFile(file);
      if (!tweets.length) {
        throw new TweetsJsParseError('No tweets found after filtering retweets/replies.');
      }
      await ingestTweets(tweets, 'archive');
    } catch (err) {
      setError(err.message ?? 'Failed to parse tweets.js');
    } finally {
      setBusy(false);
    }
  };

  const onPick = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const useDemo = () => {
    setError(null);
    void ingestTweets(demoTweets, 'demo');
  };

  return (
    <div className="social-card-body">
      <div
        className={`drop-zone${dragging ? ' dragging' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className="dz-icon">↑</div>
        <div className="dz-title">
          {busy ? 'parsing…' : 'Drop your tweets.js · or click to browse'}
        </div>
        <div className="dz-sub">
          from your Twitter archive · data/tweets.js
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".js,application/javascript,text/javascript"
          style={{ display: 'none' }}
          onChange={onPick}
        />
      </div>

      {error ? <div className="parse-error">{error}</div> : null}

      <div className="split-divider">or for the demo</div>

      <div className="demo-row">
        <div className="dr-icon">★</div>
        <div className="grow">
          <div className="dr-title">Use demo tweets</div>
          <div className="dr-sub">
            25 sample tweets · pre-loaded so judges can run the full flow without their own data
          </div>
        </div>
        <button className="btn btn-peach" onClick={useDemo}>
          Load demo →
        </button>
      </div>

      <details style={{ marginTop: 4 }}>
        <summary
          style={{
            fontSize: 11.5,
            color: 'var(--text-faint)',
            cursor: 'pointer',
            fontFamily: 'Geist Mono, monospace',
          }}
        >
          how do I get tweets.js?
        </summary>
        <div
          style={{
            marginTop: 6, fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.55,
          }}
        >
          On X: <strong>Settings → Your account → Download an archive of your data</strong>.
          Twitter emails you a zip in 24–48h. Unzip → <code style={{ color: 'var(--peach)' }}>data/tweets.js</code>{' '}
          (or <code style={{ color: 'var(--peach)' }}>tweets-part1.js</code> if your account is large).
          Drop it above. Reading the user's own tweets via the API requires the
          paid Basic tier ($100/mo); the archive download is free.
        </div>
      </details>
    </div>
  );
}

function PersonaPreview({ t }) {
  const persona = t.persona;
  const style = persona?.style;

  return (
    <>
      <div className="persona-grid">
        <div className="persona-cell">
          <div className="k">handle</div>
          <div className="v">@{t.handle}</div>
        </div>
        <div className="persona-cell">
          <div className="k">tweets pulled</div>
          <div className="v">{t.tweets?.length ?? 0} recent</div>
        </div>
        <div className="persona-cell">
          <div className="k">avg length</div>
          <div className="v">{style?.avgLength ?? '—'} chars</div>
        </div>
        <div className="persona-cell">
          <div className="k">case style</div>
          <div className="v">{style?.caseStyle ?? '—'}</div>
        </div>
      </div>

      {t.analyzing ? (
        <div
          style={{
            marginTop: 18,
            padding: 14,
            background: 'var(--peach-04)',
            border: '1px solid var(--peach)',
            borderRadius: 10,
            fontSize: 12.5,
            color: 'var(--text)',
          }}
        >
          <div
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--peach)',
              marginBottom: 6,
            }}
          >
            extracting persona
          </div>
          <div>
            Computing voice profile · seeding voice_memory · uploading corpus to 0G Storage…
          </div>
        </div>
      ) : null}

      {persona ? (
        <>
          <div style={{ marginTop: 18 }}>
            <div
              style={{
                fontFamily: 'Geist Mono, monospace',
                fontSize: 10,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--text-faint)',
                marginBottom: 8,
              }}
            >
              Voice profile
              {persona.voice.generatedBy === 'mock' ? ' · statistical (mock)' : ' · LLM synthesis'}
            </div>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {persona.voice.bullets.map((b, i) => (
                <li
                  key={i}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 13,
                    color: 'var(--text)',
                    display: 'flex',
                    gap: 10,
                  }}
                >
                  <span style={{ color: 'var(--peach)', fontFamily: 'Geist Mono, monospace' }}>·</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          {persona.themes?.length ? (
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 10,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--text-faint)',
                  marginBottom: 6,
                }}
              >
                Recurring themes · seeded into relationship_memory
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {persona.themes.map((th, i) => (
                  <span
                    key={i}
                    style={{
                      padding: '4px 10px',
                      background: 'var(--peach-10)',
                      color: 'var(--peach)',
                      borderRadius: 999,
                      fontSize: 11.5,
                      fontFamily: 'Geist Mono, monospace',
                    }}
                  >
                    {th}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {persona.preferenceCandidates?.length ? (
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 10,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--text-faint)',
                  marginBottom: 6,
                }}
              >
                Inferred preferences · seeded into preference_memory
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {persona.preferenceCandidates.map((p, i) => (
                  <li
                    key={i}
                    style={{
                      padding: '6px 10px',
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 12.5,
                      color: 'var(--text-2)',
                    }}
                  >
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {t.corpus?.rootHash ? (
            <div
              style={{
                marginTop: 14,
                padding: 10,
                background: 'var(--bg)',
                border: '1px dashed var(--border)',
                borderRadius: 8,
                fontFamily: 'Geist Mono, monospace',
                fontSize: 11,
                color: 'var(--text-mute)',
              }}
            >
              corpus · uploaded to 0G Storage ·{' '}
              <a href={t.corpus.gatewayUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--peach)' }}>
                {t.corpus.rootHash.slice(0, 10)}…{t.corpus.rootHash.slice(-6)} ↗
              </a>
            </div>
          ) : null}
        </>
      ) : null}

      <div style={{ marginTop: 18 }}>
        <div
          style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 10,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--text-faint)',
            marginBottom: 8,
          }}
        >
          Sampled tweets · feeding voice_memory
          {t.source === 'demo' ? ' · demo dataset' : ''}
        </div>
        <div
          style={{
            maxHeight: 200,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            paddingRight: 4,
          }}
        >
          {t.tweets.slice(0, 6).map((tw) => (
            <div
              key={tw.id}
              style={{
                padding: '10px 12px',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 12.5,
                lineHeight: 1.5,
                color: 'var(--text-2)',
              }}
            >
              <div>{tw.text}</div>
              <div
                style={{
                  marginTop: 6,
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 10,
                  color: 'var(--text-faint)',
                }}
              >
                ♥ {tw.metrics.likes} · ↺ {tw.metrics.retweets}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Name({ twinName, setTwinName, twitter }) {
  return (
    <>
      <div className="onboard-eyebrow">step 3 of 5</div>
      <h2 className="onboard-title">What should we call your twin?</h2>
      <p className="onboard-sub">
        This is the director — the one you'll talk to. They route your tasks to
        the right specialists and report back. Pick something short.
      </p>
      <div className="onboard-form">
        <input
          className="onboard-input"
          placeholder="Echo · Atlas · Nova · or just keep '2in'"
          value={twinName}
          onChange={(e) => setTwinName(e.target.value)}
          autoFocus
          maxLength={24}
        />
        <div className="onboard-help">
          Single word. You can change it anytime in Settings.
        </div>
      </div>

      {twinName.trim() ? (
        <div
          style={{
            marginTop: 22,
            padding: 16,
            background: 'var(--bg)',
            borderRadius: 12,
            border: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-faint)',
              fontFamily: 'Geist Mono, monospace',
            }}
          >
            preview
          </div>
          <div style={{ marginTop: 8, fontSize: 16 }}>
            <span style={{ color: 'var(--peach)', fontWeight: 600 }}>{twinName}</span>
            <span style={{ color: 'var(--text-mute)' }}> · master twin · gpt-oss-120b</span>
          </div>
          {twitter?.handle ? (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: 'var(--text-mute)',
                fontFamily: 'Geist Mono, monospace',
              }}
            >
              trained on {twitter.handle === 'your-archive' ? 'your archive' : `@${twitter.handle}`}
              ·{' '}{twitter.tweets?.length ?? 0} tweets
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function Mint({ twinName, twitter, walletAddress }) {
  const name = twinName || '2in';
  const tweetsTrained = twitter?.tweets?.length ?? 0;
  const corpusUri = twitter?.corpus?.rootHash
    ? `0g://${twitter.corpus.rootHash}`
    : `0g://master/${name}`;
  const onChain = isChainConfigured();

  // Real chain mode requires both a deployed contract AND an authenticated
  // Privy wallet. When either is missing, useMintRoster falls back to mock
  // (deterministic tx hashes + 1s delays).
  const signerCtx = useViemWalletClient();
  const signer = onChain ? signerCtx.walletClient : null;
  const signerReady = onChain ? signerCtx.ready : true;

  const { rows, start, running, done } = useMintRoster({
    twinName: name,
    walletAddress: walletAddress ?? '0x0000000000000000000000000000000000000000',
    corpusUri,
    signer,
  });

  // Auto-start the mint sequence once when the user lands on this step.
  // Wait for the signer to resolve when chain is configured (otherwise we'd
  // fire mock mints even with a real contract available).
  useEffect(() => {
    if (!signerReady) return;
    if (!running && !done && rows.every((r) => r.status === 'pending')) {
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signerReady]);

  const subTextFor = (r) => {
    if (r.id === 'master') return `mint() → tokenId ${r.tokenId ? `#${r.tokenId}` : '…'}`;
    const what = r.id === 'quill'
      ? `trained on ${tweetsTrained} tweets`
      : r.id === 'cadence'
        ? 'awaiting podcast feed'
        : r.id === 'mantle'
          ? 'awaiting contracts'
          : 'trained on rejection_memory';
    const target = r.tokenId ? `#${r.tokenId}` : '…';
    return `iCloneFrom · ${what} → tokenId ${target}`;
  };

  return (
    <>
      <div className="onboard-eyebrow">step 4 of 5</div>
      <h2 className="onboard-title">Minting your team.</h2>
      <p className="onboard-sub">
        One master twin + five core specialists (Writer, Researcher, Editor,
        Strategist, Companion), each their own iNFT under your wallet on 0G.
        Voice / Visual / Negotiator are opt-in later. Encrypted intelligence
        lives on 0G Storage.
      </p>

      <div className="mint-reveal">
        {rows.map((r) => (
          <div
            key={r.id}
            className={`mint-row${r.status === 'confirmed' ? ' minted' : ''}`}
            style={{ opacity: r.status === 'pending' ? 0.45 : 1 }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'var(--bg-soft-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
              }}
            >
              {r.label[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="who">{r.label}</div>
              <div className="what" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span>{subTextFor(r)}</span>
                {r.txHash ? (
                  <a
                    href={r.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--peach)', fontFamily: 'Geist Mono, monospace', fontSize: 10.5 }}
                  >
                    {r.txHash.slice(0, 8)}…{r.txHash.slice(-4)} ↗
                  </a>
                ) : null}
                {r.error ? (
                  <span style={{ color: 'var(--red)', fontSize: 11 }}>· {r.error}</span>
                ) : null}
              </div>
            </div>
            {r.status === 'confirmed' ? <StatusPill color="mint">minted</StatusPill> : null}
            {r.status === 'submitting' ? <StatusPill color="amber">submitting…</StatusPill> : null}
            {r.status === 'pending' ? <StatusPill color="muted">queued</StatusPill> : null}
            {r.status === 'failed' ? <StatusPill color="red">failed</StatusPill> : null}
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          fontSize: 11.5,
          color: 'var(--text-mute)',
          fontFamily: 'Geist Mono, monospace',
        }}
      >
        <span style={{ color: onChain && signer ? 'var(--mint)' : 'var(--amber)' }}>●</span>
        <span>{onChain && signer ? 'on-chain (Galileo)' : onChain ? 'awaiting signer…' : 'mock mode'}</span>
        <span>·</span>
        <span>chain id 16602</span>
        <span>·</span>
        <span>contract {onChain ? '✓ deployed' : 'unset'}</span>
        {onChain && !signer && signerCtx.ready ? (
          <>
            <span>·</span>
            <span style={{ color: 'var(--red)' }}>{signerCtx.error ?? 'no signer'}</span>
          </>
        ) : null}
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 14,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          fontSize: 12.5,
          color: 'var(--text-mute)',
        }}
      >
        Next:{' '}
        <code style={{ color: 'var(--peach)' }}>delegateAccess(orchestrator)</code>{' '}
        on every iNFT — lets your team run 24/7 without you signing each tick.
      </div>
    </>
  );
}

function Ready({ twinName }) {
  const name = twinName || '2in';
  return (
    <>
      <div className="onboard-eyebrow">step 5 of 5</div>
      <h2 className="onboard-title">Meet {name}.</h2>
      <p className="onboard-sub">
        Your twin is live. Type a task in chat — {name} picks the pattern,
        dispatches the right specialists, and reports back when it's done.
      </p>

      <div
        style={{
          marginTop: 22,
          padding: 18,
          background: 'var(--peach-04)',
          border: '1px solid var(--peach)',
          borderRadius: 12,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: 'var(--peach)',
            fontFamily: 'Geist Mono, monospace',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          your first task · suggested
        </div>
        <div style={{ marginTop: 8, fontSize: 14, color: 'var(--text)' }}>
          "{name}, draft a tweet about something I posted last week."
        </div>
      </div>
    </>
  );
}
