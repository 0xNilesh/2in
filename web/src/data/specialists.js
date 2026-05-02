// Roster — 8 role-only specialists.
//
// Five core (always minted on onboarding) + three optional (opt-in based on
// creator type). Personal names removed — each specialist is just its role,
// which keeps prompts unambiguous and dynamic routing easier for the LLM.
//
// The director (master twin) is named by the user during onboarding and lives
// separately in twin.js; specialists are role-typed children minted via
// iCloneFrom.

import { readTwin } from '../hooks/useTwin.js';

const MINTS_KEY = '2in:mints';

// Map persisted mint results { master, writer, researcher, ... } to the
// real tokenIds + tx hashes recorded by useMintRoster after onboarding's
// mint flow. Falls back to the static demo tokenId when nothing's been
// persisted (e.g. fresh browser, or the mock-mode mint flow).
function readMints() {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(window.localStorage.getItem(MINTS_KEY) ?? '{}'); }
  catch { return {}; }
}

function realTokenId(specialistId, fallback) {
  const m = readMints()[specialistId];
  return m?.tokenId ?? fallback;
}

function realTxHash(specialistId) {
  return readMints()[specialistId]?.txHash ?? null;
}

export function getDirector() {
  const twin = readTwin();
  // Master mint persists under id 'master' in useMintRoster.
  const tokenId = realTokenId('master', twin.tokenId);
  return {
    id: 'director',
    initial: (twin.name?.[0] ?? '2').toUpperCase(),
    name: twin.name,
    fullName: `${twin.name} · ${twin.tagline}`,
    role: 'Director',
    tokenId,
    parent: null,
    model: twin.model,
    status: twin.status,
    variant: 'dir',
    adapterURI: null,
    corpusURI: null,
    trainedOn: 'master twin · learns from your full corpus',
    txHash: realTxHash('master'),
    description:
      'Master twin. Plan-reflect loop, picks the orchestration pattern, dispatches subagents and tools.',
  };
}

// === Core 5 — always minted ============================================
export const coreSpecialists = [
  {
    id: 'writer',
    initial: 'W',
    name: 'Writer',
    fullName: 'Writer',
    role: 'Writer',
    tier: 'core',
    tokenId: 43,
    parent: 42,
    model: 'qwen/qwen-2.5-7b-instruct',
    adapterURI: null,
    corpusURI: null,
    status: 'online',
    statusDot: 'mint',
    trainedOn: 'reads semantic + episodic + temporal · writes episodic',
    jobs: 76,
    description: 'Drafts everything in your voice — posts, replies, captions, emails. Most-used specialist.',
  },
  {
    id: 'researcher',
    initial: 'R',
    name: 'Researcher',
    fullName: 'Researcher',
    role: 'Researcher',
    tier: 'core',
    tokenId: 44,
    parent: 42,
    model: 'qwen/qwen-2.5-7b-instruct',
    adapterURI: null,
    corpusURI: null,
    status: 'online',
    trainedOn: 'reads episodic + temporal · writes semantic + episodic',
    jobs: 92,
    description: 'Pulls facts, performance signals, audience overlap. Called by every other specialist for context.',
  },
  {
    id: 'editor',
    initial: 'E',
    name: 'Editor',
    fullName: 'Editor',
    role: 'Editor',
    tier: 'core',
    tokenId: 45,
    parent: 42,
    model: 'qwen/qwen-2.5-7b-instruct',
    adapterURI: null,
    corpusURI: null,
    status: 'online',
    trainedOn: 'reads procedural + semantic · writes procedural',
    jobs: 64,
    description: 'Final pass. Gates drafts against what you killed before; checks tone + consistency.',
  },
  {
    id: 'strategist',
    initial: 'S',
    name: 'Strategist',
    fullName: 'Strategist',
    role: 'Strategist',
    tier: 'core',
    tokenId: 46,
    parent: 42,
    model: 'qwen/qwen-2.5-7b-instruct',
    adapterURI: null,
    corpusURI: null,
    status: 'online',
    trainedOn: 'reads temporal + episodic · writes temporal',
    jobs: 31,
    description: '"Should I post this now?" · weekly themes · content cadence · goal tracking.',
  },
  {
    id: 'companion',
    initial: 'C',
    name: 'Companion',
    fullName: 'Companion',
    role: 'Companion',
    tier: 'core',
    tokenId: 47,
    parent: 42,
    model: 'qwen/qwen-2.5-7b-instruct',
    adapterURI: null,
    corpusURI: null,
    status: 'online',
    trainedOn: 'reads relationship + semantic · writes semantic + relationship',
    jobs: 22,
    description: 'Personal memory keeper. "Remember this", "who is this person", reflections.',
  },
];

// === Optional 3 — opt-in during onboarding =============================
export const optionalSpecialists = [
  {
    id: 'voice',
    initial: 'V',
    name: 'Voice',
    fullName: 'Voice',
    role: 'Voice',
    tier: 'optional',
    tokenId: 48,
    parent: 42,
    model: 'qwen/qwen-2.5-7b-instruct',
    adapterURI: null,
    corpusURI: null,
    status: 'untrained',
    trainedOn: 'reads semantic + episodic · writes episodic',
    jobs: 0,
    description: 'Spoken cadence. Drafts script-style content for read-aloud — only useful for podcasters / video creators.',
  },
  {
    id: 'visual',
    initial: 'I',
    name: 'Visual',
    fullName: 'Visual',
    role: 'Visual',
    tier: 'optional',
    tokenId: 49,
    parent: 42,
    model: 'qwen/qwen-image-edit-2511',
    adapterURI: null,
    corpusURI: null,
    status: 'untrained',
    trainedOn: 'reads semantic · writes episodic',
    jobs: 0,
    description: 'Generates + analyses images. Cover art, hero visuals, alt-text — opt in if you post visuals.',
  },
  {
    id: 'negotiator',
    initial: 'N',
    name: 'Negotiator',
    fullName: 'Negotiator',
    role: 'Negotiator',
    tier: 'optional',
    tokenId: 50,
    parent: 42,
    model: 'qwen/qwen-2.5-7b-instruct',
    adapterURI: null,
    corpusURI: null,
    status: 'untrained',
    trainedOn: 'reads relationship + procedural · writes relationship',
    jobs: 0,
    description: 'Drafts sponsor replies + deal terms. Opt in if brand deals are part of your work.',
  },
];

// Combined lookup — onboarding mints all 8 minus opt-outs.
export const specialists = [...coreSpecialists, ...optionalSpecialists];

export function getSpecialist(id) {
  if (id === 'director') return getDirector();
  const base = specialists.find((s) => s.id === id);
  if (!base) return null;
  return {
    ...base,
    tokenId: realTokenId(id, base.tokenId),
    txHash: realTxHash(id),
  };
}

export function getRoster() {
  return [getDirector(), ...specialists.map((s) => ({
    ...s,
    tokenId: realTokenId(s.id, s.tokenId),
    txHash: realTxHash(s.id),
  }))];
}

/** Re-exported so other places (Settings reset, debug tools) can clear
 *  the persisted mint map. */
export function clearMints() {
  try { window.localStorage.removeItem(MINTS_KEY); } catch {}
}
