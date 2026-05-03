// useTwin — single source of truth for the user-named twin.
//
// Reads { name, handle, ...} from localStorage if present, else defaults.
// setTwin() writes back; cross-component sync via the 'storage' event +
// a custom 'twin:change' event for same-tab updates.

import { useEffect, useState, useCallback } from 'react';
import { defaultTwin } from '../data/twin.js';
import { getScoped, setScoped } from '../lib/scoped-storage.js';

function read() {
  if (typeof window === 'undefined') return defaultTwin;
  try {
    const raw = getScoped('twin');
    if (!raw) return defaultTwin;
    return { ...defaultTwin, ...JSON.parse(raw) };
  } catch {
    return defaultTwin;
  }
}

function write(twin) {
  setScoped('twin', JSON.stringify(twin));
  window.dispatchEvent(new CustomEvent('twin:change'));
}

export function useTwin() {
  const [twin, setTwinState] = useState(read);

  useEffect(() => {
    const handler = () => setTwinState(read());
    window.addEventListener('storage', handler);
    window.addEventListener('twin:change', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('twin:change', handler);
    };
  }, []);

  const setTwin = useCallback((next) => {
    const merged = { ...read(), ...next };
    write(merged);
    setTwinState(merged);
  }, []);

  return [twin, setTwin];
}

// Lightweight non-hook reader for places that can't take a hook.
export function readTwin() {
  return read();
}
