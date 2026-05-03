// Router map.
//   / and /onboarding render full-screen — no shell.
//   Everything else renders inside AppShell (rail + center + work pane).

import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppShell } from './layout/AppShell.jsx';
import Landing from './routes/Landing.jsx';
import Onboarding from './routes/Onboarding.jsx';
import Chat from './routes/Chat.jsx';
import Activity from './routes/Activity.jsx';
import Specialist from './routes/Specialist.jsx';
import Memory from './routes/Memory.jsx';
import Patterns from './routes/Patterns.jsx';
import Tools from './routes/Tools.jsx';
import Library from './routes/Library.jsx';
import Settings from './routes/Settings.jsx';
import NotFound from './routes/NotFound.jsx';
import { useAuth } from './hooks/useAuth.js';
import {
  getActiveAddress,
  setActiveAddress,
  hasUnscopedData,
  migrateUnscopedToActive,
} from './lib/scoped-storage.js';

/** Top-level effect that syncs `2in:active-address` with the connected
 *  Privy wallet, BEFORE any route renders. Critical for /onboarding —
 *  which is outside AppShell — so onboarding writes (mints, twin,
 *  corpus) land under the wallet's scope from the start.
 *
 *  Reload semantics:
 *   - Cold load with no prior data → just set address, no reload.
 *   - Cold load with `_unscoped:*` data (e.g. user just finished onboarding
 *     before address was known) → migrate into the wallet scope, reload
 *     once so hooks re-init from the proper keys.
 *   - Wallet switch (A → B) → set new address, reload.
 *   - Same wallet → no-op. */
function AuthScope({ children }) {
  const auth = useAuth();
  useEffect(() => {
    if (!auth.ready || !auth.authenticated || !auth.address) return;
    const last = getActiveAddress();
    const current = auth.address.toLowerCase();
    if (last === current) return;

    if (last && last !== current) {
      // eslint-disable-next-line no-console
      console.info(`[auth] wallet switched ${last} → ${current} — re-scoping localStorage`);
      setActiveAddress(current);
      window.location.reload();
      return;
    }

    // First-time set: store the address, fold any pre-auth writes into
    // the new scope, and only reload if there was data to migrate
    // (otherwise hooks already wrote to the scoped keys correctly).
    setActiveAddress(current);
    if (hasUnscopedData()) {
      migrateUnscopedToActive();
      window.location.reload();
    }
  }, [auth.ready, auth.authenticated, auth.address]);

  return children;
}

export default function App() {
  return (
    <AuthScope>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route element={<AppShell />}>
          <Route path="chat" element={<Chat />} />
          <Route path="chat/:threadId" element={<Chat />} />
          <Route path="activity" element={<Activity />} />
          <Route path="specialist/:id" element={<Specialist />} />
          <Route path="memory" element={<Memory />} />
          <Route path="memory/:sliceId" element={<Memory />} />
          <Route path="patterns" element={<Patterns />} />
          <Route path="tools" element={<Tools />} />
          <Route path="library" element={<Library />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AuthScope>
  );
}
