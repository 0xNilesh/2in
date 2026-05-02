// Specialist profile = the iNFT proof surface (track requirement, JOURNEY §6).
// Renders ERC-7857 fields fetched LIVE via /api/chain/twin/:tokenId, with
// the static specialist roster (data/specialists.js) as fallback metadata.

import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { TokenChip } from '../components/TokenChip.jsx';
import { StatusPill } from '../components/StatusPill.jsx';
import { getSpecialist } from '../data/specialists.js';
import { ROUTES } from '../lib/routes.js';
import { gatewayUrl } from '../lib/format.js';
import { useTwinNft } from '../hooks/useTwinNft.js';
import { useSnapshotHistory } from '../hooks/useSnapshotHistory.js';
import { useViemWalletClient } from '../lib/privy-signer.js';
import { transferSpecialist, getExplorerTxUrl } from '../lib/chain.js';
import { pushToast } from '../hooks/useToasts.js';

function relativeTime(ts) {
  const d = Date.now() - ts;
  if (d < 60_000) return `${Math.round(d / 1000)}s ago`;
  if (d < 3_600_000) return `${Math.round(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)}h ago`;
  return `${Math.round(d / 86_400_000)}d ago`;
}

function TransferButton({ specialist, chainOwner }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { walletClient, address: signerAddress } = useViemWalletClient();

  const fromAddress = chainOwner ?? signerAddress ?? null;
  const tokenId = specialist?.tokenId;
  const isAddrValid = /^0x[a-fA-F0-9]{40}$/.test(to.trim());
  const sameAsFrom = isAddrValid && fromAddress && to.trim().toLowerCase() === fromAddress.toLowerCase();

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      if (!walletClient) throw new Error('Wallet not connected');
      if (!fromAddress) throw new Error("Couldn't determine sender address");
      if (!tokenId) throw new Error('No tokenId for this specialist');
      const res = await transferSpecialist({
        from: fromAddress,
        to: to.trim(),
        tokenId,
        signer: walletClient,
      });
      pushToast({
        kind: 'success',
        title: `Transferred ${specialist.name} → ${to.trim().slice(0, 6)}…${to.trim().slice(-4)}`,
        body: `tokenId #${tokenId} · ${res.txHash.slice(0, 10)}…`,
        ttlMs: 6000,
        action: res.txHash ? { label: 'view tx →', href: getExplorerTxUrl(res.txHash) } : null,
      });
      setOpen(false);
      setTo('');
    } catch (err) {
      setError(err.message ?? 'transfer_failed');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        className="btn"
        onClick={() => setOpen(true)}
        disabled={!tokenId}
        title={tokenId ? 'Move this iNFT to another wallet' : 'No minted tokenId yet'}
      >Transfer</button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={() => !busy && setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(440px, 92vw)',
          background: 'var(--bg-soft)',
          border: '1px solid var(--border-strong)',
          borderRadius: 14,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 15, color: 'var(--text)', fontWeight: 500 }}>
            Transfer {specialist.name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 4, lineHeight: 1.5 }}>
            Calls <code style={{ color: 'var(--peach)' }}>safeTransferFrom</code> on the
            TwinINFT contract. The new owner inherits this specialist's iNFT —
            including its memory pointer + adapter URI when one is set.
            Per-twin authorizations clear on transfer.
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'Geist Mono, monospace' }}>
          tokenId · #{tokenId}<br/>
          from · {fromAddress ? `${fromAddress.slice(0, 6)}…${fromAddress.slice(-4)}` : '—'}
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--text-mute)' }}>Recipient address</span>
          <input
            autoFocus
            value={to}
            onChange={(e) => { setTo(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && isAddrValid && !sameAsFrom) submit(); }}
            placeholder="0x…"
            disabled={busy}
            style={{
              padding: '10px 12px',
              background: 'var(--bg)',
              border: `1px solid ${to && !isAddrValid ? 'var(--red)' : 'var(--border-strong)'}`,
              borderRadius: 8,
              color: 'var(--text)',
              fontFamily: 'Geist Mono, monospace',
              fontSize: 13,
              outline: 0,
            }}
          />
          {to && !isAddrValid ? (
            <span style={{ fontSize: 11, color: 'var(--red)' }}>not a valid 0x… address</span>
          ) : sameAsFrom ? (
            <span style={{ fontSize: 11, color: 'var(--amber)' }}>same as current owner — no-op</span>
          ) : null}
        </label>

        {error ? (
          <div style={{ fontSize: 12, color: 'var(--red)', padding: '6px 10px', background: 'rgba(255,80,80,0.06)', borderRadius: 6 }}>
            {error}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="btn" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
          <button
            className="btn btn-peach"
            onClick={submit}
            disabled={busy || !isAddrValid || sameAsFrom}
          >
            {busy ? 'transferring…' : 'Transfer →'}
          </button>
        </div>
      </div>
    </div>
  );
}

function shortHash(h, head = 8, tail = 6) {
  if (!h) return '—';
  if (h.length <= head + tail + 2) return h;
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
}

function shortAddr(a) {
  if (!a) return '—';
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function Specialist() {
  const { id } = useParams();
  const s = getSpecialist(id);
  const { state: chain, loading, error } = useTwinNft(s?.tokenId);
  const { snapshots } = useSnapshotHistory(s?.tokenId);

  if (!s) {
    return (
      <>
        <PageHeader title="Unknown specialist" />
        <div className="page"><Link to={ROUTES.chat}>Go home →</Link></div>
      </>
    );
  }

  const isDirector = s.id === 'director';
  // Optional specialists (Voice / Visual / Negotiator) are never minted by
  // the current onboarding flow — render a clean "not minted" empty state
  // instead of pretending we have on-chain data for them.
  const notMinted = s.tier === 'optional' && s.tokenId == null;
  // Prefer live chain data; fall back to the static roster fields.
  const owner = chain?.owner ?? null;
  const dataHash = chain?.dataHash ?? null;
  const encryptedURI = chain?.encryptedURI ?? s.corpusURI ?? null;
  const parentTokenId = chain?.parentTokenId ?? s.parent ?? 0;
  const delegate = chain?.delegate ?? null;
  const sourceLabel = chain?.source === 'chain' ? 'on-chain · live' : chain?.source === 'mock' ? 'mock' : loading ? 'loading…' : error ? 'unavailable' : '—';

  if (notMinted) {
    return (
      <>
        <PageHeader
          title={`${s.name} · ${s.role}`}
          sub={s.description}
          right={<Link to={ROUTES.chat} className="btn">Chat with director →</Link>}
        />
        <div className="scroll">
          <div className="page">
            <section className="card">
              <div className="card-row">
                <Avatar initial={s.initial} size="xl" />
                <div className="grow">
                  <div className="card-title" style={{ fontSize: 18 }}>{s.fullName ?? s.name}</div>
                  <div className="card-sub" style={{ marginTop: 4 }}>
                    Opt-in specialist — not minted on the current build.
                  </div>
                  <div className="card-meta" style={{ marginTop: 8 }}>
                    <span>model · {s.model}</span>
                    <span>tier · optional</span>
                  </div>
                </div>
                <StatusPill color="amber">not minted</StatusPill>
              </div>
            </section>

            <section style={{ marginTop: 18 }}>
              <div
                style={{
                  padding: 18,
                  border: '1px dashed var(--border-strong)',
                  borderRadius: 12,
                  background: 'var(--bg)',
                  color: 'var(--text-mute)',
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                Voice, Visual and Negotiator are roadmap specialists — the current
                onboarding mints the master twin plus the five core specialists
                only. When opt-in mints ship, this page will populate with the
                live ERC-7857 fields (tokenId, owner, encryptedURI, dataHash,
                sealedKey, snapshot history) just like the core profiles.
              </div>
            </section>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`${s.name}${s.role ? ` · ${s.role}` : ''}`}
        sub={s.description}
        right={
          <>
            <Link to={ROUTES.chat} className="btn">Chat with director →</Link>
            <TransferButton specialist={s} chainOwner={owner} />
          </>
        }
      />

      <div className="scroll">
        <div className="page">
          <section className="card">
            <div className="card-row">
              <Avatar initial={s.initial} variant={isDirector ? 'dir' : undefined} size="xl" />
              <div className="grow">
                <div className="card-title" style={{ fontSize: 18 }}>{s.fullName ?? s.name}</div>
                <div className="card-sub">{s.trainedOn}</div>
                <div className="card-meta" style={{ marginTop: 8 }}>
                  <span>model · {s.model}</span>
                  {snapshots.length > 0 ? <span>snapshots · {snapshots.length}</span> : null}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                <TokenChip value={s.tokenId} link />
              </div>
            </div>
          </section>

          <section>
            <div
              className="label-mono"
              style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <span>iNFT · ERC-7857</span>
              <StatusPill color={chain?.source === 'chain' ? 'mint' : 'muted'}>
                {sourceLabel}
              </StatusPill>
            </div>
            <div className="proof-panel">
              <div className="proof-row">
                <div className="k">tokenId</div>
                <div className="v peach">
                  #{s.tokenId}
                  {chain?.explorerUrl ? (
                    <> · <a href={chain.explorerUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--peach)' }}>↗ explorer</a></>
                  ) : null}
                </div>
              </div>
              <div className="proof-row">
                <div className="k">owner</div>
                <div className="v">{shortAddr(owner) || '—'}</div>
              </div>
              <div className="proof-row">
                <div className="k">parent</div>
                <div className="v">{parentTokenId ? `master · #${parentTokenId} (iCloneFrom)` : '— (master twin)'}</div>
              </div>
              <div className="proof-row">
                <div className="k">encryptedURI</div>
                <div className="v">
                  {shortHash(encryptedURI)}
                  {encryptedURI ? (
                    <> · <a href={gatewayUrl(encryptedURI)} target="_blank" rel="noreferrer" style={{ color: 'var(--peach)' }}>↗ gateway</a></>
                  ) : null}
                </div>
              </div>
              <div className="proof-row">
                <div className="k">dataHash</div>
                <div className="v">{shortHash(dataHash) || (encryptedURI ? `keccak256(${shortHash(encryptedURI)})` : '—')}</div>
              </div>
              <div className="proof-row">
                <div className="k">sealedKey holder</div>
                <div className="v">{shortAddr(owner)}</div>
              </div>
              <div className="proof-row">
                <div className="k">adapterURI</div>
                <div className="v">{s.adapterURI ?? '— (memory-driven, no LoRA on 0G yet)'}</div>
              </div>
              <div className="proof-row">
                <div className="k">delegate</div>
                <div className="v">{shortAddr(delegate)}</div>
              </div>
              <div className="proof-row">
                <div className="k">authorizations</div>
                <div className="v">none</div>
              </div>
            </div>
          </section>

          <section>
            <div className="label-mono" style={{ marginBottom: 10 }}>Snapshot history · updateMetadata</div>
            <div className="table-card">
              <div className="table-row head" style={{ '--cols': '60px 110px 1fr 1fr 1.4fr' }}>
                <span>idx</span>
                <span>when</span>
                <span>from</span>
                <span>to</span>
                <span>delta</span>
              </div>
              {snapshots.map((sn) => (
                <div key={sn.idx} className="table-row" style={{ '--cols': '60px 110px 1fr 1fr 1.4fr' }}>
                  <span style={{ fontFamily: 'Geist Mono, monospace', color: 'var(--text-mute)' }}>#{sn.idx}</span>
                  <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--text-faint)' }}>{relativeTime(sn.ts)}</span>
                  <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--text-2)' }}>{sn.fromHash}</span>
                  <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--peach)' }}>{sn.toHash}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{sn.delta} · <span style={{ color: 'var(--text-faint)' }}>{sn.triggeredBy}</span></span>
                </div>
              ))}
              {snapshots.length === 0 ? (
                <div className="table-row" style={{ '--cols': '1fr', color: 'var(--text-faint)', fontSize: 12 }}>
                  No snapshots yet for this specialist.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
