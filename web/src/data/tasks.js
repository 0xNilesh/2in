// Tasks the director spawns. Each task = a chosen pattern + ordered steps,
// each step = one sub-agent invocation with optional tool calls and an output.
// The work pane reads from here when ?task=<id> is in the URL.

export const tasks = {
  'task-1284': {
    id: 'task-1284',
    title: 'Sponsored tweet · Acme deal',
    pattern: 'with-legal-review',
    status: 'running',
    cost: '0.11 0G',
    elapsed: '0m 32s',
    progress: { current: 3, total: 5 },
    steps: [
      {
        idx: 1,
        agent: 'researcher',
        label: 'Research the brand',
        status: 'done',
        elapsed: '4.1s',
        tools: [
          { name: 'search_memory', args: 'slice=performance · query="acme"', result: '11 prior brand mentions' },
          { name: 'read_memory', args: 'slice=relationship', result: 'no prior Acme relationship' },
        ],
        output:
          'Acme = home goods, audience overlap with you ~23%. Best brand-mention tweet hit 4.2k engagements (Method, Mar 2026). Their tone: pragmatic, not wholesome. No prior conflict.',
      },
      {
        idx: 2,
        agent: 'writer',
        label: 'Draft v1 in your voice',
        status: 'done',
        elapsed: '6.8s',
        tools: [
          { name: 'read_memory', args: 'slice=voice · k=15', result: '15 closest voice exemplars retrieved' },
          { name: 'read_memory', args: 'slice=preference', result: 'tone=terse · cadence=morning posts' },
        ],
        output:
          'Acme just changed how my mornings work. Their filter pitcher is the only thing on my counter that earns its space — that\'s a rare bar in this house.',
      },
      {
        idx: 3,
        agent: 'editor',
        label: 'Legal review',
        status: 'live',
        elapsed: '8.2s',
        tools: [
          { name: 'search_memory', args: 'slice=rejection · this month', result: '3 rejections for superlatives' },
          { name: 'read_memory', args: 'contracts/acme.pdf', result: 'endorsement clause §4.2 present' },
        ],
        output:
          'Two flags: (1) reads as endorsement — add #ad. (2) cross-ref rejection_memory: superlatives killed this month. Suggest "earned a spot."',
      },
      {
        idx: 4,
        agent: 'writer',
        label: 'Revise on Mantle\'s notes',
        status: 'pending',
      },
      {
        idx: 5,
        agent: 'editor',
        label: 'Final pass · gate against rejection_memory',
        status: 'pending',
      },
    ],
  },

  'task-1281': {
    id: 'task-1281',
    title: '5 podcast hooks · founder rituals',
    pattern: 'content-draft',
    status: 'approved',
    cost: '0.07 0G',
    elapsed: '0m 18s',
    progress: { current: 3, total: 3 },
    steps: [
      {
        idx: 1,
        agent: 'researcher',
        label: 'Pull recent themes',
        status: 'done',
        elapsed: '2.4s',
        tools: [{ name: 'search_memory', args: 'slice=relationship · query="founder rituals"', result: '11 posts in last 60d' }],
        output: 'Theme is in your top-3 of the quarter. Audience skews founder/operator, 31-44.',
      },
      {
        idx: 2,
        agent: 'writer',
        label: 'Draft 5 hooks',
        status: 'done',
        elapsed: '5.1s',
        tools: [{ name: 'read_memory', args: 'slice=voice · k=20', result: '20 closest hooks retrieved' }],
        output:
          '1. "The rituals you don\'t notice are the ones running you."\n2. "Founder mode isn\'t a vibe. It\'s a 4am decision."\n3. "Three rituals I stopped this year — and what changed."\n4. "Your morning routine is a liability if you can\'t skip it."\n5. "The opposite of discipline isn\'t laziness. It\'s drift."',
      },
      {
        idx: 3,
        agent: 'editor',
        label: 'Final pass',
        status: 'done',
        elapsed: '2.0s',
        tools: [{ name: 'search_memory', args: 'slice=rejection', result: 'no overlap' }],
        output: 'All five clean. Ship.',
      },
    ],
  },

  'task-1276': {
    id: 'task-1276',
    title: 'Cold open script · Ep 48',
    pattern: 'content-draft',
    status: 'awaiting-approval',
    cost: '0.09 0G',
    elapsed: '0m 22s',
    progress: { current: 3, total: 3 },
    steps: [
      {
        idx: 1,
        agent: 'researcher',
        label: 'Pull cadence references',
        status: 'done',
        elapsed: '3.2s',
        tools: [{ name: 'read_memory', args: 'slice=voice · medium=podcast · k=10', result: '10 cold-open exemplars' }],
        output: '10 prior cold-opens in your cadence retrieved. Avg length 28s.',
      },
      {
        idx: 2,
        agent: 'voice',
        label: 'Write cold open in your spoken cadence',
        status: 'done',
        elapsed: '7.4s',
        tools: [{ name: 'read_memory', args: 'slice=preference', result: 'pace=slow · open=question' }],
        output:
          "I want to talk about something I've been getting wrong for a year. I thought I was burned out. Turns out — I was bored. And those two things look identical from the outside, but the fix is the opposite. Here's what changed.",
      },
      {
        idx: 3,
        agent: 'editor',
        label: 'Final pass',
        status: 'done',
        elapsed: '1.8s',
        tools: [{ name: 'search_memory', args: 'slice=rejection', result: 'no overlap' }],
        output: 'Reads in 28s at your pace. Approved subject to your sign-off.',
      },
    ],
  },
};

export function getTask(id) {
  return tasks[id] ?? null;
}

export const stepStatusColor = {
  done: 'mint',
  live: 'peach',
  pending: 'muted',
  failed: 'red',
};
