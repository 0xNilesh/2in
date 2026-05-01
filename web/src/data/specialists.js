// Roster modeled on PLAN.md §0 / §4.1.
// The director (the user's digital twin) is named at onboarding and lives in twin.js.
// Specialists are subagents the director dispatches.

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

export const specialists = [
  {
    id: 'quill',
    initial: 'Q',
    name: 'Quill',
    fullName: 'Quill',
    role: 'Writer',
    tokenId: 43,
    parent: 42,
    model: 'qwen3.6-plus + LoRA',
    adapterURI: '0x9a3b…e2bf',
    corpusURI: '0x71f0…aa12',
    status: 'online',
    statusDot: 'mint',
    trainedOn: '312 tweets · 47 essays · 18 captions',
    jobs: 76,
    description: 'Drafts in your voice. Trained on your tweets, captions and essays.',
  },
  {
    id: 'cadence',
    initial: 'C',
    name: 'Cadence',
    fullName: 'Cadence',
    role: 'Voice',
    tokenId: 44,
    parent: 42,
    model: 'qwen3.6-plus + LoRA',
    adapterURI: '0x6c12…704a',
    corpusURI: '0x4f3e…b201',
    status: 'idle',
    trainedOn: '24 podcast transcripts · 56 video transcripts',
    jobs: 41,
    description: 'Spoken cadence. Drafts script-style content for read-aloud.',
  },
  {
    id: 'mantle',
    initial: 'M',
    name: 'Mantle',
    fullName: 'Mantle',
    role: 'Legal',
    tokenId: 45,
    parent: 42,
    model: 'qwen3.6-plus + LoRA',
    adapterURI: '0x2db8…11c3',
    corpusURI: '0xa11c…ea44',
    status: 'live',
    statusDot: 'peach',
    trainedOn: '14 sponsor contracts · brand guidelines · 9 flagged posts',
    jobs: 33,
    description: 'Reviews drafts pre-publish. Flags risk against your contract clauses.',
  },
  {
    id: 'mark',
    initial: 'M',
    name: 'Mark',
    fullName: 'Mark',
    role: 'Editor',
    tokenId: 46,
    parent: 42,
    model: 'qwen3.6-plus',
    adapterURI: null,
    corpusURI: '0x88c0…d013',
    status: 'online',
    trainedOn: '128 rejected drafts with reasons',
    jobs: 92,
    description: 'Final critique pass. Gates against your rejection_memory.',
  },
  {
    id: 'scout',
    initial: 'S',
    name: 'Scout',
    fullName: 'Scout',
    role: 'Researcher',
    tokenId: 47,
    parent: 42,
    model: 'qwen3.6-plus',
    adapterURI: null,
    corpusURI: '0x4ee1…0099',
    status: 'idle',
    trainedOn: 'archive + audience analytics',
    jobs: 21,
    description: 'Surfaces facts and performance patterns from your archive.',
  },
];

export function getSpecialist(id) {
  if (id === 'director') return getDirector();
  return specialists.find((s) => s.id === id);
}

// Convenience: every roster member including the director.
export function getRoster() {
  return [getDirector(), ...specialists];
}
