// Route constants. Single source of truth so rail, links, and tests all agree.

export const ROUTES = {
  landing: '/',
  onboarding: '/onboarding',
  chat: '/chat',
  chatThread: (id) => `/chat/${id}`,
  specialist: (id) => `/specialist/${id}`,
  activity: '/activity',
  memory: '/memory',
  memorySlice: (id) => `/memory/${id}`,
  patterns: '/patterns',
  tools: '/tools',
  library: '/library',
  settings: '/settings',
};
