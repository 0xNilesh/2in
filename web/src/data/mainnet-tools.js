// Tools whose underlying 0G Compute model only lives on mainnet today.
//
// As of the current Galileo (testnet) compute provider catalog, the
// following capabilities work locally / on testnet:
//   - chat: qwen-2.5-7b-instruct (text-only)
//   - image edit: qwen-image-edit-2511
// The vision, image-gen, speech-to-text, and the larger reasoning models
// listed below are only on the 0G mainnet provider catalog (per pc.0g.ai):
//   - openai/whisper-large-v3        → transcribe
//   - z-image                        → gen_image
//   - qwen/qwen3-vl-30b-a3b-instruct → analyze_image, video.summarize
//
// We render these existing tools as DISABLED with a "needs 0G mainnet · soon"
// pill instead of the green "live" badge. Same honesty principle as
// Settings → Connected sources.

export const MAINNET_REQUIRED_TOOLS = new Set([
  'transcribe',
  'gen_image',
  'analyze_image',
  'video.summarize',
]);

// Returns the mainnet model that powers a given tool, for display in the
// disabled card. null when the tool isn't mainnet-gated.
export function mainnetModelFor(toolName) {
  switch (toolName) {
    case 'transcribe':       return 'openai/whisper-large-v3';
    case 'gen_image':        return 'z-image';
    case 'analyze_image':    return 'qwen/qwen3-vl-30b-a3b-instruct';
    case 'video.summarize':  return 'qwen/qwen3-vl-30b-a3b-instruct';
    default: return null;
  }
}

// Mainnet-only chat/reasoning models we don't have a dedicated tool for yet.
// Surfaced as disabled "coming on mainnet" cards in their own section so
// the catalog reflects the full 0G compute roster, not just what's wired.
// Each entry mimics the shape of a real tool (name, description, category,
// input) so it can flow through the same ToolCard layout.
export const MAINNET_PENDING_TOOLS = [
  {
    _pending: true,
    name: 'chat.deepseek_v3',
    description:
      'DeepSeek-V3.2 — 671B MoE with hybrid thinking mode, native tool calls, 131K context. Strong at coding, math, multi-step reasoning.',
    category: 'compute',
    _model: 'deepseek/deepseek-chat-v3-0324',
    _pricing: '$0.91 in · $2.74 out per 1M tokens',
    input: { properties: {}, required: [] },
  },
  {
    _pending: true,
    name: 'chat.qwen3_6_plus',
    description:
      "Alibaba's Qwen3.6-Plus — flagship LLM with hybrid linear attention + sparse MoE. Optimised for agentic coding and multi-step workflows. 1M context, 119 languages.",
    category: 'compute',
    _model: 'qwen3.6-plus',
    _pricing: '$0.80 in · $4.80 out per 1M tokens',
    input: { properties: {}, required: [] },
  },
  {
    _pending: true,
    name: 'chat.glm_5',
    description:
      'Z.ai GLM-5 — flagship reasoning model with native tool calling. Thinking is on by default.',
    category: 'compute',
    _model: 'zai-org/GLM-5-FP8',
    _pricing: '$0.72 in · $4.20 out per 1M tokens',
    input: { properties: {}, required: [] },
  },
  {
    _pending: true,
    name: 'chat.glm_5_1',
    description:
      'Z.ai GLM-5.1 — FP8 quantised reasoning variant. Lower-cost inference, same tool-calling surface as GLM-5.',
    category: 'compute',
    _model: 'zai-org/GLM-5.1-FP8',
    _pricing: '$0.93 in · $7.80 out per 1M tokens',
    input: { properties: {}, required: [] },
  },
];
