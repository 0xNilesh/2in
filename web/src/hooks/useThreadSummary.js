// Per-thread conversation summary cache.
//
// When a thread grows past TURN_CAP_VERBATIM (10) messages, the server's
// chat endpoint only sees the last 10 verbatim — older context drops.
// This hook computes a 1-3 sentence summary of the EARLIER turns once
// the thread crosses 12 messages, caches it in localStorage per thread,
// and refreshes it every time 4+ new messages have accumulated since the
// last summary.
//
// The summary string is included in the chat + task spawn requests so
// every Qwen call keeps the early framing of the conversation.
//
// Cost: one Qwen call per ~4 messages on long threads. Cheap because it's
// throttled by the trigger condition + cached.

import { useEffect, useState, useRef } from 'react';
import { chatApi } from '../lib/api.js';

const STORAGE_PREFIX = '2in:thread-summary:';
// How many recent turns the server keeps verbatim (matches HISTORY_TURN_CAP).
const TURN_CAP_VERBATIM = 10;
// Below this total, no summary needed — the verbatim cap covers everything.
const SUMMARY_MIN_TOTAL = 12;
// Re-summarize when N new messages accumulate since the last summary.
const REFRESH_AFTER_NEW = 4;

function load(threadId) {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + threadId);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function save(threadId, value) {
  try { window.localStorage.setItem(STORAGE_PREFIX + threadId, JSON.stringify(value)); }
  catch { /* full / blocked */ }
}

export function clearThreadSummary(threadId) {
  try { window.localStorage.removeItem(STORAGE_PREFIX + threadId); } catch {}
}

/** messages: full thread message list in chat-format ({ role, content }).
 *  Returns the current summary string (or empty), and triggers a background
 *  re-compute when needed. */
export function useThreadSummary(threadId, messages) {
  const [summary, setSummary] = useState(() => load(threadId)?.summary ?? '');
  const inflight = useRef(false);

  // Re-load whenever the thread switches.
  useEffect(() => {
    setSummary(load(threadId)?.summary ?? '');
  }, [threadId]);

  useEffect(() => {
    if (!threadId || !Array.isArray(messages)) return;
    if (messages.length < SUMMARY_MIN_TOTAL) return;
    const cached = load(threadId);
    const asOf = cached?.asOf ?? 0;
    const newSinceCache = messages.length - asOf;
    if (newSinceCache < REFRESH_AFTER_NEW) return;
    if (inflight.current) return;
    inflight.current = true;

    // Summarize the OLDER portion only — the recent N stays verbatim in the
    // chat request anyway.
    const older = messages.slice(0, -TURN_CAP_VERBATIM);
    if (older.length < 2) {
      inflight.current = false;
      return;
    }
    chatApi
      .summarize(older)
      .then((res) => {
        const next = String(res?.summary ?? '').trim();
        if (next) {
          save(threadId, { summary: next, asOf: messages.length, ts: Date.now() });
          setSummary(next);
        }
      })
      .catch(() => { /* best-effort, retry on next message */ })
      .finally(() => { inflight.current = false; });
  }, [threadId, messages?.length]);

  return summary;
}
