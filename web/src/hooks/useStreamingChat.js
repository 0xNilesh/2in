// Streaming chat hook. Sends a message to /api/chat/director (or
// /api/chat/specialist/:id), accumulates tokens, exposes:
//
//   { send, stop, isStreaming, partial, error, taskCue }
//
// Also detects when the director's reply implies a task should be spawned —
// the mock backend hints with phrases like "**with-legal-review**" or
// "**content-draft**". When a hint is found, it's surfaced as `taskCue`
// (string) so the caller can fire spawnTask().

import { useCallback, useRef, useState } from 'react';
import { ssePost } from '../lib/sse.js';

export function useStreamingChat({ target = 'director' } = {}) {
  const [partial, setPartial] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [taskCue, setTaskCue] = useState(null);
  const channelRef = useRef(null);

  const stop = useCallback(() => {
    channelRef.current?.close();
    channelRef.current = null;
    setIsStreaming(false);
  }, []);

  const send = useCallback((messages, { twin, model } = {}) => {
    stop();
    setPartial('');
    setError(null);
    setTaskCue(null);
    setIsStreaming(true);

    const url =
      target === 'director'
        ? '/api/chat/director'
        : `/api/chat/specialist/${target}`;

    let acc = '';
    const channel = ssePost(url, { messages, twin, model });
    channelRef.current = channel;

    channel.onEvent('token', ({ delta }) => {
      acc += delta;
      setPartial(acc);
      const cue = detectPattern(acc);
      if (cue) setTaskCue(cue);
    });
    channel.onEvent('done', () => {
      setIsStreaming(false);
      channelRef.current = null;
    });
    channel.onEvent('error', ({ message }) => {
      setError(message);
      setIsStreaming(false);
      channelRef.current = null;
    });
    channel.onEvent('close', () => {
      setIsStreaming(false);
      channelRef.current = null;
    });

    return channel;
  }, [target, stop]);

  return { send, stop, isStreaming, partial, error, taskCue };
}

// Returns either an explicit pattern id, the sentinel '__auto__' (server
// picks via LLM router), or null (no dispatch).
function detectPattern(text) {
  const patterns = [
    'daily-post',
    'with-research',
    'weekly-plan',
    'dm-reply',
    'audit-week',
    'visual-post',
    'sponsor-reply',
    'clip-shorts',
  ];
  for (const p of patterns) {
    if (text.includes(p)) return p;
  }
  // Director didn't name a pattern but used a dispatch verb — let the
  // server's LLM router decide. Common phrasings:
  //   "Dispatching Writer..."  / "I'll dispatch..."
  //   "Routing through..."     / "Spawning a task..."
  //   "Kicking off..."         / "Handing this to..."
  //   "I'll have Researcher and Editor..."
  const dispatchVerbs = /\b(dispatch(ing|ed)?|i'?ll (route|spawn|run|kick off|hand|have)|spawn(ing)?|routing through|kicking off|handing this to)\b/i;
  if (dispatchVerbs.test(text)) return '__auto__';
  return null;
}
