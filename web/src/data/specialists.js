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

export function getDirector() {
  const twin = readTwin();
  return {
    id: 'director',
    initial: (twin.name?.[0] ?? '2').toUpperCase(),
    name: twin.name,
    fullName: `${twin.name} · ${twin.tagline}`,
    role: 'Director',
    tokenId: twin.tokenId,
    parent: null,
    model: twin.model,
    status: twin.status,
    variant: 'dir',
    adapterURI: null,
    corpusURI: '0x0000…master',
    trainedOn: 'master twin · learns from your full corpus',
    jobs: 184,
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
    model: 'qwen3.6-plus + LoRA',
    adapterURI: '0x9a3b…e2bf',
    corpusURI: '0x71f0…aa12',
    status: 'online',
    statusDot: 'mint',
    trainedOn: 'your tweets · captions · essays · DMs',
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
    model: 'qwen3.6-plus',
    adapterURI: null,
    corpusURI: '0x4ee1…0099',
    status: 'online',
    trainedOn: 'your archive · audience analytics · performance history',
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
    model: 'qwen3.6-plus',
    adapterURI: null,
    corpusURI: '0x88c0…d013',
    status: 'online',
    trainedOn: 'rejection_memory · your style guide · brand consistency rules',
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
    model: 'gpt-oss-120b',
    adapterURI: null,
    corpusURI: '0x2bcd…e102',
    status: 'online',
    trainedOn: 'performance_memory · calendar · goals',
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
    model: 'qwen3.6-plus',
    adapterURI: null,
    corpusURI: '0xa11c…ea44',
    status: 'online',
    trainedOn: 'relationship_memory · personal journal · context history',
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
    model: 'qwen3.6-plus + LoRA',
    adapterURI: null,
    corpusURI: null,
    status: 'untrained',
    trainedOn: 'connect podcast / video feed to seed transcripts',
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
    model: 'z-image + qwen3-vl',
    adapterURI: null,
    corpusURI: null,
    status: 'untrained',
    trainedOn: 'your image library + visual style references',
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
    model: 'qwen3.6-plus + LoRA',
    adapterURI: null,
    corpusURI: null,
    status: 'untrained',
    trainedOn: 'connect Gmail / sponsor inbox to seed deal threads',
    jobs: 0,
    description: 'Drafts sponsor replies + deal terms. Opt in if brand deals are part of your work.',
  },
];

// Combined lookup — onboarding mints all 8 minus opt-outs.
export const specialists = [...coreSpecialists, ...optionalSpecialists];

export function getSpecialist(id) {
  if (id === 'director') return getDirector();
  return specialists.find((s) => s.id === id);
}

export function getRoster() {
  return [getDirector(), ...specialists];
}
