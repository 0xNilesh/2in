// Runner toolbox — PLAN.md §4.4. Tool primitives the agent composes per goal.

export const toolGroups = [
  {
    label: 'Video',
    tools: [
      {
        id: 'transcribe',
        name: 'transcribe',
        signature: '(audioUrl) → Transcript',
        backend: '0G Compute · Whisper Large V3',
        status: 'live',
      },
      {
        id: 'find_clips',
        name: 'find_clips',
        signature: '(transcript, n, criteria) → Clip[]',
        backend: '0G Compute · Qwen3.6-Plus structured output',
        status: 'live',
      },
      { id: 'cut', name: 'cut', signature: '(video, start, end) → Video', backend: 'FFmpeg', status: 'live' },
      {
        id: 'reframe',
        name: 'reframe',
        signature: '(video, aspectRatio) → Video',
        backend: 'FFmpeg single-subject pan',
        status: 'live',
      },
      {
        id: 'caption',
        name: 'caption',
        signature: '(video, transcript, style) → Video',
        backend: 'FFmpeg burn-in (pod / karaoke / beasty)',
        status: 'live',
      },
      {
        id: 'clean_audio',
        name: 'clean_audio',
        signature: '(video) → Video',
        backend: 'FFmpeg afftdn + EBU R128',
        status: 'live',
      },
      {
        id: 'reframe_multispeaker',
        name: 'reframe_multispeaker',
        signature: '(video) → Video',
        backend: 'face-api + FFmpeg stack',
        status: 'stretch',
      },
    ],
  },
  {
    label: 'Vision · image',
    tools: [
      { id: 'gen_image', name: 'gen_image', signature: '(prompt, size) → Image', backend: '0G Compute · Z-Image', status: 'live' },
      {
        id: 'analyze_image',
        name: 'analyze_image',
        signature: '(imageUrl) → Description',
        backend: '0G Compute · Qwen3 VL 30B',
        status: 'live',
      },
    ],
  },
  {
    label: 'Storage · post',
    tools: [
      { id: 'store', name: 'store', signature: '(file) → rootHash', backend: '0G Storage Indexer.upload()', status: 'live' },
      {
        id: 'draft_post',
        name: 'draft_post',
        signature: '(platform, content) → StagedPost',
        backend: 'Local DB (no platform OAuth in MVP)',
        status: 'live',
      },
      { id: 'schedule', name: 'schedule', signature: '(when, action) → JobId', backend: 'BullMQ', status: 'live' },
    ],
  },
  {
    label: 'Memory',
    tools: [
      { id: 'read_memory', name: 'read_memory', signature: '(slice, key?) → Value', backend: '0G KV (KvClient)', status: 'live' },
      {
        id: 'write_memory',
        name: 'write_memory',
        signature: '(slice, key, value) → void',
        backend: '0G KV (Batcher + streamDataBuilder)',
        status: 'live',
      },
      {
        id: 'search_memory',
        name: 'search_memory',
        signature: '(slice, query) → Match[]',
        backend: 'Local SQLite index over KV mirror',
        status: 'live',
      },
    ],
  },
  {
    label: 'Marketplace',
    tools: [
      {
        id: 'hire_twin',
        name: 'hire_twin',
        signature: '(targetTokenId, brief) → JobReceipt',
        backend: '0G AgentMarket — EIP-712 order + escrow',
        status: 'stretch',
      },
    ],
  },
];
