// Specialist profile = the iNFT proof surface (track requirement, JOURNEY §6).
// Renders ERC-7857 fields fetched LIVE via /api/chain/twin/:tokenId, with
// the static specialist roster (data/specialists.js) as fallback metadata.

import { useParams, Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { TokenChip, HashChip } from '../components/TokenChip.jsx';
import { StatusPill } from '../components/StatusPill.jsx';
import { getSpecialist } from '../data/specialists.js';
import { ROUTES } from '../lib/routes.js';
import { gatewayUrl } from '../lib/format.js';
import { useTwinNft } from '../hooks/useTwinNft.js';
import { useSpecialistJobs } from '../hooks/useSpecialistJobs.js';
import { useFineTuneJob } from '../hooks/useFineTuneJob.js';
import { finetuneApi } from '../lib/api.js';

const snapshotHistory = [
  { idx: 12, when: '14m ago', from: '0x88b1…0042', to: '0x88c0…d013', delta: 'rejection_memory +3 entries' },
  { idx: 11, when: '2d ago', from: '0x4a02…ffaa', to: '0x88b1…0042', delta: 'preference_memory override' },
  { idx: 10, when: '6d ago', from: '0x2cc0…1199', to: '0x4a02…ffaa', delta: 'voice_memory +24 examples' },
];

function readTwitterCorpus() {
  try {
    return JSON.parse(window.localStorage.getItem('2in:corpus:twitter') ?? 'null');
  } catch {
    return null;
  }
}

function TrainingSection({ specialist }) {
  const { jobs, currentJob, refetch } = useSpecialistJobs(specialist.id);
  const corpus = readTwitterCorpus();
  const corpusSize = corpus?.tweets?.length ?? 0;
  const liveJob = jobs.find((j) => j.status === 'live');
  const adapter = liveJob?.adapterURI ?? specialist.adapterURI ?? null;
  const canTrain = !currentJob && corpusSize > 0;
  const startTrain = async () => {
    try {
      await finetuneApi.start(specialist.id, {
        baseModel: 'Qwen2.5-0.5B-Instruct',
        datasetUri: corpus?.rootHash ?? `0g://corpus/${specialist.id}`,
      });
      await refetch();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err.message ?? 'training_start_failed');
    }
  };

  return (
    <section>
      <div
        className="label-mono"
        style={{ marginBottom: 10, marginTop: 24, display: 'flex', alignItems: 'center', gap: 10 }}
      >
        <span>Training history · LoRA fine-tune</span>
        {currentJob ? (
          <StatusPill color={currentJob.status === 'training' ? 'peach' : 'amber'}>
            {currentJob.status}
          </StatusPill>
        ) : adapter ? (
          <StatusPill color="mint">live · adapter loaded</StatusPill>
        ) : (
          <StatusPill color="muted">no adapter</StatusPill>
        )}
      </div>

      {currentJob ? <LiveTrainingCard jobId={currentJob.id} /> : null}

      {!currentJob && !adapter ? (
        <div className="card" style={{ padding: 16 }}>
          <div className="card-row">
            <div className="grow">
              <div className="card-title">
                Train {specialist.name} on {corpusSize > 0 ? corpusSize : 'your'} {corpusSize > 0 ? 'recent posts' : 'corpus'}
              </div>
              <div className="card-sub">
                Spawns a fine-tune on Qwen2.5-0.5B-Instruct via 0G Compute. Cost: 0.5 0G, ~30 min.
              </div>
            </div>
            <button className="btn btn-peach" onClick={startTrain} disabled={!canTrain}>
              Train now →
            </button>
          </div>
          {!canTrain ? (
            <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-faint)' }}>
              Connect a corpus from onboarding to enable training.
            </div>
          ) : null}
        </div>
      ) : null}

      {jobs.length > 0 ? (
        <div className="table-card" style={{ marginTop: 12 }}>
          <div className="table-row head" style={{ '--cols': '1.4fr 110px 110px 1.6fr 110px' }}>
            <span>job</span>
            <span>status</span>
            <span>progress</span>
            <span>adapter</span>
            <span>started</span>
          </div>
          {jobs.map((j) => (
            <div key={j.id} className="table-row" style={{ '--cols': '1.4fr 110px 110px 1.6fr 110px' }}>
              <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--peach)' }}>
                {j.id}
              </span>
              <span>
                <StatusPill color={statusColor(j.status)}>{j.status}</StatusPill>
              </span>
              <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--text-2)' }}>
                {j.progress}%
              </span>
              <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'var(--text-2)' }}>
                {j.adapterURI ? `${j.adapterURI.slice(0, 10)}…${j.adapterURI.slice(-6)}` : '—'}
              </span>
              <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'var(--text-faint)' }}>
                {new Date(j.startedAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function LiveTrainingCard({ jobId }) {
  const job = useFineTuneJob(jobId);
  return (
    <div
      className="card"
      style={{
        padding: 16,
        borderColor: 'var(--peach)',
        background: 'var(--peach-04)',
      }}
    >
      <div className="card-row">
        <div className="grow">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Training in progress
            <StatusPill color={statusColor(job.status)}>{job.status}</StatusPill>
          </div>
          <div className="card-sub" style={{ marginTop: 4, fontFamily: 'Geist Mono, monospace' }}>
            {job.meta?.baseModel ?? 'Qwen2.5-0.5B-Instruct'}
            {job.etaSeconds != null ? ` · ~${job.etaSeconds}s left` : ''}
          </div>
        </div>
        <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--peach)' }}>{job.progress}%</div>
      </div>
      <div
        style={{
          marginTop: 12,
          height: 6,
          borderRadius: 3,
          background: 'var(--bg-soft-2)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${job.progress}%`,
            background: 'linear-gradient(90deg, var(--peach-warm), var(--peach-press))',
            transition: 'width 600ms ease',
          }}
        />
      </div>
      {job.error ? (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red)' }}>error: {job.error}</div>
      ) : null}
      {job.adapterURI ? (
        <div
          style={{
            marginTop: 8,
            fontFamily: 'Geist Mono, monospace',
            fontSize: 11,
            color: 'var(--mint)',
          }}
        >
          adapter delivered · {job.adapterURI.slice(0, 12)}…{job.adapterURI.slice(-8)}
        </div>
      ) : null}
    </div>
  );
}

function statusColor(status) {
  if (status === 'training' || status === 'queued') return 'peach';
  if (status === 'delivered') return 'amber';
  if (status === 'live') return 'mint';
  if (status === 'failed') return 'red';
  return 'muted';
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
            <Link to={isDirector ? ROUTES.chat : ROUTES.team(s.id)} className="btn">Open thread →</Link>
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
                  <span>jobs · {s.jobs}</span>
                  <span>model · {s.model}</span>
                  <span>status · {s.status}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                <TokenChip value={s.tokenId} link />
                {s.adapterURI ? <HashChip label="adapter" value={s.adapterURI} /> : <StatusPill color="muted">no adapter</StatusPill>}
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
                <div className="v">{shortAddr(owner) || '@nilesh.eth · 0x4f12…c8b1'}</div>
              </div>
              <div className="proof-row">
                <div className="k">adapterURI</div>
                <div className="v peach">{s.adapterURI ?? 'null · awaiting first train-specialist run'}</div>
              </div>
              <div className="proof-row">
                <div className="k">delegate</div>
                <div className="v">{shortAddr(delegate) || 'orchestrator · 0x91ab…2f7d'}</div>
              </div>
              <div className="proof-row">
                <div className="k">authorizations</div>
                <div className="v">{s.id === 'mantle' ? '0xACME…1f4b · 30d expiry · pattern: with-legal-review' : 'none'}</div>
              </div>
            </div>
          </section>

          {!isDirector ? <TrainingSection specialist={s} /> : null}

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
              {snapshotHistory.map((sn) => (
                <div key={sn.idx} className="table-row" style={{ '--cols': '60px 110px 1fr 1fr 1.4fr' }}>
                  <span style={{ fontFamily: 'Geist Mono, monospace', color: 'var(--text-mute)' }}>#{sn.idx}</span>
                  <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--text-faint)' }}>{sn.when}</span>
                  <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--text-2)' }}>{sn.from}</span>
                  <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--peach)' }}>{sn.to}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{sn.delta}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
