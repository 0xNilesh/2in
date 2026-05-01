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

function detectPattern(text) {
  // Look for emphasized pattern names — the mock director uses **name**.
  const patterns = ['with-legal-review', 'content-draft', 'clip-pipeline'];
  for (const p of patterns) {
    if (text.includes(`**${p}**`) || text.includes(p)) return p;
  }
  return null;
}
