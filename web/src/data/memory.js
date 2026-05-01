// Typed memory slices — matches server/services/memory.ts MEMORY_TYPES.
// "Identity emerges from memory over time" — the 6 types are the surface
// area for that growth.

export const memorySlices = [
  {
    id: 'episodic',
    label: 'episodic',
    description: 'Events that happened — shipped posts, conversations, decisions. Each entry is a discrete moment with a timestamp.',
    schema: '{ text, source, ts, reinforcement, stable }',
    namespace: 'twin:42:mem:episodic',
    rootHash: '0x71f0…aa12',
    primaryReader: 'Researcher · Strategist · Writer',
    primaryWriter: 'every specialist after every step',
    icon: '◐',
  },
  {
    id: 'semantic',
    label: 'semantic',
    description: 'Stable facts about you and the world. "Tone=terse", "you host a podcast", "you avoid hashtags". The facts that don\'t change.',
    schema: '{ text, source, ts, reinforcement, stable }',
    namespace: 'twin:42:mem:semantic',
    rootHash: '0x4e21…71b3',
    primaryReader: 'every specialist',
    primaryWriter: 'Companion · Researcher',
    icon: '◊',
  },
  {
    id: 'relationship',
    label: 'relationship',
    description: 'About people in your life — collaborators, sponsors, contacts. "Acme rep is pragmatic, owes follow-up".',
    schema: '{ text, source, ts, reinforcement, stable }',
    namespace: 'twin:42:mem:relationship',
    rootHash: '0xa11c…ea44',
    primaryReader: 'Companion · Negotiator · Writer',
    primaryWriter: 'Companion · Negotiator',
    icon: '◇',
  },
  {
    id: 'temporal',
    label: 'temporal',
    description: 'Time-anchored patterns. "Morning posts perform 3× evening posts". "Sunday rejection rate spikes". Sweep periodically; the truth changes.',
    schema: '{ text, source, ts, reinforcement, stable }',
    namespace: 'twin:42:mem:temporal',
    rootHash: '0x2bcd…e102',
    primaryReader: 'Strategist · Writer',
    primaryWriter: 'Strategist',
    icon: '⌒',
  },
  {
    id: 'procedural',
    label: 'procedural',
    description: 'How-to rules. "Never use superlatives". "Always #ad on sponsor posts". "When sponsor brief comes in, route to Negotiator first".',
    schema: '{ text, source, ts, reinforcement, stable }',
    namespace: 'twin:42:mem:procedural',
    rootHash: '0x88c0…d013',
    primaryReader: 'Editor · Director (routing)',
    primaryWriter: 'Editor on rejection',
    icon: '⌬',
  },
  {
    id: 'working',
    label: 'working',
    description: 'In-flight task context. Cleared when the task completes. Never persisted, never anchored. The scratchpad.',
    schema: '{ text, source, ts }',
    namespace: 'twin:42:mem:working',
    rootHash: '0x0000…0000',
    primaryReader: 'current task only',
    primaryWriter: 'orchestrator',
    icon: '○',
  },
];

export function getMemorySlice(id) {
  return memorySlices.find((s) => s.id === id);
}
