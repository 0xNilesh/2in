// Multi-thread chat history. Each thread has a participant ('director' for 2in,
// or a specialist id for direct subagent chat). Director threads can include
// taskRef messages — clicking the resulting task card opens the work pane.

export const threads = [
  {
    id: 't-acme',
    participant: 'director',
    title: 'Acme sponsored tweet',
    updatedAt: '14:22',
    day: 'Today · Apr 27',
    messages: [
      {
        kind: 'user',
        text: 'Draft a sponsored tweet for the Acme deal.',
        ts: '@nilesh · 14:22',
      },
      {
        kind: 'agent',
        from: 'director',
        ts: '14:22',
        body: {
          intro: [
            "Acme involves a contract clause + endorsement language. I'll dispatch ",
            { code: 'with-legal-review' },
            ' across 5 specialists.',
          ],
          taskRef: 'task-1284',
        },
      },
    ],
  },
  {
    id: 't-hooks',
    participant: 'director',
    title: '5 hooks for Episode 48',
    updatedAt: '10:14',
    day: 'Today · Apr 27',
    messages: [
      {
        kind: 'user',
        text: ['Give me 5 hooks for my next podcast about founder rituals.'],
        ts: '@nilesh · 10:14',
      },
      {
        kind: 'agent',
        from: 'director',
        ts: '10:14',
        body: {
          intro: [
            "I'll route this through ",
            { code: 'content-draft' },
            ' — Quill drafts in your voice, Mark gates against rejection_memory.',
          ],
          taskRef: 'task-1281',
        },
      },
      {
        kind: 'agent',
        from: 'director',
        ts: '10:14',
        body: {
          intro: ['Done — five hooks, all in your voice and clean of rejection patterns:'],
          hooks: [
            '"The rituals you don\'t notice are the ones running you."',
            '"Founder mode isn\'t a vibe. It\'s a 4am decision."',
            '"Three rituals I stopped this year — and what changed."',
            '"Your morning routine is a liability if you can\'t skip it."',
            '"The opposite of discipline isn\'t laziness. It\'s drift."',
          ],
        },
      },
    ],
  },
  {
    id: 't-coldopen',
    participant: 'director',
    title: 'Cold open · Ep 48',
    updatedAt: 'Yesterday',
    day: 'Yesterday · Apr 26',
    messages: [
      {
        kind: 'user',
        text: 'Cold open script for Ep 48, ~30s.',
        ts: '@nilesh · 18:02',
      },
      {
        kind: 'agent',
        from: 'director',
        ts: '18:02',
        body: {
          intro: ['Cadence has the spoken-style adapter. Routing through ', { code: 'content-draft' }, '.'],
          taskRef: 'task-1276',
        },
      },
      {
        kind: 'agent',
        from: 'director',
        ts: '18:03',
        body: {
          intro: ['Cold open ready · awaiting your sign-off:'],
          draft: [
            "I want to talk about something I've been getting wrong for a year. I thought I was burned out. Turns out — I was bored. And those two things look identical from the outside, but the fix is the opposite. Here's what changed.",
          ],
          draftMeta: ['286 chars · 28s read', { ok: 'in voice ✓' }],
        },
      },
    ],
  },
  {
    id: 't-burnout',
    participant: 'director',
    title: 'Burnout vs boredom essay',
    updatedAt: '2d ago',
    day: '2d ago',
    messages: [
      {
        kind: 'user',
        text: 'Outline a 600-word essay on the burnout vs boredom thesis.',
        ts: '@nilesh · 09:04',
      },
      {
        kind: 'agent',
        from: 'director',
        ts: '09:04',
        body: {
          intro: ['Outline below. I\'ll route to Quill for the full draft once you pick the angle.'],
          hooks: [
            'Open: a personal misdiagnosis (burnout, then realised boredom).',
            'Section 1: how the two feel identical from the outside.',
            'Section 2: the fixes are opposite — rest vs. friction.',
            'Section 3: three signs you\'re bored, not broken.',
            'Close: a small action you can run this week.',
          ],
        },
      },
    ],
  },
  // Direct subagent threads
  {
    id: 't-quill-direct',
    participant: 'quill',
    title: 'Quill · direct',
    updatedAt: 'Yesterday',
    day: 'Yesterday · Apr 26',
    messages: [
      {
        kind: 'user',
        text: 'Tighten this hook: "Burnout is loud. Boredom is what actually kills the work."',
        ts: '@nilesh · 09:02',
      },
      {
        kind: 'agent',
        from: 'quill',
        ts: '09:02',
        body: {
          intro: ['Saved to ', { code: 'preference_memory' }, ' — terse over rhythmic. New v1:'],
          draft: ['Burnout gets the headlines. Boredom is what actually kills the work.'],
          draftMeta: ['67 chars', { ok: 'in voice ✓' }],
        },
      },
    ],
  },
  {
    id: 't-mantle-direct',
    participant: 'mantle',
    title: 'Mantle · direct',
    updatedAt: '2d ago',
    day: '2d ago',
    messages: [
      {
        kind: 'user',
        text: 'Review the Acme contract clause about "exclusive endorsement window."',
        ts: '@nilesh · 13:48',
      },
      {
        kind: 'agent',
        from: 'mantle',
        ts: '13:48',
        body: {
          intro: ['Pulled the clause. Two flags:'],
          hooks: [
            '"Exclusive endorsement window" is 90 days — your prior Method deal lapses Aug 14, this would conflict for 22 days.',
            'Clause 4.2 lacks an FTC-required disclosure carve-out. Push back on language: "where required by law, Influencer may disclose…"',
          ],
        },
      },
    ],
  },
];

// Director threads only (for the rail's "Recent chats with 2in" section).
export function directorThreads() {
  return threads.filter((t) => t.participant === 'director');
}

export function specialistThread(specialistId) {
  return threads.find((t) => t.participant === specialistId);
}

export function getThread(id) {
  return threads.find((t) => t.id === id) ?? null;
}

export function defaultDirectorThreadId() {
  const director = directorThreads();
  return director[0]?.id ?? null;
}
