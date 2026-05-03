// Address-scoped localStorage helpers.
//
// Wallet A and wallet B should each have their own twin, threads, mints,
// memory cache, onboarding state, etc. — and switching between them
// should round-trip the state, not wipe it. Achieved by suffixing every
// wallet-scoped key with the lowercased address.
//
// Example:
//   getActiveAddress() → '0x778d…ce4'
//   scopedKey('twin') → '2in:0x778d…ce4:twin'
//   scopedKey('mints') → '2in:0x778d…ce4:mints'
//
// Pre-onboarding (no address yet), keys go under '2in:_unscoped:<name>'
// so we don't accidentally bleed into wallet 0x000…0 or pollute another
// user's namespace. Once Privy resolves and AppShell stores the address,
// reads/writes start landing in the proper scope.
//
// Wallet-agnostic UI prefs (rail collapsed state, banner dismissals) are
// NOT scoped — they live under their original `2in:KEY` form. See
// `WALLET_AGNOSTIC_KEYS` in AppShell.jsx.

const ACTIVE_ADDRESS_KEY = '2in:active-address';

/** Returns the lowercased address currently in use, or null if Privy
 *  hasn't resolved yet. Set by AppShell on Privy auth ready. */
export function getActiveAddress() {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(ACTIVE_ADDRESS_KEY); } catch { return null; }
}

export function setActiveAddress(addr) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(ACTIVE_ADDRESS_KEY, String(addr).toLowerCase()); }
  catch { /* ignore */ }
}

/** Build the wallet-scoped storage key for a logical name.
 *  Use this anywhere you'd otherwise hard-code `'2in:foo'`. */
export function scopedKey(name) {
  const addr = getActiveAddress();
  if (!addr) return `2in:_unscoped:${name}`;
  return `2in:${addr}:${name}`;
}

/** Convenience wrappers — drop-in replacements for localStorage.{get,set,remove}Item
 *  that auto-scope by current wallet address. */
export function getScoped(name) {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(scopedKey(name)); } catch { return null; }
}

export function setScoped(name, value) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(scopedKey(name), value); } catch { /* ignore */ }
}

export function removeScoped(name) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(scopedKey(name)); } catch { /* ignore */ }
}

const UNSCOPED_PREFIX = '2in:_unscoped:';

/** True when any pre-auth `_unscoped:*` keys are sitting in localStorage —
 *  e.g. user finished onboarding before AuthScope set the active address.
 *  We migrate those into the user's wallet scope on first sync. */
export function hasUnscopedData() {
  if (typeof window === 'undefined') return false;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(UNSCOPED_PREFIX)) return true;
    }
  } catch { /* ignore */ }
  return false;
}

/** Move every `2in:_unscoped:KEY` into `2in:<active-address>:KEY` so the
 *  user's onboarding writes (mints, twin, corpus) end up under their
 *  wallet namespace. Skips entries where the scoped key already exists. */
export function migrateUnscopedToActive() {
  if (typeof window === 'undefined') return;
  const addr = getActiveAddress();
  if (!addr) return;
  try {
    const toMove = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(UNSCOPED_PREFIX)) continue;
      toMove.push(k);
    }
    for (const oldKey of toMove) {
      const name = oldKey.slice(UNSCOPED_PREFIX.length);
      const newKey = `2in:${addr}:${name}`;
      const existing = window.localStorage.getItem(newKey);
      if (existing == null) {
        const value = window.localStorage.getItem(oldKey);
        if (value != null) window.localStorage.setItem(newKey, value);
      }
      window.localStorage.removeItem(oldKey);
    }
    // eslint-disable-next-line no-console
    if (toMove.length > 0) console.info(`[scope] migrated ${toMove.length} unscoped key(s) → 2in:${addr}:*`);
  } catch { /* ignore */ }
}
