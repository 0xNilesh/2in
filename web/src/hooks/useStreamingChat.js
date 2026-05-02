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
// picks via classifier), or null (no dispatch).
//
// Strategy: only pass an explicit pattern when EXACTLY one pattern name
// appears in the director's reply. If 0 or 2+ are mentioned (e.g., the
// director's prose hallucinated multiple), fall through to '__auto__' so
// the server's Qwen classifier picks based on the USER'S goal text rather
// than our regex scanning the director's potentially muddled prose.
function detectPattern(text) {
  const patterns = [
    'absorb',
    'answer',
    'daily-post',
    'with-research',
    'weekly-plan',
    'weekly-review',
    'dm-reply',
    'audit-week',
    'visual-post',
    'sponsor-reply',
    'clip-shorts',
  ];
  const found = patterns.filter((p) => text.includes(p));
  if (found.length === 1) return found[0];
  if (found.length > 1) return '__auto__';
  // Director didn't name a pattern but used a dispatch verb — let the
  // server's classifier decide. Common phrasings:
  //   "Dispatching Writer..."        / "I'll dispatch..."
  //   "Routing content request..."   / "Routing through..."
  //   "Spawning a task..."           / "Kicking off..."
  //   "Handing this to..."           / "I'll have Researcher and Editor..."
  //   "Sending Researcher and Editor to..."
  const dispatchVerbs = /\b(dispatch(ing|ed)?|i'?ll (route|spawn|run|kick off|hand|have|send)|spawn(ing)?|routing|kicking off|handing (this|it) to|sending (writer|researcher|editor|strategist|companion|voice|visual|negotiator))\b/i;
  if (dispatchVerbs.test(text)) return '__auto__';
  return null;
}
