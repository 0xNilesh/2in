// The user's digital twin — defaults that the onboarding wizard overwrites
// (via localStorage). The director below references twin.name dynamically.

export const defaultTwin = {
  name: '2in',
  tagline: 'Director',
  model: 'gpt-oss-120b',
  tokenId: 42,
  status: 'online',
};
