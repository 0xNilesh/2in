// Settings — wallet · delegate · mode (JOURNEY §7).

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.jsx';
import { StatusPill } from '../components/StatusPill.jsx';
import { user } from '../data/user.js';
import { useAuth } from '../hooks/useAuth.js';
import { useViemWalletClient } from '../lib/privy-signer.js';
import { isChainConfigured, chainConfig, getExplorerTxUrl } from '../lib/chain.js';
import { TWIN_INFT_ABI } from '../lib/abi/twin-nft.js';
import { chainApi } from '../lib/api.js';
import { ROUTES } from '../lib/routes.js';
import { pushToast } from '../hooks/useToasts.js';

const MASTER_TOKEN_ID = 42n; // demo master twin tokenId
const ORCHESTRATOR_DELEGATE = '0x91ab2f7d000000000000000000000000000002f7d1'; // 40-char placeholder

function useDelegateAuth() {
  const { walletClient, address } = useViemWalletClient();
  const [status, setStatus] = useState('idle'); // idle · submitting · confirmed · failed
  const [txHash, setTxHash] = useState(null);
  const [error, setError] = useState(null);

  const authorize = async () => {
    setStatus('submitting');
    setError(null);
    setTxHash(null);
    try {
      let hash;
      if (walletClient && isChainConfigured()) {
        // Real path: user signs delegateAccess(masterTokenId, orchestrator).
        hash = await walletClient.writeContract({
          address: chainConfig.contractAddress,
          abi: TWIN_INFT_ABI,
          functionName: 'delegateAccess',
          args: [MASTER_TOKEN_ID, ORCHESTRATOR_DELEGATE],
        });
      }
      // Echo to server for telemetry — also covers the mock path entirely.
      const res = await chainApi.delegate(Number(MASTER_TOKEN_ID), ORCHESTRATOR_DELEGATE, hash);
      setTxHash(res.txHash);
      setStatus('confirmed');
    } catch (err) {
      setError(err.message ?? 'delegate_failed');
      setStatus('failed');
    }
  };

  return { status, txHash, error, authorize, address };
}

// Wipe everything that ties this browser to a particular twin: localStorage
// keys (twin, threads, thread-ext, onboarding, memory cache, task caches,
// rail, banner dismissals, corpus). Server memory persists on disk —
// optionally clear it too via /api/memory/wipe.
async function wipeLocalAndServer({ alsoServer = true }) {
  // localStorage keys we own
  const KEYS = [
    '2in:twin',
    '2in:threads',
    '2in:thread-ext',
    '2in:onboarding',
    '2in:rail:collapsed',
    '2in:memory',
    '2in:corpus:twitter',
    '2in:banner:dismissed:quill',
  ];
  try {
    for (const k of KEYS) window.localStorage.removeItem(k);
    // Wipe per-task caches (variable suffix)
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k && (k.startsWith('2in:task:') || k.startsWith('2in:'))) {
        window.localStorage.removeItem(k);
      }
    }
    window.sessionStorage.clear();
  } catch { /* quota/blocked — ignore */ }

  if (alsoServer) {
    try {
      // Best-effort wipe of every memory type for the demo twin.
      const types = ['episodic', 'semantic', 'relationship', 'temporal', 'procedural', 'working'];
      for (const t of types) {
        const list = await fetch(`/api/memory/${t}/list?twin=42`).then((r) => r.ok ? r.json() : { entries: [] });
        for (const e of list.entries ?? []) {
          if (e.id) {
            await fetch(`/api/memory/${t}/${encodeURIComponent(e.id)}?twin=42`, { method: 'DELETE' }).catch(() => {});
          }
        }
      }
    } catch { /* server may be down — local wipe still useful */ }
  }
}

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
              <div className="v">{auth.address ?? user.fullAddress}</div>
              <button
                className="btn"
                onClick={() => {
                  try { auth.logout?.(); } catch { /* ignore */ }
                  pushToast({ kind: 'success', title: 'Disconnected', body: 'Wallet logged out', ttlMs: 2000 });
                  setTimeout(() => nav('/'), 300);
                }}
                disabled={!auth.authenticated}
                style={{ opacity: auth.authenticated ? 1 : 0.5 }}
              >
                Disconnect
              </button>
            </div>
            <div className="settings-row">
              <div className="k">
                Handle
                <span className="s">Resolved from ENS · falls back to short address</span>
              </div>
              <div className="v">{user.handle}</div>
              <button className="btn">Edit</button>
            </div>
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
                <button className="btn btn-peach" onClick={delegate.authorize}>
                  Authorize orchestrator
                </button>
              )}
            </div>
            <div className="settings-row">
              <div className="k">
                Auto-snapshot threshold
                <span className="s">Memory delta that triggers updateMetadata on chain</span>
              </div>
              <div className="v">3 entries · 24h</div>
              <button className="btn">Adjust</button>
            </div>
          </div>

          <div className="label-mono" style={{ margin: '24px 0 10px' }}>Runtime mode</div>
          <div className="card" style={{ padding: 0 }}>
            <div className="settings-row">
              <div className="k">
                Private mode
                <span className="s">Routes every Compute call through TeeML providers + verifies signatures</span>
              </div>
              <div className="v">off</div>
              <span className={`toggle${user.privateMode ? ' on' : ''}`}></span>
            </div>
            <div className="settings-row">
              <div className="k">
                Default chain
                <span className="s">Galileo testnet · 16602</span>
              </div>
              <div className="v">galileo</div>
              <button className="btn">Switch</button>
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
              >
                {resetting ? 'wiping…' : 'Reset everything'}
              </button>
            </div>
          </div>

          <div className="label-mono" style={{ margin: '24px 0 10px' }}>Connected sources</div>
          <div className="card" style={{ padding: 0 }}>
            <div className="settings-row">
              <div className="k">
                Twitter / X
                <span className="s">Quill ingests tweets read-only · never publishes</span>
              </div>
              <div className="v">@nilesh</div>
              <button className="btn">Revoke</button>
            </div>
            <div className="settings-row">
              <div className="k">
                Spotify · podcast feed
                <span className="s">Cadence ingests transcripts via Whisper</span>
              </div>
              <div className="v">24 episodes</div>
              <button className="btn">Revoke</button>
            </div>
            <div className="settings-row">
              <div className="k">
                Contracts · PDF
                <span className="s">Mantle ingests for clause review</span>
              </div>
              <div className="v">14 docs</div>
              <button className="btn">Manage</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
