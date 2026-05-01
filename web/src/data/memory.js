// Typed memory slices (PLAN.md §6). Each specialist has its own namespace.

export const memorySlices = [
  {
    id: 'voice',
    label: 'voice_memory',
    description: 'Voice / style examples. Trained-on corpus + every shipped post.',
    schema: '{ platform, text, performance, embedding?, timestamp }',
    namespace: 'twin:42:specialist:43:slice:voice',
    rootHash: '0x71f0…aa12',
    entries: 312,
    lastWrite: '14m ago',
    primaryReader: 'Quill',
    primaryWriter: 'Runner-on-publish, Observer',
    samples: [
      { who: 'Quill', text: 'tweet · "the rituals you don\'t notice are the ones running you."', when: '2 days ago' },
      { who: 'Cadence', text: 'podcast intro · "I want to talk about something I\'ve been getting wrong…"', when: '4 days ago' },
      { who: 'Quill', text: 'caption · "founder mode isn\'t a vibe. it\'s a 4am decision."', when: '1 week ago' },
    ],
  },
  {
    id: 'preference',
    label: 'preference_memory',
    description: 'Forbidden topics, tone-per-platform, posting cadence — with provenance.',
    schema: '{ forbiddenTopics, tonePerPlatform, postingCadence, provenance }',
    namespace: 'twin:42:slice:preference',
    rootHash: '0x4e21…71b3',
    entries: 47,
    lastWrite: '1h ago',
    primaryReader: 'Strategist, Quill, Mark',
    primaryWriter: 'Creator overrides, Mark inferences',
    samples: [
      { who: 'creator override', text: 'never publish on Sundays', when: '3h ago' },
      { who: 'Mark inference', text: 'X drafts < 220 chars get higher engagement', when: '1d ago' },
      { who: 'creator override', text: 'avoid superlatives this month', when: '5d ago' },
    ],
  },
  {
    id: 'performance',
    label: 'performance_memory',
    description: 'Time-series metrics per shipped post. Read by Observer + Strategist.',
    schema: '{ postRef, platform, metrics, observedAt }',
    namespace: 'twin:42:slice:performance',
    rootHash: '0x2bcd…e102',
    entries: 184,
    lastWrite: '30m ago',
    primaryReader: 'Observer, Strategist',
    primaryWriter: 'Observer pulls (stubbed for MVP)',
    samples: [
      { who: 'observer', text: 'post 0x33ad — 4.2k engagements (X)', when: '30m ago' },
      { who: 'observer', text: 'post 0x77bc — 720 plays (podcast Ep47)', when: '2h ago' },
    ],
  },
  {
    id: 'rejection',
    label: 'rejection_memory',
    description: 'What got killed and why. Hard-read by Mark, soft-read by Quill.',
    schema: '{ draft, rejectionReason, replacementDraft?, by }',
    namespace: 'twin:42:specialist:46:slice:rejection',
    rootHash: '0x88c0…d013',
    entries: 128,
    lastWrite: '14m ago',
    primaryReader: 'Mark, Quill',
    primaryWriter: 'Mark rejects, creator overrides',
    samples: [
      {
        who: 'Mark rejected',
        text: '"only thing on my counter that earns its space" → "earned a spot." (superlative drift)',
        when: '14m ago',
      },
      { who: 'creator override', text: '"founder mode" reads off — try "founder hours."', when: '4d ago' },
    ],
  },
  {
    id: 'relationship',
    label: 'relationship_memory',
    description: 'Collaborators, recurring themes, audience segments.',
    schema: '{ collaborators, recurringThemes, audienceSegments }',
    namespace: 'twin:42:slice:relationship',
    rootHash: '0xa11c…ea44',
    entries: 22,
    lastWrite: '2d ago',
    primaryReader: 'Strategist, Quill',
    primaryWriter: 'Observer + Strategist',
    samples: [
      { who: 'observer', text: '@hannah — 3 cross-promos in last quarter', when: '2d ago' },
      { who: 'strategist', text: 'theme: founder rituals — 11 posts in last 60d', when: '5d ago' },
    ],
  },
];

export function getMemorySlice(id) {
  return memorySlices.find((s) => s.id === id);
}
