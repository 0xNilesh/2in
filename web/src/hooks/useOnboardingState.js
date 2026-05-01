// Onboarding state persists across the Twitter OAuth redirect.
// We use sessionStorage so it's tab-scoped and clears on close.

import { useEffect, useState, useCallback } from 'react';

const KEY = '2in:onboarding';

const empty = {
  step: 0,
  twinName: '',
  twitter: null, // { handle, name, userId, accessToken, avatar, bio, stats, tweets: [...] }
};

function read() {
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch {
    return empty;
  }
}

function write(state) {
  window.sessionStorage.setItem(KEY, JSON.stringify(state));
}

export function useOnboardingState() {
  const [state, setState] = useState(read);

  useEffect(() => { write(state); }, [state]);

  const update = useCallback((patch) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  const reset = useCallback(() => {
    window.sessionStorage.removeItem(KEY);
    setState(empty);
  }, []);

  return [state, update, reset];
}
