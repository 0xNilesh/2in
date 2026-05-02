// The user's digital twin — defaults that the onboarding wizard overwrites
// (via localStorage). The director below references twin.name dynamically.

export const defaultTwin = {
  name: '2in',
  tagline: 'Director',
  model: 'qwen/qwen-2.5-7b-instruct',
  tokenId: 42,
  status: 'online',
};
