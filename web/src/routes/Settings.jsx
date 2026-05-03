// Settings — wallet · delegate · runtime · sources.
//
// What works today:
//   - Wallet → Disconnect (real Privy logout + redirect)
//   - Delegate → Authorize orchestrator (real delegateAccess on the
//     REAL master tokenId from 2in:mints — not the static demo number)
//   - Danger zone → Reset everything (wipes localStorage + server memory
//     + Privy session)
//
// Everything else is visibly disabled with a `soon` suffix on its action
// button so the surface is honest about what we ship today vs. roadmap:
//   - Handle edit
//   - Auto-snapshot threshold adjust
//   - Private mode toggle (TeeML routing isn't wired)
//   - Multichain switch (only Galileo is supported)
//   - 8 social / document source connectors

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.jsx';
import { StatusPill } from '../components/StatusPill.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useViemWalletClient } from '../lib/privy-signer.js';
import { isChainConfigured, chainConfig, getExplorerTxUrl } from '../lib/chain.js';
import { TWIN_INFT_ABI } from '../lib/abi/twin-nft.js';
import { chainApi } from '../lib/api.js';
import { pushToast } from '../hooks/useToasts.js';
import { getTwinId } from '../data/specialists.js';

const ORCHESTRATOR_DELEGATE = '0x91ab2f7d000000000000000000000000000002f7d1'; // demo hot wallet placeholder

function getMasterTokenId() {
  try {
    const m = JSON.parse(window.localStorage.getItem('2in:mints') ?? '{}');
    return m.master?.tokenId ?? null;
  } catch { return null; }
}

function useDelegateAuth() {
  const { walletClient, address } = useViemWalletClient();
  const [status, setStatus] = useState('idle'); // idle · submitting · confirmed · failed
  const [txHash, setTxHash] = useState(null);
  const [error, setError] = useState(null);

  const masterId = getMasterTokenId();

  const authorize = async () => {
    if (!masterId) {
      setError('No master twin minted yet — finish onboarding first');
      setStatus('failed');
      return;
    }
    setStatus('submitting');
    setError(null);
    setTxHash(null);
    try {
      let hash;
      if (walletClient && isChainConfigured()) {
        hash = await walletClient.writeContract({
          address: chainConfig.contractAddress,
          abi: TWIN_INFT_ABI,
          functionName: 'delegateAccess',
          args: [BigInt(masterId), ORCHESTRATOR_DELEGATE],
        });
      }
      const res = await chainApi.delegate(Number(masterId), ORCHESTRATOR_DELEGATE, hash);
      setTxHash(res.txHash);
      setStatus('confirmed');
      // Persist the delegated flag so Rail's footer pill reflects reality.
      try {
        window.localStorage.setItem('2in:delegated', '1');
        window.dispatchEvent(new Event('2in:delegated-changed'));
      } catch { /* ignore */ }
    } catch (err) {
      setError(err.message ?? 'delegate_failed');
      setStatus('failed');
    }
  };

  return { status, txHash, error, authorize, address, masterId };
}

// Wipe everything that ties this browser to a particular twin: localStorage
// keys (twin, threads, thread-ext, onboarding, memory cache, task caches,
// rail, banner dismissals, corpus). Server memory persists on disk —
// optionally clear it too via /api/memory/wipe.
async function wipeLocalAndServer({ alsoServer = true }) {
  const KEYS = [
    '2in:twin',
    '2in:threads',
    '2in:thread-ext',
    '2in:onboarding',
    '2in:rail:collapsed',
    '2in:memory',
    '2in:corpus:twitter',
    '2in:banner:dismissed:quill',
    '2in:mints',
  ];
  try {
    for (const k of KEYS) window.localStorage.removeItem(k);
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('2in:')) window.localStorage.removeItem(k);
    }
    window.sessionStorage.clear();
  } catch { /* quota/blocked — ignore */ }

  if (alsoServer) {
    try {
      const twinId = encodeURIComponent(getTwinId());
      const types = ['episodic', 'semantic', 'relationship', 'temporal', 'procedural', 'working'];
      for (const t of types) {
        const list = await fetch(`/api/memory/${t}/list?twin=${twinId}`).then((r) => r.ok ? r.json() : { entries: [] });
        for (const e of list.entries ?? []) {
          if (e.id) {
            await fetch(`/api/memory/${t}/${encodeURIComponent(e.id)}?twin=${twinId}`, { method: 'DELETE' }).catch(() => {});
          }
        }
      }
    } catch { /* server may be down — local wipe still useful */ }
  }
}

// Conversation log card — fetches /api/chat/threads and lists every thread
// snapshot stored on 0G Storage with its rootHash + gateway link + msg count.
// Live refresh every 8s so new chats appear without manual reload.
function ConversationLogCard() {
  const [state, setState] = useState({ loading: true, threads: [] });

  useEffect(() => {
    let cancelled = false;
    const load = () => fetch(`/api/chat/threads?twin=${encodeURIComponent(getTwinId())}`)
      .then((r) => (r.ok ? r.json() : { threads: [] }))
      .then((j) => {
        if (cancelled) return;
        const threads = (Array.isArray(j?.threads) ? j.threads : [])
          .slice()
          .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
        setState({ loading: false, threads });
      })
      .catch(() => { if (!cancelled) setState({ loading: false, threads: [] }); });
    load();
    const id = setInterval(load, 8_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="settings-row" style={{ alignItems: 'flex-start' }}>
        <div className="k">
          Thread snapshots
          <span className="s">Per-thread JSON uploaded to 0G Indexer · pointer in 0G KV · refresh 8s</span>
        </div>
        <div className="v" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {state.loading ? (
            <span style={{ color: 'var(--text-mute)' }}>loading…</span>
          ) : state.threads.length === 0 ? (
            <span style={{ color: 'var(--text-mute)' }}>no snapshots yet</span>
          ) : (
            <>
              <span style={{ color: 'var(--text-mute)' }}>{state.threads.length} thread{state.threads.length === 1 ? '' : 's'}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {state.threads.map((t) => (
                  <div key={t.threadId} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 12,
                    fontFamily: 'Geist Mono, monospace',
                    fontSize: 10.5,
                    paddingTop: 4,
                    borderTop: '1px dashed var(--border)',
                  }}>
                    <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.threadId}
                    </span>
                    <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>
                      {t.msgCount != null ? `${t.msgCount} msg${t.msgCount === 1 ? '' : 's'}` : '— msgs'}
                    </span>
                    <a
                      href={t.gatewayUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--peach)', flexShrink: 0 }}
                    >
                      {t.rootHash.slice(0, 10)}…{t.rootHash.slice(-6)} ↗
                    </a>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <span style={{ fontSize: 10.5, color: 'var(--mint)', fontFamily: 'Geist Mono, monospace', flexShrink: 0 }}>0G STORAGE</span>
      </div>
    </div>
  );
}

// === presentational ==================================================
const SOON_BTN = { opacity: 0.55, cursor: 'not-allowed' };
const SOON_TAG = { opacity: 0.6, fontSize: 10, marginLeft: 5, fontFamily: 'Geist Mono, monospace' };

function SoonRow({ label, sub, value, action }) {
  return (
    <div className="settings-row">
      <div className="k">
        {label}
        <span className="s">{sub}</span>
      </div>
      <div className="v" style={{ color: 'var(--text-mute)' }}>{value}</div>
      <button className="btn" disabled style={SOON_BTN}>
        {action}<span style={SOON_TAG}>soon</span>
      </button>
    </div>
  );
}

// Source connectors we'd want — all currently disabled. Labels describe
// which specialist would consume the corpus, so the user can see what each
// integration would unlock.
const SOURCES = [
  { id: 'twitter',   name: 'Twitter / X',         sub: 'Posts, threads, replies — primary corpus for Writer + Voice' },
  { id: 'linkedin',  name: 'LinkedIn',            sub: 'Long-form posts and engagement signals' },
  { id: 'substack',  name: 'Substack',            sub: 'Essay archive + subscriber list' },
  { id: 'youtube',   name: 'YouTube',             sub: 'Video transcripts via Whisper for the Voice specialist' },
  { id: 'spotify',   name: 'Spotify · Podcasts',  sub: 'Episode transcripts via Whisper' },
  { id: 'instagram', name: 'Instagram',           sub: 'Captions + visual archive for the Visual specialist' },
  { id: 'notion',    name: 'Notion workspace',    sub: 'Personal notes + drafts ingested into semantic memory' },
  { id: 'gdrive',    name: 'Google Drive · PDFs', sub: 'Contracts and research docs (Negotiator + Researcher)' },
];

export default function Settings() {
  const delegate = useDelegateAuth();
  const auth = useAuth();
  const nav = useNavigate();
  const [resetting, setResetting] = useState(false);

  const fullReset = async () => {
    if (!window.confirm(
      'Reset everything?\n\n' +
      '• Disconnects your wallet (Privy)\n' +
      '• Wipes all chats + threads + memory in this browser\n' +
      '• Clears your seeded persona on the server\n' +
      '• Sends you back to the landing page\n\n' +
      'This cannot be undone.',
    )) return;
    setResetting(true);
    try {
      await wipeLocalAndServer({ alsoServer: true });
      try { auth.logout?.(); } catch { /* ignore */ }
      pushToast({ kind: 'success', title: 'Reset complete', body: 'Logged out + wiped state', ttlMs: 2500 });
      setTimeout(() => { nav('/'); window.location.reload(); }, 200);
    } finally {
      setResetting(false);
    }
  };

  const shortAddr = auth.address ? `${auth.address.slice(0, 6)}…${auth.address.slice(-4)}` : '—';

  return (
    <>
      <PageHeader title="Settings" sub="Wallet · delegate · runtime mode" />
      <div className="scroll">
        <div className="page page-narrow">

          <div className="label-mono" style={{ marginBottom: 10 }}>Wallet</div>
          <div className="card" style={{ padding: 0 }}>
            <div className="settings-row">
              <div className="k">
                Cold wallet
                <span className="s">Owns every iNFT in your roster</span>
              </div>
              <div className="v">{auth.address ?? '—'}</div>
              <button
                className="btn"
                onClick={() => {
                  try { auth.logout?.(); } catch { /* ignore */ }
                  pushToast({ kind: 'success', title: 'Disconnected', body: 'Wallet logged out', ttlMs: 2000 });
                  setTimeout(() => nav('/'), 300);
                }}
                disabled={!auth.authenticated}
                style={{ opacity: auth.authenticated ? 1 : 0.5 }}
              >Disconnect</button>
            </div>
            <SoonRow
              label="Handle"
              sub="Custom display name (ENS or arbitrary)"
              value={shortAddr}
              action="Edit"
            />
          </div>

          <div className="label-mono" style={{ margin: '24px 0 10px' }}>Delegate</div>
          <div className="card" style={{ padding: 0 }}>
            <div className="settings-row">
              <div className="k">
                Orchestrator hot wallet
                <span className="s">delegateAccess(...) lets the team run 24/7 without you signing each tick</span>
              </div>
              <div className="v" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>{ORCHESTRATOR_DELEGATE.slice(0, 6)}…{ORCHESTRATOR_DELEGATE.slice(-4)}</span>
                {delegate.masterId ? (
                  <span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'Geist Mono, monospace' }}>
                    on tokenId #{delegate.masterId}
                  </span>
                ) : (
                  <span style={{ fontSize: 10.5, color: 'var(--amber)' }}>
                    no master minted — finish onboarding
                  </span>
                )}
                {delegate.txHash ? (
                  <a
                    href={getExplorerTxUrl(delegate.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--peach)', fontSize: 10.5 }}
                  >
                    {delegate.txHash.slice(0, 8)}…{delegate.txHash.slice(-4)} ↗
                  </a>
                ) : null}
                {delegate.error ? (
                  <span style={{ color: 'var(--red)', fontSize: 11 }}>{delegate.error}</span>
                ) : null}
              </div>
              {delegate.status === 'confirmed' ? (
                <StatusPill color="mint">authorized</StatusPill>
              ) : delegate.status === 'submitting' ? (
                <StatusPill color="amber">signing…</StatusPill>
              ) : delegate.status === 'failed' ? (
                <button className="btn" onClick={delegate.authorize}>Retry</button>
              ) : (
                <button
                  className="btn btn-peach"
                  onClick={delegate.authorize}
                  disabled={!delegate.masterId}
                  style={{ opacity: delegate.masterId ? 1 : 0.55, cursor: delegate.masterId ? 'pointer' : 'not-allowed' }}
                  title={delegate.masterId ? 'Sign delegateAccess on chain' : 'Mint your master twin during onboarding first'}
                >Authorize orchestrator</button>
              )}
            </div>
            <SoonRow
              label="Auto-snapshot threshold"
              sub="Memory delta that triggers updateMetadata on chain"
              value="3 entries · 24h (default)"
              action="Adjust"
            />
          </div>

          <div className="label-mono" style={{ margin: '24px 0 10px' }}>Runtime mode</div>
          <div className="card" style={{ padding: 0 }}>
            <div className="settings-row">
              <div className="k">
                Private mode
                <span className="s">Routes every Compute call through TeeML providers + verifies signatures</span>
              </div>
              <div className="v" style={{ color: 'var(--text-mute)' }}>off</div>
              <span
                className="toggle"
                style={{ opacity: 0.32, cursor: 'not-allowed' }}
                title="TeeML routing is on the roadmap"
              ></span>
            </div>
            <div className="settings-row">
              <div className="k">
                Default chain
                <span className="s">Galileo testnet · 16602 · only chain currently supported</span>
              </div>
              <div className="v">galileo</div>
              <button className="btn" disabled style={SOON_BTN} title="Multichain coming later">
                Switch<span style={SOON_TAG}>soon</span>
              </button>
            </div>
          </div>

          <div className="label-mono" style={{ margin: '24px 0 10px', color: 'var(--red)' }}>Danger zone</div>
          <div className="card" style={{ padding: 16, border: '1px solid rgba(255,80,80,0.32)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>Reset everything</div>
                <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 4, lineHeight: 1.5 }}>
                  Disconnects your wallet, wipes every chat / thread / memory entry / library file
                  reference in this browser, and clears the seeded persona on the server.
                  Sends you back to the landing page so you can start fresh.
                </div>
              </div>
              <button
                className="btn"
                onClick={fullReset}
                disabled={resetting}
                style={{
                  background: 'rgba(255,80,80,0.08)',
                  borderColor: 'rgba(255,80,80,0.4)',
                  color: 'var(--red)',
                  whiteSpace: 'nowrap',
                }}
              >{resetting ? 'wiping…' : 'Reset everything'}</button>
            </div>
          </div>

          <div className="label-mono" style={{ margin: '24px 0 10px' }}>Conversation log · 0G Storage</div>
          <ConversationLogCard />

          <div className="label-mono" style={{ margin: '24px 0 10px' }}>Connected sources</div>
          <div className="card" style={{ padding: 0 }}>
            {SOURCES.map((s) => (
              <div key={s.id} className="settings-row">
                <div className="k">
                  {s.name}
                  <span className="s">{s.sub}</span>
                </div>
                <div className="v" style={{ color: 'var(--text-mute)' }}>not connected</div>
                <button className="btn" disabled style={SOON_BTN}>
                  Connect<span style={SOON_TAG}>soon</span>
                </button>
              </div>
            ))}
          </div>

          <div style={{
            fontSize: 11,
            color: 'var(--text-faint)',
            margin: '14px 0 4px',
            textAlign: 'center',
            lineHeight: 1.6,
          }}>
            Sources marked <code style={{ color: 'var(--text-mute)' }}>soon</code> are on the roadmap —
            today only the corpus you typed during onboarding feeds memory.
          </div>

        </div>
      </div>
    </>
  );
}
