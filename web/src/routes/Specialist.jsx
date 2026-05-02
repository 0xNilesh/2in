// Specialist profile = the iNFT proof surface (track requirement, JOURNEY §6).
// Renders ERC-7857 fields fetched LIVE via /api/chain/twin/:tokenId, with
// the static specialist roster (data/specialists.js) as fallback metadata.

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

function relativeTime(ts) {
  const d = Date.now() - ts;
  if (d < 60_000) return `${Math.round(d / 1000)}s ago`;
  if (d < 3_600_000) return `${Math.round(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)}h ago`;
  return `${Math.round(d / 86_400_000)}d ago`;
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
  // Prefer live chain data; fall back to the static roster fields.
  const owner = chain?.owner ?? null;
  const dataHash = chain?.dataHash ?? null;
  const encryptedURI = chain?.encryptedURI ?? s.corpusURI ?? null;
  const parentTokenId = chain?.parentTokenId ?? s.parent ?? 0;
  const delegate = chain?.delegate ?? null;
  const sourceLabel = chain?.source === 'chain' ? 'on-chain · live' : chain?.source === 'mock' ? 'mock' : loading ? 'loading…' : error ? 'unavailable' : '—';

  return (
    <>
      <PageHeader
        title={`${s.name}${s.role ? ` · ${s.role}` : ''}`}
        sub={s.description}
        right={
          <>
            <Link to={ROUTES.chat} className="btn">Chat with director →</Link>
            <button className="btn">Authorize usage</button>
            <button className="btn">Transfer</button>
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
