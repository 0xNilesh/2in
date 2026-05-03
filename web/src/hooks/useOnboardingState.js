// Onboarding state persists across the Twitter OAuth redirect.
// We use sessionStorage so it's tab-scoped and clears on close.

import { useEffect, useState, useCallback } from 'react';
import { scopedKey } from '../lib/scoped-storage.js';

const empty = {
  step: 0,
  twinName: '',
  twitter: null, // { handle, name, userId, accessToken, avatar, bio, stats, tweets: [...] }
  questionnaire: null, // { answers, result: { seeded, idolPacks }, completed: bool }
};

function read() {
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.sessionStorage.getItem(scopedKey('onboarding'));
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch {
    return empty;
  }
}

function write(state) {
  try { window.sessionStorage.setItem(scopedKey('onboarding'), JSON.stringify(state)); } catch { /* ignore */ }
}

export function useOnboardingState() {
  const [state, setState] = useState(read);

  useEffect(() => { write(state); }, [state]);

  const update = useCallback((patch) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  const reset = useCallback(() => {
    try { window.sessionStorage.removeItem(scopedKey('onboarding')); } catch { /* ignore */ }
    setState(empty);
  }, []);

  return [state, update, reset];
}
