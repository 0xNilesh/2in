// Multi-thread chat history. Threads start empty — every message is created
// at runtime by the user and the director's streamed reply. The seed
// "Acme tweet" / "5 hooks" / "cold open" demo threads were removed because
// they made the chat look prefilled with hardcoded data and obscured the
// fact that real LLM streaming + task spawning are wired underneath.
//
// If you want a populated demo thread, create it via the UI ("+ New chat")
// and the messages get persisted to localStorage under '2in:thread-ext'.

export const threads = [
  {
    id: 't-default',
    participant: 'director',
    title: 'New chat',
    updatedAt: 'now',
    day: new Date().toDateString(),
    messages: [],
  },
];

export function directorThreads() {
  return threads.filter((t) => t.participant === 'director');
}

export function specialistThread(specialistId) {
  return threads.find((t) => t.participant === specialistId) ?? null;
}

export function getThread(id) {
  return threads.find((t) => t.id === id) ?? null;
}

export function defaultDirectorThreadId() {
  const director = directorThreads();
  return director[0]?.id ?? null;
}
